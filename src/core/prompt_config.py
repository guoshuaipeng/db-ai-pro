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
    CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT,
    PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT,
)
from .prompts.query_prompts import GENERATE_REDIS_COMMAND_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class PromptConfig(BaseModel):
    """提示词配置（当前有效字段，LangGraph 版本精简）"""

    # ── 功能开关 ──────────────────────────────────────────────────
    query_enum_values: bool = False  # 是否允许 AI 查询枚举字段的值（开启后更准确但更慢）

    # ── 查询 SQL 生成（LangGraph Agent 降级兜底） ─────────────────
    generate_sql_system: str = GENERATE_SQL_SYSTEM_PROMPT

    # ── 查询：搜索相关表（LangGraph search_relevant_tables 工具内部使用） ──
    select_tables_system: str = SELECT_TABLES_SYSTEM_PROMPT

    # ── 建表：选择参考表（CreateTableSelectReferenceWorker 使用） ─
    create_table_select_reference_tables_system: str = CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT

    # ── 连接配置解析 ──────────────────────────────────────────────
    parse_connection_config_system: str = PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT

    # ── Redis 命令生成 ────────────────────────────────────────────
    generate_redis_command_system: str = GENERATE_REDIS_COMMAND_SYSTEM_PROMPT


class PromptStorage:
    """提示词配置存储（使用 SQLite）"""

    def __init__(self):
        from .config_db import get_config_db
        self.config_db = get_config_db()

    def load_prompts(self) -> PromptConfig:
        """从 SQLite 加载提示词配置"""
        try:
            prompts_dict = self.config_db.get_all_prompts()
            query_enum_values = self.config_db.get_setting('query_enum_values', False)

            config_dict = {
                'query_enum_values': query_enum_values,
                'generate_sql_system': prompts_dict.get('generate_sql_system', GENERATE_SQL_SYSTEM_PROMPT),
                'select_tables_system': prompts_dict.get('select_tables_system', SELECT_TABLES_SYSTEM_PROMPT),
                'create_table_select_reference_tables_system': prompts_dict.get(
                    'create_table_select_reference_tables_system',
                    CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT,
                ),
                'parse_connection_config_system': prompts_dict.get(
                    'parse_connection_config_system', PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT
                ),
                'generate_redis_command_system': prompts_dict.get(
                    'generate_redis_command_system', GENERATE_REDIS_COMMAND_SYSTEM_PROMPT
                ),
            }
            return PromptConfig(**config_dict)
        except Exception as e:
            logger.error(f"从 SQLite 加载提示词配置失败: {str(e)}", exc_info=True)
            return PromptConfig()

    def save_prompts(self, config: PromptConfig):
        """保存提示词配置到 SQLite"""
        try:
            self.config_db.save_prompt('generate_sql_system', config.generate_sql_system)
            self.config_db.save_prompt('select_tables_system', config.select_tables_system)
            self.config_db.save_prompt(
                'create_table_select_reference_tables_system',
                config.create_table_select_reference_tables_system,
            )
            self.config_db.save_prompt('parse_connection_config_system', config.parse_connection_config_system)
            self.config_db.save_prompt('generate_redis_command_system', config.generate_redis_command_system)
            self.config_db.save_setting('query_enum_values', config.query_enum_values)
            logger.info("提示词配置已保存到 SQLite")
        except Exception as e:
            logger.error(f"保存提示词配置到 SQLite 失败: {str(e)}", exc_info=True)
            raise
