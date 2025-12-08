"""
表结构和表名列表缓存管理器
"""
import hashlib
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class SchemaCache:
    """表结构和表名列表缓存管理器"""
    
    def __init__(self, default_ttl_minutes: int = 60):
        """
        初始化缓存管理器
        
        Args:
            default_ttl_minutes: 默认缓存过期时间（分钟），默认60分钟
        """
        self.default_ttl = timedelta(minutes=default_ttl_minutes)
        
        # 缓存表名列表：{connection_id: (tables, timestamp)}
        self._table_list_cache: Dict[str, Tuple[List[str], datetime]] = {}
        
        # 缓存表结构：{cache_key: (schema_text, table_names, timestamp)}
        # cache_key = f"{connection_id}_{table_hash}"
        self._schema_cache: Dict[str, Tuple[str, List[str], datetime]] = {}
    
    def _get_table_hash(self, tables: List[str]) -> str:
        """生成表名列表的哈希值（用于缓存key）"""
        # 排序后生成哈希，确保相同表列表的哈希一致
        sorted_tables = sorted(tables) if tables else []
        table_str = ','.join(sorted_tables)
        return hashlib.md5(table_str.encode('utf-8')).hexdigest()[:16]
    
    def _is_expired(self, timestamp: datetime, ttl: Optional[timedelta] = None) -> bool:
        """检查缓存是否过期"""
        if ttl is None:
            ttl = self.default_ttl
        return datetime.now() - timestamp > ttl
    
    def get_table_list(self, connection_id: str) -> Optional[List[str]]:
        """
        获取缓存的表名列表
        
        Args:
            connection_id: 连接ID
            
        Returns:
            表名列表，如果缓存不存在或已过期则返回None
        """
        if connection_id not in self._table_list_cache:
            return None
        
        tables, timestamp = self._table_list_cache[connection_id]
        
        if self._is_expired(timestamp):
            logger.debug(f"表名列表缓存已过期: {connection_id}")
            del self._table_list_cache[connection_id]
            return None
        
        logger.debug(f"从缓存获取表名列表: {connection_id}, 表数量: {len(tables)}")
        return tables
    
    def set_table_list(self, connection_id: str, tables: List[str]):
        """
        缓存表名列表
        
        Args:
            connection_id: 连接ID
            tables: 表名列表
        """
        self._table_list_cache[connection_id] = (tables, datetime.now())
        logger.debug(f"缓存表名列表: {connection_id}, 表数量: {len(tables)}")
    
    def get_schema(self, connection_id: str, selected_tables: Optional[List[str]] = None) -> Optional[Tuple[str, List[str]]]:
        """
        获取缓存的表结构
        
        Args:
            connection_id: 连接ID
            selected_tables: 选中的表名列表，如果为None则获取所有表的结构
            
        Returns:
            (表结构文本, 表名列表) 元组，如果缓存不存在或已过期则返回None
        """
        # 生成缓存key
        if selected_tables:
            table_hash = self._get_table_hash(selected_tables)
            cache_key = f"{connection_id}_{table_hash}"
        else:
            # 如果没有指定表，使用特殊key
            cache_key = f"{connection_id}_all"
        
        if cache_key not in self._schema_cache:
            return None
        
        schema_text, table_names, timestamp = self._schema_cache[cache_key]
        
        if self._is_expired(timestamp):
            logger.debug(f"表结构缓存已过期: {cache_key}")
            del self._schema_cache[cache_key]
            return None
        
        logger.debug(f"从缓存获取表结构: {cache_key}, 表数量: {len(table_names)}")
        return (schema_text, table_names)
    
    def set_schema(self, connection_id: str, schema_text: str, table_names: List[str], 
                   selected_tables: Optional[List[str]] = None):
        """
        缓存表结构
        
        Args:
            connection_id: 连接ID
            schema_text: 表结构文本
            table_names: 表名列表
            selected_tables: 选中的表名列表，如果为None则缓存所有表的结构
        """
        # 生成缓存key
        if selected_tables:
            table_hash = self._get_table_hash(selected_tables)
            cache_key = f"{connection_id}_{table_hash}"
        else:
            cache_key = f"{connection_id}_all"
        
        self._schema_cache[cache_key] = (schema_text, table_names, datetime.now())
        logger.debug(f"缓存表结构: {cache_key}, 表数量: {len(table_names)}")
    
    def clear_connection_cache(self, connection_id: str):
        """
        清除指定连接的所有缓存
        
        Args:
            connection_id: 连接ID
        """
        # 清除表名列表缓存
        if connection_id in self._table_list_cache:
            del self._table_list_cache[connection_id]
            logger.debug(f"清除表名列表缓存: {connection_id}")
        
        # 清除该连接的所有表结构缓存
        keys_to_remove = [key for key in self._schema_cache.keys() if key.startswith(f"{connection_id}_")]
        for key in keys_to_remove:
            del self._schema_cache[key]
            logger.debug(f"清除表结构缓存: {key}")
    
    def clear_all_cache(self):
        """清除所有缓存"""
        self._table_list_cache.clear()
        self._schema_cache.clear()
        logger.info("已清除所有缓存")
    
    def get_cache_stats(self) -> dict:
        """
        获取缓存统计信息
        
        Returns:
            包含缓存统计信息的字典
        """
        return {
            "table_list_cache_size": len(self._table_list_cache),
            "schema_cache_size": len(self._schema_cache),
            "total_cached_connections": len(set(
                key.split('_')[0] for key in self._schema_cache.keys()
            ) | set(self._table_list_cache.keys()))
        }


# 全局缓存实例
_schema_cache_instance: Optional[SchemaCache] = None


def get_schema_cache() -> SchemaCache:
    """获取全局缓存实例（单例模式）"""
    global _schema_cache_instance
    if _schema_cache_instance is None:
        _schema_cache_instance = SchemaCache()
    return _schema_cache_instance

