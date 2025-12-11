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
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 表单布局
        form_layout = QFormLayout()
        
        # 配置名称
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("例如: 阿里云通义千问")
        self.name_edit.setMinimumWidth(300)
        form_layout.addRow("配置名称:", self.name_edit)
        
        # 提供商
        self.provider_combo = QComboBox()
        self.provider_combo.addItem("阿里云通义千问", AIModelProvider.ALIYUN_QIANWEN)
        self.provider_combo.addItem("OpenAI", AIModelProvider.OPENAI)
        self.provider_combo.addItem("DeepSeek", AIModelProvider.DEEPSEEK)
        self.provider_combo.addItem("智谱AI (GLM)", AIModelProvider.ZHIPU_GLM)
        self.provider_combo.addItem("百度文心一言", AIModelProvider.BAIDU_WENXIN)
        self.provider_combo.addItem("讯飞星火", AIModelProvider.XUNFEI_XINGHUO)
        self.provider_combo.addItem("Moonshot (Kimi)", AIModelProvider.MOONSHOT)
        self.provider_combo.addItem("腾讯混元", AIModelProvider.TENCENT_HUNYUAN)
        self.provider_combo.addItem("Anthropic Claude", AIModelProvider.ANTHROPIC_CLAUDE)
        self.provider_combo.addItem("Google Gemini", AIModelProvider.GOOGLE_GEMINI)
        self.provider_combo.addItem("其他/自定义", AIModelProvider.CUSTOM)
        self.provider_combo.currentIndexChanged.connect(self.on_provider_changed)
        self.provider_combo.setMinimumWidth(300)
        form_layout.addRow("提供商:", self.provider_combo)
        
        # API密钥
        api_key_layout = QVBoxLayout()
        api_key_layout.setSpacing(5)
        
        self.api_key_edit = QLineEdit()
        self.api_key_edit.setPlaceholderText("请输入API密钥")
        self.api_key_edit.setMinimumWidth(300)
        api_key_layout.addWidget(self.api_key_edit)
        
        # API密钥获取链接
        self.api_key_link = QLabel()
        self.api_key_link.setOpenExternalLinks(True)
        self.api_key_link.setStyleSheet("QLabel { color: #0066CC; font-size: 11px; }")
        api_key_layout.addWidget(self.api_key_link)
        
        form_layout.addRow("API密钥:", api_key_layout)
        
        # 基础URL（可选）
        self.base_url_edit = QLineEdit()
        self.base_url_edit.setPlaceholderText("留空使用默认URL")
        self.base_url_edit.setMinimumWidth(300)
        form_layout.addRow("基础URL (可选):", self.base_url_edit)
        
        # 默认模型
        self.default_model_edit = QLineEdit()
        self.default_model_edit.setText("qwen-plus")
        self.default_model_edit.setPlaceholderText("例如: qwen-plus")
        self.default_model_edit.setMinimumWidth(300)
        form_layout.addRow("默认模型:", self.default_model_edit)
        
        # Turbo模型
        self.turbo_model_edit = QLineEdit()
        self.turbo_model_edit.setText("qwen-turbo")
        self.turbo_model_edit.setPlaceholderText("例如: qwen-turbo")
        self.turbo_model_edit.setMinimumWidth(300)
        form_layout.addRow("Turbo模型:", self.turbo_model_edit)
        
        # 激活状态
        self.active_check = QCheckBox()
        self.active_check.setChecked(True)
        form_layout.addRow("激活:", self.active_check)
        
        # 设为默认
        self.default_check = QCheckBox()
        form_layout.addRow("设为默认:", self.default_check)
        
        layout.addLayout(form_layout)
        
        # 按钮
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.validate_and_accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)
        
        # 初始化提供商相关设置
        self.on_provider_changed()
    
    def on_provider_changed(self):
        """提供商改变时的处理"""
        provider = self.provider_combo.currentData()
        
        # 定义每个提供商的默认配置和API密钥获取网址
        provider_configs = {
            AIModelProvider.ALIYUN_QIANWEN: {
                "default_model": "qwen-plus",
                "turbo_model": "qwen-turbo",
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "api_key_url": "https://dashscope.console.aliyun.com/apiKey"
            },
            AIModelProvider.OPENAI: {
                "default_model": "gpt-4",
                "turbo_model": "gpt-3.5-turbo",
                "base_url": "https://api.openai.com/v1",
                "api_key_url": "https://platform.openai.com/api-keys"
            },
            AIModelProvider.DEEPSEEK: {
                "default_model": "deepseek-chat",
                "turbo_model": "deepseek-chat",
                "base_url": "https://api.deepseek.com/v1",
                "api_key_url": "https://platform.deepseek.com/api_keys"
            },
            AIModelProvider.ZHIPU_GLM: {
                "default_model": "glm-4",
                "turbo_model": "glm-3-turbo",
                "base_url": "https://open.bigmodel.cn/api/paas/v4",
                "api_key_url": "https://open.bigmodel.cn/usercenter/apikeys"
            },
            AIModelProvider.BAIDU_WENXIN: {
                "default_model": "ernie-4.0",
                "turbo_model": "ernie-3.5",
                "base_url": "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop",
                "api_key_url": "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application"
            },
            AIModelProvider.XUNFEI_XINGHUO: {
                "default_model": "spark-4.0",
                "turbo_model": "spark-lite",
                "base_url": "https://spark-api-open.xf-yun.com/v1",
                "api_key_url": "https://console.xfyun.cn/services/bm35"
            },
            AIModelProvider.MOONSHOT: {
                "default_model": "moonshot-v1-8k",
                "turbo_model": "moonshot-v1-8k",
                "base_url": "https://api.moonshot.cn/v1",
                "api_key_url": "https://platform.moonshot.cn/console/api-keys"
            },
            AIModelProvider.TENCENT_HUNYUAN: {
                "default_model": "hunyuan-large",
                "turbo_model": "hunyuan-lite",
                "base_url": "https://api.hunyuan.cloud.tencent.com/v1",
                "api_key_url": "https://console.cloud.tencent.com/hunyuan/api-key"
            },
            AIModelProvider.ANTHROPIC_CLAUDE: {
                "default_model": "claude-3-5-sonnet-20241022",
                "turbo_model": "claude-3-haiku-20240307",
                "base_url": "https://api.anthropic.com/v1",
                "api_key_url": "https://console.anthropic.com/settings/keys"
            },
            AIModelProvider.GOOGLE_GEMINI: {
                "default_model": "gemini-pro",
                "turbo_model": "gemini-pro",
                "base_url": "https://generativelanguage.googleapis.com/v1",
                "api_key_url": "https://makersuite.google.com/app/apikey"
            },
            AIModelProvider.CUSTOM: {
                "default_model": "gpt-3.5-turbo",
                "turbo_model": "gpt-3.5-turbo",
                "base_url": "https://api.openai.com/v1",
                "api_key_url": ""
            }
        }
        
        config = provider_configs.get(provider)
        if config:
            self.default_model_edit.setText(config["default_model"])
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
        
        # 设置提供商
        for i in range(self.provider_combo.count()):
            if self.provider_combo.itemData(i) == self.model.provider:
                self.provider_combo.setCurrentIndex(i)
                break
        
        # 显示API密钥（已加密，显示为占位符）
        # 只有在确实配置了密钥时才显示"已配置"
        if self.model.api_key and self.model.api_key.get_secret_value():
            self.api_key_edit.setPlaceholderText("已配置（编辑时需重新输入）")
        
        if self.model.base_url:
            self.base_url_edit.setText(self.model.base_url)
        self.default_model_edit.setText(self.model.default_model)
        self.turbo_model_edit.setText(self.model.turbo_model)
        self.active_check.setChecked(self.model.is_active)
        self.default_check.setChecked(self.model.is_default)
    
    def validate_and_accept(self):
        """验证并接受"""
        if not self.name_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入配置名称")
            return
        
        if not self.api_key_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入API密钥")
            return
        
        if not self.default_model_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入默认模型名称")
            return
        
        if not self.turbo_model_edit.text().strip():
            QMessageBox.warning(self, "警告", "请输入Turbo模型名称")
            return
        
        self.accept()
    
    def get_model(self) -> AIModelConfig:
        """获取模型配置"""
        from pydantic import SecretStr
        
        provider = self.provider_combo.currentData()
        
        return AIModelConfig(
            id=self.model.id if self.model else str(uuid.uuid4()),
            name=self.name_edit.text().strip(),
            provider=provider,
            api_key=SecretStr(self.api_key_edit.text().strip()),
            base_url=self.base_url_edit.text().strip() or None,
            default_model=self.default_model_edit.text().strip(),
            turbo_model=self.turbo_model_edit.text().strip(),
            is_active=self.active_check.isChecked(),
            is_default=self.default_check.isChecked(),
        )

