"""
多结果表格组件（支持Tab切换）
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QLabel,
    QMessageBox,
    QPushButton,
    QDialog,
    QTextEdit,
    QDialogButtonBox,
    QHBoxLayout,
    QFileDialog,
    QMenu,
    QApplication,
)
from src.utils.toast import show_toast
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont, QTextCharFormat, QColor, QSyntaxHighlighter, QClipboard, QMouseEvent
from PyQt6.QtCore import QRegularExpression
from typing import List, Dict, Optional
import json
import re
import csv
import logging
from datetime import datetime, date, time
from decimal import Decimal
from pathlib import Path

logger = logging.getLogger(__name__)


class JSONHighlighter(QSyntaxHighlighter):
    """JSON语法高亮"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        
        # 定义高亮规则
        self.highlighting_rules = []
        
        # 关键字（true, false, null）
        keyword_format = QTextCharFormat()
        keyword_format.setForeground(QColor(86, 156, 214))  # 蓝色
        keyword_format.setFontWeight(700)  # 粗体
        keywords = ["true", "false", "null"]
        for keyword in keywords:
            pattern = QRegularExpression(f"\\b{keyword}\\b")
            self.highlighting_rules.append((pattern, keyword_format))
        
        # 字符串（用引号包围的内容）
        string_format = QTextCharFormat()
        string_format.setForeground(QColor(206, 145, 120))  # 橙色
        pattern = QRegularExpression('"[^"\\\\]*(\\\\.[^"\\\\]*)*"')
        self.highlighting_rules.append((pattern, string_format))
        
        # 数字
        number_format = QTextCharFormat()
        number_format.setForeground(QColor(181, 206, 168))  # 绿色
        pattern = QRegularExpression("\\b\\d+(\\.\\d+)?\\b")
        self.highlighting_rules.append((pattern, number_format))
    
    def highlightBlock(self, text: str):
        """高亮文本块"""
        for pattern, format in self.highlighting_rules:
            iterator = pattern.globalMatch(text)
            while iterator.hasNext():
                match = iterator.next()
                self.setFormat(match.capturedStart(), match.capturedLength(), format)


