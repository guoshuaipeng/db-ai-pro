"""
提示词配置对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QTabWidget,
    QTextEdit,
    QPushButton,
    QDialogButtonBox,
    QMessageBox,
    QLabel,
    QWidget,
    QCheckBox,
    QGroupBox,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from src.core.prompt_config import PromptConfig, PromptStorage


class PromptConfigDialog(QDialog):
    """提示词配置对话框"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("AI提示词配置")
        self.setModal(True)
        self.setMinimumSize(800, 600)
        self.storage = PromptStorage()
        self.config = self.storage.load_prompts()
        self.init_ui()
        self.load_prompts()

    def init_ui(self):
        layout = QVBoxLayout()
        self.setLayout(layout)

        info_label = QLabel(
            "配置 AI 生成 SQL 和 Redis 命令时使用的提示词。"
            "注：建表/改表/查询的核心提示词已内置于 LangGraph Agent，此处无需配置。"
        )
        info_label.setWordWrap(True)
        layout.addWidget(info_label)

        # AI 功能开关
        config_group = QGroupBox("AI 功能配置")
        config_layout = QVBoxLayout()
        config_group.setLayout(config_layout)
        self.query_enum_checkbox = QCheckBox(
            "查询枚举字段的值（查询较慢，但可以提高 SQL 准确性）"
        )
        self.query_enum_checkbox.setToolTip(
            "启用后，AI 会在生成 SQL 前查询枚举字段的所有可能值。\n"
            "这可以提高 SQL 的准确性，但会增加查询时间。\n"
            "默认关闭以提高性能。"
        )
        config_layout.addWidget(self.query_enum_checkbox)
        layout.addWidget(config_group)

        # 标签页
        self.tabs = QTabWidget()

        # ── 生成 SQL（降级兜底） ──────────────────────────────────
        sql_tab_widget = QWidget()
        sql_tab = QVBoxLayout(sql_tab_widget)
        sql_tab.addWidget(QLabel(
            "生成 SQL 的系统提示词（LangGraph Agent 不支持工具调用时的降级兜底）"
        ))
        self.generate_sql_edit = QTextEdit()
        self.generate_sql_edit.setFont(QFont("Consolas", 10))
        sql_tab.addWidget(self.generate_sql_edit)
        self.tabs.addTab(sql_tab_widget, "生成 SQL（降级）")

        # ── 搜索相关表（LangGraph 内置工具使用） ─────────────────
        table_tab_widget = QWidget()
        table_tab = QVBoxLayout(table_tab_widget)
        table_tab.addWidget(QLabel(
            "搜索相关表的系统提示词（LangGraph search_relevant_tables 工具内部使用）"
        ))
        self.select_tables_edit = QTextEdit()
        self.select_tables_edit.setFont(QFont("Consolas", 10))
        table_tab.addWidget(self.select_tables_edit)
        self.tabs.addTab(table_tab_widget, "搜索相关表")

        # ── 建表：选择参考表 ──────────────────────────────────────
        create_ref_tab_widget = QWidget()
        create_ref_tab = QVBoxLayout(create_ref_tab_widget)
        create_ref_tab.addWidget(QLabel(
            "新建表：选择参考表的系统提示词（用于从所有表中找出与建表需求匹配的参考表）"
        ))
        self.create_table_select_edit = QTextEdit()
        self.create_table_select_edit.setFont(QFont("Consolas", 10))
        create_ref_tab.addWidget(self.create_table_select_edit)
        self.tabs.addTab(create_ref_tab_widget, "新建表-选参考表")

        # ── 解析连接配置 ──────────────────────────────────────────
        connection_tab_widget = QWidget()
        connection_tab = QVBoxLayout(connection_tab_widget)
        connection_tab.addWidget(QLabel(
            "解析数据库连接配置的系统提示词（用于从粘贴的配置中提取连接信息）"
        ))
        self.parse_connection_edit = QTextEdit()
        self.parse_connection_edit.setFont(QFont("Consolas", 10))
        connection_tab.addWidget(self.parse_connection_edit)
        self.tabs.addTab(connection_tab_widget, "解析连接配置")

        # ── 生成 Redis 命令 ───────────────────────────────────────
        redis_tab_widget = QWidget()
        redis_tab = QVBoxLayout(redis_tab_widget)
        redis_tab.addWidget(QLabel(
            "生成 Redis 命令的系统提示词（用于根据用户需求生成 Redis 命令）"
        ))
        self.generate_redis_edit = QTextEdit()
        self.generate_redis_edit.setFont(QFont("Consolas", 10))
        redis_tab.addWidget(self.generate_redis_edit)
        self.tabs.addTab(redis_tab_widget, "生成 Redis 命令")

        layout.addWidget(self.tabs)

        # 按钮
        button_layout = QHBoxLayout()
        reset_btn = QPushButton("重置为默认")
        reset_btn.clicked.connect(self.reset_to_default)
        button_layout.addWidget(reset_btn)
        button_layout.addStretch()
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.save_and_accept)
        button_box.rejected.connect(self.reject)
        button_layout.addWidget(button_box)
        layout.addLayout(button_layout)

    def load_prompts(self):
        self.generate_sql_edit.setPlainText(self.config.generate_sql_system)
        self.select_tables_edit.setPlainText(self.config.select_tables_system)
        self.create_table_select_edit.setPlainText(self.config.create_table_select_reference_tables_system)
        self.parse_connection_edit.setPlainText(self.config.parse_connection_config_system)
        self.generate_redis_edit.setPlainText(self.config.generate_redis_command_system)
        self.query_enum_checkbox.setChecked(self.config.query_enum_values)

    def reset_to_default(self):
        reply = QMessageBox.question(
            self,
            "确认重置",
            "确定要重置所有提示词为默认值吗？当前修改将丢失。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            self.config = PromptConfig()
            self.load_prompts()

    def save_and_accept(self):
        try:
            self.config.generate_sql_system = self.generate_sql_edit.toPlainText()
            self.config.select_tables_system = self.select_tables_edit.toPlainText()
            self.config.create_table_select_reference_tables_system = self.create_table_select_edit.toPlainText()
            self.config.parse_connection_config_system = self.parse_connection_edit.toPlainText()
            self.config.generate_redis_command_system = self.generate_redis_edit.toPlainText()
            self.config.query_enum_values = self.query_enum_checkbox.isChecked()
            self.storage.save_prompts(self.config)
            QMessageBox.information(self, "成功", "提示词配置已保存")
            self.accept()
        except Exception as e:
            QMessageBox.warning(self, "错误", f"保存提示词配置失败: {str(e)}")
