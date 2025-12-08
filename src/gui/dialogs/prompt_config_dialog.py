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
        """初始化UI"""
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 说明标签
        info_label = QLabel("配置AI生成SQL时使用的提示词。可以自定义每个步骤的提示词以优化AI行为。")
        info_label.setWordWrap(True)
        layout.addWidget(info_label)
        
        # AI功能配置
        config_group = QGroupBox("AI功能配置")
        config_layout = QVBoxLayout()
        config_group.setLayout(config_layout)
        
        self.query_enum_checkbox = QCheckBox("查询枚举字段的值（查询较慢，但可以提高SQL准确性）")
        self.query_enum_checkbox.setToolTip("启用后，AI会在生成SQL前查询枚举字段的所有可能值。\n这可以提高SQL的准确性，但会增加查询时间。\n默认关闭以提高性能。")
        config_layout.addWidget(self.query_enum_checkbox)
        
        layout.addWidget(config_group)
        
        # 标签页
        self.tabs = QTabWidget()
        
        # 生成SQL提示词
        sql_tab = QVBoxLayout()
        sql_tab_widget = QWidget()
        sql_tab_widget.setLayout(sql_tab)
        
        sql_label = QLabel("生成SQL的系统提示词（用于最终SQL生成）")
        sql_tab.addWidget(sql_label)
        
        self.generate_sql_edit = QTextEdit()
        self.generate_sql_edit.setFont(QFont("Consolas", 10))
        sql_tab.addWidget(self.generate_sql_edit)
        
        self.tabs.addTab(sql_tab_widget, "生成SQL")
        
        # 选择表提示词
        table_tab = QVBoxLayout()
        table_tab_widget = QWidget()
        table_tab_widget.setLayout(table_tab)
        
        table_label = QLabel("选择表的系统提示词（用于从表名列表中选择相关表）")
        table_tab.addWidget(table_label)
        
        self.select_tables_edit = QTextEdit()
        self.select_tables_edit.setFont(QFont("Consolas", 10))
        table_tab.addWidget(self.select_tables_edit)
        
        self.tabs.addTab(table_tab_widget, "选择表")
        
        # 选择枚举列提示词
        enum_tab = QVBoxLayout()
        enum_tab_widget = QWidget()
        enum_tab_widget.setLayout(enum_tab)
        
        enum_label = QLabel("选择枚举列的系统提示词（用于识别可能是枚举类型的字段）")
        enum_tab.addWidget(enum_label)
        
        self.select_enum_edit = QTextEdit()
        self.select_enum_edit.setFont(QFont("Consolas", 10))
        enum_tab.addWidget(self.select_enum_edit)
        
        self.tabs.addTab(enum_tab_widget, "选择枚举列")
        
        # 新建表：选择参考表提示词
        create_table_select_tab = QVBoxLayout()
        create_table_select_tab_widget = QWidget()
        create_table_select_tab_widget.setLayout(create_table_select_tab)
        
        create_table_select_label = QLabel("新建表：选择参考表的系统提示词（用于从所有表中选择与建表需求匹配度高的前5个表）")
        create_table_select_tab.addWidget(create_table_select_label)
        
        self.create_table_select_edit = QTextEdit()
        self.create_table_select_edit.setFont(QFont("Consolas", 10))
        create_table_select_tab.addWidget(self.create_table_select_edit)
        
        self.tabs.addTab(create_table_select_tab_widget, "新建表-选择参考表")
        
        # 新建表：生成建表语句提示词
        create_table_generate_tab = QVBoxLayout()
        create_table_generate_tab_widget = QWidget()
        create_table_generate_tab_widget.setLayout(create_table_generate_tab)
        
        create_table_generate_label = QLabel("新建表：生成建表语句的系统提示词（用于根据用户需求和参考表结构生成CREATE TABLE语句）")
        create_table_generate_tab.addWidget(create_table_generate_label)
        
        self.create_table_generate_edit = QTextEdit()
        self.create_table_generate_edit.setFont(QFont("Consolas", 10))
        create_table_generate_tab.addWidget(self.create_table_generate_edit)
        
        self.tabs.addTab(create_table_generate_tab_widget, "新建表-生成SQL")
        
        # 编辑表：生成修改表语句提示词
        edit_table_generate_tab = QVBoxLayout()
        edit_table_generate_tab_widget = QWidget()
        edit_table_generate_tab_widget.setLayout(edit_table_generate_tab)
        
        edit_table_generate_label = QLabel("编辑表：生成修改表语句的系统提示词（用于根据用户需求和当前表结构生成ALTER TABLE语句）")
        edit_table_generate_tab.addWidget(edit_table_generate_label)
        
        self.edit_table_generate_edit = QTextEdit()
        self.edit_table_generate_edit.setFont(QFont("Consolas", 10))
        edit_table_generate_tab.addWidget(self.edit_table_generate_edit)
        
        self.tabs.addTab(edit_table_generate_tab_widget, "编辑表-生成SQL")
        
        # 解析连接配置提示词
        connection_tab = QVBoxLayout()
        connection_tab_widget = QWidget()
        connection_tab_widget.setLayout(connection_tab)
        
        connection_label = QLabel("解析数据库连接配置的系统提示词（用于从粘贴的配置中提取连接信息）")
        connection_tab.addWidget(connection_label)
        
        self.parse_connection_edit = QTextEdit()
        self.parse_connection_edit.setFont(QFont("Consolas", 10))
        connection_tab.addWidget(self.parse_connection_edit)
        
        self.tabs.addTab(connection_tab_widget, "解析连接配置")
        
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
        """加载提示词"""
        self.generate_sql_edit.setPlainText(self.config.generate_sql_system)
        self.select_tables_edit.setPlainText(self.config.select_tables_system)
        self.select_enum_edit.setPlainText(self.config.select_enum_columns_system)
        self.parse_connection_edit.setPlainText(self.config.parse_connection_config_system)
        self.create_table_select_edit.setPlainText(self.config.create_table_select_reference_tables_system)
        self.create_table_generate_edit.setPlainText(self.config.create_table_generate_sql_system)
        self.edit_table_generate_edit.setPlainText(self.config.edit_table_generate_sql_system)
        self.query_enum_checkbox.setChecked(self.config.query_enum_values)
    
    def reset_to_default(self):
        """重置为默认值"""
        reply = QMessageBox.question(
            self,
            "确认重置",
            "确定要重置所有提示词为默认值吗？当前修改将丢失。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            default_config = PromptConfig()
            self.config = default_config
            self.load_prompts()
    
    def save_and_accept(self):
        """保存并接受"""
        try:
            self.config.generate_sql_system = self.generate_sql_edit.toPlainText()
            self.config.select_tables_system = self.select_tables_edit.toPlainText()
            self.config.select_enum_columns_system = self.select_enum_edit.toPlainText()
            self.config.parse_connection_config_system = self.parse_connection_edit.toPlainText()
            self.config.create_table_select_reference_tables_system = self.create_table_select_edit.toPlainText()
            self.config.create_table_generate_sql_system = self.create_table_generate_edit.toPlainText()
            self.config.edit_table_generate_sql_system = self.edit_table_generate_edit.toPlainText()
            self.config.query_enum_values = self.query_enum_checkbox.isChecked()
            
            self.storage.save_prompts(self.config)
            QMessageBox.information(self, "成功", "提示词配置已保存")
            self.accept()
        except Exception as e:
            QMessageBox.warning(self, "错误", f"保存提示词配置失败: {str(e)}")

