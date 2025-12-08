"""
硬编码的默认AI模型配置
默认模型不存储在JSON中，而是硬编码在代码中
"""
from src.core.ai_model_config import AIModelConfig, AIModelProvider
from pydantic import SecretStr

# 默认模型的固定ID
DEFAULT_MODEL_ID = "default-model-builtin"

def get_default_model_config() -> AIModelConfig:
    """
    获取硬编码的默认模型配置
    
    注意：这里的API密钥需要在实际使用时通过环境变量或配置文件提供
    如果没有提供，用户需要手动添加模型配置
    """
    import os
    
    # 从环境变量读取API密钥（如果存在）
    api_key = os.environ.get("DATAAI_DEFAULT_AI_API_KEY", "").strip()
    
    # 如果环境变量中没有，返回一个空的配置（用户需要手动配置）
    if not api_key:
        # 返回一个占位配置，is_active=False表示未激活
        return AIModelConfig(
            id=DEFAULT_MODEL_ID,
            name="默认模型（需要配置API密钥）",
            provider=AIModelProvider.ALIYUN_QIANWEN,
            api_key=SecretStr(""),
            base_url=None,
            default_model="qwen-plus",
            turbo_model="qwen-turbo",
            is_active=False,  # 未激活，因为API密钥为空
            is_default=True,  # 始终是默认模型
        )
    
    # 从环境变量读取其他配置
    name = os.environ.get("DATAAI_DEFAULT_AI_NAME", "默认模型").strip() or "默认模型"
    provider_str = os.environ.get("DATAAI_DEFAULT_AI_PROVIDER", "aliyun_qianwen").strip() or "aliyun_qianwen"
    base_url = os.environ.get("DATAAI_DEFAULT_AI_BASE_URL", "").strip() or None
    default_model = os.environ.get("DATAAI_DEFAULT_AI_DEFAULT_MODEL", "qwen-plus").strip() or "qwen-plus"
    turbo_model = os.environ.get("DATAAI_DEFAULT_AI_TURBO_MODEL", "qwen-turbo").strip() or "qwen-turbo"
    
    try:
        provider = AIModelProvider(provider_str)
    except ValueError:
        provider = AIModelProvider.ALIYUN_QIANWEN
    
    return AIModelConfig(
        id=DEFAULT_MODEL_ID,
        name=name,
        provider=provider,
        api_key=SecretStr(api_key),
        base_url=base_url,
        default_model=default_model,
        turbo_model=turbo_model,
        is_active=True,
        is_default=True,  # 始终是默认模型
    )

