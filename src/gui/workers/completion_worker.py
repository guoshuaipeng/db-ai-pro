"""
自动完成更新工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


class CompletionWorker(QThread):
    """自动完成更新工作线程"""
    
    # 定义信号
    completion_ready = pyqtSignal(str, list, list)  # connection_id, tables, columns
    
    def __init__(self, connection_string: str, connect_args: dict, connection_id: str):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.connection_id = connection_id
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行完成更新（在工作线程中运行）"""
        engine = None
        try:
            # 检查是否已经被请求停止
            if self.isInterruptionRequested() or self._should_stop:
                return
            
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
            
            # 获取表列表
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 获取所有表的列名（限制前50个表，避免太多）
            all_columns = []
            for table_name in tables[:50]:
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                try:
                    columns = inspector.get_columns(table_name)
                    # 提取列名
                    column_names = [col['name'] for col in columns]
                    all_columns.extend(column_names)
                except Exception as e:
                    logger.debug(f"获取表 {table_name} 的列名失败: {str(e)}")
                    continue
            
            # 发送完成信号
            if not (self.isInterruptionRequested() or self._should_stop):
                self.completion_ready.emit(self.connection_id, tables, all_columns)
                
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"获取自动完成数据失败: {error_msg}")
            # 即使失败也发送空列表，避免UI等待
            self.completion_ready.emit(self.connection_id, [], [])
        except Exception as e:
            error_msg = str(e)
            logger.error(f"自动完成线程异常: {error_msg}")
            self.completion_ready.emit(self.connection_id, [], [])
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            
            # 确保线程正确结束
            self.quit()

