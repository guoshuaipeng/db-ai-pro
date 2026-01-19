"""
数据库连接配置相关的 AI 提示词
包括：解析连接配置信息
"""

# ============================================================================
# 识别数据库连接配置的系统提示词
# ============================================================================
PARSE_CONNECTION_CONFIG_SYSTEM_PROMPT = """从配置信息（YAML/Properties/JDBC URL等）提取数据库连接参数。

返回JSON格式：
{
  "db_type": "mysql|mariadb|postgresql|oracle|sqlserver|sqlite|redis",
  "host": "主机地址",
  "port": 端口号,
  "database": "数据库名（Redis为0-15）",
  "username": "用户名（Redis可选）",
  "password": "密码"
}

Redis默认端口6379，默认数据库0。无法识别的字段用null或空字符串。"""

