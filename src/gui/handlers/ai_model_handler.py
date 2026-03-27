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
        
        combo = self.main_window.ai_model_combo
        # 必须在 clear / addItem / setCurrentIndex 全过程中阻塞信号，否则
        # 重建列表时会触发 currentIndexChanged，误把「当前模型」写成第一项。
        combo.blockSignals(True)
        
        # 加载所有模型配置
        models = self.main_window.ai_model_storage.load_models()
        active_models = [m for m in models if m.is_active]
        
        if not active_models:
            combo.clear()
            combo.addItem("未配置模型", None)
            combo.setEnabled(False)
            combo.blockSignals(False)
            return
        
        combo.setEnabled(True)
        combo.clear()
        
        # 获取当前使用的模型ID（仅来自数据库中「上次使用」标记，不做默认推断）
        current_id = self.main_window.ai_model_storage.get_current_model_id()
        
        logger.info(f"刷新AI模型列表，当前使用的模型ID: {current_id}")
        
        # 添加模型到下拉框，并找到当前使用的模型索引
        selected_index = 0
        found_current = False
        
        for i, model in enumerate(active_models):
            combo.addItem(model.name, model.id)
            
            if current_id and model.id == current_id:
                selected_index = i
                found_current = True
                logger.info(f"找到当前使用的模型: {model.name} (索引: {i})")
        
        if not found_current and current_id:
            logger.warning(f"当前使用的模型ID {current_id} 未找到或未激活，使用第一个模型")
        
        # 设置当前选择的模型（仅恢复数据库中记录的上次使用；无记录时再落库第一项）
        if active_models:
            selected_model_id = active_models[selected_index].id
            previous_model_id = getattr(self.main_window, 'current_ai_model_id', None)
            
            combo.setCurrentIndex(selected_index)
            combo.blockSignals(False)
            
            # 更新当前模型ID
            self.main_window.current_ai_model_id = selected_model_id
            
            # 仅在数据库中无有效「上次使用」或记录已失效时写回，避免刷新时反复覆盖
            if found_current:
                logger.debug(f"已恢复上次使用的模型: {selected_model_id}")
            else:
                self.main_window.ai_model_storage.set_current_model(selected_model_id)
                logger.info(f"无有效上次使用记录或配置已失效，已同步当前选中项: {selected_model_id}")
            
            # 只有当模型真正改变时才更新SQL编辑器的AI客户端
            if hasattr(self.main_window, 'sql_editor'):
                # 检查模型是否真的改变了
                model_changed = (previous_model_id != selected_model_id)
                if model_changed:
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
                        logger.info(f"模型已切换，已加载: {model_config.name}")
                    except Exception as e:
                        logger.error(f"加载AI模型失败: {str(e)}")
                else:
                    logger.debug(f"模型未改变，跳过AI客户端更新: {selected_model_id}")
    
    def on_ai_model_changed(self, index: int):
        """AI模型选择改变"""
        model_id = self.main_window.ai_model_combo.itemData(index)
        if not model_id:
            return
        
        # 检查模型是否真的改变了
        previous_model_id = getattr(self.main_window, 'current_ai_model_id', None)
        if previous_model_id == model_id:
            logger.debug(f"模型未改变，跳过设置: {model_id}")
            return
        
        self.main_window.current_ai_model_id = model_id
        
        # 设置为当前使用的模型（方法内部会检查是否已经是当前模型，避免不必要的更新）
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

