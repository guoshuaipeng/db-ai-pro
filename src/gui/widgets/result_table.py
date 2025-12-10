"""
查询结果表格组件
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QLabel,
    QMessageBox,
    QApplication,
    QPushButton,
    QLineEdit,
    QSpinBox,
)
from PyQt6.QtCore import Qt, QPropertyAnimation, QEasingCurve
from PyQt6.QtGui import QFont
from typing import List, Dict, Optional
from src.utils.toast import show_toast


class ResultTable(QWidget):
    """查询结果表格"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.animation = None  # 动画对象
        
        # 分页相关
        self.all_data = []  # 存储所有数据
        self.current_page = 1  # 当前页码
        self.page_size = 100  # 每页显示的行数
        self.total_pages = 1  # 总页数
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 状态标签
        self.status_label = QLabel("等待查询结果...")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.status_label)
        
        # 加载提示标签（默认隐藏）
        self.loading_label = QLabel("🔄 正在执行查询...")
        loading_font = QFont()
        loading_font.setPointSize(14)
        loading_font.setBold(True)
        self.loading_label.setFont(loading_font)
        self.loading_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_label.setStyleSheet("""
            QLabel {
                color: #1976D2;
                background-color: #E3F2FD;
                border: 2px solid #1976D2;
                border-radius: 8px;
                padding: 20px;
                margin: 20px;
            }
        """)
        self.loading_label.setVisible(False)
        layout.addWidget(self.loading_label)
        
        # 结果表格
        self.table = QTableWidget()
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        
        # 设置表头
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        header.setStretchLastSection(True)
        # 连接表头点击事件，点击列名时复制列名
        header.sectionClicked.connect(self.on_header_clicked)
        
        # 列的最大宽度（像素）
        self.max_column_width = 400
        
        layout.addWidget(self.table)
        
        # 分页控件
        self.pagination_widget = self._create_pagination_widget()
        self.pagination_widget.setVisible(False)  # 默认隐藏
        layout.addWidget(self.pagination_widget)
    
    def _create_pagination_widget(self):
        """创建分页控件"""
        widget = QWidget()
        layout = QHBoxLayout()
        layout.setContentsMargins(5, 5, 5, 5)
        widget.setLayout(layout)
        
        # 信息标签（显示当前页/总页数，以及行数范围）
        self.page_info_label = QLabel("第 1/1 页 (显示 0-0 行，共 0 行)")
        self.page_info_label.setStyleSheet("color: #666; font-size: 12px;")
        layout.addWidget(self.page_info_label)
        
        layout.addStretch()
        
        # 每页显示行数
        layout.addWidget(QLabel("每页显示:"))
        self.page_size_spin = QSpinBox()
        self.page_size_spin.setRange(10, 1000)
        self.page_size_spin.setSingleStep(10)
        self.page_size_spin.setValue(self.page_size)
        self.page_size_spin.setFixedWidth(80)
        self.page_size_spin.setToolTip("设置每页显示的行数")
        self.page_size_spin.valueChanged.connect(self._on_page_size_changed)
        layout.addWidget(self.page_size_spin)
        
        layout.addWidget(QLabel(" 行  "))
        
        # 首页按钮
        self.first_page_btn = QPushButton("首页")
        self.first_page_btn.setFixedWidth(60)
        self.first_page_btn.clicked.connect(self._go_first_page)
        layout.addWidget(self.first_page_btn)
        
        # 上一页按钮
        self.prev_page_btn = QPushButton("上一页")
        self.prev_page_btn.setFixedWidth(70)
        self.prev_page_btn.clicked.connect(self._go_prev_page)
        layout.addWidget(self.prev_page_btn)
        
        # 页码输入
        layout.addWidget(QLabel("第"))
        self.page_input = QLineEdit()
        self.page_input.setFixedWidth(50)
        self.page_input.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.page_input.setText("1")
        self.page_input.setToolTip("输入页码后按回车跳转")
        self.page_input.returnPressed.connect(self._on_page_input)
        layout.addWidget(self.page_input)
        
        self.total_pages_label = QLabel("/ 1 页")
        layout.addWidget(self.total_pages_label)
        
        # 下一页按钮
        self.next_page_btn = QPushButton("下一页")
        self.next_page_btn.setFixedWidth(70)
        self.next_page_btn.clicked.connect(self._go_next_page)
        layout.addWidget(self.next_page_btn)
        
        # 末页按钮
        self.last_page_btn = QPushButton("末页")
        self.last_page_btn.setFixedWidth(60)
        self.last_page_btn.clicked.connect(self._go_last_page)
        layout.addWidget(self.last_page_btn)
        
        return widget
    
    def _update_pagination_controls(self):
        """更新分页控件状态"""
        # 更新按钮状态
        self.first_page_btn.setEnabled(self.current_page > 1)
        self.prev_page_btn.setEnabled(self.current_page > 1)
        self.next_page_btn.setEnabled(self.current_page < self.total_pages)
        self.last_page_btn.setEnabled(self.current_page < self.total_pages)
        
        # 更新页码显示
        self.page_input.setText(str(self.current_page))
        self.total_pages_label.setText(f"/ {self.total_pages} 页")
        
        # 更新信息标签
        total_rows = len(self.all_data)
        if total_rows == 0:
            self.page_info_label.setText("第 0/0 页 (显示 0-0 行，共 0 行)")
        else:
            start_row = (self.current_page - 1) * self.page_size + 1
            end_row = min(self.current_page * self.page_size, total_rows)
            self.page_info_label.setText(
                f"第 {self.current_page}/{self.total_pages} 页 "
                f"(显示 {start_row}-{end_row} 行，共 {total_rows} 行)"
            )
    
    def _go_first_page(self):
        """跳转到首页"""
        if self.current_page != 1:
            self.current_page = 1
            self._display_current_page()
    
    def _go_prev_page(self):
        """上一页"""
        if self.current_page > 1:
            self.current_page -= 1
            self._display_current_page()
    
    def _go_next_page(self):
        """下一页"""
        if self.current_page < self.total_pages:
            self.current_page += 1
            self._display_current_page()
    
    def _go_last_page(self):
        """跳转到末页"""
        if self.current_page != self.total_pages:
            self.current_page = self.total_pages
            self._display_current_page()
    
    def _on_page_input(self):
        """处理页码输入"""
        try:
            page = int(self.page_input.text())
            if 1 <= page <= self.total_pages:
                self.current_page = page
                self._display_current_page()
            else:
                show_toast(self, f"页码必须在 1-{self.total_pages} 之间", "warning")
                self.page_input.setText(str(self.current_page))
        except ValueError:
            show_toast(self, "请输入有效的页码", "warning")
            self.page_input.setText(str(self.current_page))
    
    def _on_page_size_changed(self, new_size):
        """每页显示行数改变"""
        self.page_size = new_size
        # 重新计算总页数
        if self.all_data:
            self.total_pages = max(1, (len(self.all_data) + self.page_size - 1) // self.page_size)
            # 调整当前页码（如果超出范围）
            if self.current_page > self.total_pages:
                self.current_page = self.total_pages
            self._display_current_page()
    
    def _display_current_page(self):
        """显示当前页的数据"""
        if not self.all_data:
            return
        
        # 计算当前页的数据范围
        start_idx = (self.current_page - 1) * self.page_size
        end_idx = min(start_idx + self.page_size, len(self.all_data))
        page_data = self.all_data[start_idx:end_idx]
        
        # 显示数据（不触发动画）
        self._fill_table(page_data)
        
        # 更新分页控件
        self._update_pagination_controls()
    
    def show_loading(self):
        """显示加载状态（淡出表格，显示加载提示）"""
        # 停止之前的动画
        if self.animation and self.animation.state() == QPropertyAnimation.State.Running:
            self.animation.stop()
        
        # 创建淡出动画
        self.animation = QPropertyAnimation(self.table, b"windowOpacity")
        self.animation.setDuration(200)  # 200ms
        self.animation.setStartValue(1.0)
        self.animation.setEndValue(0.3)  # 淡化到30%透明度
        self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        
        # 动画结束后显示加载提示
        def on_fade_out_finished():
            self.loading_label.setVisible(True)
            self.status_label.setText("执行中...")
            self.status_label.setStyleSheet("color: #1976D2; padding: 5px;")
        
        self.animation.finished.connect(on_fade_out_finished)
        self.animation.start()
    
    def hide_loading(self):
        """隐藏加载状态（淡入表格，隐藏加载提示）"""
        # 隐藏加载提示
        self.loading_label.setVisible(False)
        
        # 停止之前的动画
        if self.animation and self.animation.state() == QPropertyAnimation.State.Running:
            self.animation.stop()
        
        # 创建淡入动画
        self.animation = QPropertyAnimation(self.table, b"windowOpacity")
        self.animation.setDuration(300)  # 300ms
        self.animation.setStartValue(0.3)
        self.animation.setEndValue(1.0)  # 完全不透明
        self.animation.setEasingCurve(QEasingCurve.Type.InCubic)
        self.animation.start()
    
    def display_results(
        self, 
        data: List[Dict], 
        error: Optional[str] = None,
        affected_rows: Optional[int] = None
    ):
        """显示查询结果"""
        # 先隐藏加载状态，显示淡入动画
        self.hide_loading()
        
        if error:
            self.status_label.setText(f"错误: {error}")
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            self.pagination_widget.setVisible(False)
            self.all_data = []
            return
        
        if affected_rows is not None:
            self.status_label.setText(f"成功: 影响 {affected_rows} 行")
            self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            self.pagination_widget.setVisible(False)
            self.all_data = []
            return
        
        if not data:
            self.status_label.setText("查询完成，无数据")
            self.status_label.setStyleSheet("color: #666; padding: 5px;")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            self.pagination_widget.setVisible(False)
            self.all_data = []
            return
        
        # 保存所有数据
        self.all_data = data
        self.current_page = 1
        
        # 计算总页数
        self.total_pages = max(1, (len(data) + self.page_size - 1) // self.page_size)
        
        # 显示分页控件（如果数据超过一页）
        self.pagination_widget.setVisible(len(data) > self.page_size)
        
        # 显示第一页数据
        self._display_current_page()
        
        # 更新状态标签
        total_rows = len(data)
        if total_rows <= self.page_size:
            self.status_label.setText(f"查询完成: {total_rows} 行")
        else:
            self.status_label.setText(f"查询完成: 共 {total_rows} 行，显示前 {min(self.page_size, total_rows)} 行")
        self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
    
    def _fill_table(self, data: List[Dict]):
        """填充表格数据（内部方法，用于分页）"""
        if not data:
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            return
        
        # 获取列名
        columns = list(data[0].keys())
        
        # 设置表格
        self.table.setColumnCount(len(columns))
        self.table.setRowCount(len(data))
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
                
                self.table.setItem(row_idx, col_idx, item)
        
        # 调整列宽（带最大宽度限制）
        self._resize_columns_with_max_width()
    
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
    
    def clear_results(self):
        """清空结果"""
        self.table.setRowCount(0)
        self.table.setColumnCount(0)
        self.status_label.setText("等待查询结果...")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
    
    def export_to_csv(self, filename: str) -> bool:
        """导出为CSV"""
        try:
            import csv
            
            # 获取列名
            columns = []
            for col in range(self.table.columnCount()):
                header = self.table.horizontalHeaderItem(col)
                if header:
                    columns.append(header.text())
            
            if not columns:
                return False
            
            # 写入CSV
            with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=columns)
                writer.writeheader()
                
                for row in range(self.table.rowCount()):
                    row_data = {}
                    for col in range(self.table.columnCount()):
                        header = self.table.horizontalHeaderItem(col)
                        item = self.table.item(row, col)
                        if header and item:
                            row_data[header.text()] = item.text()
                    writer.writerow(row_data)
            
            return True
        except Exception as e:
            QMessageBox.warning(self, "导出失败", f"导出CSV失败: {str(e)}")
            return False

