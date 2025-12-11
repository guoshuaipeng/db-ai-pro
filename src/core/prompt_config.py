"""
AI提示词配置
"""
from pydantic import BaseModel
from typing import Optional
import json
import os
from pathlib import Path
from .prompts import (
    GENERATE_SQL_SYSTEM_PROMPT,
    SELECT_TABLES_SYSTEM_PROMPT,
    SELECT_ENUM_COLUMNS_SYSTEM_PROMPT,
    CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT,
    CREATE_TABLE_GENERATE_SQL_SYSTEM_PROMPT,
    EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT,
    PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT,
)


class PromptConfig(BaseModel):
    """提示词配置"""
    # AI功能配置
    query_enum_values: bool = False  # 是否查询枚举字段的值（默认不查询，因为查询较慢）
    
    # 生成SQL的系统提示词（从 prompts/query_prompts.py 导入）
    generate_sql_system: str = GENERATE_SQL_SYSTEM_PROMPT

    # 选择表的系统提示词（从 prompts/query_prompts.py 导入）
    select_tables_system: str = SELECT_TABLES_SYSTEM_PROMPT

    # 选择枚举列的系统提示词（从 prompts/query_prompts.py 导入）
    select_enum_columns_system: str = SELECT_ENUM_COLUMNS_SYSTEM_PROMPT

    # 新建表：选择参考表的系统提示词（从 prompts/create_table_prompts.py 导入）
    create_table_select_reference_tables_system: str = CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT

    # 编辑表：生成修改表语句的系统提示词（从 prompts/edit_table_prompts.py 导入）
    edit_table_generate_sql_system: str = EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT

    # 新建表：生成建表语句的系统提示词（从 prompts/create_table_prompts.py 导入）
    create_table_generate_sql_system: str = CREATE_TABLE_GENERATE_SQL_SYSTEM_PROMPT

    # 识别数据库连接配置的系统提示词（从 prompts/connection_prompts.py 导入）
    parse_connection_config_system: str = PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT


class PromptStorage:
    """提示词配置存储"""
    
    def __init__(self, storage_path: str = None):
        """
        初始化提示词存储
        
        :param storage_path: 存储文件路径，默认为用户配置目录下的 prompts.json
        """
        if storage_path is None:
            from src.config.settings import Settings
            config_dir = Settings.get_config_dir()
            storage_path = os.path.join(config_dir, "prompts.json")
        
        self.storage_path = storage_path
        self._ensure_config_dir()
    
    def _ensure_config_dir(self):
        """确保配置目录存在"""
        config_dir = os.path.dirname(self.storage_path)
        if config_dir and not os.path.exists(config_dir):
            os.makedirs(config_dir, exist_ok=True)
    
    def load_prompts(self) -> PromptConfig:
        """加载提示词配置"""
        if not os.path.exists(self.storage_path):
            # 如果文件不存在，返回默认配置
            return PromptConfig()
        
        try:
            with open(self.storage_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return PromptConfig(**data)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"加载提示词配置失败: {str(e)}")
            # 加载失败时返回默认配置
            return PromptConfig()
    
    def save_prompts(self, config: PromptConfig):
        """保存提示词配置"""
        try:
            # 使用临时文件确保原子性写入
            import tempfile
            import shutil
            
            temp_path = self.storage_path + ".tmp"
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(config.model_dump(), f, ensure_ascii=False, indent=2)
            
            # 原子性替换
            shutil.move(temp_path, self.storage_path)
            
            import logging
            logger = logging.getLogger(__name__)
            logger.info("提示词配置已保存")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"保存提示词配置失败: {str(e)}")
            raise

