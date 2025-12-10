"""
树视图数据缓存
用于缓存连接的数据库和表列表，提高启动速度
现在使用 SQLite 数据库存储
"""
from typing import List, Optional
import logging
from src.core.config_db import get_config_db

logger = logging.getLogger(__name__)


class TreeCache:
    """树视图数据缓存管理（基于 SQLite）"""
    
    def __init__(self, storage_path: str = None):
        """
        初始化树缓存
        
        :param storage_path: 存储文件路径（已废弃，保留参数兼容性）
        """
        self.db = get_config_db()
        logger.debug("树缓存已初始化（使用SQLite）")
    
    def get_databases(self, connection_id: str) -> Optional[List[str]]:
        """
        获取连接的数据库列表缓存
        
        :param connection_id: 连接ID
        :return: 数据库列表，如果没有缓存则返回None
        """
        return self.db.get_databases_cache(connection_id)
    
    def get_tables(self, connection_id: str, database: str) -> Optional[List[str]]:
        """
        获取数据库的表列表缓存
        
        :param connection_id: 连接ID
        :param database: 数据库名
        :return: 表列表，如果没有缓存则返回None
        """
        return self.db.get_tables_cache(connection_id, database)
    
    def set_databases(self, connection_id: str, databases: List[str]):
        """
        设置连接的数据库列表缓存
        
        :param connection_id: 连接ID
        :param databases: 数据库列表
        """
        self.db.save_databases_cache(connection_id, databases)
        logger.debug(f"缓存了连接 {connection_id} 的 {len(databases)} 个数据库")
    
    def set_tables(self, connection_id: str, database: str, tables: List[str]):
        """
        设置数据库的表列表缓存
        
        :param connection_id: 连接ID
        :param database: 数据库名
        :param tables: 表列表
        """
        logger.debug(f"TreeCache.set_tables 调用: connection_id={connection_id}, database={database}, tables_count={len(tables)}")
        try:
            self.db.save_tables_cache(connection_id, database, tables)
            logger.debug(f"TreeCache 缓存: {connection_id}.{database} ({len(tables)} 个表)")
        except Exception as e:
            logger.error(f"❌ TreeCache 缓存失败: {str(e)}", exc_info=True)
            raise
    
    def clear_connection(self, connection_id: str):
        """
        清除指定连接的缓存
        
        :param connection_id: 连接ID
        """
        self.db.clear_connection_cache(connection_id)
        logger.debug(f"清除了连接 {connection_id} 的缓存")
    
    def clear_all(self):
        """清除所有缓存"""
        # 获取所有连接ID并逐个清除
        with self.db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tree_cache_databases")
            cursor.execute("DELETE FROM tree_cache_tables")
        logger.info("清除了所有树缓存")
    
    def get_all_connections(self) -> List[str]:
        """获取所有已缓存的连接ID列表"""
        with self.db._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT connection_id FROM tree_cache_databases")
            rows = cursor.fetchall()
            return [row['connection_id'] for row in rows]
    
    def has_cache(self, connection_id: str) -> bool:
        """
        检查是否有指定连接的缓存
        
        :param connection_id: 连接ID
        :return: 是否有缓存
        """
        databases = self.get_databases(connection_id)
        return databases is not None and len(databases) > 0

