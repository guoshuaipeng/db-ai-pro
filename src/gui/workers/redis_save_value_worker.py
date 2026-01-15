"""
Redis 保存值工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class RedisSaveValueWorker(QThread):
    """Redis 保存值工作线程"""
    
    save_success = pyqtSignal()  # 保存成功
    save_error = pyqtSignal(str)  # 保存错误
    
    def __init__(self, connection: DatabaseConnection, database: str, key: str, value: str):
        super().__init__()
        self.connection = connection
        self.database = database
        self.key = key
        self.value = value
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """保存值（在工作线程中运行）"""
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
            
            # 保存值（使用 SET 命令）
            client.set(self.key, self.value)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送成功信号
            self.save_success.emit()
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"保存 Redis key 值失败: {error_msg}", exc_info=True)
            self.save_error.emit(error_msg)
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")            # 注意：QThread 的 run() 方法返回时，线程会自动结束，finished 信号会自动触发
            # 不需要调用 quit()，因为 QThread.run() 默认没有事件循环
            pass
