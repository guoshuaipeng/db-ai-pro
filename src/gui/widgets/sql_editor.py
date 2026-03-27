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
    QFrame,
    QMenu,
)
from PyQt6.QtCore import Qt, pyqtSignal, QStringListModel, QModelIndex
from PyQt6.QtGui import QFont, QTextCursor, QKeyEvent, QAction
from typing import List, Optional, Callable
from src.core.ai_client import AIClient
from src.utils.thread_manager import safe_delete_thread
import re
import logging

logger = logging.getLogger(__name__)

# 卡片与按钮样式（与 app_theme 色系一致）
_EDITOR_CARD_STYLE = """
    QFrame#sqlEditorCard {
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
    }
    QLabel#sqlEditorCardTitle {
        color: #374151;
        font-size: 12px;
        font-weight: 600;
        padding: 0 2px 4px 2px;
    }
"""
_BTN_PRIMARY_GREEN = """
    QPushButton {
        background-color: #16a34a;
        color: #ffffff;
        padding: 6px 18px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
    }
    QPushButton:hover { background-color: #15803d; }
    QPushButton:pressed { background-color: #166534; }
"""
_BTN_PRIMARY_BLUE = """
    QPushButton {
        background-color: #2563eb;
        color: #ffffff;
        padding: 6px 16px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
    }
    QPushButton:hover { background-color: #1d4ed8; }
    QPushButton:pressed { background-color: #1e40af; }
"""
_BTN_SECONDARY = """
    QPushButton {
        background-color: #ffffff;
        color: #374151;
        padding: 5px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
    }
    QPushButton:hover {
        background-color: #f9fafb;
        border-color: #9ca3af;
    }
"""

_EDITOR_CONTEXT_MENU_QSS = """
    QMenu {
        padding: 4px 2px;
    }
    QMenu::item:selected {
        background-color: #e0f2fe;
        color: #111827;
    }
    QMenu::separator {
        height: 1px;
        margin: 4px 8px;
        background: #e5e7eb;
    }
"""


def _style_plain_text_context_menu(menu: QMenu) -> None:
    menu.setToolTipsVisible(True)
    menu.setStyleSheet(_EDITOR_CONTEXT_MENU_QSS)


class ZhPlainTextEdit(QPlainTextEdit):
    """带中文右键菜单的纯文本编辑器（替代系统默认英文菜单）。"""

    def contextMenuEvent(self, event):
        menu = QMenu(self)
        _style_plain_text_context_menu(menu)

        undo = QAction("撤销", self)
        undo.setShortcut("Ctrl+Z")
        undo.setEnabled(self.document().isUndoAvailable())
        undo.triggered.connect(self.undo)
        menu.addAction(undo)

        redo = QAction("重做", self)
        redo.setShortcuts(["Ctrl+Y", "Ctrl+Shift+Z"])
        redo.setEnabled(self.document().isRedoAvailable())
        redo.triggered.connect(self.redo)
        menu.addAction(redo)

        menu.addSeparator()

        cut = QAction("剪切", self)
        cut.setShortcut("Ctrl+X")
        cut.setEnabled(self.textCursor().hasSelection())
        cut.triggered.connect(self.cut)
        menu.addAction(cut)

        copy = QAction("复制", self)
        copy.setShortcut("Ctrl+C")
        copy.setEnabled(self.textCursor().hasSelection())
        copy.triggered.connect(self.copy)
        menu.addAction(copy)

        paste = QAction("粘贴", self)
        paste.setShortcut("Ctrl+V")
        paste.setEnabled(self.canPaste())
        paste.triggered.connect(self.paste)
        menu.addAction(paste)

        menu.addSeparator()

        select_all = QAction("全选", self)
        select_all.setShortcut("Ctrl+A")
        select_all.triggered.connect(self.selectAll)
        menu.addAction(select_all)

        # 允许子类或外部注入附加菜单项（例如 SQL 收藏）
        self._append_extra_context_actions(menu)

        menu.exec(event.globalPos())

    def _append_extra_context_actions(self, menu: QMenu) -> None:
        """扩展点：默认无附加动作。"""
        return


