"""
数据库健康检查工作线程 - 获取数据库状态信息
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Dict, List
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from src.core.database_connection import DatabaseType
import logging

logger = logging.getLogger(__name__)


class DatabaseHealthWorker(QThread):
    """数据库健康检查工作线程"""
    
    health_data_ready = pyqtSignal(dict)  # 健康数据
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, db_type: DatabaseType, database: str = None):
        super().__init__()
        self.setObjectName(f"DatabaseHealthWorker-{id(self)}")
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.db_type = db_type
        self.database = database
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取数据库健康数据（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            health_data = {}
            
            # 在线程中创建新的数据库引擎
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            with engine.connect() as conn:
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                if self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    # MySQL/MariaDB 健康检查
                    health_data = self._check_mysql_health(conn)
                elif self.db_type == DatabaseType.POSTGRESQL:
                    # PostgreSQL 健康检查
                    health_data = self._check_postgresql_health(conn)
                else:
                    health_data = {"message": f"数据库类型 {self.db_type.value} 暂不支持健康检查"}
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.health_data_ready.emit(health_data)
            
        except SQLAlchemyError as e:
            error_str = str(e)
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = "连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"健康检查失败: {error_str}"
            logger.error(error_msg)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        except Exception as e:
            error_str = str(e)
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = "连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"健康检查失败: {error_str}"
            logger.error(error_msg, exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.warning(f"清理数据库引擎失败: {str(e)}")            # 注意：QThread 的 run() 方法返回时，线程会自动结束，finished 信号会自动触发
            # 不需要调用 quit()，因为 QThread.run() 默认没有事件循环
            pass
    
    def _check_mysql_health(self, conn) -> Dict:
        """检查MySQL/MariaDB健康状态"""
        health_data = {}
        
        try:
            # 1. 检查连接数
            result = conn.execute(text("SHOW STATUS LIKE 'Threads_connected'"))
            row = result.fetchone()
            if row:
                health_data['threads_connected'] = int(row[1])
            
            result = conn.execute(text("SHOW VARIABLES LIKE 'max_connections'"))
            row = result.fetchone()
            if row:
                max_connections = int(row[1])
                health_data['max_connections'] = max_connections
                if 'threads_connected' in health_data:
                    usage_percent = (health_data['threads_connected'] / max_connections) * 100
                    health_data['connection_usage_percent'] = usage_percent
            
            # 2. 检查慢查询
            result = conn.execute(text("SHOW STATUS LIKE 'Slow_queries'"))
            row = result.fetchone()
            if row:
                health_data['slow_queries'] = int(row[1])
            
            # 3. 检查表锁
            result = conn.execute(text("SHOW STATUS LIKE 'Table_locks_waited'"))
            row = result.fetchone()
            if row:
                health_data['table_locks_waited'] = int(row[1])
            
            # 4. 检查InnoDB状态
            try:
                result = conn.execute(text("SHOW STATUS LIKE 'Innodb_row_lock%'"))
                innodb_locks = {}
                for row in result:
                    innodb_locks[row[0]] = int(row[1])
                health_data['innodb_locks'] = innodb_locks
            except:
                pass
            
            # 5. 检查QPS和TPS
            result = conn.execute(text("SHOW STATUS LIKE 'Questions'"))
            row = result.fetchone()
            if row:
                health_data['questions'] = int(row[1])
            
            result = conn.execute(text("SHOW STATUS LIKE 'Com_commit'"))
            row = result.fetchone()
            if row:
                health_data['commits'] = int(row[1])
            
            result = conn.execute(text("SHOW STATUS LIKE 'Com_rollback'"))
            row = result.fetchone()
            if row:
                health_data['rollbacks'] = int(row[1])
            
            # 6. 检查数据库大小（如果指定了数据库）
            if self.database:
                try:
                    sql = f"""
                        SELECT 
                            table_schema AS 'Database',
                            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size_MB'
                        FROM information_schema.tables 
                        WHERE table_schema = '{self.database}'
                        GROUP BY table_schema
                    """
                    result = conn.execute(text(sql))
                    row = result.fetchone()
                    if row:
                        health_data['database_size_mb'] = float(row[1])
                except:
                    pass
            
        except Exception as e:
            logger.warning(f"获取MySQL健康数据时出错: {e}")
        
        return health_data
    
    def _check_postgresql_health(self, conn) -> Dict:
        """检查PostgreSQL健康状态"""
        health_data = {}
        
        try:
            # 1. 检查连接数
            result = conn.execute(text("""
                SELECT 
                    count(*) as current_connections,
                    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
                FROM pg_stat_activity
            """))
            row = result.fetchone()
            if row:
                health_data['threads_connected'] = int(row[0])
                health_data['max_connections'] = int(row[1])
                if health_data['max_connections'] > 0:
                    usage_percent = (health_data['threads_connected'] / health_data['max_connections']) * 100
                    health_data['connection_usage_percent'] = usage_percent
            
            # 2. 检查锁等待
            result = conn.execute(text("""
                SELECT count(*) as lock_waits
                FROM pg_locks l
                JOIN pg_stat_activity a ON l.pid = a.pid
                WHERE NOT l.granted
            """))
            row = result.fetchone()
            if row:
                health_data['lock_waits'] = int(row[0])
            
            # 3. 检查数据库大小（如果指定了数据库）
            if self.database:
                try:
                    sql = f"""
                        SELECT pg_size_pretty(pg_database_size('{self.database}')) as size
                    """
                    result = conn.execute(text(sql))
                    row = result.fetchone()
                    if row:
                        health_data['database_size'] = row[0]
                except:
                    pass
            
        except Exception as e:
            logger.warning(f"获取PostgreSQL健康数据时出错: {e}")
        
        return health_data
