"""
预加载工作线程 - 在后台加载所有连接的所有数据库的所有表
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict, Optional
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


class PreloadWorker(QThread):
    """预加载工作线程 - 加载所有连接的所有数据库的所有表"""
    
    # 定义信号
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
        """执行预加载（在工作线程中运行）"""
        try:
            # 获取所有连接
            connections = self.db_manager.get_all_connections()
            if not connections:
                self.finished_all.emit()
                return
            
            total_connections = len(connections)
            self.progress.emit(f"开始预加载 {total_connections} 个连接...")
            
            for idx, connection in enumerate(connections):
                if self.isInterruptionRequested() or self._should_stop:
                    logger.info("预加载被中断")
                    return
                
                connection_id = connection.id
                self.progress.emit(f"正在加载连接: {connection.name} ({idx + 1}/{total_connections})")
                
                try:
                    # 获取该连接的所有数据库
                    databases = self.db_manager.get_databases(connection_id)
                    
                    if not databases:
                        logger.debug(f"连接 {connection.name} 没有数据库")
                        continue
                    
                    # 遍历每个数据库
                    for database in databases:
                        if self.isInterruptionRequested() or self._should_stop:
                            return
                        
                        try:
                            # 获取该数据库的所有表
                            tables = self.db_manager.get_tables(connection_id, database)
                            
                            if tables:
                                # 发送信号，通知主线程更新树结构
                                self.connection_loaded.emit(connection_id, database, tables)
                                logger.debug(f"预加载完成: {connection.name} -> {database} ({len(tables)} 个表)")
                        
                        except Exception as e:
                            logger.warning(f"预加载数据库 {database} 失败: {str(e)}")
                            continue
                
                except Exception as e:
                    logger.warning(f"预加载连接 {connection.name} 失败: {str(e)}")
                    continue
            
            self.progress.emit("预加载完成")
            self.finished_all.emit()
            
        except Exception as e:
            logger.error(f"预加载过程中发生错误: {str(e)}")
            self.finished_all.emit()

