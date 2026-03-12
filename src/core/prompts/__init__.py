"""
提示词模块
将不同类型的提示词分离到独立文件中，便于维护和编辑
"""
from .query_prompts import (
    GENERATE_SQL_SYSTEM_PROMPT,
    SELECT_TABLES_SYSTEM_PROMPT,
    SELECT_ENUM_COLUMNS_SYSTEM_PROMPT,
)
from .create_table_prompts import (
    CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT,
    CREATE_TABLE_GENERATE_SQL_SYSTEM_PROMPT,
)
from .edit_table_prompts import (
    EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT,
)
from .connection_prompts import (
    PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT,
)

__all__ = [
    # 查询相关
    "GENERATE_SQL_SYSTEM_PROMPT",
    "SELECT_TABLES_SYSTEM_PROMPT",
    "SELECT_ENUM_COLUMNS_SYSTEM_PROMPT",  # 保留供旧代码兼容，不再暴露到配置界面
    # 创建表相关
    "CREATE_TABLE_SELECT_REFERENCE_TABLES_SYSTEM_PROMPT",
    "CREATE_TABLE_GENERATE_SQL_SYSTEM_PROMPT",  # 保留供旧代码兼容
    # 编辑表相关
    "EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT",    # 保留供旧代码兼容
    # 连接配置相关
    "PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT",
]

