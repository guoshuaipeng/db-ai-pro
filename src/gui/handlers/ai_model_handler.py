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
        dialog.exec()
        
        # 无论对话框如何关闭，都刷新模型列表（因为可能已经添加/编辑/删除了模型）
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
        
        # 获取当前使用的模型ID
        current_id = self.main_window.ai_model_storage.get_current_model_id()
        
        logger.info(f"刷新AI模型列表，当前使用的模型ID: {current_id}")
        
        # 添加模型到下拉框，并找到当前使用的模型索引
        selected_index = 0  # 默认选择第一个
        found_current = False
        
        for i, model in enumerate(active_models):
            # 只显示模型名称，不显示任何标记
            self.main_window.ai_model_combo.addItem(model.name, model.id)
            
            # 如果找到当前使用的模型，记录索引
            if current_id and model.id == current_id:
                selected_index = i
                found_current = True
                logger.info(f"找到当前使用的模型: {model.name} (索引: {i})")
        
        if not found_current and current_id:
            logger.warning(f"当前使用的模型ID {current_id} 未找到或未激活，使用第一个模型")
        
        # 设置当前选择的模型（优先使用上次使用的模型）
        if active_models:
            # 先临时断开信号，避免触发 on_ai_model_changed
            self.main_window.ai_model_combo.blockSignals(True)
            self.main_window.ai_model_combo.setCurrentIndex(selected_index)
            self.main_window.ai_model_combo.blockSignals(False)
            
            # 更新当前模型ID
            selected_model_id = active_models[selected_index].id
            self.main_window.current_ai_model_id = selected_model_id
            
            # 如果当前使用的模型未找到，设置选中的模型为当前使用
            if not found_current:
                self.main_window.ai_model_storage.set_current_model(selected_model_id)
                logger.info(f"已设置新的当前模型ID到数据库: {selected_model_id}")
            
            # 更新SQL编辑器的AI客户端（如果模型确实改变了）
            if hasattr(self.main_window, 'sql_editor'):
                try:
                    from src.core.ai_client import AIClient
                    model_config = active_models[selected_index]
                    self.main_window.sql_editor.ai_client = AIClient(
                        api_key=model_config.api_key.get_secret_value(),
                        base_url=model_config.get_base_url(),
                        default_model=model_config.default_model,
                        turbo_model=model_config.turbo_model
                    )
                    self.main_window.sql_editor.ai_client._current_model_id = model_config.id
                    logger.info(f"已加载模型: {model_config.name}")
                except Exception as e:
                    logger.error(f"加载AI模型失败: {str(e)}")
    
    def on_ai_model_changed(self, index: int):
        """AI模型选择改变"""
        model_id = self.main_window.ai_model_combo.itemData(index)
        if not model_id:
            return
        
        self.main_window.current_ai_model_id = model_id
        
        # 设置为当前使用的模型
        self.main_window.ai_model_storage.set_current_model(model_id)
        logger.info(f"已设置当前使用的模型ID: {model_id}")
        
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

