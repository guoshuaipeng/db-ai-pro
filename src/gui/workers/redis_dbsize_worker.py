"""
Redis 数据库大小查询工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Dict
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class RedisDbsizeWorker(QThread):
    """Redis 数据库大小查询工作线程"""

    sizes_ready = pyqtSignal(dict)  # {database: key_count}
    error_occurred = pyqtSignal(str)  # 错误信息

    def __init__(self, connection: DatabaseConnection, databases: list):
        super().__init__()
        self.connection = connection
        self.databases = databases
        self._should_stop = False

    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        """查询所有数据库的 key 数量（在工作线程中运行）"""
        redis_client = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return

            # 创建 Redis 客户端
            redis_client = RedisClient(self.connection)
            client = redis_client.get_client()

            if self.isInterruptionRequested() or self._should_stop:
                return

            # 查询每个数据库的 key 数量
            db_sizes = {}
            for database in self.databases:
                if self.isInterruptionRequested() or self._should_stop:
                    return

                try:
                    # 解析数据库编号
                    db_num = 0
                    try:
                        db_num = int(database)
                        # 移除硬编码的范围限制，允许更大的数据库编号
                        if db_num < 0:
                            db_num = 0
                    except ValueError:
                        db_num = 0

                    # 切换到指定数据库
                    client.execute_command('SELECT', db_num)

                    # 获取数据库大小
                    size = client.dbsize()
                    db_sizes[database] = size
                    logger.debug(f"Redis 数据库 {database} 有 {size} 个 key")

                except Exception as e:
                    logger.warning(f"查询数据库 {database} 的大小失败: {e}")
                    db_sizes[database] = -1  # -1 表示查询失败

            if self.isInterruptionRequested() or self._should_stop:
                return

            # 发送结果
            self.sizes_ready.emit(db_sizes)

        except Exception as e:
            error_str = str(e)
            logger.error(f"查询 Redis 数据库大小失败: {error_str}", exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(f"查询数据库大小失败: {error_str}")
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")

            # 确保线程正确退出
            self.quit()
