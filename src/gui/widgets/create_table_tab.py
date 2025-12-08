"""
新建表Tab组件 - 包含AI对话和SQL编辑器
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QSplitter,
    QTextEdit,
    QPushButton,
    QLabel,
    QScrollArea,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QKeyEvent
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class ChatInputTextEdit(QTextEdit):
    """支持 Enter 发送、Ctrl+Enter 换行的输入框（新建表对话）"""
    
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


class CreateTableTab(QWidget):
    """新建表Tab - 通过AI多轮对话生成建表语句"""
    
    execute_sql_signal = pyqtSignal(str)  # 执行SQL信号
    
    def __init__(self, parent=None, db_manager=None, connection_id: str = None, database: str = None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.connection_id = connection_id
        self.database = database
        self.main_window = parent  # 保存主窗口引用，用于显示状态栏
        self.conversation_history = []  # 对话历史
        self.ai_worker = None  # AI工作线程
        self.schema_worker = None  # 表结构工作线程
        self.table_list_worker = None  # 表列表工作线程
        self.select_reference_worker = None  # AI选择参考表工作线程
        self.reference_schema = ""  # 参考表结构
        self.all_table_names = []  # 所有表名
        self.reference_tables_selected = False  # 是否已经选择过关联表（仅第一次对话时选择）
        self.init_ui()
        # 异步加载表列表（不立即加载参考表结构，等用户发送第一条消息后再选择）
        self.load_table_list()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(8, 8, 8, 8)  # 增加内边距
        layout.setSpacing(8)  # 增加间距
        self.setLayout(layout)
        
        # 创建水平分割器
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setHandleWidth(6)  # 增加分割器手柄宽度
        
        # 左侧：AI对话界面
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
        self.conversation_display.setPlaceholderText("在此与AI对话，描述您想要创建的表结构...\n\n例如：\n- 创建一个用户表，包含id、用户名、邮箱、创建时间\n- 创建一个订单表，包含订单号、用户ID、金额、状态")
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
        
        splitter.addWidget(ai_container)
        splitter.setStretchFactor(0, 1)
        
        # 右侧：SQL编辑器
        sql_container = QWidget()
        sql_layout = QVBoxLayout()
        sql_layout.setContentsMargins(8, 8, 8, 8)  # 增加内边距
        sql_layout.setSpacing(8)  # 增加间距
        sql_container.setLayout(sql_layout)
        
        sql_label = QLabel("生成的建表语句")
        sql_label.setStyleSheet("font-weight: bold; font-size: 13px; padding: 8px;")  # 增大字体和内边距
        sql_layout.addWidget(sql_label)
        
        self.sql_edit = QTextEdit()
        self.sql_edit.setPlaceholderText("AI生成的CREATE TABLE语句将显示在这里...")
        self.sql_edit.setFont(QFont("Consolas", 10))
        sql_layout.addWidget(self.sql_edit)
        
        # 按钮
        sql_btn_layout = QHBoxLayout()
        self.execute_btn = QPushButton("执行建表")
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
        
        splitter.addWidget(sql_container)
        splitter.setStretchFactor(1, 1)
        
        # 设置默认比例
        splitter.setSizes([400, 400])
        
        layout.addWidget(splitter)
        
        # 状态栏（已隐藏，状态信息显示到主窗口状态栏）
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.hide()  # 隐藏状态标签，状态信息显示到主窗口状态栏
        layout.addWidget(self.status_label)
    
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
    
    def load_table_list(self):
        """加载表列表（用于后续AI选择参考表）"""
        if not self.db_manager or not self.connection_id or not self.database:
            return
        
        connection = self.db_manager.get_connection(self.connection_id)
        if not connection:
            return
        
        # 停止之前的worker
        if self.table_list_worker:
            try:
                if self.table_list_worker.isRunning():
                    self.table_list_worker.stop()
                    if not self.table_list_worker.wait(2000):
                        self.table_list_worker.terminate()
                        self.table_list_worker.wait(500)
                try:
                    self.table_list_worker.tables_ready.disconnect()
                except:
                    pass
                self.table_list_worker.deleteLater()
            except RuntimeError:
                pass
            self.table_list_worker = None
        
        # 获取所有表列表
        from src.gui.workers.table_list_worker import TableListWorker
        
        self.table_list_worker = TableListWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection_id=self.connection_id,
            database=self.database
        )
        self.table_list_worker.tables_ready.connect(self.on_table_list_loaded)
        self.table_list_worker.start()
    
    def on_table_list_loaded(self, tables: list):
        """表列表加载完成"""
        self.all_table_names = tables
        if tables:
            logger.info(f"已加载 {len(tables)} 个表名，等待用户输入后选择参考表")
        else:
            logger.info("未找到表，将无法选择参考表")
        
        # 清理worker
        if self.table_list_worker:
            self.table_list_worker.deleteLater()
            self.table_list_worker = None
    
    def on_reference_schema_ready(self, schema_text: str, table_names: list):
        """参考表结构加载完成回调"""
        if table_names and len(table_names) > 0:
            self.reference_schema = schema_text
            logger.info(f"已加载 {len(table_names)} 个参考表的结构")
        else:
            self.reference_schema = ""
            logger.info("未找到参考表结构")
        
        # 清理worker
        if self.schema_worker:
            self.schema_worker.deleteLater()
            self.schema_worker = None
        
        # 现在生成建表语句
        self.generate_create_table_sql()
    
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

        # 仅在第一次对话时选择关联表（如果还没有选择过且表列表已加载）
        if not self.reference_tables_selected and not self.reference_schema and self.all_table_names:
            # 标记为已选择，避免后续对话再次选择
            self.reference_tables_selected = True
            self.select_reference_tables(user_message)
        else:
            # 后续对话直接使用已选择的参考表结构（如果有）生成建表语句
            self.generate_create_table_sql()
    
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
    
    def select_reference_tables(self, user_query: str):
        """使用AI选择参考表（从所有表名中选择匹配度高的前5个）"""
        from src.core.ai_client import AIClient
        from src.core.ai_model_storage import AIModelStorage
        
        # 停止之前的worker
        if self.select_reference_worker:
            try:
                if self.select_reference_worker.isRunning():
                    self.select_reference_worker.stop()
                    if not self.select_reference_worker.wait(2000):
                        self.select_reference_worker.terminate()
                        self.select_reference_worker.wait(500)
                try:
                    self.select_reference_worker.tables_selected.disconnect()
                    self.select_reference_worker.error_occurred.disconnect()
                except:
                    pass
                self.select_reference_worker.deleteLater()
            except RuntimeError:
                pass
            self.select_reference_worker = None
        
        # 获取AI客户端
        ai_model_storage = AIModelStorage()
        default_model = ai_model_storage.get_default_model()
        
        if not default_model:
            self.set_status("错误: 未配置AI模型", is_error=True)
            self.add_message_to_conversation("AI", "错误: 请先配置AI模型")
            return
        
        self.set_status("AI正在选择参考表...", timeout=0)
        
        # 创建AI客户端
        ai_client = AIClient(
            api_key=default_model.api_key.get_secret_value(),
            base_url=default_model.get_base_url(),
            default_model=default_model.default_model,
            turbo_model=default_model.turbo_model
        )
        
        # 创建并启动AI选择参考表工作线程
        from src.gui.workers.create_table_select_reference_worker import CreateTableSelectReferenceWorker
        
        self.select_reference_worker = CreateTableSelectReferenceWorker(
            ai_client,
            user_query,
            self.all_table_names
        )
        self.select_reference_worker.tables_selected.connect(self.on_reference_tables_selected)
        self.select_reference_worker.error_occurred.connect(self.on_ai_error)
        self.select_reference_worker.start()
    
    def on_reference_tables_selected(self, selected_tables: list):
        """参考表选择完成，获取这些表的结构"""
        if not selected_tables:
            logger.warning("AI未选择任何参考表，将不使用参考表结构")
            self.set_status("就绪（未选择参考表）")
            # 直接生成建表语句
            self.generate_create_table_sql()
            return
        
        logger.info(f"AI选择了 {len(selected_tables)} 个参考表: {selected_tables}")
        self.set_status(f"正在加载 {len(selected_tables)} 个参考表的结构...", timeout=0)
        
        # 清理worker
        if self.select_reference_worker:
            self.select_reference_worker.deleteLater()
            self.select_reference_worker = None
        
        # 获取这些表的结构
        connection = self.db_manager.get_connection(self.connection_id)
        if not connection:
            self.generate_create_table_sql()
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
        
        # 创建并启动schema worker（获取选中的表的结构）
        from src.gui.workers.schema_worker import SchemaWorker
        
        self.schema_worker = SchemaWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            selected_tables=selected_tables,  # 只获取选中的表
            connection_id=self.connection_id,
            database=self.database
        )
        self.schema_worker.schema_ready.connect(self.on_reference_schema_ready)
        self.schema_worker.start()
    
    def generate_create_table_sql(self):
        """使用AI生成建表语句（在后台线程中执行）"""
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
        
        self.set_status("AI正在生成建表语句...", timeout=0)
        
        # 创建AI客户端
        ai_client = AIClient(
            api_key=default_model.api_key.get_secret_value(),
            base_url=default_model.get_base_url(),
            default_model=default_model.default_model,
            turbo_model=default_model.turbo_model
        )
        
        # 获取右侧当前的建表语句
        current_sql = self.sql_edit.toPlainText().strip()
        
        # 获取数据库类型
        db_type = None
        if self.db_manager and self.connection_id:
            connection = self.db_manager.get_connection(self.connection_id)
            if connection:
                db_type = connection.db_type.value
        
        # 判断是否是第一次对话（检查对话历史中是否已有AI的回复）
        # 如果已有AI回复，说明第一次对话已完成，后续对话不再需要传递参考表结构
        has_ai_response = any(msg.get('role') == 'assistant' for msg in self.conversation_history)
        reference_schema_to_use = self.reference_schema if not has_ai_response else ""
        
        # 创建并启动AI工作线程
        from src.gui.workers.create_table_ai_worker import CreateTableAIWorker
        
        self.ai_worker = CreateTableAIWorker(
            ai_client,
            self.conversation_history,
            self.database,
            reference_schema_to_use,  # 仅在第一次对话时传递参考表结构
            current_sql,  # 传递当前的建表语句
            db_type  # 传递数据库类型
        )
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.start()
    
    def on_sql_generated(self, sql: str):
        """AI生成SQL完成回调"""
        # 显示AI回复
        self.add_message_to_conversation("AI", f"已生成建表语句：\n\n```sql\n{sql}\n```")
        
        # 更新SQL编辑器
        self.sql_edit.setPlainText(sql)
        
        # 添加到对话历史
        self.conversation_history.append({"role": "assistant", "content": sql})
        
        self.set_status("建表语句生成成功")
        
        # 清理worker
        if self.ai_worker:
            self.ai_worker.deleteLater()
            self.ai_worker = None
    
    def on_ai_error(self, error_msg: str):
        """AI生成失败回调"""
        logger.error(f"AI生成建表语句失败: {error_msg}")
        self.set_status(f"错误: {error_msg}", is_error=True)
        self.add_message_to_conversation("AI", f"生成失败: {error_msg}")
        
        # 清理worker
        if self.ai_worker:
            self.ai_worker.deleteLater()
            self.ai_worker = None
    
    def clear_conversation(self):
        """清空对话"""
        self.conversation_history.clear()
        self.conversation_display.clear()
        self.sql_edit.clear()
        # 重置关联表选择标志，以便下次对话时重新选择
        self.reference_tables_selected = False
        self.reference_schema = ""
        self.set_status("对话已清空")
    
    def execute_sql(self):
        """执行建表SQL"""
        sql = self.sql_edit.toPlainText().strip()
        if not sql:
            self.set_status("错误: SQL语句为空", is_error=True)
            return
        
        self.execute_sql_signal.emit(sql)
        self.set_status("正在执行建表语句...", timeout=0)
    
    def copy_sql(self):
        """复制SQL到剪贴板"""
        from PyQt6.QtWidgets import QApplication
        sql = self.sql_edit.toPlainText()
        if sql:
            clipboard = QApplication.clipboard()
            clipboard.setText(sql)
            self.set_status("SQL已复制到剪贴板")
    
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
        
        # 停止table list worker
        if self.table_list_worker:
            try:
                if self.table_list_worker.isRunning():
                    self.table_list_worker.stop()
                    if not self.table_list_worker.wait(2000):
                        self.table_list_worker.terminate()
                        self.table_list_worker.wait(500)
                try:
                    self.table_list_worker.tables_ready.disconnect()
                except:
                    pass
                self.table_list_worker.deleteLater()
            except RuntimeError:
                pass
            self.table_list_worker = None
        
        # 停止select reference worker
        if self.select_reference_worker:
            try:
                if self.select_reference_worker.isRunning():
                    self.select_reference_worker.stop()
                    if not self.select_reference_worker.wait(2000):
                        self.select_reference_worker.terminate()
                        self.select_reference_worker.wait(500)
                try:
                    self.select_reference_worker.tables_selected.disconnect()
                    self.select_reference_worker.error_occurred.disconnect()
                except:
                    pass
                self.select_reference_worker.deleteLater()
            except RuntimeError:
                pass
            self.select_reference_worker = None

