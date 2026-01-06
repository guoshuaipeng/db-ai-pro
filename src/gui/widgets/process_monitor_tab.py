"""
进程监控Tab - 显示数据库进程列表
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QTableWidget,
    QTableWidgetItem,
    QPushButton,
    QLabel,
    QHeaderView,
    QDialog,
    QTextEdit,
    QDialogButtonBox,
    QFileDialog,
    QMessageBox,
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QColor, QIcon, QFont
from typing import List, Dict, Optional
import logging
from datetime import datetime, date, time as dt_time
from decimal import Decimal

logger = logging.getLogger(__name__)


class ProcessMonitorTab(QWidget):
    """进程监控Tab"""
    
    def __init__(self, main_window=None, connection_id: str = None, database: str = None):
        super().__init__()
        self.main_window = main_window
        self.connection_id = connection_id
        self.database = database
        self.process_list_worker = None
        self.health_worker = None
        self.ai_diagnosis_worker = None
        self.refresh_timer = None
        self._is_closing = False
        self.current_processes = []  # 保存当前进程列表，用于AI诊断
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)
        self.setLayout(layout)
        
        # 工具栏
        toolbar_layout = QHBoxLayout()
        
        # 刷新按钮
        self.refresh_btn = QPushButton("刷新")
        self.refresh_btn.clicked.connect(self.refresh_process_list)
        toolbar_layout.addWidget(self.refresh_btn)
        
        # AI诊断按钮
        self.diagnosis_btn = QPushButton("AI诊断")
        self.diagnosis_btn.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                font-weight: bold;
                padding: 5px 15px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:disabled {
                background-color: #cccccc;
                color: #666666;
            }
        """)
        self.diagnosis_btn.clicked.connect(self.start_ai_diagnosis)
        toolbar_layout.addWidget(self.diagnosis_btn)
        
        # 自动刷新选项
        self.auto_refresh_checkbox = None
        from PyQt6.QtWidgets import QCheckBox
        self.auto_refresh_checkbox = QCheckBox("自动刷新 (5秒)")
        self.auto_refresh_checkbox.toggled.connect(self.on_auto_refresh_toggled)
        toolbar_layout.addWidget(self.auto_refresh_checkbox)
        
        toolbar_layout.addStretch()
        
        # 状态标签
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        toolbar_layout.addWidget(self.status_label)
        
        layout.addLayout(toolbar_layout)
        
        # 进程列表表格
        self.table = QTableWidget()
        self.table.setColumnCount(8)
        self.table.setHorizontalHeaderLabels([
            "Server", "Id", "User", "Host", "db", "Command", "Time", "Info/State"
        ])
        
        # 设置表格属性
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QTableWidget.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        
        # 设置列宽
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(7, QHeaderView.ResizeMode.Stretch)
        
        layout.addWidget(self.table)
        
        # 加载进程列表
        self.refresh_process_list()
    
    def refresh_process_list(self):
        """刷新进程列表"""
        if not self.main_window or not self.connection_id:
            self.status_label.setText("错误: 缺少连接信息")
            return
        
        # 停止之前的worker
        if self.process_list_worker:
            try:
                if self.process_list_worker.isRunning():
                    self.process_list_worker.stop()
                    self.process_list_worker.wait(500)
                self.process_list_worker.deleteLater()
            except:
                pass
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(self.connection_id)
        if not connection:
            self.status_label.setText("错误: 连接不存在")
            return
        
        # 创建worker
        from src.gui.workers.process_list_worker import ProcessListWorker
        
        # 根据数据库类型，修改连接字符串
        connection_string = connection.get_connection_string()
        from src.core.database_connection import DatabaseType
        
        # 如果要查询所有数据库，移除连接字符串中的数据库部分
        if not self.database and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB, DatabaseType.POSTGRESQL):
            import re
            # 移除数据库名，保留端口和查询参数
            # 格式: mysql://user:pass@host:port/database?params
            # 改为: mysql://user:pass@host:port/?params
            connection_string = re.sub(r'/[^/]+(\?|$)', r'/\1', connection_string)
            if not connection_string.endswith('/') and '?' not in connection_string:
                # 如果没有查询参数，确保以 / 结尾
                connection_string = re.sub(r'(:[0-9]+)(\?|$)', r'\1/\2', connection_string)
                if not connection_string.endswith('/'):
                    connection_string += '/'
        elif self.database and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            import re
            # 替换为指定的数据库名
            connection_string = re.sub(r'/([^/]+)(\?|$)', f'/{self.database}\\2', connection_string)
        
        worker = ProcessListWorker(
            connection_string,
            connection.get_connect_args(),
            connection.db_type,
            self.database  # 传递数据库参数，如果为None则查询所有数据库
        )
        
        # 定义清理函数
        def cleanup_worker():
            """清理worker"""
            try:
                if self.process_list_worker == worker:
                    self.process_list_worker = None
                worker.deleteLater()
            except RuntimeError:
                pass
        
        # 连接信号
        worker.process_list_ready.connect(self.on_process_list_ready)
        worker.error_occurred.connect(self.on_error)
        worker.finished.connect(cleanup_worker)
        
        # 保存worker引用
        self.process_list_worker = worker
        
        # 启动worker
        self.status_label.setText("正在获取进程列表...")
        self.refresh_btn.setEnabled(False)
        worker.start()
    
    def on_process_list_ready(self, processes: List[Dict]):
        """进程列表加载完成回调"""
        if self._is_closing:
            return
        
        try:
            # 清空表格
            self.table.setRowCount(0)
            
            if not processes:
                self.status_label.setText("没有进程")
                self.refresh_btn.setEnabled(True)
                return
            
            # 禁用更新和信号，提高性能（批量更新模式）
            self.table.setUpdatesEnabled(False)
            self.table.blockSignals(True)
            
            try:
                # 填充数据
                self.table.setRowCount(len(processes))
                
                # 获取连接信息（用于显示Server列）
                connection = None
                if self.main_window:
                    connection = self.main_window.db_manager.get_connection(self.connection_id)
                server_name = connection.host if connection else "Unknown"
                
                for row_idx, process in enumerate(processes):
                    # Server列（显示连接的主机地址）
                    self.table.setItem(row_idx, 0, QTableWidgetItem(str(server_name)))
                    
                    # Id列
                    process_id = process.get('Id') or process.get('id') or process.get('PID')
                    self.table.setItem(row_idx, 1, QTableWidgetItem(str(process_id) if process_id is not None else ''))
                    
                    # User列
                    user = process.get('User') or process.get('user') or process.get('usename')
                    self.table.setItem(row_idx, 2, QTableWidgetItem(str(user) if user else ''))
                    
                    # Host列
                    host = process.get('Host') or process.get('host')
                    self.table.setItem(row_idx, 3, QTableWidgetItem(str(host) if host else ''))
                    
                    # db列
                    db = process.get('db') or process.get('database') or process.get('datname')
                    db_str = str(db) if db else '(Null)'
                    self.table.setItem(row_idx, 4, QTableWidgetItem(db_str))
                    if not db:
                        # NULL值显示为灰色
                        item = self.table.item(row_idx, 4)
                        if item:
                            item.setForeground(QColor(128, 128, 128))
                    
                    # Command列
                    command = process.get('Command') or process.get('command') or ''
                    self.table.setItem(row_idx, 5, QTableWidgetItem(str(command) if command else ''))
                    
                    # Time列
                    time_val = process.get('Time') or process.get('time')
                    time_str = str(time_val) if time_val is not None else '0'
                    self.table.setItem(row_idx, 6, QTableWidgetItem(time_str))
                    
                    # 根据Time值设置颜色
                    try:
                        time_int = int(time_val or 0)
                        if time_int > 100:
                            item = self.table.item(row_idx, 6)
                            if item:
                                item.setForeground(QColor(255, 0, 0))  # 红色
                        elif time_int > 50:
                            item = self.table.item(row_idx, 6)
                            if item:
                                item.setForeground(QColor(255, 165, 0))  # 橙色
                    except:
                        pass
                    
                    # State列 - 显示SQL语句（Info），如果为空则显示State
                    info = process.get('Info') or process.get('info') or ''
                    state = process.get('State') or process.get('state') or ''
                    # 优先显示SQL语句，如果没有则显示State
                    state_str = str(info) if info else (str(state) if state else '')
                    # 限制显示长度，避免过长
                    if len(state_str) > 200:
                        state_str = state_str[:200] + '...'
                    self.table.setItem(row_idx, 7, QTableWidgetItem(state_str))
            finally:
                # 恢复更新和信号
                self.table.blockSignals(False)
                self.table.setUpdatesEnabled(True)
            
            self.status_label.setText(f"共 {len(processes)} 个进程")
            
            # 保存进程列表用于AI诊断
            self.current_processes = processes
            
        except Exception as e:
            logger.error(f"显示进程列表失败: {e}", exc_info=True)
            self.status_label.setText(f"显示失败: {str(e)}")
        finally:
            self.refresh_btn.setEnabled(True)
    
    def on_error(self, error: str):
        """错误回调"""
        if self._is_closing:
            return
        
        self.status_label.setText(f"错误: {error}")
        self.refresh_btn.setEnabled(True)
    
    def on_auto_refresh_toggled(self, checked: bool):
        """自动刷新开关切换"""
        if checked:
            # 启动定时器，每5秒刷新一次
            if not self.refresh_timer:
                self.refresh_timer = QTimer()
                self.refresh_timer.timeout.connect(self.refresh_process_list)
            self.refresh_timer.start(5000)  # 5秒
        else:
            # 停止定时器
            if self.refresh_timer:
                self.refresh_timer.stop()
    
    def start_ai_diagnosis(self):
        """启动AI诊断"""
        if not self.main_window or not self.connection_id:
            QMessageBox.warning(self, "错误", "缺少连接信息")
            return
        
        if not self.current_processes:
            QMessageBox.warning(self, "提示", "请先刷新进程列表")
            return
        
        # 禁用诊断按钮
        self.diagnosis_btn.setEnabled(False)
        self.diagnosis_btn.setText("诊断中...")
        self.status_label.setText("正在获取数据库健康状态...")
        
        # 先获取健康数据，然后进行AI诊断
        self._get_health_data()
    
    def _get_health_data(self):
        """获取数据库健康数据"""
        connection = self.main_window.db_manager.get_connection(self.connection_id)
        if not connection:
            self.status_label.setText("错误: 连接不存在")
            self.diagnosis_btn.setEnabled(True)
            self.diagnosis_btn.setText("AI诊断")
            return
        
        # 停止之前的worker
        if self.health_worker:
            try:
                if self.health_worker.isRunning():
                    self.health_worker.stop()
                    self.health_worker.wait(500)
                self.health_worker.deleteLater()
            except:
                pass
        
        # 创建健康检查worker
        from src.gui.workers.database_health_worker import DatabaseHealthWorker
        
        connection_string = connection.get_connection_string()
        from src.core.database_connection import DatabaseType
        if self.database and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            import re
            connection_string = re.sub(r'/([^/]+)(\?|$)', f'/{self.database}\\2', connection_string)
        
        worker = DatabaseHealthWorker(
            connection_string,
            connection.get_connect_args(),
            connection.db_type,
            self.database
        )
        
        def cleanup_worker():
            try:
                if self.health_worker == worker:
                    self.health_worker = None
                worker.deleteLater()
            except RuntimeError:
                pass
        
        worker.health_data_ready.connect(self.on_health_data_ready)
        worker.error_occurred.connect(self.on_health_error)
        worker.finished.connect(cleanup_worker)
        
        self.health_worker = worker
        worker.start()
    
    def on_health_data_ready(self, health_data: Dict):
        """健康数据获取完成，开始AI诊断"""
        if self._is_closing:
            return
        
        self.status_label.setText("正在进行AI分析...")
        
        # 获取AI客户端
        try:
            from src.core.ai_client import AIClient
            from src.core.ai_model_storage import AIModelStorage
            
            storage = AIModelStorage()
            default_model = storage.get_default_model()
            if not default_model:
                QMessageBox.warning(self, "错误", "未配置AI模型，请在菜单中配置AI模型")
                self.diagnosis_btn.setEnabled(True)
                self.diagnosis_btn.setText("AI诊断")
                return
            
            ai_client = AIClient(
                api_key=default_model.api_key.get_secret_value(),
                base_url=default_model.get_base_url(),
                default_model=default_model.default_model,
                turbo_model=default_model.turbo_model
            )
            
            # 获取数据库类型
            connection = self.main_window.db_manager.get_connection(self.connection_id)
            db_type = connection.db_type.value if connection else "mysql"
            
            # 创建AI诊断worker
            from src.gui.workers.ai_diagnosis_worker import AIDiagnosisWorker
            
            worker = AIDiagnosisWorker(
                ai_client,
                self.current_processes,
                health_data,
                db_type,
                self.database
            )
            
            def cleanup_worker():
                try:
                    if self.ai_diagnosis_worker == worker:
                        self.ai_diagnosis_worker = None
                    worker.deleteLater()
                except RuntimeError:
                    pass
            
            worker.diagnosis_ready.connect(self.on_diagnosis_ready)
            worker.error_occurred.connect(self.on_diagnosis_error)
            worker.finished.connect(cleanup_worker)
            
            self.ai_diagnosis_worker = worker
            worker.start()
            
        except Exception as e:
            logger.error(f"启动AI诊断失败: {e}", exc_info=True)
            QMessageBox.warning(self, "错误", f"启动AI诊断失败: {str(e)}")
            self.diagnosis_btn.setEnabled(True)
            self.diagnosis_btn.setText("AI诊断")
            self.status_label.setText("诊断失败")
    
    def on_health_error(self, error: str):
        """健康检查错误"""
        if self._is_closing:
            return
        
        # 即使健康检查失败，也可以使用进程列表进行诊断
        self.on_health_data_ready({})
    
    def on_diagnosis_ready(self, diagnosis_result: str):
        """AI诊断完成"""
        if self._is_closing:
            return
        
        try:
            # 显示诊断结果对话框
            dialog = QDialog(self)
            dialog.setWindowTitle("AI诊断结果")
            dialog.setMinimumSize(900, 700)
            
            layout = QVBoxLayout()
            layout.setContentsMargins(10, 10, 10, 10)
            dialog.setLayout(layout)
            
            # 诊断结果文本编辑器
            result_text = QTextEdit()
            result_text.setReadOnly(True)
            result_text.setFont(QFont("Consolas", 10))
            result_text.setPlainText(diagnosis_result)
            layout.addWidget(result_text)
            
            # 按钮
            button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Save)
            button_box.accepted.connect(dialog.accept)
            
            # 保存按钮
            save_btn = button_box.button(QDialogButtonBox.StandardButton.Save)
            save_btn.setText("保存报告")
            save_btn.clicked.connect(lambda: self._save_diagnosis_report(diagnosis_result))
            
            layout.addWidget(button_box)
            
            dialog.exec()
            
        except Exception as e:
            logger.error(f"显示诊断结果失败: {e}", exc_info=True)
        finally:
            self.diagnosis_btn.setEnabled(True)
            self.diagnosis_btn.setText("AI诊断")
            self.status_label.setText("诊断完成")
    
    def on_diagnosis_error(self, error: str):
        """AI诊断错误"""
        if self._is_closing:
            return
        
        QMessageBox.warning(self, "诊断失败", f"AI诊断失败: {error}")
        self.diagnosis_btn.setEnabled(True)
        self.diagnosis_btn.setText("AI诊断")
        self.status_label.setText("诊断失败")
    
    def _save_diagnosis_report(self, content: str):
        """保存诊断报告"""
        from pathlib import Path
        
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "保存诊断报告",
            f"数据库诊断报告_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
            "文本文件 (*.txt);;所有文件 (*)"
        )
        
        if file_path:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(f"数据库诊断报告\n")
                    f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write(f"连接: {self.connection_id}\n")
                    if self.database:
                        f.write(f"数据库: {self.database}\n")
                    f.write("=" * 50 + "\n\n")
                    f.write(content)
                
                QMessageBox.information(self, "成功", f"诊断报告已保存到:\n{file_path}")
            except Exception as e:
                QMessageBox.warning(self, "错误", f"保存失败: {str(e)}")
    
    def cleanup(self):
        """清理资源"""
        self._is_closing = True
        
        # 停止自动刷新
        if self.refresh_timer:
            self.refresh_timer.stop()
            self.refresh_timer = None
        
        # 停止worker
        if self.process_list_worker:
            try:
                if self.process_list_worker.isRunning():
                    self.process_list_worker.stop()
                    self.process_list_worker.wait(1000)
                self.process_list_worker.deleteLater()
            except:
                pass
            self.process_list_worker = None
        
        if self.health_worker:
            try:
                if self.health_worker.isRunning():
                    self.health_worker.stop()
                    self.health_worker.wait(1000)
                self.health_worker.deleteLater()
            except:
                pass
            self.health_worker = None
        
        if self.ai_diagnosis_worker:
            try:
                if self.ai_diagnosis_worker.isRunning():
                    self.ai_diagnosis_worker.stop()
                    self.ai_diagnosis_worker.wait(1000)
                self.ai_diagnosis_worker.deleteLater()
            except:
                pass
            self.ai_diagnosis_worker = None