class SingleResultTable(QWidget):
    """单个查询结果表格"""
    
    def __init__(self, parent=None, main_window=None, sql: str = None):
        super().__init__(parent)
        self.main_window = main_window  # 主窗口引用，用于执行SQL
        self.original_sql = sql  # 原始SQL查询
        self.original_data: List[Dict] = []  # 原始数据（用于生成WHERE条件）
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 工具栏（导出按钮）- 放在显示区域上面的右边
        toolbar_layout = QHBoxLayout()
        
        toolbar_layout.addStretch()
        
        # 导出按钮（放在右边）
        self.export_btn = QPushButton("导出")
        self.export_btn.setEnabled(False)
        self.export_btn.clicked.connect(self.show_export_menu)
        toolbar_layout.addWidget(self.export_btn)
        
        layout.addLayout(toolbar_layout)
        
        # 结果表格
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        # 支持单元格选择和行选择
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectItems)
        # 启用多选功能
        self.table.setSelectionMode(QTableWidget.SelectionMode.ExtendedSelection)
        # 启用编辑功能：双击或按F2编辑
        self.table.setEditTriggers(
            QTableWidget.EditTrigger.DoubleClicked | 
            QTableWidget.EditTrigger.SelectedClicked |
            QTableWidget.EditTrigger.EditKeyPressed
        )
        
        # 设置选中样式：当前行浅色，当前单元格深色
        self.table.setStyleSheet("""
            QTableWidget {
                background-color: #FFFFFF;  /* 白色背景 */
                selection-background-color: #E3F2FD;  /* 选中行浅蓝色背景 */
                selection-color: #000000;  /* 选中文本颜色 */
                alternate-background-color: #F5F5F5;  /* 交替行背景色 */
            }
            QTableWidget::item {
                background-color: transparent;  /* 默认透明背景 */
            }
            QTableWidget::item:selected {
                background-color: #BBDEFB;  /* 选中单元格深蓝色背景 */
            }
            QTableWidget::item:focus {
                background-color: #90CAF9;  /* 当前焦点单元格更深的蓝色 */
                border: 1px solid #2196F3;  /* 蓝色边框 */
            }
        """)
        
        # 设置表头
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        header.setStretchLastSection(True)
        # 连接表头点击事件，点击列名时复制列名
        header.sectionClicked.connect(self.on_header_clicked)
        
        # 列的最大宽度（像素）
        self.max_column_width = 400
        
        # 连接双击事件（用于编辑）
        self.table.itemDoubleClicked.connect(self.on_row_double_clicked)
        
        # 连接单元格编辑完成事件
        self.table.itemChanged.connect(self.on_item_changed)
        
        # 启用右键菜单
        self.table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self.show_context_menu)
        
        layout.addWidget(self.table)
        
        # 状态标签（已隐藏，状态信息显示到主窗口状态栏）
        self.status_label = QLabel("等待查询结果...")
        self.status_label.setStyleSheet("color: #666; padding: 5px; border-top: 1px solid #ddd;")
        self.status_label.hide()  # 隐藏状态标签
        
        # 保存原始数据（用于显示JSON）
        self.raw_data: List[Dict] = []
        
        # 标记是否正在更新数据（避免itemChanged触发）
        self._updating_data = False
        
        # 保存修改的单元格信息：{(row, col): (old_value, new_value)}
        self.modified_cells: Dict[tuple, tuple] = {}
        
        # 保存正在执行的UPDATE worker
        self.update_worker = None
    
    def _show_status_to_main_window(self, message: str, timeout: int = 3000):
        """显示状态信息到主窗口状态栏"""
        if self.main_window and hasattr(self.main_window, 'statusBar'):
            self.main_window.statusBar().showMessage(message, timeout)
    
    def display_results(
        self, 
        data: List[Dict], 
        error: Optional[str] = None,
        affected_rows: Optional[int] = None,
        columns: Optional[List[str]] = None
    ):
        """显示查询结果"""
        if error:
            # 显示错误到主窗口状态栏
            self._show_status_to_main_window(f"错误: {error}", 5000)
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            self.raw_data = []
            self.export_btn.setEnabled(False)
            return
        
        if affected_rows is not None:
            # 非查询语句
            self._show_status_to_main_window(f"执行成功: 影响 {affected_rows} 行")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            self.raw_data = []
            self.export_btn.setEnabled(False)
            return
        
        if not data:
            # 如果没有数据但有列名，显示表头
            if columns:
                self._show_status_to_main_window("查询完成: 0 行")
                self.table.setRowCount(0)
                self.table.setColumnCount(len(columns))
                self.table.setHorizontalHeaderLabels(columns)
                # 为每个表头添加提示（点击复制）
                for col_idx in range(len(columns)):
                    header_item = self.table.horizontalHeaderItem(col_idx)
                    if header_item:
                        header_item.setToolTip("点击复制列名")
                self.raw_data = []
                self.export_btn.setEnabled(False)
                # 调整列宽（带最大宽度限制）
                self._resize_columns_with_max_width()
            else:
                self._show_status_to_main_window("查询完成: 0 行")
                self.table.setRowCount(0)
                self.table.setColumnCount(0)
                self.raw_data = []
                self.export_btn.setEnabled(False)
            return
        
        # 标记正在更新数据，避免触发itemChanged事件
        self._updating_data = True
        
        # 保存原始数据
        self.raw_data = data
        
        # 保存原始数据的副本（用于生成WHERE条件）
        import copy
        self.original_data = copy.deepcopy(data)
        
        # 清空修改记录
        self.modified_cells.clear()
        
        # 启用导出按钮（只有在有数据时才启用）
        if data and len(data) > 0:
            self.export_btn.setEnabled(True)
        else:
            self.export_btn.setEnabled(False)
        
        # 显示数据
        columns = list(data[0].keys())
        self.table.setRowCount(len(data))
        self.table.setColumnCount(len(columns))
        
        self.table.setHorizontalHeaderLabels(columns)
        
        # 为每个表头添加提示（点击复制）
        for col_idx in range(len(columns)):
            header_item = self.table.horizontalHeaderItem(col_idx)
            if header_item:
                header_item.setToolTip("点击复制列名")
        
        # 填充数据
        for row_idx, row_data in enumerate(data):
            for col_idx, col_name in enumerate(columns):
                value = row_data.get(col_name)
                
                # 处理None值
                if value is None:
                    display_value = "NULL"
                else:
                    display_value = str(value)
                
                item = QTableWidgetItem(display_value)
                item.setTextAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
                
                # NULL值特殊样式
                if value is None:
                    item.setForeground(Qt.GlobalColor.gray)
                
                # 设置单元格可编辑（包括NULL值）
                item.setFlags(item.flags() | Qt.ItemFlag.ItemIsEditable)
                
                self.table.setItem(row_idx, col_idx, item)
        
        # 调整列宽（带最大宽度限制）
        self._resize_columns_with_max_width()
        
        # 更新状态到主窗口状态栏
        self._show_status_to_main_window(f"查询完成: {len(data)} 行, {len(columns)} 列")
        
        # 数据更新完成
        self._updating_data = False
    
    def _resize_columns_with_max_width(self):
        """调整列宽，但限制最大宽度"""
        # 先根据内容调整列宽
        self.table.resizeColumnsToContents()
        
        # 然后限制每列的最大宽度
        header = self.table.horizontalHeader()
        for col_idx in range(self.table.columnCount()):
            current_width = header.sectionSize(col_idx)
            if current_width > self.max_column_width:
                header.resizeSection(col_idx, self.max_column_width)
    
    def on_header_clicked(self, logical_index: int):
        """表头点击事件：复制列名到剪贴板"""
        header_item = self.table.horizontalHeaderItem(logical_index)
        if header_item:
            column_name = header_item.text()
            clipboard = QApplication.clipboard()
            clipboard.setText(column_name)
            # 显示Toast提示
            show_toast(f"已复制列名: {column_name}", parent=self.table, duration=2000)
    
    def on_row_double_clicked(self, item: QTableWidgetItem):
        """双击单元格时进入编辑模式"""
        # 双击时直接进入编辑模式（默认行为）
        pass
    
    def show_context_menu(self, position):
        """显示右键菜单"""
        item = self.table.itemAt(position)
        
        # 获取选中的单元格和行
        selected_items = self.table.selectedItems()
        selected_rows = sorted({it.row() for it in selected_items}) if selected_items else []
        
        # 创建右键菜单
        menu = QMenu(self)
        
        # 添加"刷新"选项（如果有原始SQL）
        if self.original_sql and self.main_window:
            refresh_action = menu.addAction("🔄 刷新")
            refresh_action.triggered.connect(self.refresh_data)
            menu.addSeparator()
        
        # 如果有选中的单元格，添加其他选项
        if item:
            row = item.row()
            if 0 <= row < len(self.raw_data):
                # 添加"查看 JSON 数据"选项
                json_action = menu.addAction("查看 JSON 数据")
                json_action.triggered.connect(lambda: self.show_json_dialog(row))

                # 如果有选中的单元格，添加"填充为 NULL"选项
                if selected_items:
                    fill_null_action = menu.addAction("设置为NULL")
                    fill_null_action.triggered.connect(self.fill_selected_cells_with_null)
                
                # 如果有选中的行，添加删除选项
                if selected_rows:
                    menu.addSeparator()
                    delete_action = menu.addAction(f"删除选中行 ({len(selected_rows)} 行)")
                    delete_action.triggered.connect(lambda: self.delete_selected_rows(selected_rows))
        
        # 显示菜单
        menu.exec(self.table.mapToGlobal(position))
    
    def refresh_data(self):
        """刷新数据：重新执行原始SQL查询"""
        if not self.original_sql or not self.main_window:
            return
        
        # 显示刷新状态
        self._show_status_to_main_window("正在刷新数据...", timeout=0)
        
        # 通过主窗口重新执行查询
        if hasattr(self.main_window, 'execute_query'):
            self.main_window.execute_query(self.original_sql)
        else:
            self._show_status_to_main_window("无法刷新：主窗口引用无效", timeout=3000)

    def fill_selected_cells_with_null(self):
        """将选中的单元格填充为 NULL（文本为 'NULL'，触发现有更新逻辑）"""
        items = self.table.selectedItems()
        if not items:
            return

        for it in items:
            # 设置显示文本为 "NULL"；on_item_changed 会把它转换为 None 并更新数据库
            it.setText("NULL")
    
    def show_json_dialog(self, row: int):
        """显示JSON数据对话框"""
        if not self.raw_data:
            return
        
        if row < 0 or row >= len(self.raw_data):
            return
        
        # 获取该行的数据
        row_data = self.raw_data[row]
        
        # 创建JSON显示对话框
        dialog = QDialog(self)
        dialog.setWindowTitle(f"行 {row + 1} 的JSON数据")
        dialog.setMinimumSize(600, 400)
        
        layout = QVBoxLayout()
        dialog.setLayout(layout)
        
        # JSON文本编辑器
        json_edit = QTextEdit()
        json_edit.setReadOnly(True)
        json_edit.setFont(QFont("Consolas", 10))
        
        # 格式化JSON（处理datetime等特殊类型）
        try:
            # 自定义JSON编码器，处理datetime等类型
            class CustomJSONEncoder(json.JSONEncoder):
                def default(self, obj):
                    if isinstance(obj, (datetime, date)):
                        return obj.isoformat()
                    elif isinstance(obj, time):
                        return obj.isoformat()
                    elif isinstance(obj, Decimal):
                        return float(obj)
                    elif hasattr(obj, '__dict__'):
                        return obj.__dict__
                    return super().default(obj)
            
            json_text = json.dumps(row_data, ensure_ascii=False, indent=2, cls=CustomJSONEncoder)
        except Exception as e:
            json_text = f"无法序列化为JSON: {str(e)}\n\n原始数据:\n{str(row_data)}"
        
        json_edit.setPlainText(json_text)
        
        # 设置JSON语法高亮
        highlighter = JSONHighlighter(json_edit.document())
        
        layout.addWidget(json_edit)
        
        # 按钮
        button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok)
        button_box.accepted.connect(dialog.accept)
        layout.addWidget(button_box)
        
        dialog.exec()
    
    def on_item_changed(self, item: QTableWidgetItem):
        """单元格内容改变时的回调"""
        # 如果正在更新数据，忽略此事件
        if self._updating_data:
            return
        
        # 获取行和列
        row = item.row()
        col = item.column()
        
        # 更新原始数据
        if self.raw_data and 0 <= row < len(self.raw_data):
            columns = list(self.raw_data[0].keys())
            if 0 <= col < len(columns):
                col_name = columns[col]
                new_value = item.text()
                
                # 获取原始值
                old_value = self.raw_data[row].get(col_name)
                old_display_value = "NULL" if old_value is None else str(old_value)
                
                # 处理NULL值
                if new_value.upper() == "NULL" or new_value == "":
                    self.raw_data[row][col_name] = None
                    item.setForeground(Qt.GlobalColor.gray)
                    new_value_for_db = None
                else:
                    self.raw_data[row][col_name] = new_value
                    item.setForeground(Qt.GlobalColor.black)
                    new_value_for_db = new_value
                
                # 记录修改（如果值确实改变了）
                if old_display_value != new_value:
                    self.modified_cells[(row, col)] = (old_value, new_value_for_db)
                    # 标记单元格为已修改（可选：改变背景色）
                    item.setBackground(QColor(255, 255, 200))  # 浅黄色背景表示已修改
                    
                    # 自动更新到数据库
                    self._update_to_database(row, col_name, new_value_for_db, old_value)
                else:
                    # 如果值没有改变，移除修改记录
                    if (row, col) in self.modified_cells:
                        del self.modified_cells[(row, col)]
                        # 恢复默认背景（使用透明或白色）
                        item.setBackground(QColor(255, 255, 255, 0))  # 透明背景，让系统样式生效
                
                # 更新状态到主窗口状态栏（可选：显示已修改标记）
                if self.modified_cells:
                    self._show_status_to_main_window(f"查询完成: {len(self.raw_data)} 行, {len(columns)} 列 (已修改 {len(self.modified_cells)} 个单元格)")
                else:
                    self._show_status_to_main_window(f"查询完成: {len(self.raw_data)} 行, {len(columns)} 列")
    
    def _update_to_database(self, row: int, col_name: str, new_value, old_value):
        """更新单元格到数据库"""
        if not self.main_window or not self.original_sql:
            return
        
        # 检查是否是SELECT查询
        sql_upper = self.original_sql.strip().upper()
        if not sql_upper.startswith("SELECT"):
            return
        
        # 从原始SQL中提取表名
        table_name = self._extract_table_name_from_sql(self.original_sql)
        if not table_name:
            # 如果无法提取表名，尝试从SQL中提取
            return
        
        # 获取该行的原始数据（用于WHERE条件）
        if row < 0 or row >= len(self.original_data):
            return
        
        original_row_data = self.original_data[row]
        columns = list(original_row_data.keys())
        
        # 生成UPDATE SQL语句
        # 使用所有列的值作为WHERE条件（这样可以唯一标识一行）
        update_sql = self._generate_update_sql(table_name, col_name, new_value, original_row_data, columns)
        
        if update_sql:
            # 执行UPDATE语句
            self._execute_update(update_sql)
    
    def _extract_table_name_from_sql(self, sql: str) -> Optional[str]:
        """从SQL中提取表名"""
        import re
        sql_upper = sql.strip().upper()
        
        # 只处理SELECT查询
        if not sql_upper.startswith("SELECT"):
            return None
        
        # 更精确的正则表达式，处理反引号和点号
        # 需要处理的情况：
        # 1. FROM `database`.`table` - 标准格式
        # 2. FROM `database.table`.`table` - 数据库名包含点号
        # 3. FROM database.table - 不带反引号
        # 4. FROM `table` - 只有表名
        
        # 先尝试匹配带反引号的格式：FROM `xxx`.`yyy`
        # 这个模式会匹配最后一个点号分隔的两部分
        pattern1 = r'FROM\s+`([^`]+)`\.`([^`]+)`'
        match = re.search(pattern1, sql, re.IGNORECASE)
        if match:
            # 第一部分可能是 database 或 database.table（数据库名包含点号）
            # 第二部分是表名
            db_part = match.group(1).strip()
            table_name = match.group(2).strip()
            # 返回 database.table 格式（完整路径）
            return f"{db_part}.{table_name}"
        
        # 尝试匹配不带反引号的格式：FROM xxx.yyy
        pattern2 = r'FROM\s+([^\s`]+)\.([^\s`]+)'
        match = re.search(pattern2, sql, re.IGNORECASE)
        if match:
            db_part = match.group(1).strip()
            table_name = match.group(2).strip()
            # 移除可能的反引号
            db_part = db_part.strip('`')
            table_name = table_name.strip('`')
            return f"{db_part}.{table_name}"
        
        # 尝试匹配单个表名（带反引号）
        pattern3 = r'FROM\s+`([^`]+)`'
        match = re.search(pattern3, sql, re.IGNORECASE)
        if match:
            table_name = match.group(1).strip()
            return table_name
        
        # 尝试匹配单个表名（不带反引号）
        pattern4 = r'FROM\s+([^\s`]+)'
        match = re.search(pattern4, sql, re.IGNORECASE)
        if match:
            table_name = match.group(1).strip()
            # 移除可能的反引号
            table_name = table_name.strip('`')
            return table_name
        
        return None
    
    def _generate_update_sql(self, table_name: str, col_name: str, new_value, original_row_data: Dict, columns: List[str]) -> Optional[str]:
        """生成UPDATE SQL语句"""
        # 转义表名和列名（处理反引号）
        def escape_identifier(name: str) -> str:
            # 先移除所有反引号，然后重新添加
            name = name.strip().strip('`')
            # 如果包含点号，需要找到最后一个点号，前面是数据库名（可能包含点号），后面是表名
            if '.' in name:
                # 找到最后一个点号的位置
                last_dot_index = name.rfind('.')
                db_part = name[:last_dot_index].strip()
                table_part = name[last_dot_index + 1:].strip()
                # 数据库名和表名分别转义
                db_escaped = f"`{db_part}`" if db_part else ""
                table_escaped = f"`{table_part}`" if table_part else ""
                if db_escaped and table_escaped:
                    return f"{db_escaped}.{table_escaped}"
                elif table_escaped:
                    return table_escaped
            # 单个标识符
            return f"`{name}`" if name else name
        
        # 转义值（处理SQL注入）
        def escape_value(value) -> str:
            if value is None:
                return "NULL"
            elif isinstance(value, str):
                # 转义单引号
                escaped = value.replace("'", "''")
                return f"'{escaped}'"
            elif isinstance(value, (int, float)):
                return str(value)
            elif isinstance(value, bool):
                return "1" if value else "0"
            else:
                # 其他类型转为字符串
                escaped = str(value).replace("'", "''")
                return f"'{escaped}'"
        
        # 构建SET子句
        set_clause = f"{escape_identifier(col_name)} = {escape_value(new_value)}"
        
        # 构建WHERE子句（使用所有列的值来唯一标识一行）
        where_conditions = []
        for col in columns:
            value = original_row_data.get(col)
            if value is None:
                where_conditions.append(f"{escape_identifier(col)} IS NULL")
            else:
                where_conditions.append(f"{escape_identifier(col)} = {escape_value(value)}")
        
        where_clause = " AND ".join(where_conditions)
        
        # 生成完整的UPDATE语句
        update_sql = f"UPDATE {escape_identifier(table_name)} SET {set_clause} WHERE {where_clause}"
        
        return update_sql
    
    def _execute_update(self, update_sql: str):
        """执行UPDATE语句"""
        if not self.main_window:
            return
        
        try:
            # 在主窗口状态栏显示SQL
            self._show_status_to_main_window(f"执行UPDATE: {update_sql}", 5000)
            
            # 停止之前的UPDATE worker（如果存在）
            if self.update_worker and self.update_worker.isRunning():
                self.update_worker.stop()
                self.update_worker.wait(1000)
                if self.update_worker.isRunning():
                    self.update_worker.terminate()
                    self.update_worker.wait(500)
                try:
                    self.update_worker.query_finished.disconnect()
                except:
                    pass
                self.update_worker.deleteLater()
            
            # 使用主窗口的execute_query方法执行UPDATE
            # 注意：这里直接执行，不显示在SQL编辑器中
            from src.gui.workers.query_worker import QueryWorker
            
            connection = self.main_window.db_manager.get_connection(self.main_window.current_connection_id)
            if not connection:
                return
            
            # 创建并启动工作线程执行UPDATE
            self.update_worker = QueryWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                update_sql,
                is_query=False  # UPDATE不是查询
            )
            
            # 连接信号
            self.update_worker.query_finished.connect(
                lambda success, data, error, affected_rows: self._on_update_finished(success, error, affected_rows)
            )
            
            # 启动线程
            self.update_worker.start()
            
        except Exception as e:
            logger.error(f"执行UPDATE失败: {str(e)}")
            QMessageBox.warning(self, "更新失败", f"更新数据库失败: {str(e)}")
    
    def _on_update_finished(self, success: bool, error: Optional[str], affected_rows: Optional[int]):
        """UPDATE执行完成回调"""
        if success:
            # 更新成功，更新原始数据
            import copy
            self.original_data = copy.deepcopy(self.raw_data)
            # 清空修改记录
            self.modified_cells.clear()
            # 恢复所有单元格的背景色
            for row in range(self.table.rowCount()):
                for col in range(self.table.columnCount()):
                    item = self.table.item(row, col)
                    if item:
                        # 恢复默认背景（使用透明，让系统样式生效）
                        item.setBackground(QColor(255, 255, 255, 0))  # 透明背景
            
            self._show_status_to_main_window(f"查询完成: {len(self.raw_data)} 行 (已保存到数据库)")
        else:
            QMessageBox.warning(self, "更新失败", f"更新数据库失败: {error}")
    
    def delete_selected_rows(self, selected_rows: List[int]):
        """删除选中的行"""
        if not selected_rows:
            return
        
        if not self.main_window or not self.original_sql:
            QMessageBox.warning(self, "警告", "无法删除：缺少SQL信息")
            return
        
        # 检查是否是SELECT查询
        sql_upper = self.original_sql.strip().upper()
        if not sql_upper.startswith("SELECT"):
            QMessageBox.warning(self, "警告", "只能删除SELECT查询的结果")
            return
        
        # 从原始SQL中提取表名
        table_name = self._extract_table_name_from_sql(self.original_sql)
        if not table_name:
            QMessageBox.warning(self, "警告", "无法从SQL中提取表名")
            return
        
        # 确认删除
        reply = QMessageBox.question(
            self,
            "确认删除",
            f"确定要删除选中的 {len(selected_rows)} 行数据吗？\n\n此操作不可撤销！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # 生成DELETE SQL语句
        delete_sqls = []
        columns = list(self.raw_data[0].keys()) if self.raw_data else []
        
        for row_idx in selected_rows:
            if row_idx < 0 or row_idx >= len(self.original_data):
                continue
            
            original_row_data = self.original_data[row_idx]
            delete_sql = self._generate_delete_sql(table_name, original_row_data, columns)
            if delete_sql:
                delete_sqls.append(delete_sql)
        
        if not delete_sqls:
            QMessageBox.warning(self, "警告", "无法生成DELETE语句")
            return
        
        # 执行DELETE语句
        self._execute_delete(delete_sqls, selected_rows)
    
    def _generate_delete_sql(self, table_name: str, original_row_data: Dict, columns: List[str]) -> Optional[str]:
        """生成DELETE SQL语句"""
        # 转义表名（处理反引号）
        def escape_identifier(name: str) -> str:
            # 先移除所有反引号，然后重新添加
            name = name.strip().strip('`')
            # 如果包含点号，需要找到最后一个点号，前面是数据库名（可能包含点号），后面是表名
            if '.' in name:
                # 找到最后一个点号的位置
                last_dot_index = name.rfind('.')
                db_part = name[:last_dot_index].strip()
                table_part = name[last_dot_index + 1:].strip()
                # 数据库名和表名分别转义
                db_escaped = f"`{db_part}`" if db_part else ""
                table_escaped = f"`{table_part}`" if table_part else ""
                if db_escaped and table_escaped:
                    return f"{db_escaped}.{table_escaped}"
                elif table_escaped:
                    return table_escaped
            # 单个标识符
            return f"`{name}`" if name else name
        
        # 转义值（处理SQL注入）
        def escape_value(value) -> str:
            if value is None:
                return "NULL"
            elif isinstance(value, str):
                # 转义单引号
                escaped = value.replace("'", "''")
                return f"'{escaped}'"
            elif isinstance(value, (int, float)):
                return str(value)
            elif isinstance(value, bool):
                return "1" if value else "0"
            else:
                # 其他类型转为字符串
                escaped = str(value).replace("'", "''")
                return f"'{escaped}'"
        
        # 构建WHERE子句（使用所有列的值来唯一标识一行）
        where_conditions = []
        for col in columns:
            value = original_row_data.get(col)
            if value is None:
                where_conditions.append(f"{escape_identifier(col)} IS NULL")
            else:
                where_conditions.append(f"{escape_identifier(col)} = {escape_value(value)}")
        
        where_clause = " AND ".join(where_conditions)
        
        # 生成完整的DELETE语句
        delete_sql = f"DELETE FROM {escape_identifier(table_name)} WHERE {where_clause}"
        
        return delete_sql
    
    def _execute_delete(self, delete_sqls: List[str], selected_rows: List[int]):
        """执行DELETE语句"""
        if not self.main_window:
            return
        
        try:
            # 合并多个DELETE语句（如果数据库支持）
            combined_sql = ";\n".join(delete_sqls)
            
            # 在主窗口状态栏显示SQL
            # 如果SQL太长，只显示前200个字符
            display_sql = combined_sql[:200] + "..." if len(combined_sql) > 200 else combined_sql
            self._show_status_to_main_window(f"执行DELETE: {display_sql}", 5000)
            
            # 停止之前的UPDATE worker（如果存在）
            if self.update_worker and self.update_worker.isRunning():
                self.update_worker.stop()
                self.update_worker.wait(1000)
                if self.update_worker.isRunning():
                    self.update_worker.terminate()
                    self.update_worker.wait(500)
                try:
                    self.update_worker.query_finished.disconnect()
                except:
                    pass
                self.update_worker.deleteLater()
            
            from src.gui.workers.query_worker import QueryWorker
            
            connection = self.main_window.db_manager.get_connection(self.main_window.current_connection_id)
            if not connection:
                QMessageBox.warning(self, "警告", "数据库连接不存在")
                return
            
            # 创建并启动工作线程执行DELETE
            self.update_worker = QueryWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                combined_sql,
                is_query=False  # DELETE不是查询
            )
            
            # 连接信号（支持单条和多条SQL）
            self.update_worker.query_finished.connect(
                lambda success, data, error, affected_rows, columns: self._on_delete_finished(
                    success, error, affected_rows, selected_rows
                )
            )
            # 如果有多条DELETE语句，使用multi_query_finished信号
            self.update_worker.multi_query_finished.connect(
                lambda results: self._on_multi_delete_finished(results, selected_rows)
            )
            
            # 启动线程
            self.update_worker.start()
            
        except Exception as e:
            logger.error(f"执行DELETE失败: {str(e)}")
            QMessageBox.warning(self, "删除失败", f"删除数据失败: {str(e)}")
    
    def _on_delete_finished(self, success: bool, error: Optional[str], affected_rows: Optional[int], selected_rows: List[int]):
        """DELETE执行完成回调（单条SQL）"""
        if success:
            # 删除成功，从表格中移除行（从后往前删除，避免索引变化）
            self._remove_rows_from_table(selected_rows)
            
            # 更新状态到主窗口状态栏
            remaining_rows = len(self.raw_data)
            self._show_status_to_main_window(f"删除成功: 已删除 {len(selected_rows)} 行，剩余 {remaining_rows} 行")
            
            QMessageBox.information(self, "删除成功", f"已成功删除 {len(selected_rows)} 行数据")
        else:
            self._show_status_to_main_window(f"查询完成: {len(self.raw_data)} 行")
            QMessageBox.warning(self, "删除失败", f"删除数据失败: {error}")
    
    def _on_multi_delete_finished(self, results: List[tuple], selected_rows: List[int]):
        """多条DELETE执行完成回调"""
        # results格式: [(sql, success, data, error, affected_rows, columns), ...]
        success_count = sum(1 for r in results if r[1])  # 统计成功的数量
        error_count = len(results) - success_count
        
        if success_count > 0:
            # 至少有一条删除成功，从表格中移除行
            self._remove_rows_from_table(selected_rows)
            
            # 更新状态到主窗口状态栏
            remaining_rows = len(self.raw_data)
            if error_count > 0:
                self._show_status_to_main_window(f"删除完成: 成功 {success_count} 行，失败 {error_count} 行，剩余 {remaining_rows} 行")
                QMessageBox.warning(self, "删除部分成功", f"成功删除 {success_count} 行，失败 {error_count} 行")
            else:
                self._show_status_to_main_window(f"删除成功: 已删除 {success_count} 行，剩余 {remaining_rows} 行")
                QMessageBox.information(self, "删除成功", f"已成功删除 {success_count} 行数据")
        else:
            # 全部失败
            error_messages = [r[3] for r in results if r[3]]
            error_msg = error_messages[0] if error_messages else "未知错误"
            self._show_status_to_main_window(f"查询完成: {len(self.raw_data)} 行")
            QMessageBox.warning(self, "删除失败", f"删除数据失败: {error_msg}")
    
    def _remove_rows_from_table(self, selected_rows: List[int]):
        """从表格中移除指定的行（从后往前删除，避免索引变化）"""
        for row_idx in reversed(sorted(selected_rows)):
            if 0 <= row_idx < len(self.raw_data):
                # 从数据中移除
                self.raw_data.pop(row_idx)
                self.original_data.pop(row_idx)
                # 从表格中移除
                self.table.removeRow(row_idx)
                # 更新修改记录中的行号（如果有）
                keys_to_update = []
                for (r, c), (old_val, new_val) in list(self.modified_cells.items()):
                    if r > row_idx:
                        keys_to_update.append((r, c, old_val, new_val))
                for r, c, old_val, new_val in keys_to_update:
                    del self.modified_cells[(r, c)]
                    self.modified_cells[(r - 1, c)] = (old_val, new_val)
    
    def show_export_menu(self):
        """显示导出菜单"""
        menu = QMenu(self)
        
        csv_action = menu.addAction("导出为 CSV")
        csv_action.triggered.connect(lambda: self.export_to_csv())
        
        excel_action = menu.addAction("导出为 Excel")
        excel_action.triggered.connect(lambda: self.export_to_excel())
        
        # 显示菜单
        button_pos = self.export_btn.mapToGlobal(self.export_btn.rect().bottomLeft())
        menu.exec(button_pos)
    
    def export_to_csv(self):
        """导出为CSV"""
        if not self.raw_data:
            QMessageBox.warning(self, "警告", "没有数据可导出")
            return
        
        # 选择保存文件
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "导出为CSV",
            "",
            "CSV文件 (*.csv);;所有文件 (*)"
        )
        
        if not file_path:
            return
        
        try:
            # 获取列名
            if not self.raw_data:
                return
            
            columns = list(self.raw_data[0].keys())
            
            # 写入CSV文件
            with open(file_path, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=columns)
                writer.writeheader()
                
                # 写入数据
                for row in self.raw_data:
                    # 处理特殊类型（datetime, date, time, Decimal）
                    processed_row = {}
                    for key, value in row.items():
                        if isinstance(value, (datetime, date, time)):
                            processed_row[key] = value.isoformat()
                        elif isinstance(value, Decimal):
                            processed_row[key] = str(value)
                        elif value is None:
                            processed_row[key] = ''
                        else:
                            processed_row[key] = value
                    writer.writerow(processed_row)
            
            QMessageBox.information(self, "成功", f"数据已导出到: {file_path}")
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导出失败: {str(e)}")
    
    def export_to_excel(self):
        """导出为Excel"""
        if not self.raw_data:
            QMessageBox.warning(self, "警告", "没有数据可导出")
            return
        
        # 检查是否安装了 openpyxl
        try:
            import openpyxl
        except ImportError:
            QMessageBox.warning(
                self,
                "缺少依赖",
                "导出Excel需要安装 openpyxl 库。\n\n请运行: pip install openpyxl"
            )
            return
        
        # 选择保存文件
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "导出为Excel",
            "",
            "Excel文件 (*.xlsx);;所有文件 (*)"
        )
        
        if not file_path:
            return
        
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, Alignment
            
            # 创建工作簿
            wb = Workbook()
            ws = wb.active
            ws.title = "查询结果"
            
            # 获取列名
            if not self.raw_data:
                return
            
            columns = list(self.raw_data[0].keys())
            
            # 写入表头
            for col_idx, col_name in enumerate(columns, start=1):
                cell = ws.cell(row=1, column=col_idx, value=col_name)
                cell.font = Font(bold=True)
                cell.alignment = Alignment(horizontal='center', vertical='center')
            
            # 写入数据
            for row_idx, row_data in enumerate(self.raw_data, start=2):
                for col_idx, col_name in enumerate(columns, start=1):
                    value = row_data.get(col_name)
                    
                    # 处理特殊类型
                    if isinstance(value, (datetime, date, time)):
                        value = value.isoformat()
                    elif isinstance(value, Decimal):
                        value = float(value)
                    elif value is None:
                        value = ''
                    
                    ws.cell(row=row_idx, column=col_idx, value=value)
            
            # 自动调整列宽
            for col_idx, col_name in enumerate(columns, start=1):
                max_length = len(str(col_name))
                for row_idx in range(2, len(self.raw_data) + 2):
                    cell_value = ws.cell(row=row_idx, column=col_idx).value
                    if cell_value:
                        max_length = max(max_length, len(str(cell_value)))
                # 设置列宽（稍微宽一点）
                ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = min(max_length + 2, 50)
            
            # 保存文件
            wb.save(file_path)
            
            QMessageBox.information(self, "成功", f"数据已导出到: {file_path}")
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导出失败: {str(e)}")
    
    def clear_results(self):
        """清空结果"""
        self.table.setRowCount(0)
        self.table.setColumnCount(0)
        # 状态信息显示到主窗口状态栏
        self._show_status_to_main_window("等待查询结果...")
        # 禁用导出按钮
        self.export_btn.setEnabled(False)


