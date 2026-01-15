"""
获取数据库列表工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from src.core.database_connection import DatabaseType, DatabaseConnection

logger = logging.getLogger(__name__)


class DatabaseListWorker(QThread):
    """获取数据库列表工作线程"""
    
    databases_ready = pyqtSignal(list)  # 数据库列表
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, db_type: DatabaseType, connection: Optional[DatabaseConnection] = None):
        super().__init__()
        self.setObjectName(f"DatabaseListWorker-{id(self)}")  # 设置线程名称，便于调试
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.db_type = db_type
        self.connection = connection  # 可选的 connection 对象，用于 Redis 查询数据库数量
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取数据库列表（在工作线程中运行）"""
        import time
        import threading
        start_time = time.time()
        logger.debug(f"[工作线程] DatabaseListWorker.run() 开始, 线程: {threading.current_thread().name}")
        
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                logger.debug(f"[工作线程] 线程已被中断，退出")
                return
            
            # 复制连接参数，使用原始超时配置
            connect_args = self.connect_args.copy() if self.connect_args else {}
            
            # 修改连接字符串，去掉数据库部分（连接到服务器级别）
            # 这样即使默认数据库被删除，也不会影响连接
            import re
            connection_string = self.connection_string
            
            # Redis 特殊处理：Redis 不使用 SQLAlchemy，需要动态查询数据库数量
            if self.db_type == DatabaseType.REDIS:
                try:
                    # 如果有 connection 对象，使用它来查询数据库数量
                    if self.connection:
                        from src.core.redis_client import RedisClient
                        redis_client = RedisClient(self.connection)
                        try:
                            db_count = redis_client.get_database_count()
                            logger.info(f"查询到 Redis 数据库数量: {db_count}")
                            databases = [str(i) for i in range(db_count)]
                        except Exception as e:
                            logger.warning(f"查询 Redis 数据库数量失败: {e}，使用默认值 16")
                            databases = [str(i) for i in range(16)]
                        finally:
                            try:
                                redis_client.close()
                            except:
                                pass
                    else:
                        # 如果没有 connection 对象，使用默认值 16
                        logger.warning("Redis 连接对象不可用，使用默认数据库数量 16")
                        databases = [str(i) for i in range(16)]
                    
                    if not (self.isInterruptionRequested() or self._should_stop):
                        self.databases_ready.emit(databases)
                    return
                except Exception as e:
                    logger.error(f"处理 Redis 数据库列表失败: {e}，使用默认值 16")
                    databases = [str(i) for i in range(16)]
                    if not (self.isInterruptionRequested() or self._should_stop):
                        self.databases_ready.emit(databases)
                    return
            
            # 对于 MySQL/MariaDB/PostgreSQL，移除连接字符串中的数据库部分
            if self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB, DatabaseType.POSTGRESQL):
                # 格式: mysql://user:pass@host:port/database
                # 改为: mysql://user:pass@host:port/
                connection_string = re.sub(r'/[^/]+(\?|$)', r'/\1', connection_string)
                if not connection_string.endswith('/'):
                    # 如果没有查询参数，添加 /
                    connection_string = re.sub(r'(:[0-9]+)(\?|$)', r'\1/\2', connection_string)
            
            # 在线程中创建新的数据库引擎
            engine = create_engine(
                connection_string,
                connect_args=connect_args,
                pool_pre_ping=False,  # 不使用pool_pre_ping，避免立即连接
                echo=False,
                poolclass=None  # 不使用连接池，每个线程独立连接
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                logger.debug(f"[工作线程] 线程已被中断，退出")
                return
            
            databases = []
            
            # 根据数据库类型使用不同的SQL查询
            connect_start = time.time()
            
            if self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                # MySQL/MariaDB: 查询所有数据库
                # 不使用全局socket设置，避免影响其他连接
                # 仅依赖connect_args中的超时设置
                
                with engine.connect() as conn:
                    if self.isInterruptionRequested() or self._should_stop:
                        return
                    result = conn.execute(text("SHOW DATABASES"))
                    databases = [
                        row[0] for row in result 
                        if row[0] not in ('information_schema', 'performance_schema', 'mysql', 'sys')
                    ]
            elif self.db_type == DatabaseType.POSTGRESQL:
                # PostgreSQL: 查询所有数据库
                with engine.connect() as conn:
                    if self.isInterruptionRequested() or self._should_stop:
                        return
                    result = conn.execute(text("""
                        SELECT datname FROM pg_database 
                        WHERE datistemplate = false 
                        AND datname != 'postgres'
                        ORDER BY datname
                    """))
                    databases = [row[0] for row in result]
            elif self.db_type == DatabaseType.HIVE:
                # Hive: 查询所有数据库
                with engine.connect() as conn:
                    if self.isInterruptionRequested() or self._should_stop:
                        return
                    result = conn.execute(text("SHOW DATABASES"))
                    databases = [row[0] for row in result]
            elif self.db_type == DatabaseType.SQLITE:
                # SQLite: 单文件数据库，返回 "main" 作为数据库名
                databases = ["main"]
            else:
                # 其他数据库类型，返回空列表（由调用者处理）
                databases = []
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.databases_ready.emit(databases)
            
        except SQLAlchemyError as e:
            import time
            error_str = str(e)
            elapsed = time.time() - start_time
            logger.error(f"[工作线程] SQLAlchemyError 发生，耗时: {elapsed:.3f}秒，错误: {error_str}", exc_info=True)
            
            # 检查是否是超时错误
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = f"连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"获取数据库列表失败: {error_str}"
            logger.error(f"[工作线程] 错误消息: {error_msg}")
            if not (self.isInterruptionRequested() or self._should_stop):
                logger.info(f"[工作线程] 准备发送错误信号...")
                self.error_occurred.emit(error_msg)
                logger.info(f"[工作线程] 错误信号已发送")
        except Exception as e:
            import time
            error_str = str(e)
            elapsed = time.time() - start_time
            logger.error(f"[工作线程] Exception 发生，耗时: {elapsed:.3f}秒，错误: {error_str}", exc_info=True)
            
            # 检查是否是超时错误
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = f"连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"获取数据库列表失败: {error_str}"
            logger.error(f"[工作线程] 错误消息: {error_msg}")
            if not (self.isInterruptionRequested() or self._should_stop):
                logger.info(f"[工作线程] 准备发送错误信号...")
                self.error_occurred.emit(error_msg)
                logger.info(f"[工作线程] 错误信号已发送")
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.warning(f"清理数据库引擎失败: {str(e)}")
            
            # 注意：QThread 的 run() 方法返回时，线程会自动结束，finished 信号会自动触发
            # 不需要调用 quit()，因为 QThread.run() 默认没有事件循环

