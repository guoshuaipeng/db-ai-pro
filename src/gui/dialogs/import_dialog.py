"""
导入数据库连接对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QCheckBox,
    QLabel,
    QFileDialog,
    QMessageBox,
    QDialogButtonBox,
)
from PyQt6.QtCore import Qt
from typing import List
from src.core.database_connection import DatabaseConnection
from src.utils.navicat_importer import NavicatImporter


class ImportDialog(QDialog):
    """导入数据库连接对话框"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.importer = NavicatImporter()
        self.connections: List[DatabaseConnection] = []
        self.setWindowTitle("导入数据库连接")
        self.setModal(True)
        self.resize(600, 500)
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        self.setLayout(layout)
        
        # 说明标签
        info_label = QLabel(
            "从 Navicat 导入数据库连接。\n"
            "支持从注册表（Windows）或 .ncx 文件导入。\n"
            "您可以从 Navicat 导出连接为 .ncx 文件。\n\n"
            "注意：导入的连接不会测试连接，密码可能需要手动输入。\n"
            "导入后可以在主窗口中右键点击连接进行编辑。"
        )
        info_label.setWordWrap(True)
        info_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(info_label)
        
        # 导入按钮区域
        button_layout = QHBoxLayout()
        
        self.auto_import_btn = QPushButton("自动检测 Navicat 连接")
        self.auto_import_btn.clicked.connect(self.auto_import)
        button_layout.addWidget(self.auto_import_btn)
        
        self.file_import_btn = QPushButton("从 .ncx 文件导入")
        self.file_import_btn.clicked.connect(self.import_from_file)
        button_layout.addWidget(self.file_import_btn)
        
        button_layout.addStretch()
        layout.addLayout(button_layout)
        
        # 连接列表
        list_label = QLabel("找到的连接:")
        layout.addWidget(list_label)
        
        self.connection_list = QListWidget()
        self.connection_list.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        layout.addWidget(self.connection_list)
        
        # 全选/取消全选
        select_layout = QHBoxLayout()
        self.select_all_check = QCheckBox("全选")
        self.select_all_check.stateChanged.connect(self.on_select_all_changed)
        select_layout.addWidget(self.select_all_check)
        select_layout.addStretch()
        layout.addLayout(select_layout)
        
        # 状态标签
        self.status_label = QLabel("点击上方按钮开始导入")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.status_label)
        
        # 按钮
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)
    
    def auto_import(self):
        """自动导入 Navicat 连接"""
        self.status_label.setText("正在检测 Navicat 连接...")
        self.status_label.setStyleSheet("color: #2196F3; padding: 5px;")
        
        try:
            self.connections = self.importer.import_from_navicat()
            self.update_connection_list()
            
            if self.connections:
                self.status_label.setText(f"找到 {len(self.connections)} 个连接")
                self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
                self.select_all_check.setChecked(True)
            else:
                self.status_label.setText("未找到 Navicat 连接，请尝试从文件导入")
                self.status_label.setStyleSheet("color: #FF9800; padding: 5px;")
        
        except Exception as e:
            self.status_label.setText(f"导入失败: {str(e)}")
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
            QMessageBox.warning(self, "导入失败", f"导入 Navicat 连接时出错:\n{str(e)}")
    
    def import_from_file(self):
        """从文件导入"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "选择 Navicat 连接文件",
            "",
            "Navicat 连接文件 (*.ncx);;配置文件 (*.json *.xml);;所有文件 (*.*)"
        )
        
        if not file_path:
            return
        
        self.status_label.setText("正在从文件导入...")
        self.status_label.setStyleSheet("color: #2196F3; padding: 5px;")
        
        try:
            file_connections = self.importer.import_from_file(file_path)
            
            if file_connections:
                # 合并到现有连接列表
                existing_keys = {
                    (c.name, c.host, c.port, c.database) 
                    for c in self.connections
                }
                
                for conn in file_connections:
                    key = (conn.name, conn.host, conn.port, conn.database)
                    if key not in existing_keys:
                        self.connections.append(conn)
                
                self.update_connection_list()
                
                # 检查是否有 localhost 的连接（可能是解析问题）
                localhost_count = sum(1 for c in file_connections if c.host == "localhost")
                if localhost_count > 0:
                    self.status_label.setText(
                        f"从文件导入成功，共 {len(self.connections)} 个连接\n"
                        f"注意: {localhost_count} 个连接的主机地址为 localhost，可能需要手动检查"
                    )
                    self.status_label.setStyleSheet("color: #FF9800; padding: 5px;")
                else:
                    self.status_label.setText(f"从文件导入成功，共 {len(self.connections)} 个连接")
                    self.status_label.setStyleSheet("color: #4CAF50; padding: 5px;")
            else:
                self.status_label.setText("文件中未找到有效连接，请检查文件格式")
                self.status_label.setStyleSheet("color: #FF9800; padding: 5px;")
                QMessageBox.information(
                    self, 
                    "未找到连接", 
                    "文件中未找到有效连接。\n\n"
                    "请确认：\n"
                    "1. 文件是 Navicat 导出的 .ncx 文件\n"
                    "2. 文件中包含连接信息\n"
                    "3. 文件格式正确"
                )
        
        except Exception as e:
            self.status_label.setText(f"导入失败: {str(e)}")
            self.status_label.setStyleSheet("color: #d32f2f; padding: 5px;")
            QMessageBox.warning(self, "导入失败", f"从文件导入时出错:\n{str(e)}")
    
    def update_connection_list(self):
        """更新连接列表"""
        self.connection_list.clear()
        
        for conn in self.connections:
            item = QListWidgetItem(conn.get_display_name())
            item.setData(Qt.ItemDataRole.UserRole, conn)
            item.setCheckState(Qt.CheckState.Checked)
            self.connection_list.addItem(item)
    
    def on_select_all_changed(self, state):
        """全选/取消全选"""
        check_state = Qt.CheckState.Checked if state == Qt.CheckState.Checked.value else Qt.CheckState.Unchecked
        
        for i in range(self.connection_list.count()):
            item = self.connection_list.item(i)
            item.setCheckState(check_state)
    
    def get_selected_connections(self) -> List[DatabaseConnection]:
        """获取选中的连接"""
        selected = []
        
        for i in range(self.connection_list.count()):
            item = self.connection_list.item(i)
            if item.checkState() == Qt.CheckState.Checked:
                conn = item.data(Qt.ItemDataRole.UserRole)
                if conn:
                    selected.append(conn)
        
        return selected

