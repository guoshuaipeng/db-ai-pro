"""
AI模型管理对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QLabel,
    QMessageBox,
    QGroupBox,
    QSplitter,
    QTextEdit,
)
from PyQt6.QtCore import Qt
from src.core.ai_model_config import AIModelConfig
from src.core.ai_model_storage import AIModelStorage
from src.core.ai_token_stats import TokenStatsStorage
from src.gui.dialogs.ai_model_dialog import AIModelDialog
from src.gui.dialogs.prompt_config_dialog import PromptConfigDialog


class AIModelManagerDialog(QDialog):
    """AI模型管理对话框"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("AI模型配置管理")
        self.setModal(True)
        self.setMinimumSize(900, 600)
        self.storage = AIModelStorage()
        self.token_storage = TokenStatsStorage()
        self.models: list[AIModelConfig] = []
        self.init_ui()
        self.load_models()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(8)  # 减少整体间距
        layout.setContentsMargins(10, 8, 10, 8)  # 减少外边距
        self.setLayout(layout)
        
        # 说明区域 - 使用更紧凑的布局
        info_layout = QHBoxLayout()
        info_layout.setSpacing(8)
        info_layout.setContentsMargins(0, 0, 0, 0)
        
        # 左侧：说明文字
        info_text = QLabel("💡 管理AI模型配置：可以添加多个模型配置，并设置默认使用的模型。右侧可查看Token使用统计。")
        info_text.setWordWrap(True)
        info_text.setStyleSheet("color: #666; padding: 4px 8px;")
        info_layout.addWidget(info_text, 1)
        
        # 右侧：模型数量显示（动态更新）
        self.model_count_label = QLabel("")
        self.model_count_label.setStyleSheet("color: #2196F3; font-weight: bold; padding: 4px 8px;")
        self.model_count_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        info_layout.addWidget(self.model_count_label)
        
        layout.addLayout(info_layout)
        
        # 使用分割器，左侧是模型列表，右侧是统计信息
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # 左侧：模型列表
        list_group = QGroupBox("模型配置列表")
        list_layout = QVBoxLayout()
        list_layout.setSpacing(6)
        list_layout.setContentsMargins(8, 8, 8, 8)
        
        self.model_list = QListWidget()
        self.model_list.itemDoubleClicked.connect(self.on_item_double_clicked)
        self.model_list.currentItemChanged.connect(self.on_model_selected)
        list_layout.addWidget(self.model_list)
        
        # 按钮
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(6)
        btn_layout.setContentsMargins(0, 0, 0, 0)
        
        add_btn = QPushButton("添加")
        add_btn.clicked.connect(self.add_model)
        btn_layout.addWidget(add_btn)
        
        self.edit_btn = QPushButton("编辑")
        self.edit_btn.clicked.connect(self.edit_selected_model)
        btn_layout.addWidget(self.edit_btn)
        
        delete_btn = QPushButton("删除")
        delete_btn.clicked.connect(self.delete_selected_model)
        btn_layout.addWidget(delete_btn)
        
        set_default_btn = QPushButton("设为默认")
        set_default_btn.clicked.connect(self.set_default_model)
        btn_layout.addWidget(set_default_btn)
        
        prompt_btn = QPushButton("编辑提示词")
        prompt_btn.clicked.connect(self.edit_prompts)
        btn_layout.addWidget(prompt_btn)
        
        btn_layout.addStretch()
        
        list_layout.addLayout(btn_layout)
        list_group.setLayout(list_layout)
        splitter.addWidget(list_group)
        
        # 右侧：Token统计信息
        stats_group = QGroupBox("Token使用统计")
        stats_layout = QVBoxLayout()
        stats_layout.setSpacing(6)
        stats_layout.setContentsMargins(8, 8, 8, 8)
        
        self.stats_text = QTextEdit()
        self.stats_text.setReadOnly(True)
        self.stats_text.setMaximumWidth(300)
        self.stats_text.setPlaceholderText("选择模型查看Token使用统计")
        stats_layout.addWidget(self.stats_text)
        
        # 清空统计按钮
        self.clear_stats_btn = QPushButton("清空统计")
        self.clear_stats_btn.clicked.connect(self.clear_current_stats)
        stats_layout.addWidget(self.clear_stats_btn)
        
        stats_group.setLayout(stats_layout)
        splitter.addWidget(stats_group)
        
        # 设置分割器比例
        splitter.setStretchFactor(0, 2)
        splitter.setStretchFactor(1, 1)
        
        layout.addWidget(splitter)
        
        # 底部按钮
        button_layout = QHBoxLayout()
        button_layout.setSpacing(8)
        button_layout.setContentsMargins(0, 8, 0, 0)
        button_layout.addStretch()
        
        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)
        
        layout.addLayout(button_layout)
    
    def load_models(self):
        """加载模型列表"""
        self.models = self.storage.load_models()
        self.refresh_list()
        # 加载后显示第一个模型的统计
        if self.model_list.count() > 0:
            self.model_list.setCurrentRow(0)
    
    def on_model_selected(self, current: QListWidgetItem, previous: QListWidgetItem):
        """模型选择改变时更新统计信息和按钮状态"""
        if not current:
            self.stats_text.clear()
            self.edit_btn.setEnabled(False)
            return
        
        model_id = current.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        
        # 更新统计信息
        self.update_stats_display(model_id)
        
        # 默认模型也允许编辑
        self.edit_btn.setEnabled(True)
        self.edit_btn.setToolTip("")
    
    def on_item_double_clicked(self, item: QListWidgetItem):
        """列表项双击事件"""
        model_id = item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        
        self.edit_model(item)
    
    def update_stats_display(self, model_id: str):
        """更新统计信息显示"""
        stats = self.token_storage.get_stats(model_id)
        
        # 转换为千token单位
        total_k_tokens = stats.total_tokens / 1000.0
        prompt_k_tokens = stats.prompt_tokens / 1000.0
        completion_k_tokens = stats.completion_tokens / 1000.0
        
        stats_text = f"""<h3>Token使用统计</h3>
<p><b>总Token数:</b> {total_k_tokens:,.2f} K</p>
<p><b>输入Token:</b> {prompt_k_tokens:,.2f} K</p>
<p><b>输出Token:</b> {completion_k_tokens:,.2f} K</p>
<p><b>请求次数:</b> {stats.request_count:,}</p>
"""
        
        if stats.last_used:
            from datetime import datetime
            try:
                last_used_dt = datetime.fromisoformat(stats.last_used)
                last_used_str = last_used_dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                last_used_str = stats.last_used
            stats_text += f"<p><b>最后使用:</b> {last_used_str}</p>"
        else:
            stats_text += "<p><b>最后使用:</b> 从未使用</p>"
        
        if stats.total_tokens == 0:
            stats_text += "<p><i>该模型尚未使用</i></p>"
        
        self.stats_text.setHtml(stats_text)
    
    def clear_current_stats(self):
        """清空当前选中模型的Token统计"""
        current_item = self.model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型配置")
            return
        
        model_id = current_item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        if not model:
            return
        
        reply = QMessageBox.question(
            self,
            "确认清空",
            f"确定要清空模型 '{model.name}' 的Token使用统计吗？\n\n此操作不可撤销！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.token_storage.clear_stats(model_id)
            # 刷新统计显示
            self.update_stats_display(model_id)
            QMessageBox.information(self, "成功", "Token统计已清空")
    
    def refresh_list(self):
        """刷新列表显示"""
        from src.core.default_ai_model import DEFAULT_MODEL_ID
        
        current_id = None
        current_item = self.model_list.currentItem()
        if current_item:
            current_id = current_item.data(Qt.ItemDataRole.UserRole)
        
        self.model_list.clear()
        for model in self.models:
            item = QListWidgetItem()
            display_text = model.name
            if model.is_default:
                display_text += " [默认]"
            if not model.is_active:
                display_text += " [未激活]"
            item.setText(display_text)
            item.setData(Qt.ItemDataRole.UserRole, model.id)
            self.model_list.addItem(item)
            
            # 恢复选中项
            if current_id and model.id == current_id:
                self.model_list.setCurrentItem(item)
        
        # 更新模型数量显示
        total_count = len(self.models)
        active_count = sum(1 for m in self.models if m.is_active)
        default_count = sum(1 for m in self.models if m.is_default and m.is_active)
        
        if total_count == 0:
            self.model_count_label.setText("暂无配置")
        else:
            count_text = f"共 {total_count} 个"
            if active_count != total_count:
                count_text += f" | 激活 {active_count} 个"
            if default_count > 0:
                count_text += f" | 默认 {default_count} 个"
            self.model_count_label.setText(count_text)
        
        # 如果没有选中项，选中第一个并显示统计
        if self.model_list.count() > 0 and not self.model_list.currentItem():
            self.model_list.setCurrentRow(0)
            first_item = self.model_list.item(0)
            if first_item:
                model_id = first_item.data(Qt.ItemDataRole.UserRole)
                self.update_stats_display(model_id)
    
    def add_model(self):
        """添加模型"""
        dialog = AIModelDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_model = dialog.get_model()
            
            # 如果设置为默认，取消其他模型的默认标记
            if new_model.is_default:
                for m in self.models:
                    m.is_default = False
            self.models.append(new_model)
            
            # 立即保存到磁盘
            if self.storage.save_models(self.models):
                self.refresh_list()
                QMessageBox.information(self, "成功", "模型配置已添加并保存")
            else:
                # 保存失败，撤销添加
                self.models.pop()
                QMessageBox.warning(self, "错误", "保存模型配置失败")
    
    def edit_selected_model(self):
        """编辑选中的模型"""
        current_item = self.model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型配置")
            return
        
        model_id = current_item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        if not model:
            return
        
        # 检查是否为默认模型（硬编码的默认模型不允许编辑）
        from src.core.default_ai_model import DEFAULT_MODEL_ID
        if model.id == DEFAULT_MODEL_ID or model.is_default:
            QMessageBox.warning(
                self,
                "提示",
                "默认模型不允许编辑。\n\n"
                "默认模型是硬编码在程序中的，无法修改。\n"
                "您可以添加新的模型配置。"
            )
            return
        
        self.edit_model(current_item)
    
    def edit_model(self, item: QListWidgetItem):
        """编辑模型"""
        model_id = item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        if not model:
            return
        
        # 保存原始模型以便失败时恢复
        original_model = model
        original_index = next(i for i, m in enumerate(self.models) if m.id == model_id)
        
        dialog = AIModelDialog(self, model)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            updated_model = dialog.get_model()
            
            # 更新模型
            self.models[original_index] = updated_model
            
            # 确保仅有一个默认模型
            if updated_model.is_default:
                for m in self.models:
                    if m.id != updated_model.id:
                        m.is_default = False
            
            # 立即保存到磁盘
            if self.storage.save_models(self.models):
                self.refresh_list()
                QMessageBox.information(self, "成功", "模型配置已更新并保存")
            else:
                # 保存失败，恢复原始模型
                self.models[original_index] = original_model
                QMessageBox.warning(self, "错误", "保存模型配置失败")
    
    def delete_selected_model(self):
        """删除选中的模型"""
        current_item = self.model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型配置")
            return
        
        model_id = current_item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        if not model:
            return
        
        # 默认模型不允许删除，防止无默认可用
        if model.is_default:
            QMessageBox.warning(
                self,
                "提示",
                "默认模型不允许删除。\n\n"
                "请先将其他模型设为默认，再删除当前模型。"
            )
            return
        
        reply = QMessageBox.question(
            self,
            "确认删除",
            f"确定要删除模型配置 '{model.name}' 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # 保存原始列表以便失败时恢复
            original_models = self.models.copy()
            
            # 删除模型
            self.models = [m for m in self.models if m.id != model_id]
            
            # 立即保存到磁盘
            if self.storage.save_models(self.models):
                self.refresh_list()
                QMessageBox.information(self, "成功", "模型配置已删除")
            else:
                # 保存失败，恢复原始列表
                self.models = original_models
                QMessageBox.warning(self, "错误", "删除模型配置失败")
    
    def set_default_model(self):
        """设置默认模型"""
        current_item = self.model_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "警告", "请先选择一个模型配置")
            return
        
        model_id = current_item.data(Qt.ItemDataRole.UserRole)
        model = next((m for m in self.models if m.id == model_id), None)
        if not model:
            return
        
        # 保存原始状态以便失败时恢复
        original_defaults = {m.id: m.is_default for m in self.models}
        
        # 将选中的模型设为默认，其他取消默认
        for m in self.models:
            m.is_default = (m.id == model_id)
        
        # 立即保存到磁盘
        if self.storage.save_models(self.models):
            self.refresh_list()
            QMessageBox.information(self, "成功", "默认模型已设置并保存")
        else:
            # 保存失败，恢复原始状态
            for m in self.models:
                m.is_default = original_defaults[m.id]
            QMessageBox.warning(self, "错误", "设置默认模型失败")
    
    def edit_prompts(self):
        """编辑提示词"""
        dialog = PromptConfigDialog(self)
        dialog.exec()

