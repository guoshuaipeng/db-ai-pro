"""
Redis 数据查看器
左侧显示 key 列表，右侧显示选中 key 的详细值
"""
import logging
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QSplitter,
    QTableWidget, QTableWidgetItem, QLabel,
    QPushButton, QHeaderView, QMessageBox, QLineEdit,
    QApplication, QMenu
)
from PyQt6.QtCore import Qt, pyqtSignal, QEvent
from PyQt6.QtGui import QFont, QKeySequence
import json
from typing import List, Dict, Optional
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


def format_ttl(ttl_value) -> str:
    """将 TTL 秒数格式化为人类可读的格式"""
    if ttl_value == "永久" or ttl_value == "-" or ttl_value == "":
        return str(ttl_value)
    
    try:
        ttl_seconds = int(ttl_value)
    except (ValueError, TypeError):
        # 如果无法转换为整数，直接返回原值
        return str(ttl_value)
    
    if ttl_seconds < 0:
        return "永久"
    
    if ttl_seconds == 0:
        return "已过期"
    
    # 计算各个时间单位
    days = ttl_seconds // 86400
    hours = (ttl_seconds % 86400) // 3600
    minutes = (ttl_seconds % 3600) // 60
    seconds = ttl_seconds % 60
    
    # 构建可读字符串（根据时间长度选择显示精度）
    parts = []
    if days > 0:
        parts.append(f"{days}天")
        if hours > 0:
            parts.append(f"{hours}小时")
        # 有天数时，不显示分钟和秒，避免过于冗长
    elif hours > 0:
        parts.append(f"{hours}小时")
        if minutes > 0:
            parts.append(f"{minutes}分钟")
        # 有小时时，不显示秒
    elif minutes > 0:
        parts.append(f"{minutes}分钟")
        if seconds > 0:
            parts.append(f"{seconds}秒")
    else:
        # 小于1分钟，只显示秒
        parts.append(f"{seconds}秒")
    
    if not parts:
        return "0秒"
    
    return " ".join(parts)


def format_size(size_str: str) -> str:
    """将大小信息格式化为人类可读的格式
    
    支持以下格式：
    - "123 bytes" -> "123 B" 或 "1.2 KB" 等
    - "1000 个字段" -> "1K 个字段"
    - "1500 个元素" -> "1.5K 个元素"
    """
    if not size_str or size_str == "-":
        return size_str
    
    # 处理 bytes 格式：提取数字并格式化
    if " bytes" in size_str.lower():
        try:
            bytes_value = int(size_str.replace(" bytes", "").replace(" Bytes", "").strip())
            return _format_bytes(bytes_value)
        except (ValueError, TypeError):
            return size_str
    
    # 处理 "个字段" 或 "个元素" 格式
    if "个字段" in size_str or "个元素" in size_str:
        try:
            # 提取数字
            if "个字段" in size_str:
                count = int(size_str.replace("个字段", "").strip())
                suffix = "个字段"
            else:
                count = int(size_str.replace("个元素", "").strip())
                suffix = "个元素"
            
            # 格式化数字
            formatted_count = _format_count(count)
            return f"{formatted_count} {suffix}"
        except (ValueError, TypeError):
            return size_str
    
    # 其他格式直接返回
    return size_str


def _format_bytes(bytes_value: int) -> str:
    """格式化字节数为人类可读格式"""
    if bytes_value < 1024:
        return f"{bytes_value} B"
    elif bytes_value < 1024 * 1024:
        kb = bytes_value / 1024
        if kb < 10:
            return f"{kb:.2f} KB"
        elif kb < 100:
            return f"{kb:.1f} KB"
        else:
            return f"{int(kb)} KB"
    elif bytes_value < 1024 * 1024 * 1024:
        mb = bytes_value / (1024 * 1024)
        if mb < 10:
            return f"{mb:.2f} MB"
        elif mb < 100:
            return f"{mb:.1f} MB"
        else:
            return f"{int(mb)} MB"
    else:
        gb = bytes_value / (1024 * 1024 * 1024)
        if gb < 10:
            return f"{gb:.2f} GB"
        elif gb < 100:
            return f"{gb:.1f} GB"
        else:
            return f"{int(gb)} GB"


def _format_count(count: int) -> str:
    """格式化数量为人类可读格式（用于字段数、元素数等）"""
    if count < 1000:
        return str(count)
    elif count < 1000000:
        k = count / 1000
        if k < 10:
            return f"{k:.2f}K"
        elif k < 100:
            return f"{k:.1f}K"
        else:
            return f"{int(k)}K"
    elif count < 1000000000:
        m = count / 1000000
        if m < 10:
            return f"{m:.2f}M"
        elif m < 100:
            return f"{m:.1f}M"
        else:
            return f"{int(m)}M"
    else:
        b = count / 1000000000
        if b < 10:
            return f"{b:.2f}B"
        elif b < 100:
            return f"{b:.1f}B"
        else:
            return f"{int(b)}B"


