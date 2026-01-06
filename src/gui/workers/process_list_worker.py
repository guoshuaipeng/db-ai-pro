"""
进程列表工作线程 - 获取数据库进程列表
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from src.core.database_connection import DatabaseType
import logging

logger = logging.getLogger(__name__)


class ProcessListWorker(QThread):
    """获取数据库进程列表工作线程"""
    
    process_list_ready = pyqtSignal(list)  # 进程列表
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, db_type: DatabaseType, database: str = None):
        super().__init__()
        self.setObjectName(f"ProcessListWorker-{id(self)}")
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.db_type = db_type
        self.database = database  # 如果指定，只查询该数据库的进程；如果为None，查询所有数据库
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取进程列表（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 根据数据库类型使用不同的SQL查询
            if self.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                # MySQL/MariaDB: 使用显式列名查询，确保列名一致性
                sql = """
                    SELECT 
                        ID as Id,
                        USER as User,
                        HOST as Host,
                        DB as db,
                        COMMAND as Command,
                        TIME as Time,
                        STATE as State,
                        INFO as Info
                    FROM information_schema.PROCESSLIST
                """
                
                # 如果指定了数据库，添加过滤条件
                if self.database:
                    sql += f" WHERE DB = '{self.database}' OR DB IS NULL"
            elif self.db_type == DatabaseType.POSTGRESQL:
                # PostgreSQL: 查询pg_stat_activity
                sql = """
                    SELECT 
                        pid as Id,
                        usename as User,
                        application_name || ':' || client_addr::text as Host,
                        datname as db,
                        state as Command,
                        EXTRACT(EPOCH FROM (NOW() - query_start))::int as Time,
                        state as State,
                        query as Info
                    FROM pg_stat_activity
                    WHERE pid <> pg_backend_pid()
                """
                
                # 如果指定了数据库，添加过滤条件
                if self.database:
                    sql += f" AND datname = '{self.database}'"
                
                sql += " ORDER BY query_start"
            else:
                # 其他数据库类型暂不支持
                self.error_occurred.emit(f"数据库类型 {self.db_type.value} 暂不支持进程列表查询")
                return
            
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
                
                result = conn.execute(text(sql))
                
                # 获取列名
                columns = list(result.keys())
                logger.debug(f"Process list columns: {columns}")
                
                # 转换为字典列表
                processes = []
                for row in result:
                    if self.isInterruptionRequested() or self._should_stop:
                        return
                    
                    # 转换为字典，处理大小写不敏感的情况
                    row_dict = dict(row._mapping)
                    
                    # 规范化键名为我们期望的格式（首字母大写）
                    normalized_dict = {}
                    for key, value in row_dict.items():
                        key_lower = key.lower()
                        if key_lower == 'id':
                            normalized_dict['Id'] = value
                        elif key_lower == 'user':
                            normalized_dict['User'] = value
                        elif key_lower == 'host':
                            normalized_dict['Host'] = value
                        elif key_lower == 'db':
                            normalized_dict['db'] = value
                        elif key_lower == 'command':
                            normalized_dict['Command'] = value
                        elif key_lower == 'time':
                            normalized_dict['Time'] = value
                        elif key_lower == 'state':
                            normalized_dict['State'] = value
                        elif key_lower == 'info':
                            normalized_dict['Info'] = value
                        else:
                            # 保留原始键名
                            normalized_dict[key] = value
                    
                    # 同时保留原始键名以便兼容
                    normalized_dict.update(row_dict)
                    
                    logger.debug(f"Process row: {normalized_dict}")
                    processes.append(normalized_dict)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.process_list_ready.emit(processes)
            
        except SQLAlchemyError as e:
            error_str = str(e)
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = "连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"获取进程列表失败: {error_str}"
            logger.error(error_msg)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(error_msg)
        except Exception as e:
            error_str = str(e)
            if 'timeout' in error_str.lower() or 'timed out' in error_str.lower():
                error_msg = "连接超时，请检查网络连接或数据库配置"
            else:
                error_msg = f"获取进程列表失败: {error_str}"
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
            
            # 确保线程正确退出
            self.quit()
