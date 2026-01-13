"""
预加载工作线程 - 已禁用，不再预加载数据库和表
现在只加载连接列表，数据库和表列表在用户展开时才加载
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class PreloadWorker(QThread):
    """预加载工作线程 - 已禁用预加载功能
    
    现在启动时只显示连接列表，不预加载数据库和表列表。
    数据库列表和表列表只在用户手动展开时才加载，避免启动时卡顿。
    """
    
    # 定义信号（保留以兼容现有代码，但不再使用）
    databases_loaded = pyqtSignal(str, list)  # connection_id, databases
    connection_loaded = pyqtSignal(str, str, list)  # connection_id, database, tables
    progress = pyqtSignal(str)  # 进度消息
    finished_all = pyqtSignal()  # 所有加载完成
    
    def __init__(self, db_manager):
        super().__init__()
        self.db_manager = db_manager
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行预加载（已禁用，立即完成）"""
        # 预加载功能已禁用，只加载连接列表
        # 数据库和表列表在用户展开时才加载，避免启动时卡顿
        logger.info("预加载功能已禁用，只显示连接列表")
        self.progress.emit("预加载完成（已禁用预加载）")
        self.finished_all.emit()
        self.quit()

