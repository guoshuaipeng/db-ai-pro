"""
带搜索功能的连接树组件
"""
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLineEdit, QTreeWidgetItem
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QKeyEvent
from src.gui.widgets.connection_tree import ConnectionTree
from src.gui.utils.tree_item_types import TreeItemData, TreeItemType
import logging

logger = logging.getLogger(__name__)


class ConnectionTreeWithSearch(QWidget):
    """带搜索功能的连接树组件"""
    
    # 转发树的所有信号
    itemDoubleClicked = pyqtSignal(QTreeWidgetItem, int)
    itemClicked = pyqtSignal(QTreeWidgetItem, int)
    itemExpanded = pyqtSignal(QTreeWidgetItem)
    itemCollapsed = pyqtSignal(QTreeWidgetItem)
    customContextMenuRequested = pyqtSignal(object)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._original_items = {}  # 存储原始项，用于恢复
        
        # 只设置最小宽度，不限制最大宽度
        self.setMinimumWidth(250)
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)
        
        # 创建树组件
        self.tree = ConnectionTree()
        
        # 转发信号
        self.tree.itemDoubleClicked.connect(self.itemDoubleClicked.emit)
        self.tree.itemClicked.connect(self.itemClicked.emit)
        self.tree.itemExpanded.connect(self.itemExpanded.emit)
        self.tree.itemCollapsed.connect(self.itemCollapsed.emit)
        self.tree.customContextMenuRequested.connect(self.customContextMenuRequested.emit)
        
        # 创建搜索框（添加完整样式）
        self.search_box = QLineEdit()
        self.search_box.setPlaceholderText("搜索表名...")
        self.search_box.textChanged.connect(self.on_search_text_changed)
        self.search_box.returnPressed.connect(self.on_search_return_pressed)
        
        # 设置完整的样式
        self.search_box.setStyleSheet("""
            QLineEdit {
                padding: 6px 8px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                background-color: #fafafa;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            }
            QLineEdit:focus {
                border: 1px solid #1976d2;
                background-color: #ffffff;
            }
            QLineEdit::placeholder {
                color: #999;
            }
        """)
        
        layout.addWidget(self.tree)
        layout.addWidget(self.search_box)
        self.setLayout(layout)
        
        # 安装事件过滤器
        self.tree.installEventFilter(self)
        self.search_box.installEventFilter(self)
    
    def eventFilter(self, obj, event):
        """事件过滤器，处理键盘事件"""
        if event.type() == event.Type.KeyPress:
            key_event = event
            
            # 如果焦点在树上，按任意字母、数字或常用符号键，聚焦搜索框
            if obj == self.tree:
                key = key_event.key()
                # 检查是否是可打印字符（字母、数字、常用符号）
                if (Qt.Key.Key_A <= key <= Qt.Key.Key_Z) or \
                   (Qt.Key.Key_0 <= key <= Qt.Key.Key_9) or \
                   key in [Qt.Key.Key_Underscore, Qt.Key.Key_Minus, Qt.Key.Key_Period]:
                    # 聚焦搜索框
                    self.search_box.setFocus()
                    # 将按键文本添加到搜索框
                    text = key_event.text()
                    if text:
                        self.search_box.setText(text)
                        self.search_box.selectAll()  # 选中所有文本，方便继续输入
                    return True
            
            # 如果焦点在搜索框，按 ESC 清空搜索并返回焦点到树
            if obj == self.search_box:
                if key_event.key() == Qt.Key.Key_Escape:
                    self.search_box.clear()
                    self.tree.setFocus()
                    return True
                elif key_event.key() == Qt.Key.Key_Down:
                    # 按向下键，聚焦到树并选中第一个匹配项
                    self.tree.setFocus()
                    self.select_first_match()
                    return True
        
        return super().eventFilter(obj, event)
    
    def show_search(self):
        """显示搜索框"""
        if not self.search_box.isVisible():
            self.search_box.setVisible(True)
            self.search_box.setFocus()
    
    def hide_search(self):
        """隐藏搜索框并恢复树"""
        self.search_box.clear()
        self.search_box.setVisible(False)
        self.tree.setFocus()
        # 恢复所有项
        self.restore_all_items()
    
    def on_search_text_changed(self, text: str):
        """搜索文本改变时的处理"""
        if not text.strip():
            # 如果搜索框为空，恢复所有项
            self.restore_all_items()
            return
        
        # 执行搜索过滤
        self.filter_tables(text.strip())
    
    def on_search_return_pressed(self):
        """按回车键时的处理"""
        # 选中第一个匹配的表项
        self.select_first_match()
    
    def filter_tables(self, search_text: str):
        """根据搜索文本过滤表"""
        search_text_lower = search_text.lower()
        
        # 获取根节点"我的连接"
        root_item = self.tree.topLevelItem(0)
        if not root_item:
            logger.warning("未找到根节点")
            return
        
        # 检查根节点类型
        root_type = TreeItemData.get_item_type(root_item)
        if root_type != TreeItemType.ROOT:
            logger.warning(f"根节点类型不正确: {root_type}, 文本: {root_item.text(0)}")
            return
        
        # 遍历所有连接
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if not connection_item:
                continue
            
            # 检查是否是连接项
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue
            
            connection_visible = False
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item:
                    continue
                
                # 检查是否是数据库项
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue
                
                db_visible = False
                
                # 遍历数据库下的子项，查找"表"分类
                for k in range(db_item.childCount()):
                    category_item = db_item.child(k)
                    if not category_item:
                        continue
                    
                    # 检查是否是"表"分类
                    if TreeItemData.get_item_type(category_item) != TreeItemType.TABLE_CATEGORY:
                        continue
                    
                    # 遍历"表"分类下的表项
                    for m in range(category_item.childCount()):
                        table_item = category_item.child(m)
                        if not table_item:
                            continue
                        
                        # 检查是否是表项
                        if TreeItemData.get_item_type(table_item) != TreeItemType.TABLE:
                            continue
                        
                        # 获取表名
                        table_name = table_item.text(0)
                        
                        # 检查是否匹配
                        if search_text_lower in table_name.lower():
                            table_item.setHidden(False)
                            db_visible = True
                            connection_visible = True
                        else:
                            table_item.setHidden(True)
                    
                    # 如果"表"分类下有可见的表，显示"表"分类
                    category_item.setHidden(not db_visible)
                
                # 如果数据库下有可见的表，显示数据库项
                db_item.setHidden(not db_visible)
                if db_visible:
                    # 自动展开包含匹配表的数据库和"表"分类
                    db_item.setExpanded(True)
                    for k in range(db_item.childCount()):
                        category_item = db_item.child(k)
                        if TreeItemData.get_item_type(category_item) == TreeItemType.TABLE_CATEGORY:
                            category_item.setExpanded(True)
                            break
            
            # 如果连接下有可见的数据库，显示连接项
            connection_item.setHidden(not connection_visible)
            if connection_visible:
                # 自动展开包含匹配表的连接
                connection_item.setExpanded(True)
    
    def restore_all_items(self):
        """恢复所有隐藏的项"""
        root_item = self.tree.topLevelItem(0)
        if not root_item:
            return
        
        # 检查根节点类型
        if TreeItemData.get_item_type(root_item) != TreeItemType.ROOT:
            return
        
        # 恢复根节点
        root_item.setHidden(False)
        
        # 遍历所有连接
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if not connection_item:
                continue
            connection_item.setHidden(False)
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item:
                    continue
                db_item.setHidden(False)
                
                # 遍历数据库下的子项（包括"表"分类）
                for k in range(db_item.childCount()):
                    category_item = db_item.child(k)
                    if not category_item:
                        continue
                    category_item.setHidden(False)
                    
                    # 遍历"表"分类下的表项
                    for m in range(category_item.childCount()):
                        table_item = category_item.child(m)
                        if not table_item:
                            continue
                        table_item.setHidden(False)
    
    def select_first_match(self):
        """选中第一个匹配的表项"""
        root_item = self.tree.topLevelItem(0)
        if not root_item:
            return
        
        # 检查根节点类型
        if TreeItemData.get_item_type(root_item) != TreeItemType.ROOT:
            return
        
        # 遍历所有连接
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if not connection_item or connection_item.isHidden():
                continue
            
            # 检查是否是连接项
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item or db_item.isHidden():
                    continue
                
                # 检查是否是数据库项
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue
                
                # 遍历数据库下的子项，查找"表"分类
                for k in range(db_item.childCount()):
                    category_item = db_item.child(k)
                    if not category_item or category_item.isHidden():
                        continue
                    
                    # 检查是否是"表"分类
                    if TreeItemData.get_item_type(category_item) != TreeItemType.TABLE_CATEGORY:
                        continue
                    
                    # 遍历"表"分类下的表项
                    for m in range(category_item.childCount()):
                        table_item = category_item.child(m)
                        if not table_item or table_item.isHidden():
                            continue
                        
                        # 检查是否是表项
                        if TreeItemData.get_item_type(table_item) != TreeItemType.TABLE:
                            continue
                        
                        # 选中并滚动到该项
                        self.tree.setCurrentItem(table_item)
                        self.tree.scrollToItem(table_item)
                        return
    
    # 转发树的所有方法
    def topLevelItemCount(self):
        return self.tree.topLevelItemCount()
    
    def topLevelItem(self, index):
        return self.tree.topLevelItem(index)
    
    def clear(self):
        return self.tree.clear()
    
    def itemAt(self, position):
        return self.tree.itemAt(position)
    
    def setFont(self, font):
        return self.tree.setFont(font)
    
    def resizeColumnToContents(self, column):
        return self.tree.resizeColumnToContents(column)
    
    def setCurrentItem(self, item):
        return self.tree.setCurrentItem(item)
    
    def scrollToItem(self, item):
        return self.tree.scrollToItem(item)
    
    def update(self):
        return self.tree.update()

