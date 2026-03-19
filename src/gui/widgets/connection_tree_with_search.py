"""
带搜索功能的连接树组件
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLineEdit,
    QTreeWidgetItem,
    QApplication,
    QGroupBox,
    QScrollArea,
    QCheckBox,
    QPushButton,
    QLabel,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QKeyEvent, QKeySequence
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
        # 数据库过滤白名单：
        # - _db_whitelist_keys 为 None：不过滤（显示全部）
        # - _db_whitelist_keys 为 set[(connection_id, db_name)]：只显示集合里的数据库
        #
        # 该 set 由“配置（connection_id -> allowed_db_names）+ 当前树里已加载的数据库节点”共同计算得出，
        # 目的是实现“按连接过滤/勾选显示”的效果。
        self._db_whitelist_keys = None
        self._db_checkbox_map = {}  # (connection_id, db_name) -> QCheckBox（目前面板不展示，保留兼容）
        self._db_visibility_config_by_connection = None  # dict[str, set[str]]
        
        # 只设置最小宽度，不限制最大宽度
        self.setMinimumWidth(250)
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)
        
        # 顶部：数据库显示过滤（目前仅用于内部过滤计算，不展示给用户）
        filter_group = QGroupBox("显示的数据库")
        filter_group_layout = QVBoxLayout()
        filter_group_layout.setContentsMargins(8, 8, 8, 4)
        filter_group_layout.setSpacing(6)

        # 顶部快捷操作
        buttons_row = QHBoxLayout()
        buttons_row.setContentsMargins(0, 0, 0, 0)
        buttons_row.setSpacing(6)
        self._btn_select_all_dbs = QPushButton("全选")
        self._btn_select_none_dbs = QPushButton("不显示")
        self._btn_select_all_dbs.clicked.connect(self._on_select_all_dbs)
        self._btn_select_none_dbs.clicked.connect(self._on_select_none_dbs)
        buttons_row.addWidget(self._btn_select_all_dbs)
        buttons_row.addWidget(self._btn_select_none_dbs)

        filter_group_layout.addLayout(buttons_row)

        # 勾选列表（可滚动）
        self._db_checkboxes_area = QScrollArea()
        self._db_checkboxes_area.setWidgetResizable(True)
        self._db_checkboxes_area.setFrameShape(QScrollArea.Shape.NoFrame)

        self._db_checkboxes_container = QWidget()
        self._db_checkboxes_container_layout = QVBoxLayout()
        self._db_checkboxes_container_layout.setContentsMargins(6, 0, 6, 0)
        self._db_checkboxes_container_layout.setSpacing(4)
        self._db_checkboxes_container_layout.addStretch(1)
        self._db_checkboxes_container.setLayout(self._db_checkboxes_container_layout)
        self._db_checkboxes_area.setWidget(self._db_checkboxes_container)

        filter_group_layout.addWidget(self._db_checkboxes_area, 1)
        filter_group.setLayout(filter_group_layout)
        filter_group.setVisible(False)  # 改为由“编辑连接对话框”控制

        layout.addWidget(filter_group)

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
        self.search_box.editingFinished.connect(self.on_search_editing_finished)
        
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
            
            # 如果焦点在树上，处理键盘事件
            if obj == self.tree:
                # 处理 Ctrl+C 复制
                if key_event.matches(QKeySequence.StandardKey.Copy):
                    self.copy_selected_item()
                    return True
                
                key = key_event.key()
                # 检查是否是可打印字符（字母、数字、常用符号）
                # 排除 Ctrl 修饰键，避免干扰 Ctrl+C 等快捷键
                if key_event.modifiers() == Qt.KeyboardModifier.NoModifier and \
                   ((Qt.Key.Key_A <= key <= Qt.Key.Key_Z) or \
                    (Qt.Key.Key_0 <= key <= Qt.Key.Key_9) or \
                    key in [Qt.Key.Key_Underscore, Qt.Key.Key_Minus, Qt.Key.Key_Period]):
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
        """搜索文本改变时的处理（自动去除前后空格）"""
        # 去除前后空格后进行搜索
        search_text = text.strip()
        if not search_text:
            # 如果搜索框为空，恢复所有项
            self.restore_all_items()
            return
        
        # 执行搜索过滤（使用去除前后空格的文本）
        self.filter_tables(search_text)
    
    def on_search_editing_finished(self):
        """搜索框编辑完成时，自动去除前后空格"""
        current_text = self.search_box.text()
        trimmed_text = current_text.strip()
        if current_text != trimmed_text:
            # 如果前后有空格，自动去除
            self.search_box.setText(trimmed_text)
    
    def on_search_return_pressed(self):
        """按回车键时的处理"""
        # 选中第一个匹配的表项
        self.select_first_match()
    
    def copy_selected_item(self):
        """复制选中的树项文本到剪贴板"""
        current_item = self.tree.currentItem()
        if not current_item:
            return
        
        # 获取选中项的文本
        item_text = current_item.text(0)
        if not item_text:
            return
        
        # 复制到剪贴板
        clipboard = QApplication.clipboard()
        clipboard.setText(item_text)
    
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
                
                db_connection_id = TreeItemData.get_connection_id(db_item)
                db_name = TreeItemData.get_item_data(db_item)
                # 组合过滤：如果当前数据库未被勾选显示，则直接隐藏，不参与搜索匹配
                if db_connection_id and db_name is not None and not self._is_db_key_visible(db_connection_id, db_name):
                    db_item.setHidden(True)
                    # 同步把"表"分类隐藏掉，避免状态混乱
                    for k in range(db_item.childCount()):
                        category_item = db_item.child(k)
                        if not category_item:
                            continue
                        if TreeItemData.get_item_type(category_item) == TreeItemType.TABLE_CATEGORY:
                            category_item.setHidden(True)
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
                    connection_visible = True
            
            # 如果连接下有可见的数据库，显示连接项
            connection_item.setHidden(not connection_visible)
    
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

            any_db_node = False
            connection_visible = False
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item:
                    continue
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    # 非数据库节点（无数据库/加载中/错误等）不参与勾选过滤
                    # 这里不主动 setHidden，保留原状即可
                    continue

                any_db_node = True
                db_connection_id = TreeItemData.get_connection_id(db_item)
                db_name = TreeItemData.get_item_data(db_item)
                db_should_show = True
                if db_connection_id and db_name is not None:
                    db_should_show = self._is_db_key_visible(db_connection_id, db_name)
                db_item.setHidden(not db_should_show)
                
                if not db_should_show:
                    continue
                
                connection_visible = True
                
                # 遍历数据库下的子项（包括"表"分类）
                for k in range(db_item.childCount()):
                    category_item = db_item.child(k)
                    if not category_item:
                        continue
                    # 只恢复对已勾选显示的数据库有效的节点
                    category_item.setHidden(False)
                    
                    # 遍历"表"分类下的表项
                    for m in range(category_item.childCount()):
                        table_item = category_item.child(m)
                        if not table_item:
                            continue
                        table_item.setHidden(False)

            # 只有当连接下确实存在数据库节点时才参与勾选过滤
            # 否则保留原来的“无数据库/错误”等提示节点显示
            if any_db_node:
                connection_item.setHidden(not connection_visible)
            else:
                connection_item.setHidden(False)
    
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

    # -----------------------------
    # 数据库勾选过滤（树上方）
    # -----------------------------
    def _is_db_key_visible(self, connection_id: str, db_name: str) -> bool:
        """根据白名单判断数据库是否应该显示"""
        if self._db_whitelist_keys is None:
            return True
        return (connection_id, db_name) in self._db_whitelist_keys

    def set_db_visibility_filter_config(self, config_by_connection: dict):
        """
        设置“连接 -> 可显示数据库列表”的过滤配置。
        config_by_connection 形如：{connection_id: ["db1", "db2", ...], ...}
        缺失该 connection_id 表示“显示全部”。
        空列表 [] 表示“该连接下不显示任何数据库”。
        """
        if not config_by_connection:
            self._db_visibility_config_by_connection = None
            self._db_whitelist_keys = None
        else:
            normalized = {}
            for conn_id, db_list in config_by_connection.items():
                if db_list is None:
                    # None 表示不过滤（按需可扩展为更细粒度）
                    continue
                if isinstance(db_list, list):
                    normalized[str(conn_id)] = set(db_list)
            self._db_visibility_config_by_connection = normalized
            # 由 config + 当前树节点重新计算
            self._rebuild_db_whitelist_keys_from_config()

        self.refresh_filters_preserving_search()

    def _rebuild_db_whitelist_keys_from_config(self):
        """根据配置 + 当前树已加载的数据库节点，计算 _db_whitelist_keys。"""
        root_item = self.tree.topLevelItem(0)
        if not root_item or TreeItemData.get_item_type(root_item) != TreeItemType.ROOT:
            # 树还没有数据库节点可算，保留不过滤或已知状态由后续 refresh 再计算
            self._db_whitelist_keys = None if not self._db_visibility_config_by_connection else set()
            return

        # 如果没有任何配置（或配置为空），不过滤
        if not self._db_visibility_config_by_connection:
            self._db_whitelist_keys = None
            return

        visible_keys = set()

        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if not connection_item:
                continue
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue

            conn_id = TreeItemData.get_item_data(connection_item)
            # 对于未出现在配置中的连接：显示全部
            configured_allowed = self._db_visibility_config_by_connection.get(conn_id)

            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item:
                    continue
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue

                db_name = TreeItemData.get_item_data(db_item)
                if not db_name:
                    continue

                if conn_id not in self._db_visibility_config_by_connection:
                    visible_keys.add((conn_id, db_name))
                else:
                    # 配置存在：
                    # - 允许列表为空 => visible_keys 不包含该 db_name => 隐藏
                    # - 允许列表非空 => 仅显示在列表中的 db_name
                    if configured_allowed is not None and db_name in configured_allowed:
                        visible_keys.add((conn_id, db_name))

        self._db_whitelist_keys = visible_keys

    def _collect_db_keys_and_labels(self):
        """收集当前树中所有数据库节点键和值"""
        root_item = self.tree.topLevelItem(0)
        if not root_item:
            return []
        if TreeItemData.get_item_type(root_item) != TreeItemType.ROOT:
            return []

        results = []
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if not connection_item:
                continue
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue

            conn_id = TreeItemData.get_item_data(connection_item)
            conn_name = connection_item.text(0) or str(conn_id)
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if not db_item:
                    continue
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue
                db_name = TreeItemData.get_item_data(db_item)
                if not db_name:
                    continue
                results.append(((conn_id, db_name), f"{conn_name} / {db_name}"))

        # 去重后按字母排序（稳定）
        uniq = {}
        for key, label in results:
            uniq[key] = label
        return sorted(uniq.items(), key=lambda x: x[1])

    def _clear_db_checkboxes(self):
        """清空勾选列表 UI"""
        self._db_checkbox_map.clear()

        # remove only checkbox widgets (保留末尾 stretch, 避免重建时 index 出错)
        layout = self._db_checkboxes_container_layout
        for i in range(layout.count() - 1, -1, -1):
            item = layout.itemAt(i)
            widget = item.widget() if item else None
            if widget:
                widget.setParent(None)
                widget.deleteLater()
                layout.removeWidget(widget)
            else:
                # spacer / stretch
                continue

    def _rebuild_db_checkboxes(self):
        """根据当前树中的数据库节点重建勾选列表"""
        all_db_keys_and_labels = self._collect_db_keys_and_labels()
        all_keys = {k for k, _ in all_db_keys_and_labels}

        # 如果白名单存在，但其中包含了已经不存在的 key，不做额外处理
        # 取状态时仅以“当前存在的 key”为准
        whitelist = self._db_whitelist_keys

        self._clear_db_checkboxes()

        for key, label in all_db_keys_and_labels:
            cb = QCheckBox(label)
            connection_id, db_name = key
            checked = True if whitelist is None else (key in whitelist)
            cb.blockSignals(True)
            cb.setChecked(checked)
            cb.blockSignals(False)
            cb.stateChanged.connect(lambda state, k=key: self._on_db_checkbox_state_changed(k, state))
            self._db_checkbox_map[key] = cb
            self._db_checkboxes_container_layout.insertWidget(self._db_checkboxes_container_layout.count() - 1, cb)

        # 如果没有数据库节点，保持白名单不变即可
        # 但是如果白名单是 None，则也不需要做其它事
        # 注意：这里不自动清空白名单。
        # 树在“刷新连接/重载”过程中可能短暂为空，清空白名单会导致用户勾选意外丢失。

    def _on_db_checkbox_state_changed(self, key, state: int):
        """某个数据库勾选状态改变"""
        # 根据当前所有复选框状态更新白名单
        checked_keys = {k for k, cb in self._db_checkbox_map.items() if cb.isChecked()}
        all_keys = set(self._db_checkbox_map.keys())

        # 全选：回到“不过滤”
        if all_keys and checked_keys == all_keys:
            self._db_whitelist_keys = None
        else:
            self._db_whitelist_keys = checked_keys

        self.refresh_filters_preserving_search()

    def _on_select_all_dbs(self):
        """全选数据库：取消过滤"""
        self._db_whitelist_keys = None
        # 同步勾选 UI
        for cb in self._db_checkbox_map.values():
            cb.blockSignals(True)
            cb.setChecked(True)
            cb.blockSignals(False)
        self.refresh_filters_preserving_search()

    def _on_select_none_dbs(self):
        """不显示数据库：过滤为展示空集合"""
        self._db_whitelist_keys = set()
        for cb in self._db_checkbox_map.values():
            cb.blockSignals(True)
            cb.setChecked(False)
            cb.blockSignals(False)
        self.refresh_filters_preserving_search()

    def refresh_filters_preserving_search(self):
        """根据当前搜索框内容重新应用“勾选过滤”和“搜索过滤”组合"""
        current_text = self.search_box.text().strip()
        if current_text:
            self.filter_tables(current_text)
        else:
            self.restore_all_items()

    def refresh_database_filter_ui(self):
        """应用“数据库可见性”过滤（不再展示树上勾选面板）。"""
        self._rebuild_db_whitelist_keys_from_config()
        self.refresh_filters_preserving_search()
    
    # 转发树的所有方法
    def topLevelItemCount(self):
        return self.tree.topLevelItemCount()
    
    def topLevelItem(self, index):
        return self.tree.topLevelItem(index)
    
    def clear(self):
        # 清空树内容 + 清空过滤 UI 状态
        self.tree.clear()
        self._clear_db_checkboxes()
        return None
    
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

