"""
AI提示词配置
"""
from pydantic import BaseModel
from typing import Optional
import json
import os
import logging
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

logger = logging.getLogger(__name__)


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
    """提示词配置存储（使用 SQLite）"""
    
    def __init__(self):
        """初始化提示词存储"""
        from .config_db import get_config_db
        self.config_db = get_config_db()
    
    def load_prompts(self) -> PromptConfig:
        """从 SQLite 加载提示词配置"""
        try:
            # 从 SQLite 获取所有提示词
            prompts_dict = self.config_db.get_all_prompts()
            
            # 从 settings 表获取 query_enum_values
            query_enum_values = self.config_db.get_setting('query_enum_values', False)
            
            # 构建配置字典，如果 SQLite 中没有，使用默认值
            config_dict = {
                'query_enum_values': query_enum_values,
                'generate_sql_system': prompts_dict.get('generate_sql_system', GENERATE_SQL_SYSTEM_PROMPT),
                'select_tables_system': prompts_dict.get('select_tables_system', SELECT_TABLES_SYSTEM_PROMPT),
                'select_enum_columns_system': prompts_dict.get('select_enum_columns_system', SELECT_ENUM_COLUMNS_SYSTEM_PROMPT),
                'create_table_select_reference_tables_system': prompts_dict.get('create_table_select_reference_tables_system', CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT),
                'create_table_generate_sql_system': prompts_dict.get('create_table_generate_sql_system', CREATE_TABLE_GENERATE_SQL_SYSTEM_PROMPT),
                'edit_table_generate_sql_system': prompts_dict.get('edit_table_generate_sql_system', EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT),
                'parse_connection_config_system': prompts_dict.get('parse_connection_config_system', PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT),
            }
            
            return PromptConfig(**config_dict)
        except Exception as e:
            logger.error(f"从 SQLite 加载提示词配置失败: {str(e)}", exc_info=True)
            # 加载失败时返回默认配置
            return PromptConfig()
    
    def save_prompts(self, config: PromptConfig):
        """保存提示词配置到 SQLite"""
        try:
            # 保存所有提示词到 prompts 表
            self.config_db.save_prompt('generate_sql_system', config.generate_sql_system)
            self.config_db.save_prompt('select_tables_system', config.select_tables_system)
            self.config_db.save_prompt('select_enum_columns_system', config.select_enum_columns_system)
            self.config_db.save_prompt('create_table_select_reference_tables_system', config.create_table_select_reference_tables_system)
            self.config_db.save_prompt('create_table_generate_sql_system', config.create_table_generate_sql_system)
            self.config_db.save_prompt('edit_table_generate_sql_system', config.edit_table_generate_sql_system)
            self.config_db.save_prompt('parse_connection_config_system', config.parse_connection_config_system)
            
            # 保存 query_enum_values 到 settings 表
            self.config_db.save_setting('query_enum_values', config.query_enum_values)
            
            logger.info("提示词配置已保存到 SQLite")
        except Exception as e:
            logger.error(f"保存提示词配置到 SQLite 失败: {str(e)}", exc_info=True)
            raise

