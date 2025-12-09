"""
AI模型配置持久化存储
"""
import json
import uuid
import os
import sys
from pathlib import Path
from typing import List, Optional
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import base64

from src.core.ai_model_config import AIModelConfig, AIModelProvider
from pydantic import SecretStr

logger = logging.getLogger(__name__)


class AIModelStorage:
    """AI模型配置存储管理器"""
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        初始化存储管理器
        
        Args:
            storage_path: 存储文件路径，默认为用户目录下的 .db-ai/ai_models.json
        """
        if storage_path is None:
            # 默认存储在用户目录
            home = Path.home()
            storage_dir = home / ".db-ai"
            storage_dir.mkdir(exist_ok=True)
            storage_path = storage_dir / "ai_models.json"
        
        self.storage_path = Path(storage_path)
        self._key = self._get_or_create_key()
        
        # 上次使用的模型ID存储路径
        self.last_used_model_path = self.storage_path.parent / "last_used_model.txt"
    
    def _get_or_create_key(self) -> bytes:
        """获取或创建加密密钥（复用连接存储的密钥）"""
        key_file = self.storage_path.parent / ".key"
        
        if key_file.exists():
            # 读取现有密钥
            with open(key_file, 'rb') as f:
                return f.read()
        else:
            # 生成新密钥
            key = Fernet.generate_key()
            with open(key_file, 'wb') as f:
                f.write(key)
            # 设置文件权限（仅所有者可读）
            try:
                key_file.chmod(0o600)
            except Exception:
                pass  # Windows上可能不支持
            return key
    
    def _encrypt_api_key(self, api_key: str) -> str:
        """加密API密钥"""
        if not api_key:
            return ""
        f = Fernet(self._key)
        encrypted = f.encrypt(api_key.encode('utf-8'))
        return base64.b64encode(encrypted).decode('utf-8')
    
    def _decrypt_api_key(self, encrypted_api_key: str) -> str:
        """解密API密钥"""
        if not encrypted_api_key:
            return ""
        try:
            f = Fernet(self._key)
            encrypted_bytes = base64.b64decode(encrypted_api_key.encode('utf-8'))
            decrypted = f.decrypt(encrypted_bytes)
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"解密API密钥失败: {str(e)}")
            return ""
    
    def save_models(self, models: List[AIModelConfig]) -> bool:
        """保存模型配置列表（包含默认模型的修改）"""
        try:
            if not models:
                logger.warning("模型配置列表为空，跳过保存")
                return False
            
            data = []
            for model in models:
                try:
                    model_dict = {
                        "id": model.id,
                        "name": model.name,
                        "provider": model.provider.value,
                        "api_key": self._encrypt_api_key(model.api_key.get_secret_value()),
                        "base_url": model.base_url,
                        "default_model": model.default_model,
                        "turbo_model": model.turbo_model,
                        "is_active": model.is_active,
                        "is_default": model.is_default,
                    }
                    data.append(model_dict)
                except Exception as e:
                    logger.error(f"序列化模型配置失败: {model.name if model else 'Unknown'}, 错误: {str(e)}")
                    continue
            
            # 即使没有用户配置的模型，也保存空数组（清空文件）
            # 这样下次加载时只会加载默认模型
            
            # 保存到文件（先写入临时文件，然后重命名，确保原子性）
            temp_path = self.storage_path.with_suffix('.json.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # 原子性替换
            import shutil
            shutil.move(temp_path, self.storage_path)
            
            # 设置文件权限
            try:
                self.storage_path.chmod(0o600)
            except Exception:
                pass  # Windows上可能不支持
            
            logger.info(f"成功保存 {len(models)} 个模型配置到 {self.storage_path}")
            return True
            
        except Exception as e:
            logger.error(f"保存模型配置失败: {str(e)}")
            return False
    
    def load_models(self) -> List[AIModelConfig]:
        """加载模型配置列表（包含硬编码的默认模型和用户配置的模型）"""
        models = []
        
        # 首先添加硬编码的默认模型
        from src.core.default_ai_model import get_default_model_config, DEFAULT_MODEL_ID
        default_model = get_default_model_config()
        models.append(default_model)
        
        # 然后加载用户配置的模型（从JSON文件）
        if not self.storage_path.exists():
            logger.info(f"模型配置文件不存在: {self.storage_path}")
            return models
        
        try:
            with open(self.storage_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for model_dict in data:
                try:
                    model_id = model_dict.get("id", str(uuid.uuid4()))
                    
                    # 解密API密钥
                    encrypted_api_key = model_dict.get("api_key", "")
                    api_key = self._decrypt_api_key(encrypted_api_key)
                    
                    # 如果是默认模型ID，覆盖硬编码的默认模型（允许用户修改默认模型）
                    if model_id == DEFAULT_MODEL_ID:
                        models[0] = AIModelConfig(
                            id=DEFAULT_MODEL_ID,
                            name=model_dict.get("name", default_model.name),
                            provider=AIModelProvider(model_dict.get("provider", default_model.provider.value)),
                            api_key=SecretStr(api_key),
                            base_url=model_dict.get("base_url"),
                            default_model=model_dict.get("default_model", default_model.default_model),
                            turbo_model=model_dict.get("turbo_model", default_model.turbo_model),
                            is_active=model_dict.get("is_active", default_model.is_active),
                            is_default=True,
                        )
                    else:
                        model = AIModelConfig(
                            id=model_id,
                            name=model_dict.get("name", ""),
                            provider=AIModelProvider(model_dict.get("provider", "aliyun_qianwen")),
                            api_key=SecretStr(api_key),
                            base_url=model_dict.get("base_url"),
                            default_model=model_dict.get("default_model", "qwen-plus"),
                            turbo_model=model_dict.get("turbo_model", "qwen-turbo"),
                            is_active=model_dict.get("is_active", True),
                            is_default=model_dict.get("is_default", False),
                        )
                        models.append(model)
                except Exception as e:
                    logger.error(f"加载模型配置失败: {str(e)}, 数据: {model_dict}")
                    continue
            
            logger.info(f"成功加载 {len(models)} 个模型配置（1个默认模型 + {len(models)-1}个用户配置）")
            return models
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {str(e)}")
            return models  # 至少返回默认模型
        except Exception as e:
            logger.error(f"加载模型配置失败: {str(e)}")
            return models  # 至少返回默认模型
    
    def get_last_used_model_id(self) -> Optional[str]:
        """获取上次使用的模型ID"""
        if not self.last_used_model_path.exists():
            return None
        
        try:
            with open(self.last_used_model_path, 'r', encoding='utf-8') as f:
                model_id = f.read().strip()
                return model_id if model_id else None
        except Exception as e:
            logger.warning(f"读取上次使用的模型ID失败: {str(e)}")
            return None
    
    def save_last_used_model_id(self, model_id: str):
        """保存上次使用的模型ID"""
        try:
            with open(self.last_used_model_path, 'w', encoding='utf-8') as f:
                f.write(model_id)
            logger.debug(f"已保存上次使用的模型ID: {model_id}")
        except Exception as e:
            logger.warning(f"保存上次使用的模型ID失败: {str(e)}")
    
    def get_default_model(self) -> Optional[AIModelConfig]:
        """获取默认模型配置（优先使用上次使用的模型；允许用户修改默认模型）"""
        models = self.load_models()
        
        # 优先使用上次使用的模型
        last_used_id = self.get_last_used_model_id()
        if last_used_id:
            for model in models:
                if model.id == last_used_id and model.is_active:
                    logger.info(f"使用上次使用的模型: {model.name}")
                    return model
            logger.warning(f"上次使用的模型ID {last_used_id} 不存在或未激活，使用默认模型")
        
        # 查找标记为默认的模型
        for model in models:
            if model.is_default and model.is_active:
                logger.info(f"使用标记为默认的模型: {model.name}")
                return model
        
        # 如果没有默认标记，返回第一个激活的
        for model in models:
            if model.is_active:
                logger.info(f"未找到默认标记，使用第一个激活的模型: {model.name}")
                return model
        
        # 如果都没有激活的，返回第一个模型或 None
        return models[0] if models else None

