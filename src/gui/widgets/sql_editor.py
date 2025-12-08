"""
SQL编辑器组件
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QPlainTextEdit,
    QPushButton,
    QLabel,
    QCompleter,
    QSplitter,
    QTextEdit,
)
from PyQt6.QtCore import Qt, pyqtSignal, QStringListModel, QModelIndex
from PyQt6.QtGui import QFont, QTextCursor, QKeyEvent
from typing import List, Optional, Callable
from src.gui.workers.ai_worker import AIWorker
from src.core.ai_client import AIClient


class CompletableTextEdit(QPlainTextEdit):
    """支持自动完成的文本编辑器"""
    
    def __init__(self, completer: QCompleter, insert_completion_callback: Callable[[str], None], parent=None):
        super().__init__(parent)
        self.completer = completer
        self.insert_completion_callback = insert_completion_callback
    
    def keyPressEvent(self, event: QKeyEvent):
        """处理按键事件"""
        # 如果自动完成弹窗可见，处理特殊按键
        if self.completer and self.completer.popup().isVisible():
            # Enter 或 Return 键插入完成
            if event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return]:
                # 获取弹窗的当前选中项
                popup = self.completer.popup()
                current_index = popup.currentIndex()
                
                # 使用 completionModel 而不是原始模型（因为这是过滤后的模型）
                completion_model = self.completer.completionModel()
                
                if current_index.isValid():
                    # 从完成模型获取选中项的数据
                    current_completion = completion_model.data(current_index, Qt.ItemDataRole.DisplayRole)
                    
                    if current_completion:
                        # 调用回调函数插入完成项
                        self.insert_completion_callback(str(current_completion))
                        # 隐藏弹窗
                        self.completer.popup().hide()
                else:
                    # 如果没有选中项，使用第一行
                    if completion_model and completion_model.rowCount() > 0:
                        first_index = completion_model.index(0, 0)
                        current_completion = completion_model.data(first_index, Qt.ItemDataRole.DisplayRole)
                        if current_completion:
                            self.insert_completion_callback(str(current_completion))
                            self.completer.popup().hide()
                return
            
            # Tab 键插入完成
            if event.key() == Qt.Key.Key_Tab:
                popup = self.completer.popup()
                current_index = popup.currentIndex()
                
                # 使用 completionModel 而不是原始模型
                completion_model = self.completer.completionModel()
                
                if current_index.isValid():
                    current_completion = completion_model.data(current_index, Qt.ItemDataRole.DisplayRole)
                    if current_completion:
                        self.insert_completion_callback(str(current_completion))
                        self.completer.popup().hide()
                else:
                    if completion_model and completion_model.rowCount() > 0:
                        first_index = completion_model.index(0, 0)
                        current_completion = completion_model.data(first_index, Qt.ItemDataRole.DisplayRole)
                        if current_completion:
                            self.insert_completion_callback(str(current_completion))
                            self.completer.popup().hide()
                return
            
            # Escape 键关闭自动完成
            if event.key() == Qt.Key.Key_Escape:
                self.completer.popup().hide()
                return
            
            # 上下箭头键导航（让 QCompleter 自己处理）
            if event.key() in [Qt.Key.Key_Up, Qt.Key.Key_Down]:
                # 让 QCompleter 处理导航，不拦截
                super().keyPressEvent(event)
                return
        
        # 其他按键，让父类正常处理
        super().keyPressEvent(event)


class SQLEditor(QWidget):
    """SQL编辑器"""
    
    execute_signal = pyqtSignal(str)  # 执行SQL信号
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.completion_words: List[str] = []
        self.completer: Optional[QCompleter] = None
        self.db_manager = None  # 数据库管理器引用
        self.current_connection_id = None  # 当前连接ID
        self.current_database = None  # 当前数据库
        self.init_ui()
    
    def set_database_info(self, db_manager, connection_id: str, database: Optional[str] = None):
        """设置数据库信息（用于AI生成SQL时获取表结构）"""
        self.db_manager = db_manager
        self.current_connection_id = connection_id
        self.current_database = database  # 当前数据库
        # 初始化schema_worker为None
        if not hasattr(self, 'schema_worker'):
            self.schema_worker = None
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(5, 5, 5, 5)  # 减少外边距
        layout.setSpacing(5)  # 减少组件间距
        self.setLayout(layout)
        
        # 创建水平分割器，将界面分为两部分
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # 左侧：AI输入框
        ai_container = QWidget()
        ai_layout = QVBoxLayout()
        ai_layout.setContentsMargins(5, 5, 5, 5)  # 减少内边距
        ai_layout.setSpacing(5)  # 减少间距
        ai_container.setLayout(ai_layout)
        
        ai_label = QLabel("AI 智能查询")
        ai_label.setStyleSheet("font-weight: bold; font-size: 12px; padding: 5px;")
        ai_layout.addWidget(ai_label)
        
        self.ai_input = QTextEdit()
        self.ai_input.setPlaceholderText("在此输入中文描述，AI将自动生成SQL并执行查询...\n\n例如：\n- 查询所有用户信息\n- 统计每个部门的员工数量\n- 查找最近一周的订单")
        self.ai_input.setFont(QFont("Microsoft YaHei", 10))
        ai_layout.addWidget(self.ai_input)
        
        # 按钮放在输入框下面
        ai_btn_layout = QHBoxLayout()
        self.generate_btn = QPushButton("直接查询")
        self.generate_btn.setStyleSheet("""
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
        self.generate_btn.clicked.connect(self.generate_sql_from_ai)
        ai_btn_layout.addWidget(self.generate_btn)
        ai_btn_layout.addStretch()
        ai_layout.addLayout(ai_btn_layout)
        
        splitter.addWidget(ai_container)
        splitter.setStretchFactor(0, 1)  # 左侧占1份
        
        # 右侧：SQL编辑器
        sql_container = QWidget()
        sql_layout = QVBoxLayout()
        sql_layout.setContentsMargins(5, 5, 5, 5)  # 减少内边距
        sql_layout.setSpacing(5)  # 减少间距
        sql_container.setLayout(sql_layout)
        
        sql_label = QLabel("SQL 编辑器")
        sql_label.setStyleSheet("font-weight: bold; font-size: 12px; padding: 5px;")
        sql_layout.addWidget(sql_label)
        
        # 先创建完成器（临时，稍后会重新设置）
        self.completion_words = []
        self.completer = None
        
        # SQL编辑器（使用自定义的CompletableTextEdit以获得更好的自动完成支持）
        self.sql_edit = CompletableTextEdit(
            None,  # completer 稍后设置
            self.insert_completion,  # insert_completion_callback
            self
        )
        self.sql_edit.setPlaceholderText("在此输入SQL语句...\n\n提示: 按 F5 执行查询，输入时自动显示表名和列名提示")
        
        # 设置等宽字体
        font = QFont("Consolas", 10)
        font.setStyleHint(QFont.StyleHint.Monospace)
        self.sql_edit.setFont(font)
        
        # 设置自动完成
        self.setup_completer()
        
        # 更新自定义编辑器的 completer 引用
        self.sql_edit.completer = self.completer
        
        # 安装事件过滤器以处理 F5 等快捷键
        self.sql_edit.installEventFilter(self)
        
        sql_layout.addWidget(self.sql_edit)
        
        # 按钮放在SQL编辑器下面
        sql_btn_layout = QHBoxLayout()
        self.execute_btn = QPushButton("执行 (F5)")
        self.execute_btn.clicked.connect(self.execute_sql)
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
        
        self.clear_btn = QPushButton("清空")
        self.clear_btn.clicked.connect(self.clear_sql)
        
        sql_btn_layout.addWidget(self.execute_btn)
        sql_btn_layout.addWidget(self.clear_btn)
        sql_btn_layout.addStretch()
        sql_layout.addLayout(sql_btn_layout)
        
        splitter.addWidget(sql_container)
        splitter.setStretchFactor(1, 2)  # 右侧占2份
        
        # 设置默认比例（左侧30%，右侧70%）
        splitter.setSizes([300, 700])
        
        layout.addWidget(splitter)
        
        # 状态栏（已隐藏，状态信息显示到主窗口状态栏）
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.hide()  # 隐藏状态标签
        
        # 初始化AI客户端和工作线程
        self.ai_client = None
        self.ai_worker = None
        self.schema_worker = None
        self.table_list_worker = None
        self.ai_table_selector_worker = None
        self.ai_enum_selector_worker = None
        self.enum_values_worker = None
        self._temp_table_schema = ""
        self._temp_table_names = []
        self._temp_enum_columns = {}  # 临时保存枚举字段信息
    
    def setup_completer(self):
        """设置自动完成"""
        # SQL关键字
        sql_keywords = [
            "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP",
            "ALTER", "TABLE", "INDEX", "VIEW", "DATABASE", "SCHEMA", "USE", "SHOW",
            "DESCRIBE", "DESC", "EXPLAIN", "JOIN", "INNER", "LEFT", "RIGHT", "FULL",
            "OUTER", "ON", "AS", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS",
            "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "DISTINCT",
            "COUNT", "SUM", "AVG", "MAX", "MIN", "UNION", "ALL", "CASE", "WHEN",
            "THEN", "ELSE", "END", "IF", "EXISTS", "CAST", "CONVERT", "TRUNCATE",
            "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "TRANSACTION", "BEGIN", "END",
        ]
        
        # 初始化完成词列表
        self.completion_words = sql_keywords.copy()
        
        # 创建自动完成器
        self.completer = QCompleter(self.completion_words, self)
        self.completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
        self.completer.setCompletionMode(QCompleter.CompletionMode.PopupCompletion)
        self.completer.setWidget(self.sql_edit)
        self.completer.activated.connect(self.insert_completion)
        
        # 设置完成器属性
        self.completer.setFilterMode(Qt.MatchFlag.MatchContains)  # 包含匹配
        self.completer.setMaxVisibleItems(10)  # 最多显示10项
        
        # 连接文本变化信号，用于动态更新完成列表
        self.sql_edit.textChanged.connect(self.on_text_changed)
    
    def update_completion_words(self, tables: List[str], columns: Optional[List[str]] = None):
        """更新自动完成词列表"""
        # SQL关键字
        sql_keywords = [
            "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP",
            "ALTER", "TABLE", "INDEX", "VIEW", "DATABASE", "SCHEMA", "USE", "SHOW",
            "DESCRIBE", "DESC", "EXPLAIN", "JOIN", "INNER", "LEFT", "RIGHT", "FULL",
            "OUTER", "ON", "AS", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS",
            "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "DISTINCT",
            "COUNT", "SUM", "AVG", "MAX", "MIN", "UNION", "ALL", "CASE", "WHEN",
            "THEN", "ELSE", "END", "IF", "EXISTS", "CAST", "CONVERT", "TRUNCATE",
            "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "TRANSACTION", "BEGIN", "END",
        ]
        
        # 合并所有完成词
        self.completion_words = sql_keywords.copy()
        self.completion_words.extend(tables)
        
        if columns:
            self.completion_words.extend(columns)
        
        # 更新自动完成器
        model = QStringListModel(self.completion_words, self.completer)
        self.completer.setModel(model)
        
        # 确保自定义编辑器的 completer 引用是最新的
        if hasattr(self, 'sql_edit') and isinstance(self.sql_edit, CompletableTextEdit):
            self.sql_edit.completer = self.completer
    
    def insert_completion(self, completion: str):
        """插入完成词"""
        if not completion:
            return
        
        # 确保 completion 是字符串
        completion = str(completion).strip()
        if not completion:
            return
        
        tc = self.sql_edit.textCursor()
        text = self.sql_edit.toPlainText()
        cursor_pos = tc.position()
        
        # 向前查找单词边界（支持字母、数字、下划线、点号、反引号）
        start = cursor_pos
        while start > 0:
            char = text[start - 1]
            if not (char.isalnum() or char in ['_', '.', '`']):
                break
            start -= 1
        
        # 获取当前前缀（包括反引号）
        prefix = text[start:cursor_pos]
        
        # 选择要替换的文本（从 start 到 cursor_pos）
        tc.setPosition(start, QTextCursor.MoveMode.MoveAnchor)
        tc.setPosition(cursor_pos, QTextCursor.MoveMode.KeepAnchor)
        
        # 插入完成词（这会替换选中的文本）
        tc.insertText(completion)
        
        # 移动光标到插入文本的末尾
        new_pos = start + len(completion)
        tc.setPosition(new_pos)
        self.sql_edit.setTextCursor(tc)
        
        # 确保编辑器获得焦点
        self.sql_edit.setFocus()
    
    def get_completion_prefix(self) -> str:
        """获取当前光标位置的完成前缀"""
        tc = self.sql_edit.textCursor()
        text = self.sql_edit.toPlainText()
        cursor_pos = tc.position()
        
        # 向前查找单词边界（支持字母、数字、下划线、点号）
        start = cursor_pos
        while start > 0:
            char = text[start - 1]
            if not (char.isalnum() or char in ['_', '.', '`']):
                break
            start -= 1
        
        # 提取前缀
        prefix = text[start:cursor_pos]
        # 移除反引号（如果存在）
        prefix = prefix.replace('`', '')
        return prefix
    
    def on_text_changed(self):
        """文本变化时的处理"""
        # 自动触发完成（输入时）
        if self.completer:
            prefix = self.get_completion_prefix()
            if len(prefix) >= 1:  # 输入至少1个字符后自动提示
                self.completer.setCompletionPrefix(prefix)
                if self.completer.completionCount() > 0:
                    # 有匹配项时显示
                    cr = self.sql_edit.cursorRect()
                    cr.setWidth(self.completer.popup().sizeHintForColumn(0) +
                               self.completer.popup().verticalScrollBar().sizeHint().width())
                    self.completer.complete(cr)
                else:
                    # 没有匹配项时隐藏
                    self.completer.popup().hide()
            else:
                # 前缀为空时隐藏
                self.completer.popup().hide()
    
    def get_sql(self) -> str:
        """获取SQL文本"""
        return self.sql_edit.toPlainText().strip()
    
    def set_sql(self, sql: str):
        """设置SQL文本"""
        self.sql_edit.setPlainText(sql)
    
    def clear_sql(self):
        """清空SQL"""
        self.sql_edit.clear()
        self.ai_input.clear()
        self.status_label.setText("已清空")
    
    def generate_sql_from_ai(self):
        """使用AI生成SQL（分步交互：先获取表名，AI选择表，再获取表结构，最后生成SQL）"""
        # 检查是否正在运行，如果是则取消
        if self._is_generating():
            self._cancel_generation()
            return
        
        user_query = self.ai_input.toPlainText().strip()
        if not user_query:
            self.set_status("错误: 请输入中文描述", is_error=True)
            return
        
        # 更新按钮为"取消"状态
        self.generate_btn.setText("取消")
        self.generate_btn.setEnabled(True)
        self.status_label.setText("步骤1/4: 正在获取表名列表...")
        
        # 停止所有正在运行的工作线程
        self._stop_all_workers()
        
        # 初始化AI客户端（如果还没有初始化，从主窗口获取）
        if not self.ai_client:
            try:
                # 尝试从主窗口获取当前选择的模型
                if hasattr(self, '_main_window') and self._main_window and self._main_window.current_ai_model_id:
                    from src.core.ai_model_storage import AIModelStorage
                    storage = AIModelStorage()
                    model_config = next((m for m in storage.load_models() if m.id == self._main_window.current_ai_model_id), None)
                    if model_config:
                        self.ai_client = AIClient(
                            api_key=model_config.api_key.get_secret_value(),
                            base_url=model_config.get_base_url(),
                            default_model=model_config.default_model,
                            turbo_model=model_config.turbo_model
                        )
                        # 设置模型ID以便统计
                        self.ai_client._current_model_id = model_config.id
                    else:
                        self.ai_client = AIClient()  # 将从配置中自动加载默认模型
                else:
                    self.ai_client = AIClient()  # 将从配置中自动加载默认模型
            except Exception as e:
                self.generate_btn.setEnabled(True)
                self.generate_btn.setText("直接查询")
                self.set_status(f"AI初始化失败: {str(e)}", is_error=True)
                return
        
        # 第一步：获取所有表名列表
        if self.db_manager and self.current_connection_id:
            # 获取连接信息
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                # 显示状态
                self.set_status("步骤1/4: 正在获取表名列表...", timeout=0)  # timeout=0 表示永久显示，直到下次更新
                # 使用工作线程获取表名列表，避免阻塞
                from src.gui.workers.table_list_worker import TableListWorker
                
                self.table_list_worker = TableListWorker(
                    connection.get_connection_string(),
                    connection.get_connect_args(),
                    connection_id=self.current_connection_id,  # 传入连接ID用于缓存
                    database=self.current_database  # 传入当前数据库，仅获取该数据库的表
                )
                self.table_list_worker.tables_ready.connect(self.on_tables_ready)
                self.table_list_worker.start()
                # 等待表名列表获取完成
                return
        
        # 如果没有数据库连接，直接生成SQL（不带表结构）
        self.set_status("正在生成SQL...", timeout=0)
        self._start_ai_generation(user_query, "", [])
    
    def _is_generating(self):
        """检查是否正在生成SQL"""
        workers = [
            self.ai_worker,
            self.schema_worker,
            self.table_list_worker,
            self.ai_table_selector_worker,
            self.ai_enum_selector_worker,
            self.enum_values_worker,
        ]
        return any(worker and worker.isRunning() for worker in workers)
    
    def _is_executing(self):
        """检查是否正在执行SQL（通过主窗口的query_worker）"""
        if hasattr(self, '_main_window') and self._main_window:
            if hasattr(self._main_window, 'query_worker') and self._main_window.query_worker:
                return self._main_window.query_worker.isRunning()
        return False
    
    def _cancel_generation(self):
        """取消SQL生成"""
        self._stop_all_workers()
        self.generate_btn.setText("直接查询")
        self.set_status("已取消", timeout=2000)
    
    def _cancel_execution(self):
        """取消SQL执行"""
        if hasattr(self, '_main_window') and self._main_window:
            if hasattr(self._main_window, 'query_worker') and self._main_window.query_worker:
                if self._main_window.query_worker.isRunning():
                    self._main_window.query_worker.stop()
                    if not self._main_window.query_worker.wait(2000):
                        self._main_window.query_worker.terminate()
                        self._main_window.query_worker.wait(500)
                    try:
                        self._main_window.query_worker.query_finished.disconnect()
                        self._main_window.query_worker.query_progress.disconnect()
                        self._main_window.query_worker.multi_query_finished.disconnect()
                    except:
                        pass
                    self._main_window.query_worker.deleteLater()
                    self._main_window.query_worker = None
        self.execute_btn.setText("执行 (F5)")
        self.set_status("已取消", timeout=2000)
    
    def _stop_all_workers(self):
        """停止所有正在运行的工作线程"""
        workers = [
            ('ai_worker', self.ai_worker),
            ('schema_worker', self.schema_worker),
            ('table_list_worker', self.table_list_worker),
            ('ai_table_selector_worker', self.ai_table_selector_worker),
            ('ai_enum_selector_worker', self.ai_enum_selector_worker),
            ('enum_values_worker', self.enum_values_worker),
        ]
        
        for name, worker in workers:
            if worker and worker.isRunning():
                worker.stop()
                worker.wait(1000)
                if worker.isRunning():
                    worker.terminate()
                    worker.wait(500)
                worker.deleteLater()
                setattr(self, name, None)
    
    def on_tables_ready(self, table_names: list):
        """表名列表获取完成回调（第二步：AI选择表）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"表名列表获取完成，共 {len(table_names)} 个表")
        
        if not table_names:
            logger.warning("表名列表为空，无法继续")
            self.generate_btn.setEnabled(True)
            self.generate_btn.setText("直接查询")
            self.set_status("错误: 无法获取表名列表", is_error=True)
            return
        
        user_query = self.ai_input.toPlainText().strip()
        self.set_status(f"步骤2/4: AI正在选择相关表（从 {len(table_names)} 个表中）...", timeout=0)
        
        # 获取当前SQL编辑器中的SQL（如果用户已经在查看某个表，AI可以优先选择该表）
        current_sql = self.sql_edit.toPlainText().strip() if hasattr(self, 'sql_edit') else ""
        
        # 使用AI选择相关表
        from src.gui.workers.ai_table_selector_worker import AITableSelectorWorker
        
        self.ai_table_selector_worker = AITableSelectorWorker(
            self.ai_client,
            user_query,
            table_names,
            current_sql  # 传递当前SQL，让AI知道用户可能已经在查看某个表
        )
        self.ai_table_selector_worker.tables_selected.connect(self.on_tables_selected)
        self.ai_table_selector_worker.error_occurred.connect(self.on_ai_error)
        self.ai_table_selector_worker.start()
        
        # 清理表名列表worker
        if self.table_list_worker:
            self.table_list_worker.deleteLater()
            self.table_list_worker = None
    
    def on_tables_selected(self, selected_tables: list):
        """AI选择表完成回调（第二步：获取选中表的结构，让AI选择枚举字段）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"AI选择了 {len(selected_tables)} 个表: {selected_tables}")
        
        if not selected_tables:
            logger.warning("AI未选择任何表，使用空表结构生成SQL")
            user_query = self.ai_input.toPlainText().strip()
            self._start_ai_generation(user_query, "", [])
            return
        
        # 检查配置，决定步骤数
        from src.core.prompt_config import PromptStorage
        prompt_storage = PromptStorage()
        prompt_config = prompt_storage.load_prompts()
        config_allows_query = prompt_config.query_enum_values
        
        if config_allows_query:
            self.set_status(f"步骤3/4: 正在获取 {len(selected_tables)} 个表的结构...", timeout=0)
        else:
            self.set_status(f"步骤3/3: 正在获取 {len(selected_tables)} 个表的结构...", timeout=0)
        
        # 获取选中表的结构（不包含枚举值）
        if self.db_manager and self.current_connection_id:
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                from src.gui.workers.schema_worker import SchemaWorker
                
                # 只获取选中表的结构（仅针对当前数据库）
                self.schema_worker = SchemaWorker(
                    connection.get_connection_string(),
                    connection.get_connect_args(),
                    selected_tables=selected_tables,  # 只获取选中的表
                    connection_id=self.current_connection_id,  # 传入连接ID用于缓存
                    database=self.current_database  # 传入当前数据库，仅获取该数据库的表结构
                )
                self.schema_worker.schema_ready.connect(self.on_schema_ready_for_enum_selection)
                self.schema_worker.start()
                
                # 清理AI选表worker
                if self.ai_table_selector_worker:
                    self.ai_table_selector_worker.deleteLater()
                    self.ai_table_selector_worker = None
                return
        
        # 如果没有连接，直接生成SQL
        user_query = self.ai_input.toPlainText().strip()
        self._start_ai_generation(user_query, "", selected_tables)
    
    def on_schema_ready_for_enum_selection(self, table_schema: str, table_names: list):
        """表结构获取完成回调（第二步：根据配置决定是否让AI选择枚举字段）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"表结构获取完成，表结构长度: {len(table_schema) if table_schema else 0}")
        
        # 保存表结构，后续使用
        self._temp_table_schema = table_schema
        self._temp_table_names = table_names
        
        # 清理schema worker
        if self.schema_worker:
            self.schema_worker.deleteLater()
            self.schema_worker = None
        
        if not table_schema or not table_schema.strip():
            logger.warning("表结构为空，直接生成SQL")
            user_query = self.ai_input.toPlainText().strip()
            self.set_status("正在生成SQL...", timeout=0)
            self._start_ai_generation(user_query, "", table_names if table_names else [])
            return
        
        # 检查配置：是否允许查询枚举值
        from src.core.prompt_config import PromptStorage
        prompt_storage = PromptStorage()
        prompt_config = prompt_storage.load_prompts()
        config_allows_query = prompt_config.query_enum_values
        
        # 如果配置不允许查询枚举值，直接跳过枚举字段识别，生成SQL
        if not config_allows_query:
            logger.info("配置不允许查询枚举值，跳过枚举字段识别，直接生成SQL")
            self.set_status("步骤3/3: 正在生成SQL...", timeout=0)
            user_query = self.ai_input.toPlainText().strip()
            self._start_ai_generation(user_query, table_schema, table_names)
            return
        
        # 配置允许查询枚举值，使用AI选择枚举字段
        self.set_status("步骤4/4: AI正在识别枚举字段并判断是否需要查询...", timeout=0)
        
        from src.gui.workers.ai_enum_selector_worker import AIEnumSelectorWorker
        
        user_query = self.ai_input.toPlainText().strip()
        self.ai_enum_selector_worker = AIEnumSelectorWorker(
            self.ai_client,
            user_query,
            table_schema
        )
        self.ai_enum_selector_worker.enum_selection_ready.connect(self.on_enum_selection_ready)
        self.ai_enum_selector_worker.error_occurred.connect(self.on_ai_error)
        self.ai_enum_selector_worker.start()
    
    def on_enum_selection_ready(self, enum_columns: dict, should_query: bool):
        """AI选择枚举字段并判断完成回调（第三步：根据配置和判断结果决定是否查询枚举值）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"AI选择了枚举字段: {enum_columns}")
        logger.info(f"AI判断结果: {'需要查询枚举值' if should_query else '不需要查询枚举值'}")
        
        # 检查配置：是否允许查询枚举值
        from src.core.prompt_config import PromptStorage
        prompt_storage = PromptStorage()
        prompt_config = prompt_storage.load_prompts()
        config_allows_query = prompt_config.query_enum_values
        
        logger.info(f"配置允许查询枚举值: {config_allows_query}")
        
        # 清理AI选枚举字段worker
        if self.ai_enum_selector_worker:
            self.ai_enum_selector_worker.deleteLater()
            self.ai_enum_selector_worker = None
        
        # 如果没有选择枚举字段，直接使用表结构生成SQL
        if not enum_columns:
            logger.info("AI未选择任何枚举字段，直接使用表结构生成SQL")
            user_query = self.ai_input.toPlainText().strip()
            self.set_status("正在生成SQL...", timeout=0)
            self._start_ai_generation(user_query, self._temp_table_schema, self._temp_table_names)
            return
        
        # 如果配置不允许查询枚举值，直接使用表结构生成SQL
        if not config_allows_query:
            logger.info("配置不允许查询枚举值，直接使用表结构生成SQL")
            user_query = self.ai_input.toPlainText().strip()
            self.set_status("正在生成SQL...", timeout=0)
            self._start_ai_generation(user_query, self._temp_table_schema, self._temp_table_names)
            return
        
        # 如果AI判断不需要查询枚举值，直接使用表结构生成SQL
        if not should_query:
            logger.info("AI判断不需要查询枚举值，直接使用表结构生成SQL")
            user_query = self.ai_input.toPlainText().strip()
            self.set_status("正在生成SQL...", timeout=0)
            self._start_ai_generation(user_query, self._temp_table_schema, self._temp_table_names)
            return
        
        # 需要查询枚举值（配置允许且AI判断需要）
        enum_count = sum(len(cols) for cols in enum_columns.values())
        self.set_status(f"正在查询 {enum_count} 个枚举字段的值...", timeout=0)
        
        # 查询选中枚举字段的值
        if self.db_manager and self.current_connection_id:
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                from src.gui.workers.enum_values_worker import EnumValuesWorker
                
                self.enum_values_worker = EnumValuesWorker(
                    connection.get_connection_string(),
                    connection.get_connect_args(),
                    self._temp_table_schema,
                    enum_columns
                )
                self.enum_values_worker.enum_values_ready.connect(self.on_enum_values_ready)
                self.enum_values_worker.start()
                return
        
        # 如果没有连接，直接使用表结构生成SQL
        user_query = self.ai_input.toPlainText().strip()
        self._start_ai_generation(user_query, self._temp_table_schema, self._temp_table_names)
    
    def on_enum_values_ready(self, enhanced_schema: str):
        """枚举值查询完成回调（最后一步：生成SQL）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"枚举值查询完成，增强后的表结构长度: {len(enhanced_schema)}")
        
        self.set_status("正在生成SQL...", timeout=0)
        
        user_query = self.ai_input.toPlainText().strip()
        self._start_ai_generation(user_query, enhanced_schema, self._temp_table_names)
        
        # 清理worker
        if self.enum_values_worker:
            self.enum_values_worker.deleteLater()
            self.enum_values_worker = None
    
    def on_schema_ready(self, table_schema: str, table_names: list):
        """表结构获取完成回调（旧版本兼容，实际不再使用）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"表结构获取完成，表结构长度: {len(table_schema) if table_schema else 0}，表数量: {len(table_names) if table_names else 0}")
        if table_schema and table_schema.strip():
            logger.info(f"表结构前500字符: {table_schema[:500]}")
        else:
            logger.warning("⚠️ 表结构为空或只包含空白字符！")
            # 如果表结构为空，尝试重新获取或提示用户
            if self.db_manager and self.current_connection_id:
                logger.warning("表结构获取失败，但连接存在，可能需要检查数据库连接或权限")
        
        self.status_label.setText("正在生成SQL...")
        
        user_query = self.ai_input.toPlainText().strip()
        # 确保传递非空的表结构（如果为空则传递空字符串）
        self._start_ai_generation(user_query, table_schema if table_schema else "", table_names if table_names else [])
        
        # 清理工作线程
        if hasattr(self, 'schema_worker') and self.schema_worker:
            self.schema_worker.deleteLater()
            self.schema_worker = None
    
    def _start_ai_generation(self, user_query: str, table_schema: str, table_names: list = None):
        """启动AI生成SQL"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"启动AI生成SQL，表结构是否为空: {not table_schema}, 表名数量: {len(table_names) if table_names else 0}")
        
        # 更新状态栏
        self.set_status("AI正在生成SQL...", timeout=0)
        
        # 获取数据库类型
        db_type = None
        if self.db_manager and self.current_connection_id:
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                db_type = connection.db_type.value
                logger.info(f"数据库类型: {db_type}")
        
        # 获取当前SQL编辑器中的SQL（如果用户已经在查看某个表，AI可以基于此SQL进行修改）
        current_sql = self.sql_edit.toPlainText().strip() if hasattr(self, 'sql_edit') else ""
        
        # 创建并启动AI工作线程
        self.ai_worker = AIWorker(self.ai_client, user_query, table_schema, table_names or [], db_type, current_sql)
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.start()
    
    def on_sql_generated(self, sql: str):
        """AI生成SQL完成回调"""
        # 将生成的SQL显示在SQL编辑器中
        self.sql_edit.setPlainText(sql)
        
        # 恢复"直接查询"按钮状态
        self.generate_btn.setEnabled(True)
        self.generate_btn.setText("直接查询")
        
        # 判断SQL类型：只有查询语句才自动执行，增删改需要用户手动执行
        sql_upper = sql.strip().upper()
        is_query = sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))
        
        if is_query:
            # 查询语句：自动执行
            self.set_status("SQL生成成功，正在执行查询...", timeout=0)
            # 更新执行按钮为"取消"状态
            self.execute_btn.setText("取消")
            self.execute_signal.emit(sql)
        else:
            # 增删改语句：不自动执行，提示用户手动执行
            self.set_status("SQL生成成功，请点击\"执行\"按钮执行（增删改操作需要确认后执行）", timeout=5000)
        
        # 清理工作线程
        if self.ai_worker:
            self.ai_worker.deleteLater()
            self.ai_worker = None
    
    def on_ai_error(self, error: str):
        """AI生成SQL错误回调"""
        # 恢复按钮状态
        self.generate_btn.setEnabled(True)
        self.generate_btn.setText("直接查询")
        
        # 显示错误信息
        self.set_status(f"AI生成失败: {error}", is_error=True)
        
        # 清理工作线程
        if self.ai_worker:
            self.ai_worker.deleteLater()
            self.ai_worker = None
    
    def execute_sql(self):
        """执行SQL"""
        sql = self.get_sql()
        if not sql:
            self.status_label.setText("错误: SQL语句为空")
            return
        
        self.status_label.setText("执行中...")
        self.execute_signal.emit(sql)
    
    def set_status(self, message: str, is_error: bool = False, timeout: int = None):
        """设置状态信息（显示到主窗口状态栏）"""
        # 显示到主窗口状态栏
        if hasattr(self, '_main_window') and self._main_window:
            if hasattr(self._main_window, 'statusBar'):
                # 如果没有指定超时时间，错误信息显示5秒，其他信息显示3秒
                if timeout is None:
                    timeout = 5000 if is_error else 3000
                self._main_window.statusBar().showMessage(message, timeout)
        # 保留本地状态标签的更新（虽然已隐藏），以防需要调试
        if is_error:
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
        else:
            self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.setText(message)
    
    def eventFilter(self, obj, event):
        """事件过滤器，用于处理按键事件"""
        if obj == self.sql_edit and event.type() == event.Type.KeyPress:
            key_event = event
            
            # F5 执行
            if key_event.key() == Qt.Key.Key_F5:
                self.execute_sql()
                return True
            
            # 如果自动完成弹窗可见，处理特殊按键
            if self.completer and self.completer.popup().isVisible():
                # Enter 或 Return 键插入完成
                if key_event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return]:
                    # 确保有选中项
                    if self.completer.currentRow() < 0:
                        self.completer.setCurrentRow(0)
                    
                    # 获取当前选中的完成项
                    current_completion = self.completer.currentCompletion()
                    
                    # 如果 currentCompletion() 返回空，尝试从模型获取
                    if not current_completion and self.completer.currentRow() >= 0:
                        model = self.completer.model()
                        if model:
                            index = model.index(self.completer.currentRow(), 0)
                            current_completion = model.data(index, Qt.ItemDataRole.DisplayRole)
                    
                    if current_completion:
                        # 插入完成项
                        self.insert_completion(str(current_completion))
                        # 隐藏弹窗
                        self.completer.popup().hide()
                    return True
                
                # Tab 键插入完成
                if key_event.key() == Qt.Key.Key_Tab:
                    if self.completer.currentRow() < 0:
                        self.completer.setCurrentRow(0)
                    current_completion = self.completer.currentCompletion()
                    if not current_completion and self.completer.currentRow() >= 0:
                        model = self.completer.model()
                        if model:
                            index = model.index(self.completer.currentRow(), 0)
                            current_completion = model.data(index, Qt.ItemDataRole.DisplayRole)
                    if current_completion:
                        self.insert_completion(str(current_completion))
                        self.completer.popup().hide()
                    return True
                
                # Escape 键关闭自动完成
                if key_event.key() == Qt.Key.Key_Escape:
                    self.completer.popup().hide()
                    return True
                
                # 上下箭头键导航（让 QCompleter 自己处理）
                if key_event.key() in [Qt.Key.Key_Up, Qt.Key.Key_Down]:
                    # 让 QCompleter 处理导航
                    return False
            
            # 其他按键，让编辑器正常处理
            # 文本变化后会自动触发完成（通过 textChanged 信号）
            return False
        
        return super().eventFilter(obj, event)
    
    def keyPressEvent(self, event: QKeyEvent):
        """键盘事件（保留用于其他快捷键）"""
        if event.key() == Qt.Key.Key_F5:
            self.execute_sql()
        else:
            super().keyPressEvent(event)

