"""
自定义连接树组件
支持双击展开/折叠功能
使用 QStyledItemDelegate 实现简洁的 hover 效果
"""
from PyQt6.QtWidgets import (
    QTreeWidget,
    QTreeWidgetItem,
    QStyledItemDelegate,
    QAbstractItemView,
)
from PyQt6.QtCore import Qt, QRect, QModelIndex
from PyQt6.QtGui import QMouseEvent, QPainter, QColor, QBrush
from PyQt6.QtWidgets import QStyle
import logging

logger = logging.getLogger(__name__)


class ConnectionTreeDelegate(QStyledItemDelegate):
    """自定义代理，实现 hover 效果"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.hovered_index = None
    
    def set_hovered_index(self, index: QModelIndex):
        """设置当前 hover 的索引"""
        old_index = self.hovered_index
        self.hovered_index = index
        
        # 通知视图更新这两个位置
        if old_index and old_index.isValid():
            self.parent().update(old_index)
        if index and index.isValid():
            self.parent().update(index)
    
    def paint(self, painter: QPainter, option, index: QModelIndex):
        """自定义绘制"""
        # 检查是否是 hover 的项
        is_hover = (index == self.hovered_index and index.isValid())
        is_selected = bool(option.state & QStyle.StateFlag.State_Selected)
        
        # 跳过根节点和分类项，使用默认绘制
        item = None
        try:
            tree_widget = self.parent()
            if tree_widget:
                item = tree_widget.itemFromIndex(index)
                if item:
                    item_text = item.text(0)
                    if item_text == "我的连接" or item_text == "表":
                        super().paint(painter, option, index)
                        return
        except:
            pass
        
        # 悬停和选中样式交给不同的机制：
        # - 选中：显式设置背景和文字颜色，确保表项也能正确显示选中效果
        # - 悬停：这里仅在非选中时设置浅灰背景
        if is_selected:
            # 选中状态：显式设置背景和文字颜色，确保所有层级的项都能正确显示
            option.backgroundBrush = QBrush(QColor("#e3f2fd"))  # 浅蓝色背景
            option.palette.setColor(option.palette.ColorRole.Text, QColor("#1976d2"))  # 深蓝色文字
            # 设置字体加粗（可选）
            font = option.font
            font.setBold(True)
            option.font = font
        elif is_hover:
            # hover 状态：浅灰色背景（未选中时）
            option.backgroundBrush = QBrush(QColor("#f5f5f5"))
        
        # 使用父类方法绘制（会自动处理图标和文本）
        super().paint(painter, option, index)


class ConnectionTree(QTreeWidget):
    """自定义连接树组件，支持双击展开/折叠"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setHeaderLabel("数据库连接")
        self.setMaximumWidth(320)
        self.setMinimumWidth(250)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        
        # 禁用编辑功能
        self.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        
        # 启用鼠标跟踪
        self.setMouseTracking(True)
        
        # 设置层级缩进
        self.setIndentation(8)
        
        # 隐藏标题栏
        self.setHeaderHidden(True)
        
        # 设置根节点装饰
        self.setRootIsDecorated(True)
        self.setItemsExpandable(True)
        
        # 暂时移除自定义代理和样式，使用原生样式测试
        # self.delegate = ConnectionTreeDelegate(self)
        # self.setItemDelegate(self.delegate)
        
        # 暂时移除所有自定义样式，使用原生样式
        # self.setStyleSheet("...")
    
    def mouseDoubleClickEvent(self, event: QMouseEvent):
        """重写双击事件，支持双击展开/折叠"""
        if event.button() == Qt.MouseButton.LeftButton:
            item = self.itemAt(event.position().toPoint())
            if item:
                if item.text(0) == "我的连接" or item.text(0) == "表":
                    super().mouseDoubleClickEvent(event)
                    return
                
                parent = item.parent()
                is_connection_or_db = (
                    (parent and parent.text(0) == "我的连接") or
                    (parent and parent.parent() and parent.parent().text(0) == "我的连接")
                )
                
                if item.childCount() > 0 or is_connection_or_db:
                    item.setExpanded(not item.isExpanded())
                    logger.debug(f"双击{'展开' if item.isExpanded() else '折叠'}: {item.text(0)}")
                    event.accept()
                    return
        
        super().mouseDoubleClickEvent(event)
    
    def drawBranches(self, painter: QPainter, rect: QRect, index: QModelIndex):
        """重写分支绘制方法，完全隐藏分支线"""
        return
    
    # 暂时移除 hover 相关代码，使用原生样式测试
    # def mouseMoveEvent(self, event: QMouseEvent):
    #     """鼠标移动事件，更新 hover 状态"""
    #     super().mouseMoveEvent(event)
    #     
    #     # 获取鼠标位置下的索引
    #     point = event.position().toPoint() if hasattr(event, 'position') else event.pos()
    #     index = self.indexAt(point)
    #     
    #     # 更新代理的 hover 索引
    #     if self.delegate:
    #         self.delegate.set_hovered_index(index)
    # 
    # def leaveEvent(self, event):
    #     """鼠标离开控件时，清除 hover 状态"""
    #     if self.delegate:
    #         self.delegate.set_hovered_index(QModelIndex())
    #     super().leaveEvent(event)
