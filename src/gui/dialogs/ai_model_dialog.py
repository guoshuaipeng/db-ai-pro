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
        self.provider_combo.currentIndexChanged.connect(self.on_provider_changed)
        self.provider_combo.setMinimumWidth(300)
        form_layout.addRow("提供商:", self.provider_combo)
        
        # API密钥
        self.api_key_edit = QLineEdit()
        self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_edit.setPlaceholderText("请输入API密钥")
        self.api_key_edit.setMinimumWidth(300)
        
        # 显示/隐藏密钥按钮
        self.show_key_btn = QPushButton("显示")
        self.show_key_btn.setFixedWidth(60)
        self.show_key_btn.clicked.connect(self.toggle_api_key_visibility)
        key_layout = QHBoxLayout()
        key_layout.addWidget(self.api_key_edit)
        key_layout.addWidget(self.show_key_btn)
        form_layout.addRow("API密钥:", key_layout)
        
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
        
        # 设为默认（已禁用，因为默认模型是硬编码的）
        self.default_check = QCheckBox()
        self.default_check.setEnabled(False)  # 禁用，因为默认模型是硬编码的
        self.default_check.setToolTip("默认模型是硬编码在程序中的，用户配置的模型不能设置为默认")
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
        if provider == AIModelProvider.ALIYUN_QIANWEN:
            self.default_model_edit.setText("qwen-plus")
            self.turbo_model_edit.setText("qwen-turbo")
            if not self.base_url_edit.text():
                self.base_url_edit.setPlaceholderText("默认: https://dashscope.aliyuncs.com/compatible-mode/v1")
        elif provider == AIModelProvider.OPENAI:
            self.default_model_edit.setText("gpt-4")
            self.turbo_model_edit.setText("gpt-3.5-turbo")
            if not self.base_url_edit.text():
                self.base_url_edit.setPlaceholderText("默认: https://api.openai.com/v1")
    
    def toggle_api_key_visibility(self):
        """切换API密钥显示/隐藏"""
        if self.api_key_edit.echoMode() == QLineEdit.EchoMode.Password:
            self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Normal)
            self.show_key_btn.setText("隐藏")
        else:
            self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
            self.show_key_btn.setText("显示")
    
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

