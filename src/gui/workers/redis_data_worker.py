"""
Redis 数据查询工作线程
"""
import logging
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict, Optional
from src.core.redis_client import RedisClient
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class RedisDataWorker(QThread):
    """Redis 数据查询工作线程"""
    
    data_ready = pyqtSignal(list, list)  # 数据列表和列名列表
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection: DatabaseConnection, database: str, limit: int = 100, pattern: Optional[str] = None):
        super().__init__()
        self.connection = connection
        self.database = database
        self.limit = limit
        self.pattern = pattern  # 搜索模式，支持 Redis 通配符：* 匹配任意字符，? 匹配单个字符
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """查询 Redis 数据（在工作线程中运行）"""
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
            
            # 切换到指定数据库
            client.execute_command('SELECT', db_num)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 使用 SCAN 命令获取键（避免阻塞）
            keys = []
            cursor = 0
            count = 100  # 每次扫描的键数量
            
            # 构建 SCAN 命令参数
            scan_kwargs = {'count': count}
            if self.pattern:
                # 如果提供了搜索模式，使用 MATCH 参数
                # 将用户输入转换为 Redis 通配符模式：*text* 匹配包含 text 的 key
                if '*' not in self.pattern and '?' not in self.pattern:
                    # 如果用户没有使用通配符，自动添加 *text* 模式
                    pattern = f"*{self.pattern}*"
                else:
                    pattern = self.pattern
                scan_kwargs['match'] = pattern
                logger.info(f"使用搜索模式: {pattern}")
            
            while len(keys) < self.limit:
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                # 使用 SCAN 命令（带 MATCH 参数）
                cursor, partial_keys = client.scan(cursor, **scan_kwargs)
                keys.extend(partial_keys)
                
                # 如果游标为 0，说明已经扫描完所有键
                if cursor == 0:
                    break
                
                # 如果已经获取足够的键，停止扫描
                if len(keys) >= self.limit:
                    break
            
            # 限制键的数量
            keys = keys[:self.limit]
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 获取键的类型和元数据（不获取值，提高性能）
            data = []
            columns = ["键 (Key)", "类型 (Type)", "TTL (秒)", "大小"]
            
            for key in keys:
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                try:
                    # 获取键的类型
                    key_type_result = client.type(key)
                    key_type = key_type_result.decode('utf-8') if isinstance(key_type_result, bytes) else str(key_type_result)
                    
                    # 获取 TTL
                    ttl = client.ttl(key)
                    ttl_str = str(ttl) if ttl >= 0 else "永久"
                    
                    # 根据类型获取大小信息（不获取实际值）
                    size_info = ""
                    if key_type == 'string':
                        # 对于字符串，获取长度
                        strlen = client.strlen(key)
                        size_info = f"{strlen} bytes"
                    elif key_type == 'hash':
                        # 对于哈希，获取字段数量
                        field_count = client.hlen(key)
                        size_info = f"{field_count} 个字段"
                    elif key_type == 'list':
                        # 对于列表，获取元素数量
                        list_length = client.llen(key)
                        size_info = f"{list_length} 个元素"
                    elif key_type == 'set':
                        # 对于集合，获取元素数量
                        set_size = client.scard(key)
                        size_info = f"{set_size} 个元素"
                    elif key_type == 'zset':
                        # 对于有序集合，获取元素数量
                        zset_size = client.zcard(key)
                        size_info = f"{zset_size} 个元素"
                    else:
                        size_info = "-"
                    
                    # 解码键名（decode_responses=True 时，键名已经是字符串）
                    key_str = key.decode('utf-8') if isinstance(key, bytes) else str(key)
                    
                    # 添加到数据列表
                    data.append({
                        "键 (Key)": key_str,
                        "类型 (Type)": key_type,
                        "TTL (秒)": ttl_str,
                        "大小": size_info
                    })
                    
                except Exception as e:
                    logger.warning(f"获取键 {key} 的元数据失败: {e}")
                    # 即使获取元数据失败，也添加键信息
                    key_str = key.decode('utf-8') if isinstance(key, bytes) else str(key)
                    data.append({
                        "键 (Key)": key_str,
                        "类型 (Type)": "unknown",
                        "TTL (秒)": "-",
                        "大小": "-"
                    })
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 发送结果
            self.data_ready.emit(data, columns)
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"查询 Redis 数据失败: {error_str}", exc_info=True)
            if not (self.isInterruptionRequested() or self._should_stop):
                self.error_occurred.emit(f"查询 Redis 数据失败: {error_str}")
        finally:
            # 关闭 Redis 客户端
            if redis_client:
                try:
                    redis_client.close()
                except Exception as e:
                    logger.warning(f"关闭 Redis 连接失败: {e}")
            
            # 确保线程正确退出
            self.quit()
