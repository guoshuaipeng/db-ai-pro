"""
AI模型配置持久化存储（使用SQLite）
"""
import logging
from typing import List, Optional
from src.core.ai_model_config import AIModelConfig, AIModelProvider
from pydantic import SecretStr

logger = logging.getLogger(__name__)


class AIModelStorage:
    """AI模型配置存储管理器（使用SQLite）"""
    
    def __init__(self):
        """初始化存储管理器"""
        from src.core.config_db import get_config_db
        self._config_db = get_config_db()
    
    def save_models(self, models: List[AIModelConfig]) -> bool:
        """
        保存模型配置列表
        
        Args:
            models: 模型配置列表
            
        Returns:
            是否保存成功
        """
        try:
            for model in models:
                model_data = {
                    'id': model.id,
                    'name': model.name,
                    'provider': model.provider.value,
                    'api_key': model.api_key.get_secret_value() if model.api_key else None,
                    'base_url': model.base_url,
                    'default_model': model.default_model,
                    'turbo_model': model.turbo_model,
                    'is_active': model.is_active,
                }
                self._config_db.save_ai_model(model_data)
            
            logger.info(f"成功保存 {len(models)} 个模型配置到SQLite")
            return True
            
        except Exception as e:
            logger.error(f"保存模型配置失败: {str(e)}", exc_info=True)
            return False
    
    def load_models(self) -> List[AIModelConfig]:
        """
        加载模型配置列表
        
        Returns:
            模型配置列表
        """
        try:
            models_data = self._config_db.get_all_ai_models()
            models = []
            
            for model_dict in models_data:
                try:
                    model = AIModelConfig(
                        id=model_dict['id'],
                        name=model_dict['name'],
                        provider=AIModelProvider(model_dict['provider']),
                        api_key=SecretStr(model_dict.get('api_key') or ''),
                        base_url=model_dict.get('base_url'),
                        default_model=model_dict.get('default_model', 'qwen-plus'),
                        turbo_model=model_dict.get('turbo_model', 'qwen-turbo'),
                        is_active=model_dict.get('is_active', True),
                    )
                    models.append(model)
                except Exception as e:
                    logger.error(f"加载模型配置失败: {str(e)}, 数据: {model_dict}")
                    continue
            
            logger.info(f"成功从SQLite加载 {len(models)} 个模型配置")
            return models
            
        except Exception as e:
            logger.error(f"加载模型配置失败: {str(e)}", exc_info=True)
            return []
    
    def get_last_used_model_id(self) -> Optional[str]:
        """获取上次使用的模型ID（从SQLite settings表）"""
        try:
            model_id = self._config_db.get_setting('last_used_ai_model_id', None)
            return model_id if model_id else None
        except Exception as e:
            logger.warning(f"读取上次使用的模型ID失败: {str(e)}")
            return None
    
    def save_last_used_model_id(self, model_id: str):
        """保存上次使用的模型ID（到SQLite settings表）"""
        try:
            self._config_db.save_setting('last_used_ai_model_id', model_id)
            logger.debug(f"已保存上次使用的模型ID到数据库: {model_id}")
        except Exception as e:
            logger.warning(f"保存上次使用的模型ID失败: {str(e)}")
    
    def get_current_model(self) -> Optional[AIModelConfig]:
        """
        获取当前使用的模型配置
        
        优先级：
        1. 上次使用的模型（如果存在且激活）
        2. 第一个激活的模型
        3. None（如果没有任何模型）
        """
        models = self.load_models()
        
        if not models:
            logger.warning("没有找到任何AI模型配置")
            return None
        
        # 优先使用上次使用的模型
        last_used_id = self.get_last_used_model_id()
        if last_used_id:
            for model in models:
                if model.id == last_used_id and model.is_active:
                    logger.info(f"使用上次使用的模型: {model.name}")
                    return model
            logger.warning(f"上次使用的模型ID {last_used_id} 不存在或未激活，使用第一个激活的模型")
        
        # 使用第一个激活的模型
        for model in models:
            if model.is_active:
                logger.info(f"使用第一个激活的模型: {model.name}")
                # 保存为当前使用的模型
                self.save_last_used_model_id(model.id)
                return model
        
        logger.warning("没有找到激活的AI模型配置")
        return None
    
    # 保持向后兼容的别名
    def get_default_model(self) -> Optional[AIModelConfig]:
        """获取默认模型（向后兼容，实际返回当前使用的模型）"""
        return self.get_current_model()
    
    def delete_model(self, model_id: str) -> bool:
        """
        删除模型配置
        
        Args:
            model_id: 模型ID
            
        Returns:
            是否删除成功
        """
        try:
            success = self._config_db.delete_ai_model(model_id)
            if success:
                logger.info(f"成功删除模型配置: {model_id}")
            else:
                logger.warning(f"删除模型配置失败，模型不存在: {model_id}")
            return success
        except Exception as e:
            logger.error(f"删除模型配置失败: {str(e)}", exc_info=True)
            return False
    
    def get_model_by_id(self, model_id: str) -> Optional[AIModelConfig]:
        """
        根据ID获取模型配置
        
        Args:
            model_id: 模型ID
            
        Returns:
            模型配置，不存在返回None
        """
        try:
            model_dict = self._config_db.get_ai_model_by_id(model_id)
            if model_dict:
                return AIModelConfig(
                    id=model_dict['id'],
                    name=model_dict['name'],
                    provider=AIModelProvider(model_dict['provider']),
                    api_key=SecretStr(model_dict.get('api_key') or ''),
                    base_url=model_dict.get('base_url'),
                    default_model=model_dict.get('default_model', 'qwen-plus'),
                    turbo_model=model_dict.get('turbo_model', 'qwen-turbo'),
                    is_active=model_dict.get('is_active', True),
                )
            return None
        except Exception as e:
            logger.error(f"获取模型配置失败: {str(e)}", exc_info=True)
            return None
