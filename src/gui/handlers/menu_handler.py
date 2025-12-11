"""
右键菜单处理器
"""
from PyQt6.QtWidgets import QMenu, QTreeWidgetItem
from PyQt6.QtCore import QPoint
from PyQt6.QtGui import QIcon, QAction
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
    
    def _get_icon(self, icon_type: str) -> QIcon:
        """获取图标
        
        Args:
            icon_type: 图标类型
            
        Returns:
            QIcon: 图标对象
        """
        style = self.main_window.style()
        
        # 定义图标映射
        icon_map = {
            'query': style.standardIcon(style.StandardPixmap.SP_FileDialogContentsView),
            'edit': style.standardIcon(style.StandardPixmap.SP_FileDialogDetailedView),
            'copy': style.standardIcon(style.StandardPixmap.SP_FileDialogListView),
            'refresh': style.standardIcon(style.StandardPixmap.SP_BrowserReload),
            'create': style.standardIcon(style.StandardPixmap.SP_FileDialogNewFolder),
            'delete': style.standardIcon(style.StandardPixmap.SP_TrashIcon),
            'test': style.standardIcon(style.StandardPixmap.SP_DialogApplyButton),
            'database': style.standardIcon(style.StandardPixmap.SP_DirIcon),
        }
        
        return icon_map.get(icon_type, QIcon())
    
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
                # 在新标签页中查询
                query_new_tab_action = QAction(self._get_icon('query'), "在新标签页中查询", self.main_window)
                query_new_tab_action.triggered.connect(lambda: self.main_window.query_table_data_in_new_tab(connection_id, table_name, database))
                menu.addAction(query_new_tab_action)
                
                menu.addSeparator()
                
                edit_table_action = QAction(self._get_icon('edit'), "编辑表结构", self.main_window)
                edit_table_action.triggered.connect(lambda: self.main_window.table_structure_handler.edit_table_structure(connection_id, database, table_name))
                menu.addAction(edit_table_action)
                
                menu.addSeparator()
                
                copy_structure_action = QAction(self._get_icon('copy'), "复制结构", self.main_window)
                copy_structure_action.triggered.connect(lambda: self.main_window.table_structure_handler.copy_table_structure(connection_id, database, table_name))
                menu.addAction(copy_structure_action)
                
                menu.addSeparator()
                
                # 刷新该数据库下的所有表
                refresh_action = QAction(self._get_icon('refresh'), "刷新", self.main_window)
                refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_database_tables(connection_id, database))
                menu.addAction(refresh_action)
        elif item_type == TreeItemType.DATABASE:
            # 数据库项的右键菜单
            database = TreeItemData.get_item_data(item)
            if database:
                # 新建表
                create_table_action = QAction(self._get_icon('create'), "新建表", self.main_window)
                create_table_action.triggered.connect(lambda: self.main_window.create_table_in_database(connection_id, database))
                menu.addAction(create_table_action)
                
                menu.addSeparator()
                
                # 删除数据库
                delete_db_action = QAction(self._get_icon('delete'), "删除数据库", self.main_window)
                delete_db_action.triggered.connect(lambda: self.main_window.delete_database(connection_id, database, item))
                menu.addAction(delete_db_action)
                
                menu.addSeparator()
                
                refresh_action = QAction(self._get_icon('refresh'), "刷新", self.main_window)
                refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_database_tables(connection_id, database))
                menu.addAction(refresh_action)
        else:
            # 连接项的右键菜单
            edit_action = QAction(self._get_icon('edit'), "编辑", self.main_window)
            edit_action.triggered.connect(lambda: self.main_window.connection_handler.edit_connection(connection_id))
            menu.addAction(edit_action)
            
            test_action = QAction(self._get_icon('test'), "测试连接", self.main_window)
            test_action.triggered.connect(lambda: self.main_window.connection_handler.test_connection(connection_id))
            menu.addAction(test_action)
            
            menu.addSeparator()
            
            # 新建数据库
            create_db_action = QAction(self._get_icon('database'), "新建数据库", self.main_window)
            create_db_action.triggered.connect(lambda: self.main_window.create_database(connection_id, item))
            menu.addAction(create_db_action)
            
            menu.addSeparator()
            
            refresh_action = QAction(self._get_icon('refresh'), "刷新", self.main_window)
            refresh_action.triggered.connect(lambda: self.main_window.tree_data_handler.refresh_connection_databases(connection_id, item))
            menu.addAction(refresh_action)
            
            menu.addSeparator()
            
            remove_action = QAction(self._get_icon('delete'), "删除", self.main_window)
            remove_action.triggered.connect(lambda: self.main_window.connection_handler.remove_connection(connection_id))
            menu.addAction(remove_action)
        
        menu.exec(self.main_window.connection_tree.mapToGlobal(position))

