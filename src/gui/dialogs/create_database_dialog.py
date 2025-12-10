"""
新建数据库对话框
"""
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QFormLayout,
    QLineEdit, QComboBox, QPushButton, QLabel,
    QDialogButtonBox, QMessageBox, QProgressBar, QFrame
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont
from typing import Optional, List, Tuple
import logging

from src.core.database_connection import DatabaseType, DatabaseConnection
from src.core.database_manager import DatabaseManager

logger = logging.getLogger(__name__)


class FetchCharsetsWorker(QThread):
    """从数据库获取字符集列表的后台线程"""
    
    finished = pyqtSignal(list, list)  # charsets, collations
    error = pyqtSignal(str)
    
    def __init__(self, connection: DatabaseConnection):
        super().__init__()
        self.connection = connection
        self._stop_flag = False
    
    def stop(self):
        """停止线程"""
        self._stop_flag = True
    
    def run(self):
        """获取字符集和排序规则"""
        from sqlalchemy import create_engine, text
        
        engine = None
        try:
            if self._stop_flag:
                return
            
            # 使用 SQLAlchemy 创建连接
            engine = create_engine(
                self.connection.get_connection_string(),
                connect_args=self.connection.get_connect_args()
            )
            
            if self._stop_flag:
                return
            
            with engine.connect() as conn:
                charsets = []
                collations = []
                
                # 根据数据库类型查询字符集
                if self.connection.db_type.value in ('mysql', 'mariadb'):
                    # MySQL/MariaDB: 查询字符集
                    result = conn.execute(text("SHOW CHARACTER SET"))
                    charsets = [(row[0], row[2]) for row in result.fetchall()]  # (charset, description)
                    
                    # 查询排序规则
                    result = conn.execute(text("SHOW COLLATION"))
                    collations = [(row[0], row[1]) for row in result.fetchall()]  # (collation, charset)
                
                elif self.connection.db_type.value == 'postgresql':
                    # PostgreSQL: 查询编码
                    # PostgreSQL的编码是系统级的，列出常用的
                    charsets = [
                        ('UTF8', 'Unicode, 8-bit'),
                        ('SQL_ASCII', '未指定编码'),
                        ('LATIN1', 'ISO 8859-1, Western European'),
                        ('LATIN2', 'ISO 8859-2, Central European'),
                        ('LATIN9', 'ISO 8859-15, Western European with Euro'),
                        ('WIN1252', 'Windows CP1252'),
                        ('WIN1251', 'Windows CP1251'),
                        ('WIN1250', 'Windows CP1250'),
                    ]
                
                elif self.connection.db_type.value == 'sqlserver':
                    # SQL Server: 查询排序规则
                    result = conn.execute(text("SELECT name, description FROM fn_helpcollations()"))
                    collations = [(row[0], row[1]) for row in result.fetchall()]
                
                if not self._stop_flag:
                    self.finished.emit(charsets, collations)
        
        except Exception as e:
            logger.error(f"获取字符集列表失败: {str(e)}", exc_info=True)
            if not self._stop_flag:
                self.error.emit(str(e))
        
        finally:
            if engine:
                try:
                    engine.dispose()
                except:
                    pass


