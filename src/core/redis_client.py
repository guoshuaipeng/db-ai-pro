"""
Redis 客户端封装
"""
import logging
from typing import Optional, Dict, Any
from src.core.database_connection import DatabaseConnection

logger = logging.getLogger(__name__)


class RedisClient:
    """Redis 客户端封装"""
    
    def __init__(self, connection: DatabaseConnection):
        """
        初始化 Redis 客户端
        
        Args:
            connection: 数据库连接配置
        """
        self.connection = connection
        self._client = None
    
    def _get_client(self):
        """获取 Redis 客户端（懒加载）"""
        if self._client is None:
            try:
                import redis
                
                password = self.connection.password.get_secret_value() if self.connection.password else None
                db_num = 0
                
                # 解析数据库编号
                if self.connection.database:
                    try:
                        db_num = int(self.connection.database)
                        # 移除硬编码的范围限制，允许更大的数据库编号
                        if db_num < 0:
                            logger.warning(f"Redis 数据库编号不能为负数，使用默认值 0")
                            db_num = 0
                    except ValueError:
                        logger.warning(f"无效的数据库编号: {self.connection.database}，使用默认值 0")
                        db_num = 0
                
                # 构建连接参数
                connect_kwargs = {
                    'host': self.connection.host,
                    'port': self.connection.port,
                    'db': db_num,
                    'socket_connect_timeout': self.connection.timeout,
                    'socket_timeout': self.connection.timeout,
                    'decode_responses': True,  # 自动解码响应为字符串
                }
                
                # 添加密码（如果有）
                if password:
                    connect_kwargs['password'] = password
                
                # 添加用户名（如果有，Redis 6.0+）
                if self.connection.username:
                    connect_kwargs['username'] = self.connection.username
                
                # SSL 设置
                if self.connection.use_ssl:
                    connect_kwargs['ssl'] = True
                    connect_kwargs['ssl_cert_reqs'] = None  # 可根据需要调整
                
                self._client = redis.Redis(**connect_kwargs)
                
                # 测试连接
                self._client.ping()
                
            except ImportError:
                raise ImportError("缺少 Redis 驱动 (redis)。请运行: pip install redis")
            except Exception as e:
                logger.error(f"创建 Redis 客户端失败: {e}")
                raise
        
        return self._client
    
    def test_connection(self) -> tuple[bool, str]:
        """测试连接"""
        try:
            client = self._get_client()
            client.ping()
            return True, "连接成功"
        except ImportError as e:
            return False, "缺少 Redis 驱动 (redis)。请运行: pip install redis"
        except Exception as e:
            return False, f"连接失败: {str(e)}"
    
    def get_client(self):
        """获取 Redis 客户端"""
        return self._get_client()
    
    def get_database_count(self) -> int:
        """
        查询 Redis 配置的数据库数量
        
        Returns:
            数据库数量，如果查询失败则返回默认值 16
        """
        client = None
        try:
            client = self._get_client()
            # 保存原始数据库编号
            original_db = client.connection_pool.connection_kwargs.get('db', 0)
            
            try:
                # 方法1: 尝试查询 CONFIG GET databases（最准确的方法）
                client.execute_command('SELECT', 0)  # 先切换到 db 0
                config_result = client.config_get('databases')
                if config_result and 'databases' in config_result:
                    db_count = int(config_result['databases'])
                    logger.info(f"通过 CONFIG GET 查询到 Redis 数据库数量: {db_count}")
                    # 恢复原始数据库
                    try:
                        client.execute_command('SELECT', original_db)
                    except:
                        pass
                    return db_count
            except Exception as e:
                logger.debug(f"查询 CONFIG GET databases 失败: {e}，尝试其他方法")
            
            try:
                # 方法2: 通过 INFO keyspace 获取（查看实际使用的数据库）
                client.execute_command('SELECT', 0)
                info = client.info('keyspace')
                # INFO keyspace 会显示每个数据库的键数量
                # 我们可以通过检查有多少个 dbX 来推断数据库数量
                max_db = -1
                for key in info.keys():
                    if key.startswith('db'):
                        try:
                            db_num = int(key[2:])
                            max_db = max(max_db, db_num)
                        except ValueError:
                            pass
                if max_db >= 0:
                    # 至少返回 max_db + 1（因为数据库编号从 0 开始）
                    # 但为了安全，我们返回 max_db + 2，或者默认 16
                    db_count = max(max_db + 2, 16)
                    logger.info(f"通过 INFO keyspace 推断数据库数量: {db_count}")
                    # 恢复原始数据库
                    try:
                        client.execute_command('SELECT', original_db)
                    except:
                        pass
                    return db_count
            except Exception as e:
                logger.debug(f"查询 INFO keyspace 失败: {e}")
            
            # 方法3: 如果都失败了，尝试逐个测试数据库（最多测试到 256）
            logger.info("尝试通过逐个测试数据库来检测数量")
            max_test_db = 256  # 设置一个合理的上限
            last_valid_db = 0
            client.execute_command('SELECT', 0)  # 从 db 0 开始测试
            
            for db_num in range(1, max_test_db):  # 从 1 开始，因为 0 已经确认可用
                try:
                    client.execute_command('SELECT', db_num)
                    client.ping()  # 测试连接
                    # 如果 SELECT 成功，记录为有效数据库
                    last_valid_db = db_num
                except Exception as e:
                    # 如果 SELECT 失败，说明这个数据库不存在，返回上一个有效的数据库编号+1
                    logger.info(f"数据库 {db_num} 不可用，推断数据库数量为 {last_valid_db + 1}")
                    # 恢复原始数据库
                    try:
                        client.execute_command('SELECT', original_db)
                    except:
                        pass
                    return last_valid_db + 1
            
            # 如果所有测试都成功（不太可能），返回测试的最大值
            logger.warning(f"所有测试的数据库都可用，返回 {max_test_db}")
            # 恢复原始数据库
            try:
                client.execute_command('SELECT', original_db)
            except:
                pass
            return max_test_db
            
        except Exception as e:
            logger.error(f"查询 Redis 数据库数量失败: {e}，使用默认值 16")
            return 16
    
    def close(self):
        """关闭连接"""
        if self._client:
            try:
                self._client.close()
            except Exception as e:
                logger.warning(f"关闭 Redis 连接失败: {e}")
            finally:
                self._client = None
