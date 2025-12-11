"""
获取表名列表工作线程（只获取表名，不获取结构）
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
import logging

from src.core.schema_cache import get_schema_cache

logger = logging.getLogger(__name__)


class TableListWorker(QThread):
    """获取表名列表工作线程（只获取表名，不获取结构）"""
    
    # 定义信号 - 返回包含表名和注释的字典列表: [{"name": "table1", "comment": "注释1"}, ...]
    tables_ready = pyqtSignal(list)  # 表信息列表（字典列表）
    
    def __init__(self, connection_string: str, connect_args: dict, connection_id: str = None, database: str = None):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.connection_id = connection_id  # 连接ID，用于缓存
        self.database = database  # 数据库名，用于限制查询范围
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取表名列表（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 尝试从缓存获取
            cache = get_schema_cache()
            if self.connection_id:
                cached_tables = cache.get_table_list(self.connection_id)
                if cached_tables is not None:
                    logger.info(f"TableListWorker: 从缓存获取到 {len(cached_tables)} 个表")
                    if not (self.isInterruptionRequested() or self._should_stop):
                        self.tables_ready.emit(cached_tables)
                    return
            
            # 缓存未命中，从数据库查询
            logger.info(f"TableListWorker: 缓存未命中，从数据库查询表名列表")
            
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
                # 对于MySQL/MariaDB，使用schema参数
                if "mysql" in self.connection_string.lower():
                    tables = inspector.get_table_names(schema=self.database)
                    logger.info(f"TableListWorker: 从数据库 {self.database} 获取到 {len(tables)} 个表")
                else:
                    # 其他数据库类型，切换数据库后直接获取
                    tables = inspector.get_table_names()
                    logger.info(f"TableListWorker: 获取到 {len(tables)} 个表（数据库: {self.database}）")
            else:
                tables = inspector.get_table_names()
                logger.info(f"TableListWorker: 获取到 {len(tables)} 个表")
            
            # 批量获取表注释
            table_comments = self._get_all_table_comments(engine, tables)
            
            # 构建表信息列表（包含表名和注释）
            table_info_list = []
            for table_name in tables:
                table_info_list.append({
                    "name": table_name,
                    "comment": table_comments.get(table_name, "")
                })
            
            # 缓存结果（只缓存表名列表，保持向后兼容）
            if self.connection_id:
                cache.set_table_list(self.connection_id, tables)
            
            if not (self.isInterruptionRequested() or self._should_stop):
                # 发送表信息列表（包含表名和注释）
                self.tables_ready.emit(table_info_list)
                
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"获取表名列表失败: {error_msg}")
            self.tables_ready.emit([])  # 发送空列表表示失败
        except Exception as e:
            error_msg = str(e)
            logger.error(f"获取表名列表异常: {error_msg}")
            self.tables_ready.emit([])
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            
            # 确保线程正确结束
            self.quit()
    
    def _get_all_table_comments(self, engine, table_names: list) -> dict:
        """批量获取所有表的注释
        
        返回: {table_name: comment}
        """
        if not table_names:
            return {}
        
        table_comments = {}
        try:
            url_str = str(engine.url)
            
            if 'mysql' in url_str or 'mariadb' in url_str:
                # MySQL/MariaDB: 批量查询所有表注释
                db_name = self.database if self.database else engine.url.database
                if not db_name:
                    logger.debug(f"无法获取数据库名，跳过表注释查询")
                    return {}
                
                with engine.connect() as conn:
                    # 使用IN子句批量查询
                    placeholders = ','.join([f':table_{i}' for i in range(len(table_names))])
                    query = f"""
                        SELECT TABLE_NAME, TABLE_COMMENT 
                        FROM information_schema.TABLES 
                        WHERE TABLE_SCHEMA = :db_name 
                        AND TABLE_NAME IN ({placeholders})
                    """
                    params = {"db_name": db_name}
                    params.update({f'table_{i}': name for i, name in enumerate(table_names)})
                    
                    result = conn.execute(text(query), params)
                    for row in result:
                        table_name = row[0]
                        comment = row[1].strip() if row[1] else ""
                        if comment:
                            table_comments[table_name] = comment
                    
                    logger.info(f"批量获取到 {len(table_comments)} 个表的注释")
                    
            elif 'postgresql' in url_str:
                # PostgreSQL: 批量查询所有表注释
                with engine.connect() as conn:
                    placeholders = ','.join([f':table_{i}' for i in range(len(table_names))])
                    query = f"""
                        SELECT c.relname, obj_description(c.oid, 'pg_class') as comment
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = :schema_name
                        AND c.relname IN ({placeholders})
                    """
                    params = {"schema_name": "public"}
                    params.update({f'table_{i}': name for i, name in enumerate(table_names)})
                    
                    result = conn.execute(text(query), params)
                    for row in result:
                        table_name = row[0]
                        comment = row[1].strip() if row[1] else ""
                        if comment:
                            table_comments[table_name] = comment
                    
                    logger.info(f"批量获取到 {len(table_comments)} 个表的注释")
                    
        except Exception as e:
            logger.debug(f"批量获取表注释失败: {str(e)}")
        
        return table_comments

