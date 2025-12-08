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
        layout = QVBoxLayout()
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)
        self.setLayout(layout)
        
        # AI识别配置区域（仅在新建连接时显示）
        if not self.connection:
            ai_group = QGroupBox("✨ AI智能识别")
            ai_group.setStyleSheet("""
                QGroupBox {
                    font-weight: 500;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    margin-top: 12px;
                    padding-top: 12px;
                    background-color: #fafafa;
                }
                QGroupBox::title {
                    subcontrol-origin: margin;
                    left: 12px;
                    padding: 0 8px;
                    color: #1976d2;
                }
            """)
            ai_layout = QVBoxLayout()
            ai_layout.setSpacing(10)
            ai_layout.setContentsMargins(12, 12, 12, 12)
            
            ai_info_label = QLabel("粘贴连接配置（支持YAML、Properties、JDBC URL等格式）")
            ai_info_label.setWordWrap(True)
            ai_info_label.setStyleSheet("color: #666; font-size: 12px;")
            ai_layout.addWidget(ai_info_label)
            
            self.ai_config_edit = QTextEdit()
            self.ai_config_edit.setPlaceholderText("例如：\nspring.datasource.url=jdbc:mysql://localhost:3306/test\nspring.datasource.username=root\nspring.datasource.password=123456")
            self.ai_config_edit.setMaximumHeight(80)
            self.ai_config_edit.setStyleSheet("""
                QTextEdit {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px;
                    font-size: 12px;
                    background-color: white;
                }
                QTextEdit:focus {
                    border-color: #1976d2;
                }
            """)
            ai_layout.addWidget(self.ai_config_edit)
            
            ai_button_layout = QHBoxLayout()
            ai_button_layout.addStretch()
            self.ai_parse_btn = QPushButton("🔍 AI识别并填充")
            self.ai_parse_btn.setStyleSheet("""
                QPushButton {
                    background-color: #1976d2;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    font-weight: 500;
                    min-width: 120px;
                }
                QPushButton:hover {
                    background-color: #1565c0;
                }
                QPushButton:pressed {
                    background-color: #0d47a1;
                }
                QPushButton:disabled {
                    background-color: #ccc;
                    color: #999;
                }
            """)
            self.ai_parse_btn.clicked.connect(self.on_ai_parse_clicked)
            ai_button_layout.addWidget(self.ai_parse_btn)
            ai_layout.addLayout(ai_button_layout)
            
            ai_group.setLayout(ai_layout)
            layout.addWidget(ai_group)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setVerticalSpacing(14)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        # 设置行高，确保标签和输入框对齐
        form_layout.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
        
        # 连接名称
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("例如: 生产数据库")
        form_layout.addRow("连接名称", self.name_edit)
        
        # 数据库类型
        self.db_type_combo = QComboBox()
        self.db_type_combo.addItems([db.value for db in DatabaseType])
        self.db_type_combo.currentTextChanged.connect(self.on_db_type_changed)
        form_layout.addRow("数据库类型", self.db_type_combo)
        
        # 主机地址和端口放在一行
        host_port_layout = QHBoxLayout()
        host_port_layout.setSpacing(10)
        self.host_edit = QLineEdit()
        self.host_edit.setPlaceholderText("localhost")
        host_port_layout.addWidget(self.host_edit, 2)
        
        port_label = QLabel("端口")
        port_label.setStyleSheet("min-width: 40px;")
        host_port_layout.addWidget(port_label)
        self.port_edit = QLineEdit()
        self.port_edit.setText("3306")
        self.port_edit.setPlaceholderText("3306")
        self.port_edit.setMaximumWidth(80)
        # 只允许输入1-65535之间的数字
        port_validator = QIntValidator(1, 65535, self.port_edit)
        self.port_edit.setValidator(port_validator)
        host_port_layout.addWidget(self.port_edit, 0)
        form_layout.addRow("主机地址", host_port_layout)
        
        # 数据库名
        self.database_edit = QLineEdit()
        form_layout.addRow("数据库名", self.database_edit)
        
        # 用户名和密码放在一行
        auth_layout = QHBoxLayout()
        auth_layout.setSpacing(10)
        auth_layout.setContentsMargins(0, 0, 0, 0)
        self.username_edit = QLineEdit()
        self.username_edit.setPlaceholderText("用户名")
        auth_layout.addWidget(self.username_edit, 1)
        self.password_edit = QLineEdit()
        self.password_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_edit.setPlaceholderText("密码")
        auth_layout.addWidget(self.password_edit, 1)
        form_layout.addRow("用户名", auth_layout)
        
        # 字符集和SSL放在一行
        advanced_layout = QHBoxLayout()
        advanced_layout.setSpacing(10)
        self.charset_edit = QLineEdit()
        self.charset_edit.setText("utf8mb4")
        self.charset_edit.setPlaceholderText("字符集")
        advanced_layout.addWidget(self.charset_edit, 1)
        self.ssl_check = QCheckBox("使用SSL")
        advanced_layout.addWidget(self.ssl_check, 0)
        form_layout.addRow("高级选项", advanced_layout)
        
        # 设置标签样式，确保对齐
        label_style = """
            QLabel {
                padding: 0px;
                margin: 0px;
            }
        """
        # 为表单标签应用样式
        for i in range(form_layout.rowCount()):
            label_item = form_layout.itemAt(i, QFormLayout.ItemRole.LabelRole)
            if label_item:
                label = label_item.widget()
                if label and isinstance(label, QLabel):
                    label.setStyleSheet(label_style)
                    label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        
        # 应用样式到输入控件
        input_style = """
            QLineEdit, QComboBox {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 8px 12px;
                font-size: 13px;
                background-color: white;
                min-height: 20px;
            }
            QLineEdit:focus, QComboBox:focus {
                border-color: #1976d2;
                outline: none;
            }
            QComboBox::drop-down {
                border: none;
                width: 20px;
            }
            QComboBox::down-arrow {
                image: none;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 5px solid #666;
                width: 0;
                height: 0;
            }
            QCheckBox {
                font-size: 13px;
                spacing: 6px;
            }
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border: 1px solid #ddd;
                border-radius: 3px;
                background-color: white;
            }
            QCheckBox::indicator:checked {
                background-color: #1976d2;
                border-color: #1976d2;
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
        
        layout.addLayout(form_layout)
        layout.addStretch()
        
        # 按钮
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        button_box.setStyleSheet("""
            QPushButton {
                min-width: 80px;
                padding: 8px 20px;
                border-radius: 4px;
                font-weight: 500;
                font-size: 13px;
            }
            QPushButton[text="OK"], QPushButton[text="确定"] {
                background-color: #1976d2;
                color: white;
                border: none;
            }
            QPushButton[text="OK"]:hover, QPushButton[text="确定"]:hover {
                background-color: #1565c0;
            }
            QPushButton[text="Cancel"], QPushButton[text="取消"] {
                background-color: white;
                color: #333;
                border: 1px solid #ddd;
            }
            QPushButton[text="Cancel"]:hover, QPushButton[text="取消"]:hover {
                background-color: #f5f5f5;
                border-color: #bbb;
            }
        """)
        layout.addWidget(button_box)
        
        # 设置对话框样式
        self.setStyleSheet("""
            QDialog {
                background-color: #ffffff;
            }
            QLabel {
                color: #333;
                font-size: 13px;
            }
        """)
        
        # 设置对话框大小
        self.resize(480, 0)
        
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
        }
        
        if db_type in default_ports:
            self.port_edit.setText(str(default_ports[db_type]))
        
        # SQLite特殊处理
        if db_type == DatabaseType.SQLITE.value:
            self.host_edit.setEnabled(False)
            self.port_edit.setEnabled(False)
            self.username_edit.setEnabled(False)
            self.password_edit.setEnabled(False)
            self.database_edit.setPlaceholderText("数据库文件路径")
        else:
            self.host_edit.setEnabled(True)
            self.port_edit.setEnabled(True)
            self.username_edit.setEnabled(True)
            self.password_edit.setEnabled(True)
            self.database_edit.setPlaceholderText("")
    
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

