"""
AI模型配置对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFormLayout,
    QLineEdit,
    QComboBox,
    QPushButton,
    QDialogButtonBox,
    QMessageBox,
    QListWidget,
    QListWidgetItem,
    QLabel,
    QCheckBox,
    QGroupBox,
)
from PyQt6.QtCore import Qt
from src.core.ai_model_config import AIModelConfig, AIModelProvider
import uuid


class AIModelDialog(QDialog):
    """AI模型配置对话框"""
    
    def __init__(self, parent=None, model: AIModelConfig = None):
        super().__init__(parent)
        self.model = model
        self.setWindowTitle("添加AI模型配置" if not model else "编辑AI模型配置")
        self.setModal(True)
        self.setMinimumSize(600, 500)
        self.init_ui()
        
        if model:
            self.load_model()
    
    def init_ui(self):
        """初始化UI"""
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(16)
        self.setLayout(main_layout)
        
        # 创建水平分割布局
        content_layout = QHBoxLayout()
        content_layout.setSpacing(16)
        
        # 左侧：提供商选择区域
        left_group = QGroupBox("🤖 选择 AI 提供商")
        left_group.setMaximumWidth(280)
        left_group.setStyleSheet("""
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
        left_layout = QVBoxLayout()
        left_layout.setContentsMargins(16, 12, 16, 16)
        left_layout.setSpacing(8)
        
        # 提供商列表
        self.provider_list = QListWidget()
        self.provider_list.setStyleSheet("""
            QListWidget {
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                background-color: #fafbfc;
                outline: none;
            }
            QListWidget::item {
                padding: 10px;
                border-radius: 6px;
                margin: 2px;
            }
            QListWidget::item:hover {
                background-color: #e3f2fd;
            }
            QListWidget::item:selected {
                background-color: #1976d2;
                color: white;
            }
        """)
        
        # 添加提供商选项
        providers = [
            ("阿里云通义千问", AIModelProvider.ALIYUN_QIANWEN),
            ("OpenAI", AIModelProvider.OPENAI),
            ("DeepSeek", AIModelProvider.DEEPSEEK),
            ("智谱AI (GLM)", AIModelProvider.ZHIPU_GLM),
            ("百度文心一言", AIModelProvider.BAIDU_WENXIN),
            ("讯飞星火", AIModelProvider.XUNFEI_XINGHUO),
            ("Moonshot (Kimi)", AIModelProvider.MOONSHOT),
            ("腾讯混元", AIModelProvider.TENCENT_HUNYUAN),
            ("Anthropic Claude", AIModelProvider.ANTHROPIC_CLAUDE),
            ("Google Gemini", AIModelProvider.GOOGLE_GEMINI),
            ("其他/自定义", AIModelProvider.CUSTOM)
        ]
        
        for name, provider in providers:
            item = QListWidgetItem(name)
            item.setData(Qt.ItemDataRole.UserRole, provider)
            self.provider_list.addItem(item)
        
        self.provider_list.setCurrentRow(0)
        self.provider_list.currentRowChanged.connect(self.on_provider_list_changed)
        left_layout.addWidget(self.provider_list)
        
        left_group.setLayout(left_layout)
        content_layout.addWidget(left_group)
        
        # 右侧：配置表单区域
        right_group = QGroupBox("⚙️ 配置详情")
        right_group.setStyleSheet("""
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
        right_layout = QVBoxLayout()
        right_layout.setContentsMargins(20, 12, 20, 16)
        right_layout.setSpacing(12)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setVerticalSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        
        # 配置名称
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("例如: 阿里云通义千问")
        name_label = QLabel("配置名称 *")
        name_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(name_label, self.name_edit)
        
        # 保存提供商引用（不再使用下拉框）
        self.current_provider = AIModelProvider.ALIYUN_QIANWEN
        
        # API密钥
        api_key_container = QVBoxLayout()
        api_key_container.setSpacing(4)
        
        self.api_key_edit = QLineEdit()
        self.api_key_edit.setPlaceholderText("请输入API密钥")
        # 直接显示API密钥，不使用密码模式
        self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Normal)
        api_key_container.addWidget(self.api_key_edit)
        
        # API密钥获取链接
        self.api_key_link = QLabel()
        self.api_key_link.setOpenExternalLinks(True)
        self.api_key_link.setStyleSheet("QLabel { color: #1976d2; font-size: 11px; }")
        api_key_container.addWidget(self.api_key_link)
        
        api_key_label = QLabel("API 密钥 *")
        api_key_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(api_key_label, api_key_container)
        
        # 基础URL（可选）
        self.base_url_edit = QLineEdit()
        self.base_url_edit.setPlaceholderText("留空使用默认URL")
        base_url_label = QLabel("基础 URL")
        base_url_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(base_url_label, self.base_url_edit)
        
        # Turbo模型
        self.turbo_model_edit = QLineEdit()
        self.turbo_model_edit.setText("qwen-turbo")
        self.turbo_model_edit.setPlaceholderText("例如: qwen-turbo")
        turbo_model_label = QLabel("模型名称 *")
        turbo_model_label.setStyleSheet("font-weight: 500;")
        form_layout.addRow(turbo_model_label, self.turbo_model_edit)
        
        # 选项区域
        options_layout = QHBoxLayout()
        options_layout.setSpacing(20)
        
        self.active_check = QCheckBox("✓ 激活此配置")
        self.active_check.setChecked(True)
        self.active_check.setStyleSheet("""
            QCheckBox {
                font-size: 13px;
                spacing: 8px;
            }
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border: 2px solid #bdc3c7;
                border-radius: 4px;
            }
            QCheckBox::indicator:checked {
                background-color: #1976d2;
                border-color: #1976d2;
            }
        """)
        options_layout.addWidget(self.active_check)
        
        # 移除"设为默认"选项，程序会自动记住当前使用的模型
        options_layout.addStretch()
        
        form_layout.addRow("", options_layout)
        
        right_layout.addLayout(form_layout)
        right_layout.addStretch()
        right_group.setLayout(right_layout)
        content_layout.addWidget(right_group)
        
        main_layout.addLayout(content_layout)
        
        # 应用输入框样式
        input_style = """
            QLineEdit {
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 13px;
                background-color: #fafbfc;
                min-height: 18px;
            }
            QLineEdit:focus {
                border-color: #1976d2;
                background-color: white;
            }
            QLineEdit:hover {
                border-color: #90caf9;
            }
        """
        self.name_edit.setStyleSheet(input_style)
        self.api_key_edit.setStyleSheet(input_style)
        self.base_url_edit.setStyleSheet(input_style)
        self.turbo_model_edit.setStyleSheet(input_style)
        
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
        """)
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        ok_btn = QPushButton("✓ 保存配置")
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
        """)
        ok_btn.clicked.connect(self.validate_and_accept)
        button_layout.addWidget(ok_btn)
        
        main_layout.addLayout(button_layout)
        
        # 设置对话框样式和大小
        self.setStyleSheet("""
            QDialog {
                background-color: #f5f7fa;
            }
        """)
        self.resize(850, 520)
        
        # 初始化提供商相关设置
        self.on_provider_list_changed(0)
    
    def on_provider_list_changed(self, row):
        """提供商列表选择改变时的处理"""
        if row < 0:
            return
        
        item = self.provider_list.item(row)
        if not item:
            return
        
        provider = item.data(Qt.ItemDataRole.UserRole)
        self.current_provider = provider
        
        # 定义每个提供商的默认配置和API密钥获取网址
        provider_configs = {
            AIModelProvider.ALIYUN_QIANWEN: {
                "turbo_model": "qwen-turbo",
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "api_key_url": "https://dashscope.console.aliyun.com/apiKey"
            },
            AIModelProvider.OPENAI: {
                "turbo_model": "gpt-3.5-turbo",
                "base_url": "https://api.openai.com/v1",
                "api_key_url": "https://platform.openai.com/api-keys"
            },
            AIModelProvider.DEEPSEEK: {
                "turbo_model": "deepseek-chat",
                "base_url": "https://api.deepseek.com/v1",
                "api_key_url": "https://platform.deepseek.com/api_keys"
            },
            AIModelProvider.ZHIPU_GLM: {
                "turbo_model": "glm-3-turbo",
                "base_url": "https://open.bigmodel.cn/api/paas/v4",
                "api_key_url": "https://open.bigmodel.cn/usercenter/apikeys"
            },
            AIModelProvider.BAIDU_WENXIN: {
                "turbo_model": "ernie-3.5",
                "base_url": "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop",
                "api_key_url": "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application"
            },
            AIModelProvider.XUNFEI_XINGHUO: {
                "turbo_model": "spark-lite",
                "base_url": "https://spark-api-open.xf-yun.com/v1",
                "api_key_url": "https://console.xfyun.cn/services/bm35"
            },
            AIModelProvider.MOONSHOT: {
                "turbo_model": "moonshot-v1-8k",
                "base_url": "https://api.moonshot.cn/v1",
                "api_key_url": "https://platform.moonshot.cn/console/api-keys"
            },
            AIModelProvider.TENCENT_HUNYUAN: {
                "turbo_model": "hunyuan-lite",
                "base_url": "https://api.hunyuan.cloud.tencent.com/v1",
                "api_key_url": "https://console.cloud.tencent.com/hunyuan/api-key"
            },
            AIModelProvider.ANTHROPIC_CLAUDE: {
                "turbo_model": "claude-3-haiku-20240307",
                "base_url": "https://api.anthropic.com/v1",
                "api_key_url": "https://console.anthropic.com/settings/keys"
            },
            AIModelProvider.GOOGLE_GEMINI: {
                "turbo_model": "gemini-pro",
                "base_url": "https://generativelanguage.googleapis.com/v1",
                "api_key_url": "https://makersuite.google.com/app/apikey"
            },
            AIModelProvider.CUSTOM: {
                "turbo_model": "gpt-3.5-turbo",
                "base_url": "https://api.openai.com/v1",
                "api_key_url": ""
            }
        }
        
        config = provider_configs.get(provider)
        if config:
            self.turbo_model_edit.setText(config["turbo_model"])
            if not self.base_url_edit.text():
                self.base_url_edit.setPlaceholderText(f"默认: {config['base_url']}")
            
            # 更新API密钥获取链接
            if config.get("api_key_url"):
                self.api_key_link.setText(f'<a href="{config["api_key_url"]}">🔗 点击获取 API Key</a>')
                self.api_key_link.setVisible(True)
            else:
                self.api_key_link.setVisible(False)
    
    def load_model(self):
        """加载模型配置"""
        if not self.model:
            return
        
        self.name_edit.setText(self.model.name)
        
        # 设置提供商（在列表中选择）
        for i in range(self.provider_list.count()):
            item = self.provider_list.item(i)
            if item and item.data(Qt.ItemDataRole.UserRole) == self.model.provider:
                self.provider_list.setCurrentRow(i)
                break
        
        # 显示API密钥（直接显示）
        if self.model.api_key and self.model.api_key.get_secret_value():
            self.api_key_edit.setText(self.model.api_key.get_secret_value())
        
        if self.model.base_url:
            self.base_url_edit.setText(self.model.base_url)
        self.turbo_model_edit.setText(self.model.turbo_model)
        self.active_check.setChecked(self.model.is_active)
    
    def validate_and_accept(self):
        """验证并接受"""
        if not self.name_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入配置名称")
            return
        
        if not self.api_key_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入API密钥")
            return
        
        if not self.turbo_model_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入Turbo模型名称")
            return
        
        self.accept()
    
    def get_model(self) -> AIModelConfig:
        """获取模型配置"""
        from pydantic import SecretStr
        
        turbo = self.turbo_model_edit.text().strip()
        return AIModelConfig(
            id=self.model.id if self.model else str(uuid.uuid4()),
            name=self.name_edit.text().strip(),
            provider=self.current_provider,
            api_key=SecretStr(self.api_key_edit.text().strip()),
            base_url=self.base_url_edit.text().strip() or None,
            default_model=turbo,
            turbo_model=turbo,
            is_active=self.active_check.isChecked(),
        )

