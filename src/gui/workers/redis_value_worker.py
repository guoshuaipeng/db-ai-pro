"""
Redis Value 加载工作线程 - 异步加载 key 的 value，避免阻塞 UI
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Optional
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)

# 定义大 value 的阈值（字节）
LARGE_VALUE_THRESHOLD = 1024 * 1024  # 1MB
MAX_DISPLAY_LENGTH = 10 * 1024  # 最大显示长度 10KB
MAX_LIST_DISPLAY_COUNT = 1000  # 列表/集合最大显示元素数


class RedisValueWorker(QThread):
    """Redis Value 加载工作线程"""
    
    value_ready = pyqtSignal(str, bool, int)  # value文本, 是否被截断, 原始大小
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection: DatabaseConnection, database: str, key: str, key_type: str):
        super().__init__()
        self.connection = connection
        self.database = database
        self.key = key
        self.key_type = key_type
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """加载 key 的 value（在工作线程中运行）"""
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
                    # 移除硬编码的范围限制，允许更大的数据库编号
                    if db_num < 0:
                        db_num = 0
                except ValueError:
                    db_num = 0
            
            client.execute_command('SELECT', db_num)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 根据类型获取值
            value_text = ""
            is_truncated = False
            original_size = 0
            
            if self.key_type == 'string':
                value = client.get(self.key)
                if value is None:
                    value_text = "<nil>"
                    original_size = 0
                else:
                    # 计算原始大小
                    if isinstance(value, bytes):
                        original_size = len(value)
                    else:
                        value_str = str(value)
                        original_size = len(value_str.encode('utf-8'))
                    
                    # 转换为字符串
                    if isinstance(value, bytes):
                        try:
                            value_str = value.decode('utf-8')
                        except UnicodeDecodeError:
                            value_str = value.hex()  # 如果是二进制数据，显示为十六进制
                    else:
                        value_str = str(value)
                    
                    # 如果 value 很大，截断显示
                    if original_size > LARGE_VALUE_THRESHOLD:
                        is_truncated = True
                        value_text = value_str[:MAX_DISPLAY_LENGTH]
                        value_text += f"\n\n[值太大，已截断显示前 {MAX_DISPLAY_LENGTH} 字节，原始大小: {self._format_size(original_size)}]"
                    else:
                        value_text = value_str
            
            elif self.key_type == 'hash':
                hash_data = client.hgetall(self.key)
                if isinstance(hash_data, dict):
                    field_count = len(hash_data)
                    original_size = sum(
                        len(str(k).encode('utf-8')) + len(str(v).encode('utf-8'))
                        for k, v in hash_data.items()
                    )
                    
                    value_text = "{\n"
                    displayed_count = 0
                    for k, v in hash_data.items():
                        if displayed_count >= MAX_LIST_DISPLAY_COUNT:
                            is_truncated = True
                            break
                        value_text += f"  {k}: {v}\n"
                        displayed_count += 1
                    
                    if is_truncated:
                        value_text += f"  ... (还有 {field_count - displayed_count} 个字段未显示)\n"
                    
                    value_text += f"}}\n\n共 {field_count} 个字段"
                    if original_size > LARGE_VALUE_THRESHOLD:
                        value_text += f" (总大小: {self._format_size(original_size)})"
            
            elif self.key_type == 'list':
                list_length = client.llen(self.key)
                original_size = 0
                
                # 限制获取的元素数量
                max_fetch = min(list_length, MAX_LIST_DISPLAY_COUNT)
                list_data = client.lrange(self.key, 0, max_fetch - 1)
                
                if isinstance(list_data, list):
                    original_size = sum(len(str(item).encode('utf-8')) for item in list_data)
                    is_truncated = list_length > MAX_LIST_DISPLAY_COUNT
                    
                    value_text = "[\n"
                    for idx, item in enumerate(list_data):
                        value_text += f"  [{idx}] {item}\n"
                    
                    if is_truncated:
                        value_text += f"  ... (还有 {list_length - max_fetch} 个元素未显示)\n"
                    
                    value_text += f"]\n\n共 {list_length} 个元素"
                    if is_truncated:
                        value_text += f" (显示前 {max_fetch} 个)"
                else:
                    value_text = str(list_data)
            
            elif self.key_type == 'set':
                set_size = client.scard(self.key)
                original_size = 0
                
                # 限制获取的元素数量
                max_fetch = min(set_size, MAX_LIST_DISPLAY_COUNT)
                set_data = list(client.smembers(self.key))[:max_fetch]
                
                if isinstance(set_data, list):
                    original_size = sum(len(str(item).encode('utf-8')) for item in set_data)
                    is_truncated = set_size > MAX_LIST_DISPLAY_COUNT
                    
                    value_text = "{\n"
                    for item in sorted(set_data):
                        value_text += f"  {item}\n"
                    
                    if is_truncated:
                        value_text += f"  ... (还有 {set_size - max_fetch} 个元素未显示)\n"
                    
                    value_text += f"}}\n\n共 {set_size} 个元素"
                    if is_truncated:
                        value_text += f" (显示前 {max_fetch} 个)"
                else:
                    value_text = str(set_data)
            
            elif self.key_type == 'zset':
                zset_size = client.zcard(self.key)
                original_size = 0
                
                # 限制获取的元素数量
                max_fetch = min(zset_size, MAX_LIST_DISPLAY_COUNT)
                zset_data = client.zrange(self.key, 0, max_fetch - 1, withscores=True)
                
                if isinstance(zset_data, list):
                    original_size = sum(
                        len(str(item[0]).encode('utf-8')) + len(str(item[1]).encode('utf-8'))
                        for item in zset_data if isinstance(item, tuple)
                    )
                    is_truncated = zset_size > MAX_LIST_DISPLAY_COUNT
                    
                    value_text = "[\n"
                    for item in zset_data:
                        if isinstance(item, tuple) and len(item) == 2:
                            member, score = item[0], item[1]
                            value_text += f"  {member} : {score}\n"
                        else:
                            value_text += f"  {item}\n"
                    
                    if is_truncated:
                        value_text += f"  ... (还有 {zset_size - max_fetch} 个元素未显示)\n"
                    
                    value_text += f"]\n\n共 {zset_size} 个元素"
                    if is_truncated:
                        value_text += f" (显示前 {max_fetch} 个)"
                else:
                    value_text = str(zset_data)
            
            else:
                value_text = f"<不支持的类型: {self.key_type}>"
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.value_ready.emit(value_text, is_truncated, original_size)
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"加载 Redis key 值失败: {error_str}", exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(f"加载 key 值失败: {error_str}")
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")
            
            # 确保线程正确退出
            self.quit()
    
    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """格式化字节大小为可读字符串"""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.2f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.2f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
