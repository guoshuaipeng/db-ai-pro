"""
更新检查工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging

from src.core.update_checker import UpdateChecker, UpdateInfo

logger = logging.getLogger(__name__)


class UpdateCheckWorker(QThread):
    """更新检查工作线程"""
    
    update_available = pyqtSignal(object)  # 有更新时发出信号，参数为 UpdateInfo
    no_update = pyqtSignal()  # 无更新时发出信号
    check_failed = pyqtSignal(str)  # 检查失败时发出信号，参数为错误信息
    
    def __init__(self, owner: str = None, repo: str = None, use_custom_api: bool = False):
        super().__init__()
        self.owner = owner
        self.repo = repo
        self.use_custom_api = use_custom_api
        self._should_stop = False
    
    def stop(self):
        """停止检查"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行更新检查"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            checker = UpdateChecker(
                owner=self.owner or "guoshuaipeng",
                repo=self.repo or "db-ai-pro",
                use_custom_api=self.use_custom_api
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            update_info = checker.check_update(timeout=10)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            if update_info:
                logger.info(f"发现新版本: {update_info.version}")
                self.update_available.emit(update_info)
            else:
                logger.info("当前已是最新版本")
                self.no_update.emit()
                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"检查更新失败: {error_msg}", exc_info=True)
            
            # 如果是速率限制错误，提供更友好的提示
            if '速率限制' in error_msg or 'rate limit' in error_msg.lower():
                friendly_msg = "GitHub API 请求过于频繁，已达到速率限制。\n\n" \
                              "建议：\n" \
                              "1. 请稍后再试（约1小时后）\n" \
                              "2. 或访问 GitHub 仓库手动检查更新"
                self.check_failed.emit(friendly_msg)
            else:
                self.check_failed.emit(error_msg)
