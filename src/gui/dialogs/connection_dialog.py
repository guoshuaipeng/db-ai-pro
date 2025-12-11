"""
数据库连接对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFormLayout,
    QLineEdit,
    QComboBox,
    QCheckBox,
    QPushButton,
    QDialogButtonBox,
    QMessageBox,
    QTextEdit,
    QLabel,
    QGroupBox,
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QIntValidator
from src.core.database_connection import DatabaseConnection, DatabaseType
import logging

logger = logging.getLogger(__name__)


class ConnectionDialog(QDialog):
    """数据库连接配置对话框"""
    
    def __init__(self, parent=None, connection: DatabaseConnection = None):
        super().__init__(parent)
        self.connection = connection
        self.setWindowTitle("添加数据库连接" if not connection else "编辑数据库连接")
        self.setModal(True)
        self.parse_worker = None  # 保存工作线程引用
        self.init_ui()
        
        if connection:
            self.load_connection()
    
    def init_ui(self):
        """初始化UI"""
        main_layout = QVBoxLayout()
        main_layout.setSpacing(20)
        main_layout.setContentsMargins(24, 24, 24, 24)
        self.setLayout(main_layout)
        
        # 设置对话框整体样式
        self.setStyleSheet("""
            QDialog {
                background-color: #f5f7fa;
            }
            QLabel {
                color: #2c3e50;
                font-size: 13px;
            }
            QGroupBox {
                font-weight: 600;
                border: none;
                border-radius: 12px;
                margin-top: 16px;
                padding-top: 20px;
                padding-bottom: 16px;
                background-color: white;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 16px;
                top: 0px;
                padding: 0 8px;
                color: #1976d2;
                font-size: 14px;
            }
        """)
        
        # 创建水平布局（仅在新建连接时使用左右分割）
        if not self.connection:
            content_layout = QHBoxLayout()
            content_layout.setSpacing(16)
            
            # 左侧：AI识别配置区域
            ai_group = QGroupBox("✨ AI 智能识别")
            ai_group.setMinimumWidth(320)
            ai_group.setMaximumWidth(380)
            ai_layout = QVBoxLayout()
            ai_layout.setSpacing(12)
            ai_layout.setContentsMargins(20, 16, 20, 16)
            
            ai_info_label = QLabel("💡 粘贴连接配置\nAI 自动解析")
            ai_info_label.setWordWrap(True)
            ai_info_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            ai_info_label.setStyleSheet("""
                QLabel {
                    color: #5a6c7d;
                    font-size: 12px;
                    padding: 12px;
                    background-color: #e3f2fd;
                    border-radius: 6px;
                    border-left: 3px solid #1976d2;
                    line-height: 1.6;
                }
            """)
            ai_layout.addWidget(ai_info_label)
            
            self.ai_config_edit = QTextEdit()
            self.ai_config_edit.setPlaceholderText("支持多种格式：\n\n• JDBC URL\n  jdbc:mysql://localhost:3306/test\n  ?user=root&password=123456\n\n• Spring 配置\n  spring.datasource.url=...\n  spring.datasource.username=...\n\n• YAML 配置\n• 键值对配置")
            self.ai_config_edit.setMinimumHeight(280)
            self.ai_config_edit.setStyleSheet("""
                QTextEdit {
                    border: 2px solid #e1e8ed;
                    border-radius: 8px;
                    padding: 12px;
                    font-size: 13px;
                    font-family: 'Consolas', 'Monaco', monospace;
                    background-color: #fafbfc;
                    line-height: 1.6;
                }
                QTextEdit:focus {
                    border-color: #1976d2;
                    background-color: white;
                }
                QTextEdit:hover {
                    border-color: #90caf9;
                }
            """)
            ai_layout.addWidget(self.ai_config_edit)
            
            ai_button_layout = QHBoxLayout()
            ai_button_layout.addStretch()
            self.ai_parse_btn = QPushButton("✨ AI 智能识别并填充")
            self.ai_parse_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            self.ai_parse_btn.setStyleSheet("""
                QPushButton {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 #2196f3, stop:1 #1976d2);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 10px 24px;
                    font-weight: 600;
                    font-size: 13px;
                    min-width: 160px;
                }
                QPushButton:hover {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 #1e88e5, stop:1 #1565c0);
                }
                QPushButton:pressed {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 #1565c0, stop:1 #0d47a1);
                }
                QPushButton:disabled {
                    background: #bdbdbd;
                    color: #757575;
                }
            """)
            self.ai_parse_btn.clicked.connect(self.on_ai_parse_clicked)
            ai_button_layout.addWidget(self.ai_parse_btn)
            ai_layout.addLayout(ai_button_layout)
            
            ai_group.setLayout(ai_layout)
            content_layout.addWidget(ai_group)
            
            # 右侧：连接信息分组
            connection_group = QGroupBox("🔌 连接信息")
            connection_group.setMinimumWidth(420)
        else:
            # 编辑模式：不使用左右分割
            content_layout = QVBoxLayout()
            connection_group = QGroupBox("🔌 连接信息")
        
        connection_layout = QVBoxLayout()
        connection_layout.setSpacing(12)
        connection_layout.setContentsMargins(20, 12, 20, 16)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setVerticalSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        form_layout.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
        form_layout.setHorizontalSpacing(16)
        
        # 连接名称
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("例如: 生产数据库、测试环境")
        name_label = QLabel("连接名称 *")
        name_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(name_label, self.name_edit)
        
        # 数据库类型
        self.db_type_combo = QComboBox()
        self.db_type_combo.addItems([db.value for db in DatabaseType])
        self.db_type_combo.currentTextChanged.connect(self.on_db_type_changed)
        db_type_label = QLabel("数据库类型 *")
        db_type_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(db_type_label, self.db_type_combo)
        
        # 主机地址和端口放在一行
        host_port_layout = QHBoxLayout()
        host_port_layout.setSpacing(12)
        self.host_edit = QLineEdit()
        self.host_edit.setPlaceholderText("localhost 或 IP 地址")
        host_port_layout.addWidget(self.host_edit, 3)
        
        port_label = QLabel(":")
        port_label.setStyleSheet("font-weight: bold; font-size: 16px; color: #95a5a6;")
        host_port_layout.addWidget(port_label)
        self.port_edit = QLineEdit()
        self.port_edit.setText("3306")
        self.port_edit.setPlaceholderText("端口")
        self.port_edit.setMaximumWidth(100)
        # 只允许输入1-65535之间的数字
        port_validator = QIntValidator(1, 65535, self.port_edit)
        self.port_edit.setValidator(port_validator)
        host_port_layout.addWidget(self.port_edit, 1)
        
        # 保存标签以便后续隐藏/显示
        self.host_label = QLabel("主机地址 *")
        self.host_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(self.host_label, host_port_layout)
        
        # 数据库名（SQLite时需要文件选择按钮）
        database_layout = QHBoxLayout()
        database_layout.setSpacing(8)
        self.database_edit = QLineEdit()
        self.database_edit.setPlaceholderText("数据库名称")
        database_layout.addWidget(self.database_edit, 1)
        
        # 文件浏览按钮（仅SQLite使用）
        self.browse_btn = QPushButton("📁 浏览")
        self.browse_btn.setMaximumWidth(100)
        self.browse_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.browse_btn.setStyleSheet("""
            QPushButton {
                background-color: #f5f5f5;
                color: #424242;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                padding: 8px 16px;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: #eeeeee;
                border-color: #bdbdbd;
            }
            QPushButton:pressed {
                background-color: #e0e0e0;
            }
        """)
        self.browse_btn.clicked.connect(self.on_browse_database_file)
        self.browse_btn.setVisible(False)  # 默认隐藏
        database_layout.addWidget(self.browse_btn, 0)
        
        # 保存标签以便后续修改文本
        self.database_label = QLabel("数据库名 *")
        self.database_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(self.database_label, database_layout)
        
        # 用户名
        self.username_edit = QLineEdit()
        self.username_edit.setPlaceholderText("数据库用户名")
        username_label = QLabel("用户名 *")
        username_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(username_label, self.username_edit)
        
        # 密码
        self.password_edit = QLineEdit()
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_edit.setPlaceholderText("数据库密码")
        password_label = QLabel("密码")
        password_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(password_label, self.password_edit)
        
        # 保存标签以便后续隐藏/显示
        self.auth_label = username_label
        self.password_label = password_label
        
        # 字符集
        charset_layout = QHBoxLayout()
        charset_layout.setSpacing(12)
        self.charset_edit = QLineEdit()
        self.charset_edit.setText("utf8mb4")
        self.charset_edit.setPlaceholderText("utf8mb4（推荐）")
        charset_layout.addWidget(self.charset_edit, 1)
        self.ssl_check = QCheckBox("🔒 启用 SSL")
        self.ssl_check.setStyleSheet("""
            QCheckBox {
                font-size: 13px;
                spacing: 8px;
                color: #2c3e50;
            }
            QCheckBox::indicator {
                width: 20px;
                height: 20px;
                border: 2px solid #bdc3c7;
                border-radius: 4px;
                background-color: white;
            }
            QCheckBox::indicator:hover {
                border-color: #1976d2;
            }
            QCheckBox::indicator:checked {
                background-color: #1976d2;
                border-color: #1976d2;
                image: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOSIgdmlld0JveD0iMCAwIDEyIDkiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0xIDQuNUw0LjUgOEwxMSAxIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=);
            }
        """)
        charset_layout.addWidget(self.ssl_check, 0)
        
        # 保存标签以便后续隐藏/显示
        self.advanced_label = QLabel("字符集")
        self.advanced_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(self.advanced_label, charset_layout)
        
        # 将表单添加到连接组
        connection_layout.addLayout(form_layout)
        connection_group.setLayout(connection_layout)
        
        # 根据是否有AI识别区域决定布局方式
        if not self.connection:
            content_layout.addWidget(connection_group)
            main_layout.addLayout(content_layout)
        else:
            content_layout.addWidget(connection_group)
            main_layout.addLayout(content_layout)
        
        # 应用现代化样式到输入控件
        input_style = """
            QLineEdit, QComboBox {
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 13px;
                background-color: #fafbfc;
                min-height: 18px;
                selection-background-color: #1976d2;
            }
            QLineEdit:focus, QComboBox:focus {
                border-color: #1976d2;
                background-color: white;
            }
            QLineEdit:hover, QComboBox:hover {
                border-color: #90caf9;
            }
            QComboBox {
                padding-right: 30px;
            }
            QComboBox::drop-down {
                border: none;
                width: 30px;
                background: transparent;
            }
            QComboBox::down-arrow {
                image: none;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 6px solid #607d8b;
                width: 0;
                height: 0;
                margin-right: 8px;
            }
            QComboBox::down-arrow:hover {
                border-top-color: #1976d2;
            }
            QComboBox QAbstractItemView {
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                background-color: white;
                selection-background-color: #e3f2fd;
                selection-color: #1976d2;
                padding: 4px;
            }
        """
        self.name_edit.setStyleSheet(input_style)
        self.db_type_combo.setStyleSheet(input_style)
        self.host_edit.setStyleSheet(input_style)
        self.port_edit.setStyleSheet(input_style)
        self.database_edit.setStyleSheet(input_style)
        self.username_edit.setStyleSheet(input_style)
        self.password_edit.setStyleSheet(input_style)
        self.charset_edit.setStyleSheet(input_style)
        
        main_layout.addStretch()
        
        # 按钮区域
        button_layout = QHBoxLayout()
        button_layout.setSpacing(12)
        button_layout.setContentsMargins(0, 12, 0, 0)
        button_layout.addStretch()
        
        cancel_btn = QPushButton("取消")
        cancel_btn.setMinimumWidth(100)
        cancel_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        cancel_btn.setStyleSheet("""
            QPushButton {
                background-color: white;
                color: #546e7a;
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                padding: 10px 24px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #f5f7fa;
                border-color: #90a4ae;
            }
            QPushButton:pressed {
                background-color: #eceff1;
            }
        """)
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        ok_btn = QPushButton("✓ 保存连接")
        ok_btn.setMinimumWidth(120)
        ok_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        ok_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #4caf50, stop:1 #388e3c);
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 24px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #66bb6a, stop:1 #43a047);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #388e3c, stop:1 #2e7d32);
            }
        """)
        ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(ok_btn)
        
        main_layout.addLayout(button_layout)
        
        # 设置对话框大小
        if not self.connection:
            self.resize(850, 550)  # 新建连接：左右布局，更宽
        else:
            self.resize(550, 0)    # 编辑连接：垂直布局
        
        # 设置默认端口
        self.on_db_type_changed()
    
    def on_db_type_changed(self):
        """数据库类型改变时的处理"""
        db_type = self.db_type_combo.currentText()
        
        # 设置默认端口
        default_ports = {
            DatabaseType.MYSQL.value: 3306,
            DatabaseType.MARIADB.value: 3306,
            DatabaseType.POSTGRESQL.value: 5432,
            DatabaseType.SQLITE.value: 0,
            DatabaseType.ORACLE.value: 1521,
            DatabaseType.SQLSERVER.value: 1433,
            DatabaseType.HIVE.value: 10000,
        }
        
        if db_type in default_ports:
            self.port_edit.setText(str(default_ports[db_type]))
        
        # SQLite特殊处理 - 隐藏不需要的字段
        if db_type == DatabaseType.SQLITE.value:
            # 隐藏主机地址和端口
            self.host_label.setVisible(False)
            self.host_edit.setVisible(False)
            self.port_edit.setVisible(False)
            
            # 隐藏用户名和密码
            self.auth_label.setVisible(False)
            self.username_edit.setVisible(False)
            self.password_label.setVisible(False)
            self.password_edit.setVisible(False)
            
            # 隐藏高级选项（字符集和SSL）
            self.advanced_label.setVisible(False)
            self.charset_edit.setVisible(False)
            self.ssl_check.setVisible(False)
            
            # 修改数据库名标签和占位符
            self.database_label.setText("数据库文件 *")
            self.database_edit.setPlaceholderText("选择或创建 SQLite 数据库文件")
            self.browse_btn.setVisible(True)  # 显示浏览按钮
            
            # 设置默认值（SQLite不需要这些，但为了通过验证）
            if not self.database_edit.text():
                self.host_edit.setText("localhost")
                self.username_edit.setText("sqlite")
                self.password_edit.setText("sqlite")
        else:
            # 显示所有字段
            self.host_label.setVisible(True)
            self.host_edit.setVisible(True)
            self.port_edit.setVisible(True)
            
            self.auth_label.setVisible(True)
            self.username_edit.setVisible(True)
            self.password_label.setVisible(True)
            self.password_edit.setVisible(True)
            
            self.advanced_label.setVisible(True)
            self.charset_edit.setVisible(True)
            self.ssl_check.setVisible(True)
            
            # 恢复数据库名标签和占位符
            self.database_label.setText("数据库名 *")
            self.database_edit.setPlaceholderText("数据库名称")
            self.browse_btn.setVisible(False)  # 隐藏浏览按钮
    
    def on_browse_database_file(self):
        """浏览或新建SQLite数据库文件"""
        from PyQt6.QtWidgets import QFileDialog, QMessageBox
        import os
        
        # 获取当前路径
        current_path = self.database_edit.text().strip()
        if not current_path:
            # 默认使用用户文档目录
            from pathlib import Path
            current_path = str(Path.home() / "Documents")
        
        # 使用保存对话框，允许用户新建或选择现有文件
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "选择或新建 SQLite 数据库文件",
            current_path,
            "SQLite 数据库文件 (*.db);;SQLite3 数据库 (*.sqlite3);;SQLite 数据库 (*.sqlite);;所有文件 (*.*)"
        )
        
        # 如果用户选择了文件
        if file_path:
            # 自动添加扩展名（如果没有）
            if not any(file_path.lower().endswith(ext) for ext in ['.db', '.sqlite', '.sqlite3', '.db3']):
                file_path += '.db'
            
            # 如果文件不存在，提示将创建新数据库
            if not os.path.exists(file_path):
                reply = QMessageBox.question(
                    self,
                    "创建新数据库",
                    f"文件不存在，将创建新的 SQLite 数据库：\n\n{file_path}\n\n是否继续？",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.Yes
                )
                if reply == QMessageBox.StandardButton.No:
                    return
                
                # 创建空的 SQLite 数据库文件
                try:
                    import sqlite3
                    conn = sqlite3.connect(file_path)
                    conn.close()
                    QMessageBox.information(
                        self,
                        "创建成功",
                        f"SQLite 数据库创建成功！\n\n{file_path}"
                    )
                except Exception as e:
                    QMessageBox.critical(
                        self,
                        "创建失败",
                        f"创建数据库失败：{str(e)}"
                    )
                    return
            
            # 更新输入框（使用正斜杠，避免 Windows 反斜杠问题）
            file_path = file_path.replace('\\', '/')
            self.database_edit.setText(file_path)
    
    def load_connection(self):
        """加载连接信息"""
        if not self.connection:
            return
        
        self.name_edit.setText(self.connection.name)
        index = self.db_type_combo.findText(self.connection.db_type.value)
        if index >= 0:
            self.db_type_combo.setCurrentIndex(index)
        self.host_edit.setText(self.connection.host)
        self.port_edit.setText(str(self.connection.port) if self.connection.port > 0 else "")
        self.database_edit.setText(self.connection.database)
        self.username_edit.setText(self.connection.username)
        self.password_edit.setText(self.connection.password.get_secret_value())
        self.charset_edit.setText(self.connection.charset)
        self.ssl_check.setChecked(self.connection.use_ssl)
    
    def get_connection(self) -> DatabaseConnection:
        """获取连接配置"""
        from pydantic import SecretStr
        
        # 解析端口号
        port_text = self.port_edit.text().strip()
        port = int(port_text) if port_text and port_text.isdigit() else 0
        
        return DatabaseConnection(
            id=self.connection.id if self.connection else None,
            name=self.name_edit.text(),
            db_type=DatabaseType(self.db_type_combo.currentText()),
            host=self.host_edit.text() if self.db_type_combo.currentText() != DatabaseType.SQLITE.value else "",
            port=port if self.db_type_combo.currentText() != DatabaseType.SQLITE.value else 0,
            database=self.database_edit.text(),
            username=self.username_edit.text() if self.db_type_combo.currentText() != DatabaseType.SQLITE.value else "",
            password=SecretStr(self.password_edit.text()) if self.db_type_combo.currentText() != DatabaseType.SQLITE.value else SecretStr(""),
            charset=self.charset_edit.text(),
            use_ssl=self.ssl_check.isChecked(),
        )
    
    def closeEvent(self, event):
        """对话框关闭事件"""
        # 停止并等待工作线程完成
        self._stop_worker()
        event.accept()
    
    def _stop_worker(self):
        """停止工作线程"""
        if not self.parse_worker:
            return
        
        try:
            # 检查对象是否仍然有效
            if self.parse_worker.isRunning():
                # 先尝试取消任务
                self.parse_worker.cancel()
                # 等待线程完成（最多1秒）
                if not self.parse_worker.wait(1000):
                    # 如果还在运行，强制终止
                    try:
                        self.parse_worker.terminate()
                        self.parse_worker.wait(1000)
                    except RuntimeError:
                        # 对象已被删除，忽略
                        pass
        except RuntimeError:
            # 对象已被删除，直接清理引用
            self.parse_worker = None
            return
        
        # 断开信号连接，避免回调时出错
        try:
            self.parse_worker.finished.disconnect()
        except (RuntimeError, AttributeError):
            pass
        
        # 清理线程对象
        try:
            self.parse_worker.deleteLater()
        except RuntimeError:
            pass
        
        self.parse_worker = None
    
    def accept(self):
        """确认"""
        # 停止并等待工作线程完成
        self._stop_worker()
        
        # 验证必填字段
        if not self.name_edit.text():
            QMessageBox.warning(self, "警告", "请输入连接名称")
            return
        
        if self.db_type_combo.currentText() != DatabaseType.SQLITE.value:
            if not self.host_edit.text():
                QMessageBox.warning(self, "警告", "请输入主机地址")
                return
            if not self.database_edit.text():
                QMessageBox.warning(self, "警告", "请输入数据库名")
                return
            if not self.username_edit.text():
                QMessageBox.warning(self, "警告", "请输入用户名")
                return
        else:
            if not self.database_edit.text():
                QMessageBox.warning(self, "警告", "请输入数据库文件路径")
                return
        
        super().accept()
    
    def reject(self):
        """取消"""
        # 停止并等待工作线程完成
        self._stop_worker()
        super().reject()
    
    def on_ai_parse_clicked(self):
        """AI识别配置按钮点击事件"""
        config_text = self.ai_config_edit.toPlainText().strip()
        if not config_text:
            QMessageBox.warning(self, "警告", "请输入配置信息")
            return
        
        # 禁用按钮，显示处理中
        self.ai_parse_btn.setEnabled(False)
        self.ai_parse_btn.setText("识别中...")
        
        # 创建并启动工作线程
        # 尝试从parent获取主窗口引用
        main_window = None
        if self.parent():
            # parent可能是主窗口
            main_window = self.parent()
            # 如果parent不是主窗口，尝试查找主窗口
            while main_window and not hasattr(main_window, 'current_ai_model_id'):
                main_window = main_window.parent()
        
        # 如果已有工作线程在运行，先停止它
        self._stop_worker()
        
        self.parse_worker = ConnectionParseWorker(config_text, main_window)
        # 使用更安全的信号连接方式
        self.parse_worker.finished.connect(self.on_ai_parse_finished)
        self.parse_worker.start()
    
    def on_ai_parse_finished(self, result: dict):
        """AI识别完成回调"""
        # 检查对话框是否仍然存在且有效
        try:
            if not self or not hasattr(self, 'ai_parse_btn') or not self.ai_parse_btn:
                return
            
            self.ai_parse_btn.setEnabled(True)
            self.ai_parse_btn.setText("AI识别并填充")
            
            if not result:
                QMessageBox.warning(self, "识别失败", "无法识别配置信息，请检查格式是否正确")
                return
        except RuntimeError:
            # 对话框已被销毁
            return
        
        # 填充表单字段
        try:
            # 数据库类型
            db_type = result.get("db_type", "").lower()
            if db_type:
                db_type_map = {
                    "mysql": DatabaseType.MYSQL.value,
                    "mariadb": DatabaseType.MARIADB.value,
                    "postgresql": DatabaseType.POSTGRESQL.value,
                    "oracle": DatabaseType.ORACLE.value,
                    "sqlserver": DatabaseType.SQLSERVER.value,
                    "sqlite": DatabaseType.SQLITE.value,
                }
                if db_type in db_type_map:
                    index = self.db_type_combo.findText(db_type_map[db_type])
                    if index >= 0:
                        self.db_type_combo.setCurrentIndex(index)
            
            # 主机地址
            host = result.get("host")
            if host:
                self.host_edit.setText(str(host))
            
            # 端口
            port = result.get("port")
            if port:
                try:
                    self.port_edit.setText(str(int(port)))
                except (ValueError, TypeError):
                    pass
            
            # 数据库名
            database = result.get("database")
            if database:
                self.database_edit.setText(str(database))
            
            # 用户名
            username = result.get("username")
            if username:
                self.username_edit.setText(str(username))
            
            # 密码
            password = result.get("password")
            if password:
                self.password_edit.setText(str(password))
            
            # 自动填充连接名称（如果连接名称为空，使用 IP:端口 格式）
            if not self.name_edit.text().strip():
                # 获取host，确保是字符串
                host = result.get("host", "")
                if host:
                    host = str(host).strip()
                
                # 获取port，确保是字符串或数字
                port = result.get("port", "")
                if port:
                    port = str(port).strip()
                
                if host and port:
                    try:
                        # 确保端口是有效的数字
                        port_int = int(port)
                        connection_name = f"{host}:{port_int}"
                        self.name_edit.setText(connection_name)
                    except (ValueError, TypeError):
                        # 如果端口无效，只使用主机名
                        if host:
                            self.name_edit.setText(host)
                elif host:
                    # 如果只有主机名，使用主机名作为连接名称
                    self.name_edit.setText(host)
            
            # 成功填充，不显示提示，让用户直接查看表单
        except Exception as e:
            logger.error(f"填充表单失败: {str(e)}")
            QMessageBox.warning(self, "错误", f"填充表单时出错: {str(e)}")


