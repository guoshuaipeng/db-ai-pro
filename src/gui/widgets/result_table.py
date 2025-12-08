"""
查询结果表格组件
"""
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QLabel,
    QMessageBox,
    QApplication,
)
from PyQt6.QtCore import Qt
from typing import List, Dict, Optional
from src.utils.toast import show_toast


class ResultTable(QWidget):
    """查询结果表格"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 状态标签
        self.status_label = QLabel("等待查询结果...")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.status_label)
        
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
    
    def display_results(
        self, 
        data: List[Dict], 
        error: Optional[str] = None,
        affected_rows: Optional[int] = None
    ):
        """显示查询结果"""
        if error:
            self.status_label.setText(f"错误: {error}")
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            return
        
        if affected_rows is not None:
            self.status_label.setText(f"成功: 影响 {affected_rows} 行")
            self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
            self.table.setRowCount(0)
            self.table.setColumnCount(0)
            return
        
        if not data:
            self.status_label.setText("查询完成，无数据")
            self.status_label.setStyleSheet("color: #666; padding: 5px;")
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
        
        # 更新状态
        self.status_label.setText(f"查询完成: {len(data)} 行, {len(columns)} 列")
        self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
    
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

