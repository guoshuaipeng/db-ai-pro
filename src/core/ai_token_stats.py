"""
AI模型Token使用统计
"""
import json
from pathlib import Path
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
    """Token统计存储管理器"""
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        初始化存储管理器
        
        Args:
            storage_path: 存储文件路径，默认为用户目录下的 .db-ai/token_stats.json
        """
        if storage_path is None:
            # 默认存储在用户目录
            home = Path.home()
            storage_dir = home / ".db-ai"
            storage_dir.mkdir(exist_ok=True)
            storage_path = storage_dir / "token_stats.json"
        
        self.storage_path = Path(storage_path)
        self._stats: Dict[str, TokenStats] = {}
        self.load_stats()
    
    def load_stats(self):
        """加载统计信息"""
        if not self.storage_path.exists():
            logger.info(f"Token统计文件不存在: {self.storage_path}")
            return
        
        try:
            with open(self.storage_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self._stats = {}
            for model_id, stats_data in data.items():
                self._stats[model_id] = TokenStats.from_dict(stats_data)
            
            logger.info(f"成功加载 {len(self._stats)} 个模型的Token统计")
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {str(e)}")
            self._stats = {}
        except Exception as e:
            logger.error(f"加载Token统计失败: {str(e)}")
            self._stats = {}
    
    def save_stats(self) -> bool:
        """保存统计信息"""
        try:
            data = {}
            for model_id, stats in self._stats.items():
                data[model_id] = stats.to_dict()
            
            # 保存到文件（先写入临时文件，然后重命名，确保原子性）
            temp_path = self.storage_path.with_suffix('.json.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # 原子性替换
            import shutil
            shutil.move(temp_path, self.storage_path)
            
            logger.debug(f"成功保存Token统计到 {self.storage_path}")
            return True
        except Exception as e:
            logger.error(f"保存Token统计失败: {str(e)}")
            return False
    
    def get_stats(self, model_id: str) -> TokenStats:
        """获取指定模型的统计信息"""
        if model_id not in self._stats:
            self._stats[model_id] = TokenStats(model_id)
        return self._stats[model_id]
    
    def add_usage(self, model_id: str, prompt_tokens: int, completion_tokens: int):
        """添加使用记录"""
        stats = self.get_stats(model_id)
        stats.add_usage(prompt_tokens, completion_tokens)
        # 自动保存
        self.save_stats()
    
    def get_all_stats(self) -> Dict[str, TokenStats]:
        """获取所有统计信息"""
        return self._stats.copy()
    
    def clear_stats(self, model_id: Optional[str] = None):
        """清除统计信息"""
        if model_id:
            if model_id in self._stats:
                del self._stats[model_id]
                logger.info(f"已清除模型 {model_id} 的Token统计")
        else:
            self._stats.clear()
            logger.info("已清除所有Token统计")
        
        self.save_stats()

