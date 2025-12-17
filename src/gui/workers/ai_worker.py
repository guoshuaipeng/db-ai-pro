"""
AI生成SQL工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging
import re

logger = logging.getLogger(__name__)


class AIWorker(QThread):
    """AI生成SQL工作线程"""
    
    # 定义信号
    sql_generated = pyqtSignal(str)  # 生成的SQL
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, ai_client, user_query: str, table_schema: str = "", table_names: list = None, db_type: str = None, current_sql: str = None, all_table_names: list = None):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_schema = table_schema
        self.table_names = table_names or []
        self.all_table_names = all_table_names or []  # 所有表名列表
        self.db_type = db_type  # 数据库类型
        self.current_sql = current_sql  # 当前SQL编辑器中的SQL
        self.table_columns_map = {}  # 表名 -> 列名列表的映射
        self._parse_table_schema()  # 解析表结构，提取列名
        self._should_stop = False
    
    def _parse_table_schema(self):
        """从表结构中解析出表名和列名的映射"""
        if not self.table_schema or not self.table_schema.strip():
            return
        
        current_table = None
        for line in self.table_schema.split('\n'):
            line = line.strip()
            if not line:
                continue
            
            # 解析表名行：格式为 "表: table_name [主键: ...] - 注释"
            if line.startswith('表: '):
                # 提取表名（在 "表: " 之后，可能在 " [" 或 " -" 之前）
                table_part = line[3:].strip()  # 移除 "表: "
                # 提取表名（可能在 [主键 或 - 之前）
                if ' [' in table_part:
                    current_table = table_part.split(' [')[0].strip()
                elif ' - ' in table_part:
                    current_table = table_part.split(' - ')[0].strip()
                else:
                    current_table = table_part.strip()
                
                if current_table:
                    self.table_columns_map[current_table] = []
            
            # 解析列名行：格式为 "  • column_name: TYPE (可空/非空) (注释)"
            elif line.startswith('  • ') and current_table:
                # 提取列名（在 "  • " 之后，在 ":" 之前）
                col_part = line[4:].strip()  # 移除 "  • "
                if ':' in col_part:
                    col_name = col_part.split(':')[0].strip()
                    if col_name and current_table in self.table_columns_map:
                        self.table_columns_map[current_table].append(col_name)
        
        logger.info(f"解析表结构，提取到 {len(self.table_columns_map)} 个表的列信息")
        for table, columns in self.table_columns_map.items():
            logger.debug(f"表 {table} 有 {len(columns)} 个列: {columns[:5]}...")
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def _validate_sql_tables(self, sql: str, valid_tables: list) -> list:
        """
        验证SQL中使用的表名是否在有效表列表中
        
        :param sql: SQL语句
        :param valid_tables: 有效的表名列表
        :return: 无效的表名列表
        """
        if not valid_tables:
            return []
        
        # 转换为小写用于比较（不区分大小写）
        valid_tables_lower = [t.lower() for t in valid_tables]
        invalid_tables = []
        
        # 提取SQL中的表名（处理 FROM, JOIN, UPDATE, INSERT INTO 等）
        # 匹配模式：FROM table_name, JOIN table_name, UPDATE table_name, INSERT INTO table_name
        patterns = [
            r'\bFROM\s+[`"]?(\w+)[`"]?',
            r'\bJOIN\s+[`"]?(\w+)[`"]?',
            r'\bUPDATE\s+[`"]?(\w+)[`"]?',
            r'\bINTO\s+[`"]?(\w+)[`"]?',
            r'\bTABLE\s+[`"]?(\w+)[`"]?',
        ]
        
        found_tables = set()
        for pattern in patterns:
            matches = re.findall(pattern, sql, re.IGNORECASE)
            for match in matches:
                table_name = match.strip('`"').lower()
                if table_name and table_name not in found_tables:
                    found_tables.add(table_name)
                    # 检查表名是否在有效列表中
                    if table_name not in valid_tables_lower:
                        invalid_tables.append(match.strip('`"'))
        
        return invalid_tables
    
    def _validate_sql_columns(self, sql: str) -> dict:
        """
        验证SQL中使用的列名是否在表结构中存在（简化版本，主要验证明显的列名）
        
        :param sql: SQL语句
        :return: 字典，key为表名，value为该表中无效的列名列表
        """
        if not self.table_columns_map:
            return {}
        
        invalid_columns = {}  # {table_name: [invalid_columns]}
        
        # 提取SQL中使用的表名
        used_tables = {}
        table_patterns = [
            r'\bFROM\s+[`"]?(\w+)[`"]?',
            r'\bJOIN\s+[`"]?(\w+)[`"]?',
            r'\bUPDATE\s+[`"]?(\w+)[`"]?',
        ]
        
        for pattern in table_patterns:
            matches = re.findall(pattern, sql, re.IGNORECASE)
            for match in matches:
                table_name_raw = match.strip('`"')
                if table_name_raw:
                    # 找到对应的表（不区分大小写）
                    for valid_table in self.table_columns_map.keys():
                        if valid_table.lower() == table_name_raw.lower():
                            used_tables[valid_table] = table_name_raw
                            break
        
        # 如果没有找到使用的表，无法验证列名
        if not used_tables:
            return {}
        
        # SQL关键字列表（这些不是列名）
        sql_keywords = {
            'select', 'from', 'where', 'group', 'order', 'by', 'having', 
            'limit', 'offset', 'as', 'and', 'or', 'not', 'in', 'like', 
            'between', 'is', 'null', 'count', 'sum', 'avg', 'max', 'min',
            'distinct', 'case', 'when', 'then', 'else', 'end', 'if', 'exists',
            'insert', 'update', 'delete', 'set', 'values', 'into', 'join',
            'inner', 'left', 'right', 'outer', 'on', 'union', 'all', 'asc', 'desc',
            'true', 'false', 'date', 'time', 'year', 'month', 'day'
        }
        
        # 提取所有可能的列名
        # 匹配 table.column 格式
        table_column_pattern = r'[`"]?(\w+)[`"]?\s*\.\s*[`"]?(\w+)[`"]?'
        matches = re.findall(table_column_pattern, sql, re.IGNORECASE)
        
        for table_name_raw, col_name in matches:
            table_name_raw = table_name_raw.strip('`"')
            col_name = col_name.strip('`"')
            
            # 找到对应的表
            for valid_table in used_tables.keys():
                if valid_table.lower() == table_name_raw.lower():
                    # 验证列名
                    if valid_table in self.table_columns_map:
                        valid_columns = [c.lower() for c in self.table_columns_map[valid_table]]
                        if col_name.lower() not in valid_columns:
                            if valid_table not in invalid_columns:
                                invalid_columns[valid_table] = []
                            if col_name not in invalid_columns[valid_table]:
                                invalid_columns[valid_table].append(col_name)
                    break
        
        # 对于没有表前缀的列名，检查是否在所有使用的表的列中存在
        # 匹配 WHERE column, ORDER BY column, GROUP BY column 等
        standalone_column_patterns = [
            r'\bWHERE\s+[`"]?(\w+)[`"]?',  # WHERE column
            r'\bORDER\s+BY\s+[`"]?(\w+)[`"]?',  # ORDER BY column
            r'\bGROUP\s+BY\s+[`"]?(\w+)[`"]?',  # GROUP BY column
            r'\bHAVING\s+[`"]?(\w+)[`"]?',  # HAVING column
        ]
        
        for pattern in standalone_column_patterns:
            matches = re.findall(pattern, sql, re.IGNORECASE)
            for col_name in matches:
                col_name = col_name.strip('`"')
                # 跳过SQL关键字
                if col_name.lower() in sql_keywords:
                    continue
                # 跳过表名
                if col_name.lower() in [t.lower() for t in used_tables.keys()]:
                    continue
                
                # 检查列名是否在任何一个使用的表中存在
                found_in_any_table = False
                for valid_table in used_tables.keys():
                    if valid_table in self.table_columns_map:
                        valid_columns = [c.lower() for c in self.table_columns_map[valid_table]]
                        if col_name.lower() in valid_columns:
                            found_in_any_table = True
                            break
                
                # 如果列名不在任何表中，记录为无效（使用第一个表作为参考）
                if not found_in_any_table and used_tables:
                    first_table = list(used_tables.keys())[0]
                    if first_table not in invalid_columns:
                        invalid_columns[first_table] = []
                    if col_name not in invalid_columns[first_table]:
                        invalid_columns[first_table].append(col_name)
        
        return invalid_columns
    
    def run(self):
        """执行AI生成SQL（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 记录传递给AI的表结构信息
            logger.info(f"准备调用AI生成SQL，表结构是否为空: {not self.table_schema}")
            logger.info(f"表结构长度: {len(self.table_schema) if self.table_schema else 0}")
            logger.info(f"选中表名列表: {self.table_names}")
            logger.info(f"所有表名列表: {self.all_table_names}")
            if self.table_schema:
                logger.info(f"表结构前500字符: {self.table_schema[:500]}")
            
            # 调用AI生成SQL（传递表结构信息、数据库类型、当前SQL和所有表名列表）
            sql = self.ai_client.generate_sql(self.user_query, self.table_schema, self.db_type, self.current_sql, self.all_table_names)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 验证SQL是否为DDL语句（不允许DDL）
            sql_upper = sql.strip().upper()
            ddl_keywords = ['CREATE TABLE', 'CREATE DATABASE', 'CREATE INDEX', 'ALTER TABLE', 'DROP TABLE', 'DROP DATABASE', 'DROP INDEX', 'TRUNCATE TABLE', 'TRUNCATE']
            is_ddl = any(sql_upper.startswith(keyword) for keyword in ddl_keywords)
            
            if is_ddl:
                error_msg = "错误：查询功能只能生成DML语句（SELECT、INSERT、UPDATE、DELETE），不能生成DDL语句（CREATE、ALTER、DROP等）。如需创建或修改表结构，请使用\"新建表\"或\"编辑表\"功能。"
                logger.warning(f"AI生成了DDL语句，已拒绝: {sql[:100]}")
                self.error_occurred.emit(error_msg)
                return
            
            # 直接使用AI生成的SQL，不进行本地验证
            logger.info(f"AI生成SQL完成，直接使用生成的SQL")
            
            # 发送生成的SQL
            self.sql_generated.emit(sql)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI生成SQL失败: {error_msg}")
            self.error_occurred.emit(error_msg)
        finally:
            # 确保线程正确结束
            self.quit()

