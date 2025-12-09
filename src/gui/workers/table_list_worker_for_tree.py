"""
获取表列表工作线程（用于树视图）
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Optional
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import SQLAlchemyError
from src.core.database_connection import DatabaseType

logger = logging.getLogger(__name__)


class TableListWorkerForTree(QThread):
    """获取表列表工作线程（用于树视图）"""
    
    tables_ready = pyqtSignal(list)  # 表列表
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, db_type: DatabaseType, database: Optional[str] = None):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.db_type = db_type
        self.database = database
        self._should_stop = False
        # 限制连接超时时间，避免界面长时间卡住（最多10秒）
        self._max_connect_timeout = 10
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取表列表（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 复制连接参数并限制超时时间，避免界面长时间卡住
            connect_args = self.connect_args.copy() if self.connect_args else {}
            
            # 限制连接超时时间（最多10秒）
            if self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
                connect_args['read_timeout'] = min(connect_args.get('read_timeout', 30), self._max_connect_timeout)
                connect_args['write_timeout'] = min(connect_args.get('write_timeout', 30), self._max_connect_timeout)
            elif self.db_type == DatabaseType.POSTGRESQL:
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
            elif self.db_type == DatabaseType.ORACLE:
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
            elif self.db_type == DatabaseType.SQLSERVER:
                connect_args['timeout'] = min(connect_args.get('timeout', 30), self._max_connect_timeout)
            elif self.db_type == DatabaseType.HIVE:
                connect_args['timeout'] = min(connect_args.get('timeout', 30), self._max_connect_timeout)
            
            # 在线程中创建新的数据库引擎
            # 不使用 pool_pre_ping，避免立即尝试连接导致卡顿
            engine = create_engine(
                self.connection_string,
                connect_args=connect_args,
                pool_pre_ping=False,  # 不使用pool_pre_ping，避免立即连接
                echo=False,
                pool_timeout=self._max_connect_timeout,  # 连接池超时时间
                poolclass=None  # 不使用连接池，每个线程独立连接
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            inspector = inspect(engine)
            
            # MySQL/MariaDB: 通过 schema 参数获取指定数据库的表列表
            if self.database and self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                tables = inspector.get_table_names(schema=self.database)
            else:
                # 其他情况：使用默认数据库
                tables = inspector.get_table_names()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.tables_ready.emit(tables)
            
        except SQLAlchemyError as e:
            error_str = str(e)
            # 检查是否是超时错误
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = f"连接超时（{self._max_connect_timeout}秒），请检查网络连接或数据库配置"
            else:
                error_msg = f"获取表列表失败: {error_str}"
            logger.error(error_msg)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        except Exception as e:
            error_str = str(e)
            # 检查是否是超时错误
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = f"连接超时（{self._max_connect_timeout}秒），请检查网络连接或数据库配置"
            else:
                error_msg = f"获取表列表失败: {error_str}"
            logger.error(error_msg, exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.warning(f"清理数据库引擎失败: {str(e)}")

