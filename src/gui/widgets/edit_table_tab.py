"""
编辑表结构Tab组件 - 包含AI对话和SQL编辑器
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QSplitter,
    QTextEdit,
    QPushButton,
    QLabel,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QMenu,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QColor, QKeyEvent
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class ChatInputTextEdit(QTextEdit):
    """支持 Enter 发送、Ctrl+Enter 换行的输入框"""
    
    send_message = pyqtSignal()  # 发送消息信号
    
    def keyPressEvent(self, event: QKeyEvent):
        """处理按键事件"""
        # Ctrl+Enter 或 Ctrl+Return：换行
        if event.modifiers() == Qt.KeyboardModifier.ControlModifier and event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return]:
            # 插入换行符
            self.insertPlainText("\n")
            return
        
        # Enter 或 Return（无修饰键）：发送消息
        if event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return] and event.modifiers() == Qt.KeyboardModifier.NoModifier:
            self.send_message.emit()
            return
        
        # 其他按键正常处理
        super().keyPressEvent(event)


class EditTableTab(QWidget):
    """编辑表结构Tab - 通过AI多轮对话生成ALTER TABLE语句"""
    
    execute_sql_signal = pyqtSignal(str)  # 执行SQL信号
    
    def __init__(self, parent=None, db_manager=None, connection_id: str = None, database: str = None, table_name: str = None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.connection_id = connection_id
        self.database = database
        self.table_name = table_name
        self.main_window = parent  # 保存主窗口引用，用于显示状态栏
        self.conversation_history = []  # 对话历史
        self.ai_worker = None  # AI工作线程
        self.schema_worker = None  # 表结构工作线程
        self.index_worker = None  # 索引工作线程
        self.current_table_schema = ""  # 当前表结构
        self.init_ui()
        # 异步加载表结构
        self.load_table_schema()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(8, 8, 8, 8)  # 增加内边距
        layout.setSpacing(8)  # 增加间距
        self.setLayout(layout)
        
        # 创建水平分割器：左侧显示表结构，右侧是SQL和聊天
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        main_splitter.setHandleWidth(6)  # 增加分割器手柄宽度
        
        # 左侧：当前表结构显示区域
        schema_container = QWidget()
        schema_layout = QVBoxLayout()
        schema_layout.setContentsMargins(5, 5, 5, 5)
        schema_layout.setSpacing(5)
        schema_container.setLayout(schema_layout)
        
        schema_label = QLabel(f"当前表结构: {self.table_name}")
        schema_label.setStyleSheet("font-weight: bold; font-size: 13px; padding: 8px;")  # 增大字体和内边距
        schema_layout.addWidget(schema_label)
        
        # 使用QTableWidget显示表结构
        self.schema_table = QTableWidget()
        self.schema_table.setColumnCount(5)
        self.schema_table.setHorizontalHeaderLabels(["字段名", "类型", "可空", "默认值", "注释"])
        self.schema_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)  # 只读
        self.schema_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.schema_table.setAlternatingRowColors(True)  # 斑马纹
        self.schema_table.horizontalHeader().setStretchLastSection(True)  # 最后一列自动拉伸
        self.schema_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)  # 字段名列自适应
        self.schema_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)  # 类型列自适应
        self.schema_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)  # 可空列自适应
        self.schema_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)  # 默认值列固定宽度
        self.schema_table.setStyleSheet("""
            QTableWidget {
                border: 1px solid #ddd;
                gridline-color: #e0e0e0;
                background-color: white;
                font-size: 11px;
            }
            QTableWidget::item {
                padding: 6px;  /* 增加单元格内边距 */
            }
            QTableWidget::item:selected {
                background-color: #e3f2fd;
                color: #1976d2;
            }
            QHeaderView::section {
                background-color: #f5f5f5;
                padding: 8px;  /* 增加表头内边距 */
                border: 1px solid #ddd;
                font-weight: bold;
                font-size: 12px;  /* 增大表头字体 */
            }
        """)
        # 启用右键菜单
        self.schema_table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.schema_table.customContextMenuRequested.connect(self.show_schema_table_menu)
        schema_layout.addWidget(self.schema_table)
        
        # 表信息标签（显示主键和注释）
        self.table_info_label = QLabel()
        self.table_info_label.setStyleSheet("color: #666; padding: 5px; font-size: 11px;")
        self.table_info_label.setWordWrap(True)
        schema_layout.addWidget(self.table_info_label)
        
        # 索引列表显示区域
        index_label = QLabel("索引列表")
        index_label.setStyleSheet("font-weight: bold; font-size: 12px; padding: 5px; margin-top: 10px;")
        schema_layout.addWidget(index_label)
        
        self.index_list = QTextEdit()
        self.index_list.setReadOnly(True)
        self.index_list.setMaximumHeight(150)
        self.index_list.setPlaceholderText("正在加载索引信息...")
        self.index_list.setStyleSheet("""
            QTextEdit {
                border: 1px solid #ddd;
                background-color: #fafafa;
                font-family: Consolas, monospace;
                font-size: 10px;
                padding: 5px;
            }
        """)
        schema_layout.addWidget(self.index_list)
        
        main_splitter.addWidget(schema_container)
        main_splitter.setStretchFactor(0, 3)  # 左侧表结构占更多空间
        
        # 右侧：垂直分割器（上方AI对话，下方SQL编辑器）
        right_splitter = QSplitter(Qt.Orientation.Vertical)
        right_splitter.setHandleWidth(6)  # 增加分割器手柄宽度
        
        # 上方：AI对话界面
        ai_container = QWidget()
        ai_layout = QVBoxLayout()
        ai_layout.setContentsMargins(8, 8, 8, 8)  # 增加内边距
        ai_layout.setSpacing(8)  # 增加间距
        ai_container.setLayout(ai_layout)
        
        ai_label = QLabel("AI 对话助手")
        ai_label.setStyleSheet("font-weight: bold; font-size: 13px; padding: 8px;")  # 增大字体和内边距
        ai_layout.addWidget(ai_label)
        
        # 对话历史显示区域（只读）
        self.conversation_display = QTextEdit()
        self.conversation_display.setReadOnly(True)
        self.conversation_display.setPlaceholderText("在此与AI对话，描述您想要修改的表结构...\n\n例如：\n- 添加一个email字段\n- 修改name字段为VARCHAR(200)\n- 删除status字段")
        self.conversation_display.setFont(QFont("Microsoft YaHei", 10))
        ai_layout.addWidget(self.conversation_display)
        
        # 用户输入框（支持 Enter 发送、Ctrl+Enter 换行）
        self.user_input = ChatInputTextEdit()
        self.user_input.setPlaceholderText("输入您的需求...（Enter 发送，Ctrl+Enter 换行）")
        self.user_input.setMaximumHeight(100)
        self.user_input.setFont(QFont("Microsoft YaHei", 10))
        self.user_input.send_message.connect(self.send_message)  # 连接发送信号
        ai_layout.addWidget(self.user_input)
        
        # 按钮
        btn_layout = QHBoxLayout()
        self.send_btn = QPushButton("发送")
        self.send_btn.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                padding: 5px 15px;
                border: none;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
        """)
        self.send_btn.clicked.connect(self.send_message)
        btn_layout.addWidget(self.send_btn)
        
        self.clear_btn = QPushButton("清空对话")
        self.clear_btn.clicked.connect(self.clear_conversation)
        btn_layout.addWidget(self.clear_btn)
        
        btn_layout.addStretch()
        ai_layout.addLayout(btn_layout)
        
        right_splitter.addWidget(ai_container)
        right_splitter.setStretchFactor(0, 1)
        
        # 下方：SQL编辑器
        sql_container = QWidget()
        sql_layout = QVBoxLayout()
        sql_layout.setContentsMargins(8, 8, 8, 8)  # 增加内边距
        sql_layout.setSpacing(8)  # 增加间距
        sql_container.setLayout(sql_layout)
        
        sql_label = QLabel("生成的修改表语句")
        sql_label.setStyleSheet("font-weight: bold; font-size: 13px; padding: 8px;")  # 增大字体和内边距
        sql_layout.addWidget(sql_label)
        
        self.sql_edit = QTextEdit()
        self.sql_edit.setPlaceholderText("AI生成的ALTER TABLE语句将显示在这里...")
        self.sql_edit.setFont(QFont("Consolas", 10))
        sql_layout.addWidget(self.sql_edit)
        
        # 按钮
        sql_btn_layout = QHBoxLayout()
        self.execute_btn = QPushButton("执行修改")
        self.execute_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                padding: 5px 15px;
                border: none;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        self.execute_btn.clicked.connect(self.execute_sql)
        sql_btn_layout.addWidget(self.execute_btn)
        
        self.copy_btn = QPushButton("复制SQL")
        self.copy_btn.clicked.connect(self.copy_sql)
        sql_btn_layout.addWidget(self.copy_btn)
        
        sql_btn_layout.addStretch()
        sql_layout.addLayout(sql_btn_layout)
        
        right_splitter.addWidget(sql_container)
        right_splitter.setStretchFactor(1, 1)
        
        # 设置默认比例（上方AI对话占50%，下方SQL占50%）
        right_splitter.setSizes([400, 400])
        
        main_splitter.addWidget(right_splitter)
        main_splitter.setStretchFactor(1, 2)
        
        # 设置默认比例（左侧表结构占60%，右侧SQL和聊天占40%）
        main_splitter.setSizes([600, 400])
        
        layout.addWidget(main_splitter)
        
        # 状态栏（已隐藏，状态信息显示到主窗口状态栏）
        self.status_label = QLabel("正在加载表结构...")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.hide()  # 隐藏状态标签，状态信息显示到主窗口状态栏
        layout.addWidget(self.status_label)
        
        # 初始状态显示到主窗口状态栏
        self.set_status("正在加载表结构...", timeout=0)
    
    def set_status(self, message: str, is_error: bool = False, timeout: int = None):
        """设置状态信息（显示到主窗口状态栏）"""
        # 显示到主窗口状态栏
        if self.main_window and hasattr(self.main_window, 'statusBar'):
            if timeout is None:
                timeout = 5000 if is_error else 3000
            self.main_window.statusBar().showMessage(message, timeout)
        # 保留本地状态标签的更新（虽然已隐藏），以防需要调试
        if is_error:
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
        else:
            self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.setText(message)
    
    def load_table_schema(self, force_refresh: bool = False):
        """加载当前表的结构
        
        Args:
            force_refresh: 是否强制从数据库重新获取（跳过缓存），默认False
        """
        if not self.db_manager or not self.connection_id or not self.table_name:
            return
        
        connection = self.db_manager.get_connection(self.connection_id)
        if not connection:
            return
        
        # 停止之前的schema worker
        if self.schema_worker:
            try:
                if self.schema_worker.isRunning():
                    self.schema_worker.stop()
                    if not self.schema_worker.wait(2000):
                        self.schema_worker.terminate()
                        self.schema_worker.wait(500)
                try:
                    self.schema_worker.schema_ready.disconnect()
                except:
                    pass
                self.schema_worker.deleteLater()
            except RuntimeError:
                pass
            self.schema_worker = None
        
        # 停止之前的index worker
        if self.index_worker:
            try:
                if self.index_worker.isRunning():
                    self.index_worker.terminate()
                    self.index_worker.wait(500)
                try:
                    self.index_worker.indexes_ready.disconnect()
                except:
                    pass
                self.index_worker.deleteLater()
            except RuntimeError:
                pass
            self.index_worker = None
        
        # 显示加载状态
        if force_refresh:
            self.set_status("正在从数据库重新加载表结构...", timeout=0)
        else:
            self.set_status("正在加载表结构...", timeout=0)
        
        # 创建并启动schema worker（只获取当前表的结构）
        from src.gui.workers.schema_worker import SchemaWorker
        
        self.schema_worker = SchemaWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            selected_tables=[self.table_name],  # 只获取当前表
            connection_id=self.connection_id,
            database=self.database,
            force_refresh=force_refresh  # 传递强制刷新标志
        )
        self.schema_worker.schema_ready.connect(self.on_table_schema_ready)
        self.schema_worker.start()
    
    def load_table_indexes(self):
        """加载表的索引信息"""
        if not self.db_manager or not self.connection_id or not self.table_name:
            return
        
        connection = self.db_manager.get_connection(self.connection_id)
        if not connection:
            return
        
        # 在工作线程中获取索引信息
        from PyQt6.QtCore import QThread, pyqtSignal
        
        class IndexLoaderWorker(QThread):
            indexes_ready = pyqtSignal(list)
            
            def __init__(self, connection_string, connect_args, table_name, database, db_type):
                super().__init__()
                self.connection_string = connection_string
                self.connect_args = connect_args
                self.table_name = table_name
                self.database = database
                self.db_type = db_type
            
            def run(self):
                try:
                    from sqlalchemy import create_engine, inspect
                    engine = create_engine(
                        self.connection_string,
                        connect_args=self.connect_args,
                        pool_pre_ping=True,
                        echo=False
                    )
                    
                    inspector = inspect(engine)
                    
                    # 获取索引信息
                    if self.db_type in ('mysql', 'mariadb') and self.database:
                        indexes = inspector.get_indexes(self.table_name, schema=self.database)
                    else:
                        indexes = inspector.get_indexes(self.table_name)
                    
                    self.indexes_ready.emit(indexes)
                    engine.dispose()
                except Exception as e:
                    logger.error(f"获取索引信息失败: {str(e)}")
                    self.indexes_ready.emit([])
        
        self.index_worker = IndexLoaderWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            self.table_name,
            self.database,
            connection.db_type.value if connection.db_type else 'mysql'
        )
        self.index_worker.indexes_ready.connect(self.on_indexes_ready)
        self.index_worker.start()
    
    def on_indexes_ready(self, indexes: list):
        """索引信息加载完成回调"""
        if not indexes:
            self.index_list.setPlainText("无索引")
            return
        
        # 格式化索引信息
        index_lines = []
        for idx in indexes:
            index_name = idx.get('name', '未知')
            columns = ', '.join(idx.get('column_names', []))
            unique = "唯一索引" if idx.get('unique', False) else "普通索引"
            
            index_info = f"{index_name} ({columns}) - {unique}"
            index_lines.append(index_info)
        
        self.index_list.setPlainText('\n'.join(index_lines))
    
    def on_table_schema_ready(self, schema_text: str, table_names: list):
        """表结构加载完成回调"""
        self.current_table_schema = schema_text
        logger.info(f"已加载表 {self.table_name} 的结构")
        logger.info(f"Schema文本长度: {len(schema_text) if schema_text else 0}")
        logger.info(f"Schema文本前500字符:\n{schema_text[:500] if schema_text else '空'}")
        logger.info(f"返回的表名列表: {table_names}")
        
        # 加载索引信息
        self.load_table_indexes()
        
        # 检查是否成功获取到表结构
        if not schema_text or not schema_text.strip():
            error_msg = f"未能获取表 {self.table_name} 的结构"
            if table_names:
                error_msg += f"。返回的表名列表: {table_names}，但表结构为空"
            else:
                error_msg += "。可能表不存在或表名不匹配"
            logger.error(error_msg)
            self.set_status(f"错误: {error_msg}", is_error=True)
            # 清理worker
            if self.schema_worker:
                self.schema_worker.deleteLater()
                self.schema_worker = None
            return
        
        # 解析表结构并填充到QTableWidget
        try:
            parse_result = self._parse_schema(schema_text)
            if isinstance(parse_result, tuple) and len(parse_result) == 2:
                table_info, columns = parse_result
            else:
                logger.error(f"_parse_schema返回了意外的值: {parse_result}, 类型: {type(parse_result)}")
                table_info, columns = {}, []
        except Exception as e:
            logger.error(f"解析表结构时发生错误: {str(e)}", exc_info=True)
            table_info, columns = {}, []
        
        logger.info(f"解析结果: 表信息={table_info}, 列数量={len(columns)}")
        
        if not columns:
            logger.warning(f"解析后没有列数据，schema_text内容:\n{schema_text}")
            self.set_status(f"警告: 表结构解析后没有列数据", is_error=False)
        else:
            self._populate_table(table_info, columns)
            self.set_status("就绪")
        
        # 清理worker
        if self.schema_worker:
            self.schema_worker.deleteLater()
            self.schema_worker = None
        
        # 自动发送初始消息给AI，告知当前表结构
        if schema_text and schema_text.strip():
            initial_message = f"当前表 {self.table_name} 的结构如下：\n\n{schema_text}\n\n请记住这个表结构，后续我将通过对话来修改它。"
            self.conversation_history.append({"role": "user", "content": initial_message})
            self.add_message_to_conversation("用户", f"当前表 {self.table_name} 的结构已加载")
    
    def _parse_schema(self, schema_text: str):
        """解析表结构文本，返回表信息和列数据"""
        try:
            if not schema_text or not schema_text.strip():
                logger.warning("Schema文本为空，无法解析")
                return {}, []
            
            lines = schema_text.split('\n')
            table_info = {
                'name': self.table_name,
                'primary_keys': "",
                'comment': ""
            }
            columns = []
            current_table = None
            
            for line in lines:
                original_line = line
                line_stripped = line.strip()
                if not line_stripped:
                    continue
                
                # 解析表信息行：格式为 "表: table_name [主键: ...] - 注释"
                if line_stripped.startswith('表: '):
                    table_part = line_stripped[3:].strip()  # 移除 "表: "
                    # 提取表名、主键和注释
                    table_name = table_part
                    primary_keys = ""
                    comment = ""
                    
                    if ' [' in table_part:
                        table_name = table_part.split(' [')[0].strip()
                        pk_part = table_part.split(' [')[1]
                        if ']' in pk_part:
                            primary_keys = pk_part.split(']')[0].replace('主键: ', '').strip()
                            rest = pk_part.split(']', 1)[1].strip()
                            if rest.startswith('- '):
                                comment = rest[2:].strip()
                    elif ' - ' in table_part:
                        parts = table_part.split(' - ', 1)
                        table_name = parts[0].strip()
                        comment = parts[1].strip()
                    
                    table_info['name'] = table_name
                    table_info['primary_keys'] = primary_keys
                    table_info['comment'] = comment
                    current_table = table_name
                    logger.info(f"解析到表信息: {table_name}, 主键: {primary_keys}, 注释: {comment}")
                    if primary_keys:
                        logger.info(f"主键列表: {primary_keys.split(',') if primary_keys else []}")
                
                # 解析列信息行：格式为 "  • column_name: TYPE (可空/非空) (注释), 默认: ..."
                # 注意：需要检查原始行（保留空格），因为列信息行以 "  • " 开头
                elif original_line.strip().startswith('• ') or '•' in original_line:
                    # 即使current_table为None，也尝试解析（可能表信息行解析失败）
                    if not current_table:
                        current_table = self.table_name  # 使用已知的表名
                    
                    # 找到 • 的位置，然后提取后面的内容
                    bullet_index = original_line.find('•')
                    if bullet_index >= 0:
                        col_part = original_line[bullet_index + 1:].strip()  # 移除 "• " 及其前面的空格
                    else:
                        col_part = line_stripped
                    
                    # 解析列名
                    col_name = ""
                    col_type = ""
                    nullable_str = ""
                    comment = ""
                    default = ""
                    
                    if ':' in col_part:
                        col_name = col_part.split(':')[0].strip()
                        rest = col_part.split(':', 1)[1].strip()
                        
                        # 解析类型和可空性
                        if ' (' in rest:
                            col_type = rest.split(' (')[0].strip()
                            nullable_part = rest.split(' (', 1)[1]
                            if ')' in nullable_part:
                                nullable_str = nullable_part.split(')')[0].strip()
                                rest = nullable_part.split(')', 1)[1].strip()
                                
                                # 解析注释（可能有括号）
                                if rest.startswith('('):
                                    comment_part = rest[1:]
                                    if ')' in comment_part:
                                        comment = comment_part.split(')')[0].strip()
                                        rest = comment_part.split(')', 1)[1].strip()
                                
                                # 解析默认值
                                if rest.startswith(', 默认: '):
                                    default = rest.replace(', 默认: ', '').strip()
                        else:
                            # 没有可空性信息，只有类型
                            col_type = rest
                        
                        if col_name:  # 确保有列名
                            columns.append({
                                'name': col_name,
                                'type': col_type,
                                'nullable': nullable_str,
                                'comment': comment,
                                'default': default
                            })
                            logger.debug(f"解析到列: {col_name}, 类型: {col_type}, 可空: {nullable_str}")
            
            logger.info(f"解析完成: 表={table_info['name']}, 列数={len(columns)}")
            return table_info, columns
        except Exception as e:
            logger.error(f"解析表结构时发生异常: {str(e)}", exc_info=True)
            return {}, []
    
    def _populate_table(self, table_info: dict, columns: list):
        """将解析的数据填充到QTableWidget"""
        # 设置表信息标签
        info_parts = []
        if table_info.get('primary_keys'):
            info_parts.append(f"主键: {table_info['primary_keys']}")
        if table_info.get('comment'):
            info_parts.append(f"注释: {table_info['comment']}")
        
        if info_parts:
            self.table_info_label.setText(" | ".join(info_parts))
        else:
            self.table_info_label.setText("")
        
        # 清空表格
        self.schema_table.setRowCount(0)
        
        # 填充列数据
        self.schema_table.setRowCount(len(columns))
        
        # 解析主键列表
        primary_keys_str = table_info.get('primary_keys', '')
        primary_keys = []
        if primary_keys_str:
            primary_keys = [pk.strip() for pk in primary_keys_str.split(',')]
            logger.info(f"解析到的主键字段列表: {primary_keys}")
        else:
            logger.warning(f"表 {table_info.get('name', 'unknown')} 没有主键信息")
        
        for row, col in enumerate(columns):
            # 字段名（蓝色加粗，如果是主键则添加标识）
            col_name = col['name']
            is_primary_key = col_name in primary_keys
            if is_primary_key:
                logger.debug(f"字段 {col_name} 是主键")
            display_name = f"{col_name} 🔑" if is_primary_key else col_name
            
            name_item = QTableWidgetItem(display_name)
            name_item.setForeground(QColor("#1976d2"))
            font = name_item.font()
            font.setBold(True)
            name_item.setFont(font)
            
            # 如果是主键，使用特殊背景色
            if is_primary_key:
                name_item.setBackground(QColor("#fff3e0"))  # 浅橙色背景
                name_item.setToolTip("主键字段")
            
            self.schema_table.setItem(row, 0, name_item)
            
            # 类型（绿色）
            type_item = QTableWidgetItem(col['type'])
            type_item.setForeground(QColor("#388e3c"))
            self.schema_table.setItem(row, 1, type_item)
            
            # 可空（橙色）
            nullable_text = "是" if col['nullable'] == "可空" else "否"
            nullable_item = QTableWidgetItem(nullable_text)
            nullable_item.setForeground(QColor("#f57c00"))
            self.schema_table.setItem(row, 2, nullable_item)
            
            # 默认值
            default_text = col['default'] if col['default'] else "-"
            default_item = QTableWidgetItem(default_text)
            self.schema_table.setItem(row, 3, default_item)
            
            # 注释
            comment_text = col['comment'] if col['comment'] else "-"
            comment_item = QTableWidgetItem(comment_text)
            self.schema_table.setItem(row, 4, comment_item)
        
        # 调整列宽
        self.schema_table.resizeColumnsToContents()
        # 设置默认值列固定宽度（较窄）
        self.schema_table.setColumnWidth(3, 120)  # 默认值列宽度设为120px
    
    def send_message(self):
        """发送消息给AI"""
        user_message = self.user_input.toPlainText().strip()
        if not user_message:
            return
        
        # 显示用户消息
        self.add_message_to_conversation("用户", user_message)
        self.user_input.clear()
        
        # 添加到对话历史
        self.conversation_history.append({"role": "user", "content": user_message})
        
        # 生成ALTER TABLE语句
        self.generate_alter_table_sql()
    
    def add_message_to_conversation(self, role: str, content: str):
        """添加消息到对话显示区域"""
        if role == "用户":
            prefix = "👤 您:"
            color = "#2196F3"
        else:
            prefix = "🤖 AI:"
            color = "#4CAF50"
        
        formatted_message = f'<div style="margin-bottom: 10px;"><span style="color: {color}; font-weight: bold;">{prefix}</span><br/>{content.replace(chr(10), "<br/>")}</div>'
        
        current_text = self.conversation_display.toHtml()
        self.conversation_display.setHtml(current_text + formatted_message)
        
        # 滚动到底部
        scrollbar = self.conversation_display.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
    
    def generate_alter_table_sql(self):
        """使用AI生成ALTER TABLE语句（在后台线程中执行）"""
        from src.core.ai_client import AIClient
        from src.core.ai_model_storage import AIModelStorage
        
        # 停止之前的AI工作线程
        if self.ai_worker:
            try:
                if self.ai_worker.isRunning():
                    self.ai_worker.stop()
                    if not self.ai_worker.wait(2000):
                        self.ai_worker.terminate()
                        self.ai_worker.wait(500)
                try:
                    self.ai_worker.sql_generated.disconnect()
                    self.ai_worker.error_occurred.disconnect()
                except:
                    pass
                self.ai_worker.deleteLater()
            except RuntimeError:
                pass
            self.ai_worker = None
        
        # 获取AI客户端
        ai_model_storage = AIModelStorage()
        default_model = ai_model_storage.get_default_model()
        
        if not default_model:
            self.set_status("错误: 未配置AI模型", is_error=True)
            self.add_message_to_conversation("AI", "错误: 请先配置AI模型")
            return
        
        self.set_status("AI正在生成修改表语句...", timeout=0)
        
        # 创建AI客户端
        ai_client = AIClient(
            api_key=default_model.api_key.get_secret_value(),
            base_url=default_model.get_base_url(),
            default_model=default_model.default_model,
            turbo_model=default_model.turbo_model
        )
        
        # 获取右侧当前的SQL语句
        current_sql = self.sql_edit.toPlainText().strip()
        
        # 创建并启动AI工作线程
        from src.gui.workers.edit_table_ai_worker import EditTableAIWorker
        
        # 获取数据库类型
        db_type = None
        if self.db_manager and self.connection_id:
            connection = self.db_manager.get_connection(self.connection_id)
            if connection:
                db_type = connection.db_type.value
        
        self.ai_worker = EditTableAIWorker(
            ai_client,
            self.conversation_history,
            self.database,
            self.table_name,
            self.current_table_schema,
            current_sql,
            db_type  # 传递数据库类型
        )
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.start()
    
    def on_sql_generated(self, sql: str):
        """SQL生成完成回调"""
        self.sql_edit.setPlainText(sql)
        self.set_status("修改表语句生成成功")
        self.add_message_to_conversation("AI", f"已生成修改表语句：\n\n```sql\n{sql}\n```")
    
    def on_ai_error(self, error_msg: str):
        """AI错误回调"""
        self.set_status(f"错误: {error_msg}", is_error=True)
        self.add_message_to_conversation("AI", f"错误: {error_msg}")
    
    def show_schema_table_menu(self, position):
        """显示表结构表格的右键菜单"""
        menu = QMenu(self)
        refresh_action = menu.addAction("🔄 刷新")
        # 刷新时强制从数据库重新获取
        refresh_action.triggered.connect(lambda: self.load_table_schema(force_refresh=True))
        menu.exec(self.schema_table.mapToGlobal(position))
    
    def execute_sql(self):
        """执行SQL"""
        sql = self.sql_edit.toPlainText().strip()
        if not sql:
            return
        
        self.execute_sql_signal.emit(sql)
    
    def copy_sql(self):
        """复制SQL到剪贴板"""
        sql = self.sql_edit.toPlainText().strip()
        if sql:
            from PyQt6.QtWidgets import QApplication
            clipboard = QApplication.clipboard()
            clipboard.setText(sql)
            self.set_status("SQL已复制到剪贴板")
    
    def clear_conversation(self):
        """清空对话"""
        self.conversation_display.clear()
        self.conversation_history = []
        # 重新发送初始消息
        if self.current_table_schema:
            initial_message = f"当前表 {self.table_name} 的结构如下：\n\n{self.current_table_schema}\n\n请记住这个表结构，后续我将通过对话来修改它。"
            self.conversation_history.append({"role": "user", "content": initial_message})
            self.add_message_to_conversation("用户", f"当前表 {self.table_name} 的结构已加载")
    
    def cleanup(self):
        """清理资源"""
        # 停止AI工作线程
        if self.ai_worker:
            try:
                if self.ai_worker.isRunning():
                    self.ai_worker.stop()
                    if not self.ai_worker.wait(2000):
                        self.ai_worker.terminate()
                        self.ai_worker.wait(500)
                try:
                    self.ai_worker.sql_generated.disconnect()
                    self.ai_worker.error_occurred.disconnect()
                except:
                    pass
                self.ai_worker.deleteLater()
            except RuntimeError:
                pass
            self.ai_worker = None
        
        # 停止schema worker
        if self.schema_worker:
            try:
                if self.schema_worker.isRunning():
                    self.schema_worker.stop()
                    if not self.schema_worker.wait(2000):
                        self.schema_worker.terminate()
                        self.schema_worker.wait(500)
                try:
                    self.schema_worker.schema_ready.disconnect()
                except:
                    pass
                self.schema_worker.deleteLater()
            except RuntimeError:
                pass
            self.schema_worker = None
        
        # 停止index worker
        if self.index_worker:
            try:
                if self.index_worker.isRunning():
                    self.index_worker.terminate()
                    self.index_worker.wait(500)
                try:
                    self.index_worker.indexes_ready.disconnect()
                except:
                    pass
                self.index_worker.deleteLater()
            except RuntimeError:
                pass
            self.index_worker = None

