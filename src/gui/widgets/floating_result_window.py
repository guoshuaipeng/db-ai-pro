"""
浮动结果窗口（独立窗口显示查询结果）
"""
from PyQt6.QtWidgets import (
    QMainWindow,
    QVBoxLayout,
    QWidget,
    QToolBar,
    QPushButton,
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QIcon, QAction
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class FloatingResultWindow(QMainWindow):
    """浮动查询结果窗口"""
    
    # 信号：窗口关闭时发出
    window_closed = pyqtSignal()
    
    def __init__(self, sql: str, data: List[Dict], columns: Optional[List[str]] = None, 
                 main_window=None, parent=None):
        """
        初始化浮动结果窗口
        
        Args:
            sql: SQL 查询语句
            data: 查询结果数据
            columns: 列名列表
            main_window: 主窗口引用（用于执行查询等操作）
            parent: 父窗口
        """
        super().__init__(parent)
        self.sql = sql
        self.data = data
        self.columns = columns
        self.main_window = main_window
        self.query_worker = None  # 查询工作线程
        
        self.init_ui()
        self.display_results()
    
    def init_ui(self):
        """初始化UI"""
        # 设置窗口标题
        sql_short = self.sql[:50] + "..." if len(self.sql) > 50 else self.sql
        self.setWindowTitle(f"查询结果 - {sql_short}")
        
        # 设置窗口大小
        self.resize(1200, 800)
        
        # 创建状态栏
        self.statusBar().showMessage("就绪")
        
        # 创建中央部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout()
        central_widget.setLayout(layout)
        
        # 创建工具栏
        self._create_toolbar()
        
        # 创建查询结果表格
        from src.gui.widgets.multi_result_table import SingleResultTable
        self.result_table = SingleResultTable(
            parent=self,
            main_window=self.main_window,
            sql=self.sql
        )
        # 设置刷新函数，使表格的刷新操作在新窗口中执行
        self.result_table.execute_query_func = self._execute_query_from_table
        layout.addWidget(self.result_table)
        
        # 设置窗口保持在最前面（可选）
        # self.setWindowFlags(self.windowFlags() | Qt.WindowType.WindowStaysOnTopHint)
    
    def _create_toolbar(self):
        """创建工具栏"""
        toolbar = QToolBar()
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        
        # 刷新按钮
        refresh_action = QAction("🔄 刷新", self)
        refresh_action.setToolTip("重新执行查询")
        refresh_action.triggered.connect(self.refresh_results)
        toolbar.addAction(refresh_action)
        
        toolbar.addSeparator()
        
        # 导出按钮
        export_action = QAction("📤 导出", self)
        export_action.setToolTip("导出查询结果")
        export_action.triggered.connect(self.show_export_menu)
        toolbar.addAction(export_action)
        
        toolbar.addSeparator()
        
        # 置顶按钮
        self.pin_action = QAction("📌 置顶", self)
        self.pin_action.setToolTip("窗口置顶")
        self.pin_action.setCheckable(True)
        self.pin_action.triggered.connect(self.toggle_stay_on_top)
        toolbar.addAction(self.pin_action)
    
    def display_results(self):
        """显示查询结果"""
        # 获取连接信息（如果有主窗口的话）
        connection_string = None
        connect_args = None
        
        if self.main_window and hasattr(self.main_window, 'db_manager'):
            connection_id = getattr(self.main_window, 'current_connection_id', None)
            if connection_id:
                connection = self.main_window.db_manager.get_connection(connection_id)
                if connection:
                    connection_string = connection.get_connection_string()
                    connect_args = connection.get_connect_args()
        
        # 显示结果
        self.result_table.display_results(
            self.data,
            error=None,
            affected_rows=None,
            columns=self.columns,
            connection_string=connection_string,
            connect_args=connect_args
        )
    
    def refresh_results(self):
        """刷新查询结果（在新窗口中执行查询）"""
        if not self.main_window:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.information(self, "提示", "无法刷新：缺少主窗口引用")
            return
        
        # 获取连接信息
        connection_id = getattr(self.main_window, 'current_connection_id', None)
        if not connection_id:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "错误", "无法获取数据库连接")
            return
        
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "错误", "数据库连接不存在")
            return
        
        # 在新窗口中执行查询
        self._execute_query_in_window(connection, self.sql)
    
    def _execute_query_from_table(self, sql: str):
        """从表格触发的查询（用于表格的刷新功能）"""
        if not self.main_window:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.information(self, "提示", "无法执行查询：缺少主窗口引用")
            return
        
        # 获取连接信息
        connection_id = getattr(self.main_window, 'current_connection_id', None)
        if not connection_id:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "错误", "无法获取数据库连接")
            return
        
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "错误", "数据库连接不存在")
            return
        
        # 更新SQL（如果传入的SQL不同）
        if sql != self.sql:
            self.sql = sql
            sql_short = self.sql[:50] + "..." if len(self.sql) > 50 else self.sql
            self.setWindowTitle(f"查询结果 - {sql_short}")
        
        # 在新窗口中执行查询
        self._execute_query_in_window(connection, sql)
    
    def show_export_menu(self):
        """显示导出菜单"""
        if hasattr(self.result_table, 'show_export_menu'):
            self.result_table.show_export_menu()
    
    def toggle_stay_on_top(self, checked: bool):
        """切换窗口置顶状态"""
        if checked:
            self.setWindowFlags(self.windowFlags() | Qt.WindowType.WindowStaysOnTopHint)
            self.pin_action.setText("📌 取消置顶")
        else:
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowStaysOnTopHint)
            self.pin_action.setText("📌 置顶")
        
        # 重新显示窗口（setWindowFlags 会隐藏窗口）
        self.show()
    
    def _execute_query_in_window(self, connection, sql: str):
        """在新窗口中执行查询并更新结果"""
        # 停止之前的查询（如果有）
        if self.query_worker and self.query_worker.isRunning():
            self.query_worker.stop()
            try:
                self.query_worker.wait(1000)
                if self.query_worker.isRunning():
                    self.query_worker.terminate()
                    self.query_worker.wait(500)
            except KeyboardInterrupt:
                logger.warning("等待查询中断")
                pass
            except Exception as e:
                logger.warning(f"停止查询失败: {str(e)}")
        
        # 显示加载状态
        self.statusBar().showMessage("正在刷新查询结果...", 0)
        
        # 创建查询工作线程
        from src.gui.workers.query_worker import QueryWorker
        self.query_worker = QueryWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            sql,
            is_query=True
        )
        
        # 连接信号
        self.query_worker.query_finished.connect(self._on_query_finished)
        
        # 启动查询
        self.query_worker.start()
        logger.info(f"启动查询: {sql[:100]}")
    
    def _on_query_finished(self, success: bool, data, error, affected_rows, columns=None):
        """查询完成回调"""
        try:
            if success and data is not None:
                # 更新数据
                self.data = data
                self.columns = columns
                
                # 获取连接信息
                connection_string = None
                connect_args = None
                if self.main_window and hasattr(self.main_window, 'db_manager'):
                    connection_id = getattr(self.main_window, 'current_connection_id', None)
                    if connection_id:
                        connection = self.main_window.db_manager.get_connection(connection_id)
                        if connection:
                            connection_string = connection.get_connection_string()
                            connect_args = connection.get_connect_args()
                
                # 重新显示结果
                self.result_table.display_results(
                    data,
                    error=None,
                    affected_rows=None,
                    columns=columns,
                    connection_string=connection_string,
                    connect_args=connect_args
                )
                
                self.statusBar().showMessage(f"刷新完成: {len(data)} 行", 3000)
                logger.info(f"刷新完成: {len(data)} 行")
            elif success and affected_rows is not None:
                self.statusBar().showMessage(f"执行成功: 影响 {affected_rows} 行", 3000)
            else:
                from PyQt6.QtWidgets import QMessageBox
                QMessageBox.warning(self, "查询失败", f"刷新失败: {error}")
                self.statusBar().showMessage(f"刷新失败: {error}", 5000)
        except Exception as e:
            logger.error(f"处理查询结果失败: {str(e)}", exc_info=True)
            self.statusBar().showMessage(f"处理结果失败: {str(e)}", 5000)
        finally:
            # 清理worker
            if self.query_worker:
                try:
                    self.query_worker.query_finished.disconnect()
                except:
                    pass
                self.query_worker.deleteLater()
                self.query_worker = None
    
    def closeEvent(self, event):
        """窗口关闭事件"""
        # 停止正在运行的查询
        if self.query_worker and self.query_worker.isRunning():
            self.query_worker.stop()
            try:
                self.query_worker.wait(500)
            except:
                pass
        
        # 发出信号通知窗口已关闭
        self.window_closed.emit()
        super().closeEvent(event)

