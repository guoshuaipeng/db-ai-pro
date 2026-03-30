from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QComboBox,
    QPushButton,
    QSplitter,
    QListWidget,
    QListWidgetItem,
    QTextEdit,
    QApplication,
)
from PyQt6.QtCore import Qt
from typing import Optional, Any, Dict

from src.core.memory_store import MemoryStore, is_unlabeled_table_key
from src.core.config_db import get_config_db


class MemoryViewDialog(QDialog):
    """AI 记忆可视化对话框：命名规范 / 相似历史查询 / 表级摘要 / 纠错记录"""

    def __init__(
        self,
        parent=None,
        connection_id: Optional[str] = None,
        database: Optional[str] = None,
        ai_client: Any = None,
        connection_string: str = "",
        connect_args: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(parent)
        self.setWindowTitle("AI 记忆")
        self.resize(1000, 600)

        self._main_window = parent

        # 用于避免“初始化时 setCurrentIndex 触发 currentIndexChanged”
        # 导致默认数据库筛选被意外重置。
        self._is_loading = True

        self._current_connection_id = connection_id or ""
        self._current_database = database or ""
        self.ai_client = ai_client
        self.connection_string = connection_string or ""
        self.connect_args = connect_args or {}

        self._config_db = get_config_db()
        self._memory_store: Optional[MemoryStore] = None

        self._init_ui()
        self._load_connections()
        self._reload_memory()
        self._is_loading = False

    # UI -----------------------------------------------------------------
    def _init_ui(self):
        layout = QVBoxLayout()
        self.setLayout(layout)

        # 顶部筛选栏：连接 + 数据库 + 操作按钮
        top = QHBoxLayout()

        top.addWidget(QLabel("连接:"))
        self.conn_combo = QComboBox()
        self.conn_combo.currentIndexChanged.connect(self._on_connection_changed)
        top.addWidget(self.conn_combo)

        top.addWidget(QLabel("数据库:"))
        self.db_combo = QComboBox()
        self.db_combo.currentIndexChanged.connect(self._on_database_changed)
        top.addWidget(self.db_combo)

        top.addStretch()

        self.clear_btn = QPushButton("清空当前连接/库记忆")
        self.clear_btn.clicked.connect(self._clear_current_memory)
        top.addWidget(self.clear_btn)

        self.generate_btn = QPushButton("生成表级记忆")
        self.generate_btn.setToolTip("根据当前历史查询，为各表生成使用规律摘要")
        self.generate_btn.clicked.connect(self._generate_memory)
        top.addWidget(self.generate_btn)

        self.naming_generate_btn = QPushButton("生成命名规范")
        self.naming_generate_btn.setToolTip("扫描当前连接/库的表结构，交给 AI 总结命名规范并写入长期记忆")
        self.naming_generate_btn.clicked.connect(self._generate_naming_conventions)
        top.addWidget(self.naming_generate_btn)

        layout.addLayout(top)

        # 主区域：左侧列表（4 类），右侧详情
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧：四个列表区 + 标签
        left_widget = QDialog()
        left_layout = QVBoxLayout()
        left_widget.setLayout(left_layout)

        # 命名规范
        left_layout.addWidget(QLabel("命名规范样例"))
        self.naming_list = QListWidget()
        left_layout.addWidget(self.naming_list)

        # 相似历史查询（仅展示最近若干条）
        left_layout.addWidget(QLabel("相似历史查询（示例）"))
        self.pattern_list = QListWidget()
        left_layout.addWidget(self.pattern_list)

        # 表级摘要
        left_layout.addWidget(QLabel("表级摘要"))
        self.summary_list = QListWidget()
        self.summary_list.currentItemChanged.connect(self._on_summary_selected)
        left_layout.addWidget(self.summary_list)

        # 纠错记录
        left_layout.addWidget(QLabel("最近纠错记录"))
        self.correction_list = QListWidget()
        self.correction_list.currentItemChanged.connect(self._on_correction_selected)
        left_layout.addWidget(self.correction_list)

        splitter.addWidget(left_widget)

        # 右侧：详情查看区域
        right_widget = QDialog()
        right_layout = QVBoxLayout()
        right_widget.setLayout(right_layout)

        self.detail_label = QLabel("详情")
        self.detail_label.setStyleSheet("font-weight: bold;")
        right_layout.addWidget(self.detail_label)

        self.detail_text = QTextEdit()
        self.detail_text.setReadOnly(True)
        right_layout.addWidget(self.detail_text)

        splitter.addWidget(right_widget)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)

        layout.addWidget(splitter)

        # 底部提示
        hint = QLabel(
            "提示：记忆仅按连接 + 数据库隔离存储，用于提升 AI 对当前业务库的理解，不包含敏感数据字段值本身。"
        )
        hint.setWordWrap(True)
        hint.setStyleSheet("color: #666;")
        layout.addWidget(hint)

        # 生成中状态展示（避免 UI 卡住时无反馈）
        self._status_label = QLabel("")
        self._status_label.setStyleSheet("color: #444;")
        self._status_label.setWordWrap(True)
        layout.addWidget(self._status_label)

    # 数据加载 -----------------------------------------------------------
    def _load_connections(self):
        """加载连接下拉框"""
        self.conn_combo.blockSignals(True)
        self.conn_combo.clear()

        conns = self._config_db.get_all_connections()
        target_index = 0
        self.conn_combo.addItem("请选择连接", "")
        for idx, c in enumerate(conns, start=1):
            label = f"{c['name']} ({c['id']})"
            self.conn_combo.addItem(label, c["id"])
            if c["id"] == self._current_connection_id:
                target_index = idx

        if target_index:
            self.conn_combo.setCurrentIndex(target_index)
        self.conn_combo.blockSignals(False)

        self._load_databases()

    def _load_databases(self):
        """根据当前连接加载数据库列表（如果可用），否则仅保留“当前库/全部”选项"""
        self.db_combo.blockSignals(True)
        self.db_combo.clear()

        self.db_combo.addItem("全部数据库", "")
        if self._current_database:
            self.db_combo.addItem(self._current_database, self._current_database)
            self.db_combo.setCurrentIndex(1)

        self.db_combo.blockSignals(False)

    def _current_conn_id(self) -> str:
        return self.conn_combo.currentData() or ""

    def _current_db_name(self) -> str:
        return self.db_combo.currentData() or ""

    def _build_memory_store(self):
        conn_id = self._current_conn_id()
        db_name = self._current_db_name()
        if not conn_id:
            self._memory_store = None
            return
        self._memory_store = MemoryStore(connection_id=conn_id, database=db_name)

    def _reload_memory(self):
        """重新加载四类记忆到 UI"""
        self._build_memory_store()
        self.naming_list.clear()
        self.pattern_list.clear()
        self.summary_list.clear()
        self.correction_list.clear()
        self.detail_text.clear()

        if not self._memory_store:
            return

        # 命名规范
        for pattern in self._memory_store.get_naming_conventions(limit=20):
            self.naming_list.addItem(QListWidgetItem(pattern))

        # 相似历史查询示例：这里不做意图搜索，只展示历史模式中的若干条
        try:
            # 直接从 config_db 里拿所有 pattern，交由 MemoryStore 再做压缩，
            # 这里 UI 只做轻量展示，因此简单调用底层 helper
            patterns_raw = self._config_db.get_all_patterns_for_compression(
                self._current_conn_id(), self._current_db_name()
            )
        except Exception:
            patterns_raw = []

        for p in patterns_raw[:20]:
            text = f"意图: {p['user_intent']}\nSQL: {p['generated_sql']}"
            item = QListWidgetItem(text)
            item.setData(Qt.ItemDataRole.UserRole, p)
            self.pattern_list.addItem(item)

        # 表级摘要
        summaries = self._memory_store.get_table_summaries()
        for s in summaries:
            tk = s.get("table_key") or ""
            if is_unlabeled_table_key(tk):
                title = f"表级摘要（{s['pattern_count']} 条样例）"
            else:
                title = f"{tk}（{s['pattern_count']} 条样例）"
            item = QListWidgetItem(title)
            item.setData(Qt.ItemDataRole.UserRole, s)
            self.summary_list.addItem(item)

        # 纠错记录
        corrections = self._memory_store.get_recent_corrections(limit=50)
        for c in corrections:
            title = f"意图: {c.user_query}"
            item = QListWidgetItem(title)
            item.setData(Qt.ItemDataRole.UserRole, c)
            self.correction_list.addItem(item)

    # 事件处理 -----------------------------------------------------------
    def _on_connection_changed(self, index: int):
        self._current_connection_id = self._current_conn_id()
        # 同步当前连接对应的 schema 拉取参数，保证“生成命名规范/表级摘要”能用到正确连接。
        try:
            if self._main_window and getattr(self._main_window, "db_manager", None):
                conn = self._main_window.db_manager.get_connection(self._current_connection_id)
                if conn:
                    self.connection_string = conn.get_connection_string() or ""
                    self.connect_args = conn.get_connect_args() or {}
                else:
                    self.connection_string = ""
                    self.connect_args = {}
        except Exception:
            pass

        # 仅在用户手动切换连接时，才重置“数据库筛选”，否则初始化阶段会打断默认选中值。
        if not self._is_loading:
            self._current_database = ""
            self.db_combo.setCurrentIndex(0)  # 0: 全部数据库
        self._load_databases()
        self._reload_memory()

    def _on_database_changed(self, index: int):
        self._current_database = self._current_db_name()
        self._reload_memory()

    def _on_summary_selected(self, current: QListWidgetItem, previous: QListWidgetItem):
        if not current:
            return
        data = current.data(Qt.ItemDataRole.UserRole) or {}
        pk = data.get("table_key") or ""
        if is_unlabeled_table_key(pk):
            text = f"样例条数: {data.get('pattern_count')}\n\n摘要:\n{data.get('summary')}"
        else:
            text = f"表组: {pk}\n样例条数: {data.get('pattern_count')}\n\n摘要:\n{data.get('summary')}"
        self.detail_label.setText("表级摘要详情")
        self.detail_text.setPlainText(text)

    def _on_correction_selected(self, current: QListWidgetItem, previous: QListWidgetItem):
        if not current:
            return
        c = current.data(Qt.ItemDataRole.UserRole)
        if not c:
            return
        note = c.correction_note or ""
        text = (
            f"用户意图:\n{c.user_query}\n\n"
            f"AI 错误 SQL:\n{c.ai_sql}\n\n"
            f"人工修正 SQL:\n{c.corrected_sql}\n\n"
        )
        if note:
            text += f"备注:\n{note}\n"
        self.detail_label.setText("纠错记录详情")
        self.detail_text.setPlainText(text)

    def _clear_current_memory(self):
        """清空当前连接/库的长期记忆"""
        conn_id = self._current_conn_id()
        db_name = self._current_db_name()
        if not conn_id:
            return

        from PyQt6.QtWidgets import QMessageBox

        label = f"连接 {conn_id}"
        if db_name:
            label += f" / 库 {db_name}"

        reply = QMessageBox.question(
            self,
            "清空记忆确认",
            f"确定要清空 {label} 的 AI 长期记忆吗？\n\n"
            "包括：命名规范、相似历史查询、表级摘要和纠错记录。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return

        try:
            # 直接操作底层表：删除当前 connection + database 下的相关记录
            with self._config_db._get_connection() as conn:
                c = conn.cursor()
                params = (conn_id, db_name)
                for table in [
                    "memory_naming_conventions",
                    "memory_query_patterns",
                    "memory_corrections",
                    "memory_table_summaries",
                    "memory_compression_log",
                ]:
                    c.execute(
                        f"DELETE FROM {table} WHERE connection_id=? AND database_name=?",
                        params,
                    )
        except Exception as e:
            from PyQt6.QtWidgets import QMessageBox as _MsgBox

            _MsgBox.warning(self, "清空失败", f"清空记忆时出错: {e}")
            return

        self._reload_memory()

    def _generate_memory(self):
        """手动触发表级记忆压缩/生成"""
        conn_id = self._current_conn_id()
        db_name = self._current_db_name()
        if not conn_id:
            return

        from PyQt6.QtWidgets import QMessageBox
        from src.core.memory_store import MemoryStore

        store = MemoryStore(connection_id=conn_id, database=db_name)
        try:
            triggered = store.compress_if_needed(
                ai_client=self.ai_client,
                connection_string=self.connection_string,
                connect_args=self.connect_args,
                force=True,
            )
        except Exception as e:
            QMessageBox.warning(self, "生成失败", f"生成记忆时出错: {e}")
            return

        if triggered:
            QMessageBox.information(self, "生成完成", "已根据当前历史查询生成/更新表级记忆摘要。")
        else:
            QMessageBox.information(
                self,
                "无需生成",
                "本次未生成新的表级摘要（通常是：相关表的历史样例不足，或当前没有可压缩的历史 pattern）。",
            )
        self._reload_memory()

    def _generate_naming_conventions(self):
        """手动生成命名规范（从 schema 出发交给 AI，总结后写回长期记忆）"""
        conn_id = self._current_conn_id()
        db_name = self._current_db_name()
        if not conn_id:
            return

        # 如果之前打开弹窗时 ai_client 尚未初始化，这里做懒加载，避免用户必须先跑一次查询
        if not self.ai_client:
            try:
                from src.core.ai_client import AIClient
                from src.core.ai_model_storage import AIModelStorage

                model_id = None
                if self._main_window:
                    model_id = getattr(self._main_window, "current_ai_model_id", None)

                if model_id:
                    storage = AIModelStorage()
                    model_config = next(
                        (m for m in storage.load_models() if m.id == model_id),
                        None,
                    )
                    if model_config:
                        self.ai_client = AIClient(
                            api_key=model_config.api_key.get_secret_value(),
                            base_url=model_config.get_base_url(),
                            default_model=model_config.default_model,
                            turbo_model=model_config.turbo_model,
                        )
                        # 用于内部 token 统计/日志区分
                        self.ai_client._current_model_id = model_config.id
                    else:
                        # 找不到指定模型：退回默认模型配置
                        self.ai_client = AIClient()
                else:
                    self.ai_client = AIClient()  # 自动加载默认模型
            except Exception:
                from PyQt6.QtWidgets import QMessageBox

                QMessageBox.warning(
                    self,
                    "无法生成",
                    "当前未配置 AI 模型/客户端，无法调用 AI 生成命名规范。请先在应用中配置 AI 模型。",
                )
                return

        # 确保连接参数是当前连接的（用户可能仅点按钮未触发连接切换回调）
        if (not self.connection_string or not self.connect_args) and self._main_window and getattr(self._main_window, "db_manager", None):
            try:
                conn = self._main_window.db_manager.get_connection(conn_id)
                if conn:
                    self.connection_string = conn.get_connection_string() or ""
                    self.connect_args = conn.get_connect_args() or {}
            except Exception:
                pass

        if not self.connection_string:
            from PyQt6.QtWidgets import QMessageBox

            QMessageBox.warning(self, "无法生成", "当前连接参数缺失，无法拉取表结构。")
            return

        # 改为后台线程跑，避免 UI 卡住
        from PyQt6.QtWidgets import QMessageBox

        self.naming_generate_btn.setEnabled(False)
        if self.generate_btn:
            self.generate_btn.setEnabled(False)

        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        self._status_label.setText("正在后台生成命名规范，请稍候...")

        from src.gui.workers.generate_naming_conventions_worker import GenerateNamingConventionsWorker

        self._naming_worker = GenerateNamingConventionsWorker(
            ai_client=self.ai_client,
            connection_id=conn_id,
            database=db_name,
            connection_string=self.connection_string,
            connect_args=self.connect_args,
        )
        self._naming_worker.status_update.connect(self._on_naming_status_update)
        self._naming_worker.finished.connect(self._on_naming_finished)
        self._naming_worker.error_occurred.connect(self._on_naming_error)
        self._naming_worker.finished.connect(self._naming_worker.deleteLater)
        self._naming_worker.start()

    def _on_naming_status_update(self, msg: str):
        if hasattr(self, "_status_label") and self._status_label:
            self._status_label.setText(msg)

    def _on_naming_finished(self, ok: bool, message: str):
        from PyQt6.QtWidgets import QMessageBox

        QApplication.restoreOverrideCursor()
        self._status_label.setText("")

        self.naming_generate_btn.setEnabled(True)
        if self.generate_btn:
            self.generate_btn.setEnabled(True)

        if ok:
            QMessageBox.information(self, "生成完成", message)
        else:
            QMessageBox.information(self, "无需/生成失败", message)

        self._reload_memory()

    def _on_naming_error(self, error_msg: str):
        from PyQt6.QtWidgets import QMessageBox

        QApplication.restoreOverrideCursor()
        self._status_label.setText("")

        self.naming_generate_btn.setEnabled(True)
        if self.generate_btn:
            self.generate_btn.setEnabled(True)

        QMessageBox.warning(self, "生成失败", f"生成命名规范时出错: {error_msg}")