class RedisDataViewer(QWidget):
    """Redis 数据查看器"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.connection = None
        self.database = None
        self.redis_client = None
        self.current_keys_data = []  # 存储当前显示的所有 key 数据
        self.all_keys_data = []  # 存储所有 key 数据（用于搜索过滤）
        self.value_worker = None  # Redis value 加载工作线程
        self.search_worker = None  # Redis 搜索工作线程
        self.save_value_worker = None  # Redis 保存值工作线程
        self.delete_keys_worker = None  # Redis 删除 keys 工作线程
        self.current_loading_key = None  # 当前正在加载的 key（用于验证回调是否有效）
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        self.setLayout(layout)
        
        # 创建分割器
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # 左侧：key 列表
        left_widget = QWidget()
        left_layout = QVBoxLayout()
        left_layout.setContentsMargins(5, 5, 5, 5)
        left_widget.setLayout(left_layout)
        
        # 标题
        title_label = QLabel("Redis Keys")
        title_font = QFont()
        title_font.setBold(True)
        title_label.setFont(title_font)
        left_layout.addWidget(title_label)
        
        # 搜索框
        search_layout = QHBoxLayout()
        search_label = QLabel("搜索:")
        search_label.setStyleSheet("color: #666;")
        search_layout.addWidget(search_label)
        
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("输入 key 名称，按回车搜索（支持 * 和 ? 通配符）...")
        self.search_input.returnPressed.connect(self.on_search_triggered)
        self.search_input.setStyleSheet("""
            QLineEdit {
                padding: 5px;
                border: 1px solid #ddd;
                border-radius: 3px;
                font-size: 11px;
            }
            QLineEdit:focus {
                border: 1px solid #1976D2;
            }
        """)
        search_layout.addWidget(self.search_input)
        
        # 搜索按钮
        self.search_button = QPushButton("搜索")
        self.search_button.clicked.connect(self.on_search_triggered)
        self.search_button.setStyleSheet("""
            QPushButton {
                padding: 5px 15px;
                border: 1px solid #1976D2;
                border-radius: 3px;
                background-color: #1976D2;
                color: white;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #1565C0;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
        """)
        search_layout.addWidget(self.search_button)
        
        # 清空搜索按钮
        self.clear_search_button = QPushButton("清空")
        self.clear_search_button.clicked.connect(self.on_clear_search)
        self.clear_search_button.setStyleSheet("""
            QPushButton {
                padding: 5px 15px;
                border: 1px solid #ddd;
                border-radius: 3px;
                background-color: #f5f5f5;
                color: #666;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #e0e0e0;
            }
        """)
        search_layout.addWidget(self.clear_search_button)
        
        left_layout.addLayout(search_layout)
        
        # 搜索状态标签
        self.search_status_label = QLabel("")
        self.search_status_label.setStyleSheet("color: #666; font-size: 10px; padding: 2px;")
        self.search_status_label.hide()
        left_layout.addWidget(self.search_status_label)
        
        # Key 列表表格
        self.keys_table = QTableWidget()
        self.keys_table.setColumnCount(4)
        self.keys_table.setHorizontalHeaderLabels(["键 (Key)", "类型 (Type)", "TTL", "大小"])
        self.keys_table.setAlternatingRowColors(True)
        self.keys_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.keys_table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.keys_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        
        # 设置表头
        header = self.keys_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)  # Key 列自动拉伸
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        
        # 连接行选择信号
        self.keys_table.itemSelectionChanged.connect(self.on_key_selected)
        
        # 启用复制功能：安装事件过滤器以支持 Ctrl+C
        self.keys_table.installEventFilter(self)
        
        # 启用右键菜单
        self.keys_table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.keys_table.customContextMenuRequested.connect(self.show_context_menu)
        
        left_layout.addWidget(self.keys_table)
        
        # 右侧：value 详情
        right_widget = QWidget()
        right_layout = QVBoxLayout()
        right_layout.setContentsMargins(5, 5, 5, 5)
        right_widget.setLayout(right_layout)
        
        # 标题（支持文本选中和复制）
        self.value_title_label = QLabel("选择一个 Key 查看详细值")
        value_title_font = QFont()
        value_title_font.setBold(True)
        self.value_title_label.setFont(value_title_font)
        # 启用文本选中功能
        self.value_title_label.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse | 
            Qt.TextInteractionFlag.TextSelectableByKeyboard
        )
        # 设置样式，让选中的文本更明显
        self.value_title_label.setStyleSheet("""
            QLabel {
                padding: 5px;
                background-color: #f5f5f5;
                border-radius: 3px;
            }
        """)
        right_layout.addWidget(self.value_title_label)
        
        # 值显示区域 - 使用 JSON 编辑器
        from src.gui.widgets.multi_result_table import FoldableJSONEditor
        self.value_json_editor = FoldableJSONEditor()
        right_layout.addWidget(self.value_json_editor)
        
        # 保存按钮区域
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.save_value_btn = QPushButton("💾 保存")
        self.save_value_btn.setEnabled(False)  # 初始禁用，只有在加载了值后才启用
        self.save_value_btn.setStyleSheet("""
            QPushButton {
                padding: 5px 15px;
                border: 1px solid #4CAF50;
                border-radius: 3px;
                background-color: #4CAF50;
                color: white;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #cccccc;
                border-color: #cccccc;
                color: #666666;
            }
        """)
        self.save_value_btn.clicked.connect(self.save_current_value)
        button_layout.addWidget(self.save_value_btn)
        
        right_layout.addLayout(button_layout)
        
        # 保存当前显示的原始 value 文本和 key 信息
        self.current_value_text = ""
        self.current_key_name = ""  # 当前显示的 key 名称
        self.current_key_type = ""  # 当前显示的 key 类型
        
        # 加载提示标签（初始隐藏）
        self.loading_label = QLabel("正在加载 value...")
        loading_font = QFont()
        loading_font.setItalic(True)
        self.loading_label.setFont(loading_font)
        self.loading_label.setStyleSheet("color: #666; padding: 5px;")
        self.loading_label.hide()
        right_layout.addWidget(self.loading_label)
        
        # 添加到分割器
        splitter.addWidget(left_widget)
        splitter.addWidget(right_widget)
        splitter.setStretchFactor(0, 1)  # 左侧占 1 份
        splitter.setStretchFactor(1, 1)  # 右侧占 1 份
        
        layout.addWidget(splitter)
    
    def display_data(self, data: List[Dict], columns: List[str], connection: DatabaseConnection, database: str):
        """显示 Redis 数据"""
        self.connection = connection
        self.database = database
        self.all_keys_data = data  # 保存所有数据用于搜索
        self.current_keys_data = data  # 当前显示的数据
        
        # 清空搜索框
        self.search_input.clear()
        
        # 清空之前的数据
        self.keys_table.setRowCount(0)
        self.value_json_editor.set_json_text("")
        self.value_title_label.setText("选择一个 Key 查看详细值")
        
        # 填充表格
        self._populate_table(data)
    
    def _populate_table(self, data: List[Dict]):
        """填充表格数据（使用批量更新模式，避免UI阻塞）"""
        # 禁用更新和信号，提高性能
        self.keys_table.setUpdatesEnabled(False)
        self.keys_table.blockSignals(True)
        
        try:
            self.keys_table.setRowCount(len(data))
            for row_idx, row_data in enumerate(data):
                # 键 (Key)
                key_item = QTableWidgetItem(str(row_data.get("键 (Key)", "")))
                self.keys_table.setItem(row_idx, 0, key_item)
                
                # 类型 (Type)
                type_item = QTableWidgetItem(str(row_data.get("类型 (Type)", "")))
                self.keys_table.setItem(row_idx, 1, type_item)
                
                # TTL - 格式化为人类可读的格式
                ttl_raw = row_data.get("TTL (秒)", "")
                ttl_formatted = format_ttl(ttl_raw)
                ttl_item = QTableWidgetItem(ttl_formatted)
                # 设置工具提示显示原始秒数（如果有的话）
                if ttl_raw and ttl_raw != "永久" and ttl_raw != "-" and ttl_raw != "":
                    try:
                        ttl_seconds = int(ttl_raw)
                        if ttl_seconds >= 0:
                            ttl_item.setToolTip(f"原始值: {ttl_seconds} 秒")
                    except (ValueError, TypeError):
                        pass
                self.keys_table.setItem(row_idx, 2, ttl_item)
                
                # 大小 - 格式化为人类可读的格式
                size_raw = row_data.get("大小", "")
                size_formatted = format_size(str(size_raw))
                size_item = QTableWidgetItem(size_formatted)
                # 设置工具提示显示原始值（如果有的话）
                if size_raw and size_raw != "-" and size_raw != "":
                    size_item.setToolTip(f"原始值: {size_raw}")
                self.keys_table.setItem(row_idx, 3, size_item)
        finally:
            # 恢复更新和信号
            self.keys_table.blockSignals(False)
            self.keys_table.setUpdatesEnabled(True)
    
    def on_search_triggered(self):
        """触发 Redis 搜索"""
        if not self.connection or not self.database:
            return
        
        search_text = self.search_input.text().strip()
        
        if not search_text:
            # 如果搜索框为空，重新加载所有数据
            self.on_clear_search()
            return
        
        # 停止之前的搜索 worker
        if self.search_worker:
            try:
                old_worker = self.search_worker
                # 断开信号连接，避免回调执行
                try:
                    old_worker.data_ready.disconnect()
                    old_worker.error_occurred.disconnect()
                except:
                    pass
                
                # 停止 worker
                old_worker.stop()
                
                # 等待线程结束
                if old_worker.isRunning():
                    if not old_worker.wait(500):
                        old_worker.terminate()
                        old_worker.wait(200)
                
                # 延迟删除，确保线程完全结束
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(200, lambda: self._safe_delete_search_worker(old_worker))
            except Exception as e:
                logger.warning(f"停止之前的搜索 worker 失败: {e}")
            finally:
                self.search_worker = None
        
        # 显示搜索状态
        self.search_status_label.setText(f"正在搜索: {search_text}...")
        self.search_status_label.show()
        
        # 清空表格
        self.keys_table.setRowCount(0)
        self.value_json_editor.set_json_text("")
        self.value_title_label.setText("正在搜索...")
        
        # 创建并启动搜索 worker
        from src.gui.workers.redis_data_worker import RedisDataWorker
        
        self.search_worker = RedisDataWorker(self.connection, self.database, limit=1000, pattern=search_text)
        
        def on_search_data_ready(data, columns):
            """搜索完成回调"""
            try:
                self.search_status_label.hide()
                # 注意：搜索时只更新 current_keys_data，不覆盖 all_keys_data
                # all_keys_data 保留原始的所有数据，用于清空搜索时恢复
                self.current_keys_data = data
                self._populate_table(data)
                
                # 更新状态标签
                if data:
                    self.search_status_label.setText(f"找到 {len(data)} 个匹配的 key")
                else:
                    self.search_status_label.setText("未找到匹配的 key")
                self.search_status_label.show()
                
                # 如果有结果，选中第一行
                if data and self.keys_table.rowCount() > 0:
                    self.keys_table.clearSelection()
                    self.keys_table.selectRow(0)
                    self.on_key_selected()
                else:
                    self.value_title_label.setText("未找到匹配的 key")
                    self.value_json_editor.set_json_text("")
                    
            except Exception as e:
                logger.error(f"处理搜索结果失败: {e}", exc_info=True)
                self.search_status_label.setText(f"处理搜索结果失败: {str(e)}")
            finally:
                # 注意：不要在这里删除 worker，让 finished 信号处理最终清理
                pass
        
        def on_search_error(error_msg: str):
            """搜索错误回调"""
            try:
                self.search_status_label.setText(f"搜索失败: {error_msg}")
                self.value_title_label.setText("搜索失败")
                logger.error(f"Redis 搜索失败: {error_msg}")
            except Exception as e:
                logger.error(f"处理搜索错误失败: {e}", exc_info=True)
            finally:
                # 注意：不要在这里删除 worker，让 finished 信号处理最终清理
                pass
        
        # 定义清理函数（当线程完全结束时调用）
        def cleanup_search_worker():
            """清理搜索 worker（在线程finished信号触发时调用）"""
            try:
                if self.search_worker and self.search_worker == worker:
                    # 确保线程已经完全结束
                    if worker.isRunning():
                        logger.warning(f"Search worker 在 finished 信号触发时仍在运行，等待结束...")
                        if not worker.wait(1000):  # 等待最多1秒
                            logger.warning(f"Search worker 未能在1秒内结束，强制终止")
                            worker.terminate()
                            worker.wait(500)
                    
                    # 延迟删除，确保线程完全结束
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(200, lambda: self._safe_delete_search_worker(worker))
                    self.search_worker = None
            except RuntimeError:
                pass  # 对象已被删除，忽略
            except Exception as e:
                logger.warning(f"清理搜索 worker 时出错: {e}")
        
        worker = self.search_worker  # 保存引用用于清理函数
        
        # 连接信号
        self.search_worker.data_ready.connect(on_search_data_ready)
        self.search_worker.error_occurred.connect(on_search_error)
        # 连接finished信号，确保线程完全结束后才清理
        self.search_worker.finished.connect(cleanup_search_worker)
        
        # 启动 worker
        self.search_worker.start()
    
    def on_clear_search(self):
        """清空搜索，重新加载所有数据"""
        # 清空搜索框
        self.search_input.clear()
        self.search_status_label.hide()
        
        # 停止搜索 worker
        if self.search_worker:
            try:
                self.search_worker.stop()
                if self.search_worker.isRunning():
                    if not self.search_worker.wait(500):
                        self.search_worker.terminate()
                        self.search_worker.wait(200)
                self.search_worker.data_ready.disconnect()
                self.search_worker.error_occurred.disconnect()
                self.search_worker.deleteLater()
            except Exception as e:
                logger.warning(f"停止搜索 worker 失败: {e}")
            finally:
                self.search_worker = None
        
        # 重新从 Redis 加载所有数据（不使用 pattern）
        if not self.connection or not self.database:
            return
        
        # 显示加载状态
        self.search_status_label.setText("正在重新加载所有数据...")
        self.search_status_label.show()
        self.keys_table.setRowCount(0)
        self.value_json_editor.set_json_text("")
        self.value_title_label.setText("正在重新加载...")
        
        # 创建并启动 worker 重新加载所有数据
        from src.gui.workers.redis_data_worker import RedisDataWorker
        
        self.search_worker = RedisDataWorker(self.connection, self.database, limit=100, pattern=None)
        
        def on_reload_data_ready(data, columns):
            """重新加载完成回调"""
            try:
                self.search_status_label.hide()
                # 更新所有数据
                self.all_keys_data = data
                self.current_keys_data = data
                self._populate_table(data)
                
                # 清空 value 显示
                self.value_json_editor.set_json_text("")
                self.value_title_label.setText("选择一个 Key 查看详细值")
                
            except Exception as e:
                logger.error(f"处理重新加载数据失败: {e}", exc_info=True)
                self.search_status_label.setText(f"重新加载失败: {str(e)}")
            finally:
                # 注意：不要在这里删除 worker，让 finished 信号处理最终清理
                pass
        
        def on_reload_error(error_msg: str):
            """重新加载错误回调"""
            try:
                self.search_status_label.setText(f"重新加载失败: {error_msg}")
                self.value_title_label.setText("重新加载失败")
                logger.error(f"Redis 重新加载失败: {error_msg}")
            except Exception as e:
                logger.error(f"处理重新加载错误失败: {e}", exc_info=True)
            finally:
                # 注意：不要在这里删除 worker，让 finished 信号处理最终清理
                pass
        
        # 定义清理函数（当线程完全结束时调用）
        def cleanup_reload_worker():
            """清理重新加载 worker（在线程finished信号触发时调用）"""
            try:
                if self.search_worker and self.search_worker == reload_worker:
                    # 确保线程已经完全结束
                    if reload_worker.isRunning():
                        logger.warning(f"Reload worker 在 finished 信号触发时仍在运行，等待结束...")
                        if not reload_worker.wait(1000):  # 等待最多1秒
                            logger.warning(f"Reload worker 未能在1秒内结束，强制终止")
                            reload_worker.terminate()
                            reload_worker.wait(500)
                    
                    # 延迟删除，确保线程完全结束
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(200, lambda: self._safe_delete_search_worker(reload_worker))
                    self.search_worker = None
            except RuntimeError:
                pass  # 对象已被删除，忽略
            except Exception as e:
                logger.warning(f"清理重新加载 worker 时出错: {e}")
        
        reload_worker = self.search_worker  # 保存引用用于清理函数
        
        # 连接信号
        self.search_worker.data_ready.connect(on_reload_data_ready)
        self.search_worker.error_occurred.connect(on_reload_error)
        # 连接finished信号，确保线程完全结束后才清理
        self.search_worker.finished.connect(cleanup_reload_worker)
        
        # 启动 worker
        self.search_worker.start()
    
    def on_key_selected(self):
        """当选中一个 key 时"""
        selected_rows = self.keys_table.selectedItems()
        if not selected_rows:
            return
        
        # 获取选中的行
        row = self.keys_table.currentRow()
        if row < 0 or row >= len(self.current_keys_data):
            return
        
        key_data = self.current_keys_data[row]
        key_name = key_data.get("键 (Key)", "")
        key_type = key_data.get("类型 (Type)", "")
        
        # 更新标题
        self.value_title_label.setText(f"Key: {key_name} (类型: {key_type})")
        
        # 保存当前 key 信息
        self.current_key_name = key_name
        self.current_key_type = key_type
        
        # 查询并显示值
        self.load_key_value(key_name, key_type)
    
    def load_key_value(self, key: str, key_type: str):
        """异步加载并显示 key 的值（使用工作线程避免阻塞 UI）"""
        # 设置当前正在加载的 key（用于验证回调是否有效）
        self.current_loading_key = key
        
        # 停止之前的 worker（如果存在）
        if self.value_worker:
            try:
                # 断开信号连接，避免回调执行
                try:
                    self.value_worker.value_ready.disconnect()
                    self.value_worker.error_occurred.disconnect()
                except (RuntimeError, TypeError):
                    pass  # 信号可能已经断开或对象已删除
                
                # 停止 worker
                self.value_worker.stop()
                
                # 等待线程结束
                if self.value_worker.isRunning():
                    if not self.value_worker.wait(1000):  # 等待最多1秒
                        logger.warning(f"value worker 未能在1秒内结束，强制终止")
                        self.value_worker.terminate()
                        self.value_worker.wait(500)
                
                # 延迟删除，确保线程完全结束
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(200, lambda: self._safe_delete_worker(self.value_worker))
            except (RuntimeError, AttributeError) as e:
                # 对象已被删除，忽略
                logger.debug(f"停止之前的 value worker 时对象已删除: {e}")
            except Exception as e:
                logger.warning(f"停止之前的 value worker 失败: {e}")
            finally:
                self.value_worker = None
        
        # 显示加载提示
        self.value_json_editor.set_json_text(f"正在加载 key: {key}...")
        self.loading_label.show()
        self.loading_label.setText(f"正在加载 key: {key}...")
        
        # 创建并启动 worker
        from src.gui.workers.redis_value_worker import RedisValueWorker
        
        self.value_worker = RedisValueWorker(self.connection, self.database, key, key_type)
        
        def on_value_ready(value_text: str, is_truncated: bool, original_size: int):
            """value 加载完成回调"""
            # 检查是否是当前请求的 key（防止显示过期的数据）
            if self.current_loading_key != key:
                logger.debug(f"忽略过期的 value 回调: 当前 key={self.current_loading_key}, 回调 key={key}")
                return
            
            try:
                self.loading_label.hide()
                
                # 如果有截断，在标题中显示提示
                if is_truncated:
                    size_info = ""
                    if original_size > 0:
                        # 格式化大小
                        if original_size < 1024:
                            size_str = f"{original_size} B"
                        elif original_size < 1024 * 1024:
                            size_str = f"{original_size / 1024:.2f} KB"
                        elif original_size < 1024 * 1024 * 1024:
                            size_str = f"{original_size / (1024 * 1024):.2f} MB"
                        else:
                            size_str = f"{original_size / (1024 * 1024 * 1024):.2f} GB"
                        size_info = f" (原始大小: {size_str})"
                    self.value_title_label.setText(
                        f"Key: {key} (类型: {key_type}){size_info} [已截断显示]"
                    )
                else:
                    self.value_title_label.setText(f"Key: {key} (类型: {key_type})")
                
                # 保存原始文本
                self.current_value_text = value_text
                
                # 处理并显示 value（尝试格式化为 JSON）
                display_text = self._format_value_for_json(value_text)
                self.value_json_editor.set_json_text(display_text)
                
                # 保存当前 key 信息
                self.current_key_name = key
                self.current_key_type = key_type
                
                # 启用编辑和保存按钮（仅对 string 类型）
                if key_type == 'string':
                    self._enable_value_editing(True)
                else:
                    self._enable_value_editing(False)
                
            except Exception as e:
                logger.error(f"显示 value 失败: {e}", exc_info=True)
                error_text = f"<错误>\n显示 value 失败: {str(e)}"
                self.value_json_editor.set_json_text(error_text)
                self.current_value_text = ""
            finally:
                # 清理 worker（延迟删除，确保线程完全结束）
                if self.value_worker and self.current_loading_key == key:
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(200, lambda: self._safe_delete_worker(self.value_worker))
                    self.value_worker = None
        
        def on_error(error_msg: str):
            """加载错误回调"""
            # 检查是否是当前请求的 key（防止显示过期的错误）
            if self.current_loading_key != key:
                logger.debug(f"忽略过期的 error 回调: 当前 key={self.current_loading_key}, 回调 key={key}")
                return
            
            try:
                self.loading_label.hide()
                error_text = f"<错误>\n{error_msg}"
                self.value_json_editor.set_json_text(error_text)
                self.current_value_text = ""
                logger.error(f"加载 Redis key 值失败: {error_msg}")
            except Exception as e:
                logger.error(f"处理错误回调失败: {e}", exc_info=True)
            finally:
                # 清理 worker（延迟删除，确保线程完全结束）
                if self.value_worker and self.current_loading_key == key:
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(200, lambda: self._safe_delete_worker(self.value_worker))
                    self.value_worker = None
        
        # 连接信号
        self.value_worker.value_ready.connect(on_value_ready)
        self.value_worker.error_occurred.connect(on_error)
        
        # 启动 worker
        self.value_worker.start()
    
    def closeEvent(self, event):
        """关闭事件"""
        # 停止搜索 worker
        if self.search_worker:
            try:
                self.search_worker.stop()
                if self.search_worker.isRunning():
                    if not self.search_worker.wait(500):
                        self.search_worker.terminate()
                        self.search_worker.wait(200)
                self.search_worker.data_ready.disconnect()
                self.search_worker.error_occurred.disconnect()
                self.search_worker.deleteLater()
            except Exception as e:
                logger.warning(f"停止搜索 worker 失败: {e}")
            finally:
                self.search_worker = None
        
        # 停止 value worker
        if self.value_worker:
            try:
                # 断开信号连接
                try:
                    self.value_worker.value_ready.disconnect()
                    self.value_worker.error_occurred.disconnect()
                except (RuntimeError, TypeError):
                    pass
                
                # 停止 worker
                self.value_worker.stop()
                
                # 等待线程结束
                if self.value_worker.isRunning():
                    if not self.value_worker.wait(1000):
                        self.value_worker.terminate()
                        self.value_worker.wait(500)
                
                # 延迟删除，确保线程完全结束
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(200, lambda: self._safe_delete_worker(self.value_worker))
            except (RuntimeError, AttributeError) as e:
                logger.debug(f"停止 value worker 时对象已删除: {e}")
            except Exception as e:
                logger.warning(f"停止 value worker 失败: {e}")
            finally:
                self.value_worker = None
                self.current_loading_key = None
        
        # 停止 save value worker
        if self.save_value_worker:
            try:
                if self.save_value_worker.isRunning():
                    self.save_value_worker.stop()
                    if not self.save_value_worker.wait(500):
                        self.save_value_worker.terminate()
                        self.save_value_worker.wait(200)
                    try:
                        self.save_value_worker.save_success.disconnect()
                        self.save_value_worker.save_error.disconnect()
                    except:
                        pass
                    self.save_value_worker.deleteLater()
            except Exception as e:
                logger.warning(f"停止 save value worker 失败: {e}")
            finally:
                self.save_value_worker = None
        
        # 停止 delete keys worker
        if self.delete_keys_worker:
            try:
                if self.delete_keys_worker.isRunning():
                    self.delete_keys_worker.stop()
                    if not self.delete_keys_worker.wait(500):
                        self.delete_keys_worker.terminate()
                        self.delete_keys_worker.wait(200)
                    try:
                        self.delete_keys_worker.delete_success.disconnect()
                        self.delete_keys_worker.delete_error.disconnect()
                    except:
                        pass
                    self.delete_keys_worker.deleteLater()
            except Exception as e:
                logger.warning(f"停止 delete keys worker 失败: {e}")
            finally:
                self.delete_keys_worker = None
        
        # 关闭 Redis 客户端
        if self.redis_client:
            try:
                self.redis_client.close()
            except Exception as e:
                logger.warning(f"关闭 Redis 连接失败: {e}")
            finally:
                self.redis_client = None
        
        super().closeEvent(event)
    
    def eventFilter(self, obj, event):
        """事件过滤器，处理 Ctrl+C 复制"""
        if obj == self.keys_table and event.type() == QEvent.Type.KeyPress:
            if event.matches(QKeySequence.StandardKey.Copy):
                self.copy_selected_cells()
                return True
        return super().eventFilter(obj, event)
    
    def copy_selected_cells(self):
        """复制选中的单元格内容到剪贴板"""
        selected_items = self.keys_table.selectedItems()
        if not selected_items:
            return
        
        # 获取选中的行和列范围
        selected_rows = sorted(set(item.row() for item in selected_items))
        selected_cols = sorted(set(item.column() for item in selected_items))
        
        if not selected_rows or not selected_cols:
            return
        
        # 构建复制内容（TSV格式，兼容Excel）
        copied_text = []
        for row in selected_rows:
            row_data = []
            for col in selected_cols:
                item = self.keys_table.item(row, col)
                if item:
                    row_data.append(item.text())
                else:
                    row_data.append("")
            copied_text.append("\t".join(row_data))
        
        # 复制到剪贴板
        clipboard = QApplication.clipboard()
        clipboard.setText("\n".join(copied_text))
        
        # 显示提示（使用简单的状态更新）
        cell_count = len(selected_items)
        row_count = len(selected_rows)
        col_count = len(selected_cols)
        logger.info(f"已复制 {row_count} 行 × {col_count} 列 ({cell_count} 个单元格)")
    
    def copy_selected_keys_only(self):
        """仅复制选中的 Key（第一列）"""
        selected_items = self.keys_table.selectedItems()
        if not selected_items:
            return
        
        # 获取选中的行（去重）
        selected_rows = sorted(set(item.row() for item in selected_items))
        
        if not selected_rows:
            return
        
        # 只复制第一列（Key列）的内容
        keys = []
        for row in selected_rows:
            key_item = self.keys_table.item(row, 0)  # 第一列是 Key
            if key_item:
                keys.append(key_item.text())
        
        if not keys:
            return
        
        # 复制到剪贴板（每行一个 key）
        clipboard = QApplication.clipboard()
        clipboard.setText("\n".join(keys))
        
        # 显示提示
        logger.info(f"已复制 {len(keys)} 个 Key")
    
    def show_context_menu(self, position):
        """显示右键菜单"""
        selected_items = self.keys_table.selectedItems()
        
        # 创建右键菜单
        menu = QMenu(self)
        
        # 如果有选中的单元格，添加复制选项
        if selected_items:
            copy_action = menu.addAction("📋 复制选中内容 (Ctrl+C)")
            copy_action.triggered.connect(self.copy_selected_cells)
            
            # 添加仅复制 Key 的选项
            copy_keys_action = menu.addAction("🔑 仅复制 Key")
            copy_keys_action.triggered.connect(self.copy_selected_keys_only)
            
            # 添加删除 Key 的选项
            menu.addSeparator()
            delete_action = menu.addAction("🗑️ 删除 Key")
            delete_action.triggered.connect(self.delete_selected_keys)
        
        # 显示菜单（如果有选项）
        if not menu.isEmpty():
            menu.exec(self.keys_table.mapToGlobal(position))
    
    def _safe_delete_worker(self, worker):
        """安全删除 worker（确保线程已完全结束）"""
        if not worker:
            return
        try:
            if not worker.isRunning():
                worker.deleteLater()
        except (RuntimeError, AttributeError):
            # 对象已被删除，忽略
            pass
    
    def _safe_delete_search_worker(self, worker):
        """安全删除搜索 worker（确保线程已完全结束）"""
        if not worker:
            return
        try:
            # 检查线程是否还在运行
            if worker.isRunning():
                logger.warning(f"尝试删除仍在运行的 search worker")
                return  # 如果还在运行，不删除
            
            # 断开所有信号连接
            try:
                worker.data_ready.disconnect()
                worker.error_occurred.disconnect()
                worker.finished.disconnect()
            except (RuntimeError, TypeError):
                pass
            
            # 删除 worker
            worker.deleteLater()
        except (RuntimeError, AttributeError):
            pass  # 对象已被删除，忽略
        except Exception as e:
            logger.warning(f"安全删除 search worker 时出错: {e}")
    
    def _enable_value_editing(self, enabled: bool):
        """启用或禁用值编辑功能"""
        # 获取编辑器内部对象
        if hasattr(self.value_json_editor, '_editor'):
            editor = self.value_json_editor._editor
            if hasattr(editor, 'setReadOnly'):
                editor.setReadOnly(not enabled)
        
        # 启用或禁用保存按钮
        self.save_value_btn.setEnabled(enabled)
    
    def save_current_value(self):
        """保存当前编辑的值"""
        if not self.current_key_name or not self.current_key_type:
            QMessageBox.warning(self, "警告", "没有选中的 Key")
            return
        
        # 只支持 string 类型
        if self.current_key_type != 'string':
            QMessageBox.warning(self, "警告", f"当前 Key 类型为 {self.current_key_type}，只支持编辑 string 类型的值")
            return
        
        # 获取编辑后的文本
        if hasattr(self.value_json_editor, '_editor'):
            editor = self.value_json_editor._editor
            if hasattr(editor, 'text'):
                edited_text = editor.text()
            elif hasattr(editor, 'toPlainText'):
                edited_text = editor.toPlainText()
            else:
                QMessageBox.warning(self, "错误", "无法获取编辑后的文本")
                return
        else:
            QMessageBox.warning(self, "错误", "无法访问编辑器")
            return
        
        # 确认保存
        reply = QMessageBox.question(
            self, 
            "确认保存", 
            f"确定要保存 Key '{self.current_key_name}' 的值吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # 使用 worker 线程保存值
        from src.gui.workers.redis_save_value_worker import RedisSaveValueWorker
        
        self.save_value_worker = RedisSaveValueWorker(
            self.connection, 
            self.database, 
            self.current_key_name, 
            edited_text
        )
        
        def on_save_success():
            QMessageBox.information(self, "成功", f"Key '{self.current_key_name}' 的值已保存")
            # 重新加载值以显示最新内容
            self.load_key_value(self.current_key_name, self.current_key_type)
            # 刷新 key 列表
            self._refresh_keys_list()
        
        def on_save_error(error_msg: str):
            QMessageBox.warning(self, "保存失败", f"保存失败: {error_msg}")
            self.save_value_btn.setEnabled(True)  # 恢复按钮状态
        
        self.save_value_worker.save_success.connect(on_save_success)
        self.save_value_worker.save_error.connect(on_save_error)
        
        self.save_value_btn.setEnabled(False)  # 保存时禁用按钮
        self.save_value_worker.start()
    
    def delete_selected_keys(self):
        """删除选中的 Key"""
        selected_items = self.keys_table.selectedItems()
        if not selected_items:
            return
        
        # 获取选中的行（去重）
        selected_rows = sorted(set(item.row() for item in selected_items))
        
        if not selected_rows:
            return
        
        # 获取要删除的 keys
        keys_to_delete = []
        for row in selected_rows:
            key_item = self.keys_table.item(row, 0)  # 第一列是 Key
            if key_item:
                keys_to_delete.append(key_item.text())
        
        if not keys_to_delete:
            return
        
        # 确认删除
        keys_text = "\n".join(keys_to_delete[:10])  # 最多显示10个
        if len(keys_to_delete) > 10:
            keys_text += f"\n... 还有 {len(keys_to_delete) - 10} 个 Key"
        
        reply = QMessageBox.question(
            self, 
            "确认删除", 
            f"确定要删除以下 {len(keys_to_delete)} 个 Key 吗？\n\n{keys_text}\n\n此操作不可恢复！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # 使用 worker 线程删除 keys
        from src.gui.workers.redis_delete_keys_worker import RedisDeleteKeysWorker
        
        self.delete_keys_worker = RedisDeleteKeysWorker(
            self.connection, 
            self.database, 
            keys_to_delete
        )
        
        def on_delete_success(deleted_count: int):
            QMessageBox.information(self, "成功", f"已删除 {deleted_count} 个 Key")
            # 刷新 key 列表
            self._refresh_keys_list()
            # 清空 value 显示区域
            self.value_json_editor.set_json_text("")
            self.value_title_label.setText("选择一个 Key 查看详细值")
            self.current_key_name = ""
            self.current_key_type = ""
            self._enable_value_editing(False)
        
        def on_delete_error(error_msg: str):
            QMessageBox.warning(self, "删除失败", f"删除失败: {error_msg}")
        
        self.delete_keys_worker.delete_success.connect(on_delete_success)
        self.delete_keys_worker.delete_error.connect(on_delete_error)
        
        self.delete_keys_worker.start()
    
    def _refresh_keys_list(self):
        """刷新 key 列表"""
        if not self.connection or not self.database:
            return
        
        # 停止之前的搜索 worker（如果存在）
        if self.search_worker:
            try:
                old_worker = self.search_worker
                # 断开信号连接，避免回调执行
                try:
                    old_worker.data_ready.disconnect()
                    old_worker.error_occurred.disconnect()
                except:
                    pass
                
                # 停止 worker
                old_worker.stop()
                
                # 等待线程结束
                if old_worker.isRunning():
                    if not old_worker.wait(500):
                        old_worker.terminate()
                        old_worker.wait(200)
                
                # 延迟删除，确保线程完全结束
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(200, lambda: self._safe_delete_search_worker(old_worker))
            except Exception as e:
                logger.warning(f"停止刷新 worker 失败: {e}")
            finally:
                self.search_worker = None
        
        # 触发重新搜索（使用当前搜索条件，如果没有则搜索所有）
        search_text = self.search_input.text().strip()
        if not search_text:
            # 如果没有搜索条件，重新加载所有数据
            from src.gui.workers.redis_data_worker import RedisDataWorker
            self.search_worker = RedisDataWorker(self.connection, self.database, limit=100)
            
            def on_data_ready(data, columns):
                self.all_keys_data = data
                self.current_keys_data = data
                self._populate_table(data)
                self.search_status_label.hide()
            
            def on_error(error_msg: str):
                QMessageBox.warning(self, "错误", f"刷新失败: {error_msg}")
            
            # 定义清理函数（当线程完全结束时调用）
            def cleanup_refresh_worker():
                """清理刷新 worker（在线程finished信号触发时调用）"""
                try:
                    if self.search_worker and self.search_worker == refresh_worker:
                        # 确保线程已经完全结束
                        if refresh_worker.isRunning():
                            logger.warning(f"Refresh worker 在 finished 信号触发时仍在运行，等待结束...")
                            if not refresh_worker.wait(1000):  # 等待最多1秒
                                logger.warning(f"Refresh worker 未能在1秒内结束，强制终止")
                                refresh_worker.terminate()
                                refresh_worker.wait(500)
                        
                        # 延迟删除，确保线程完全结束
                        from PyQt6.QtCore import QTimer
                        QTimer.singleShot(200, lambda: self._safe_delete_search_worker(refresh_worker))
                        self.search_worker = None
                except RuntimeError:
                    pass  # 对象已被删除，忽略
                except Exception as e:
                    logger.warning(f"清理刷新 worker 时出错: {e}")
            
            refresh_worker = self.search_worker  # 保存引用用于清理函数
            
            self.search_worker.data_ready.connect(on_data_ready)
            self.search_worker.error_occurred.connect(on_error)
            # 连接finished信号，确保线程完全结束后才清理
            self.search_worker.finished.connect(cleanup_refresh_worker)
            self.search_worker.start()
        else:
            # 如果有搜索条件，重新执行搜索
            self.on_search_triggered()
    
    def _format_value_for_json(self, value_text: str) -> str:
        """格式化 value 文本为 JSON 格式显示"""
        if not value_text or value_text.strip() == "":
            return ""
        
        # 移除截断提示和统计信息
        clean_text = value_text
        
        # 移除截断提示行和统计信息
        if "[值太大" in clean_text or "[已截断" in clean_text or "共 " in clean_text:
            lines = clean_text.split('\n')
            json_lines = []
            for line in lines:
                # 跳过截断提示和统计信息行
                if any(keyword in line for keyword in ["[值太大", "[已截断", "共 ", "个字段", "个元素"]):
                    continue
                json_lines.append(line)
            clean_text = '\n'.join(json_lines).strip()
        
        # 尝试解析并格式化 JSON
        try:
            json_data = json.loads(clean_text)
            # 格式化 JSON
            return json.dumps(json_data, ensure_ascii=False, indent=2)
        except (json.JSONDecodeError, ValueError):
            # 如果不是有效的 JSON，直接显示原始文本
            return clean_text