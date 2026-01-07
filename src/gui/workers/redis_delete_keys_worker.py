"""
Redis 删除 keys 工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class RedisDeleteKeysWorker(QThread):
    """Redis 删除 keys 工作线程"""
    
    delete_success = pyqtSignal(int)  # 删除成功，参数为删除的 key 数量
    delete_error = pyqtSignal(str)  # 删除错误
    
    def __init__(self, connection: DatabaseConnection, database: str, keys: List[str]):
        super().__init__()
        self.connection = connection
        self.database = database
        self.keys = keys
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """删除 keys（在工作线程中运行）"""
        redis_client = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 创建 Redis 客户端
            redis_client = RedisClient(self.connection)
            client = redis_client.get_client()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 切换到指定的数据库
            db_num = 0
            if self.database:
                try:
                    db_num = int(self.database)
                    if db_num < 0:
                        db_num = 0
                except ValueError:
                    db_num = 0
            
            client.execute_command('SELECT', db_num)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 删除 keys（使用 DEL 命令，支持批量删除）
            if not self.keys:
                self.delete_success.emit(0)
                return
            
            deleted_count = client.delete(*self.keys)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送成功信号
            self.delete_success.emit(deleted_count)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"删除 Redis keys 失败: {error_msg}", exc_info=True)
            self.delete_error.emit(error_msg)
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")
            
            # 确保线程正确退出
            self.quit()
