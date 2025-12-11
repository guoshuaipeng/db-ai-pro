"""
树视图事件处理器
"""
from PyQt6.QtWidgets import QTreeWidgetItem
from PyQt6.QtCore import Qt, QTimer
from typing import TYPE_CHECKING, Optional
import logging

from src.gui.utils.tree_item_types import TreeItemType, TreeItemData

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class TreeHandler:
    """树视图事件处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def on_item_expanded(self, item: QTreeWidgetItem):
        """项目展开时（在UI线程中执行，确保快速返回）"""
        import time
        logger.info(f"[UI线程] on_item_expanded 开始: {item.text(0)}")
        start_time = time.time()
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和其他不需要处理的节点类型
        if item_type == TreeItemType.ROOT:
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保展开事件处理函数快速返回
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            self.main_window.load_databases_for_connection(item, connection_id, force_reload=False)
        elif item_type == TreeItemType.DATABASE:
            # 展开数据库项，加载表列表（延迟执行，避免阻塞）
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                def load_tables():
                    self.main_window.load_tables_for_database(item, connection_id, database, force_reload=False)
                    # 如果表已经加载，自动展开"表"分类
                    for i in range(item.childCount()):
                        child = item.child(i)
                        if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY and child.childCount() > 0:
                            # 检查是否有表项（不是"加载中..."或"无表"）
                            has_tables = False
                            for j in range(child.childCount()):
                                table_child = child.child(j)
                                if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                    has_tables = True
                                    break
                            if has_tables:
                                child.setExpanded(True)
                            break
                QTimer.singleShot(1, load_tables)
    
    def on_item_collapsed(self, item: QTreeWidgetItem):
        """项目折叠时"""
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 如果折叠的是数据库项，检查是否有正在加载的表，如果有则停止加载并清理
        if item_type == TreeItemType.DATABASE:
            # 检查"表"分类下是否有"加载中..."项
            for i in range(item.childCount()):
                child = item.child(i)
                if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                    # 检查"表"分类下是否有"加载中..."项
                    for j in range(child.childCount() - 1, -1, -1):
                        table_child = child.child(j)
                        if TreeItemData.get_item_type(table_child) == TreeItemType.LOADING:
                                # 停止加载线程（如果正在运行）
                                if self.main_window.table_list_worker_for_tree and self.main_window.table_list_worker_for_tree.isRunning():
                                    # 检查是否是当前数据库的加载
                                    if (hasattr(self.main_window.table_list_worker_for_tree, 'db_item') and 
                                        self.main_window.table_list_worker_for_tree.db_item == item):
                                        try:
                                            # 断开信号连接
                                            try:
                                                self.main_window.table_list_worker_for_tree.tables_ready.disconnect()
                                                self.main_window.table_list_worker_for_tree.error_occurred.disconnect()
                                            except:
                                                pass
                                            # 请求停止
                                            self.main_window.table_list_worker_for_tree.stop()
                                            # 等待停止（最多200ms，避免阻塞太久）
                                            if not self.main_window.table_list_worker_for_tree.wait(200):
                                                self.main_window.table_list_worker_for_tree.terminate()
                                                self.main_window.table_list_worker_for_tree.wait(100)
                                            self.main_window.table_list_worker_for_tree.deleteLater()
                                        except Exception as e:
                                            logger.warning(f"停止表列表worker时出错: {str(e)}")
                                        finally:
                                            self.main_window.table_list_worker_for_tree = None
                                # 移除"加载中..."项
                                try:
                                    child.removeChild(table_child)
                                except:
                                    pass
                        break
    
    def on_item_double_clicked(self, item: QTreeWidgetItem, column: int):
        """双击项目（在UI线程中执行，确保快速返回，不阻塞）"""
        import time
        import threading
        logger.info(f"[UI线程] on_item_double_clicked 开始: {item.text(0)}, 线程: {threading.current_thread().name}")
        start_time = time.time()
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和其他不需要处理的节点类型
        if item_type == TreeItemType.ROOT or item_type in (TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保双击事件处理函数快速返回
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            # 双击连接项本身，切换展开状态（这个操作很快，可以直接执行）
            logger.info(f"[UI线程] on_item_double_clicked 双击连接项本身，切换展开状态: {item.text(0)}")
            if item.isExpanded():
                item.setExpanded(False)
            else:
                item.setExpanded(True)
                # 展开时会自动触发 on_item_expanded，加载数据库列表（已经在on_item_expanded中使用延迟执行）
        elif item_type == TreeItemType.DATABASE:
            # 双击数据库项，切换展开状态，并切换到该数据库
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                # 切换到该连接和数据库（使用延迟执行，避免阻塞）
                def switch_and_expand():
                    self.main_window.set_current_connection(connection_id, database=database, from_combo=True)
                    # 如果表已经加载，自动展开"表"分类
                    for i in range(item.childCount()):
                        child = item.child(i)
                        if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                            child.setExpanded(True)
                            break
                QTimer.singleShot(1, switch_and_expand)
            
            # 切换展开状态（这个操作很快，可以直接执行）
            if item.isExpanded():
                item.setExpanded(False)
            else:
                item.setExpanded(True)
                # 展开时会自动触发 on_item_expanded，加载表列表（已经在on_item_expanded中使用延迟执行）
        elif item_type == TreeItemType.TABLE:
            # 双击表项，查询表数据
            table_info = TreeItemData.get_table_info(item)
            if table_info:
                database, table_name = table_info
                # 查询表数据（使用延迟执行，避免阻塞）
                def query_data():
                    # 先切换到该连接和数据库
                    self.main_window.set_current_connection(connection_id, database=database, from_combo=True)
                    # 然后查询表数据
                    self.main_window.query_handler.query_table_data(connection_id, table_name, database)
                QTimer.singleShot(1, query_data)
    
    def on_item_clicked(self, item: QTreeWidgetItem, column: int):
        """单击项目（在UI线程中执行，确保快速返回，不阻塞）"""
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和分类项
        if item_type in (TreeItemType.ROOT, TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保点击事件处理函数快速返回
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            # 点击连接项，切换到该连接（使用延迟执行）
            # 点击连接时，数据库设置为 None（显示"全部数据库"）
            def switch_connection():
                self.main_window.set_current_connection(connection_id, database=None, from_combo=True)
            QTimer.singleShot(1, switch_connection)
        elif item_type == TreeItemType.DATABASE:
            # 点击数据库项，切换到该连接和数据库（使用延迟执行）
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                def switch_database():
                    self.main_window.set_current_connection(connection_id, database=database, from_combo=True)
                QTimer.singleShot(1, switch_database)
            
            # 单击时不自动展开，让用户通过双击或点击展开按钮来控制展开/折叠
            # 如果数据库项已经展开，且表已经加载，则展开"表"分类（这个操作很快，可以直接执行）
            if item.isExpanded():
                for i in range(item.childCount()):
                    child = item.child(i)
                    if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                        # 检查是否有表项（不是"加载中..."或"无表"）
                        has_tables = False
                        for j in range(child.childCount()):
                            table_child = child.child(j)
                            if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                has_tables = True
                                break
                        if has_tables:
                            child.setExpanded(True)
                        break
        elif item_type == TreeItemType.TABLE:
            # 单击表项，什么都不做
            # 只有双击才切换连接/数据库并查询数据
            pass