class CompletableTextEdit(ZhPlainTextEdit):
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
        self._loading_databases = False  # 标记是否正在加载数据库列表（避免递归）
        self.init_ui()
    
    def set_database_info(self, db_manager, connection_id: str, database: Optional[str] = None):
        """设置数据库信息（用于 AI 生成 SQL 时传入连接上下文）"""
        self.db_manager = db_manager
        self.current_connection_id = connection_id
        self.current_database = database

    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)
        self.setLayout(layout)
        self.setStyleSheet(_EDITOR_CARD_STYLE)
        
        # 创建水平分割器，将界面分为两部分
        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.setChildrenCollapsible(False)
        
        # 左侧：AI 卡片
        ai_frame = QFrame()
        ai_frame.setObjectName("sqlEditorCard")
        ai_layout = QVBoxLayout()
        ai_layout.setContentsMargins(12, 10, 12, 12)
        ai_layout.setSpacing(8)
        ai_frame.setLayout(ai_layout)
        
        ai_label = QLabel("AI 智能查询")
        ai_label.setObjectName("sqlEditorCardTitle")
        ai_layout.addWidget(ai_label)
        
        # 使用QPlainTextEdit而不是QTextEdit，确保只支持纯文本，不支持格式
        self.ai_input = ZhPlainTextEdit()
        self.ai_input.setPlaceholderText("输入中文描述，AI将生成SQL并执行（Enter查询，Shift+Enter换行）")
        self.ai_input.setFont(QFont("Microsoft YaHei", 10))
        self.ai_input.installEventFilter(self)  # 安装事件过滤器，用于处理回车键
        ai_layout.addWidget(self.ai_input)
        
        # 按钮放在输入框下面
        ai_btn_layout = QHBoxLayout()
        self.generate_btn = QPushButton("直接查询")
        self.generate_btn.setStyleSheet(_BTN_PRIMARY_BLUE)
        self.generate_btn.clicked.connect(self.generate_sql_from_ai)
        ai_btn_layout.addWidget(self.generate_btn)
        ai_btn_layout.addStretch()
        ai_layout.addLayout(ai_btn_layout)
        
        splitter.addWidget(ai_frame)
        splitter.setStretchFactor(0, 1)
        
        # 右侧：SQL 卡片
        sql_frame = QFrame()
        sql_frame.setObjectName("sqlEditorCard")
        sql_layout = QVBoxLayout()
        sql_layout.setContentsMargins(12, 10, 12, 12)
        sql_layout.setSpacing(8)
        sql_frame.setLayout(sql_layout)
        
        sql_label = QLabel("SQL 编辑器")
        sql_label.setObjectName("sqlEditorCardTitle")
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
        self.sql_edit._append_extra_context_actions = self._append_sql_editor_context_actions
        
        sql_layout.addWidget(self.sql_edit)
        
        # 按钮：主操作「执行」+ 次要操作
        sql_btn_layout = QHBoxLayout()
        sql_btn_layout.setSpacing(8)
        self.execute_btn = QPushButton("执行 (F5)")
        self.execute_btn.clicked.connect(self.execute_sql)
        self.execute_btn.setStyleSheet(_BTN_PRIMARY_GREEN)
        self.execute_btn.setMinimumHeight(32)
        
        self.clear_btn = QPushButton("清空")
        self.clear_btn.clicked.connect(self.clear_sql)
        self.clear_btn.setStyleSheet(_BTN_SECONDARY)

        self.format_btn = QPushButton("美化")
        self.format_btn.setToolTip("格式化 SQL")
        self.format_btn.clicked.connect(self.format_sql)
        self.format_btn.setStyleSheet(_BTN_SECONDARY)

        self.history_btn = QPushButton("历史")
        self.history_btn.setToolTip("查看最近的查询历史")
        self.history_btn.clicked.connect(self.show_query_history)
        self.history_btn.setStyleSheet(_BTN_SECONDARY)
        
        sql_btn_layout.addWidget(self.execute_btn)
        sql_btn_layout.addStretch(1)
        sql_btn_layout.addWidget(self.format_btn)
        sql_btn_layout.addWidget(self.clear_btn)
        sql_btn_layout.addWidget(self.history_btn)
        sql_layout.addLayout(sql_btn_layout)
        
        splitter.addWidget(sql_frame)
        splitter.setStretchFactor(1, 3)
        
        # 默认约 32% / 68%，SQL 区域更宽
        splitter.setSizes([340, 760])
        
        layout.addWidget(splitter)
        
        # 状态栏（已隐藏，状态信息显示到主窗口状态栏）
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        self.status_label.hide()  # 隐藏状态标签
        
        # 初始化AI客户端和工作线程
        self.ai_client = None
        self.ai_worker = None          # QueryLangGraphWorker
        self.table_list_worker = None  # TableListWorker（获取表名列表）
        self._all_table_names = []     # 保存所有表名列表

        # SQL执行错误自动修复状态
        self._auto_fix_retries = 0     # 当前已自动重试次数
        self._MAX_AUTO_FIX = 1         # 最多自动修复次数（防死循环）
        self._last_user_query = ""     # 保存最后一次 AI 查询（修复时带上）
    
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

    def show_query_history(self):
        """显示查询历史对话框"""
        try:
            from src.gui.dialogs.query_history_dialog import QueryHistoryDialog
        except Exception as e:
            logger.error(f"导入查询历史对话框失败: {e}")
            self.set_status("查询历史对话框加载失败", is_error=True)
            return

        parent = getattr(self, "_main_window", self)
        dlg = QueryHistoryDialog(
            parent=parent,
            current_connection_id=self.current_connection_id,
            current_database=self.current_database,
        )
        if dlg.exec():
            sql = dlg.get_selected_sql()
            if sql:
                self.set_sql(sql)

    def add_current_sql_to_favorites(self):
        """将编辑区当前 SQL 加入收藏。"""
        sql = self.get_sql()
        if not sql:
            self.set_status("没有可收藏的 SQL", is_error=True)
            return
        if not self.current_connection_id:
            self.set_status("请先选择数据库连接", is_error=True)
            return

        try:
            from src.core.config_db import get_config_db
            from src.utils.toast_manager import show_success

            config_db = get_config_db()
            history_id = config_db.add_query_history(
                connection_id=self.current_connection_id,
                database_name=self.current_database or "",
                sql=sql,
                source="MANUAL",
                duration_ms=0,
                title="",
            )
            config_db.set_query_history_favorite(history_id, True)
            show_success("已加入查询收藏")
            self.set_status("已加入查询收藏", timeout=3000)
        except Exception as e:
            try:
                from src.utils.toast_manager import show_error
                show_error(f"加入收藏失败: {e}")
            except Exception:
                pass
            self.set_status(f"加入收藏失败: {e}", is_error=True)

    def insert_from_favorites(self):
        """从收藏中选择 SQL 并插入编辑区。"""
        try:
            from src.gui.dialogs.query_history_dialog import QueryHistoryDialog
        except Exception as e:
            logger.error(f"导入查询历史对话框失败: {e}")
            self.set_status("查询历史对话框加载失败", is_error=True)
            return

        parent = getattr(self, "_main_window", self)
        dlg = QueryHistoryDialog(
            parent=parent,
            current_connection_id=self.current_connection_id,
            current_database=self.current_database,
        )
        dlg.fav_only_checkbox.setChecked(True)

        if dlg.exec():
            sql = dlg.get_selected_sql()
            if sql:
                self.set_sql(sql)
                self.set_status("已从收藏插入 SQL", timeout=3000)

    def _append_sql_editor_context_actions(self, menu: QMenu) -> None:
        """给 SQL 编辑区右键菜单追加收藏入口。"""
        menu.addSeparator()

        add_fav_action = QAction("加入收藏（当前 SQL）", self)
        add_fav_action.setEnabled(bool(self.get_sql()))
        add_fav_action.triggered.connect(self.add_current_sql_to_favorites)
        menu.addAction(add_fav_action)

        insert_fav_action = QAction("从收藏插入 SQL", self)
        insert_fav_action.triggered.connect(self.insert_from_favorites)
        menu.addAction(insert_fav_action)

    def format_sql(self):
        """SQL 美化（优先使用 sqlparse，不可用时回退到轻量级格式化）"""
        sql = self.get_sql()
        if not sql:
            self.set_status("错误: SQL语句为空", is_error=True)
            return

        try:
            # 优先尝试使用 sqlparse
            import sqlparse
            formatted = sqlparse.format(
                sql,
                reindent=True,
                keyword_case='upper',
                indent_width=2,
                wrap_after=80,
                comma_first=False
            )
            if formatted.strip():
                self.set_sql(formatted.strip())
                self.set_status("SQL 已美化 (使用 sqlparse)", timeout=2000)
                return
        except ImportError:
            # sqlparse 未安装，使用轻量级格式化
            logger.debug("sqlparse 未安装，使用轻量级格式化")
        except Exception as e:
            # sqlparse 格式化失败，回退到轻量级格式化
            logger.warning(f"sqlparse 格式化失败: {e}，使用轻量级格式化")

        # 回退到轻量级格式化
        formatted = self._format_sql_text(sql)
        if formatted.strip():
            self.set_sql(formatted)
            self.set_status("SQL 已美化", timeout=2000)
        else:
            self.set_status("错误: SQL 美化失败", is_error=True)

    def _format_sql_text(self, sql: str) -> str:
        """保持字符串字面量不变的前提下，格式化 SQL（轻量级格式化，作为 fallback）"""
        segments = self._split_sql_segments(sql)
        formatted_parts = []
        for text, is_literal in segments:
            if is_literal:
                formatted_parts.append(text)
            else:
                formatted_parts.append(self._format_sql_segment(text))
        combined = ''.join(formatted_parts)
        # 处理多语句的分隔
        combined = re.sub(r';\s*', ';\n', combined)
        # 清理多余空行
        lines = [line.strip() for line in combined.splitlines()]
        return '\n'.join(line for line in lines if line)

    def _split_sql_segments(self, sql: str):
        """按字符串字面量拆分，避免修改字符串内容"""
        segments = []
        buf = []
        in_quote = None
        i = 0
        while i < len(sql):
            ch = sql[i]
            if in_quote:
                buf.append(ch)
                if ch == in_quote:
                    if in_quote in ("'", '"'):
                        # 处理双引号/单引号的转义
                        if i + 1 < len(sql) and sql[i + 1] == in_quote:
                            buf.append(sql[i + 1])
                            i += 1
                            i += 1
                            continue
                        # 处理反斜杠转义
                        backslashes = 0
                        j = i - 1
                        while j >= 0 and sql[j] == '\\':
                            backslashes += 1
                            j -= 1
                        if backslashes % 2 == 1:
                            i += 1
                            continue
                    segments.append((''.join(buf), True))
                    buf = []
                    in_quote = None
            else:
                if ch in ("'", '"', '`'):
                    if buf:
                        segments.append((''.join(buf), False))
                        buf = []
                    in_quote = ch
                    buf.append(ch)
                else:
                    buf.append(ch)
            i += 1
        if buf:
            segments.append((''.join(buf), in_quote is not None))
        return segments

    def _format_sql_segment(self, text: str) -> str:
        """格式化非字符串片段"""
        if not text:
            return text

        # 归一化空白
        text = re.sub(r'\s+', ' ', text).strip()

        # 关键字大写
        keywords = [
            "select", "from", "where", "group by", "order by", "having",
            "limit", "offset", "insert into", "update", "delete from",
            "values", "set", "join", "left join", "right join", "inner join",
            "outer join", "full join", "cross join", "on", "union", "union all",
            "distinct", "into", "as"
        ]
        for kw in sorted(keywords, key=len, reverse=True):
            pattern = r'\b' + re.escape(kw) + r'\b'
            text = re.sub(pattern, kw.upper(), text, flags=re.IGNORECASE)

        # 主要子句换行
        clauses = [
            "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING",
            "LIMIT", "OFFSET", "INSERT INTO", "UPDATE", "DELETE FROM",
            "VALUES", "SET", "UNION ALL", "UNION",
            "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN",
            "FULL JOIN", "CROSS JOIN", "JOIN", "ON"
        ]
        for clause in clauses:
            pattern = r'\s+' + re.escape(clause) + r'\b'
            text = re.sub(pattern, '\n' + clause, text, flags=re.IGNORECASE)

        # 清理空白
        text = re.sub(r'[ \t]+\n', '\n', text)
        text = re.sub(r'\n[ \t]+', '\n', text)
        return text
    
    def generate_sql_from_ai(self):
        """使用 AI 生成 SQL（LangGraph Agent：自主决定需要哪些工具，一次完成）"""
        # 检查是否正在运行，如果是则取消
        if self._is_generating():
            self._cancel_generation()
            return
        
        user_query = self.ai_input.toPlainText().strip()
        if not user_query:
            self.set_status("错误: 请输入中文描述", is_error=True)
            return

        # 新的用户主动查询：重置自动修复计数
        self._auto_fix_retries = 0
        self._last_user_query = user_query
        
        # 检查是否选择了连接
        if not self.current_connection_id:
            self.set_status("错误: 请先选择数据库连接", is_error=True)
            return
        
        # 更新按钮为"取消"状态
        self.generate_btn.setText("取消")
        self.generate_btn.setEnabled(True)
        
        # 显示查询范围
        if hasattr(self, '_main_window') and self._main_window:
            conn_name = self._main_window.connection_combo.currentText()
            db_name = self._main_window.database_combo.currentText() if self.current_database else ""
            self.status_label.setText(f"正在获取表名列表... (连接: {conn_name}, 数据库: {db_name})")
        else:
            self.status_label.setText("正在获取表名列表...")
        
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
                self.set_status("正在获取表名列表...", timeout=0)

                from src.gui.workers.table_list_worker import TableListWorker
                
                # 🎯 断开旧 worker 的信号连接，让它自然完成
                if self.table_list_worker:
                    try:
                        self.table_list_worker.tables_ready.disconnect()
                    except:
                        pass
                    self.table_list_worker.finished.connect(self.table_list_worker.deleteLater)
                
                self.table_list_worker = TableListWorker(
                    connection.get_connection_string(),
                    connection.get_connect_args(),
                    connection_id=self.current_connection_id,  # 传入连接ID用于缓存
                    database=self.current_database  # 传入当前数据库，仅获取该数据库的表
                )
                self.table_list_worker.tables_ready.connect(self.on_tables_ready)
                self.table_list_worker.finished.connect(self.table_list_worker.deleteLater)
                self.table_list_worker.start()
                return
        
        # 如果没有数据库连接，直接走 LangGraph（空表结构）
        self.set_status("正在生成SQL...", timeout=0)
        from src.gui.workers.query_langgraph_worker import QueryLangGraphWorker
        if self.ai_worker:
            try:
                self.ai_worker.sql_generated.disconnect()
                self.ai_worker.error_occurred.disconnect()
            except Exception:
                pass
            try:
                self.ai_worker.finished.connect(self.ai_worker.deleteLater)
            except Exception:
                pass
        self.ai_worker = QueryLangGraphWorker(
            ai_client=self.ai_client,
            user_query=user_query,
            table_info_list=[],
        )
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.status_update.connect(lambda msg: self.set_status(msg, timeout=0))
        self.ai_worker.finished.connect(self.ai_worker.deleteLater)
        self.ai_worker.start()
    
    def _is_generating(self):
        """检查是否正在生成SQL"""
        workers = [
            self.ai_worker,
            self.table_list_worker,
        ]
        # 🎯 需要捕获 RuntimeError：worker 可能已被 deleteLater() 删除
        for worker in workers:
            if worker:
                try:
                    if worker.isRunning():
                        return True
                except RuntimeError:
                    # worker 的 C++ 对象已被删除，视为不在运行
                    pass
        return False
    
    def _is_executing(self):
        """检查是否正在执行SQL（通过主窗口的query_worker）"""
        if hasattr(self, '_main_window') and self._main_window:
            if hasattr(self._main_window, 'query_worker') and self._main_window.query_worker:
                try:
                    return self._main_window.query_worker.isRunning()
                except RuntimeError:
                    # worker 的 C++ 对象已被删除
                    return False
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
                try:
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
                        safe_delete_thread(self._main_window.query_worker)
                        self._main_window.query_worker = None
                except RuntimeError:
                    # worker 的 C++ 对象已被删除
                    pass
        self.execute_btn.setText("执行 (F5)")
        self.set_status("已取消", timeout=2000)
    
    def _stop_all_workers(self):
        """停止所有正在运行的工作线程"""
        workers = [
            ('ai_worker', self.ai_worker),
            ('table_list_worker', self.table_list_worker),
        ]
        
        for name, worker in workers:
            if worker:
                try:
                    if worker.isRunning():
                        worker.stop()
                        worker.wait(1000)
                        if worker.isRunning():
                            worker.terminate()
                            worker.wait(500)
                    safe_delete_thread(worker)
                except RuntimeError:
                    # worker 的 C++ 对象已被删除
                    pass
                setattr(self, name, None)
    
    def on_tables_ready(self, table_info_list: list):
        """表名列表获取完成回调 → 启动 LangGraph 查询图（一步到位）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"表名列表获取完成，共 {len(table_info_list)} 个表")
        self._last_table_info_list = table_info_list  # 保存供 AI 修复时复用

        if not table_info_list:
            logger.warning("表名列表为空，无法继续")
            self.generate_btn.setEnabled(True)
            self.generate_btn.setText("直接查询")
            self.set_status("错误: 无法获取表名列表", is_error=True)
            return

        user_query = self.ai_input.toPlainText().strip()

        # 获取数据库连接信息（QueryLangGraphWorker 需要）
        connection_string = ""
        connect_args = {}
        db_type = None
        connection_id = self.current_connection_id
        database = self.current_database

        if self.db_manager and self.current_connection_id:
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                connection_string = connection.get_connection_string()
                connect_args = connection.get_connect_args()
                db_type = connection.db_type.value if hasattr(connection.db_type, 'value') else str(connection.db_type)

        # 读取枚举查询配置
        from src.core.prompt_config import PromptStorage
        config_query_enum = PromptStorage().load_prompts().query_enum_values

        self.set_status("AI正在分析查询，请稍候...", timeout=0)

        from src.gui.workers.query_langgraph_worker import QueryLangGraphWorker

        # 停止并清理旧的 ai_worker
        if self.ai_worker:
            try:
                self.ai_worker.sql_generated.disconnect()
                self.ai_worker.error_occurred.disconnect()
            except Exception:
                pass
            try:
                self.ai_worker.finished.connect(self.ai_worker.deleteLater)
            except Exception:
                pass

        self.ai_worker = QueryLangGraphWorker(
            ai_client=self.ai_client,
            user_query=user_query,
            table_info_list=table_info_list,
            db_type=db_type,
            connection_string=connection_string,
            connect_args=connect_args,
            connection_id=connection_id,
            database=database,
            config_query_enum=config_query_enum,
        )
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.status_update.connect(lambda msg: self.set_status(msg, timeout=0))
        self.ai_worker.finished.connect(self.ai_worker.deleteLater)
        self.ai_worker.start()
        logger.info("QueryLangGraphWorker 已启动")

    def on_execute_error(self, failed_sql: str, error_msg: str):
        """SQL执行报错回调：自动触发 AI 修复（最多重试 _MAX_AUTO_FIX 次）"""
        if self._auto_fix_retries >= self._MAX_AUTO_FIX:
            self.set_status(f"执行失败（AI修复已达上限）: {error_msg}", is_error=True)
            return

        self._auto_fix_retries += 1
        logger.info(f"SQL执行报错，触发AI修复（第{self._auto_fix_retries}次）: {error_msg[:100]}")
        self.set_status(f"执行报错，AI正在分析并修复SQL（第{self._auto_fix_retries}次）...", timeout=0)
        self._fix_sql_with_ai(failed_sql, error_msg)

    def _fix_sql_with_ai(self, failed_sql: str, error_msg: str):
        """用 AI 修复执行失败的 SQL（带错误上下文重新走 LangGraph）"""
        if not self.ai_client:
            self.set_status("AI修复失败: AI客户端未初始化", is_error=True)
            return

        # 复用最后一次的用户查询意图作为背景
        user_query = self._last_user_query or "修复下面执行报错的SQL"

        # 获取连接信息
        connection_string = ""
        connect_args = {}
        db_type = None
        connection_id = self.current_connection_id
        database = self.current_database
        table_info_list = getattr(self, '_last_table_info_list', [])

        if self.db_manager and self.current_connection_id:
            connection = self.db_manager.get_connection(self.current_connection_id)
            if connection:
                connection_string = connection.get_connection_string()
                connect_args = connection.get_connect_args()
                db_type = connection.db_type.value if hasattr(connection.db_type, 'value') else str(connection.db_type)

        from src.core.prompt_config import PromptStorage
        config_query_enum = PromptStorage().load_prompts().query_enum_values

        from src.gui.workers.query_langgraph_worker import QueryLangGraphWorker

        if self.ai_worker:
            try:
                self.ai_worker.sql_generated.disconnect()
                self.ai_worker.error_occurred.disconnect()
            except Exception:
                pass
            try:
                self.ai_worker.finished.connect(self.ai_worker.deleteLater)
            except Exception:
                pass

        self.ai_worker = QueryLangGraphWorker(
            ai_client=self.ai_client,
            user_query=user_query,
            table_info_list=table_info_list,
            db_type=db_type,
            connection_string=connection_string,
            connect_args=connect_args,
            connection_id=connection_id,
            database=database,
            config_query_enum=config_query_enum,
            execution_error=error_msg,
            failed_sql=failed_sql,
        )
        self.ai_worker.sql_generated.connect(self.on_sql_generated)
        self.ai_worker.error_occurred.connect(self.on_ai_error)
        self.ai_worker.status_update.connect(lambda msg: self.set_status(msg, timeout=0))
        self.ai_worker.finished.connect(self.ai_worker.deleteLater)
        self.ai_worker.start()

    def on_sql_generated(self, sql: str, sql_type: str = "OTHER"):
        """AI生成SQL完成回调（sql_type 由 AI 直接返回，无需代码推断）"""
        self.sql_edit.setPlainText(sql)

        # 将 AI 生成的 SQL 也纳入查询历史，标记来源为 AI
        try:
            if self.current_connection_id:
                from src.core.config_db import get_config_db

                config_db = get_config_db()
                config_db.add_query_history(
                    connection_id=self.current_connection_id,
                    database_name=self.current_database or "",
                    sql=sql,
                    source="AI",
                    duration_ms=0,
                    title="",
                )
        except Exception:
            # 历史记录失败不影响主流程
            pass

        self.generate_btn.setEnabled(True)
        self.generate_btn.setText("直接查询")

        # 直接使用 AI 返回的 sql_type 判断是否自动执行
        is_query = sql_type in ("SELECT",)

        if is_query:
            self.set_status("SQL生成成功，正在执行查询...", timeout=0)
            self.execute_btn.setText("取消")
            self.execute_signal.emit(sql)
        else:
            self.set_status(f"SQL生成成功（{sql_type}），请确认后点击\"执行\"", timeout=5000)
    
    def on_ai_error(self, error: str):
        """AI生成SQL错误回调"""
        # 恢复按钮状态
        self.generate_btn.setEnabled(True)
        self.generate_btn.setText("直接查询")
        
        # 显示错误信息到状态栏
        self.set_status(f"AI生成失败: {error}", is_error=True)
        
        # 显示 Toast 提示（更明显）
        try:
            from src.utils.toast_manager import show_error
            show_error(f"AI生成失败: {error}")
        except Exception as e:
            logger.warning(f"显示Toast失败: {str(e)}")
        
        # 🎯 不需要手动清理：worker 会通过 finished 信号自动 deleteLater()
    
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
        # 处理 AI 输入框的回车键
        if hasattr(self, 'ai_input') and obj == self.ai_input and event.type() == event.Type.KeyPress:
            key_event = event
            
            # Enter 键触发查询（Shift+Enter 换行）
            if key_event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return]:
                # 如果按住了 Shift，允许换行
                if key_event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    return False  # 让 QPlainTextEdit 处理换行
                else:
                    # 否则触发查询
                    self.generate_sql_from_ai()
                    return True  # 阻止默认行为
        
        if hasattr(self, 'sql_edit') and obj == self.sql_edit and event.type() == event.Type.KeyPress:
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

