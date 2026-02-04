"""
使用统计模块（匿名）
"""
import json
import logging
import platform
import uuid
from pathlib import Path
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError
from urllib.parse import urlencode

from src import __version__

logger = logging.getLogger(__name__)


class UsageStats:
    """使用统计（匿名）"""
    
    # 统计服务器 URL（可选，如果不需要统计可以设置为 None）
    STATS_API_URL = None  # 例如: "https://your-domain.com/api/stats"
    
    # 统计文件路径（本地缓存，避免重复发送）
    STATS_FILE = Path.home() / ".dataai_stats.json"
    
    @classmethod
    def get_device_id(cls) -> str:
        """
        获取设备唯一标识（匿名）
        
        Returns:
            str: 设备ID（如果不存在则创建并保存）
        """
        try:
            if cls.STATS_FILE.exists():
                with open(cls.STATS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('device_id', cls._generate_device_id())
            else:
                device_id = cls._generate_device_id()
                cls._save_device_id(device_id)
                return device_id
        except Exception as e:
            logger.warning(f"获取设备ID失败: {e}")
            return cls._generate_device_id()
    
    @classmethod
    def _generate_device_id(cls) -> str:
        """生成设备ID"""
        return str(uuid.uuid4())
    
    @classmethod
    def _save_device_id(cls, device_id: str):
        """保存设备ID"""
        try:
            data = {
                'device_id': device_id,
                'version': __version__
            }
            with open(cls.STATS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f)
        except Exception as e:
            logger.warning(f"保存设备ID失败: {e}")
    
    @classmethod
    def send_app_start(cls, enabled: bool = True):
        """
        发送应用启动统计（可选）
        
        Args:
            enabled: 是否启用统计（默认启用）
        """
        if not enabled or not cls.STATS_API_URL:
            return
        
        try:
            stats_data = {
                'event': 'app_start',
                'device_id': cls.get_device_id(),
                'version': __version__,
                'platform': platform.system(),
                'arch': platform.machine(),
            }
            cls._send_stats(stats_data)
        except Exception as e:
            logger.debug(f"发送启动统计失败: {e}")  # 使用 debug 级别，不打扰用户
    
    @classmethod
    def send_update_check(cls, has_update: bool, enabled: bool = True):
        """
        发送更新检查统计
        
        Args:
            has_update: 是否有新版本
            enabled: 是否启用统计（默认启用）
        """
        if not enabled or not cls.STATS_API_URL:
            return
        
        try:
            stats_data = {
                'event': 'update_check',
                'device_id': cls.get_device_id(),
                'version': __version__,
                'has_update': has_update,
                'platform': platform.system(),
            }
            cls._send_stats(stats_data)
        except Exception as e:
            logger.debug(f"发送更新检查统计失败: {e}")
    
    @classmethod
    def _send_stats(cls, data: dict):
        """
        发送统计数据到服务器
        
        Args:
            data: 统计数据字典
        """
        if not cls.STATS_API_URL:
            return
        
        try:
            # 使用 POST 方式发送 JSON 数据
            json_data = json.dumps(data).encode('utf-8')
            request = Request(
                cls.STATS_API_URL,
                data=json_data,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': f'DataAI/{__version__}'
                }
            )
            
            with urlopen(request, timeout=5) as response:
                # 如果服务器返回成功，记录日志
                if response.status == 200:
                    logger.debug(f"统计发送成功: {data.get('event')}")
        except URLError:
            # 网络错误，静默失败（不打扰用户）
            pass
        except Exception as e:
            logger.debug(f"发送统计失败: {e}")
