"""
AI模型管理处理器
"""
from PyQt6.QtWidgets import QDialog
from typing import TYPE_CHECKING
import logging

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class AIModelHandler:
    """AI模型管理处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def configure_ai_models(self):
        """配置AI模型"""
        from src.gui.dialogs.ai_model_manager_dialog import AIModelManagerDialog
        dialog = AIModelManagerDialog(self.main_window)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            # 配置更新后，刷新模型列表
            self.refresh_ai_models()
    
    def configure_prompts(self):
        """配置AI提示词"""
        from src.gui.dialogs.prompt_config_dialog import PromptConfigDialog
        dialog = PromptConfigDialog(self.main_window)
        dialog.exec()
    
    def refresh_ai_models(self):
        """刷新AI模型列表"""
        if not hasattr(self.main_window, 'ai_model_combo'):
            return
        
        self.main_window.ai_model_combo.clear()
        
        # 加载所有模型配置
        models = self.main_window.ai_model_storage.load_models()
        active_models = [m for m in models if m.is_active]
        
        if not active_models:
            self.main_window.ai_model_combo.addItem("未配置模型", None)
            self.main_window.ai_model_combo.setEnabled(False)
            return
        
        self.main_window.ai_model_combo.setEnabled(True)
        
        # 获取上次使用的模型ID
        last_used_id = self.main_window.ai_model_storage.get_last_used_model_id()
        
        # 添加模型到下拉框
        selected_index = 0
        for i, model in enumerate(active_models):
            display_name = model.name
            from src.core.default_ai_model import DEFAULT_MODEL_ID
            if model.id == DEFAULT_MODEL_ID or model.is_default:
                display_name += " [系统默认]"
            self.main_window.ai_model_combo.addItem(display_name, model.id)
            
            # 优先选择上次使用的模型
            if last_used_id and model.id == last_used_id:
                selected_index = i
            # 如果没有上次使用的，选择第一个激活的模型
            elif selected_index == 0:
                selected_index = i
        
        # 设置当前选择的模型（优先使用上次使用的模型）
        if active_models:
            self.main_window.ai_model_combo.setCurrentIndex(selected_index)
            # 只有在确实需要切换时才调用（避免初始化时的重复调用）
            selected_model_id = active_models[selected_index].id
            if not self.main_window.current_ai_model_id or self.main_window.current_ai_model_id != selected_model_id:
                self.on_ai_model_changed(selected_index)
    
    def on_ai_model_changed(self, index: int):
        """AI模型选择改变"""
        model_id = self.main_window.ai_model_combo.itemData(index)
        if not model_id:
            return
        
        self.main_window.current_ai_model_id = model_id
        
        # 保存为上次使用的模型
        self.main_window.ai_model_storage.save_last_used_model_id(model_id)
        
        # 更新SQL编辑器的AI客户端
        if hasattr(self.main_window, 'sql_editor'):
            # 重新创建AI客户端
            try:
                from src.core.ai_client import AIClient
                models = self.main_window.ai_model_storage.load_models()
                model_config = next((m for m in models if m.id == model_id), None)
                if model_config:
                    self.main_window.sql_editor.ai_client = AIClient(
                        api_key=model_config.api_key.get_secret_value(),
                        base_url=model_config.get_base_url(),
                        default_model=model_config.default_model,
                        turbo_model=model_config.turbo_model
                    )
                    # 设置模型ID以便统计
                    self.main_window.sql_editor.ai_client._current_model_id = model_config.id
                    self.main_window.statusBar().showMessage(f"已切换到模型: {model_config.name}", 2000)
                else:
                    self.main_window.statusBar().showMessage("模型配置不存在", 3000)
            except Exception as e:
                logger.error(f"切换AI模型失败: {str(e)}")
                self.main_window.statusBar().showMessage(f"切换AI模型失败: {str(e)}", 3000)

