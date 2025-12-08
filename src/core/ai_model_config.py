"""
AI模型配置
"""
from pydantic import BaseModel, SecretStr
from typing import Optional
from enum import Enum
import uuid


class AIModelProvider(str, Enum):
    """AI模型提供商"""
    ALIYUN_QIANWEN = "aliyun_qianwen"  # 阿里云通义千问
    OPENAI = "openai"  # OpenAI
    # 可以扩展其他提供商


class AIModelConfig(BaseModel):
    """AI模型配置"""
    id: str  # 配置ID
    name: str  # 配置名称
    provider: AIModelProvider  # 提供商
    api_key: SecretStr  # API密钥（加密存储）
    base_url: Optional[str] = None  # API基础URL（可选，某些提供商需要）
    default_model: str = "qwen-plus"  # 默认模型名称
    turbo_model: str = "qwen-turbo"  # Turbo模型名称（用于快速操作）
    is_active: bool = True  # 是否激活
    is_default: bool = False  # 是否为默认配置
    
    def get_base_url(self) -> str:
        """获取API基础URL"""
        if self.base_url:
            return self.base_url
        
        # 根据提供商返回默认URL
        if self.provider == AIModelProvider.ALIYUN_QIANWEN:
            return "https://dashscope.aliyuncs.com/compatible-mode/v1"
        elif self.provider == AIModelProvider.OPENAI:
            return "https://api.openai.com/v1"
        else:
            return "https://dashscope.aliyuncs.com/compatible-mode/v1"

