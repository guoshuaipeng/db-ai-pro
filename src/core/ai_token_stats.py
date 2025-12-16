"""
AI模型Token使用统计
"""
from typing import Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class TokenStats:
    """Token使用统计"""
    
    def __init__(self, model_id: str):
        self.model_id = model_id
        self.total_tokens = 0  # 总token数
        self.prompt_tokens = 0  # 输入token数
        self.completion_tokens = 0  # 输出token数
        self.request_count = 0  # 请求次数
        self.last_used: Optional[str] = None  # 最后使用时间
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "model_id": self.model_id,
            "total_tokens": self.total_tokens,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "request_count": self.request_count,
            "last_used": self.last_used,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'TokenStats':
        """从字典创建"""
        stats = cls(data.get("model_id", ""))
        stats.total_tokens = data.get("total_tokens", 0)
        stats.prompt_tokens = data.get("prompt_tokens", 0)
        stats.completion_tokens = data.get("completion_tokens", 0)
        stats.request_count = data.get("request_count", 0)
        stats.last_used = data.get("last_used")
        return stats
    
    def add_usage(self, prompt_tokens: int, completion_tokens: int):
        """添加使用记录"""
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens
        self.total_tokens += (prompt_tokens + completion_tokens)
        self.request_count += 1
        self.last_used = datetime.now().isoformat()


class TokenStatsStorage:
    """Token统计存储管理器（使用 SQLite）"""
    
    def __init__(self, storage_path: Optional[str] = None):
        """
        初始化存储管理器
        
        Args:
            storage_path: 已废弃，保留以保持接口兼容性，实际使用 SQLite
        """
        from .config_db import get_config_db
        self.config_db = get_config_db()
        self._stats_cache: Dict[str, TokenStats] = {}
        self._load_all_stats()
    
    def _load_all_stats(self):
        """从 SQLite 加载所有统计信息到缓存"""
        try:
            stats_list = self.config_db.get_all_token_stats()
            self._stats_cache = {}
            for stats_data in stats_list:
                model_id = stats_data['model_id']
                self._stats_cache[model_id] = TokenStats.from_dict(stats_data)
            logger.debug(f"从 SQLite 加载了 {len(self._stats_cache)} 个模型的Token统计")
        except Exception as e:
            logger.error(f"从 SQLite 加载Token统计失败: {str(e)}", exc_info=True)
            self._stats_cache = {}
    
    def _save_stats_to_db(self, stats: TokenStats) -> bool:
        """保存单个统计信息到 SQLite"""
        try:
            self.config_db.save_token_stats(
                model_id=stats.model_id,
                total_tokens=stats.total_tokens,
                prompt_tokens=stats.prompt_tokens,
                completion_tokens=stats.completion_tokens,
                request_count=stats.request_count,
                last_used=stats.last_used
            )
            return True
        except Exception as e:
            logger.error(f"保存Token统计到 SQLite 失败: {str(e)}", exc_info=True)
            return False
    
    def save_stats(self) -> bool:
        """保存所有统计信息到 SQLite（保持接口兼容）"""
        try:
            for stats in self._stats_cache.values():
                self._save_stats_to_db(stats)
            logger.debug("成功保存所有Token统计到 SQLite")
            return True
        except Exception as e:
            logger.error(f"保存Token统计失败: {str(e)}")
            return False
    
    def get_stats(self, model_id: str) -> TokenStats:
        """获取指定模型的统计信息"""
        if model_id not in self._stats_cache:
            # 尝试从数据库加载
            stats_data = self.config_db.get_token_stats(model_id)
            if stats_data:
                self._stats_cache[model_id] = TokenStats.from_dict(stats_data)
            else:
                # 创建新的统计对象
                self._stats_cache[model_id] = TokenStats(model_id)
        return self._stats_cache[model_id]
    
    def add_usage(self, model_id: str, prompt_tokens: int, completion_tokens: int):
        """添加使用记录"""
        # 直接使用数据库的累加方法，更高效
        try:
            self.config_db.add_token_usage(model_id, prompt_tokens, completion_tokens)
            # 从数据库重新加载以保持缓存一致性
            stats_data = self.config_db.get_token_stats(model_id)
            if stats_data:
                self._stats_cache[model_id] = TokenStats.from_dict(stats_data)
            else:
                # 如果数据库中没有（不应该发生），创建新的
                stats = TokenStats(model_id)
                stats.add_usage(prompt_tokens, completion_tokens)
                self._stats_cache[model_id] = stats
                self._save_stats_to_db(stats)
        except Exception as e:
            logger.error(f"添加Token使用记录失败: {str(e)}", exc_info=True)
    
    def get_all_stats(self) -> Dict[str, TokenStats]:
        """获取所有统计信息"""
        # 重新加载以确保数据最新
        self._load_all_stats()
        return self._stats_cache.copy()
    
    def clear_stats(self, model_id: Optional[str] = None):
        """清除统计信息"""
        try:
            self.config_db.clear_token_stats(model_id)
            if model_id:
                if model_id in self._stats_cache:
                    del self._stats_cache[model_id]
                logger.info(f"已清除模型 {model_id} 的Token统计")
            else:
                self._stats_cache.clear()
                logger.info("已清除所有Token统计")
        except Exception as e:
            logger.error(f"清除Token统计失败: {str(e)}", exc_info=True)

