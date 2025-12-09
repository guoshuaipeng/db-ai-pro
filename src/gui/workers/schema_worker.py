"""
获取表结构工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
import logging

from src.core.schema_cache import get_schema_cache

logger = logging.getLogger(__name__)


class SchemaWorker(QThread):
    """获取表结构工作线程"""
    
    # 定义信号
    schema_ready = pyqtSignal(str, list)  # 表结构信息, 表名列表
    
    def __init__(self, connection_string: str, connect_args: dict, selected_tables: list = None, connection_id: str = None, database: str = None, force_refresh: bool = False):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.selected_tables = selected_tables  # 如果提供，只获取这些表的结构
        self.connection_id = connection_id  # 连接ID，用于缓存
        self.database = database  # 数据库名，用于限制查询范围
        self.force_refresh = force_refresh  # 是否强制刷新（跳过缓存）
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取表结构（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 如果不是强制刷新，尝试从缓存获取
            if not self.force_refresh:
                cache = get_schema_cache()
                if self.connection_id:
                    cached_result = cache.get_schema(self.connection_id, self.selected_tables)
                    if cached_result is not None:
                        schema_text, table_names = cached_result
                        logger.info(f"SchemaWorker: 从缓存获取表结构，表数量: {len(table_names)}")
                        if not (self.isInterruptionRequested() or self._should_stop):
                            self.schema_ready.emit(schema_text, table_names)
                        return
            else:
                # 强制刷新时，清除相关缓存
                cache = get_schema_cache()
                if self.connection_id:
                    cache.clear_connection_cache(self.connection_id)
                    logger.info(f"SchemaWorker: 强制刷新，已清除连接 {self.connection_id} 的缓存")
            
            # 缓存未命中或强制刷新，从数据库查询
            logger.info(f"SchemaWorker: {'强制刷新，' if self.force_refresh else ''}从数据库查询表结构")
            
            # 在线程中创建新的数据库引擎
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=True,
                echo=False,
                poolclass=None
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            inspector = inspect(engine)
            
            # 如果指定了数据库，只获取该数据库的表（MySQL/MariaDB支持schema参数）
            if self.database:
                if "mysql" in self.connection_string.lower():
                    all_tables = inspector.get_table_names(schema=self.database)
                    logger.info(f"SchemaWorker: 从数据库 {self.database} 获取表列表")
                else:
                    # 其他数据库类型，切换数据库后直接获取
                    all_tables = inspector.get_table_names()
                    logger.info(f"SchemaWorker: 获取表列表（数据库: {self.database}）")
            else:
                all_tables = inspector.get_table_names()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 如果指定了要获取的表，只处理这些表；否则处理前300个表
            if self.selected_tables and len(self.selected_tables) > 0:
                # 只获取选中的表的结构
                tables_to_process = [t for t in self.selected_tables if t in all_tables]
                
                # 如果精确匹配失败，尝试大小写不敏感匹配
                if not tables_to_process and self.selected_tables:
                    logger.warning(f"SchemaWorker: 精确匹配失败，尝试大小写不敏感匹配")
                    all_tables_lower = {t.lower(): t for t in all_tables}
                    for selected_table in self.selected_tables:
                        if selected_table.lower() in all_tables_lower:
                            matched_table = all_tables_lower[selected_table.lower()]
                            tables_to_process.append(matched_table)
                            logger.info(f"SchemaWorker: 大小写不敏感匹配成功: {selected_table} -> {matched_table}")
                
                logger.info(f"SchemaWorker: 只获取选中的 {len(tables_to_process)} 个表的结构")
                logger.info(f"SchemaWorker: 请求的表: {self.selected_tables}")
                logger.info(f"SchemaWorker: 数据库中的所有表数量: {len(all_tables)}")
                if not tables_to_process:
                    logger.warning(f"SchemaWorker: ⚠️ 没有找到匹配的表！请求的表: {self.selected_tables}")
                    logger.warning(f"SchemaWorker: 数据库中的前10个表: {all_tables[:10]}")
            else:
                # 获取前300个表的结构
                tables_to_process = all_tables[:300]
                logger.info(f"SchemaWorker: 获取前 {len(tables_to_process)} 个表的结构")
            
            # 构建表结构信息
            schema_parts = []
            logger.info(f"SchemaWorker: 开始构建表结构，共 {len(tables_to_process)} 个表")
            
            for idx, table_name in enumerate(tables_to_process, 1):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                try:
                    logger.debug(f"SchemaWorker: 正在处理第 {idx}/{len(tables_to_process)} 个表: {table_name}")
                    
                    # 解析表名（可能包含数据库名，如 database.table）
                    actual_table_name = table_name
                    schema_name = None
                    if '.' in table_name:
                        # 找到最后一个点号（数据库名可能包含点号）
                        last_dot_index = table_name.rfind('.')
                        schema_name = table_name[:last_dot_index].strip()
                        actual_table_name = table_name[last_dot_index + 1:].strip()
                    elif self.database:
                        # 如果表名不包含数据库名，但 self.database 存在，使用它作为 schema
                        schema_name = self.database
                    
                    # 获取列信息（有 schema 时总是传 schema，兼容 MySQL/PostgreSQL 等）
                    if schema_name:
                        columns = inspector.get_columns(actual_table_name, schema=schema_name)
                    else:
                        columns = inspector.get_columns(actual_table_name)
                    logger.debug(f"SchemaWorker: 表 {table_name} 有 {len(columns)} 个列")
                    
                    # 获取主键信息（兼容不同数据库/SQLAlchemy版本，使用 get_pk_constraint）
                    try:
                        if schema_name:
                            pk_constraint = inspector.get_pk_constraint(actual_table_name, schema=schema_name)
                        else:
                            pk_constraint = inspector.get_pk_constraint(actual_table_name)
                        primary_keys = pk_constraint.get("constrained_columns", []) if pk_constraint else []
                        logger.info(f"SchemaWorker: 表 {table_name} (schema={schema_name}, table={actual_table_name}) 的主键: {primary_keys}")
                        pk_info = f" [主键: {', '.join(primary_keys)}]" if primary_keys else ""
                        if not primary_keys:
                            logger.warning(f"SchemaWorker: 表 {table_name} 没有主键")
                    except Exception as e:
                        logger.error(f"获取表 {table_name} 的主键失败: {str(e)}", exc_info=True)
                        pk_info = ""
                    
                    # 尝试获取表注释
                    try:
                        table_comment = self._get_table_comment(engine, table_name)
                        comment_info = f" - {table_comment}" if table_comment else ""
                        if table_comment:
                            logger.debug(f"SchemaWorker: 表 {table_name} 的注释: {table_comment}")
                    except Exception as e:
                        logger.debug(f"获取表 {table_name} 的注释失败: {str(e)}")
                        comment_info = ""
                    
                    schema_parts.append(f"表: {table_name}{pk_info}{comment_info}")
                    
                    # 保持数据库表中的原始字段顺序（不排序）
                    for col in columns:
                        col_name = col['name']
                        col_type = str(col['type'])
                        
                        # 简化类型显示（移除长度信息，保留核心类型）
                        if 'ENUM' in col_type.upper() or 'enum' in col_type.lower():
                            col_type = 'ENUM'
                        elif 'VARCHAR' in col_type or 'CHAR' in col_type:
                            col_type = 'VARCHAR/STRING'
                        elif 'INT' in col_type:
                            col_type = 'INTEGER'
                        elif 'DECIMAL' in col_type or 'NUMERIC' in col_type:
                            col_type = 'DECIMAL'
                        elif 'DATETIME' in col_type or 'TIMESTAMP' in col_type:
                            col_type = 'DATETIME'
                        elif 'DATE' in col_type:
                            col_type = 'DATE'
                        elif 'TEXT' in col_type:
                            col_type = 'TEXT'
                        
                        nullable = "可空" if col.get('nullable', True) else "非空"
                        
                        # 尝试获取列注释
                        col_comment = ""
                        try:
                            col_comment = self._get_column_comment(engine, table_name, col_name)
                            comment_str = f" ({col_comment})" if col_comment else ""
                            if col_comment:
                                logger.debug(f"SchemaWorker: 列 {table_name}.{col_name} 的注释: {col_comment}")
                        except Exception as e:
                            logger.debug(f"获取列 {table_name}.{col_name} 的注释失败: {str(e)}")
                            comment_str = ""
                        
                        # 注意：这里不查询字段值，让AI先选择枚举字段，然后再查询
                        # 初始化 field_values_str 为空字符串
                        field_values_str = ""
                        
                        # 构建列信息
                        col_info = f"  • {col_name}: {col_type} ({nullable}){comment_str}{field_values_str}"
                        
                        # 添加默认值信息（如果有）
                        if col.get('default') is not None:
                            default_val = str(col.get('default'))
                            if default_val:
                                col_info += f", 默认: {default_val}"
                        
                        schema_parts.append(col_info)
                    
                    schema_parts.append("")  # 空行分隔
                    logger.debug(f"SchemaWorker: 表 {table_name} 处理完成，当前schema_parts长度: {len(schema_parts)}")
                    
                except Exception as e:
                    logger.error(f"获取表 {table_name} 的结构失败: {str(e)}", exc_info=True)
                    continue
            
            schema_text = "\n".join(schema_parts)
            
            # 记录获取到的表结构信息
            logger.info(f"SchemaWorker: 处理了 {len(tables_to_process)} 个表")
            logger.info(f"SchemaWorker: schema_parts 列表长度: {len(schema_parts)}")
            logger.info(f"SchemaWorker: 表结构文本长度: {len(schema_text)}")
            if schema_text and schema_text.strip():
                logger.info(f"SchemaWorker: 表结构前500字符:\n{schema_text[:500]}")
            else:
                logger.warning("SchemaWorker: ⚠️ 表结构文本为空！")
                logger.warning(f"SchemaWorker: schema_parts 内容: {schema_parts[:10] if schema_parts else '空列表'}")
            
            if not (self.isInterruptionRequested() or self._should_stop):
                # 缓存结果
                if self.connection_id:
                    cache.set_schema(self.connection_id, schema_text, tables_to_process, self.selected_tables)
                
                # 发送表结构信息和表名列表
                logger.info(f"SchemaWorker: 准备发送表结构，表名列表: {tables_to_process}")
                self.schema_ready.emit(schema_text, tables_to_process)
                
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"获取表结构失败: {error_msg}")
            self.schema_ready.emit("", [])  # 发送空字符串和空列表表示失败
        except Exception as e:
            error_msg = str(e)
            logger.error(f"获取表结构异常: {error_msg}")
            self.schema_ready.emit("", [])
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            
            # 确保线程正确结束
            self.quit()
    
    def _get_table_comment(self, engine, table_name: str) -> str:
        """获取表注释"""
        try:
            # 从连接字符串中提取数据库名
            db_name = None
            url_str = str(engine.url)
            if 'mysql' in url_str or 'mariadb' in url_str:
                db_name = engine.url.database
                if not db_name:
                    logger.debug(f"无法获取数据库名，跳过表注释查询")
                    return ""
                with engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT TABLE_COMMENT 
                        FROM information_schema.TABLES 
                        WHERE TABLE_SCHEMA = :db_name 
                        AND TABLE_NAME = :table_name
                    """), {"db_name": db_name, "table_name": table_name})
                    row = result.fetchone()
                    if row and row[0]:
                        comment = row[0].strip() if row[0] else ""
                        return comment if comment else ""
            elif 'postgresql' in url_str:
                with engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT obj_description(c.oid, 'pg_class') as comment
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = :schema_name
                        AND c.relname = :table_name
                    """), {"schema_name": "public", "table_name": table_name})
                    row = result.fetchone()
                    if row and row[0]:
                        comment = row[0].strip() if row[0] else ""
                        return comment if comment else ""
        except Exception as e:
            logger.debug(f"获取表 {table_name} 的注释失败: {str(e)}")
        return ""
    
    def _get_column_comment(self, engine, table_name: str, column_name: str) -> str:
        """获取列注释"""
        try:
            url_str = str(engine.url)
            if 'mysql' in url_str or 'mariadb' in url_str:
                db_name = engine.url.database
                if not db_name:
                    logger.debug(f"无法获取数据库名，跳过列注释查询")
                    return ""
                with engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT COLUMN_COMMENT 
                        FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = :db_name 
                        AND TABLE_NAME = :table_name
                        AND COLUMN_NAME = :column_name
                    """), {"db_name": db_name, "table_name": table_name, "column_name": column_name})
                    row = result.fetchone()
                    if row and row[0]:
                        comment = row[0].strip() if row[0] else ""
                        return comment if comment else ""
            elif 'postgresql' in url_str:
                with engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT col_description(c.oid, ordinal_position) as comment
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        JOIN information_schema.columns cols ON cols.table_name = c.relname
                        WHERE n.nspname = :schema_name
                        AND c.relname = :table_name
                        AND cols.column_name = :column_name
                    """), {"schema_name": "public", "table_name": table_name, "column_name": column_name})
                    row = result.fetchone()
                    if row and row[0]:
                        comment = row[0].strip() if row[0] else ""
                        return comment if comment else ""
        except Exception as e:
            logger.debug(f"获取列 {table_name}.{column_name} 的注释失败: {str(e)}")
        return ""
    
    def _get_field_unique_values(self, engine, table_name: str, column_name: str, max_values: int = 20) -> list:
        """
        获取字段的唯一值（用于AI推断枚举含义）
        
        :param engine: 数据库引擎
        :param table_name: 表名
        :param column_name: 列名
        :param max_values: 最多返回多少个唯一值
        :return: 唯一值列表
        """
        try:
            url_str = str(engine.url)
            
            with engine.connect() as conn:
                # 验证表名和列名只包含字母、数字、下划线和点（防止SQL注入）
                if not (table_name.replace('_', '').replace('.', '').isalnum() and 
                        column_name.replace('_', '').replace('.', '').isalnum()):
                    logger.warning(f"表名或列名包含非法字符，跳过查询: {table_name}.{column_name}")
                    return []
                
                # 根据数据库类型使用不同的引号
                if 'mysql' in url_str or 'mariadb' in url_str:
                    # MySQL使用反引号
                    query = text(f"""
                        SELECT DISTINCT `{column_name}` 
                        FROM `{table_name}` 
                        WHERE `{column_name}` IS NOT NULL
                        LIMIT :max_values
                    """)
                elif 'postgresql' in url_str:
                    # PostgreSQL使用双引号
                    query = text(f"""
                        SELECT DISTINCT "{column_name}" 
                        FROM "{table_name}" 
                        WHERE "{column_name}" IS NOT NULL
                        LIMIT :max_values
                    """)
                else:
                    # 其他数据库使用方括号或直接使用
                    query = text(f"""
                        SELECT DISTINCT [{column_name}] 
                        FROM [{table_name}] 
                        WHERE [{column_name}] IS NOT NULL
                        LIMIT :max_values
                    """)
                
                result = conn.execute(query, {"max_values": max_values})
                
                values = []
                for row in result:
                    if row[0] is not None:
                        # 转换为字符串，避免类型问题
                        val = str(row[0])
                        if val:  # 排除空字符串
                            values.append(val)
                
                logger.debug(f"获取到列 {table_name}.{column_name} 的 {len(values)} 个唯一值")
                return values
                
        except Exception as e:
            logger.debug(f"获取列 {table_name}.{column_name} 的唯一值失败: {str(e)}")
            return []

