"""
连接初始化工作线程 - 在后台初始化数据库连接引擎，避免阻塞UI
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
import logging

from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class ConnectionInitWorker(QThread):
    """连接初始化工作线程"""
    
    # 定义信号
    init_finished = pyqtSignal(str, bool, str)  # connection_id, success, message
    
    def __init__(self, connection: DatabaseConnection, connection_id: str, engine_storage: dict = None):
        """
        初始化连接初始化工作线程
        
        Args:
            connection: 数据库连接配置
            connection_id: 连接ID
            engine_storage: 引擎存储字典（用于保存创建的引擎），如果为None则不保存
        """
        super().__init__()
        self.connection = connection
        self.connection_id = connection_id
        self.engine_storage = engine_storage  # 引擎存储字典
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """初始化连接（在工作线程中运行）"""
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
                    self.init_finished.emit(self.connection_id, False, error_msg)
                    return
            
            # 获取连接参数（这些操作很快，不会阻塞）
            try:
                connect_args = self.connection.get_connect_args()
                connection_string = self.connection.get_connection_string()
            except Exception as e:
                error_msg = f"获取连接参数失败: {str(e)}"
                logger.error(f"{error_msg} - {self.connection.name}")
                self.init_finished.emit(self.connection_id, False, error_msg)
                return
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 创建引擎，不立即连接（避免阻塞）
            engine_kwargs = {
                'connect_args': connect_args,
                'pool_pre_ping': False,  # 不立即测试，延迟到实际使用时
                'echo': False,
                'pool_timeout': 5,  # 连接池超时时间（秒）
                'max_overflow': 0,  # 不创建额外的连接
            }
            
            # 为 Oracle 添加连接超时设置
            if self.connection.db_type.value == "oracle":
                engine_kwargs['connect_args'] = connect_args.copy()
                # 确保超时时间不超过30秒
                timeout = min(self.connection.timeout, 30)
                engine_kwargs['connect_args']['connect_timeout'] = timeout
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 创建引擎（这一步通常很快，不会阻塞）
            # 注意：create_engine 本身不会连接数据库，只是创建引擎对象
            engine = create_engine(
                connection_string,
                **engine_kwargs
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                try:
                    engine.dispose()
                except:
                    pass
                return
            
            # 在后台线程中保存引擎（避免在主线程中创建引擎导致阻塞）
            if self.engine_storage is not None:
                self.engine_storage[self.connection_id] = engine
                logger.debug(f"引擎已保存到存储: {self.connection.name}")
            
            # 发送成功信号（引擎已创建并保存，但未连接）
            # 实际连接会在第一次使用时进行
            self.init_finished.emit(self.connection_id, True, "连接引擎已初始化")
            logger.debug(f"连接引擎初始化成功: {self.connection.name}")
            
        except SQLAlchemyError as e:
            error_msg = f"连接初始化失败: {str(e)}"
            logger.error(f"{error_msg} - {self.connection.name}")
            self.init_finished.emit(self.connection_id, False, error_msg)
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
            self.init_finished.emit(self.connection_id, False, error_msg)
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
            self.init_finished.emit(self.connection_id, False, error_msg)

