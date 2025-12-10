"""
执行SQL的后台工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging
from src.core.database_manager import DatabaseManager
from src.core.database_connection import DatabaseType

logger = logging.getLogger(__name__)


class ExecuteSQLWorker(QThread):
    """执行SQL的后台工作线程"""
    
    # 信号定义
    finished = pyqtSignal(object)  # 执行成功，返回结果
    error = pyqtSignal(str)  # 执行失败，返回错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, 
                 db_type: DatabaseType, sql: str, database: str = None):
        """
        初始化工作线程
        
        :param connection_string: 数据库连接字符串
        :param connect_args: 连接参数
        :param db_type: 数据库类型
        :param sql: 要执行的SQL语句
        :param database: 数据库名（可选，某些操作如CREATE DATABASE不需要）
        """
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.db_type = db_type
        self.sql = sql
        self.database = database
        self._stop_flag = False
    
    def stop(self):
        """停止线程"""
        self._stop_flag = True
    
    def run(self):
        """执行SQL"""
        db_manager = None
        try:
            if self._stop_flag:
                return
            
            # 创建临时的数据库管理器
            db_manager = DatabaseManager()
            
            # 如果指定了数据库，使用指定的数据库
            if self.database:
                connect_args = self.connect_args.copy()
                connect_args['database'] = self.database
            else:
                connect_args = self.connect_args
            
            # 连接数据库
            connection = db_manager.connect(
                self.connection_string,
                connect_args,
                self.db_type
            )
            
            if self._stop_flag:
                return
            
            # 执行SQL
            cursor = connection.cursor()
            cursor.execute(self.sql)
            
            # 提交事务（对于DDL语句）
            connection.commit()
            
            # 获取结果（如果有）
            try:
                result = cursor.fetchall()
            except:
                result = None
            
            cursor.close()
            
            if not self._stop_flag:
                self.finished.emit(result)
        
        except Exception as e:
            logger.error(f"执行SQL失败: {str(e)}", exc_info=True)
            if not self._stop_flag:
                self.error.emit(str(e))
        
        finally:
            # 清理资源
            if db_manager:
                try:
                    db_manager.close_all()
                except:
                    pass

