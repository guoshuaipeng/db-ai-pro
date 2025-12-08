"""
连接测试工作线程 - 在后台测试数据库连接，避免阻塞UI
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import logging

from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class ConnectionTestWorker(QThread):
    """连接测试工作线程"""
    
    # 定义信号
    test_finished = pyqtSignal(bool, str)  # success, message
    
    def __init__(self, connection: DatabaseConnection):
        super().__init__()
        self.connection = connection
        self._should_stop = False
        # 限制连接超时时间，避免界面长时间卡住（最多10秒）
        self._max_connect_timeout = 10
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """测试连接（在工作线程中运行）"""
        try:
            # 检查是否已经被请求停止
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 检查 Oracle 驱动是否已安装
            if self.connection.db_type.value == "oracle":
                try:
                    import oracledb
                except ImportError:
                    error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb"
                    logger.error(f"{error_msg} - {self.connection.name}")
                    self.test_finished.emit(False, error_msg)
                    return
            
            # 获取连接参数并限制超时时间
            connect_args = self.connection.get_connect_args().copy() if self.connection.get_connect_args() else {}
            
            # 限制连接超时时间（最多10秒），避免界面长时间卡住
            from src.core.database_connection import DatabaseType
            if self.connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
                connect_args['read_timeout'] = min(connect_args.get('read_timeout', 30), self._max_connect_timeout)
                connect_args['write_timeout'] = min(connect_args.get('write_timeout', 30), self._max_connect_timeout)
            elif self.connection.db_type == DatabaseType.POSTGRESQL:
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
            elif self.connection.db_type == DatabaseType.ORACLE:
                connect_args['connect_timeout'] = min(connect_args.get('connect_timeout', 30), self._max_connect_timeout)
            elif self.connection.db_type == DatabaseType.SQLSERVER:
                connect_args['timeout'] = min(connect_args.get('timeout', 30), self._max_connect_timeout)
            
            # 创建引擎，不使用pool_pre_ping，避免立即连接导致卡顿
            engine_kwargs = {
                'connect_args': connect_args,
                'pool_pre_ping': False,  # 不使用pool_pre_ping，避免立即连接
                'echo': False,
                'pool_timeout': self._max_connect_timeout,  # 连接池超时时间
            }
            
            engine = create_engine(
                self.connection.get_connection_string(),
                **engine_kwargs
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 测试连接是否可用
            # Oracle 使用 SELECT 1 FROM DUAL
            if self.connection.db_type.value == "oracle":
                test_sql = text("SELECT 1 FROM DUAL")
            else:
                test_sql = text("SELECT 1")
            
            # 使用超时连接（避免长时间等待）
            with engine.connect() as conn:
                conn.execute(test_sql)
            
            # 关闭引擎（测试完成后）
            engine.dispose()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送成功信号
            self.test_finished.emit(True, "连接测试成功")
            logger.info(f"连接测试成功: {self.connection.name}")
            
        except SQLAlchemyError as e:
            error_msg = f"连接测试失败: {str(e)}"
            logger.error(f"{error_msg} - {self.connection.name}")
            self.test_finished.emit(False, error_msg)
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
            else:
                error_msg = f"缺少必要的数据库驱动: {str(e)}"
            logger.error(f"{error_msg} - {self.connection.name}")
            self.test_finished.emit(False, error_msg)
        except Exception as e:
            error_msg = f"未知错误: {str(e)}"
            # 检查是否是缺少驱动导致的错误
            if "No module named" in str(e) and ("oracledb" in str(e) or "cx_Oracle" in str(e)):
                error_msg = "缺少 Oracle 驱动 (oracledb)。请运行: pip install oracledb"
            elif "No module named" in str(e) and "pyodbc" in str(e):
                error_msg = "缺少 SQL Server 驱动 (pyodbc)。请运行: pip install pyodbc"
            elif "No module named" in str(e) and "psycopg2" in str(e):
                error_msg = "缺少 PostgreSQL 驱动 (psycopg2)。请运行: pip install psycopg2-binary"
            logger.error(f"{error_msg} - {self.connection.name}")
            self.test_finished.emit(False, error_msg)

