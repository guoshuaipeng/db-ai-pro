"""
树节点类型工具
用于管理和识别连接树中不同类型的节点
"""
from enum import Enum
from typing import Optional, Tuple, Dict, Any
from PyQt6.QtWidgets import QTreeWidgetItem
from PyQt6.QtCore import Qt


class TreeItemType(Enum):
    """树节点类型枚举"""
    ROOT = "root"  # 根节点："我的连接"
    CONNECTION = "connection"  # 连接项
    DATABASE = "database"  # 数据库项
    TABLE_CATEGORY = "table_category"  # "表"分类项
    TABLE = "table"  # 表项
    LOADING = "loading"  # "加载中..."项
    ERROR = "error"  # 错误项
    EMPTY = "empty"  # "无数据库"、"无表"等空项


class TreeItemData:
    """树节点数据容器"""
    TYPE_KEY = "item_type"  # 类型存储键
    DATA_KEY = "item_data"  # 数据存储键
    
    @staticmethod
    def set_item_type_and_data(item: QTreeWidgetItem, item_type: TreeItemType, data: Any = None):
        """
        设置树节点的类型和数据
        
        Args:
            item: 树节点
            item_type: 节点类型
            data: 节点数据
                - CONNECTION: connection_id (str)
                - DATABASE: database_name (str)
                - TABLE: (database_name, table_name) (Tuple[str, str])
                - 其他类型: None
        """
        # 使用两个不同的Role来存储类型和数据，避免混淆
        # UserRole存储类型
        item.setData(0, Qt.ItemDataRole.UserRole, {
            TreeItemData.TYPE_KEY: item_type.value,
            TreeItemData.DATA_KEY: data
        })
    
    @staticmethod
    def get_item_type(item: QTreeWidgetItem) -> Optional[TreeItemType]:
        """
        获取树节点的类型
        
        Args:
            item: 树节点
            
        Returns:
            节点类型，如果无法识别则返回None
        """
        if not item:
            return None
        
        # 首先尝试从UserRole获取类型
        role_data = item.data(0, Qt.ItemDataRole.UserRole)
        
        if isinstance(role_data, dict):
            type_value = role_data.get(TreeItemData.TYPE_KEY)
            if type_value:
                try:
                    return TreeItemType(type_value)
                except ValueError:
                    pass
        
        # 向后兼容：根据文本和父节点判断（用于已存在的节点）
        text = item.text(0)
        if text == "我的连接":
            return TreeItemType.ROOT
        elif text == "表":
            return TreeItemType.TABLE_CATEGORY
        elif text == "加载中...":
            return TreeItemType.LOADING
        elif text.startswith("错误"):
            return TreeItemType.ERROR
        elif text in ("无数据库", "无表"):
            return TreeItemType.EMPTY
        
        # 根据UserRole的数据类型判断（向后兼容）
        if isinstance(role_data, str):
            # 可能是连接ID或数据库名，需要通过父节点判断
            parent = item.parent()
            if parent:
                parent_type = TreeItemData.get_item_type(parent)
                if parent_type == TreeItemType.ROOT:
                    return TreeItemType.CONNECTION
                elif parent_type == TreeItemType.CONNECTION:
                    return TreeItemType.DATABASE
        elif isinstance(role_data, tuple) and len(role_data) == 2:
            return TreeItemType.TABLE
        
        return None
    
    @staticmethod
    def get_item_data(item: QTreeWidgetItem) -> Any:
        """
        获取树节点的数据
        
        Args:
            item: 树节点
            
        Returns:
            节点数据：
                - CONNECTION: connection_id (str)
                - DATABASE: database_name (str)
                - TABLE: (database_name, table_name) (Tuple[str, str])
                - 其他类型: None
        """
        if not item:
            return None
        
        role_data = item.data(0, Qt.ItemDataRole.UserRole)
        
        if isinstance(role_data, dict):
            return role_data.get(TreeItemData.DATA_KEY)
        
        # 向后兼容：直接返回UserRole的值
        return role_data
    
    @staticmethod
    def get_connection_id(item: QTreeWidgetItem) -> Optional[str]:
        """
        获取连接ID（从连接项或其子项中）
        
        Args:
            item: 树节点
            
        Returns:
            连接ID，如果找不到则返回None
        """
        # 向上查找连接项
        current = item
        while current:
            item_type = TreeItemData.get_item_type(current)
            if item_type == TreeItemType.CONNECTION:
                return TreeItemData.get_item_data(current)
            current = current.parent()
        return None
    
    @staticmethod
    def get_database_name(item: QTreeWidgetItem) -> Optional[str]:
        """
        获取数据库名（从数据库项或其子项中）
        
        Args:
            item: 树节点
            
        Returns:
            数据库名，如果找不到则返回None
        """
        # 向上查找数据库项
        current = item
        while current:
            item_type = TreeItemData.get_item_type(current)
            if item_type == TreeItemType.DATABASE:
                return TreeItemData.get_item_data(current)
            current = current.parent()
        return None
    
    @staticmethod
    def get_table_info(item: QTreeWidgetItem) -> Optional[Tuple[str, str]]:
        """
        获取表信息（数据库名和表名）
        
        Args:
            item: 表节点
            
        Returns:
            (database_name, table_name) 元组，如果不是表项则返回None
        """
        item_type = TreeItemData.get_item_type(item)
        if item_type == TreeItemType.TABLE:
            return TreeItemData.get_item_data(item)
        return None
    
    @staticmethod
    def is_connection_item(item: QTreeWidgetItem) -> bool:
        """判断是否是连接项"""
        return TreeItemData.get_item_type(item) == TreeItemType.CONNECTION
    
    @staticmethod
    def is_database_item(item: QTreeWidgetItem) -> bool:
        """判断是否是数据库项"""
        return TreeItemData.get_item_type(item) == TreeItemType.DATABASE
    
    @staticmethod
    def is_table_item(item: QTreeWidgetItem) -> bool:
        """判断是否是表项"""
        return TreeItemData.get_item_type(item) == TreeItemType.TABLE

