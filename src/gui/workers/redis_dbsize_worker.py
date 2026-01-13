"""
Redis 数据库大小查询工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
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
        # 设置较短的超时时间，避免单个数据库查询阻塞太久（最多3秒）
        self._query_timeout = min(connection.timeout if connection.timeout else 30, 3)

    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()

    def _query_dbsize_with_timeout(self, client, db_num: int, timeout: float) -> int:
        """
        带超时的查询数据库大小
        
        Args:
            client: Redis 客户端
            db_num: 数据库编号
            timeout: 超时时间（秒）
        
        Returns:
            数据库大小，如果超时或失败返回 -1
        """
        import threading
        import time
        
        result = [-1]  # 使用列表以便在内部函数中修改
        exception = [None]
        done = threading.Event()
        
        def query_in_thread():
            try:
                # 切换到指定数据库
                client.execute_command('SELECT', db_num)
                # 获取数据库大小
                size = client.dbsize()
                result[0] = size
            except Exception as e:
                exception[0] = e
            finally:
                done.set()
        
        # 在单独的线程中执行查询
        thread = threading.Thread(target=query_in_thread, daemon=True)
        thread.start()
        
        # 等待查询完成或超时
        if done.wait(timeout):
            if exception[0]:
                raise exception[0]
            return result[0]
        else:
            # 超时
            logger.warning(f"查询数据库 {db_num} 的大小超时（{timeout}秒）")
            raise TimeoutError(f"查询数据库 {db_num} 的大小超时")

    def run(self):
        """查询所有数据库的 key 数量（在工作线程中运行）"""
        redis_client = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return

            # 创建 Redis 客户端（这里可能会失败，如果连接不上）
            try:
                redis_client = RedisClient(self.connection)
                client = redis_client.get_client()
            except Exception as e:
                # 如果连接失败，快速返回，不阻塞
                error_str = str(e)
                logger.warning(f"创建 Redis 客户端失败: {error_str}")
                # 发送空结果，表示所有数据库查询失败
                db_sizes = {db: -1 for db in self.databases}
                if not (self.isInterruptionRequested() or self._should_stop):
                    self.sizes_ready.emit(db_sizes)
                return

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

                    # 使用带超时的查询方法
                    size = self._query_dbsize_with_timeout(client, db_num, self._query_timeout)
                    db_sizes[database] = size
                    logger.debug(f"Redis 数据库 {database} 有 {size} 个 key")

                except TimeoutError as e:
                    logger.warning(f"查询数据库 {database} 的大小超时: {e}")
                    db_sizes[database] = -1  # -1 表示查询失败或超时
                except Exception as e:
                    logger.warning(f"查询数据库 {database} 的大小失败: {e}")
                    db_sizes[database] = -1  # -1 表示查询失败

            if self.isInterruptionRequested() or self._should_stop:
                return

            # 发送结果（即使部分数据库查询失败，也发送结果）
            self.sizes_ready.emit(db_sizes)

        except Exception as e:
            error_str = str(e)
            logger.error(f"查询 Redis 数据库大小失败: {error_str}", exc_info=True)
            # 即使出错，也发送部分结果，避免界面一直等待
            if not (self.isInterruptionRequested() or self._should_stop):
                # 发送已查询到的结果，未查询到的设为 -1
                db_sizes = {}
                for database in self.databases:
                    db_sizes[database] = -1
                self.sizes_ready.emit(db_sizes)
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")

            # 确保线程正确退出
            self.quit()
