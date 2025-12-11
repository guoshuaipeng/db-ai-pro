"""
树视图数据加载处理器
"""
from PyQt6.QtWidgets import QTreeWidgetItem, QMessageBox
from PyQt6.QtCore import Qt, QTimer
from typing import List, TYPE_CHECKING
import logging

from src.core.database_connection import DatabaseType
from src.core.tree_cache import TreeCache
from src.gui.utils.tree_item_types import TreeItemType, TreeItemData
from src.utils.ui_helpers import (
    get_database_icon_simple,
    get_connection_icon,
    get_table_icon,
    get_category_icon
)

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class TreeDataHandler:
    """树视图数据加载处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
        self.tree_cache = TreeCache()
    
    def refresh_connections(self):
        """刷新连接列表"""
        # 清空树
        self.main_window.connection_tree.clear()
        self.main_window.connection_combo.clear()
        
        # 创建"我的连接"根节点
        root_item = QTreeWidgetItem(self.main_window.connection_tree.tree)
        root_item.setText(0, "我的连接")
        # 设置根节点类型
        TreeItemData.set_item_type_and_data(root_item, TreeItemType.ROOT)
        root_item.setExpanded(True)  # 默认展开根节点
        
        # 添加所有连接
        connections = self.main_window.db_manager.get_all_connections()
        for conn in connections:
            # 创建树项（使用根节点作为父项）
            item = QTreeWidgetItem(root_item)
            
            # 设置图标（使用连接图标，蓝色服务器图标）
            icon = get_connection_icon(18)
            item.setIcon(0, icon)
            
            # 设置主行文本（连接名称）
            item.setText(0, conn.name)
            
            # 设置节点类型和数据（连接项）
            TreeItemData.set_item_type_and_data(item, TreeItemType.CONNECTION, conn.id)
            
            # 设置工具提示
            db_type_name = {
                DatabaseType.MYSQL: "MySQL",
                DatabaseType.MARIADB: "MariaDB",
                DatabaseType.POSTGRESQL: "PostgreSQL",
                DatabaseType.SQLITE: "SQLite",
                DatabaseType.ORACLE: "Oracle",
                DatabaseType.SQLSERVER: "SQL Server",
                DatabaseType.HIVE: "Hive",
            }.get(conn.db_type, conn.db_type.value)
            
            tooltip = (
                f"连接名称: {conn.name}\n"
                f"数据库类型: {db_type_name}\n"
                f"主机: {conn.host}\n"
                f"端口: {conn.port}\n"
                f"数据库: {conn.database}\n"
                f"用户名: {conn.username}"
            )
            item.setToolTip(0, tooltip)
            
            # 不自动展开，让用户手动展开
            item.setExpanded(False)
            
            # 从缓存加载数据库列表（如果有缓存）
            self._load_databases_from_cache(item, conn.id)
            
            # 添加到下拉框（只显示连接名，不包含数据库）
            display_name = f"{conn.name} ({conn.db_type.value})"
            self.main_window.connection_combo.addItem(display_name, conn.id)
        
        # 如果当前连接存在，设置下拉框选中项并加载数据库列表
        if self.main_window.current_connection_id:
            for i in range(self.main_window.connection_combo.count()):
                if self.main_window.connection_combo.itemData(i) == self.main_window.current_connection_id:
                    self.main_window.connection_combo.setCurrentIndex(i)
                    # 加载当前连接的数据库列表
                    self.main_window.load_databases_for_combo(self.main_window.current_connection_id)
                    break
        
        # 调整列宽
        self.main_window.connection_tree.resizeColumnToContents(0)
    
    def load_databases_for_connection(self, connection_item: QTreeWidgetItem, connection_id: str, force_reload: bool = False):
        """为连接加载数据库列表"""
        logger.info(f"🔵 load_databases_for_connection 被调用: connection_id={connection_id}, force_reload={force_reload}")
        
        # 检查是否已经有正在加载的worker，如果有，先停止它
        if connection_id in self.main_window.database_list_workers:
            worker = self.main_window.database_list_workers[connection_id]
            if worker and worker.isRunning():
                logger.debug(f"连接 {connection_id} 的数据库列表正在加载中，停止旧worker")
                try:
                    # 断开信号连接
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    # 停止worker
                    worker.stop()
                    # 等待停止（最多200ms，避免阻塞太久）
                    if not worker.wait(200):
                        worker.terminate()
                        worker.wait(100)
                    worker.deleteLater()
                except Exception as e:
                    logger.warning(f"停止旧worker时出错: {str(e)}")
                finally:
                    # 从字典中移除
                    if connection_id in self.main_window.database_list_workers:
                        del self.main_window.database_list_workers[connection_id]
        
        # 检查是否已经加载过数据库
        has_databases = False
        loading_item = None
        
        # 清理临时项并检查是否有数据库
        items_to_remove = []
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            # 标记临时项（加载项、错误项、空项）需要移除
            if child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                items_to_remove.append(child)
            elif child_type == TreeItemType.DATABASE:
                # 这是数据库项
                has_databases = True
                # 只有在强制重新加载时才移除数据库项
                if force_reload:
                    items_to_remove.append(child)
        
        # 先清理临时项（加载中、错误等）
        for item in items_to_remove:
            try:
                connection_item.removeChild(item)
            except:
                pass
        
        # 如果已经加载过且不强制重新加载，直接返回
        if has_databases and not force_reload:
            logger.info(f"⏭️  连接已有数据库项，跳过加载: {connection_id}")
            return
        
        logger.info(f"🚀 开始加载数据库列表: {connection_id}")
        
        # 显示加载状态
        loading_item = QTreeWidgetItem(connection_item)
        loading_item.setText(0, "加载中...")
        TreeItemData.set_item_type_and_data(loading_item, TreeItemType.LOADING)
        loading_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
        self.main_window.connection_tree.update()
        
        # 使用QTimer延迟执行数据库连接操作，确保不阻塞UI
        def start_database_loading():
            # 获取连接信息
            connection = self.main_window.db_manager.get_connection(connection_id)
            if not connection:
                if loading_item:
                    try:
                        connection_item.removeChild(loading_item)
                    except:
                        pass
                try:
                    error_item = QTreeWidgetItem(connection_item)
                    error_item.setText(0, "错误: 连接不存在")
                except:
                    pass
                return
            
            # 停止该连接之前的数据库列表工作线程（如果存在）
            if connection_id in self.main_window.database_list_workers:
                old_worker = self.main_window.database_list_workers[connection_id]
                try:
                    if old_worker and old_worker.isRunning():
                        # 断开信号连接，避免旧worker的回调影响新操作
                        try:
                            old_worker.databases_ready.disconnect()
                            old_worker.error_occurred.disconnect()
                        except:
                            pass
                        # 请求停止
                        old_worker.stop()
                        # 等待线程停止（最多等待500ms，避免长时间阻塞）
                        if not old_worker.wait(500):
                            # 如果等待超时，强制终止
                            logger.warning(f"数据库列表worker未能在500ms内停止，强制终止")
                            old_worker.terminate()
                            old_worker.wait(200)
                        # 线程已停止，安全删除
                        old_worker.deleteLater()
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
                except Exception as e:
                    logger.warning(f"停止旧worker时出错: {str(e)}")
                finally:
                    # 确保从字典中移除
                    if connection_id in self.main_window.database_list_workers:
                        del self.main_window.database_list_workers[connection_id]
            
            # 创建并启动数据库列表工作线程（在后台线程中连接数据库）
            from src.gui.workers.database_list_worker import DatabaseListWorker
            worker = DatabaseListWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type
            )
            
            # 保存引用以便在回调中使用
            worker.loading_item = loading_item
            worker.connection_item = connection_item
            worker.connection_id = connection_id
            # 明确使用QueuedConnection，确保信号在UI线程的事件循环中异步处理
            worker.databases_ready.connect(
                lambda databases, conn_id=connection_id: self.on_databases_loaded(connection_item, loading_item, databases, conn_id),
                Qt.ConnectionType.QueuedConnection
            )
            worker.error_occurred.connect(
                lambda error, conn_id=connection_id: self.on_databases_load_error(connection_item, loading_item, error),
                Qt.ConnectionType.QueuedConnection
            )
            
            # 将worker存储到字典中
            self.main_window.database_list_workers[connection_id] = worker
            worker.start()
        
        # 延迟1ms执行，确保展开事件处理函数立即返回
        QTimer.singleShot(1, start_database_loading)
    
    def on_databases_loaded(self, connection_item: QTreeWidgetItem, loading_item: QTreeWidgetItem, databases: List[str], connection_id: str = None):
        """数据库列表加载完成回调"""
        # 检查对象是否仍然有效
        try:
            if not connection_item or not hasattr(connection_item, 'text'):
                return
        except RuntimeError:
            return
        
        # 清理所有临时项（加载中、错误、无数据库等）
        items_to_remove = []
        try:
            for i in range(connection_item.childCount()):
                child = connection_item.child(i)
                if child:
                    child_type = TreeItemData.get_item_type(child)
                    if child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                        items_to_remove.append(child)
        except RuntimeError:
            pass
        
        # 移除临时项
        for item in items_to_remove:
            try:
                connection_item.removeChild(item)
            except (RuntimeError, AttributeError):
                pass
        
        if not databases:
            # 没有数据库
            no_db_item = QTreeWidgetItem(connection_item)
            no_db_item.setText(0, "无数据库")
            TreeItemData.set_item_type_and_data(no_db_item, TreeItemType.EMPTY)
            no_db_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
            return
        
        # 获取连接信息（connection_id 现在作为参数传入）
        connection = self.main_window.db_manager.get_connection(connection_id) if connection_id else None
        
        # 保存到缓存
        if connection_id:
            try:
                self.tree_cache.set_databases(connection_id, databases)
                logger.info(f"✅ 已成功缓存连接 {connection_id} 的 {len(databases)} 个数据库")
            except Exception as e:
                logger.error(f"❌ 保存数据库缓存失败: connection_id={connection_id}, error={e}")
        else:
            logger.warning(f"⚠️ connection_id 为空，无法保存数据库缓存")
        
        # 清理worker（加载完成后）
        if connection_id and connection_id in self.main_window.database_list_workers:
            try:
                worker = self.main_window.database_list_workers[connection_id]
                if worker:
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    worker.deleteLater()
                del self.main_window.database_list_workers[connection_id]
            except RuntimeError:
                pass
        
        # 检查已存在的数据库项，避免重复添加
        existing_databases = set()
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            if child_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(child)
                if db_name and isinstance(db_name, str):
                    existing_databases.add(db_name)
        
        # 添加数据库项（按字母顺序排序），只添加不存在的
        for db_name in sorted(databases):
            # 如果已存在，跳过
            if db_name in existing_databases:
                logger.debug(f"数据库 {db_name} 已存在，跳过添加")
                continue
            
            db_item = QTreeWidgetItem(connection_item)
            db_item.setText(0, db_name)
            # 设置节点类型和数据（数据库项）
            TreeItemData.set_item_type_and_data(db_item, TreeItemType.DATABASE, db_name)
            db_item.setIcon(0, get_database_icon_simple(18))
            db_item.setToolTip(0, f"数据库: {db_name}\n双击展开表列表")
            # 如果是当前连接的数据库，标记为已选中
            if connection and connection.database == db_name:
                font = db_item.font(0)
                font.setBold(True)
                db_item.setFont(0, font)
    
    def on_databases_load_error(self, connection_item: QTreeWidgetItem, loading_item: QTreeWidgetItem, error: str):
        """数据库列表加载错误回调"""
        import time
        import threading
        start_time = time.time()
        logger.error(f"[信号回调] on_databases_load_error 开始, 线程: {threading.current_thread().name}, 错误: {error}")
        
        # 使用QTimer延迟更新UI，避免阻塞主线程
        def update_ui():
            # 检查对象是否仍然有效
            try:
                if not connection_item or not hasattr(connection_item, 'text'):
                    logger.warning(f"[UI更新] connection_item 无效，退出")
                    return
            except RuntimeError:
                logger.warning(f"[UI更新] connection_item RuntimeError，退出")
                return
            
            # 移除加载项
            if loading_item:
                try:
                    connection_item.removeChild(loading_item)
                except (RuntimeError, AttributeError) as e:
                    logger.warning(f"[UI更新] 移除加载项失败: {e}")
                    pass
            
            try:
                # 简化错误消息显示
                error_msg = str(error)
                # 提取主要错误信息（去掉详细的堆栈信息）
                for sep in ['\n', '(', '[']:
                    idx = error_msg.find(sep)
                    if idx > 0 and idx < 80:  # 如果找到分隔符且在合理位置
                        error_msg = error_msg[:idx].strip()
                        break
                
                # 截取错误消息的前80个字符，避免过长
                if len(error_msg) > 80:
                    error_msg = error_msg[:80] + "..."
                
                error_item = QTreeWidgetItem(connection_item)
                error_item.setText(0, f"错误: {error_msg}")
                TreeItemData.set_item_type_and_data(error_item, TreeItemType.ERROR, error_msg)
                error_item.setToolTip(0, str(error))  # 完整错误信息在tooltip中
            except (RuntimeError, AttributeError) as e:
                logger.error(f"[UI更新] 创建错误项失败: {e}", exc_info=True)
                pass
            
            # 清理worker（错误后也要清理）
            try:
                # 查找对应的连接ID并清理worker
                for conn_id, worker in list(self.main_window.database_list_workers.items()):
                    if worker and hasattr(worker, 'connection_item') and worker.connection_item == connection_item:
                        try:
                            if worker:
                                try:
                                    worker.databases_ready.disconnect()
                                    worker.error_occurred.disconnect()
                                except:
                                    pass
                                worker.deleteLater()
                            del self.main_window.database_list_workers[conn_id]
                        except RuntimeError:
                            pass
                        break
            except Exception:
                pass
        
        # 延迟1ms执行，确保不阻塞主线程
        QTimer.singleShot(1, update_ui)
    
    def load_tables_for_database(self, db_item: QTreeWidgetItem, connection_id: str, database: str, force_reload: bool = False):
        """为数据库加载表列表"""
        # 检查是否已经加载过表
        has_tables = False
        loading_item = None
        
        # 清理现有的表项、加载项、错误项、"表"分类项
        items_to_remove = []
        tables_category = None
        for i in range(db_item.childCount()):
            child = db_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            
            if child_type == TreeItemType.TABLE_CATEGORY:
                # 保留"表"分类项，检查其子项
                tables_category = child
                # 如果强制重新加载，清理"表"分类下的所有子项
                if force_reload:
                    for j in range(tables_category.childCount() - 1, -1, -1):
                        tables_category.removeChild(tables_category.child(j))
                else:
                    # 检查"表"分类下是否有表项，并清理"加载中..."、"错误"、"无表"等临时项
                    for j in range(tables_category.childCount() - 1, -1, -1):
                        table_child = tables_category.child(j)
                        table_child_type = TreeItemData.get_item_type(table_child)
                        if table_child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                            # 清理临时项
                            tables_category.removeChild(table_child)
                        elif table_child_type == TreeItemType.TABLE:
                            has_tables = True
            elif child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                items_to_remove.append(child)
            elif child_type == TreeItemType.DATABASE:
                # 这是表项（旧结构，应该不存在了，但保留兼容性）
                items_to_remove.append(child)
                has_tables = True
        
        # 如果已经加载过且不强制重新加载，直接返回
        if has_tables and not force_reload:
            return
        
        # 移除旧的表项、加载项、错误项
        for item in items_to_remove:
            db_item.removeChild(item)
        
        # 显示加载状态（在"表"分类下显示，如果没有则创建）
        if not tables_category:
            tables_category = QTreeWidgetItem(db_item)
            tables_category.setText(0, "表")
            TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
            tables_category.setIcon(0, get_category_icon("表", 16))
            # 允许显示和展开，但不允许选中（子项仍然可以选中）
            tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
        
        loading_item = QTreeWidgetItem(tables_category)
        loading_item.setText(0, "加载中...")
        TreeItemData.set_item_type_and_data(loading_item, TreeItemType.LOADING)
        loading_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
        self.main_window.connection_tree.update()
        
        # 使用QTimer延迟执行数据库连接操作，确保不阻塞UI
        def start_table_loading():
            # 获取连接信息
            connection = self.main_window.db_manager.get_connection(connection_id)
            if not connection:
                if loading_item:
                    try:
                        tables_category.removeChild(loading_item)
                    except:
                        pass
                try:
                    error_item = QTreeWidgetItem(tables_category)
                    error_item.setText(0, "错误: 连接不存在")
                except:
                    pass
                return
            
            # 停止之前的表列表工作线程（如果存在）
            if self.main_window.table_list_worker_for_tree:
                try:
                    if self.main_window.table_list_worker_for_tree.isRunning():
                        # 断开信号连接，避免旧worker的回调影响新操作
                        try:
                            self.main_window.table_list_worker_for_tree.tables_ready.disconnect()
                            self.main_window.table_list_worker_for_tree.error_occurred.disconnect()
                        except:
                            pass
                        # 请求停止
                        self.main_window.table_list_worker_for_tree.stop()
                        # 等待线程停止（最多等待500ms，避免长时间阻塞）
                        if not self.main_window.table_list_worker_for_tree.wait(500):
                            # 如果等待超时，强制终止
                            logger.warning(f"表列表worker未能在500ms内停止，强制终止")
                            self.main_window.table_list_worker_for_tree.terminate()
                            self.main_window.table_list_worker_for_tree.wait(200)
                        # 线程已停止，安全删除
                        self.main_window.table_list_worker_for_tree.deleteLater()
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
                except Exception as e:
                    logger.warning(f"停止旧表列表worker时出错: {str(e)}")
                finally:
                    self.main_window.table_list_worker_for_tree = None
            
            # 创建并启动表列表工作线程（在后台线程中连接数据库）
            from src.gui.workers.table_list_worker_for_tree import TableListWorkerForTree
            self.main_window.table_list_worker_for_tree = TableListWorkerForTree(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                database
            )
            # 保存引用以便在回调中使用
            self.main_window.table_list_worker_for_tree.loading_item = loading_item
            self.main_window.table_list_worker_for_tree.tables_category = tables_category
            self.main_window.table_list_worker_for_tree.db_item = db_item
            self.main_window.table_list_worker_for_tree.connection_id = connection_id
            self.main_window.table_list_worker_for_tree.database = database
            self.main_window.table_list_worker_for_tree.tables_ready.connect(
                lambda tables: self.on_tables_loaded_for_tree(db_item, tables_category, loading_item, tables)
            )
            self.main_window.table_list_worker_for_tree.error_occurred.connect(
                lambda error: self.on_tables_load_error_for_tree(db_item, tables_category, loading_item, error)
            )
            self.main_window.table_list_worker_for_tree.start()
        
        # 延迟1ms执行，确保展开事件处理函数立即返回
        QTimer.singleShot(1, start_table_loading)
    
    def on_tables_loaded_for_tree(self, db_item: QTreeWidgetItem, tables_category: QTreeWidgetItem, loading_item: QTreeWidgetItem, tables: List[str]):
        """表列表加载完成回调（用于树视图）"""
        # 检查数据库项是否仍然存在（可能已被折叠或删除）
        try:
            if not db_item or not tables_category:
                return
        except RuntimeError:
            return
        
        # 清理所有临时项（加载中、错误、无表等）
        items_to_remove = []
        try:
            for i in range(tables_category.childCount()):
                child = tables_category.child(i)
                if child:
                    child_type = TreeItemData.get_item_type(child)
                    if child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                        items_to_remove.append(child)
        except RuntimeError:
            pass
        
        # 移除临时项
        for item in items_to_remove:
            try:
                tables_category.removeChild(item)
            except (RuntimeError, AttributeError):
                pass
        
        # 获取连接ID和数据库名，用于缓存
        connection_id = None
        database = ""
        
        if hasattr(self.main_window.table_list_worker_for_tree, 'connection_id'):
            connection_id = self.main_window.table_list_worker_for_tree.connection_id
        else:
            logger.warning("worker 没有 connection_id 属性")
            
        if hasattr(self.main_window.table_list_worker_for_tree, 'database'):
            database = self.main_window.table_list_worker_for_tree.database
        else:
            logger.warning("worker 没有 database 属性")
        
        if not tables:
            # 没有表，保存空列表到缓存
            if connection_id and database:
                logger.info(f"保存空表列表缓存: {connection_id}.{database}")
                self.tree_cache.set_tables(connection_id, database, [])
            else:
                logger.warning(f"无法保存空表列表缓存: connection_id={connection_id}, database={database}")
            
            no_table_item = QTreeWidgetItem(tables_category)
            no_table_item.setText(0, "无表")
            TreeItemData.set_item_type_and_data(no_table_item, TreeItemType.EMPTY)
            no_table_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
            return
        
        # 保存到缓存
        if connection_id and database:
            try:
                self.tree_cache.set_tables(connection_id, database, tables)
                logger.info(f"已成功缓存数据库 {database} 的 {len(tables)} 个表")
            except Exception as e:
                logger.error(f"保存表缓存失败: {str(e)}", exc_info=True)
        else:
            logger.warning(f"无法保存表缓存 (缺少必要信息): connection_id={connection_id}, database={database}")
        
        # 添加表项（按字母顺序排序）
        for table_name in sorted(tables):
            table_item = QTreeWidgetItem(tables_category)
            table_item.setText(0, table_name)
            # 设置节点类型和数据（表项）
            TreeItemData.set_item_type_and_data(table_item, TreeItemType.TABLE, (database, table_name))
            table_item.setToolTip(0, f"表: {database}.{table_name}\n双击或单击查询前100条数据")
            table_item.setIcon(0, get_table_icon(16))
            # 确保表项本身是可选中的（父项 "表" 被设置为 NoItemFlags）
            table_item.setFlags(
                Qt.ItemFlag.ItemIsEnabled
                | Qt.ItemFlag.ItemIsSelectable
            )
        
        # 自动展开"表"分类，显示所有表
        # 只有在数据库项已经展开时才自动展开"表"分类，避免在用户手动折叠后又被展开
        if db_item.isExpanded():
            tables_category.setExpanded(True)
    
    def on_tables_load_error_for_tree(self, db_item: QTreeWidgetItem, tables_category: QTreeWidgetItem, loading_item: QTreeWidgetItem, error: str):
        """表列表加载错误回调（用于树视图）"""
        logger.error(f"获取表列表失败: {error}")
        
        # 使用QTimer延迟更新UI，避免阻塞主线程
        def update_ui():
            # 检查数据库项是否仍然存在（可能已被折叠或删除）
            try:
                if not db_item:
                    return
            except RuntimeError:
                return
            
            # 使用 nonlocal 声明，允许修改外部作用域的变量
            nonlocal tables_category
            
            try:
                # 确保"表"分类项存在
                if not tables_category:
                    tables_category = QTreeWidgetItem(db_item)
                    tables_category.setText(0, "表")
                    TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
                    tables_category.setIcon(0, get_category_icon("表", 16))
                    # 允许显示和展开，但不允许选中（子项仍然可以选中）
                    tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
            except RuntimeError:
                return
            
            # 移除加载项（如果还存在）
            if loading_item:
                try:
                    # 检查加载项是否仍然是tables_category的子项
                    for i in range(tables_category.childCount()):
                        if tables_category.child(i) == loading_item:
                            tables_category.removeChild(loading_item)
                            break
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
            
            # 显示错误消息
            try:
                # 简化错误消息显示
                error_msg = str(error)
                # 提取主要错误信息（去掉详细的堆栈信息）
                for sep in ['\n', '(', '[']:
                    idx = error_msg.find(sep)
                    if idx > 0 and idx < 80:  # 如果找到分隔符且在合理位置
                        error_msg = error_msg[:idx].strip()
                        break
                
                # 截取错误消息的前80个字符，避免过长
                if len(error_msg) > 80:
                    error_msg = error_msg[:80] + "..."
                
                error_item = QTreeWidgetItem(tables_category)
                error_item.setText(0, f"错误: {error_msg}")
                TreeItemData.set_item_type_and_data(error_item, TreeItemType.ERROR, error_msg)
                error_item.setToolTip(0, str(error))  # 完整错误信息在tooltip中
            except (RuntimeError, AttributeError):
                pass
        
        # 延迟1ms执行，确保不阻塞主线程
        QTimer.singleShot(1, update_ui)
    
    def refresh_connection_databases(self, connection_id: str, connection_item: QTreeWidgetItem):
        """刷新连接下的数据库列表"""
        self.load_databases_for_connection(connection_item, connection_id, force_reload=True)
        self.main_window.statusBar().showMessage("正在刷新数据库列表...", 3000)
    
    def refresh_database_tables(self, connection_id: str, database: str):
        """刷新数据库下的表列表"""
        # 找到对应的数据库项
        root_item = self.main_window.connection_tree.topLevelItem(0)
        if not root_item:
            return
        
        # 遍历所有连接
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue
            
            # 检查连接ID是否匹配
            conn_id = TreeItemData.get_item_data(connection_item)
            if conn_id != connection_id:
                continue
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue
                
                # 检查数据库名是否匹配
                db_name = TreeItemData.get_item_data(db_item)
                if db_name == database:
                    # 找到匹配的数据库项，刷新表列表
                    self.load_tables_for_database(db_item, connection_id, database, force_reload=True)
                    self.main_window.statusBar().showMessage(f"正在刷新数据库 '{database}' 的表列表...", 3000)
                    return
        
        # 如果没找到，尝试从当前选中的项获取
        current_item = self.main_window.connection_tree.currentItem()
        if current_item:
            current_type = TreeItemData.get_item_type(current_item)
            if current_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(current_item)
                if db_name == database:
                    self.load_tables_for_database(current_item, connection_id, database, force_reload=True)
                    self.main_window.statusBar().showMessage(f"正在刷新数据库 '{database}' 的表列表...", 3000)
                    return
    
    def _load_databases_from_cache(self, connection_item: QTreeWidgetItem, connection_id: str):
        """从缓存加载数据库列表（如果有）"""
        cached_databases = self.tree_cache.get_databases(connection_id)
        if not cached_databases:
            return
        
        logger.debug(f"从缓存加载连接 {connection_id} 的 {len(cached_databases)} 个数据库")
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        
        # 添加数据库项
        for db_name in sorted(cached_databases):
            db_item = QTreeWidgetItem(connection_item)
            db_item.setText(0, db_name)
            TreeItemData.set_item_type_and_data(db_item, TreeItemType.DATABASE, db_name)
            db_item.setIcon(0, get_database_icon_simple(18))
            db_item.setToolTip(0, f"数据库: {db_name}\n双击展开表列表")
            
            # 如果是当前连接的数据库，标记为已选中
            if connection and connection.database == db_name:
                font = db_item.font(0)
                font.setBold(True)
                db_item.setFont(0, font)
            
            # 从缓存加载表列表（如果有）
            self._load_tables_from_cache(db_item, connection_id, db_name)
        
        # 后台异步刷新数据库列表（无感更新）
        QTimer.singleShot(100, lambda: self._async_refresh_databases(connection_item, connection_id))
    
    def _load_tables_from_cache(self, db_item: QTreeWidgetItem, connection_id: str, database: str):
        """从缓存加载表列表（如果有缓存的话）"""
        logger.debug(f"尝试从缓存加载: connection_id={connection_id}, database={database}")
        cached_tables = self.tree_cache.get_tables(connection_id, database)
        logger.debug(f"缓存结果: {cached_tables}")
        
        # 只有缓存存在时才加载（首次打开不自动加载）
        # None表示没有缓存，[]表示缓存为空表
        if cached_tables is None:
            logger.debug(f"数据库 {database} 没有表缓存，等待用户手动展开")
            return
        
        if not cached_tables:  # 空列表
            logger.debug(f"数据库 {database} 缓存为空表列表")
            return
        
        logger.debug(f"从缓存加载数据库 {database} 的 {len(cached_tables)} 个表")
        
        # 创建"表"分类项
        tables_category = QTreeWidgetItem(db_item)
        tables_category.setText(0, "表")
        TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
        tables_category.setIcon(0, get_category_icon("表", 16))
        tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
        
        # 添加表项
        for table_name in sorted(cached_tables):
            table_item = QTreeWidgetItem(tables_category)
            table_item.setText(0, table_name)
            TreeItemData.set_item_type_and_data(table_item, TreeItemType.TABLE, (database, table_name))
            table_item.setToolTip(0, f"表: {database}.{table_name}\n双击或单击查询前100条数据")
            table_item.setIcon(0, get_table_icon(16))
            table_item.setFlags(
                Qt.ItemFlag.ItemIsEnabled
                | Qt.ItemFlag.ItemIsSelectable
            )
        
        # 后台异步刷新表列表（无感更新），稍微延迟一点避免启动时过多请求
        QTimer.singleShot(500, lambda: self._async_refresh_tables(db_item, connection_id, database))
    
    def _async_refresh_databases(self, connection_item: QTreeWidgetItem, connection_id: str):
        """后台异步刷新数据库列表（无感更新）"""
        # 这个方法会在后台更新数据库列表，不显示"加载中..."
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        # 停止该连接之前的数据库列表工作线程（如果存在）
        if connection_id in self.main_window.database_list_workers:
            old_worker = self.main_window.database_list_workers[connection_id]
            try:
                if old_worker and old_worker.isRunning():
                    try:
                        old_worker.databases_ready.disconnect()
                        old_worker.error_occurred.disconnect()
                    except:
                        pass
                    old_worker.stop()
                    if not old_worker.wait(200):
                        old_worker.terminate()
                        old_worker.wait(100)
                    old_worker.deleteLater()
            except RuntimeError:
                pass
            except Exception as e:
                logger.warning(f"停止旧worker时出错: {str(e)}")
            finally:
                if connection_id in self.main_window.database_list_workers:
                    del self.main_window.database_list_workers[connection_id]
        
        # 创建并启动数据库列表工作线程
        from src.gui.workers.database_list_worker import DatabaseListWorker
        worker = DatabaseListWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection.db_type
        )
        
        worker.connection_item = connection_item
        worker.connection_id = connection_id
        
        # 连接信号（静默更新）
        worker.databases_ready.connect(
            lambda databases: self._on_databases_refreshed(connection_item, connection_id, databases),
            Qt.ConnectionType.QueuedConnection
        )
        worker.error_occurred.connect(
            lambda error: logger.warning(f"后台刷新数据库列表失败: {error}"),
            Qt.ConnectionType.QueuedConnection
        )
        
        self.main_window.database_list_workers[connection_id] = worker
        worker.start()
        logger.debug(f"启动后台刷新连接 {connection_id} 的数据库列表")
    
    def _on_databases_refreshed(self, connection_item: QTreeWidgetItem, connection_id: str, databases: List[str]):
        """后台刷新数据库列表完成（静默更新）"""
        try:
            if not connection_item or not hasattr(connection_item, 'text'):
                return
        except RuntimeError:
            return
        
        # 保存到缓存
        self.tree_cache.set_databases(connection_id, databases)
        logger.debug(f"后台刷新完成，已更新缓存: {len(databases)} 个数据库")
        
        # 获取当前已有的数据库项
        existing_databases = {}
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            if child_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(child)
                if db_name:
                    existing_databases[db_name] = child
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        
        # 添加新增的数据库
        for db_name in sorted(databases):
            if db_name not in existing_databases:
                logger.debug(f"发现新数据库: {db_name}")
                db_item = QTreeWidgetItem(connection_item)
                db_item.setText(0, db_name)
                TreeItemData.set_item_type_and_data(db_item, TreeItemType.DATABASE, db_name)
                db_item.setIcon(0, get_database_icon_simple(18))
                db_item.setToolTip(0, f"数据库: {db_name}\n双击展开表列表")
                
                if connection and connection.database == db_name:
                    font = db_item.font(0)
                    font.setBold(True)
                    db_item.setFont(0, font)
                
                # 后台刷新新数据库的表列表
                QTimer.singleShot(200, lambda item=db_item: self._async_refresh_tables(item, connection_id, db_name))
        
        # 移除已删除的数据库
        for db_name, db_item in existing_databases.items():
            if db_name not in databases:
                logger.debug(f"数据库已删除: {db_name}")
                try:
                    connection_item.removeChild(db_item)
                except (RuntimeError, AttributeError):
                    pass
        
        # 清理worker
        if connection_id in self.main_window.database_list_workers:
            try:
                worker = self.main_window.database_list_workers[connection_id]
                if worker:
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    worker.deleteLater()
                del self.main_window.database_list_workers[connection_id]
            except RuntimeError:
                pass
    
    def _async_refresh_tables(self, db_item: QTreeWidgetItem, connection_id: str, database: str):
        """后台异步刷新表列表（无感更新）"""
        # 检查是否已有表分类项
        tables_category = None
        for i in range(db_item.childCount()):
            child = db_item.child(i)
            if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                tables_category = child
                break
        
        if not tables_category:
            # 如果没有表分类项，说明还没展开过，不需要刷新
            return
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        # 停止之前的表列表工作线程（如果存在）
        if self.main_window.table_list_worker_for_tree:
            try:
                if self.main_window.table_list_worker_for_tree.isRunning():
                    try:
                        self.main_window.table_list_worker_for_tree.tables_ready.disconnect()
                        self.main_window.table_list_worker_for_tree.error_occurred.disconnect()
                    except:
                        pass
                    self.main_window.table_list_worker_for_tree.stop()
                    if not self.main_window.table_list_worker_for_tree.wait(200):
                        self.main_window.table_list_worker_for_tree.terminate()
                        self.main_window.table_list_worker_for_tree.wait(100)
                    self.main_window.table_list_worker_for_tree.deleteLater()
            except RuntimeError:
                pass
            except Exception as e:
                logger.warning(f"停止旧表列表worker时出错: {str(e)}")
            finally:
                self.main_window.table_list_worker_for_tree = None
        
        # 创建并启动表列表工作线程
        from src.gui.workers.table_list_worker_for_tree import TableListWorkerForTree
        self.main_window.table_list_worker_for_tree = TableListWorkerForTree(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection.db_type,
            database
        )
        
        self.main_window.table_list_worker_for_tree.db_item = db_item
        self.main_window.table_list_worker_for_tree.connection_id = connection_id
        self.main_window.table_list_worker_for_tree.database = database
        
        # 连接信号（静默更新）
        self.main_window.table_list_worker_for_tree.tables_ready.connect(
            lambda tables: self._on_tables_refreshed(db_item, tables_category, connection_id, database, tables)
        )
        self.main_window.table_list_worker_for_tree.error_occurred.connect(
            lambda error: logger.warning(f"后台刷新表列表失败: {error}")
        )
        
        self.main_window.table_list_worker_for_tree.start()
        logger.debug(f"启动后台刷新数据库 {database} 的表列表")
    
    def _on_tables_refreshed(self, db_item: QTreeWidgetItem, tables_category: QTreeWidgetItem, 
                            connection_id: str, database: str, tables: List[str]):
        """后台刷新表列表完成（静默更新）"""
        try:
            if not db_item or not tables_category:
                return
        except RuntimeError:
            return
        
        # 保存到缓存
        self.tree_cache.set_tables(connection_id, database, tables)
        logger.debug(f"后台刷新完成，已更新缓存: 数据库 {database} 的 {len(tables)} 个表")
        
        # 获取当前已有的表项
        existing_tables = {}
        for i in range(tables_category.childCount()):
            child = tables_category.child(i)
            child_type = TreeItemData.get_item_type(child)
            if child_type == TreeItemType.TABLE:
                data = TreeItemData.get_item_data(child)
                if data and isinstance(data, tuple) and len(data) >= 2:
                    table_name = data[1]
                    existing_tables[table_name] = child
        
        # 添加新增的表
        for table_name in sorted(tables):
            if table_name not in existing_tables:
                logger.debug(f"发现新表: {table_name}")
                table_item = QTreeWidgetItem(tables_category)
                table_item.setText(0, table_name)
                TreeItemData.set_item_type_and_data(table_item, TreeItemType.TABLE, (database, table_name))
                table_item.setToolTip(0, f"表: {database}.{table_name}\n双击或单击查询前100条数据")
                table_item.setIcon(0, get_table_icon(16))
                table_item.setFlags(
                    Qt.ItemFlag.ItemIsEnabled
                    | Qt.ItemFlag.ItemIsSelectable
                )
        
        # 移除已删除的表
        for table_name, table_item in existing_tables.items():
            if table_name not in tables:
                logger.debug(f"表已删除: {table_name}")
                try:
                    tables_category.removeChild(table_item)
                except (RuntimeError, AttributeError):
                    pass

