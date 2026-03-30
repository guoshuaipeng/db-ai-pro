"""
数据库连接管理器
"""
from typing import Dict, Optional, List, Union
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
import logging

from src.core.database_connection import DatabaseConnection, DatabaseType
from src.core.schema_cache import get_schema_cache
from src.core.redis_client import RedisClient

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self):
        self.connections: Dict[str, DatabaseConnection] = {}
        self.engines: Dict[str, Union[Engine, RedisClient]] = {}  # Redis 使用 RedisClient
        self.connection_order: List[str] = []  # 维护连接ID的顺序
    
    def add_connection(self, connection: DatabaseConnection, test_connection: bool = True) -> bool:
        """添加数据库连接
        
        Args:
            connection: 数据库连接配置
            test_connection: 是否测试连接，默认为 True。导入时设为 False 可以跳过连接测试
        """
        try:
            connection_id = connection.id or f"{connection.name}_{id(connection)}"
            connection.id = connection_id
            
            # 检查必要的驱动是否已安装
            if connection.db_type.value == "oracle":
                try:
                    import oracledb
                except ImportError:
                    error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb"
                    logger.error(f"{error_msg} - {connection.name}")
                    if test_connection:
                        return False
                    # 即使缺少驱动，也保存连接配置（用户可能稍后安装驱动）
                    if connection_id not in self.connection_order:
                        self.connection_order.append(connection_id)
                    self.connections[connection_id] = connection
                    logger.info(f"添加数据库连接（缺少驱动，未测试）: {connection.name}")
                    return True
            
            # Redis 特殊处理
            if connection.db_type == DatabaseType.REDIS:
                try:
                    redis_client = RedisClient(connection)
                    if test_connection:
                        success, message = redis_client.test_connection()
                        if not success:
                            logger.error(f"Redis 连接测试失败: {message} - {connection.name}")
                            return False
                    # 保存 Redis 客户端
                    self.engines[connection_id] = redis_client
                    if connection_id not in self.connection_order:
                        self.connection_order.append(connection_id)
                    self.connections[connection_id] = connection
                    logger.info(f"成功添加 Redis 连接: {connection.name}")
                    return True
                except ImportError as e:
                    error_msg = "缺少 Redis 驱动 (redis)。请运行: pip install redis"
                    logger.error(f"{error_msg} - {connection.name}")
                    if test_connection:
                        return False
                    if connection_id not in self.connection_order:
                        self.connection_order.append(connection_id)
                    self.connections[connection_id] = connection
                    logger.info(f"添加 Redis 连接（缺少驱动，未测试）: {connection.name}")
                    return True
                except Exception as e:
                    logger.error(f"添加 Redis 连接失败: {str(e)}")
                    if test_connection:
                        return False
                    if connection_id not in self.connection_order:
                        self.connection_order.append(connection_id)
                    self.connections[connection_id] = connection
                    logger.info(f"添加 Redis 连接（测试失败）: {connection.name}")
                    return True
            
            # 获取连接参数
            connect_args = connection.get_connect_args()
            
            if test_connection:
                # 测试连接
                engine_kwargs = {
                    'connect_args': connect_args,
                    'pool_pre_ping': True,  # 连接前测试
                    'echo': False
                }
                
                # 为 Oracle 添加连接超时（避免长时间等待导致UI卡死）
                if connection.db_type.value == "oracle":
                    # 确保超时时间不超过30秒（即使配置中设置了更长的超时）
                    timeout = min(connection.timeout, 30)
                    engine_kwargs['connect_args'] = connect_args.copy()
                    engine_kwargs['connect_args']['tcp_connect_timeout'] = timeout
                
                engine = create_engine(
                    connection.get_connection_string(),
                    **engine_kwargs
                )
                
                # 测试连接是否可用
                # Oracle 使用 SELECT 1 FROM DUAL
                if connection.db_type.value == "oracle":
                    test_sql = text("SELECT 1 FROM DUAL")
                else:
                    test_sql = text("SELECT 1")
                
                with engine.connect() as conn:
                    conn.execute(test_sql)
                
                # 保存引擎
                self.engines[connection_id] = engine
            else:
                # 不测试连接，只创建引擎但不立即连接
                engine = create_engine(
                    connection.get_connection_string(),
                    connect_args=connect_args,
                    pool_pre_ping=False,  # 不立即测试
                    echo=False
                )
                # 保存引擎，但不在此时测试连接
                self.engines[connection_id] = engine
            
            # 保存连接配置
            # 如果是编辑（连接ID已存在），保持原有位置；否则添加到末尾
            if connection_id not in self.connection_order:
                self.connection_order.append(connection_id)
            self.connections[connection_id] = connection
            
            logger.debug(f"成功添加数据库连接: {connection.name} (测试连接: {test_connection})")
            return True
            
        except SQLAlchemyError as e:
            if test_connection:
                logger.error(f"添加数据库连接失败: {str(e)}")
            else:
                # 即使测试失败，也保存连接配置（用于导入场景）
                if connection_id not in self.connection_order:
                    self.connection_order.append(connection_id)
                self.connections[connection_id] = connection
                logger.info(f"添加数据库连接（未测试）: {connection.name}")
                return True
            return False
        except ImportError as e:
            # 处理缺少驱动的情况
            if "oracledb" in str(e) or ("oracle" in str(e).lower() and "cx_Oracle" not in str(e)):
                error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb"
            elif "cx_Oracle" in str(e):
                error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb（注意：推荐使用 oracledb 替代 cx_Oracle）"
            elif "pyodbc" in str(e):
                error_msg = "缺少 SQL Server 驱动 (pyodbc)。请运行: pip install pyodbc"
            elif "psycopg2" in str(e):
                error_msg = "缺少 PostgreSQL 驱动 (psycopg2)。请运行: pip install psycopg2-binary"
            elif "redis" in str(e):
                error_msg = "缺少 Redis 驱动 (redis)。请运行: pip install redis"
            else:
                error_msg = f"缺少必要的数据库驱动: {str(e)}"
            logger.error(f"{error_msg} - {connection.name}")
            if test_connection:
                return False
            # 即使缺少驱动，也保存连接配置
            if connection_id not in self.connection_order:
                self.connection_order.append(connection_id)
            self.connections[connection_id] = connection
            logger.info(f"添加数据库连接（缺少驱动，未测试）: {connection.name}")
            return True
        except Exception as e:
            # 检查是否是缺少驱动导致的错误
            if "No module named" in str(e) and ("oracledb" in str(e) or "cx_Oracle" in str(e)):
                error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb"
                logger.error(f"{error_msg} - {connection.name}")
            elif "No module named" in str(e) and "pyodbc" in str(e):
                error_msg = "缺少 SQL Server 驱动 (pyodbc)。请运行: pip install pyodbc"
                logger.error(f"{error_msg} - {connection.name}")
            elif "No module named" in str(e) and "psycopg2" in str(e):
                error_msg = "缺少 PostgreSQL 驱动 (psycopg2)。请运行: pip install psycopg2-binary"
                logger.error(f"{error_msg} - {connection.name}")
            elif "No module named" in str(e) and "redis" in str(e):
                error_msg = "缺少 Redis 驱动 (redis)。请运行: pip install redis"
                logger.error(f"{error_msg} - {connection.name}")
            else:
                logger.error(f"未知错误: {str(e)}")
            if test_connection:
                return False
            # 即使出错，也保存连接配置
            if connection_id not in self.connection_order:
                self.connection_order.append(connection_id)
            self.connections[connection_id] = connection
            logger.info(f"添加数据库连接（出错，未测试）: {connection.name}")
            return True
    
    def remove_connection(self, connection_id: str) -> bool:
        """移除数据库连接并清除相关缓存"""
        try:
            if connection_id in self.engines:
                engine = self.engines[connection_id]
                # Redis 使用 close() 方法
                if isinstance(engine, RedisClient):
                    engine.close()
                else:
                    engine.dispose()
                del self.engines[connection_id]
            
            if connection_id in self.connections:
                del self.connections[connection_id]
            
            # 从顺序列表中移除
            if connection_id in self.connection_order:
                self.connection_order.remove(connection_id)
            
            # 清除该连接的缓存
            cache = get_schema_cache()
            cache.clear_connection_cache(connection_id)
            
            logger.info(f"成功移除数据库连接: {connection_id}")
            return True
            
        except Exception as e:
            logger.error(f"移除数据库连接失败: {str(e)}")
            return False
    
    def get_connection(self, connection_id: str) -> Optional[DatabaseConnection]:
        """获取连接配置"""
        return self.connections.get(connection_id)
    
    def get_engine(self, connection_id: str) -> Optional[Union[Engine, RedisClient]]:
        """获取数据库引擎或Redis客户端（如果不存在则创建）
        
        注意：此方法只创建引擎对象，不会立即连接数据库，避免阻塞UI线程。
        实际连接会在第一次使用时进行。
        """
        # 如果引擎已存在，直接返回
        if connection_id in self.engines:
            return self.engines[connection_id]
        
        # 如果连接存在但引擎不存在，创建引擎
        connection = self.connections.get(connection_id)
        if connection:
            try:
                # Redis 特殊处理
                if connection.db_type == DatabaseType.REDIS:
                    redis_client = RedisClient(connection)
                    self.engines[connection_id] = redis_client
                    return redis_client
                
                # SQL 数据库
                # 注意：不使用 pool_pre_ping=True，避免创建引擎时立即连接数据库
                # 实际连接会在第一次使用时进行，并且会在后台线程中执行
                connect_args = connection.get_connect_args()
                engine = create_engine(
                    connection.get_connection_string(),
                    connect_args=connect_args,
                    pool_pre_ping=False,  # 不立即测试连接，避免阻塞UI
                    echo=False
                )
                self.engines[connection_id] = engine
                return engine
            except Exception as e:
                logger.error(f"创建数据库引擎失败: {str(e)}", exc_info=True)
                logger.error(f"连接信息: connection_id={connection_id}, db_type={connection.db_type.value}")
                return None
        
        return None
    
    def get_all_connections(self) -> List[DatabaseConnection]:
        """获取所有连接（按照原始顺序）"""
        # 按照 connection_order 的顺序返回连接
        result = []
        for conn_id in self.connection_order:
            if conn_id in self.connections:
                result.append(self.connections[conn_id])
        # 如果顺序列表中有遗漏的连接（不应该发生，但为了安全），也添加进去
        for conn_id, conn in self.connections.items():
            if conn_id not in self.connection_order:
                result.append(conn)
                self.connection_order.append(conn_id)  # 添加到顺序列表
        return result
    
    def switch_database(self, connection_id: str, database: str) -> bool:
        """切换指定连接使用的数据库
        
        - 更新连接配置中的 database 字段
        - 关闭并移除旧引擎，下次使用时会基于新的数据库创建引擎
        - 清除该连接相关的缓存（表 / 元数据等）
        """
        connection = self.connections.get(connection_id)
        if not connection:
            logger.error(f"切换数据库失败，连接不存在: {connection_id}")
            return False
        
        # SQLite 特殊处理：不切换数据库（因为 database 字段存储的是文件路径）
        # 对于 SQLite，"main" 只是虚拟的数据库名称，用于树视图显示
        # 绝对不能让"main"覆盖掉实际的文件路径
        if connection.db_type == DatabaseType.SQLITE:
            if database == "main":
                logger.debug(f"SQLite 连接忽略虚拟数据库名'main'，保持文件路径: {connection.database}")
                return True
            # 如果传入的不是"main"，可能是在设置新的文件路径，允许更新
            logger.debug(f"SQLite 连接更新文件路径: {connection.database} -> {database}")
            connection.database = database
            return True
        
        # 如果数据库未变化，直接返回
        if connection.database == database:
            return True
        
        logger.info(f"切换连接 {connection_id} 的数据库: {connection.database} -> {database}")
        
        # 更新连接配置中的数据库名称
        connection.database = database
        
        # 关闭并移除旧引擎，让后续按新数据库重新创建
        if connection_id in self.engines:
            try:
                engine = self.engines[connection_id]
                # Redis 使用 close() 方法，SQL 数据库使用 dispose() 方法
                if isinstance(engine, RedisClient):
                    engine.close()
                else:
                    engine.dispose()
            except Exception as e:
                logger.warning(f"关闭旧引擎时出错（可忽略）: {e}")
            finally:
                self.engines.pop(connection_id, None)
        
        # 清除该连接的缓存
        try:
            cache = get_schema_cache()
            cache.clear_connection_cache(connection_id)
        except Exception as e:
            logger.warning(f"清除连接缓存时出错（可忽略）: {e}")
        
        return True
    
    def test_connection(self, connection_id: str) -> tuple[bool, str]:
        """测试连接"""
        engine = self.engines.get(connection_id)
        if not engine:
            return False, "连接不存在"
        
        try:
            # Redis 特殊处理
            if isinstance(engine, RedisClient):
                return engine.test_connection()
            
            # SQL 数据库
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True, "连接成功"
        except SQLAlchemyError as e:
            return False, f"连接失败: {str(e)}"
        except Exception as e:
            return False, f"连接失败: {str(e)}"
    
    def execute_query(
        self, 
        connection_id: str, 
        sql: str, 
        limit: Optional[int] = None
    ) -> tuple[bool, Optional[List[Dict]], Optional[str]]:
        """执行SQL查询"""
        engine = self.engines.get(connection_id)
        if not engine:
            return False, None, "连接不存在"
        
        try:
            # 如果有限制，添加LIMIT子句
            if limit and "LIMIT" not in sql.upper():
                sql = f"{sql.rstrip(';')} LIMIT {limit}"
            
            with engine.connect() as conn:
                result = conn.execute(text(sql))
                
                # 获取列名
                columns = result.keys()
                
                # 获取数据
                rows = []
                for row in result:
                    rows.append(dict(row._mapping))
                
                return True, rows, None
                
        except SQLAlchemyError as e:
            return False, None, str(e)
        except Exception as e:
            return False, None, f"未知错误: {str(e)}"
    
    def execute_non_query(
        self, 
        connection_id: str, 
        sql: str
    ) -> tuple[bool, Optional[int], Optional[str]]:
        """执行非查询SQL（INSERT, UPDATE, DELETE等）"""
        engine = self.engines.get(connection_id)
        if not engine:
            return False, None, "连接不存在"
        
        # 如果是DELETE语句，在日志中打印
        if sql.strip().upper().startswith('DELETE'):
            logger.info("=" * 80)
            logger.info(f"执行DELETE语句: {sql}")
            logger.info("=" * 80)
        
        try:
            with engine.begin() as conn:
                result = conn.execute(text(sql))
                affected_rows = result.rowcount
                return True, affected_rows, None
                
        except SQLAlchemyError as e:
            return False, None, str(e)
        except Exception as e:
            return False, None, f"未知错误: {str(e)}"
    
    def get_databases(self, connection_id: str) -> List[str]:
        """获取数据库实例中的所有数据库列表"""
        connection = self.get_connection(connection_id)
        if not connection:
            return []
        
        # Redis 特殊处理：动态查询数据库数量
        if connection.db_type == DatabaseType.REDIS:
            try:
                # 尝试查询数据库数量
                redis_client = RedisClient(connection)
                try:
                    db_count = redis_client.get_database_count()
                    logger.debug(f"查询到 Redis 数据库数量: {db_count}")
                    return [str(i) for i in range(db_count)]
                except Exception as e:
                    logger.warning(f"查询 Redis 数据库数量失败: {e}，使用默认值 16")
                    return [str(i) for i in range(16)]
                finally:
                    try:
                        redis_client.close()
                    except:
                        pass
            except Exception as e:
                logger.warning(f"创建 Redis 客户端失败: {e}，使用默认值 16")
                return [str(i) for i in range(16)]
        
        # 获取引擎（如果不存在则创建）
        engine = self.get_engine(connection_id)
        if not engine:
            logger.error(f"无法获取数据库引擎: {connection_id}")
            return []
        
        try:
            # 根据数据库类型使用不同的SQL查询
            # 注意：如果连接失败，会立即抛出异常，不会等待超时（因为超时设置在 connect_args 中）
            if connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                # MySQL/MariaDB: 查询所有数据库
                with engine.connect() as conn:
                    result = conn.execute(text("SHOW DATABASES"))
                    databases = [row[0] for row in result if row[0] not in ('information_schema', 'performance_schema', 'mysql', 'sys')]
                    return databases
            elif connection.db_type == DatabaseType.POSTGRESQL:
                # PostgreSQL: 查询所有数据库
                with engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT datname FROM pg_database 
                        WHERE datistemplate = false 
                        AND datname != 'postgres'
                        ORDER BY datname
                    """))
                    databases = [row[0] for row in result]
                    return databases
            elif connection.db_type == DatabaseType.HIVE:
                # Hive: 查询所有数据库
                with engine.connect() as conn:
                    result = conn.execute(text("SHOW DATABASES"))
                    databases = [row[0] for row in result]
                    return databases
            elif connection.db_type == DatabaseType.SQLITE:
                # SQLite: 单文件数据库，返回 "main" 作为数据库名
                return ["main"]
            else:
                # 其他数据库类型，返回当前数据库
                return [connection.database] if connection.database else []
        except SQLAlchemyError as e:
            # 数据库连接错误，记录日志并返回空列表
            error_str = str(e).lower()
            if 'timeout' in error_str or 'timed out' in error_str or 'connection' in error_str:
                logger.warning(f"获取数据库列表时连接失败: {str(e)}，返回空列表")
            else:
                logger.error(f"获取数据库列表失败: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"获取数据库列表失败: {str(e)}")
            return []
    
    def get_tables(self, connection_id: str, database: Optional[str] = None) -> List[str]:
        """获取数据库表列表"""
        # 获取连接信息
        connection = self.get_connection(connection_id)
        if not connection:
            return []
        
        # Redis 特殊处理：Redis 不使用表的概念，返回空列表
        if connection.db_type == DatabaseType.REDIS:
            return []
        
        # 获取引擎（如果不存在则创建）
        engine = self.get_engine(connection_id)
        if not engine:
            logger.error(f"无法获取数据库引擎: {connection_id}")
            return []
        
        try:
            inspector = inspect(engine)
            
            # MySQL/MariaDB: 通过 schema 参数获取指定数据库的表列表，而不是执行 USE
            # 注意：如果连接失败，会立即抛出异常，不会等待超时（因为超时设置在 connect_args 中）
            if database and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                return inspector.get_table_names(schema=database)
            
            # 其他情况：使用默认数据库
            return inspector.get_table_names()
        except SQLAlchemyError as e:
            # 数据库连接错误，记录日志并返回空列表
            error_str = str(e).lower()
            if 'timeout' in error_str or 'timed out' in error_str or 'connection' in error_str:
                logger.warning(f"获取表列表时连接失败: {str(e)}，返回空列表")
            else:
                logger.error(f"获取表列表失败: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"获取表列表失败: {str(e)}")
            return []
    
    def get_table_columns(self, connection_id: str, table_name: str) -> List[Dict]:
        """获取表的列信息"""
        engine = self.engines.get(connection_id)
        if not engine:
            return []
        
        # Redis 特殊处理：Redis 不使用表的概念，返回空列表
        if isinstance(engine, RedisClient):
            return []
        
        try:
            inspector = inspect(engine)
            columns = inspector.get_columns(table_name)
            return [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "default": col.get("default"),
                }
                for col in columns
            ]
        except Exception as e:
            logger.error(f"获取列信息失败: {str(e)}")
            return []
    
    def close_all(self):
        """关闭所有连接"""
        for engine in self.engines.values():
            try:
                # Redis 使用 close() 方法
                if isinstance(engine, RedisClient):
                    engine.close()
                else:
                    engine.dispose()
            except Exception as e:
                logger.error(f"关闭连接失败: {str(e)}")
        
        self.engines.clear()
        self.connections.clear()
        self.connection_order.clear()

