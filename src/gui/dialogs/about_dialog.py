"""
关于对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QGroupBox,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap, QFont


class AboutDialog(QDialog):
    """关于对话框"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("关于 DataAI")
        self.setModal(True)
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(20)
        self.setLayout(main_layout)
        
        # 设置对话框样式
        self.setStyleSheet("""
            QDialog {
                background-color: #f5f7fa;
            }
            QLabel {
                color: #2c3e50;
            }
            QGroupBox {
                font-weight: 600;
                border: none;
                border-radius: 12px;
                margin-top: 16px;
                padding-top: 20px;
                padding-bottom: 16px;
                background-color: white;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 16px;
                padding: 0 8px;
                color: #1976d2;
                font-size: 14px;
            }
        """)
        
        # 创建水平布局
        content_layout = QHBoxLayout()
        content_layout.setSpacing(16)
        
        # 左侧：Logo 和基本信息
        left_group = QGroupBox("📱 应用信息")
        left_group.setMaximumWidth(280)
        left_layout = QVBoxLayout()
        left_layout.setContentsMargins(20, 16, 20, 20)
        left_layout.setSpacing(16)
        
        # Logo 区域
        logo_container = QVBoxLayout()
        logo_container.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Logo 文字（如果有图片可以用 QLabel 加载图片）
        logo_label = QLabel("🗄️")
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo_font = QFont()
        logo_font.setPointSize(48)
        logo_label.setFont(logo_font)
        logo_container.addWidget(logo_label)
        
        # 应用名称
        app_name = QLabel("DataAI")
        app_name.setAlignment(Qt.AlignmentFlag.AlignCenter)
        app_name_font = QFont()
        app_name_font.setPointSize(20)
        app_name_font.setBold(True)
        app_name.setFont(app_name_font)
        app_name.setStyleSheet("color: #1976d2;")
        logo_container.addWidget(app_name)
        
        # 应用副标题
        subtitle = QLabel("AI 驱动的数据库管理工具")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle.setStyleSheet("color: #7f8c8d; font-size: 12px;")
        logo_container.addWidget(subtitle)
        
        left_layout.addLayout(logo_container)
        left_layout.addSpacing(10)
        
        # 版本信息
        version_label = QLabel("📌 版本 0.2.0")
        version_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #34495e;")
        left_layout.addWidget(version_label)
        
        # 作者信息
        author_layout = QVBoxLayout()
        author_layout.setSpacing(6)
        
        author_label = QLabel("👤 作者: codeyG")
        author_label.setStyleSheet("font-size: 13px;")
        author_layout.addWidget(author_label)
        
        email_label = QLabel("📧 邮箱: 550187704@qq.com")
        email_label.setStyleSheet("font-size: 13px;")
        author_layout.addWidget(email_label)
        
        left_layout.addLayout(author_layout)
        left_layout.addSpacing(10)
        
        # 开源协议
        license_label = QLabel("📄 开源协议: MIT License")
        license_label.setStyleSheet("font-size: 13px; color: #27ae60; font-weight: bold;")
        left_layout.addWidget(license_label)
        
        left_layout.addStretch()
        left_group.setLayout(left_layout)
        content_layout.addWidget(left_group)
        
        # 右侧：功能特性和支持的数据库
        right_group = QGroupBox("✨ 功能与支持")
        right_layout = QVBoxLayout()
        right_layout.setContentsMargins(20, 16, 20, 20)
        right_layout.setSpacing(16)
        
        # 功能特性
        features_label = QLabel("🎯 功能特性")
        features_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #1976d2; margin-bottom: 8px;")
        right_layout.addWidget(features_label)
        
        features_list = [
            "• AI 智能 SQL 生成",
            "• AI 连接配置识别",
            "• 多数据库支持",
            "• 查询结果直接编辑",
            "• 数据批量删除",
            "• 数据库结构同步",
            "• 数据导入导出",
            "• 表结构可视化"
        ]
        
        features_container = QLabel("\n".join(features_list))
        features_container.setStyleSheet("""
            QLabel {
                font-size: 13px;
                line-height: 1.8;
                padding: 12px;
                background-color: #e3f2fd;
                border-radius: 8px;
                border-left: 4px solid #1976d2;
            }
        """)
        right_layout.addWidget(features_container)
        
        right_layout.addSpacing(10)
        
        # 支持的数据库
        databases_label = QLabel("🗄️ 支持的数据库")
        databases_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #1976d2; margin-bottom: 8px;")
        right_layout.addWidget(databases_label)
        
        databases_list = [
            "• MySQL / MariaDB",
            "• PostgreSQL",
            "• SQLite",
            "• Oracle",
            "• SQL Server",
            "• Hive"
        ]
        
        databases_container = QLabel("\n".join(databases_list))
        databases_container.setStyleSheet("""
            QLabel {
                font-size: 13px;
                line-height: 1.8;
                padding: 12px;
                background-color: #fff3e0;
                border-radius: 8px;
                border-left: 4px solid #ff9800;
            }
        """)
        right_layout.addWidget(databases_container)
        
        right_layout.addStretch()
        right_group.setLayout(right_layout)
        content_layout.addWidget(right_group)
        
        main_layout.addLayout(content_layout)
        
        # 底部按钮
        button_layout = QHBoxLayout()
        button_layout.setContentsMargins(0, 12, 0, 0)
        button_layout.addStretch()
        
        close_btn = QPushButton("✓ 关闭")
        close_btn.setMinimumWidth(120)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #1976d2, stop:1 #1565c0);
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 24px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2196f3, stop:1 #1976d2);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #1565c0, stop:1 #0d47a1);
            }
        """)
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)
        
        main_layout.addLayout(button_layout)
        
        # 设置对话框大小
        self.resize(750, 480)
















