"""
预加载处理器
"""
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QTreeWidgetItem
from typing import List, TYPE_CHECKING
import logging

from src.gui.utils.tree_item_types import TreeItemType, TreeItemData
from src.core.database_connection import DatabaseType
from src.utils.ui_helpers import (
    get_database_icon_simple,
    get_category_icon,
    get_table_icon,
)

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class PreloadHandler:
    """预加载处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
        from src.core.tree_cache import TreeCache
        self.tree_cache = TreeCache()
    
    def start_preload(self):
        """启动预加载（在后台线程中加载所有数据库和表列表）"""
        # 检查是否已经有预加载worker在运行
        if hasattr(self.main_window, 'preload_worker') and self.main_window.preload_worker:
            if self.main_window.preload_worker.isRunning():
                logger.info("预加载已经在进行中，跳过")
                return
            else:
                # 清理旧的worker
                try:
                    self.main_window.preload_worker.deleteLater()
                except:
                    pass
                self.main_window.preload_worker = None
        
        # 创建预加载worker
        from src.gui.workers.preload_worker import PreloadWorker
        worker = PreloadWorker(self.main_window.db_manager)
        
        # 连接信号
        worker.databases_loaded.connect(self.on_preload_databases_loaded)
        worker.connection_loaded.connect(self.on_preload_connection_loaded)
        worker.progress.connect(self.on_preload_progress)
        worker.finished_all.connect(self.on_preload_finished)
        worker.finished.connect(lambda: self._cleanup_preload_worker(worker))
        
        # 保存worker引用
        self.main_window.preload_worker = worker
        
        # 启动worker（在后台线程中执行）
        logger.info("开始预加载所有连接的数据库和表列表")
        worker.start()
    
    def on_preload_databases_loaded(self, connection_id: str, databases: List[str]):
        """预加载获取到数据库列表的回调 - 保存到缓存并更新UI"""
        # 保存到缓存
        try:
            self.tree_cache.set_databases(connection_id, databases)
            logger.info(f"✅ [PreloadHandler] 已缓存连接的数据库列表: {connection_id} ({len(databases)} 个数据库)")
        except Exception as e:
            logger.error(f"❌ [PreloadHandler] 保存数据库列表缓存失败: {e}")
        
        # 更新UI：添加数据库项到树视图
        def update_tree():
            # 检查窗口是否正在关闭
            if hasattr(self.main_window, '_is_closing') and self.main_window._is_closing:
                return
            
            try:
                # 找到根节点（"我的连接"）
                root_item = None
                if self.main_window.connection_tree.topLevelItemCount() > 0:
                    root_item = self.main_window.connection_tree.topLevelItem(0)
                
                if not root_item:
                    return
                
                # 在根节点的子节点中查找连接项
                connection_item = None
                for i in range(root_item.childCount()):
                    child = root_item.child(i)
                    if not child:
                        continue
                    
                    # 使用 TreeItemData 获取连接ID
                    child_connection_id = TreeItemData.get_item_data(child)
                    child_type = TreeItemData.get_item_type(child)
                    
                    if child_type == TreeItemType.CONNECTION and child_connection_id == connection_id:
                        connection_item = child
                        break
                
                if not connection_item:
                    logger.debug(f"连接项未找到: {connection_id}")
                    return
                
                # 检查已存在的数据库项，避免重复添加
                existing_databases = set()
                for i in range(connection_item.childCount()):
                    child = connection_item.child(i)
                    if not child:
                        continue
                    child_type = TreeItemData.get_item_type(child)
                    if child_type == TreeItemType.DATABASE:
                        db_name = TreeItemData.get_item_data(child)
                        if db_name and isinstance(db_name, str):
                            existing_databases.add(db_name)
                
                # 获取连接信息
                connection = self.main_window.db_manager.get_connection(connection_id)
                
                # 添加数据库项（排序），只添加不存在的
                # 对于 Redis 连接，按数字排序；其他数据库按字母顺序排序
                if connection and connection.db_type == DatabaseType.REDIS:
                    # Redis 数据库按数字排序
                    sorted_databases = sorted(databases, key=lambda x: int(x) if x.isdigit() else float('inf'))
                else:
                    # 其他数据库按字母顺序排序
                    sorted_databases = sorted(databases)
                
                for db_name in sorted_databases:
                    # 如果已存在，跳过
                    if db_name in existing_databases:
                        continue
                    
                    db_item = QTreeWidgetItem(connection_item)
                    db_item.setText(0, db_name)
                    # 使用简约的绿色数据库图标
                    db_icon = get_database_icon_simple(18)
                    db_item.setIcon(0, db_icon)
                    # 使用 TreeItemData 设置数据
                    TreeItemData.set_item_type_and_data(db_item, TreeItemType.DATABASE, db_name)
                    db_item.setToolTip(0, f"数据库: {db_name}\n双击展开查看表")
                    
                    # 如果是当前连接的数据库，标记为已选中
                    if connection and connection.database == db_name:
                        font = db_item.font(0)
                        font.setBold(True)
                        db_item.setFont(0, font)
                    
                    # 尝试从缓存加载表列表（如果已经预加载）
                    self._load_tables_from_cache_for_preload(db_item, connection_id, db_name)
                
                # 如果是 Redis 连接，查询每个数据库的 key 数量并更新显示
                if connection and connection.db_type == DatabaseType.REDIS:
                    logger.debug(f"✅ 预加载 Redis 数据库，启动 key 数量查询")
                    tree_data_handler = self.main_window.tree_data_handler
                    tree_data_handler._query_redis_dbsizes(connection_item, connection_id, connection, databases)
                
            except RuntimeError:
                # 树结构已改变，忽略
                pass
            except Exception as e:
                logger.warning(f"预加载更新数据库树时出错: {str(e)}")
        
        QTimer.singleShot(0, update_tree)
    
    def _cleanup_preload_worker(self, worker):
        """清理预加载worker"""
        try:
            if worker and worker == self.main_window.preload_worker:
                self.main_window.preload_worker = None
        except:
            pass
    
    def _load_tables_from_cache_for_preload(self, db_item: QTreeWidgetItem, connection_id: str, database: str):
        """从缓存加载表列表（用于预加载时）"""
        try:
            cached_tables = self.tree_cache.get_tables(connection_id, database)
            if cached_tables is None:
                return  # 还没有缓存
            
            # 检查是否为 Redis 数据库
            connection = self.main_window.db_manager.get_connection(connection_id)
            is_redis = connection and connection.db_type == DatabaseType.REDIS
            
            # Redis 数据库特殊处理
            if is_redis:
                # 创建"表"分类项
                tables_category = QTreeWidgetItem(db_item)
                tables_category.setText(0, "表")
                TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
                tables_category.setIcon(0, get_category_icon("表", 16))
                tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
                
                # 创建"所有数据"节点
                all_data_item = QTreeWidgetItem(tables_category)
                all_data_item.setText(0, "所有数据")
                TreeItemData.set_item_type_and_data(all_data_item, TreeItemType.REDIS_ALL_DATA, database)
                all_data_item.setIcon(0, get_table_icon(16))
                all_data_item.setToolTip(0, f"Redis 数据库: {database}\n点击查询前100条数据")
                all_data_item.setFlags(
                    Qt.ItemFlag.ItemIsEnabled
                    | Qt.ItemFlag.ItemIsSelectable
                )
                return
            
            # 非 Redis 数据库：添加表项
            if not cached_tables:
                return  # 没有表，不创建"表"分类
            
            # 创建"表"分类项
            tables_category = QTreeWidgetItem(db_item)
            tables_category.setText(0, "表")
            TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
            tables_category.setIcon(0, get_category_icon("表", 16))
            tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
            
            # 添加表项（按字母顺序排序）
            for table_name in sorted(cached_tables):
                table_item = QTreeWidgetItem(tables_category)
                table_item.setText(0, table_name)
                # 设置节点类型和数据（表项）
                TreeItemData.set_item_type_and_data(table_item, TreeItemType.TABLE, (database, table_name))
                table_item.setToolTip(0, f"表: {database}.{table_name}\n双击或单击查询前100条数据")
                table_item.setIcon(0, get_table_icon(16))
                # 确保表项本身是可选中的
                table_item.setFlags(
                    Qt.ItemFlag.ItemIsEnabled
                    | Qt.ItemFlag.ItemIsSelectable
                )
        except Exception as e:
            logger.warning(f"从缓存加载表列表失败: {str(e)}")
    
    def on_preload_connection_loaded(self, connection_id: str, database: str, tables: List[str]):
        """预加载完成一个数据库的回调 - 保存到缓存并更新UI"""
        # 保存到缓存
        try:
            self.tree_cache.set_tables(connection_id, database, tables)
            logger.debug(f"✅ [PreloadHandler] 已缓存表列表: {connection_id}.{database} ({len(tables)} 个表)")
        except Exception as e:
            logger.error(f"❌ [PreloadHandler] 保存表列表缓存失败: {e}")
        
        # 更新UI：找到对应的数据库项，添加表项
        def update_tree():
            # 检查窗口是否正在关闭
            if hasattr(self.main_window, '_is_closing') and self.main_window._is_closing:
                return
            
            try:
                # 找到根节点（"我的连接"）
                root_item = None
                if self.main_window.connection_tree.topLevelItemCount() > 0:
                    root_item = self.main_window.connection_tree.topLevelItem(0)
                
                if not root_item:
                    return
                
                # 在根节点的子节点中查找连接项
                connection_item = None
                for i in range(root_item.childCount()):
                    child = root_item.child(i)
                    if not child:
                        continue
                    
                    # 使用 TreeItemData 获取连接ID
                    child_connection_id = TreeItemData.get_item_data(child)
                    child_type = TreeItemData.get_item_type(child)
                    
                    if child_type == TreeItemType.CONNECTION and child_connection_id == connection_id:
                        connection_item = child
                        break
                
                if not connection_item:
                    return
                
                # 找到对应的数据库项
                db_item = None
                for i in range(connection_item.childCount()):
                    child = connection_item.child(i)
                    if not child:
                        continue
                    child_type = TreeItemData.get_item_type(child)
                    child_data = TreeItemData.get_item_data(child)
                    if child_type == TreeItemType.DATABASE and child_data == database:
                        db_item = child
                        break
                
                if not db_item:
                    # 如果数据库项不存在，说明可能数据库列表还没加载完成
                    # 这种情况下，表列表会在数据库项创建后自动从缓存加载
                    return
                
                # 检查是否已经加载过表（查找"表"分类）
                has_tables_category = False
                for i in range(db_item.childCount()):
                    child = db_item.child(i)
                    if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                        has_tables_category = True
                        break
                
                # 如果已经有"表"分类，跳过（避免重复添加）
                if has_tables_category:
                    return
                
                # 从缓存加载表列表（这会创建表项）
                self._load_tables_from_cache_for_preload(db_item, connection_id, database)
                
            except RuntimeError:
                # 树结构已改变，忽略
                pass
            except Exception as e:
                logger.warning(f"预加载更新表树时出错: {str(e)}")
        
        QTimer.singleShot(0, update_tree)
    
    def on_preload_progress(self, message: str):
        """预加载进度更新"""
        # 在状态栏显示进度（可选，避免太频繁更新）
        logger.debug(f"预加载进度: {message}")
    
    def on_preload_finished(self):
        """预加载全部完成"""
        logger.info("所有连接的表预加载完成")
        self.main_window.statusBar().showMessage("预加载完成", 3000)  # 显示3秒