class ConnectionParseWorker(QThread):
    """连接配置解析工作线程"""
    finished = pyqtSignal(dict)
    
    def __init__(self, config_text: str, parent=None):
        super().__init__()
        self.config_text = config_text
        self.parent_window = parent
        self._is_cancelled = False
    
    def cancel(self):
        """取消任务"""
        self._is_cancelled = True
    
    def run(self):
        """执行解析"""
        result = {}
        try:
            # 检查是否已取消
            if self._is_cancelled:
                return
            
            from src.core.ai_client import AIClient
            
            # 尝试从主窗口获取当前选择的模型
            ai_client = None
            if not self._is_cancelled and self.parent_window and hasattr(self.parent_window, 'current_ai_model_id') and self.parent_window.current_ai_model_id:
                try:
                    from src.core.ai_model_storage import AIModelStorage
                    storage = AIModelStorage()
                    model_config = next((m for m in storage.load_models() if m.id == self.parent_window.current_ai_model_id), None)
                    if model_config:
                        ai_client = AIClient(
                            api_key=model_config.api_key.get_secret_value(),
                            base_url=model_config.get_base_url(),
                            default_model=model_config.default_model,
                            turbo_model=model_config.turbo_model
                        )
                except Exception as e:
                    logger.warning(f"无法从主窗口获取AI模型配置: {str(e)}")
            
            # 检查是否已取消
            if self._is_cancelled:
                return
            
            # 如果无法从主窗口获取，使用默认模型
            if ai_client is None:
                ai_client = AIClient()
            
            # 检查是否已取消
            if self._is_cancelled:
                return
            
            result = ai_client.parse_connection_config(self.config_text)
            
        except Exception as e:
            logger.error(f"AI解析配置失败: {str(e)}")
            result = {}
        finally:
            # 只有在未取消时才发送信号
            if not self._is_cancelled:
                try:
                    self.finished.emit(result)
                except RuntimeError:
                    # 接收者已被销毁，忽略错误
                    pass

