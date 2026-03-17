from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QCheckBox,
    QComboBox,
    QLineEdit,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor
from typing import Optional

from src.core.config_db import get_config_db


class QueryHistoryDialog(QDialog):
    """查询历史对话框：支持查看 / 收藏 / 重命名 / 按连接与库过滤"""

    def __init__(
        self,
        parent=None,
        current_connection_id: Optional[str] = None,
        current_database: Optional[str] = None,
    ):
        super().__init__(parent)
        self.setWindowTitle("查询历史")
        self.resize(800, 500)

        self._selected_sql: str = ""
        self._current_connection_id = current_connection_id or ""
        self._current_database = current_database or ""
        self._config_db = get_config_db()

        self._init_ui()
        self._load_connections()
        self._load_history()

    def _init_ui(self):
        layout = QVBoxLayout()
        self.setLayout(layout)

        # 过滤区
        filter_layout = QHBoxLayout()

        filter_layout.addWidget(QLabel("连接:"))
        self.conn_combo = QComboBox()
        self.conn_combo.addItem("全部连接", "")
        self.conn_combo.currentIndexChanged.connect(self._load_history)
        filter_layout.addWidget(self.conn_combo)

        filter_layout.addWidget(QLabel("数据库:"))
        self.db_edit = QLineEdit()
        self.db_edit.setPlaceholderText("留空表示全部数据库")
        self.db_edit.returnPressed.connect(self._load_history)
        filter_layout.addWidget(self.db_edit)

        self.fav_only_checkbox = QCheckBox("仅显示收藏")
        self.fav_only_checkbox.stateChanged.connect(self._load_history)
        filter_layout.addWidget(self.fav_only_checkbox)

        filter_layout.addStretch()
        layout.addLayout(filter_layout)

        # 历史列表
        self.list_widget = QListWidget()
        self.list_widget.itemDoubleClicked.connect(self._on_item_double_clicked)
        layout.addWidget(self.list_widget)

        # 操作区
        btn_layout = QHBoxLayout()

        self.rename_btn = QPushButton("重命名")
        self.rename_btn.clicked.connect(self._rename_selected)
        btn_layout.addWidget(self.rename_btn)

        self.toggle_fav_btn = QPushButton("收藏 / 取消收藏")
        self.toggle_fav_btn.clicked.connect(self._toggle_favorite_selected)
        btn_layout.addWidget(self.toggle_fav_btn)

        btn_layout.addStretch()

        self.cancel_btn = QPushButton("关闭")
        self.cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(self.cancel_btn)

        self.apply_btn = QPushButton("应用到编辑器")
        self.apply_btn.clicked.connect(self._apply_selected)
        btn_layout.addWidget(self.apply_btn)

        layout.addLayout(btn_layout)

    def _load_connections(self):
        """加载连接列表到下拉框"""
        from src.core.config_db import get_config_db

        config_db = get_config_db()
        conns = config_db.get_all_connections()

        # 先清空，仅保留“全部连接”
        while self.conn_combo.count() > 1:
            self.conn_combo.removeItem(1)

        target_index = 0
        for idx, c in enumerate(conns, start=1):
            label = f"{c['name']} ({c['id']})"
            self.conn_combo.addItem(label, c["id"])
            if c["id"] == self._current_connection_id:
                target_index = idx

        if target_index:
            self.conn_combo.setCurrentIndex(target_index)

        if self._current_database:
            self.db_edit.setText(self._current_database)

    def _load_history(self):
        """根据过滤条件加载历史"""
        conn_id = self.conn_combo.currentData()
        db_name = self.db_edit.text().strip()
        if not db_name:
            db_name = None

        only_fav = self.fav_only_checkbox.isChecked()

        histories = self._config_db.get_recent_query_history(
            limit=100,
            connection_id=conn_id or None,
            database_name=db_name,
            only_favorites=only_fav,
        )

        self.list_widget.clear()
        for h in histories:
            title = h["title"].strip() or h["sql"].strip().replace("\n", " ")
            if len(title) > 80:
                title = title[:77] + "..."
            star = "★ " if h["is_favorite"] else "  "

            source = (h.get("source") or "").upper()
            if source == "AI":
                source_tag = "[AI] "
            elif source == "CLI":
                source_tag = "[CLI] "
            else:
                source_tag = ""

            display = f"{star}{source_tag}{title}"
            item = QListWidgetItem(display)

            # AI / CLI 记录使用不同颜色，便于一眼识别
            if source == "AI":
                item.setForeground(QColor("#1976D2"))  # 蓝色
            elif source == "CLI":
                item.setForeground(QColor("#757575"))  # 灰色

            # 提示信息包含详细属性
            tooltip_lines = [
                f"连接: {h['connection_id']}",
                f"数据库: {h['database_name'] or '-'}",
                f"来源: {h['source']}",
                f"时间: {h['executed_at']}",
            ]
            if h.get("duration_ms"):
                tooltip_lines.append(f"耗时: {h['duration_ms']} ms")
            tooltip_lines.append("")
            tooltip_lines.append(h["sql"].strip())
            item.setToolTip("\n".join(tooltip_lines))

            # 存储完整数据
            item.setData(Qt.ItemDataRole.UserRole, h)
            self.list_widget.addItem(item)

    def _current_history(self):
        item = self.list_widget.currentItem()
        if not item:
            return None
        return item.data(Qt.ItemDataRole.UserRole)

    def _on_item_double_clicked(self, item: QListWidgetItem):
        data = item.data(Qt.ItemDataRole.UserRole)
        if not data:
            return
        self._selected_sql = data["sql"]
        self.accept()

    def _apply_selected(self):
        data = self._current_history()
        if not data:
            return
        self._selected_sql = data["sql"]
        self.accept()

    def _rename_selected(self):
        data = self._current_history()
        if not data:
            return
        from PyQt6.QtWidgets import QInputDialog

        current_title = data["title"].strip()
        if not current_title:
            # 默认用 SQL 第一行
            current_title = data["sql"].strip().splitlines()[0][:80]

        new_title, ok = QInputDialog.getText(
            self,
            "重命名查询",
            "请输入查询标题：",
            text=current_title,
        )
        if not ok:
            return
        new_title = new_title.strip()
        if not new_title:
            return

        self._config_db.update_query_history_title(data["id"], new_title)
        self._load_history()

    def _toggle_favorite_selected(self):
        data = self._current_history()
        if not data:
            return
        new_flag = not bool(data["is_favorite"])
        self._config_db.set_query_history_favorite(data["id"], new_flag)
        self._load_history()

    def get_selected_sql(self) -> str:
        return self._selected_sql

