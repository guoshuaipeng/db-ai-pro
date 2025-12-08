"""
应用配置
"""
from pydantic_settings import BaseSettings
from pathlib import Path
from typing import Optional
import json
import os
import sys


class Settings(BaseSettings):
    """应用设置"""
    
    # 应用配置
    app_name: str = "DataAI"
    app_version: str = "0.1.0"
    
    # 窗口配置
    window_width: int = 800
    window_height: int = 600
    window_maximized: bool = False
    
    # 主题配置
    theme: str = "default"
    dark_mode: bool = False
    
    # 语言配置
    language: str = "zh_CN"  # 默认中文，可选: zh_CN (中文), en_US (English)
    
    # AI相关配置
    query_enum_values: bool = False  # 是否查询枚举字段的值（默认不查询，因为查询较慢）
    
    # 其他配置
    debug: bool = False
    log_level: str = "INFO"
    
    class Config:
        """Pydantic配置"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 从注册表加载语言设置（如果可用）
        if sys.platform == "win32":
            try:
                from src.utils.registry_helper import RegistryHelper
                registry_language = RegistryHelper.get_language()
                if registry_language:
                    self.language = registry_language
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"从注册表加载语言设置失败: {e}")
        # 从配置文件加载其他设置（覆盖默认值）
        self.load_from_file()
    
    @staticmethod
    def get_config_dir() -> str:
        """
        获取配置目录路径
        
        :return: 配置目录路径（字符串格式）
        """
        home = Path.home()
        config_dir = home / ".db-ai"
        config_dir.mkdir(exist_ok=True)
        return str(config_dir)
    
    def get_config_file(self) -> Path:
        """获取配置文件路径"""
        return Path(self.get_config_dir()) / "settings.json"
    
    def load_from_file(self):
        """从配置文件加载设置（不包括语言设置，语言设置从注册表读取）"""
        config_file = self.get_config_file()
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    # 更新设置值（跳过语言设置，因为语言设置从注册表读取）
                    for key, value in config.items():
                        if key != 'language' and hasattr(self, key):
                            setattr(self, key, value)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"加载配置文件失败: {e}")
    
    def save_to_file(self):
        """保存设置到配置文件（不包括语言设置，语言设置保存到注册表）"""
        try:
            config_file = self.get_config_file()
            config = {
                # 注意：language 不保存到文件，而是保存到注册表
                'window_width': self.window_width,
                'window_height': self.window_height,
                'window_maximized': self.window_maximized,
                'theme': self.theme,
                'dark_mode': self.dark_mode,
                'query_enum_values': self.query_enum_values,
                'debug': self.debug,
                'log_level': self.log_level,
            }
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"保存配置文件失败: {e}")
    
    def save_language_to_registry(self) -> bool:
        """将语言设置保存到注册表"""
        if sys.platform == "win32":
            try:
                from src.utils.registry_helper import RegistryHelper
                return RegistryHelper.set_language(self.language)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"保存语言设置到注册表失败: {e}")
                return False
        return False


