#!/usr/bin/env python3
"""
生成嵌入的AI模型配置文件
在打包时从配置文件或环境变量读取配置并生成 embedded_ai_config.py
优先级：.vscode/api_config.json > 环境变量 > 默认值
"""
import os
import sys
import json
from pathlib import Path

# 项目根目录
project_root = Path(__file__).parent.parent
config_file = project_root / "src" / "core" / "embedded_ai_config.py"
api_config_file = project_root / ".vscode" / "api_config.json"

def load_config_from_file():
    """从 .vscode/api_config.json 文件加载配置"""
    if not api_config_file.exists():
        return None
    
    try:
        with open(api_config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
            # 验证必需的字段
            if not config.get("api_key"):
                print(f"[警告] {api_config_file} 中未找到 api_key 字段")
                return None
            return config
    except json.JSONDecodeError as e:
        print(f"[错误] 解析 {api_config_file} 失败: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[错误] 读取 {api_config_file} 失败: {e}", file=sys.stderr)
        return None

def generate_config():
    """从配置文件或环境变量生成配置文件"""
    
    # 优先从文件读取配置
    file_config = load_config_from_file()
    
    if file_config:
        print(f"[提示] 从 {api_config_file} 读取配置")
        api_key = file_config.get("api_key", "").strip()
        name = file_config.get("name", "默认配置").strip() or "默认配置"
        provider = file_config.get("provider", "aliyun_qianwen").strip() or "aliyun_qianwen"
        base_url = file_config.get("base_url")
        if base_url:
            base_url = str(base_url).strip() or None
        default_model = file_config.get("default_model", "qwen-plus").strip() or "qwen-plus"
        turbo_model = file_config.get("turbo_model", "qwen-turbo").strip() or "qwen-turbo"
    else:
        # 从环境变量读取
        api_key = os.environ.get("DATAAI_DEFAULT_AI_API_KEY", "").strip()
    
        # 读取其他配置项（从环境变量）
        name = os.environ.get("DATAAI_DEFAULT_AI_NAME", "默认配置").strip() or "默认配置"
        provider = os.environ.get("DATAAI_DEFAULT_AI_PROVIDER", "aliyun_qianwen").strip() or "aliyun_qianwen"
        base_url = os.environ.get("DATAAI_DEFAULT_AI_BASE_URL", "").strip() or None
        default_model = os.environ.get("DATAAI_DEFAULT_AI_DEFAULT_MODEL", "qwen-plus").strip() or "qwen-plus"
        turbo_model = os.environ.get("DATAAI_DEFAULT_AI_TURBO_MODEL", "qwen-turbo").strip() or "qwen-turbo"
    
    if not api_key:
        # 如果没有设置API密钥，生成一个空的配置文件
        print("[提示] 未找到 API 密钥配置")
        print("[提示] 请使用以下方式之一设置:")
        print("  1. 创建 .vscode/api_config.json 文件（推荐）")
        print("     复制 .vscode/api_config.example.json 为 api_config.json 并填入配置")
        print("  2. 设置环境变量 DATAAI_DEFAULT_AI_API_KEY")
        print("[诊断] 可以使用以下命令检查环境变量:")
        print("       python scripts/check_env_vars.py")
        config_content = '''"""
嵌入的默认AI模型配置（打包时生成，不提交到代码仓库）
此文件在打包时通过配置文件或环境变量自动生成
"""
from typing import Optional, Dict, Any

# 默认配置（未设置）
_DEFAULT_CONFIG: Optional[Dict[str, Any]] = None


def get_default_config() -> Optional[Dict[str, Any]]:
    """获取默认AI模型配置"""
    return _DEFAULT_CONFIG
'''
    else:
        
        # 对API密钥进行简单编码（增加一点安全性，虽然不能完全防止逆向）
        # 使用 base64 编码（不是加密，只是编码）
        import base64
        encoded_key = base64.b64encode(api_key.encode('utf-8')).decode('utf-8')
        
        # 生成配置文件内容
        config_content = f'''"""
嵌入的默认AI模型配置（打包时生成，不提交到代码仓库）
此文件在打包时通过配置文件或环境变量自动生成
"""
import base64
from typing import Optional, Dict, Any

# 默认配置（在打包时设置）
_DEFAULT_CONFIG: Optional[Dict[str, Any]] = {{
    "name": {repr(name)},
    "provider": {repr(provider)},
    "api_key": base64.b64decode({repr(encoded_key)}).decode('utf-8'),
    "base_url": {repr(base_url)},
    "default_model": {repr(default_model)},
    "turbo_model": {repr(turbo_model)},
    "is_default": True,
}}


def get_default_config() -> Optional[Dict[str, Any]]:
    """获取默认AI模型配置"""
    return _DEFAULT_CONFIG
'''
    
    # 写入文件
    try:
        config_file.parent.mkdir(parents=True, exist_ok=True)
        with open(config_file, 'w', encoding='utf-8') as f:
            f.write(config_content)
        print(f"[成功] 已生成配置文件: {config_file}")
        if api_key:
            print(f"[提示] 配置名称: {name}")
            print(f"[提示] 提供商: {provider}")
            print(f"[提示] 默认模型: {default_model}")
        return True
    except Exception as e:
        print(f"[错误] 生成配置文件失败: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    success = generate_config()
    sys.exit(0 if success else 1)


