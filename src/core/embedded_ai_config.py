"""
嵌入的默认AI模型配置（打包时生成，不提交到代码仓库）
此文件在打包时通过配置文件或环境变量自动生成
"""
import base64
from typing import Optional, Dict, Any

# 默认配置（在打包时设置）
_DEFAULT_CONFIG: Optional[Dict[str, Any]] = {
    "name": '通义千问',
    "provider": 'aliyun_qianwen',
    "api_key": base64.b64decode('c2stNDQwZDM4NDJiYzJhNDhlZWFiY2I4OTlmOGUyMzEwOWY=').decode('utf-8'),
    "base_url": None,
    "default_model": 'qwen-plus',
    "turbo_model": 'qwen-turbo',
    "is_default": True,
}


def get_default_config() -> Optional[Dict[str, Any]]:
    """获取默认AI模型配置"""
    return _DEFAULT_CONFIG
