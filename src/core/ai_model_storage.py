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
        logger.debug(f"AI模型存储管理器已初始化，数据库路径: {self._config_db.get_db_path()}")
    
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
    
    def get_current_model_id(self) -> Optional[str]:
        """获取当前使用的模型ID（从ai_models表的is_current字段）"""
        try:
            model_data = self._config_db.get_current_ai_model()
            if model_data:
                logger.debug(f"从数据库读取到当前使用的模型ID: {model_data['id']}")
                return model_data['id']
            else:
                logger.debug("数据库中没有标记为当前使用的模型")
                return None
        except Exception as e:
            logger.warning(f"读取当前使用的模型ID失败: {str(e)}")
            return None
    
    def set_current_model(self, model_id: str) -> bool:
        """设置当前使用的模型（更新ai_models表的is_current字段）"""
        try:
            success = self._config_db.set_current_ai_model(model_id)
            if success:
                logger.debug(f"已设置当前使用的模型ID: {model_id}")
            else:
                logger.warning(f"设置当前使用的模型失败: {model_id}")
            return success
        except Exception as e:
            logger.warning(f"设置当前使用的模型ID失败: {str(e)}")
            return False
    
    # 保持向后兼容的方法名
    def get_last_used_model_id(self) -> Optional[str]:
        """获取当前使用的模型ID（向后兼容方法名，实际调用get_current_model_id）"""
        return self.get_current_model_id()
    
    def save_last_used_model_id(self, model_id: str) -> bool:
        """保存当前使用的模型ID（向后兼容方法名，实际调用set_current_model）"""
        return self.set_current_model(model_id)
    
    def get_current_model(self) -> Optional[AIModelConfig]:
        """
        获取当前使用的模型配置
        
        优先级：
        1. is_current=1 的激活模型
        2. 第一个激活的模型（如果没有标记为当前的）
        3. None（如果没有任何模型）
        """
        try:
            # 从数据库获取标记为当前的模型
            model_dict = self._config_db.get_current_ai_model()
            if model_dict:
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
                logger.info(f"使用当前标记的模型: {model.name}")
                return model
            
            # 如果没有标记为当前的模型，使用第一个激活的模型
            models = self.load_models()
            if not models:
                logger.warning("没有找到任何AI模型配置")
                return None
            
            for model in models:
                if model.is_active:
                    logger.info(f"没有标记为当前的模型，使用第一个激活的模型: {model.name}")
                    # 标记为当前使用的模型
                    self.set_current_model(model.id)
                    return model
            
            logger.warning("没有找到激活的AI模型配置")
            return None
            
        except Exception as e:
            logger.error(f"获取当前模型失败: {str(e)}", exc_info=True)
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
