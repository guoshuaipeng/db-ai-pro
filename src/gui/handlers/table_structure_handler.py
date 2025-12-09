"""
表结构管理处理器
"""
from PyQt6.QtWidgets import QMessageBox
from typing import TYPE_CHECKING
import logging

from src.gui.widgets.create_table_tab import CreateTableTab

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class TableStructureHandler:
    """表结构管理处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def show_create_table_dialog(self):
        """创建新建表tab"""
        if not self.main_window.current_connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        connection = self.main_window.db_manager.get_connection(self.main_window.current_connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "警告", "连接不存在")
            return
        
        if not self.main_window.current_database:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库")
            return
        
        # 创建新建表tab
        create_table_tab = CreateTableTab(
            self.main_window,
            db_manager=self.main_window.db_manager,
            connection_id=self.main_window.current_connection_id,
            database=self.main_window.current_database
        )
        create_table_tab.execute_sql_signal.connect(self.main_window.execute_query)
        
        # 添加到tab控件
        tab_index = self.main_window.right_tab_widget.addTab(create_table_tab, f"新建表 - {self.main_window.current_database}")
        self.main_window.right_tab_widget.setCurrentIndex(tab_index)
    
    def copy_table_structure(self, connection_id: str, database: str, table_name: str):
        """复制表结构（生成 CREATE TABLE 语句并复制到剪贴板）"""
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "错误", "连接不存在")
            return
        
        # 显示状态
        self.main_window.statusBar().showMessage(f"正在生成表 {table_name} 的结构...", 0)
        
        # 停止之前的 worker（如果存在）
        if hasattr(self.main_window, 'copy_structure_worker') and self.main_window.copy_structure_worker:
            try:
                if self.main_window.copy_structure_worker.isRunning():
                    self.main_window.copy_structure_worker.stop()
                    if not self.main_window.copy_structure_worker.wait(2000):
                        self.main_window.copy_structure_worker.terminate()
                        self.main_window.copy_structure_worker.wait(500)
                try:
                    self.main_window.copy_structure_worker.create_sql_ready.disconnect()
                    self.main_window.copy_structure_worker.error_occurred.disconnect()
                except:
                    pass
                self.main_window.copy_structure_worker.deleteLater()
            except RuntimeError:
                pass
            self.main_window.copy_structure_worker = None
        
        # 创建并启动工作线程
        from src.gui.workers.copy_table_structure_worker import CopyTableStructureWorker
        
        self.main_window.copy_structure_worker = CopyTableStructureWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            database,
            table_name,
            connection.db_type.value
        )
        self.main_window.copy_structure_worker.create_sql_ready.connect(
            lambda sql: self.on_create_sql_ready(sql, table_name)
        )
        self.main_window.copy_structure_worker.error_occurred.connect(
            lambda error: self.on_copy_structure_error(error, table_name)
        )
        self.main_window.copy_structure_worker.start()
    
    def on_create_sql_ready(self, create_sql: str, table_name: str):
        """CREATE TABLE 语句生成完成回调"""
        # 复制到剪贴板
        from PyQt6.QtWidgets import QApplication
        clipboard = QApplication.clipboard()
        clipboard.setText(create_sql)
        
        # 显示成功消息（状态栏提示，3秒后自动消失）
        self.main_window.statusBar().showMessage(f"复制成功：表 {table_name} 的结构已复制到剪贴板", 3000)
        
        # 清理 worker
        if self.main_window.copy_structure_worker:
            self.main_window.copy_structure_worker.deleteLater()
            self.main_window.copy_structure_worker = None
    
    def on_copy_structure_error(self, error: str, table_name: str):
        """复制表结构错误回调"""
        # 显示错误消息（状态栏提示，5秒后自动消失）
        self.main_window.statusBar().showMessage(f"复制失败：生成表 {table_name} 的结构失败 - {error}", 5000)
        
        # 清理 worker
        if self.main_window.copy_structure_worker:
            self.main_window.copy_structure_worker.deleteLater()
            self.main_window.copy_structure_worker = None
    
    def edit_table_structure(self, connection_id: str, database: str, table_name: str):
        """编辑表结构"""
        # 检查是否已经存在该表的编辑tab
        tab_title = f"编辑表 - {table_name}"
        for i in range(self.main_window.right_tab_widget.count()):
            if self.main_window.right_tab_widget.tabText(i) == tab_title:
                # 如果已存在，切换到该tab
                self.main_window.right_tab_widget.setCurrentIndex(i)
                return
        
        # 创建编辑表结构tab
        from src.gui.widgets.edit_table_tab import EditTableTab
        
        edit_table_tab = EditTableTab(
            parent=self.main_window,
            db_manager=self.main_window.db_manager,
            connection_id=connection_id,
            database=database,
            table_name=table_name
        )
        edit_table_tab.execute_sql_signal.connect(self.main_window.execute_query)
        
        # 添加到tab控件
        tab_index = self.main_window.right_tab_widget.addTab(edit_table_tab, tab_title)
        self.main_window.right_tab_widget.setCurrentIndex(tab_index)
    
    def _refresh_edit_table_tabs(self, sql: str):
        """刷新所有编辑表tab的表结构（当执行ALTER TABLE语句后）"""
        try:
            # 遍历所有tab，找到编辑表tab并刷新
            for i in range(self.main_window.right_tab_widget.count()):
                tab_widget = self.main_window.right_tab_widget.widget(i)
                if tab_widget and hasattr(tab_widget, 'table_name') and hasattr(tab_widget, 'load_table_schema'):
                    # 这是编辑表tab，强制从数据库重新获取表结构
                    tab_widget.load_table_schema(force_refresh=True)
                    logger.info(f"已自动刷新编辑表tab '{tab_widget.table_name}' 的表结构（从数据库重新获取）")
        except Exception as e:
            logger.error(f"刷新编辑表tab失败: {str(e)}")
    
    def close_query_tab(self, index: int):
        """关闭查询tab"""
        # 第一个tab（查询tab）不能关闭
        if index == 0:
            return
        
        # 获取要关闭的tab组件
        tab_widget = self.main_window.right_tab_widget.widget(index)
        
        # 如果是新建表tab或编辑表tab，清理资源
        if isinstance(tab_widget, CreateTableTab):
            tab_widget.cleanup()
        elif hasattr(tab_widget, 'cleanup') and hasattr(tab_widget, 'table_name'):
            # 编辑表tab
            tab_widget.cleanup()
        elif hasattr(tab_widget, '_query_worker'):
            # 新的查询tab，停止查询worker
            try:
                if tab_widget._query_worker and tab_widget._query_worker.isRunning():
                    tab_widget._query_worker.stop()
                    tab_widget._query_worker.wait(1000)
                    tab_widget._query_worker.deleteLater()
            except:
                pass
        
        self.main_window.right_tab_widget.removeTab(index)