class MultiResultTable(QWidget):
    """多结果表格（支持Tab切换）"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        self.result_tables: List[SingleResultTable] = []
        self.table_to_tab_index: Dict[str, int] = {}  # "connection_id:table_name" 到tab索引的映射
        self.tab_sql_map: Dict[int, str] = {}  # tab索引到SQL语句的映射
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setContentsMargins(5, 5, 5, 5)  # 减少外边距
        layout.setSpacing(0)  # 无间距
        self.setLayout(layout)
        
        # Tab控件
        self.tab_widget = QTabWidget()
        self.tab_widget.setTabsClosable(True)
        self.tab_widget.tabCloseRequested.connect(self.close_tab)
        # 设置tab bar的右键菜单，用于复制SQL
        self.tab_widget.tabBar().setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.tab_widget.tabBar().customContextMenuRequested.connect(self.on_tab_context_menu)
        # 使用事件过滤器来处理双击事件，用于复制SQL
        self.tab_widget.tabBar().installEventFilter(self)
        layout.addWidget(self.tab_widget)
    
    def _format_sql_title(self, sql: str, max_length: int = 40) -> str:
        """格式化SQL为tab标题"""
        sql_clean = sql.strip().replace('\n', ' ').replace('\r', ' ')
        # 移除多余空格
        sql_clean = ' '.join(sql_clean.split())
        
        if len(sql_clean) <= max_length:
            return sql_clean
        else:
            return sql_clean[:max_length] + "..."
    
    def eventFilter(self, obj, event):
        """事件过滤器，用于处理tab双击事件"""
        if obj == self.tab_widget.tabBar():
            from PyQt6.QtGui import QMouseEvent
            if event.type() == event.Type.MouseButtonDblClick:
                mouse_event = event
                if mouse_event.button() == Qt.MouseButton.LeftButton:
                    index = self.tab_widget.tabBar().tabAt(mouse_event.position().toPoint())
                    if index >= 0 and index in self.tab_sql_map:
                        self.copy_sql_to_clipboard(self.tab_sql_map[index])
                        return True
        return super().eventFilter(obj, event)
    
    def on_tab_context_menu(self, position):
        """Tab右键菜单，用于复制SQL和关闭操作"""
        tab_bar = self.tab_widget.tabBar()
        index = tab_bar.tabAt(position)
        if index < 0:
            return
        
        # 创建右键菜单
        menu = QMenu(self)
        
        # 复制SQL（如果该tab有SQL）
        if index in self.tab_sql_map:
            sql = self.tab_sql_map[index]
            copy_action = menu.addAction("复制SQL")
            copy_action.triggered.connect(lambda: self.copy_sql_to_clipboard(sql))
            menu.addSeparator()
        
        # 关闭相关菜单
        close_action = menu.addAction("关闭")
        close_action.triggered.connect(lambda: self.close_tab(index))
        
        # 如果只有一个tab，禁用"关闭其他"
        if self.tab_widget.count() > 1:
            close_others_action = menu.addAction("关闭其他")
            close_others_action.triggered.connect(lambda: self.close_other_tabs(index))
        
        # 如果只有一个tab，禁用"全部关闭"
        if self.tab_widget.count() > 1:
            menu.addSeparator()
            close_all_action = menu.addAction("全部关闭")
            close_all_action.triggered.connect(self.close_all_tabs)
        
        menu.exec(tab_bar.mapToGlobal(position))
    
    def copy_sql_to_clipboard(self, sql: str):
        """复制SQL到剪贴板"""
        from PyQt6.QtWidgets import QApplication
        clipboard = QApplication.clipboard()
        clipboard.setText(sql)
        # 显示简短提示
        QMessageBox.information(
            self,
            "已复制",
            f"SQL已复制到剪贴板\n\n{sql[:100]}{'...' if len(sql) > 100 else ''}"
        )
    
    def _extract_table_name(self, sql: str) -> Optional[str]:
        """
        从SQL中提取表名
        
        Args:
            sql: SQL语句
            
        Returns:
            表名，如果无法提取则返回None
        """
        sql_upper = sql.strip().upper()
        
        # 只处理SELECT查询
        if not sql_upper.startswith("SELECT"):
            return None
        
        # 尝试匹配 FROM table_name 或 FROM database.table_name
        # 匹配模式：FROM `database`.`table` 或 FROM database.table 或 FROM table
        patterns = [
            r'FROM\s+`?(\w+)`?\.`?(\w+)`?',  # FROM database.table 或 FROM `database`.`table`
            r'FROM\s+`?(\w+)`?',  # FROM table 或 FROM `table`
        ]
        
        for pattern in patterns:
            match = re.search(pattern, sql_upper, re.IGNORECASE)
            if match:
                if len(match.groups()) == 2:
                    # 返回 database.table 格式
                    return f"{match.group(1)}.{match.group(2)}"
                else:
                    # 返回表名
                    return match.group(1)
        
        return None
    
    def add_result(self, sql: str, data: Optional[List[Dict]] = None, 
                   error: Optional[str] = None, affected_rows: Optional[int] = None,
                   columns: Optional[List[str]] = None, connection_id: Optional[str] = None):
        """
        添加查询结果
        
        Args:
            sql: SQL语句（用于Tab标题）
            data: 查询结果数据
            error: 错误信息
            affected_rows: 影响的行数
            columns: 列名列表
            connection_id: 连接ID，用于区分不同连接的相同表名
        """
        # 尝试提取表名
        table_name = self._extract_table_name(sql)
        
        # 构建tab标识：使用 "connection_id:table_name" 格式，如果没有连接ID则只使用表名
        if table_name and connection_id:
            tab_key = f"{connection_id}:{table_name}"
        elif table_name:
            tab_key = table_name
        else:
            tab_key = None
        
        # 如果提取到表名，检查是否已存在该连接和表的tab
        if tab_key and tab_key in self.table_to_tab_index:
            tab_index = self.table_to_tab_index[tab_key]
            # 检查tab索引是否仍然有效
            if 0 <= tab_index < len(self.result_tables):
                # 更新现有tab的内容
                result_table = self.result_tables[tab_index]
                # 更新SQL和主窗口引用
                result_table.original_sql = sql
                result_table.main_window = getattr(self, '_main_window', None)
                result_table.display_results(data, error, affected_rows, columns)
                
                # 更新tab标题（可能SQL有变化）
                tab_title = self._format_sql_title(sql)
                self.tab_widget.setTabText(tab_index, tab_title)
                # 更新tooltip和SQL映射
                full_sql = sql.strip()
                self.tab_widget.setTabToolTip(tab_index, f"双击复制SQL\n\n{full_sql}")
                self.tab_sql_map[tab_index] = full_sql
                
                # 切换到该tab
                self.tab_widget.setCurrentIndex(tab_index)
                return
        
        # 创建新的结果表格（传递主窗口引用和SQL）
        result_table = SingleResultTable(
            parent=self,
            main_window=getattr(self, '_main_window', None),
            sql=sql
        )
        result_table.display_results(data, error, affected_rows, columns)
        
        # 生成Tab标题
        tab_title = self._format_sql_title(sql)
        
        # 添加Tab
        tab_index = self.tab_widget.addTab(result_table, tab_title)
        self.result_tables.append(result_table)
        
        # 设置tooltip显示完整SQL，并提示双击复制
        full_sql = sql.strip()
        self.tab_widget.setTabToolTip(tab_index, f"双击复制SQL\n\n{full_sql}")
        self.tab_sql_map[tab_index] = full_sql
        
        # 如果提取到表名，记录映射关系（使用连接ID和表名的组合）
        if tab_key:
            self.table_to_tab_index[tab_key] = tab_index
        
        # 切换到新Tab
        self.tab_widget.setCurrentIndex(tab_index)
    
    def close_tab(self, index: int):
        """关闭Tab"""
        if index < len(self.result_tables):
            # 从映射中移除该tab对应的表名
            table_name_to_remove = None
            for table_name, tab_idx in self.table_to_tab_index.items():
                if tab_idx == index:
                    table_name_to_remove = table_name
                    break
            
            if table_name_to_remove:
                del self.table_to_tab_index[table_name_to_remove]
                # 更新后续tab的索引
                for table_name in list(self.table_to_tab_index.keys()):
                    if self.table_to_tab_index[table_name] > index:
                        self.table_to_tab_index[table_name] -= 1
            
            # 从SQL映射中移除
            if index in self.tab_sql_map:
                del self.tab_sql_map[index]
                # 更新后续tab的索引
                for tab_idx in list(self.tab_sql_map.keys()):
                    if tab_idx > index:
                        self.tab_sql_map[tab_idx - 1] = self.tab_sql_map.pop(tab_idx)
            
            self.tab_widget.removeTab(index)
            self.result_tables.pop(index)
    
    def close_other_tabs(self, keep_index: int):
        """关闭除指定索引外的所有tab"""
        if keep_index < 0 or keep_index >= self.tab_widget.count():
            return
        
        # 从后往前关闭，避免索引变化
        for i in range(self.tab_widget.count() - 1, -1, -1):
            if i != keep_index:
                self.close_tab(i)
    
    def close_all_tabs(self):
        """关闭所有tab"""
        # 从后往前关闭所有tab
        for i in range(self.tab_widget.count() - 1, -1, -1):
            self.close_tab(i)
    
    def clear_all(self):
        """清空所有结果"""
        self.tab_widget.clear()
        self.result_tables.clear()
        self.table_to_tab_index.clear()
        self.tab_sql_map.clear()
    
    def display_results(
        self, 
        data: List[Dict], 
        error: Optional[str] = None,
        affected_rows: Optional[int] = None,
        sql: Optional[str] = None,
        columns: Optional[List[str]] = None
    ):
        """
        显示查询结果（兼容单结果模式）
        
        Args:
            data: 查询结果数据
            error: 错误信息
            affected_rows: 影响的行数
            sql: SQL语句（可选）
            columns: 列名列表（可选，用于无数据时显示表头）
        """
        if sql is None:
            sql = "查询结果"
        
        self.add_result(sql, data, error, affected_rows, columns)
    
    def clear_results(self):
        """清空结果（兼容旧接口）"""
        self.clear_all()

