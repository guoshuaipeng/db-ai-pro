"""
Redis 操作处理器
处理所有 Redis 相关的查询和操作
"""
import logging
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QTimer
from typing import Optional

from src.gui.widgets.redis_data_viewer import RedisDataViewer
from src.gui.workers.redis_data_worker import RedisDataWorker
from src.utils.thread_manager import safe_delete_thread

logger = logging.getLogger(__name__)


class RedisHandler:
    """Redis 操作处理器"""
    
    def __init__(self, main_window):
        """
        初始化 Redis 处理器
        
        Args:
            main_window: 主窗口实例
        """
        self.main_window = main_window
    
    def query_redis_data(self, connection_id: str, database: str):
        """查询 Redis 数据（在当前查询tab中显示）"""
        if not connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "警告", "连接不存在")
            return
        
        # 先检查是否已有对应的 Redis tab（需要检查连接ID，避免不同连接的相同数据库混淆）
        connection_name = connection.name if connection else connection_id
        redis_tab_title = f"Redis: {connection_name}-{database}"
        existing_tab_index = None
        for i in range(self.main_window.right_tab_widget.count()):
            tab_widget = self.main_window.right_tab_widget.widget(i)
            # 检查tab标题和连接ID是否匹配
            if (self.main_window.right_tab_widget.tabText(i) == redis_tab_title and
                isinstance(tab_widget, RedisDataViewer) and
                hasattr(tab_widget, '_redis_connection_id') and
                tab_widget._redis_connection_id == connection_id):
                existing_tab_index = i
                break
        
        # 如果没有 tab，立即创建并显示（快速响应）
        viewer = None
        if existing_tab_index is None:
            # 创建新的 Redis 数据查看器 tab（立即显示，不等待数据）
            viewer = RedisDataViewer()
            # 保存连接ID，用于区分不同连接的相同数据库
            viewer._redis_connection_id = connection_id
            tab_index = self.main_window.right_tab_widget.addTab(viewer, redis_tab_title)
            self.main_window.right_tab_widget.setCurrentIndex(tab_index)
            # 显示加载状态
            viewer.value_json_editor.set_json_text("正在加载数据...")
            viewer.value_title_label.setText(f"正在加载 Redis 数据库 {database}...")
            viewer.keys_table.setRowCount(0)  # 清空表格
        else:
            # 如果已有对应的 tab，立即切换（不等待查询完成）
            self.main_window.right_tab_widget.setCurrentIndex(existing_tab_index)
            viewer = self.main_window.right_tab_widget.widget(existing_tab_index)
            if isinstance(viewer, RedisDataViewer):
                # 显示加载状态
                viewer.value_json_editor.set_json_text("正在加载数据...")
                viewer.value_title_label.setText(f"正在加载 Redis 数据库 {database}...")
        
        # 保存 database 变量供异步函数使用
        db_name = database
        
        # 使用 QTimer 异步执行耗时操作，确保 UI 立即响应
        def execute_query_async():
            # 切换到该连接和数据库（异步执行，不阻塞）
            try:
                if db_name:
                    self.main_window.db_manager.switch_database(connection_id, db_name)
                    self.main_window.current_database = db_name
            except Exception as e:
                logger.warning(f"切换 Redis 数据库失败: {e}")
            
            # 更新当前连接ID（不触发完整的 set_current_connection，避免耗时操作）
            self.main_window.current_connection_id = connection_id
            
            # 停止之前的 Redis 数据 worker（如果存在）
            if hasattr(self.main_window, 'redis_data_worker') and self.main_window.redis_data_worker:
                try:
                    old_worker = self.main_window.redis_data_worker
                    if old_worker.isRunning():
                        # 断开信号连接，避免回调执行
                        try:
                            old_worker.data_ready.disconnect()
                            old_worker.error_occurred.disconnect()
                        except:
                            pass
                        
                        # 停止 worker
                        old_worker.stop()
                        
                        # 等待线程结束
                        if not old_worker.wait(500):
                            old_worker.terminate()
                            old_worker.wait(200)
                        
                        # 延迟删除，确保线程完全结束
                        QTimer.singleShot(200, lambda: self._safe_delete_redis_worker(old_worker))
                except RuntimeError:
                    pass
                except Exception as e:
                    logger.warning(f"停止 Redis data worker 失败: {e}")
                finally:
                    self.main_window.redis_data_worker = None
            
            # 创建新的 worker
            self.main_window.redis_data_worker = RedisDataWorker(connection, db_name, limit=100)
            
            # 连接信号
            def on_redis_data_ready(data, columns):
                # 查找对应的 Redis 数据查看器 tab（应该已经存在）
                connection_name = connection.name if connection else connection_id
                redis_tab_title = f"Redis: {connection_name}-{db_name}"
                existing_tab_index = None
                for i in range(self.main_window.right_tab_widget.count()):
                    tab_widget = self.main_window.right_tab_widget.widget(i)
                    if (self.main_window.right_tab_widget.tabText(i) == redis_tab_title and
                        isinstance(tab_widget, RedisDataViewer) and
                        hasattr(tab_widget, '_redis_connection_id') and
                        tab_widget._redis_connection_id == connection_id):
                        existing_tab_index = i
                        break
                
                if existing_tab_index is not None:
                    # 更新数据（tab 应该已经存在并显示）
                    viewer = self.main_window.right_tab_widget.widget(existing_tab_index)
                    if isinstance(viewer, RedisDataViewer):
                        viewer.display_data(data, columns, connection, db_name)
                else:
                    # 如果 tab 不存在（不应该发生），创建新的
                    logger.warning(f"Redis tab 不存在，创建新的: {redis_tab_title}")
                    viewer = RedisDataViewer()
                    viewer._redis_connection_id = connection_id
                    viewer.display_data(data, columns, connection, db_name)
                    tab_index = self.main_window.right_tab_widget.addTab(viewer, redis_tab_title)
                    self.main_window.right_tab_widget.setCurrentIndex(tab_index)
                
                self.main_window.sql_editor.set_status(f"查询完成: {len(data)} 个 key")
            
            def on_redis_error(error):
                self.main_window.sql_editor.set_status(f"查询失败: {error}", is_error=True)
                QMessageBox.warning(self.main_window, "错误", f"查询 Redis 数据失败: {error}")
            
            self.main_window.redis_data_worker.data_ready.connect(on_redis_data_ready)
            self.main_window.redis_data_worker.error_occurred.connect(on_redis_error)
            
            # 启动 worker
            self.main_window.redis_data_worker.start()
            self.main_window.sql_editor.set_status("正在查询 Redis 数据...")
        
        # 延迟执行，确保 UI 立即响应（使用 0ms，下一个事件循环立即执行）
        QTimer.singleShot(0, execute_query_async)
    
    def query_redis_data_in_new_tab(self, connection_id: str, database: str):
        """在新标签页中查询 Redis 数据"""
        if not connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        # 导入必要的类
        from src.gui.widgets.redis_data_viewer import RedisDataViewer
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "警告", "连接不存在")
            return
        
        # 先检查是否已有对应的 Redis tab（需要检查连接ID，避免不同连接的相同数据库混淆）
        connection_name = connection.name if connection else connection_id
        redis_tab_title = f"Redis: {connection_name}-{database}"
        existing_tab_index = None
        for i in range(self.main_window.right_tab_widget.count()):
            tab_widget = self.main_window.right_tab_widget.widget(i)
            # 检查tab标题和连接ID是否匹配
            if (self.main_window.right_tab_widget.tabText(i) == redis_tab_title and
                isinstance(tab_widget, RedisDataViewer) and
                hasattr(tab_widget, '_redis_connection_id') and
                tab_widget._redis_connection_id == connection_id):
                existing_tab_index = i
                break
        
        # 如果没有 tab，立即创建并显示（快速响应）
        viewer = None
        if existing_tab_index is None:
            # 创建新的 Redis 数据查看器 tab（立即显示，不等待数据）
            viewer = RedisDataViewer()
            # 保存连接ID，用于区分不同连接的相同数据库
            viewer._redis_connection_id = connection_id
            tab_index = self.main_window.right_tab_widget.addTab(viewer, redis_tab_title)
            self.main_window.right_tab_widget.setCurrentIndex(tab_index)
            # 显示加载状态
            viewer.value_json_editor.set_json_text("正在加载数据...")
            viewer.value_title_label.setText(f"正在加载 Redis 数据库 {database}...")
            viewer.keys_table.setRowCount(0)  # 清空表格
        else:
            # 如果已有对应的 tab，立即切换（不等待查询完成）
            self.main_window.right_tab_widget.setCurrentIndex(existing_tab_index)
            viewer = self.main_window.right_tab_widget.widget(existing_tab_index)
            if isinstance(viewer, RedisDataViewer):
                # 显示加载状态
                viewer.value_json_editor.set_json_text("正在加载数据...")
                viewer.value_title_label.setText(f"正在加载 Redis 数据库 {database}...")
        
        # 保存 database 变量供异步函数使用
        db_name = database
        
        # 使用 QTimer 异步执行耗时操作，确保 UI 立即响应
        def execute_query_async():
            # 切换到该连接和数据库（但不切换 tab）
            self.main_window.set_current_connection(connection_id, database=db_name, from_combo=True)
            
            # 停止之前的 Redis 数据 worker（如果存在）
            if hasattr(self.main_window, 'redis_data_worker') and self.main_window.redis_data_worker:
                try:
                    old_worker = self.main_window.redis_data_worker
                    if old_worker.isRunning():
                        # 断开信号连接，避免回调执行
                        try:
                            old_worker.data_ready.disconnect()
                            old_worker.error_occurred.disconnect()
                        except:
                            pass
                        
                        # 停止 worker
                        old_worker.stop()
                        
                        # 等待线程结束
                        if not old_worker.wait(1000):
                            old_worker.terminate()
                            old_worker.wait(500)
                        
                        # 延迟删除，确保线程完全结束
                        QTimer.singleShot(200, lambda: self._safe_delete_redis_worker(old_worker))
                except RuntimeError:
                    pass
                except Exception as e:
                    logger.warning(f"停止 Redis data worker 失败: {e}")
                finally:
                    self.main_window.redis_data_worker = None
            
            # 创建新的 worker
            self.main_window.redis_data_worker = RedisDataWorker(connection, db_name, limit=100)
            
            # 连接信号
            def on_redis_data_ready(data, columns):
                # 查找对应的 Redis 数据查看器 tab（应该已经存在）
                connection_name = connection.name if connection else connection_id
                redis_tab_title = f"Redis: {connection_name}-{db_name}"
                existing_tab_index = None
                for i in range(self.main_window.right_tab_widget.count()):
                    tab_widget = self.main_window.right_tab_widget.widget(i)
                    if (self.main_window.right_tab_widget.tabText(i) == redis_tab_title and
                        isinstance(tab_widget, RedisDataViewer) and
                        hasattr(tab_widget, '_redis_connection_id') and
                        tab_widget._redis_connection_id == connection_id):
                        existing_tab_index = i
                        break
                
                if existing_tab_index is not None:
                    # 更新数据（tab 应该已经存在并显示）
                    viewer = self.main_window.right_tab_widget.widget(existing_tab_index)
                    if isinstance(viewer, RedisDataViewer):
                        viewer.display_data(data, columns, connection, db_name)
                        # 确保切换到该 tab（可能用户切换到了其他 tab）
                        self.main_window.right_tab_widget.setCurrentIndex(existing_tab_index)
                else:
                    # 如果 tab 不存在（不应该发生），创建新的
                    logger.warning(f"Redis tab 不存在，创建新的: {redis_tab_title}")
                    viewer = RedisDataViewer()
                    viewer._redis_connection_id = connection_id
                    viewer.display_data(data, columns, connection, db_name)
                    tab_index = self.main_window.right_tab_widget.addTab(viewer, redis_tab_title)
                    self.main_window.right_tab_widget.setCurrentIndex(tab_index)
                
                self.main_window.sql_editor.set_status(f"查询完成: {len(data)} 个 key")
            
            def on_redis_error(error):
                self.main_window.sql_editor.set_status(f"查询失败: {error}", is_error=True)
                QMessageBox.warning(self.main_window, "错误", f"查询 Redis 数据失败: {error}")
            
            self.main_window.redis_data_worker.data_ready.connect(on_redis_data_ready)
            self.main_window.redis_data_worker.error_occurred.connect(on_redis_error)
            
            # 启动 worker
            self.main_window.redis_data_worker.start()
            self.main_window.sql_editor.set_status("正在查询 Redis 数据...")
        
        # 延迟执行，确保 UI 立即响应（使用 0ms，下一个事件循环立即执行）
        QTimer.singleShot(0, execute_query_async)
    
    def _safe_delete_redis_worker(self, worker):
        """安全删除 Redis 数据 worker（确保线程完全结束）"""
        if worker is None:
            return
        try:
            # 检查线程是否还在运行
            if worker.isRunning():
                logger.warning(f"尝试删除仍在运行的 Redis worker: {worker.objectName() if hasattr(worker, 'objectName') else 'unknown'}")
                return  # 如果还在运行，不删除
            
            # 断开所有信号连接
            try:
                worker.data_ready.disconnect()
                worker.error_occurred.disconnect()
                worker.finished.disconnect()
            except (RuntimeError, TypeError):
                pass
            
            # 删除 worker
            safe_delete_thread(worker)
        except (RuntimeError, AttributeError):
            pass  # 对象已被删除，忽略
        except Exception as e:
            logger.warning(f"安全删除 Redis worker 时出错: {e}")
