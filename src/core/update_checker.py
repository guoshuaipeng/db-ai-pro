"""
更新检查器
"""
import json
import logging
import platform
from typing import Optional, Dict
from urllib.request import urlopen, Request
from urllib.error import URLError
from urllib.parse import quote

from src import __version__

logger = logging.getLogger(__name__)


class UpdateInfo:
    """更新信息"""
    
    def __init__(self, version: str, download_url: str, release_notes: str = "", 
                 release_date: str = "", mandatory: bool = False):
        self.version = version
        self.download_url = download_url
        self.release_notes = release_notes
        self.release_date = release_date
        self.mandatory = mandatory  # 是否强制更新
    
    def __repr__(self):
        return f"UpdateInfo(version={self.version}, mandatory={self.mandatory})"


class UpdateChecker:
    """更新检查器"""
    
    # 更新检查 API（可以根据实际情况修改）
    # 选项1: 使用 GitHub Releases API
    GITHUB_API_URL = "https://api.github.com/repos/{owner}/{repo}/releases/latest"
    
    # 选项2: 使用自定义 API（需要你自己搭建）
    CUSTOM_API_URL = "https://your-domain.com/api/update/check"
    
    def __init__(self, owner: str = "your-github-username", repo: str = "db-ai", 
                 use_custom_api: bool = False):
        """
        初始化更新检查器
        
        Args:
            owner: GitHub 仓库所有者
            repo: GitHub 仓库名
            use_custom_api: 是否使用自定义 API（False 则使用 GitHub API）
        """
        self.owner = owner
        self.repo = repo
        self.use_custom_api = use_custom_api
        self.current_version = __version__
    
    def check_update(self, timeout: int = 10) -> Optional[UpdateInfo]:
        """
        检查更新
        
        Args:
            timeout: 超时时间（秒）
            
        Returns:
            UpdateInfo: 如果有新版本返回更新信息，否则返回 None
            
        Raises:
            Exception: 如果是速率限制错误，会抛出异常供上层处理
        """
        try:
            if self.use_custom_api:
                update_info = self._check_custom_api(timeout)
            else:
                update_info = self._check_github_api(timeout)
            
            if update_info and self._is_newer_version(update_info.version):
                logger.info(f"发现新版本: {update_info.version} (当前版本: {self.current_version})")
                return update_info
            else:
                logger.info("当前已是最新版本")
                return None
                
        except URLError as e:
            # 检查是否是速率限制错误（403）
            error_msg = str(e)
            if '403' in error_msg or 'rate limit' in error_msg.lower():
                logger.warning("检查更新失败（GitHub API 速率限制）: 请求过于频繁，请稍后再试")
                # 抛出异常供上层处理
                raise Exception("GitHub API 速率限制：请求过于频繁，请稍后再试")
            else:
                logger.warning(f"检查更新失败（网络错误）: {e}")
                return None
        except Exception as e:
            # 如果是我们主动抛出的速率限制错误，继续抛出
            error_msg = str(e)
            if '速率限制' in error_msg or 'rate limit' in error_msg.lower():
                raise
            logger.error(f"检查更新失败: {e}", exc_info=True)
            return None
    
    def _check_github_api(self, timeout: int) -> Optional[UpdateInfo]:
        """使用 GitHub Releases API 检查更新"""
        url = self.GITHUB_API_URL.format(owner=self.owner, repo=self.repo)
        
        request = Request(url)
        request.add_header('Accept', 'application/vnd.github.v3+json')
        request.add_header('User-Agent', 'DataAI-UpdateChecker')
        
        with urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if not data:
                return None
            
            version = data.get('tag_name', '').lstrip('v')  # 移除 'v' 前缀
            download_url = self._get_download_url_from_assets(data.get('assets', []))
            
            if not download_url:
                logger.warning("未找到下载链接")
                return None
            
            release_notes = data.get('body', '')
            release_date = data.get('published_at', '')
            
            return UpdateInfo(
                version=version,
                download_url=download_url,
                release_notes=release_notes,
                release_date=release_date,
                mandatory=False  # GitHub API 无法判断，可以根据版本号规则判断
            )
    
    def _check_custom_api(self, timeout: int) -> Optional[UpdateInfo]:
        """使用自定义 API 检查更新"""
        import platform
        
        # 构建请求参数
        params = {
            'current_version': self.current_version,
            'platform': platform.system(),  # Windows, Linux, Darwin
            'arch': platform.machine()  # x86_64, etc.
        }
        
        # 将参数添加到 URL
        query_string = '&'.join([f"{k}={quote(str(v))}" for k, v in params.items()])
        url = f"{self.CUSTOM_API_URL}?{query_string}"
        
        request = Request(url)
        request.add_header('User-Agent', 'DataAI-UpdateChecker')
        
        with urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if not data or data.get('has_update') != True:
                return None
            
            return UpdateInfo(
                version=data.get('version', ''),
                download_url=data.get('download_url', ''),
                release_notes=data.get('release_notes', ''),
                release_date=data.get('release_date', ''),
                mandatory=data.get('mandatory', False)
            )
    
    def _get_download_url_from_assets(self, assets: list) -> Optional[str]:
        """从 GitHub Release 的 assets 中获取下载链接"""
        system = platform.system().lower()
        
        # 根据平台选择对应的安装包
        # Windows: .exe
        # macOS: .dmg 或 .pkg
        # Linux: .AppImage 或 .deb
        
        if system == 'windows':
            # 查找 .exe 文件
            for asset in assets:
                name = asset.get('name', '').lower()
                if name.endswith('.exe'):
                    return asset.get('browser_download_url')
        elif system == 'darwin':
            # macOS: 优先 .dmg，其次 .pkg
            for asset in assets:
                name = asset.get('name', '').lower()
                if name.endswith('.dmg'):
                    return asset.get('browser_download_url')
            for asset in assets:
                name = asset.get('name', '').lower()
                if name.endswith('.pkg'):
                    return asset.get('browser_download_url')
        elif system == 'linux':
            # Linux: 优先 .AppImage，其次 .deb
            for asset in assets:
                name = asset.get('name', '').lower()
                if '.appimage' in name:
                    return asset.get('browser_download_url')
            for asset in assets:
                name = asset.get('name', '').lower()
                if name.endswith('.deb'):
                    return asset.get('browser_download_url')
        
        # 如果没找到平台特定的文件，返回第一个 asset
        if assets:
            return assets[0].get('browser_download_url')
        
        return None
    
    def _is_newer_version(self, new_version: str) -> bool:
        """
        比较版本号
        
        Args:
            new_version: 新版本号（例如 "0.3.0"）
            
        Returns:
            bool: 如果新版本号大于当前版本号返回 True
        """
        try:
            current_parts = [int(x) for x in self.current_version.split('.')]
            new_parts = [int(x) for x in new_version.split('.')]
            
            # 补齐版本号长度（例如 0.2.0 和 0.2）
            max_len = max(len(current_parts), len(new_parts))
            current_parts += [0] * (max_len - len(current_parts))
            new_parts += [0] * (max_len - len(new_parts))
            
            for i in range(max_len):
                if new_parts[i] > current_parts[i]:
                    return True
                elif new_parts[i] < current_parts[i]:
                    return False
            
            return False  # 版本号相同
        except Exception as e:
            logger.error(f"版本号比较失败: {e}")
            return False
