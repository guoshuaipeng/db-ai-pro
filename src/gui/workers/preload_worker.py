"""
预加载工作线程 - 在后台加载所有数据库和表列表
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict, Optional
import logging
import time

logger = logging.getLogger(__name__)


class PreloadWorker(QThread):
    """预加载工作线程 - 在后台加载所有数据库和表列表"""
    
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
        """执行预加载（在后台线程中运行）"""
        try:
            connections = self.db_manager.get_all_connections()
            total_connections = len(connections)
            
            if total_connections == 0:
                logger.info("没有需要预加载的连接")
                self.progress.emit("没有需要预加载的连接")
                self.finished_all.emit()
                return
            
            logger.info(f"开始预加载 {total_connections} 个连接的数据库和表列表")
            self.progress.emit(f"开始预加载 {total_connections} 个连接...")
            
            for idx, connection in enumerate(connections):
                if self.isInterruptionRequested() or self._should_stop:
                    logger.info("预加载被中断")
                    break
                
                connection_id = connection.id
                logger.info(f"预加载连接 [{idx + 1}/{total_connections}]: {connection.name} ({connection_id})")
                self.progress.emit(f"加载连接 {idx + 1}/{total_connections}: {connection.name}...")
                
                try:
                    # 获取数据库列表（在后台线程中执行，不会阻塞UI）
                    databases = self.db_manager.get_databases(connection_id)
                    
                    if self.isInterruptionRequested() or self._should_stop:
                        break
                    
                    if databases:
                        # 发送数据库列表信号
                        self.databases_loaded.emit(connection_id, databases)
                        logger.info(f"✅ 已加载连接 {connection.name} 的 {len(databases)} 个数据库")
                        
                        # 对于每个数据库，加载表列表（Redis 数据库不需要加载表）
                        for database in databases:
                            if self.isInterruptionRequested() or self._should_stop:
                                break
                            
                            # Redis 数据库不需要加载表，直接跳过
                            from src.core.database_connection import DatabaseType
                            if connection.db_type == DatabaseType.REDIS:
                                continue
                            
                            try:
                                # 获取表列表（在后台线程中执行，不会阻塞UI）
                                tables = self.db_manager.get_tables(connection_id, database)
                                
                                if self.isInterruptionRequested() or self._should_stop:
                                    break
                                
                                # 发送表列表信号
                                self.connection_loaded.emit(connection_id, database, tables)
                                logger.debug(f"✅ 已加载 {connection.name}.{database} 的 {len(tables)} 个表")
                                
                            except Exception as e:
                                # 单个数据库加载失败不影响其他数据库
                                logger.warning(f"⚠️ 加载 {connection.name}.{database} 的表列表失败: {e}")
                                # 仍然发送空列表，让UI知道这个数据库已处理
                                self.connection_loaded.emit(connection_id, database, [])
                                continue
                    else:
                        logger.debug(f"连接 {connection.name} 没有数据库")
                    
                except Exception as e:
                    # 单个连接加载失败不影响其他连接
                    logger.warning(f"⚠️ 加载连接 {connection.name} 的数据库列表失败: {e}")
                    continue
            
            logger.info("所有连接的预加载完成")
            self.progress.emit("预加载完成")
            self.finished_all.emit()
            
        except Exception as e:
            logger.error(f"预加载过程中发生错误: {e}", exc_info=True)
            self.progress.emit(f"预加载过程中发生错误: {e}")
            self.finished_all.emit()
        finally:
            self.quit()