class CreateDatabaseDialog(QDialog):
    """新建数据库对话框"""
    
    def __init__(self, connection: DatabaseConnection, parent=None):
        super().__init__(parent)
        self.connection = connection
        self.charsets = []
        self.collations = []
        self.charset_worker = None
        
        self.setWindowTitle("新建数据库")
        self.setMinimumWidth(480)
        self.setModal(True)
        
        # 设置对话框样式
        self.setStyleSheet("""
            QDialog {
                background-color: #f5f5f5;
            }
            QLabel {
                color: #333;
            }
            QLineEdit {
                padding: 6px 10px;
                border: 2px solid #e0e0e0;
                border-radius: 4px;
                background-color: white;
                font-size: 12px;
            }
            QLineEdit:focus {
                border-color: #2196F3;
                background-color: #ffffff;
            }
            QComboBox {
                padding: 6px 10px;
                border: 2px solid #e0e0e0;
                border-radius: 4px;
                background-color: white;
                font-size: 12px;
                min-height: 16px;
            }
            QComboBox:focus {
                border-color: #2196F3;
            }
            QComboBox::drop-down {
                border: none;
                width: 30px;
            }
            QComboBox::down-arrow {
                image: none;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 6px solid #666;
                margin-right: 8px;
            }
            QPushButton {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                min-width: 70px;
            }
            QPushButton:hover {
                opacity: 0.9;
            }
            QPushButton:pressed {
                opacity: 0.8;
            }
        """)
        
        self.init_ui()
        self.load_charsets()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)
        self.setLayout(layout)
        
        # 标题区域
        title_frame = QFrame()
        title_frame.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 6px;
                padding: 12px;
            }
        """)
        title_layout = QVBoxLayout()
        title_layout.setSpacing(4)
        title_frame.setLayout(title_layout)
        
        # 标题
        title_label = QLabel("🗄️ 新建数据库")
        title_font = QFont()
        title_font.setPointSize(13)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setStyleSheet("color: #1976D2;")
        title_layout.addWidget(title_label)
        
        # 说明标签
        info_label = QLabel(f"在连接 <b>{self.connection.name}</b> ({self.connection.db_type.value.upper()}) 中创建")
        info_label.setStyleSheet("color: #666; font-size: 11px;")
        title_layout.addWidget(info_label)
        
        layout.addWidget(title_frame)
        
        # 表单区域
        form_frame = QFrame()
        form_frame.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 6px;
                padding: 12px;
            }
        """)
        form_main_layout = QVBoxLayout()
        form_frame.setLayout(form_main_layout)
        
        # 表单标题
        form_title = QLabel("📝 基本信息")
        form_title_font = QFont()
        form_title_font.setPointSize(11)
        form_title_font.setBold(True)
        form_title.setFont(form_title_font)
        form_title.setStyleSheet("color: #333; margin-bottom: 6px;")
        form_main_layout.addWidget(form_title)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(10)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        
        # 数据库名称
        self.database_name_edit = QLineEdit()
        self.database_name_edit.setPlaceholderText("例如：my_database")
        name_label = QLabel("数据库名称 *")
        name_label.setStyleSheet("font-weight: 500; color: #333;")
        form_layout.addRow(name_label, self.database_name_edit)
        
        # 字符集（根据数据库类型显示）
        if self.connection.db_type.value in ('mysql', 'mariadb', 'postgresql'):
            self.charset_combo = QComboBox()
            self.charset_combo.setEditable(False)
            charset_label = QLabel("字符集")
            charset_label.setStyleSheet("font-weight: 500; color: #333;")
            form_layout.addRow(charset_label, self.charset_combo)
            
            # 加载提示
            self.charset_loading_label = QLabel("⏳ 正在加载字符集列表...")
            self.charset_loading_label.setStyleSheet("color: #2196F3; font-size: 11px;")
            form_layout.addRow("", self.charset_loading_label)
        
        # 排序规则（MySQL/MariaDB 和 SQL Server）
        if self.connection.db_type.value in ('mysql', 'mariadb', 'sqlserver'):
            self.collation_combo = QComboBox()
            self.collation_combo.setEditable(True)
            collation_label = QLabel("排序规则")
            collation_label.setStyleSheet("font-weight: 500; color: #333;")
            form_layout.addRow(collation_label, self.collation_combo)
            
            if self.connection.db_type.value in ('mysql', 'mariadb'):
                # MySQL: 字符集改变时更新排序规则
                self.charset_combo.currentTextChanged.connect(self.on_charset_changed)
        
        form_main_layout.addLayout(form_layout)
        layout.addWidget(form_frame)
        
        # 提示信息区域
        tip_frame = QFrame()
        tip_frame.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                                          stop:0 #E3F2FD, stop:1 #BBDEFB);
                border-left: 3px solid #2196F3;
                border-radius: 4px;
                padding: 10px;
            }
        """)
        tip_layout = QVBoxLayout()
        tip_layout.setSpacing(4)
        tip_frame.setLayout(tip_layout)
        
        # 提示标题
        tip_title = QLabel("💡 推荐配置")
        tip_title_font = QFont()
        tip_title_font.setBold(True)
        tip_title.setFont(tip_title_font)
        tip_title.setStyleSheet("color: #1976D2; font-size: 11px;")
        tip_layout.addWidget(tip_title)
        
        # 提示内容
        tip_label = QLabel()
        if self.connection.db_type.value in ('mysql', 'mariadb'):
            tip_label.setText(
                "✓ 字符集：<b>utf8mb4</b><br>"
                "✓ 排序规则：<b>utf8mb4_unicode_ci</b>"
            )
        elif self.connection.db_type.value == 'postgresql':
            tip_label.setText(
                "✓ 编码：<b>UTF8</b>（支持完整 Unicode）"
            )
        elif self.connection.db_type.value == 'sqlserver':
            tip_label.setText(
                "✓ 推荐：<b>Chinese_PRC_CI_AS</b>"
            )
        
        tip_label.setWordWrap(True)
        tip_label.setStyleSheet("color: #0D47A1; font-size: 10px; line-height: 1.4;")
        tip_layout.addWidget(tip_label)
        
        layout.addWidget(tip_frame)
        
        layout.addStretch()
        
        # 按钮区域
        button_layout = QHBoxLayout()
        button_layout.setSpacing(8)
        button_layout.addStretch()
        
        # 取消按钮
        cancel_btn = QPushButton("取消")
        cancel_btn.setStyleSheet("""
            QPushButton {
                background-color: #f5f5f5;
                color: #666;
                border: 1px solid #ddd;
            }
            QPushButton:hover {
                background-color: #e0e0e0;
            }
        """)
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        # 创建按钮
        create_btn = QPushButton("✓ 创建数据库")
        create_btn.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
        """)
        create_btn.clicked.connect(self.accept)
        create_btn.setDefault(True)
        button_layout.addWidget(create_btn)
        
        layout.addLayout(button_layout)
        
        # 设置焦点
        self.database_name_edit.setFocus()
    
    def load_charsets(self):
        """从数据库加载字符集列表"""
        # 只对支持的数据库类型加载字符集
        if self.connection.db_type.value not in ('mysql', 'mariadb', 'postgresql', 'sqlserver'):
            return
        
        # 启动后台线程获取字符集
        self.charset_worker = FetchCharsetsWorker(self.connection)
        self.charset_worker.finished.connect(self.on_charsets_loaded)
        self.charset_worker.error.connect(self.on_charsets_error)
        self.charset_worker.start()
    
    def on_charsets_loaded(self, charsets: List[Tuple[str, str]], collations: List[Tuple[str, str]]):
        """字符集加载完成"""
        self.charsets = charsets
        self.collations = collations
        
        # 隐藏加载提示
        if hasattr(self, 'charset_loading_label'):
            self.charset_loading_label.hide()
        
        # 填充字符集下拉框
        if hasattr(self, 'charset_combo') and charsets:
            self.charset_combo.clear()
            for charset, description in charsets:
                self.charset_combo.addItem(f"{charset} - {description}", charset)
            
            # 设置默认值
            if self.connection.db_type.value in ('mysql', 'mariadb'):
                # 默认选择 utf8mb4
                for i in range(self.charset_combo.count()):
                    if self.charset_combo.itemData(i) == 'utf8mb4':
                        self.charset_combo.setCurrentIndex(i)
                        break
            elif self.connection.db_type.value == 'postgresql':
                # 默认选择 UTF8
                for i in range(self.charset_combo.count()):
                    if self.charset_combo.itemData(i) == 'UTF8':
                        self.charset_combo.setCurrentIndex(i)
                        break
        
        # 填充排序规则下拉框
        if hasattr(self, 'collation_combo'):
            if self.connection.db_type.value in ('mysql', 'mariadb'):
                # MySQL: 根据字符集过滤排序规则
                self.on_charset_changed(self.charset_combo.currentData())
            elif self.connection.db_type.value == 'sqlserver':
                # SQL Server: 显示所有排序规则
                self.collation_combo.clear()
                for collation, description in collations[:100]:  # 限制数量，太多了
                    self.collation_combo.addItem(f"{collation}", collation)
                
                # 设置默认值
                default_collations = ['Chinese_PRC_CI_AS', 'Latin1_General_CI_AS']
                for default_col in default_collations:
                    for i in range(self.collation_combo.count()):
                        if self.collation_combo.itemData(i) == default_col:
                            self.collation_combo.setCurrentIndex(i)
                            break
        
        logger.info(f"已加载 {len(charsets)} 个字符集，{len(collations)} 个排序规则")
    
    def on_charsets_error(self, error: str):
        """字符集加载失败"""
        logger.warning(f"获取字符集列表失败: {error}")
        
        # 隐藏加载提示
        if hasattr(self, 'charset_loading_label'):
            self.charset_loading_label.setText("无法获取字符集列表，将使用默认值")
            self.charset_loading_label.setStyleSheet("color: orange;")
        
        # 使用默认值填充
        if hasattr(self, 'charset_combo'):
            if self.connection.db_type.value in ('mysql', 'mariadb'):
                self.charset_combo.addItem("utf8mb4 - Unicode (推荐)", "utf8mb4")
                self.charset_combo.addItem("utf8 - Unicode (旧版)", "utf8")
                self.charset_combo.addItem("latin1 - Western European", "latin1")
                self.charset_combo.setCurrentIndex(0)
            elif self.connection.db_type.value == 'postgresql':
                self.charset_combo.addItem("UTF8 - Unicode (推荐)", "UTF8")
                self.charset_combo.addItem("LATIN1 - Western European", "LATIN1")
                self.charset_combo.setCurrentIndex(0)
        
        if hasattr(self, 'collation_combo'):
            if self.connection.db_type.value in ('mysql', 'mariadb'):
                self.collation_combo.addItem("utf8mb4_unicode_ci", "utf8mb4_unicode_ci")
                self.collation_combo.addItem("utf8mb4_general_ci", "utf8mb4_general_ci")
                self.collation_combo.setCurrentIndex(0)
            elif self.connection.db_type.value == 'sqlserver':
                self.collation_combo.addItem("Chinese_PRC_CI_AS", "Chinese_PRC_CI_AS")
                self.collation_combo.addItem("Latin1_General_CI_AS", "Latin1_General_CI_AS")
                self.collation_combo.setCurrentIndex(0)
    
    def on_charset_changed(self, charset: str):
        """字符集改变时更新排序规则"""
        if not hasattr(self, 'collation_combo'):
            return
        
        # 过滤出当前字符集的排序规则
        self.collation_combo.clear()
        
        matching_collations = [
            (col, cs) for col, cs in self.collations 
            if cs == charset
        ]
        
        if matching_collations:
            for collation, _ in matching_collations:
                self.collation_combo.addItem(collation, collation)
            
            # 设置默认值
            if charset == 'utf8mb4':
                for i in range(self.collation_combo.count()):
                    if 'unicode_ci' in self.collation_combo.itemData(i):
                        self.collation_combo.setCurrentIndex(i)
                        break
    
    def get_database_name(self) -> str:
        """获取数据库名称"""
        return self.database_name_edit.text().strip()
    
    def get_charset(self) -> Optional[str]:
        """获取字符集"""
        if hasattr(self, 'charset_combo'):
            return self.charset_combo.currentData()
        return None
    
    def get_collation(self) -> Optional[str]:
        """获取排序规则"""
        if hasattr(self, 'collation_combo'):
            return self.collation_combo.currentData()
        return None
    
    def accept(self):
        """确认按钮"""
        # 验证数据库名称
        db_name = self.get_database_name()
        if not db_name:
            QMessageBox.warning(self, "错误", "数据库名称不能为空")
            return
        
        super().accept()
    
    def closeEvent(self, event):
        """关闭对话框时清理资源"""
        if self.charset_worker and self.charset_worker.isRunning():
            self.charset_worker.stop()
            self.charset_worker.wait(1000)
        super().closeEvent(event)

