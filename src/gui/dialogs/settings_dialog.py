"""
设置对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFormLayout,
    QComboBox,
    QPushButton,
    QDialogButtonBox,
    QLabel,
    QGroupBox,
)
from PyQt6.QtCore import Qt, pyqtSignal
from src.config.settings import Settings
from src.core.i18n import TranslationManager

# 导入简单翻译系统
try:
    from src.core.simple_i18n import get_i18n
except ImportError:
    get_i18n = None


class SettingsDialog(QDialog):
    """设置对话框"""
    
    language_changed = pyqtSignal(str)  # 语言改变信号
    
    def tr(self, source: str, disambiguation: str = None, n: int = -1) -> str:
        """
        重写 tr() 方法，使用简单翻译系统
        """
        # 先尝试使用 PyQt6 的翻译系统
        translated = super().tr(source, disambiguation, n)
        
        # 如果翻译结果和源文本相同，尝试使用简单翻译系统
        if translated == source and get_i18n is not None:
            try:
                i18n = get_i18n()
                if i18n and i18n.current_language != "zh_CN":
                    context = self.__class__.__name__
                    translated = i18n.translate(context, source)
            except Exception:
                pass  # 如果获取失败，使用原文本
        
        return translated
    
    def __init__(self, parent=None, settings: Settings = None, translation_manager: TranslationManager = None):
        super().__init__(parent)
        self.settings = settings
        self.translation_manager = translation_manager
        self.setWindowTitle(self.tr("设置"))
        self.setModal(True)
        self.setMinimumSize(500, 300)
        self.init_ui()
        self.load_settings()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        
        # 语言设置组
        language_group = QGroupBox(self.tr("语言设置"))
        language_layout = QFormLayout()
        
        self.language_combo = QComboBox()
        if self.translation_manager:
            languages = self.translation_manager.get_available_languages()
            for code, name in languages.items():
                self.language_combo.addItem(name, code)
        language_layout.addRow(self.tr("界面语言:"), self.language_combo)
        
        language_group.setLayout(language_layout)
        layout.addWidget(language_group)
        
        # 添加弹性空间
        layout.addStretch()
        
        # 按钮
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)
        
        self.setLayout(layout)
    
    def load_settings(self):
        """加载设置"""
        if self.settings:
            current_language = self.settings.language
            # 找到对应的索引
            for i in range(self.language_combo.count()):
                if self.language_combo.itemData(i) == current_language:
                    self.language_combo.setCurrentIndex(i)
                    break
    
    def accept(self):
        """接受设置"""
        if self.settings:
            new_language = self.language_combo.currentData()
            old_language = self.settings.language
            
            if new_language != old_language:
                # 更新设置
                self.settings.language = new_language
                
                # 保存语言设置到注册表
                if self.settings.save_language_to_registry():
                    # 发出语言改变信号
                    self.language_changed.emit(new_language)
                else:
                    # 如果保存失败，显示错误消息
                    from PyQt6.QtWidgets import QMessageBox
                    QMessageBox.warning(
                        self,
                        self.tr("错误"),
                        self.tr("保存语言设置到注册表失败。")
                    )
        
        super().accept()

