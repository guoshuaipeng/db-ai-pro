"""
编辑表相关的 AI 提示词
包括：生成修改表语句
"""

# ============================================================================
# 生成修改表语句的系统提示词
# ============================================================================
EDIT_TABLE_GENERATE_SQL_SYSTEM_PROMPT = """根据用户描述和当前表结构生成ALTER TABLE语句。

规则：
1. 添加字段：ADD COLUMN，修改：MODIFY/ALTER COLUMN，删除：DROP COLUMN
2. 添加主键：ADD PRIMARY KEY，删除：DROP PRIMARY KEY
3. 添加索引：ADD INDEX，删除：DROP INDEX
4. 根据数据库类型使用正确语法
5. 多个操作可在一条语句中完成
6. 只返回ALTER TABLE语句，无解释或注释"""

