"""
右键菜单处理器
"""
from PyQt6.QtWidgets import QMenu, QTreeWidgetItem
from PyQt6.QtCore import QPoint
from typing import TYPE_CHECKING
import logging

from src.gui.utils.tree_item_types import TreeItemType, TreeItemData

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class MenuHandler:
    """右键菜单处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def show_connection_menu(self, position: QPoint):
        """显示连接右键菜单"""
        item = self.main_window.connection_tree.itemAt(position)
        if not item:
            return
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和分类项
        if item_type in (TreeItemType.ROOT, TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        menu = QMenu(self.main_window)
        
        # 根据节点类型显示不同的菜单
        if item_type == TreeItemType.TABLE:
            # 表项的右键菜单
            table_info = TreeItemData.get_table_info(item)
            if table_info:
                database, table_name = table_info
                edit_table_action = menu.addAction("编辑表结构")
                edit_table_action.triggered.connect(lambda: self.main_window.table_structure_handler.edit_table_structure(connection_id, database, table_name))
                
                menu.addSeparator()
                
                copy_structure_action = menu.addAction("复制结构")
                copy_structure_action.triggered.connect(lambda: self.main_window.table_structure_handler.copy_table_structure(connection_id, database, table_name))
                
                menu.addSeparator()
                
                # 刷新该数据库下的所有表
                refresh_action = menu.addAction("🔄 刷新")
                refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_database_tables(connection_id, database))
        elif item_type == TreeItemType.DATABASE:
            # 数据库项的右键菜单
            database = TreeItemData.get_item_data(item)
            if database:
                refresh_action = menu.addAction("🔄 刷新")
                refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_database_tables(connection_id, database))
        else:
            # 连接项的右键菜单
            edit_action = menu.addAction("编辑")
            edit_action.triggered.connect(lambda: self.main_window.connection_handler.edit_connection(connection_id))
            
            test_action = menu.addAction("测试连接")
            test_action.triggered.connect(lambda: self.main_window.connection_handler.test_connection(connection_id))
            
            menu.addSeparator()
            
            refresh_action = menu.addAction("🔄 刷新")
            refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_connection_databases(connection_id, item))
            
            menu.addSeparator()
            
            remove_action = menu.addAction("删除")
            remove_action.triggered.connect(lambda: self.main_window.connection_handler.remove_connection(connection_id))
        
        menu.exec(self.main_window.connection_tree.mapToGlobal(position))

