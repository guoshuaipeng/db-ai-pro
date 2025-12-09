"""
预加载处理器
"""
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QTreeWidgetItem
from typing import List, TYPE_CHECKING
import logging

from src.gui.utils.tree_item_types import TreeItemType, TreeItemData
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
    
    def start_preload(self):
        """启动预加载所有连接的表"""
        connections = self.main_window.db_manager.get_all_connections()
        if not connections:
            return
        
        # 如果已有预加载线程在运行，先停止
        if self.main_window.preload_worker and self.main_window.preload_worker.isRunning():
            self.main_window.preload_worker.stop()
            self.main_window.preload_worker.wait(1000)
            if self.main_window.preload_worker.isRunning():
                self.main_window.preload_worker.terminate()
                self.main_window.preload_worker.wait(500)
        
        # 创建并启动预加载线程
        from src.gui.workers.preload_worker import PreloadWorker
        self.main_window.preload_worker = PreloadWorker(self.main_window.db_manager)
        
        # 连接信号
        self.main_window.preload_worker.connection_loaded.connect(self.on_preload_connection_loaded)
        self.main_window.preload_worker.progress.connect(self.on_preload_progress)
        self.main_window.preload_worker.finished_all.connect(self.on_preload_finished)
        
        # 启动线程
        self.main_window.preload_worker.start()
        logger.info("开始后台预加载所有连接的表...")
    
    def on_preload_connection_loaded(self, connection_id: str, database: str, tables: List[str]):
        """预加载完成一个数据库的回调"""
        # 使用QTimer延迟执行，避免在信号回调中直接修改UI导致dataChanged警告
        def update_tree():
            try:
                # 找到对应的连接项和数据库项
                connection_item = None
                for i in range(self.main_window.connection_tree.topLevelItemCount()):
                    item = self.main_window.connection_tree.topLevelItem(i)
                    if item and item.data(0, Qt.ItemDataRole.UserRole) == connection_id:
                        connection_item = item
                        break
                
                if not connection_item:
                    return
                
                # 找到对应的数据库项
                db_item = None
                for i in range(connection_item.childCount()):
                    child = connection_item.child(i)
                    if child and child.data(0, Qt.ItemDataRole.UserRole) == database:
                        db_item = child
                        break
                
                if not db_item:
                    # 如果数据库项不存在，说明还没展开过，先创建它
                    db_item = QTreeWidgetItem(connection_item)
                    # 使用简约的绿色数据库图标
                    db_icon = get_database_icon_simple(18)
                    db_item.setIcon(0, db_icon)
                    db_item.setText(0, database)
                    db_item.setData(0, Qt.ItemDataRole.UserRole, database)
                    db_item.setToolTip(0, f"数据库: {database}\n双击展开查看表")
                
                # 检查是否已经加载过表（查找"表"分类）
                tables_category = None
                has_tables = False
                for i in range(db_item.childCount()):
                    child = db_item.child(i)
                    if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                        tables_category = child
                        # 检查"表"分类下是否有表项
                        for j in range(tables_category.childCount()):
                            table_child = tables_category.child(j)
                            if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                has_tables = True
                                break
                        break
                
                # 如果已经加载过，跳过（避免重复）
                if has_tables:
                    return
                
                # 如果没有"表"分类，创建它
                if not tables_category:
                    tables_category = QTreeWidgetItem(db_item)
                    tables_category.setText(0, "表")
                    TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
                    tables_category.setIcon(0, get_category_icon("表", 16))
                    # 允许显示和展开，但不允许选中（子项仍然可以选中）
                    tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
                
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
                
                logger.debug(f"预加载完成: {connection_id} -> {database} ({len(tables)} 个表)")
            except RuntimeError:
                # 树结构已改变，忽略
                pass
            except Exception as e:
                logger.warning(f"预加载更新树时出错: {str(e)}")
        
        QTimer.singleShot(1, update_tree)
    
    def on_preload_progress(self, message: str):
        """预加载进度更新"""
        # 在状态栏显示进度（可选，避免太频繁更新）
        logger.debug(f"预加载进度: {message}")
    
    def on_preload_finished(self):
        """预加载全部完成"""
        logger.info("所有连接的表预加载完成")
        self.main_window.statusBar().showMessage("预加载完成", 3000)  # 显示3秒

