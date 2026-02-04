"""
DataAI - AI驱动的数据库管理工具主窗口
"""
from PyQt6.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QSplitter,
    QTreeWidgetItem,
    QMenuBar,
    QStatusBar,
    QToolBar,
    QPushButton,
    QComboBox,
    QMessageBox,
    QDialog,
    QLabel,
    QTabWidget,
    QApplication,
    QSizePolicy,
)
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QThread, QTimer, QEvent, QPoint, QRect
from PyQt6.QtGui import QAction, QIcon, QFont
from typing import Optional, List

from src.config.settings import Settings
from src.core.database_manager import DatabaseManager
from src.core.database_connection import DatabaseConnection, DatabaseType
from src.core.i18n import TranslationManager
from src.core.simple_i18n import get_i18n
from src.gui.dialogs.connection_dialog import ConnectionDialog
from src.gui.dialogs.import_dialog import ImportDialog
from src.gui.dialogs.settings_dialog import SettingsDialog
from src.gui.widgets.sql_editor import SQLEditor
from src.gui.widgets.multi_result_table import MultiResultTable
from src.gui.widgets.connection_tree_with_search import ConnectionTreeWithSearch
from src.gui.widgets.create_table_tab import CreateTableTab
from src.gui.workers.query_worker import QueryWorker
from src.gui.workers.connection_test_worker import ConnectionTestWorker
from src.gui.workers.connection_init_worker import ConnectionInitWorker
from src.gui.utils.tree_item_types import TreeItemType, TreeItemData
from src.utils.ui_helpers import (
    get_database_icon, 
    get_database_icon_simple,
    get_connection_icon,
    get_table_icon,
    get_category_icon,
    format_connection_display
)
from src.utils.thread_manager import get_thread_manager, safe_delete_thread
import logging

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    """DataAI - AI驱动的数据库管理工具主窗口"""
    
    def tr(self, source: str, disambiguation: str = None, n: int = -1) -> str:
        """
        重写 tr() 方法，使用简单翻译系统
        这样就不需要 .qm 文件了
        """
        # 先尝试使用 PyQt6 的翻译系统（如果有 .qm 文件）
        translated = super().tr(source, disambiguation, n)
        
        # 如果翻译结果和源文本相同（说明没有翻译），尝试使用简单翻译系统
        if translated == source:
            try:
                i18n = get_i18n()
                if i18n and i18n.current_language != "zh_CN":
                    # 使用类名作为上下文
                    context = self.__class__.__name__
                    translated = i18n.translate(context, source)
            except Exception:
                pass  # 如果获取失败，使用原文本
        
        return translated
    
    def __init__(self, settings: Settings, translation_manager: TranslationManager = None):
        super().__init__()
        self.connection_tree = None
        self.settings = settings
        self.translation_manager = translation_manager
        self.db_manager = DatabaseManager()
        from src.core.ai_model_storage import AIModelStorage
        self.ai_model_storage = AIModelStorage()
        self.current_connection_id: str = None
        self.current_database: Optional[str] = None  # 当前数据库
        self.current_ai_model_id: Optional[str] = None  # 当前选择的AI模型ID
        self.query_worker: Optional[QueryWorker] = None  # 查询工作线程
        self.completion_worker = None  # 自动完成更新工作线程
        self.preload_worker = None  # 预加载工作线程
        self.connection_test_worker = None  # 连接测试工作线程
        self.connection_init_worker = None  # 连接初始化工作线程
        self.database_list_workers = {}  # 数据库列表工作线程字典 {connection_id: worker}
        self.table_list_worker_for_tree = None  # 表列表工作线程（用于树视图）
        self.redis_data_worker = None  # Redis 数据查询工作线程
        self._query_table_timer = None  # 用于防抖的定时器
        self._is_closing = False
        # Tab 拖出为独立窗口：拖拽状态
        self._tab_drag_start_index = -1
        self._tab_drag_start_global: Optional[QPoint] = None
        self._tab_detaching = False
        self._floating_tab_windows: List = []  # 已拖出的窗口列表
        # 获取线程管理器
        self.thread_manager = get_thread_manager()  # 标记窗口是否正在关闭
        
        # 更新检查间隔限制（3天 = 259200 秒）
        self._update_check_interval = 3 * 24 * 3600  # 3天
        # 从设置中加载上次检查时间（持久化）
        self._last_update_check_time = settings.last_update_check_time or 0
        
        # 初始化处理器
        from src.gui.handlers.connection_handler import ConnectionHandler
        from src.gui.handlers.ai_model_handler import AIModelHandler
        from src.gui.handlers.query_handler import QueryHandler
        from src.gui.handlers.preload_handler import PreloadHandler
        from src.gui.handlers.tree_handler import TreeHandler
        from src.gui.handlers.table_structure_handler import TableStructureHandler
        from src.gui.handlers.ui_handler import UIHandler
        from src.gui.handlers.tree_data_handler import TreeDataHandler
        from src.gui.handlers.menu_handler import MenuHandler
        from src.gui.handlers.settings_handler import SettingsHandler
        from src.gui.handlers.redis_handler import RedisHandler
        
        # 设置全局 Toast 管理器的主窗口
        from src.utils.toast_manager import ToastManager
        ToastManager.set_main_window(self)
        
        self.connection_handler = ConnectionHandler(self)
        self.ai_model_handler = AIModelHandler(self)
        self.query_handler = QueryHandler(self)
        self.preload_handler = PreloadHandler(self)
        self.tree_handler = TreeHandler(self)
        self.table_structure_handler = TableStructureHandler(self)
        self.ui_handler = UIHandler(self)
        self.tree_data_handler = TreeDataHandler(self)
        self.menu_handler = MenuHandler(self)
        self.settings_handler = SettingsHandler(self)
        self.redis_handler = RedisHandler(self)
        
        try:
            self.ui_handler.init_ui()
            self.setup_connections()
            logger.info("UI初始化完成")
            
            # 先显示UI，然后异步加载连接（避免数据库连接失败时阻塞UI显示）
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(100, self.load_saved_connections)  # 延迟100ms加载连接，确保UI先显示
            
            # 预加载功能：在后台线程中自动加载所有数据库和表列表（不阻塞UI）
            QTimer.singleShot(1500, self.preload_handler.start_preload)  # 延迟1.5秒开始预加载，确保UI先显示
        except Exception as e:
            logger.error(f"初始化主窗口时发生错误: {e}", exc_info=True)
            raise
    
    def closeEvent(self, event):
        """窗口关闭事件"""
        logger.info("开始关闭窗口，停止所有线程...")
        
        # 标记窗口正在关闭（防止延迟回调创建新的worker）
        self._is_closing = True
        
        # 停止查询表的防抖定时器
        if hasattr(self, '_query_table_timer') and self._query_table_timer:
            self._query_table_timer.stop()
            self._query_table_timer = None
        
        # 停止SQL编辑器中的线程
        try:
            if hasattr(self, 'sql_editor') and self.sql_editor:
                self.sql_editor._stop_all_workers()
        except Exception as e:
            logger.warning(f"停止SQL编辑器线程时出错: {str(e)}")
        
        # 清理所有新建表tab
        try:
            if hasattr(self, 'right_tab_widget') and self.right_tab_widget:
                for i in range(self.right_tab_widget.count()):
                    tab_widget = self.right_tab_widget.widget(i)
                    if isinstance(tab_widget, CreateTableTab):
                        try:
                            tab_widget.cleanup()
                        except Exception as e:
                            logger.warning(f"清理新建表tab时出错: {str(e)}")
        except Exception as e:
            logger.warning(f"清理tab时出错: {str(e)}")
        
        # 停止所有数据库列表工作线程（使用线程管理器）
        for connection_id, worker in list(self.database_list_workers.items()):
            if worker:
                try:
                    # 使用线程管理器停止线程（会自动处理信号断开）
                    # 注意：在应用关闭时，ThreadManager 会安全地处理所有信号断开
                    self.thread_manager.stop_thread(worker, timeout=2000, force=True)
                except Exception as e:
                    logger.warning(f"停止数据库列表worker {connection_id} 时出错: {e}")
        self.database_list_workers.clear()
        
        # 停止所有 Redis dbsize 工作线程
        if hasattr(self, 'redis_dbsize_workers'):
            for connection_id, worker in list(self.redis_dbsize_workers.items()):
                if worker:
                    try:
                        # 使用线程管理器停止线程（会自动处理信号断开）
                        self.thread_manager.stop_thread(worker, timeout=1000, force=True)
                    except Exception as e:
                        logger.warning(f"停止 Redis dbsize worker {connection_id} 时出错: {e}")
            self.redis_dbsize_workers.clear()
        
        # 停止所有正在运行的线程（使用线程管理器）
        workers = [
            ('query_worker', self.query_worker, 5000),
            ('completion_worker', self.completion_worker, 2000),
            ('connection_test_worker', self.connection_test_worker, 5000),
            ('connection_init_worker', self.connection_init_worker, 3000),
            ('table_list_worker_for_tree', self.table_list_worker_for_tree, 2000),
            ('preload_worker', self.preload_worker, 3000),
        ]
        
        for name, worker, timeout in workers:
            if worker:
                try:
                    self.thread_manager.stop_thread(worker, timeout=timeout, force=True)
                    setattr(self, name, None)
                except Exception as e:
                    logger.warning(f"停止 {name} 时出错: {str(e)}")
                    try:
                        setattr(self, name, None)
                    except:
                        pass
        
        # 使用线程管理器清理所有注册的线程
        self.thread_manager.cleanup()
        
        # 保存连接配置
        try:
            connections = self.db_manager.get_all_connections()
            if connections:
                logger.info(f"关闭窗口，保存 {len(connections)} 个连接")
                self.save_connections()
            else:
                logger.warning("关闭窗口时连接列表为空，跳过保存")
            
            # 关闭所有数据库连接
            self.db_manager.close_all()
        except Exception as e:
            logger.error(f"关闭窗口时发生异常: {str(e)}", exc_info=True)
        
        # 最后等待一小段时间，确保所有线程清理完成
        from PyQt6.QtCore import QEventLoop, QTimer
        loop = QEventLoop()
        QTimer.singleShot(100, loop.quit)  # 等待100ms让所有线程清理完成
        loop.processEvents()  # 处理剩余事件
        
        event.accept()
    
    
    def setup_connections(self):
        """设置信号连接"""
        # 重新连接树视图信号到 handler（因为 handler 在 init_ui 之后才初始化）
        try:
            self.connection_tree.itemDoubleClicked.disconnect()
            self.connection_tree.itemClicked.disconnect()
            self.connection_tree.itemExpanded.disconnect()
            self.connection_tree.itemCollapsed.disconnect()
        except:
            pass
        
        self.connection_tree.itemDoubleClicked.connect(self.tree_handler.on_item_double_clicked)
        self.connection_tree.itemClicked.connect(self.tree_handler.on_item_clicked)
        self.connection_tree.itemExpanded.connect(self.tree_handler.on_item_expanded)
        self.connection_tree.itemCollapsed.connect(self.tree_handler.on_item_collapsed)
    
    def load_saved_connections(self):
        """加载保存的连接（从 SQLite 配置数据库）"""
        # 检查窗口是否正在关闭
        if self._is_closing:
            logger.debug("窗口正在关闭，跳过加载连接")
            return
        
        try:
            from src.core.config_db import get_config_db
            from pydantic import SecretStr
            config_db = get_config_db()
            
            # 从 SQLite 加载所有连接
            connection_dicts = config_db.get_all_connections()
            connections = []
            for conn_dict in connection_dicts:
                try:
                    # 处理密码字段：转换为 SecretStr
                    if 'password' in conn_dict and not isinstance(conn_dict['password'], SecretStr):
                        conn_dict['password'] = SecretStr(conn_dict['password'])
                    
                    # 使用 Pydantic 的标准方式创建实例
                    conn = DatabaseConnection(**conn_dict)
                    connections.append(conn)
                    # 加载时不测试连接（因为密码可能已过期）
                    self.db_manager.add_connection(conn, test_connection=False)
                except Exception as e:
                    logger.error(f"加载连接失败: {str(e)}", exc_info=True)
            
            if connections:
                logger.info(f"准备刷新连接列表，已加载 {len(connections)} 个连接")
                self.refresh_connections()
                logger.info(f"已加载 {len(connections)} 个保存的连接")
        except Exception as e:
            logger.error(f"加载保存的连接时发生错误: {e}", exc_info=True)
            # 不抛出异常，避免程序崩溃
    
    def save_connections(self):
        """保存所有连接"""
        self.connection_handler.save_connections()
    
    def show_create_table_dialog(self):
        """创建新建表tab"""
        self.table_structure_handler.show_create_table_dialog()
    
    def create_table_in_database(self, connection_id: str, database: str):
        """在指定数据库中创建表（打开新建表tab并设置连接和数据库）"""
        # 设置当前连接和数据库
        self.set_current_connection(connection_id, database)
        
        # 打开新建表tab
        self.show_create_table_dialog()
        
        logger.info(f"打开新建表页面，连接: {connection_id}, 数据库: {database}")
    
    def create_database(self, connection_id: str, connection_item: 'QTreeWidgetItem'):
        """新建数据库"""
        from PyQt6.QtWidgets import QMessageBox
        from src.gui.dialogs.create_database_dialog import CreateDatabaseDialog
        
        # 获取连接信息
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self, "错误", "连接不存在")
            return
        
        # 检查数据库类型是否支持
        if connection.db_type.value not in ('mysql', 'mariadb', 'postgresql', 'sqlserver'):
            QMessageBox.warning(self, "错误", f"数据库类型 {connection.db_type.value} 暂不支持创建数据库")
            return
        
        # 显示新建数据库对话框
        dialog = CreateDatabaseDialog(connection, self)
        if dialog.exec() != QMessageBox.DialogCode.Accepted:
            return
        
        # 获取用户输入
        database_name = dialog.get_database_name()
        charset = dialog.get_charset()
        collation = dialog.get_collation()
        
        if not database_name:
            return
        
        # 创建数据库
        try:
            from src.gui.workers.execute_sql_worker import ExecuteSQLWorker
            
            # 构建创建数据库的SQL
            db_type = connection.db_type
            if db_type.value in ('mysql', 'mariadb'):
                sql = f"CREATE DATABASE `{database_name}`"
                if charset:
                    sql += f" DEFAULT CHARACTER SET {charset}"
                if collation:
                    sql += f" COLLATE {collation}"
            elif db_type.value == 'postgresql':
                sql = f'CREATE DATABASE "{database_name}"'
                if charset:
                    sql += f" ENCODING '{charset}'"
            elif db_type.value == 'sqlserver':
                sql = f"CREATE DATABASE [{database_name}]"
                if collation:
                    sql += f" COLLATE {collation}"
            else:
                QMessageBox.warning(self, "错误", f"数据库类型 {db_type.value} 不支持创建数据库")
                return
            
            self.statusBar().showMessage(f"正在创建数据库 '{database_name}'...", 5000)
            logger.info(f"执行创建数据库SQL: {sql}")
            
            # 创建worker执行SQL
            worker = ExecuteSQLWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                sql,
                None  # 不指定数据库，在服务器级别创建
            )
            
            # 连接信号
            def on_success(result):
                QMessageBox.information(self, "成功", f"数据库 '{database_name}' 创建成功")
                self.statusBar().showMessage(f"数据库 '{database_name}' 创建成功", 5000)
                # 刷新数据库列表
                self.tree_data_handler.refresh_connection_databases(connection_id, connection_item)
            
            def on_error(error):
                QMessageBox.critical(self, "错误", f"创建数据库失败: {error}")
                self.statusBar().showMessage(f"创建数据库失败", 5000)
            
            worker.finished.connect(on_success)
            worker.error.connect(on_error)
            worker.start()
            
            # 保存worker引用，避免被垃圾回收
            if not hasattr(self, '_create_db_workers'):
                self._create_db_workers = []
            self._create_db_workers.append(worker)
            
            # worker完成后清理
            def cleanup():
                if hasattr(self, '_create_db_workers') and worker in self._create_db_workers:
                    self._create_db_workers.remove(worker)
                safe_delete_thread(worker)
            
            worker.finished.connect(cleanup)
            worker.error.connect(cleanup)
            
        except Exception as e:
            logger.error(f"创建数据库失败: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "错误", f"创建数据库失败: {str(e)}")
    
    def delete_table(self, connection_id: str, database_name: str, table_name: str, table_item: 'QTreeWidgetItem'):
        """删除表"""
        from PyQt6.QtWidgets import QMessageBox, QInputDialog, QLineEdit
        
        # 获取连接信息
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self, "错误", "连接不存在")
            return
        
        # 确认对话框
        reply = QMessageBox.question(
            self, 
            "确认删除",
            f"确定要删除表 <b>{database_name}.{table_name}</b> 吗？\n\n"
            f"⚠️ 警告：此操作将删除表中的所有数据，且无法恢复！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # 二次确认
        text, ok = QInputDialog.getText(
            self,
            "二次确认",
            f"请输入 <b>delete</b> 以确认删除表 <b>{table_name}</b>：",
            QLineEdit.EchoMode.Normal
        )
        
        if not ok or text.strip().lower() != "delete":
            if ok:
                QMessageBox.information(self, "取消", "确认文本不匹配，已取消删除操作")
            return
        
        # 删除表
        try:
            from src.gui.workers.execute_sql_worker import ExecuteSQLWorker
            
            # 构建删除表的SQL
            db_type = connection.db_type
            if db_type.value in ('mysql', 'mariadb'):
                sql = f"DROP TABLE `{table_name}`"
            elif db_type.value == 'postgresql':
                sql = f'DROP TABLE "{table_name}"'
            elif db_type.value == 'sqlserver':
                sql = f"DROP TABLE [{table_name}]"
            elif db_type.value == 'sqlite':
                sql = f'DROP TABLE "{table_name}"'
            elif db_type.value == 'oracle':
                sql = f'DROP TABLE "{table_name}"'
            else:
                QMessageBox.warning(self, "错误", f"数据库类型 {db_type.value} 不支持删除表")
                return
            
            self.statusBar().showMessage(f"正在删除表 '{database_name}.{table_name}'...", 5000)
            logger.info(f"执行删除表SQL: {sql}")
            
            # 创建worker执行SQL
            worker = ExecuteSQLWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                sql,
                database_name  # 指定数据库
            )
            
            # 连接信号
            def on_success(result):
                from src.utils.toast_manager import show_success
                show_success(f"表 '{table_name}' 已删除")
                self.statusBar().showMessage(f"表 '{table_name}' 已删除", 5000)
                
                # 从树中移除表节点
                parent = table_item.parent()
                if parent:
                    parent.removeChild(table_item)
                    
                # 清除可能缓存的表结构
                from src.core.schema_cache import get_schema_cache
                schema_cache = get_schema_cache()
                # 清除该连接的所有缓存，因为表被删除了
                schema_cache.clear_connection_cache(connection_id)
            
            def on_error(error):
                from src.utils.toast_manager import show_error
                show_error(f"删除表失败: {error}")
                self.statusBar().showMessage(f"删除表失败", 5000)
            
            worker.finished.connect(on_success)
            worker.error.connect(on_error)
            worker.start()
            
            # 保存worker引用，避免被垃圾回收
            if not hasattr(self, '_delete_table_workers'):
                self._delete_table_workers = []
            self._delete_table_workers.append(worker)
            
            # worker完成后清理
            def cleanup():
                if hasattr(self, '_delete_table_workers') and worker in self._delete_table_workers:
                    self._delete_table_workers.remove(worker)
                safe_delete_thread(worker)
            
            worker.finished.connect(cleanup)
            worker.error.connect(cleanup)
            
        except Exception as e:
            logger.error(f"删除表时出错: {e}", exc_info=True)
            QMessageBox.critical(self, "错误", f"删除表时出错：{str(e)}")
    
    def delete_database(self, connection_id: str, database_name: str, db_item: 'QTreeWidgetItem'):
        """删除数据库"""
        from PyQt6.QtWidgets import QMessageBox, QInputDialog, QLineEdit
        
        # 获取连接信息
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self, "错误", "连接不存在")
            return
        
        # 检查数据库类型是否支持
        if connection.db_type.value not in ('mysql', 'mariadb', 'postgresql', 'sqlserver'):
            QMessageBox.warning(self, "错误", f"数据库类型 {connection.db_type.value} 暂不支持删除数据库")
            return
        
        # 确认对话框
        reply = QMessageBox.question(
            self, 
            "确认删除",
            f"确定要删除数据库 <b>{database_name}</b> 吗？\n\n"
            f"⚠️ 警告：此操作将删除数据库中的所有表和数据，且无法恢复！",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return
        
        # 二次确认
        text, ok = QInputDialog.getText(
            self,
            "二次确认",
            f"请输入数据库名称 <b>{database_name}</b> 以确认删除：",
            QLineEdit.EchoMode.Normal
        )
        
        if not ok or text.strip() != database_name:
            if ok:
                QMessageBox.information(self, "取消", "数据库名称不匹配，已取消删除操作")
            return
        
        # 删除数据库
        try:
            from src.gui.workers.execute_sql_worker import ExecuteSQLWorker
            
            # 构建删除数据库的SQL
            db_type = connection.db_type
            if db_type.value in ('mysql', 'mariadb'):
                sql = f"DROP DATABASE `{database_name}`"
            elif db_type.value == 'postgresql':
                sql = f'DROP DATABASE "{database_name}"'
            elif db_type.value == 'sqlserver':
                sql = f"DROP DATABASE [{database_name}]"
            else:
                QMessageBox.warning(self, "错误", f"数据库类型 {db_type.value} 不支持删除数据库")
                return
            
            self.statusBar().showMessage(f"正在删除数据库 '{database_name}'...", 5000)
            logger.info(f"执行删除数据库SQL: {sql}")
            
            # 创建worker执行SQL
            worker = ExecuteSQLWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                sql,
                None  # 不指定数据库，在服务器级别删除
            )
            
            # 连接信号
            def on_success(result):
                from src.utils.toast_manager import show_success
                show_success(f"数据库 '{database_name}' 已删除")
                self.statusBar().showMessage(f"数据库 '{database_name}' 已删除", 5000)
                
                # 从树中移除数据库节点
                parent = db_item.parent()
                if parent:
                    parent.removeChild(db_item)
            
            def on_error(error):
                from src.utils.toast_manager import show_error
                show_error(f"删除数据库失败: {error}")
                self.statusBar().showMessage(f"删除数据库失败", 5000)
            
            worker.finished.connect(on_success)
            worker.error.connect(on_error)
            worker.start()
            
            # 保存worker引用，避免被垃圾回收
            if not hasattr(self, '_delete_db_workers'):
                self._delete_db_workers = []
            self._delete_db_workers.append(worker)
            
            # worker完成后清理
            def cleanup():
                if hasattr(self, '_delete_db_workers') and worker in self._delete_db_workers:
                    self._delete_db_workers.remove(worker)
                safe_delete_thread(worker)
            
            worker.finished.connect(cleanup)
            worker.error.connect(cleanup)
            
        except Exception as e:
            logger.error(f"删除数据库失败: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "错误", f"删除数据库失败: {str(e)}")
    
    def show_process_monitor(self, connection_id: str, database: Optional[str] = None):
        """显示进程监控tab"""
        if not connection_id:
            return
        
        # 检查是否已经存在该连接的监控tab
        monitor_key = f"process_monitor_{connection_id}_{database or 'all'}"
        for i in range(self.right_tab_widget.count()):
            tab_widget = self.right_tab_widget.widget(i)
            if hasattr(tab_widget, '_monitor_key') and tab_widget._monitor_key == monitor_key:
                # 已存在，切换到该tab
                self.right_tab_widget.setCurrentIndex(i)
                # 刷新数据
                if hasattr(tab_widget, 'refresh_process_list'):
                    tab_widget.refresh_process_list()
                return
        
        # 创建新的监控tab
        from src.gui.widgets.process_monitor_tab import ProcessMonitorTab
        
        monitor_tab = ProcessMonitorTab(
            main_window=self,
            connection_id=connection_id,
            database=database
        )
        monitor_tab._monitor_key = monitor_key
        
        # 生成tab标题
        connection = self.db_manager.get_connection(connection_id)
        connection_name = connection.name if connection else connection_id
        if database:
            tab_title = f"进程监控-{connection_name}-{database}"
        else:
            tab_title = f"进程监控-{connection_name}(全部数据库)"
        
        # 添加到tab
        tab_index = self.right_tab_widget.addTab(monitor_tab, tab_title)
        self.right_tab_widget.setCurrentIndex(tab_index)
    
    def close_query_tab(self, index: int):
        """关闭查询tab"""
        self.table_structure_handler.close_query_tab(index)

    def detach_tab(self, index: int):
        """将指定 tab 拖出为主窗口旁的独立窗口，便于对比查看"""
        if not hasattr(self, "right_tab_widget") or index < 0 or index >= self.right_tab_widget.count():
            return
        title = self.right_tab_widget.tabText(index)
        widget = self.right_tab_widget.widget(index)
        if widget is None:
            return
        self.right_tab_widget.removeTab(index)
        # 从 tab 移出后需放入带布局的容器，否则在新窗口里可能不参与布局导致空白
        widget.setParent(None)
        widget.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        widget.setMinimumSize(400, 300)
        container = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(widget)
        container.setLayout(layout)
        win = QMainWindow(None)  # 独立窗口，不设 parent
        win.setWindowTitle(f"{title} - DataAI")
        win.setCentralWidget(container)
        win.resize(1000, 700)
        win.show()
        widget.show()
        widget.update()
        self._floating_tab_windows.append(win)
        try:
            def _on_float_closed():
                try:
                    if win in self._floating_tab_windows:
                        self._floating_tab_windows.remove(win)
                except Exception:
                    pass
            win.destroyed.connect(_on_float_closed)
        except Exception:
            pass

    def eventFilter(self, obj, event):
        """处理 tab 栏拖拽：拖出 tab 为独立窗口"""
        if not hasattr(self, "right_tab_widget") or obj is not self.right_tab_widget.tabBar():
            return super().eventFilter(obj, event)
        tab_bar = self.right_tab_widget.tabBar()
        t = event.type()
        if t == QEvent.Type.MouseButtonPress:
            if event.button() == Qt.MouseButton.LeftButton:
                pt = event.position().toPoint() if hasattr(event, "position") else event.pos()
                self._tab_drag_start_index = tab_bar.tabAt(pt)
                self._tab_drag_start_global = event.globalPosition().toPoint() if hasattr(event, "globalPosition") else event.globalPos()
        elif t == QEvent.Type.MouseMove:
            if self._tab_drag_start_index >= 0 and (event.buttons() & Qt.MouseButton.LeftButton):
                g = event.globalPosition().toPoint() if hasattr(event, "globalPosition") else event.globalPos()
                if self._tab_drag_start_global and (g - self._tab_drag_start_global).manhattanLength() > 20:
                    bar_rect = QRect(tab_bar.mapToGlobal(QPoint(0, 0)), tab_bar.size())
                    if not bar_rect.contains(g):
                        self._tab_detaching = True
                        tab_bar.grabMouse()
            return False
        elif t == QEvent.Type.MouseButtonRelease:
            if self._tab_detaching:
                self.detach_tab(self._tab_drag_start_index)
                tab_bar.releaseMouse()
                self._tab_detaching = False
                self._tab_drag_start_index = -1
                self._tab_drag_start_global = None
                return True
            self._tab_drag_start_index = -1
            self._tab_drag_start_global = None
        return super().eventFilter(obj, event)
    
    def add_connection(self):
        """添加数据库连接"""
        self.connection_handler.add_connection()
    
    def import_from_navicat(self):
        """从 Navicat 导入连接"""
        self.connection_handler.import_from_navicat()
    
    def edit_connection(self, connection_id: str):
        """编辑数据库连接"""
        self.connection_handler.edit_connection(connection_id)
    
    def configure_ai_models(self):
        """配置AI模型"""
        self.ai_model_handler.configure_ai_models()
    
    def configure_prompts(self):
        """配置AI提示词"""
        from src.gui.dialogs.prompt_config_dialog import PromptConfigDialog
        dialog = PromptConfigDialog(self)
        dialog.exec()
    
    def refresh_ai_models(self):
        """刷新AI模型列表"""
        self.ai_model_handler.refresh_ai_models()
    
    def on_ai_model_changed(self, index: int):
        """AI模型选择改变"""
        self.ai_model_handler.on_ai_model_changed(index)
    
    def remove_connection(self, connection_id: str):
        """移除数据库连接"""
        self.connection_handler.remove_connection(connection_id)
    
    def refresh_connections(self):
        """刷新连接列表"""
        self.tree_data_handler.refresh_connections()
    
    def on_item_expanded(self, item: QTreeWidgetItem):
        """项目展开时"""
        self.tree_handler.on_item_expanded(item)
    
    def on_item_collapsed(self, item: QTreeWidgetItem):
        """项目折叠时"""
        self.tree_handler.on_item_collapsed(item)
    
    def on_item_double_clicked(self, item: QTreeWidgetItem, column: int):
        """双击项目"""
        self.tree_handler.on_item_double_clicked(item, column)
    
    def on_item_clicked(self, item: QTreeWidgetItem, column: int):
        """单击项目"""
        self.tree_handler.on_item_clicked(item, column)
    
    def on_connection_combo_changed(self, text: str):
        """连接下拉框改变"""
        connection_id = self.connection_combo.currentData()
        if connection_id:
            # 加载该连接的数据库列表
            self.load_databases_for_combo(connection_id)
            
            # 使用连接配置中的默认数据库
            connection = self.db_manager.get_connection(connection_id)
            database = connection.database if connection else None
            
            self.set_current_connection(connection_id, database=database, from_combo=True)
    
    def on_database_combo_changed(self, text: str):
        """数据库下拉框改变"""
        database = self.database_combo.currentData()
        if self.current_connection_id and database:
            # 明确传递 database，不使用默认数据库
            self.set_current_connection(self.current_connection_id, database=database, from_combo=True)
    
    def load_databases_for_combo(self, connection_id: str):
        """加载连接的数据库列表到下拉框（异步执行，不阻塞UI）"""
        # 检查窗口是否正在关闭
        if self._is_closing:
            logger.debug("窗口正在关闭，跳过加载数据库列表")
            return
        
        if not connection_id:
            logger.debug("load_databases_for_combo: connection_id 为空")
            return
        
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            logger.warning(f"load_databases_for_combo: 找不到连接 {connection_id}")
            return
        
        # 如果已经有正在运行的worker，先停止它
        if connection_id in self.database_list_workers:
            old_worker = self.database_list_workers[connection_id]
            if old_worker and old_worker.isRunning():
                logger.debug(f"已有worker正在运行，停止旧worker: {connection_id}")
                try:
                    old_worker.databases_ready.disconnect()
                    old_worker.error_occurred.disconnect()
                except:
                    pass
                old_worker.stop()
                # 不等待，让线程自己结束，避免阻塞UI
                safe_delete_thread(old_worker)
            # 安全删除，避免KeyError（可能在其他地方已被删除）
            self.database_list_workers.pop(connection_id, None)
        
        # 断开信号避免触发
        try:
            self.database_combo.currentTextChanged.disconnect()
        except:
            pass
        
        # 清空下拉框
        self.database_combo.clear()
        
        # 使用后台线程获取数据库列表，避免阻塞UI
        from src.gui.workers.database_list_worker import DatabaseListWorker
        
        # 创建worker来异步获取数据库列表
        worker = DatabaseListWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection.db_type,
            connection  # 传递 connection 对象，用于 Redis 查询数据库数量
        )
        
        # 定义清理函数（当线程完全结束时调用）
        def cleanup_worker():
            """清理worker（在线程finished信号触发时调用）"""
            try:
                # 如果线程仍在运行，请求停止但不等待（避免阻塞UI）
                if worker.isRunning():
                    logger.warning(f"Worker {connection_id} 在 finished 信号触发时仍在运行，请求停止...")
                    worker.stop()
                    # 不等待，让线程自己结束，稍后自动清理
                
                # 从字典中移除
                if connection_id in self.database_list_workers:
                    del self.database_list_workers[connection_id]
                
                # 安全删除，确保线程完全结束
                safe_delete_thread(worker)
            except RuntimeError:
                pass  # 对象已被删除，忽略
            except Exception as e:
                logger.warning(f"清理 worker {connection_id} 时出错: {e}")
        
        def on_databases_ready(databases: list):
            """数据库列表加载完成回调"""
            # 检查窗口是否正在关闭
            if self._is_closing:
                logger.debug("窗口正在关闭，跳过更新数据库下拉框")
                return
            
            try:
                logger.info(f"获取到 {len(databases)} 个数据库: {databases[:5] if len(databases) > 5 else databases}")
                for db in databases:
                    self.database_combo.addItem(db, db)
                
                # 设置当前数据库（只有在信号已断开时才设置，避免触发循环）
                try:
                    # 检查信号是否已断开（通常在load_databases_for_combo开始时断开）
                    self.database_combo.currentTextChanged.disconnect()
                    signal_was_connected = False
                except:
                    signal_was_connected = True
                
                # 只有在信号已断开时才设置当前项（避免触发on_database_combo_changed）
                if not signal_was_connected:
                    if self.current_database:
                        index = self.database_combo.findData(self.current_database)
                        if index >= 0:
                            self.database_combo.setCurrentIndex(index)
                            logger.info(f"已设置当前数据库: {self.current_database}")
                        elif databases:
                            # 如果找不到，默认选择第一个
                            self.database_combo.setCurrentIndex(0)
                            logger.info(f"默认选择第一个数据库: {databases[0]}")
                    elif databases:
                        # 如果没有指定当前数据库，默认选择第一个
                        self.database_combo.setCurrentIndex(0)
                        logger.info(f"默认选择第一个数据库: {databases[0]}")
                    
                    # 重新连接信号
                    try:
                        self.database_combo.currentTextChanged.connect(self.on_database_combo_changed)
                    except:
                        pass
                elif signal_was_connected:
                    # 如果信号本来就是连接的，重新连接
                    try:
                        self.database_combo.currentTextChanged.connect(self.on_database_combo_changed)
                    except:
                        pass
            except Exception as e:
                logger.error(f"更新数据库下拉框失败: {e}", exc_info=True)
                # 确保信号重新连接
                try:
                    self.database_combo.currentTextChanged.connect(self.on_database_combo_changed)
                except:
                    pass
            # 注意：不要在这里删除worker引用，让finished信号处理最终清理
        
        def on_error(error: str):
            """加载错误回调"""
            # 检查窗口是否正在关闭
            if self._is_closing:
                logger.debug("窗口正在关闭，跳过处理错误")
                return
            
            logger.warning(f"获取数据库列表失败: {error}", exc_info=True)
            # 重新连接信号
            try:
                self.database_combo.currentTextChanged.connect(self.on_database_combo_changed)
            except:
                pass
            # 注意：不要在这里删除worker引用，让finished信号处理最终清理
        
        # 先保存worker引用（在启动前），避免被垃圾回收，并便于后续停止
        self.database_list_workers[connection_id] = worker
        
        # 连接信号（在保存引用之后）
        worker.databases_ready.connect(on_databases_ready)
        worker.error_occurred.connect(on_error)
        # 注册线程到线程管理器，确保线程结束后清理
        self.thread_manager.register_thread(worker, cleanup_worker)
        
        # 启动worker（在后台线程中执行）
        worker.start()
    
    def set_current_connection(self, connection_id: str, update_completion: bool = True, database: Optional[str] = None, from_combo: bool = False):
        """设置当前连接（确保所有操作都是非阻塞的）
        
        Args:
            connection_id: 连接ID
            update_completion: 是否更新自动完成（默认True）
            database: 数据库名（None表示全部数据库）
            from_combo: 是否来自下拉框选择（如果是，不自动填充默认数据库）
        """
        self.current_connection_id = connection_id
        connection = self.db_manager.get_connection(connection_id)
        if connection:
            # 如果不是来自下拉框选择，且未指定数据库，使用连接配置中的数据库
            if not from_combo and database is None:
                database = connection.database if connection else None
            
            # 检查是否需要切换数据库
            need_switch = database and database != connection.database
            
            # 更新"当前连接"下拉框的选中项和显示文本（这些操作很快，可以直接执行）
            # 先断开信号连接，避免触发 on_connection_combo_changed
            try:
                self.connection_combo.currentTextChanged.disconnect()
            except:
                pass
            # 查找对应的连接ID在下拉框中的索引
            for i in range(self.connection_combo.count()):
                if self.connection_combo.itemData(i) == connection_id:
                    self.connection_combo.setCurrentIndex(i)
                    break
            # 重新连接信号
            try:
                self.connection_combo.currentTextChanged.connect(self.on_connection_combo_changed)
            except:
                pass
            
            # 更新状态栏
            if need_switch:
                # 如果需要切换数据库，先显示"正在连接"
                self.statusBar().showMessage(f"正在连接: {connection.name}...")
                self.sql_editor.set_status(f"正在连接: {connection.name}...")
                
                # 切换数据库
                try:
                    self.db_manager.switch_database(connection_id, database)
                    # 重新获取连接（因为 switch_database 可能更新了连接配置）
                    connection = self.db_manager.get_connection(connection_id)
                    self.current_database = database
                    # 更新状态为"切换完成"
                    self.statusBar().showMessage(f"切换完成: {connection.name} - {database}")
                    self.sql_editor.set_status(f"切换完成: {connection.name} - {database}")
                except Exception as e:
                    logger.error(f"切换数据库失败: {e}")
                    self.statusBar().showMessage(f"切换数据库失败: {e}", 3000)
                    self.sql_editor.set_status(f"切换数据库失败: {e}", is_error=True)
                    return
            else:
                # 不需要切换数据库，直接设置当前数据库
                self.current_database = database
                # 更新状态栏（使用简单的消息，避免调用可能耗时的 get_display_name()）
                if database:
                    self.statusBar().showMessage(f"切换完成: {connection.name} - {database}")
                    self.sql_editor.set_status(f"切换完成: {connection.name} - {database}")
            
            # 更新SQL编辑器的数据库信息（用于AI生成SQL时获取表结构）
            # 这确保直接查询时也能获取到表列表
            self.sql_editor.set_database_info(self.db_manager, connection_id, database)
            
            # 如果不是来自下拉框选择，或者下拉框为空，才加载数据库列表（避免循环调用）
            if not from_combo or self.database_combo.count() == 0:
                # 加载并同步数据库下拉框
                # 先设置数据库下拉框的选中项（在加载完成后）
                # 这里先断开信号，等待load_databases_for_combo的回调来设置当前项
                try:
                    self.database_combo.currentTextChanged.disconnect()
                except:
                    pass
                self.load_databases_for_combo(connection_id)
            else:
                # 来自下拉框选择，只需要更新当前项（不重新加载列表，避免循环）
                try:
                    self.database_combo.currentTextChanged.disconnect()
                except:
                    pass
                
                if database:
                    # 如果指定了数据库，选择该数据库
                    index = self.database_combo.findData(database)
                    if index >= 0:
                        self.database_combo.setCurrentIndex(index)
                    elif self.database_combo.count() > 0:
                        # 如果找不到，默认选择第一个数据库
                        self.database_combo.setCurrentIndex(0)
                elif self.database_combo.count() > 0:
                    # 如果没有指定数据库，默认选择第一个数据库
                    self.database_combo.setCurrentIndex(0)
                
                try:
                    self.database_combo.currentTextChanged.connect(self.on_database_combo_changed)
                except:
                    pass
    
    
    def load_databases_for_connection(self, connection_item: QTreeWidgetItem, connection_id: str, force_reload: bool = False):
        """为连接加载数据库列表"""
        self.tree_data_handler.load_databases_for_connection(connection_item, connection_id, force_reload)
        import time
        import threading
        
        # 检查是否已经有正在加载的worker，如果有，先停止它
        if connection_id in self.database_list_workers:
            worker = self.database_list_workers[connection_id]
            if worker and worker.isRunning():
                logger.debug(f"连接 {connection_id} 的数据库列表正在加载中，停止旧worker")
                try:
                    # 断开信号连接
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    # 停止worker
                    worker.stop()
                    # 等待停止（最多200ms，避免阻塞太久）
                    if not worker.wait(200):
                        worker.terminate()
                        worker.wait(100)
                    safe_delete_thread(worker)
                except Exception as e:
                    logger.warning(f"停止旧worker时出错: {str(e)}")
                finally:
                    # 从字典中移除
                    if connection_id in self.database_list_workers:
                        del self.database_list_workers[connection_id]
        
        # 检查是否已经加载过数据库
        has_databases = False
        loading_item = None
        
        # 清理现有的数据库项、加载项、错误项
        items_to_remove = []
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            text = child.text(0)
            # 标记数据库项、加载项、错误项等需要移除
            if child_type == TreeItemType.LOADING or child_type == TreeItemType.ERROR or child_type == TreeItemType.EMPTY:
                items_to_remove.append(child)
            elif child_type == TreeItemType.DATABASE:
                # 这是数据库项
                items_to_remove.append(child)
                has_databases = True
        
        # 如果已经加载过且不强制重新加载，直接返回
        if has_databases and not force_reload:
            return
        
        # 移除旧的数据库项、加载项、错误项
        for item in items_to_remove:
            connection_item.removeChild(item)
        
        # 显示加载状态
        loading_item = QTreeWidgetItem(connection_item)
        loading_item.setText(0, "加载中...")
        TreeItemData.set_item_type_and_data(loading_item, TreeItemType.LOADING)
        loading_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
        # 不自动展开，让用户手动展开
        # connection_item.setExpanded(True)  # 已移除
        self.connection_tree.update()
        # 使用QTimer延迟执行数据库连接操作，确保不阻塞UI
        from PyQt6.QtCore import QTimer
        
        def start_database_loading():
            # 获取连接信息
            connection = self.db_manager.get_connection(connection_id)
            if not connection:
                if loading_item:
                    try:
                        connection_item.removeChild(loading_item)
                    except:
                        pass
                try:
                    error_item = QTreeWidgetItem(connection_item)
                    error_item.setText(0, "错误: 连接不存在")
                except:
                    pass
                return
            
            # 停止该连接之前的数据库列表工作线程（如果存在）
            if connection_id in self.database_list_workers:
                old_worker = self.database_list_workers[connection_id]
                if old_worker:
                    try:
                        # 使用线程管理器停止线程（会自动处理信号断开）
                        # 注意：不要手动断开信号，ThreadManager 会在删除对象时自动处理
                        self.thread_manager.stop_thread(old_worker, timeout=500, force=True)
                    except Exception as e:
                        logger.warning(f"停止旧worker时出错: {str(e)}")
                    finally:
                        # 确保从字典中移除
                        if connection_id in self.database_list_workers:
                            del self.database_list_workers[connection_id]
            
            # 创建并启动数据库列表工作线程（在后台线程中连接数据库）
            from src.gui.workers.database_list_worker import DatabaseListWorker
            worker = DatabaseListWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                connection  # 传递 connection 对象，用于 Redis 查询数据库数量
            )
            
            # 保存引用以便在回调中使用
            worker.loading_item = loading_item
            worker.connection_item = connection_item
            worker.connection_id = connection_id
            
            # 定义清理函数（当线程完全结束时调用）
            def cleanup_worker():
                """清理worker（在线程finished信号触发时调用）"""
                # 检查窗口是否正在关闭
                if self._is_closing:
                    logger.debug(f"窗口正在关闭，跳过清理 worker: {connection_id}")
                    return
                
                # 从字典中移除
                if connection_id in self.database_list_workers:
                    del self.database_list_workers[connection_id]
            
            # 明确使用QueuedConnection，确保信号在UI线程的事件循环中异步处理
            from PyQt6.QtCore import Qt
            worker.databases_ready.connect(
                lambda databases, conn_id=connection_id: self.on_databases_loaded(connection_item, loading_item, databases),
                Qt.ConnectionType.QueuedConnection
            )
            worker.error_occurred.connect(
                lambda error, conn_id=connection_id: self.on_databases_load_error(connection_item, loading_item, error),
                Qt.ConnectionType.QueuedConnection
            )
            
            # 注册线程到线程管理器，自动处理清理
            self.thread_manager.register_thread(worker, cleanup_worker)
            
            # 将worker存储到字典中
            self.database_list_workers[connection_id] = worker
            worker.start()
        
        # 延迟1ms执行，确保展开事件处理函数立即返回
        QTimer.singleShot(0, start_database_loading)
    
    def _safe_delete_database_worker(self, worker):
        """安全删除数据库列表 worker（已废弃，使用 ThreadManager 管理）"""
        # 此方法已废弃，线程管理由 ThreadManager 统一处理
        # 保留此方法以保持向后兼容性
        if worker:
            self.thread_manager.stop_thread(worker, timeout=1000, force=True)
    
    def _safe_delete_redis_worker(self, worker):
        """安全删除 Redis 数据 worker（确保线程完全结束）"""
        self.redis_handler._safe_delete_redis_worker(worker)
    
    def load_tables_for_database(self, db_item: QTreeWidgetItem, connection_id: str, database: str, force_reload: bool = False):
        """为数据库加载表列表（委托给 tree_data_handler 处理，包含 Redis 特殊处理）"""
        # 委托给 tree_data_handler 处理，它包含 Redis 的特殊处理逻辑
        self.tree_data_handler.load_tables_for_database(db_item, connection_id, database, force_reload)
    
    def on_databases_loaded(self, connection_item: QTreeWidgetItem, loading_item: QTreeWidgetItem, databases: List[str]):
        """数据库列表加载完成回调"""
        # 检查对象是否仍然有效
        try:
            if not connection_item or not hasattr(connection_item, 'text'):
                return
        except RuntimeError:
            return
        
        # 移除加载项
        if loading_item:
            try:
                connection_item.removeChild(loading_item)
            except (RuntimeError, AttributeError):
                pass
        
        if not databases:
            # 没有数据库
            no_db_item = QTreeWidgetItem(connection_item)
            no_db_item.setText(0, "无数据库")
            TreeItemData.set_item_type_and_data(no_db_item, TreeItemType.EMPTY)
            no_db_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
            return
        
        # 获取连接信息
        connection_id = None
        try:
            # 查找对应的连接ID（从workers字典中查找）
            for conn_id, worker in self.database_list_workers.items():
                if worker and hasattr(worker, 'connection_item') and worker.connection_item == connection_item:
                    connection_id = conn_id
                    break
        except RuntimeError:
            pass
        connection = self.db_manager.get_connection(connection_id) if connection_id else None
        
        # 清理worker（加载完成后）
        # 注意：不要在这里删除 worker，让 cleanup_worker（通过 finished 信号）来处理
        # ThreadManager 会自动处理信号断开和对象删除，不需要手动断开信号
        # 手动断开信号可能导致警告，因为对象可能正在被删除
        
        # 检查已存在的数据库项，避免重复添加
        existing_databases = set()
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            if child_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(child)
                if db_name and isinstance(db_name, str):
                    existing_databases.add(db_name)
        
        # 添加数据库项（排序），只添加不存在的
        # 对于 Redis 连接，按数字排序；其他数据库按字母顺序排序
        from src.core.database_connection import DatabaseType
        if connection and connection.db_type == DatabaseType.REDIS:
            # Redis 数据库按数字排序
            sorted_databases = sorted(databases, key=lambda x: int(x) if x.isdigit() else float('inf'))
        else:
            # 其他数据库按字母顺序排序
            sorted_databases = sorted(databases)
        
        for db_name in sorted_databases:
            # 如果已存在，跳过
            if db_name in existing_databases:
                logger.debug(f"数据库 {db_name} 已存在，跳过添加")
                continue
            
            db_item = QTreeWidgetItem(connection_item)
            db_item.setText(0, db_name)
            # 设置节点类型和数据（数据库项）
            TreeItemData.set_item_type_and_data(db_item, TreeItemType.DATABASE, db_name)
            db_item.setIcon(0, get_database_icon_simple(18))
            db_item.setToolTip(0, f"数据库: {db_name}\n双击展开表列表")
            # 如果是当前连接的数据库，标记为已选中
            if connection and connection.database == db_name:
                font = db_item.font(0)
                font.setBold(True)
                db_item.setFont(0, font)
    
    def on_databases_load_error(self, connection_item: QTreeWidgetItem, loading_item: QTreeWidgetItem, error: str):
        """数据库列表加载错误回调"""
        import time
        import threading
        start_time = time.time()
        logger.error(f"[信号回调] on_databases_load_error 开始, 线程: {threading.current_thread().name}, 错误: {error}")
        
        # 使用QTimer延迟更新UI，避免阻塞主线程
        from PyQt6.QtCore import QTimer
        
        def update_ui():
            import time
            import threading
            update_start = time.time()
            logger.info(f"[UI更新] update_ui 开始, 线程: {threading.current_thread().name}")
            # 检查对象是否仍然有效
            try:
                if not connection_item or not hasattr(connection_item, 'text'):
                    logger.warning(f"[UI更新] connection_item 无效，退出")
                    return
            except RuntimeError:
                logger.warning(f"[UI更新] connection_item RuntimeError，退出")
                return
            
            logger.info(f"[UI更新] 检查对象完成，耗时: {time.time() - update_start:.3f}秒")
            
            # 移除加载项
            if loading_item:
                try:
                    logger.info(f"[UI更新] 开始移除加载项...")
                    remove_start = time.time()
                    connection_item.removeChild(loading_item)
                    logger.info(f"[UI更新] 移除加载项完成，耗时: {time.time() - remove_start:.3f}秒")
                except (RuntimeError, AttributeError) as e:
                    logger.warning(f"[UI更新] 移除加载项失败: {e}")
                    pass
            
            try:
                logger.info(f"[UI更新] 开始处理错误消息...")
                error_process_start = time.time()
                # 简化错误消息显示
                error_msg = str(error)
                # 提取主要错误信息（去掉详细的堆栈信息）
                # 查找第一个换行符或括号，取前面的部分
                for sep in ['\n', '(', '[']:
                    idx = error_msg.find(sep)
                    if idx > 0 and idx < 80:  # 如果找到分隔符且在合理位置
                        error_msg = error_msg[:idx].strip()
                        break
                
                # 截取错误消息的前80个字符，避免过长
                if len(error_msg) > 80:
                    error_msg = error_msg[:80] + "..."
                
                logger.info(f"[UI更新] 错误消息处理完成，耗时: {time.time() - error_process_start:.3f}秒")
                
                logger.info(f"[UI更新] 开始创建错误项...")
                error_item_start = time.time()
                error_item = QTreeWidgetItem(connection_item)
                error_item.setText(0, f"错误: {error_msg}")
                TreeItemData.set_item_type_and_data(error_item, TreeItemType.ERROR, error_msg)
                error_item.setToolTip(0, str(error))  # 完整错误信息在tooltip中
                logger.info(f"[UI更新] 错误项创建完成，耗时: {time.time() - error_item_start:.3f}秒")
            except (RuntimeError, AttributeError) as e:
                logger.error(f"[UI更新] 创建错误项失败: {e}", exc_info=True)
                pass
            
            # 清理worker（错误后也要清理）
            try:
                # 查找对应的连接ID并清理worker
                for conn_id, worker in list(self.database_list_workers.items()):
                    if worker and hasattr(worker, 'connection_item') and worker.connection_item == connection_item:
                        try:
                            if worker:
                                try:
                                    worker.databases_ready.disconnect()
                                    worker.error_occurred.disconnect()
                                except:
                                    pass
                                safe_delete_thread(worker)
                            del self.database_list_workers[conn_id]
                        except RuntimeError:
                            pass
                        break
            except Exception:
                pass
            
            logger.info(f"[UI更新] update_ui 完成，总耗时: {time.time() - update_start:.3f}秒")
        
        # 延迟1ms执行，确保不阻塞主线程
        logger.info(f"[信号回调] 设置QTimer延迟UI更新，总耗时: {time.time() - start_time:.3f}秒")
        QTimer.singleShot(0, update_ui)
        logger.info(f"[信号回调] on_databases_load_error 返回，总耗时: {time.time() - start_time:.3f}秒")
    
    def on_tables_loaded_for_tree(self, db_item: QTreeWidgetItem, tables_category: QTreeWidgetItem, loading_item: QTreeWidgetItem, tables: List[str]):
        """表列表加载完成回调（用于树视图）"""
        # 检查数据库项是否仍然存在（可能已被折叠或删除）
        if not db_item or not tables_category:
            return
        
        # 移除加载项（如果还存在）
        if loading_item:
            try:
                # 检查加载项是否仍然是tables_category的子项
                for i in range(tables_category.childCount()):
                    if tables_category.child(i) == loading_item:
                        tables_category.removeChild(loading_item)
                        break
            except RuntimeError:
                # 对象已被删除，忽略
                pass
        
        # 检查是否为 Redis 数据库（Redis 不应该显示"无表"）
        is_redis = False
        if hasattr(self, 'table_list_worker_for_tree') and self.table_list_worker_for_tree:
            connection_id = getattr(self.table_list_worker_for_tree, 'connection_id', None)
            if connection_id:
                connection = self.db_manager.get_connection(connection_id)
                is_redis = connection and connection.db_type == DatabaseType.REDIS
        
        if not tables:
            # 如果是 Redis 数据库，不显示"无表"（Redis 使用"所有数据"节点）
            if is_redis:
                return
            
            # 非 Redis 数据库：显示"无表"
            no_table_item = QTreeWidgetItem(tables_category)
            no_table_item.setText(0, "无表")
            TreeItemData.set_item_type_and_data(no_table_item, TreeItemType.EMPTY)
            no_table_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
            return
        
        # 添加表项（按字母顺序排序）
        database = self.table_list_worker_for_tree.database if hasattr(self.table_list_worker_for_tree, 'database') else ""
        for table_name in sorted(tables):
            table_item = QTreeWidgetItem(tables_category)
            table_item.setText(0, table_name)
            # 设置节点类型和数据（表项）
            TreeItemData.set_item_type_and_data(table_item, TreeItemType.TABLE, (database, table_name))
            table_item.setToolTip(0, f"表: {database}.{table_name}\n双击或单击查询前100条数据")
            table_item.setIcon(0, get_table_icon(16))
            # 确保表项本身是可选中的（父项 "表" 被设置为 NoItemFlags）
            table_item.setFlags(
                Qt.ItemFlag.ItemIsEnabled
                | Qt.ItemFlag.ItemIsSelectable
            )
        
        # 自动展开"表"分类，显示所有表
        # 只有在数据库项已经展开时才自动展开"表"分类，避免在用户手动折叠后又被展开
        if db_item.isExpanded():
            tables_category.setExpanded(True)
    
    def on_tables_load_error_for_tree(self, db_item: QTreeWidgetItem, tables_category: QTreeWidgetItem, loading_item: QTreeWidgetItem, error: str):
        """表列表加载错误回调（用于树视图）"""
        logger.error(f"获取表列表失败: {error}")
        
        # 使用QTimer延迟更新UI，避免阻塞主线程
        from PyQt6.QtCore import QTimer
        
        def update_ui():
            # 检查数据库项是否仍然存在（可能已被折叠或删除）
            try:
                if not db_item:
                    return
            except RuntimeError:
                return
            
            # 使用 nonlocal 声明，允许修改外部作用域的变量
            nonlocal tables_category
            
            try:
                # 确保"表"分类项存在
                if not tables_category:
                    tables_category = QTreeWidgetItem(db_item)
                    tables_category.setText(0, "表")
                    TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
                    tables_category.setIcon(0, get_category_icon("表", 16))
                    # 允许显示和展开，但不允许选中（子项仍然可以选中）
                    tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
            except RuntimeError:
                return
            
            # 移除加载项（如果还存在）
            if loading_item:
                try:
                    # 检查加载项是否仍然是tables_category的子项
                    for i in range(tables_category.childCount()):
                        if tables_category.child(i) == loading_item:
                            tables_category.removeChild(loading_item)
                            break
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
            
            # 显示错误消息
            try:
                # 简化错误消息显示
                error_msg = str(error)
                # 提取主要错误信息（去掉详细的堆栈信息）
                # 查找第一个换行符或括号，取前面的部分
                for sep in ['\n', '(', '[']:
                    idx = error_msg.find(sep)
                    if idx > 0 and idx < 80:  # 如果找到分隔符且在合理位置
                        error_msg = error_msg[:idx].strip()
                        break
                
                # 截取错误消息的前80个字符，避免过长
                if len(error_msg) > 80:
                    error_msg = error_msg[:80] + "..."
                
                error_item = QTreeWidgetItem(tables_category)
                error_item.setText(0, f"错误: {error_msg}")
                TreeItemData.set_item_type_and_data(error_item, TreeItemType.ERROR, error_msg)
                error_item.setToolTip(0, str(error))  # 完整错误信息在tooltip中
            except (RuntimeError, AttributeError):
                pass
        
        # 延迟1ms执行，确保不阻塞主线程
        QTimer.singleShot(0, update_ui)
    
    def query_table_data_in_new_tab(self, connection_id: str, table_name: str, database: Optional[str] = None):
        """在新标签页中查询表数据"""
        if not connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        # 检查是否已存在相同的tab（相同连接、数据库、表）
        for i in range(self.right_tab_widget.count()):
            tab_widget = self.right_tab_widget.widget(i)
            if hasattr(tab_widget, '_is_table_query_tab'):
                # 这是一个表查询tab
                if (hasattr(tab_widget, '_table_query_connection_id') and 
                    hasattr(tab_widget, '_table_query_database') and 
                    hasattr(tab_widget, '_table_query_table_name')):
                    if (tab_widget._table_query_connection_id == connection_id and
                        tab_widget._table_query_database == database and
                        tab_widget._table_query_table_name == table_name):
                        # 找到相同的tab，切换到它并重新执行查询
                        self.right_tab_widget.setCurrentIndex(i)
                        # 重新执行查询
                        if hasattr(tab_widget, '_sql_editor'):
                            sql_editor = tab_widget._sql_editor
                            connection = self.db_manager.get_connection(connection_id)
                            if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                                sql = f"SELECT * FROM `{database}`.`{table_name}`"
                            else:
                                sql = f"SELECT * FROM `{table_name}`"
                            sql_editor.set_sql(sql)
                            # 触发执行
                            if hasattr(tab_widget, '_execute_query_func'):
                                tab_widget._execute_query_func(sql)
                        return
        
        # 不存在相同的tab，创建新的查询tab
        from PyQt6.QtWidgets import QWidget, QVBoxLayout, QSplitter, QHBoxLayout, QGroupBox
        from src.gui.widgets.sql_editor import SQLEditor
        from src.gui.widgets.multi_result_table import MultiResultTable
        
        query_tab = QWidget()
        query_layout = QVBoxLayout()
        query_layout.setContentsMargins(5, 5, 5, 5)
        query_layout.setSpacing(5)
        query_tab.setLayout(query_layout)
        
        # 在查询tab顶部添加连接选择（用GroupBox包裹，与第一个查询tab相同样式）
        connection_group = QGroupBox(self.tr("查询范围"))
        connection_group.setStyleSheet("QGroupBox { font-weight: bold; padding-top: 10px; }")
        connection_group_layout = QHBoxLayout()
        connection_group_layout.setSpacing(10)
        connection_group_layout.setContentsMargins(10, 15, 10, 10)
        connection_group.setLayout(connection_group_layout)
        
        # 当前连接
        connection_label = QLabel(self.tr("当前连接:"))
        connection_group_layout.addWidget(connection_label)
        
        # 为这个tab创建独立的连接组合框
        tab_connection_combo = QComboBox()
        tab_connection_combo.setMinimumWidth(250)
        # 加载所有连接
        for conn in self.db_manager.get_all_connections():
            tab_connection_combo.addItem(conn.name, conn.id)
        # 设置当前选中的连接
        for i in range(tab_connection_combo.count()):
            if tab_connection_combo.itemData(i) == connection_id:
                tab_connection_combo.setCurrentIndex(i)
                break
        connection_group_layout.addWidget(tab_connection_combo)
        
        # 当前数据库
        database_label = QLabel(self.tr("当前数据库:"))
        connection_group_layout.addWidget(database_label)
        
        # 为这个tab创建独立的数据库组合框
        tab_database_combo = QComboBox()
        tab_database_combo.setMinimumWidth(200)
        # 异步加载数据库列表（避免阻塞UI）
        tab_database_combo.addItem("加载中...", None)
        tab_database_combo.setEnabled(False)
        
        def load_databases_for_tab():
            """异步加载数据库列表"""
            connection = self.db_manager.get_connection(connection_id)
            if not connection:
                tab_database_combo.clear()
                tab_database_combo.setEnabled(True)
                return

            # 如果已有数据库列表worker在运行，先停止并清理
            if hasattr(query_tab, '_database_list_worker') and query_tab._database_list_worker:
                try:
                    self.thread_manager.stop_thread(query_tab._database_list_worker, timeout=1000, force=True)
                except Exception:
                    pass
                safe_delete_thread(query_tab._database_list_worker)
                query_tab._database_list_worker = None
            
            from src.gui.workers.database_list_worker import DatabaseListWorker
            worker = DatabaseListWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                connection
            )
            query_tab._database_list_worker = worker
            
            def on_databases_ready(databases):
                tab_database_combo.clear()
                for db in databases:
                    tab_database_combo.addItem(db, db)
                # 设置当前选中的数据库
                if database:
                    index = tab_database_combo.findData(database)
                    if index >= 0:
                        tab_database_combo.setCurrentIndex(index)
                elif databases:
                    tab_database_combo.setCurrentIndex(0)
                tab_database_combo.setEnabled(True)
                # 不在这里删除，等待线程完全结束后再删除
            
            def on_error(error_msg):
                tab_database_combo.clear()
                tab_database_combo.addItem("加载失败", None)
                tab_database_combo.setEnabled(True)
                logger.warning(f"加载数据库列表失败: {error_msg}")
                # 不在这里删除，等待线程完全结束后再删除
            
            def cleanup_worker():
                """清理worker（在线程finished信号触发时调用）"""
                try:
                    if hasattr(query_tab, '_database_list_worker') and query_tab._database_list_worker is worker:
                        query_tab._database_list_worker = None
                    # 使用 safe_delete_thread，自动处理线程清理
                    safe_delete_thread(worker)
                except RuntimeError:
                    pass  # 对象已被删除，忽略
            
            worker.databases_ready.connect(on_databases_ready)
            worker.error_occurred.connect(on_error)
            self.thread_manager.register_thread(worker, cleanup_worker)
            worker.start()
        
        # 延迟执行，避免阻塞UI初始化
        QTimer.singleShot(0, load_databases_for_tab)
        
        connection_group_layout.addWidget(tab_database_combo)
        
        connection_group_layout.addStretch()  # 添加弹性空间
        
        query_layout.addWidget(connection_group)
        
        query_splitter = QSplitter(Qt.Orientation.Vertical)
        query_splitter.setChildrenCollapsible(False)
        query_splitter.setHandleWidth(6)
        
        # 创建新的SQL编辑器
        sql_editor = SQLEditor()
        sql_editor._main_window = self
        sql_editor.set_database_info(self.db_manager, connection_id, database)
        query_splitter.addWidget(sql_editor)
        
        # 创建新的结果表格
        result_table = MultiResultTable()
        result_table._main_window = self
        query_splitter.addWidget(result_table)
        
        # 存储result_table引用，以便后面设置execute_query_func
        query_tab._result_table_widget = result_table
        
        # 设置拉伸因子（数据展示区域更大，输入框更小）
        query_splitter.setStretchFactor(0, 1)  # SQL编辑器占1份
        query_splitter.setStretchFactor(1, 4)  # 结果表格占4份
        query_splitter.setSizes([300, 900])  # SQL编辑器300像素，结果表格900像素
        
        query_layout.addWidget(query_splitter)
        
        # 保存对这个tab的编辑器和结果表格的引用
        query_tab._sql_editor = sql_editor
        query_tab._result_table = result_table
        query_tab._connection_id = connection_id
        query_tab._database = database
        query_tab._table_query_connection_id = connection_id
        query_tab._table_query_database = database
        query_tab._table_query_table_name = table_name
        query_tab._is_table_query_tab = True
        query_tab._connection_combo = tab_connection_combo
        query_tab._database_combo = tab_database_combo
        
        # 为这个tab的连接组合框添加切换处理
        def on_tab_connection_changed(text: str):
            new_connection_id = tab_connection_combo.currentData()
            if new_connection_id:
                # 更新tab的连接ID
                query_tab._table_query_connection_id = new_connection_id
                query_tab._connection_id = new_connection_id
                # 异步加载该连接的数据库列表（避免阻塞UI）
                tab_database_combo.clear()
                tab_database_combo.addItem("加载中...", None)
                tab_database_combo.setEnabled(False)
                
                new_connection = self.db_manager.get_connection(new_connection_id)
                if not new_connection:
                    tab_database_combo.clear()
                    tab_database_combo.setEnabled(True)
                    return
                
                # 如果已有数据库列表worker在运行，先停止并清理
                if hasattr(query_tab, '_database_list_worker') and query_tab._database_list_worker:
                    try:
                        self.thread_manager.stop_thread(query_tab._database_list_worker, timeout=1000, force=True)
                    except Exception:
                        pass
                    safe_delete_thread(query_tab._database_list_worker)
                    query_tab._database_list_worker = None

                from src.gui.workers.database_list_worker import DatabaseListWorker
                worker = DatabaseListWorker(
                    new_connection.get_connection_string(),
                    new_connection.get_connect_args(),
                    new_connection.db_type,
                    new_connection
                )
                query_tab._database_list_worker = worker

                def on_databases_ready(databases):
                    tab_database_combo.clear()
                    for db in databases:
                        tab_database_combo.addItem(db, db)
                    if databases:
                        tab_database_combo.setCurrentIndex(0)
                        # 更新数据库
                        on_tab_database_changed(tab_database_combo.currentText())
                    tab_database_combo.setEnabled(True)

                def on_error(error_msg):
                    tab_database_combo.clear()
                    tab_database_combo.addItem("加载失败", None)
                    tab_database_combo.setEnabled(True)
                    logger.warning(f"加载数据库列表失败: {error_msg}")

                def cleanup_worker():
                    try:
                        if hasattr(query_tab, '_database_list_worker') and query_tab._database_list_worker is worker:
                            query_tab._database_list_worker = None
                        safe_delete_thread(worker)
                    except RuntimeError:
                        pass

                worker.databases_ready.connect(on_databases_ready)
                worker.error_occurred.connect(on_error)
                self.thread_manager.register_thread(worker, cleanup_worker)
                worker.start()
                # 更新SQL编辑器的数据库信息
                sql_editor.set_database_info(self.db_manager, new_connection_id, None)
                # 更新tab标题以反映新的连接
                new_connection = self.db_manager.get_connection(new_connection_id)
                connection_name = new_connection.name if new_connection else new_connection_id
                if query_tab._table_query_database:
                    new_tab_title = f"{connection_name}-{query_tab._table_query_database}-{query_tab._table_query_table_name}"
                else:
                    new_tab_title = f"{connection_name}-{query_tab._table_query_table_name}"
                # 找到当前tab的索引并更新标题
                for i in range(self.right_tab_widget.count()):
                    if self.right_tab_widget.widget(i) == query_tab:
                        self.right_tab_widget.setTabText(i, new_tab_title)
                        break
        
        def on_tab_database_changed(text: str):
            new_database = tab_database_combo.currentData()
            if new_database and query_tab._connection_id:
                # 更新tab的数据库
                query_tab._table_query_database = new_database
                query_tab._database = new_database
                # 更新SQL编辑器的数据库信息
                sql_editor.set_database_info(self.db_manager, query_tab._connection_id, new_database)
                # 切换数据库
                try:
                    self.db_manager.switch_database(query_tab._connection_id, new_database)
                except Exception as e:
                    logger.error(f"切换数据库失败: {e}")
                # 更新tab标题以反映新的数据库
                connection = self.db_manager.get_connection(query_tab._connection_id)
                connection_name = connection.name if connection else query_tab._connection_id
                if new_database:
                    new_tab_title = f"{connection_name}-{new_database}-{query_tab._table_query_table_name}"
                else:
                    new_tab_title = f"{connection_name}-{query_tab._table_query_table_name}"
                # 找到当前tab的索引并更新标题
                for i in range(self.right_tab_widget.count()):
                    if self.right_tab_widget.widget(i) == query_tab:
                        self.right_tab_widget.setTabText(i, new_tab_title)
                        break
        
        tab_connection_combo.currentTextChanged.connect(on_tab_connection_changed)
        tab_database_combo.currentTextChanged.connect(on_tab_database_changed)
        
        # 为这个tab的SQL编辑器创建独立的执行函数
        def execute_query_in_this_tab(sql: str = None):
            """在当前tab中执行查询"""
            if sql is None:
                sql = sql_editor.get_sql()
            
            if not sql or not sql.strip():
                QMessageBox.warning(self, "警告", "请输入SQL语句")
                return
            
            # 保存原始SQL（用于显示，不含自动添加的LIMIT）
            original_sql = sql
            
            # 判断SQL类型并自动添加LIMIT
            sql_upper = sql.strip().upper()
            is_query = sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))
            sql_for_execution = sql
            auto_limit_added = False
            
            if is_query and sql_upper.startswith("SELECT"):
                # 检查是否已经有 LIMIT 子句
                import re
                if not re.search(r'\bLIMIT\b', sql, re.IGNORECASE):
                    # 默认添加 LIMIT 100
                    sql_for_execution = sql.strip()
                    if not sql_for_execution.endswith(';'):
                        sql_for_execution += ' LIMIT 100'
                    else:
                        sql_for_execution = sql_for_execution[:-1].strip() + ' LIMIT 100;'
                    auto_limit_added = True
            
            # 使用查询处理器，但传入新tab的result_table和sql_editor
            from src.gui.workers.query_worker import QueryWorker
            
            # 停止之前的查询（如果有）
            if hasattr(query_tab, '_query_worker') and query_tab._query_worker:
                try:
                    if query_tab._query_worker.isRunning():
                        query_tab._query_worker.stop()
                        query_tab._query_worker.wait(1000)
                    safe_delete_thread(query_tab._query_worker)
                except:
                    pass
            
            # 获取当前tab选中的连接和数据库（从组合框获取，因为用户可能切换了）
            current_connection_id = tab_connection_combo.currentData() if hasattr(query_tab, '_connection_combo') else query_tab._connection_id
            current_database = tab_database_combo.currentData() if hasattr(query_tab, '_database_combo') else query_tab._database
            
            # 获取连接对象
            connection = self.db_manager.get_connection(current_connection_id)
            if not connection:
                QMessageBox.warning(self, "错误", "无法获取数据库连接")
                return
            
            # 如果数据库改变了，需要切换数据库（对于需要切换的情况）
            if current_database:
                try:
                    self.db_manager.switch_database(current_connection_id, current_database)
                    # 重新获取连接（因为switch_database可能更新了连接配置）
                    connection = self.db_manager.get_connection(current_connection_id)
                except Exception as e:
                    logger.warning(f"切换数据库失败: {e}")
            
            # 创建新的查询worker（使用添加了LIMIT的SQL）
            query_tab._query_worker = QueryWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                sql_for_execution
            )
            
            # 保存原始SQL和是否自动添加了LIMIT的标志
            query_tab._query_worker._original_sql = original_sql
            query_tab._query_worker._auto_limit_added = auto_limit_added
            
            # 定义回调函数（使用闭包捕获result_table和sql_editor）
            def on_query_progress(message: str):
                sql_editor.set_status(message)
            
            def on_query_finished(success: bool, data, error, affected_rows, columns=None):
                try:
                    # 优先使用原始SQL（用于显示在tab标题中）
                    if hasattr(query_tab, '_query_worker') and hasattr(query_tab._query_worker, '_original_sql'):
                        query_sql = query_tab._query_worker._original_sql
                    elif hasattr(query_tab, '_query_worker'):
                        query_sql = query_tab._query_worker.sql
                    else:
                        query_sql = original_sql
                    
                    # 获取当前连接ID（可能在查询过程中用户切换了连接）
                    current_conn_id = tab_connection_combo.currentData() if hasattr(query_tab, '_connection_combo') else query_tab._connection_id
                    
                    if success:
                        if data is not None:
                            result_table.add_result(query_sql, data, None, None, columns, connection_id=current_conn_id)
                            if data:
                                sql_editor.set_status(f"查询完成: {len(data)} 行")
                            else:
                                sql_editor.set_status(f"查询完成: 0 行")
                        elif affected_rows is not None:
                            result_table.add_result(query_sql, None, None, affected_rows, None, connection_id=current_conn_id)
                            sql_editor.set_status(f"执行成功: 影响 {affected_rows} 行")
                    else:
                        result_table.add_result(query_sql, None, error, None, None, connection_id=current_conn_id)
                        sql_editor.set_status(f"执行失败: {error}", is_error=True)
                    
                    # 恢复执行按钮状态
                    if hasattr(sql_editor, 'execute_btn'):
                        sql_editor.execute_btn.setText("执行 (F5)")
                except Exception as e:
                    logger.error(f"新tab查询回调失败: {str(e)}")
            
            def on_multi_query_finished(results: list):
                try:
                    total_success = 0
                    total_failed = 0
                    
                    # 获取当前连接ID（可能在查询过程中用户切换了连接）
                    current_conn_id = tab_connection_combo.currentData() if hasattr(query_tab, '_connection_combo') and tab_connection_combo else query_tab._connection_id
                    
                    # 对于多查询，使用原始SQL（因为results中的query_sql可能带自动添加的LIMIT）
                    for query_sql, success, data, error, affected_rows, columns in results:
                        if success:
                            total_success += 1
                            result_table.add_result(query_sql, data, error, affected_rows, columns, connection_id=current_conn_id)
                        else:
                            total_failed += 1
                            result_table.add_result(query_sql, None, error, None, None, connection_id=current_conn_id)
                    
                    if total_failed == 0:
                        sql_editor.set_status(f"所有查询完成: {total_success} 条成功")
                    else:
                        sql_editor.set_status(f"查询完成: {total_success} 条成功, {total_failed} 条失败", is_error=total_failed > 0)
                    
                    if hasattr(sql_editor, 'execute_btn'):
                        sql_editor.execute_btn.setText("执行 (F5)")
                except Exception as e:
                    logger.error(f"新tab多查询回调失败: {str(e)}")
            
            # 连接信号
            query_tab._query_worker.query_progress.connect(on_query_progress)
            query_tab._query_worker.query_finished.connect(on_query_finished)
            query_tab._query_worker.multi_query_finished.connect(on_multi_query_finished)
            
            # 启动查询
            query_tab._query_worker.start()
            sql_editor.set_status("正在执行查询...")
            if hasattr(sql_editor, 'execute_btn'):
                sql_editor.execute_btn.setText("执行中...")
        
        # 连接信号
        sql_editor.execute_signal.connect(execute_query_in_this_tab)
        
        # 为result_table设置自定义的执行查询函数（用于刷新功能）
        result_table._execute_query_func = execute_query_in_this_tab
        
        # 生成查询SQL（不添加LIMIT，由分页系统自动处理）
        connection = self.db_manager.get_connection(connection_id)
        if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            sql = f"SELECT * FROM `{database}`.`{table_name}`"
        else:
            sql = f"SELECT * FROM `{table_name}`"
        
        # 在新的SQL编辑器中显示SQL
        sql_editor.set_sql(sql)
        
        # 自动将提示文本填入AI智能查询框，让用户了解AI会优先使用这个表
        if hasattr(sql_editor, 'ai_input'):
            # 设置AI输入框的提示文本（如果用户不删除，AI查询时会优先使用这个表）
            # 使用友好的提示文本，而不是仅表名
            ai_hint_text = f"目标表 : {table_name}\n"
            sql_editor.ai_input.setPlainText(ai_hint_text)
        
        # 添加新tab（使用"连接名-库名-表名"格式，区分不同连接的相同数据库和表）
        connection_name = connection.name if connection else connection_id
        if database:
            tab_title = f"{connection_name}-{database}-{table_name}"
        else:
            tab_title = f"{connection_name}-{table_name}"
        tab_index = self.right_tab_widget.addTab(query_tab, tab_title)
        
        # 切换到新tab
        self.right_tab_widget.setCurrentIndex(tab_index)
        
        # 设置当前连接
        self.set_current_connection(connection_id, update_completion=False, database=database)
        
        # 自动执行查询
        execute_query_in_this_tab(sql)
    
    def query_table_data(self, connection_id: str, table_name: str, database: Optional[str] = None):
        """查询表数据（在点击事件中调用，确保不阻塞UI）"""
        if not connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        # 使用QTimer延迟执行，确保点击事件处理函数快速返回，不阻塞UI
        from PyQt6.QtCore import QTimer
        
        # 防抖：如果之前的定时器还在，先停止它
        if self._query_table_timer:
            self._query_table_timer.stop()
            self._query_table_timer = None
        
        def execute_query_async():
            try:
                # 在切换数据库前，先停止所有可能正在运行的 worker
                # 停止查询 worker
                if self.query_worker and self.query_worker.isRunning():
                    self.query_worker.stop()
                    if not self.query_worker.wait(1000):
                        self.query_worker.terminate()
                        self.query_worker.wait(500)
                    try:
                        self.query_worker.query_finished.disconnect()
                        self.query_worker.query_progress.disconnect()
                        self.query_worker.multi_query_finished.disconnect()
                    except:
                        pass
                    safe_delete_thread(self.query_worker)
                    self.query_worker = None
                
                # 停止连接初始化 worker（如果正在运行）
                if self.connection_init_worker and self.connection_init_worker.isRunning():
                    self.connection_init_worker.stop()
                    if not self.connection_init_worker.wait(1000):
                        self.connection_init_worker.terminate()
                        self.connection_init_worker.wait(500)
                    try:
                        self.connection_init_worker.init_finished.disconnect()
                    except:
                        pass
                    safe_delete_thread(self.connection_init_worker)
                    self.connection_init_worker = None
                
                # 停止 completion worker（如果正在运行）
                if self.completion_worker and self.completion_worker.isRunning():
                    self.completion_worker.stop()
                    if not self.completion_worker.wait(1000):
                        self.completion_worker.terminate()
                        self.completion_worker.wait(500)
                    try:
                        self.completion_worker.completion_ready.disconnect()
                    except:
                        pass
                    safe_delete_thread(self.completion_worker)
                    self.completion_worker = None
                
                # 双击表项时，始终切换到第一个查询tab
                current_index = self.right_tab_widget.currentIndex()
                if current_index != 0:  # 不是第一个查询tab
                    # 切换到第一个查询tab
                    self.right_tab_widget.setCurrentIndex(0)
                
                # 如果指定了数据库，先切换该连接当前使用的数据库
                if database:
                    try:
                        self.db_manager.switch_database(connection_id, database)
                    except Exception as e:
                        logger.error(f"切换数据库失败: {e}")
                        QMessageBox.warning(self, "警告", f"切换数据库失败: {e}")
                        return
                
                # 设置当前连接（不立即更新完成，避免阻塞），并传递当前数据库
                self.set_current_connection(connection_id, update_completion=False, database=database)
                
                # 根据数据库类型生成查询SQL（不添加LIMIT，由分页系统自动处理）
                connection = self.db_manager.get_connection(connection_id)
                if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    # MySQL/MariaDB 支持跨库访问，使用 database.table 格式
                    sql = f"SELECT * FROM `{database}`.`{table_name}`"
                else:
                    # 其他数据库类型（如 PostgreSQL）切换数据库后，直接使用表名
                    sql = f"SELECT * FROM `{table_name}`"
                
                # 在SQL编辑器中显示
                self.sql_editor.set_sql(sql)
                
                # 自动执行查询（execute_query已经在后台线程中执行）
                self.execute_query(sql)
                
                # 更新状态
                self.statusBar().showMessage(f"查询表: {table_name}")
            except Exception as e:
                logger.error(f"查询表数据失败: {e}")
                QMessageBox.warning(self, "错误", f"查询表数据失败: {str(e)}")
            finally:
                # 清理定时器引用
                self._query_table_timer = None
        
        # 使用防抖：延迟100ms执行，如果在这100ms内又有新的点击，会取消之前的定时器
        self._query_table_timer = QTimer()
        self._query_table_timer.setSingleShot(True)
        self._query_table_timer.timeout.connect(execute_query_async)
        self._query_table_timer.start(100)  # 100ms 防抖
    
    def query_redis_data(self, connection_id: str, database: str):
        """查询 Redis 数据（在当前查询tab中显示）"""
        self.redis_handler.query_redis_data(connection_id, database)
    
    def query_redis_data_in_new_tab(self, connection_id: str, database: str):
        """在新标签页中查询 Redis 数据"""
        self.redis_handler.query_redis_data_in_new_tab(connection_id, database)
    
    def update_sql_completion(self, connection_id: str):
        """更新SQL编辑器的自动完成（在后台线程中执行，避免阻塞UI）"""
        # 如果连接ID不匹配，说明连接已切换，不需要更新
        if connection_id != self.current_connection_id:
            return
        
        # 使用工作线程来获取表列表和列名，避免阻塞UI
        from src.gui.workers.completion_worker import CompletionWorker
        
        # 如果已有完成更新线程在运行，先停止
        if hasattr(self, 'completion_worker') and self.completion_worker:
            try:
                if self.completion_worker.isRunning():
                    self.completion_worker.stop()
                    if not self.completion_worker.wait(2000):
                        # 如果等待超时，强制终止
                        self.completion_worker.terminate()
                        self.completion_worker.wait(1000)
                # 断开信号连接
                try:
                    self.completion_worker.completion_ready.disconnect()
                except:
                    pass
                safe_delete_thread(self.completion_worker)
            except RuntimeError:
                # 对象已被删除，忽略
                pass
            self.completion_worker = None
        
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        # 创建并启动完成更新线程
        self.completion_worker = CompletionWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection_id
        )
        
        # 连接信号
        self.completion_worker.completion_ready.connect(self.on_completion_ready)
        
        # 启动线程
        self.completion_worker.start()
    
    def on_completion_ready(self, connection_id: str, tables: list, columns: list):
        """完成更新回调"""
        # 检查连接ID是否仍然匹配
        if connection_id == self.current_connection_id:
            # 更新SQL编辑器的自动完成
            self.sql_editor.update_completion_words(tables, columns)
    
    def show_connection_menu(self, position):
        """显示连接右键菜单"""
        self.menu_handler.show_connection_menu(position)
    
    def test_connection(self, connection_id: str = None):
        """测试连接（使用后台线程，避免阻塞UI）"""
        self.connection_handler.test_connection(connection_id)
    
    def execute_query(self, sql: str = None):
        """执行SQL查询（使用后台线程，避免阻塞UI）"""
        self.query_handler.execute_query(sql)
    
    def on_query_progress(self, message: str):
        """查询进度更新"""
        self.sql_editor.set_status(message)
    
    def on_query_finished(self, success: bool, data, error, affected_rows, columns=None):
        """查询完成回调（单条SQL）"""
        # 确保在主线程中更新UI
        try:
            # 获取SQL（从worker中获取）
            sql = self.query_worker.sql if self.query_worker else "查询结果"
            
            if success:
                if data is not None:
                    # 查询结果
                    self.result_table.add_result(sql, data, None, None, columns, connection_id=self.current_connection_id)
                    if data:
                        self.sql_editor.set_status(f"查询完成: {len(data)} 行")
                    else:
                        self.sql_editor.set_status(f"查询完成: 0 行")
                elif affected_rows is not None:
                    # 非查询语句
                    self.result_table.add_result(sql, None, None, affected_rows, None, connection_id=self.current_connection_id)
                    self.sql_editor.set_status(f"执行成功: 影响 {affected_rows} 行")
                    
                    # 如果是 ALTER TABLE 语句，自动刷新编辑表tab的表结构
                    if sql and sql.strip().upper().startswith('ALTER TABLE'):
                        self._refresh_edit_table_tabs(sql)
                    
                    # 如果是 ALTER TABLE 语句，自动刷新编辑表tab的表结构
                    if sql and sql.strip().upper().startswith('ALTER TABLE'):
                        self._refresh_edit_table_tabs(sql)
            else:
                # 错误
                self.result_table.add_result(sql, None, error, None, None, connection_id=self.current_connection_id)
                self.sql_editor.set_status(f"执行失败: {error}", is_error=True)
            
            # 恢复执行按钮状态
            if hasattr(self.sql_editor, 'execute_btn'):
                self.sql_editor.execute_btn.setText("执行 (F5)")
        except Exception as e:
            logger.error(f"更新UI失败: {str(e)}")
        
        # 清理工作线程
        # 使用 safe_delete_thread 函数，自动处理线程清理
        # 不需要手动断开信号，不需要延时，Qt 会自动处理
        if self.query_worker:
            worker = self.query_worker
            self.query_worker = None
            from src.utils.thread_manager import safe_delete_thread
            safe_delete_thread(worker)
    
    
    def on_multi_query_finished(self, results: list):
        """多条查询完成回调"""
        # results: [(sql, success, data, error, affected_rows, columns), ...]
        try:
            total_success = 0
            total_failed = 0
            
            has_alter_table = False
            for sql, success, data, error, affected_rows, columns in results:
                if success:
                    total_success += 1
                    self.result_table.add_result(sql, data, error, affected_rows, columns, connection_id=self.current_connection_id)
                    # 检查是否有 ALTER TABLE 语句
                    if sql and sql.strip().upper().startswith('ALTER TABLE'):
                        has_alter_table = True
                else:
                    total_failed += 1
                    self.result_table.add_result(sql, None, error, None, None, connection_id=self.current_connection_id)
            
            # 如果有 ALTER TABLE 语句，自动刷新编辑表tab的表结构
            if has_alter_table:
                self._refresh_edit_table_tabs("")
            
            # 更新状态
            if total_failed == 0:
                self.sql_editor.set_status(f"所有查询完成: {total_success} 条成功")
            else:
                self.sql_editor.set_status(f"查询完成: {total_success} 条成功, {total_failed} 条失败", is_error=total_failed > 0)
            
            # 恢复执行按钮状态
            if hasattr(self.sql_editor, 'execute_btn'):
                self.sql_editor.execute_btn.setText("执行 (F5)")
        except Exception as e:
            logger.error(f"更新UI失败: {str(e)}")
        
        # 清理工作线程
        # 使用 safe_delete_thread 函数，自动处理线程清理
        if self.query_worker:
            worker = self.query_worker
            self.query_worker = None
            from src.utils.thread_manager import safe_delete_thread
            safe_delete_thread(worker)
    
    def clear_query(self):
        """清空查询"""
        self.query_handler.clear_query()
    
    def show_settings(self):
        """显示设置对话框"""
        self.settings_handler.show_settings()
    
    def on_language_changed(self, new_language: str):
        """语言改变时的回调"""
        self.settings_handler.on_language_changed(new_language)
    
    def retranslate_ui(self):
        """重新翻译UI界面"""
        self.ui_handler.retranslate_ui()
    
    def show_schema_sync(self):
        """显示结构同步对话框"""
        self.settings_handler.show_schema_sync()
    
    def show_about(self):
        """显示关于对话框"""
        self.settings_handler.show_about()
    
    def check_for_updates(self, show_no_update: bool = False, auto_check: bool = False):
        """
        检查更新
        
        Args:
            show_no_update: 如果无更新是否显示提示
            auto_check: 是否为自动检查（如果是，失败时不显示错误，且受检查间隔限制）
        """
        from src.gui.workers.update_check_worker import UpdateCheckWorker
        from src.gui.dialogs.update_dialog import UpdateDialog
        from PyQt6.QtWidgets import QMessageBox
        import logging
        import time
        
        logger = logging.getLogger(__name__)
        
        # 检查间隔限制（仅对自动检查生效，手动检查不受限制）
        current_time = time.time()
        if auto_check and (current_time - self._last_update_check_time) < self._update_check_interval:
            elapsed = int(current_time - self._last_update_check_time)
            interval_days = self._update_check_interval / (24 * 3600)
            remaining = int(self._update_check_interval - elapsed)
            remaining_hours = remaining // 3600
            remaining_minutes = (remaining % 3600) // 60
            
            logger.info(
                f"距离上次检查仅 {elapsed} 秒，跳过自动检查"
                f"（检查间隔: {interval_days} 天，还需等待约 {remaining_hours} 小时 {remaining_minutes} 分钟）"
            )
            return
        
        # 如果已经有检查线程在运行，不重复检查
        if hasattr(self, 'update_check_worker') and self.update_check_worker:
            try:
                if self.update_check_worker.isRunning():
                    logger.info("更新检查已在进行中，跳过重复检查")
                    if not auto_check:
                        QMessageBox.information(
                            self,
                            "检查更新",
                            "正在检查更新，请稍候..."
                        )
                    return
            except RuntimeError:
                # worker 可能已被删除
                pass
        
        # 记录检查时间（在开始检查时记录，避免频繁重复检查）
        self._last_update_check_time = current_time
        # 持久化保存到设置
        try:
            self.settings.last_update_check_time = current_time
            self.settings.save_to_file()
        except Exception as e:
            logger.warning(f"保存上次检查时间失败: {e}")
        
        logger.info("开始检查更新...")
        
        # 如果自动检查且没有显示提示，只记录日志
        if auto_check and not show_no_update:
            def on_no_update():
                logger.info("自动检查更新：当前已是最新版本")
            
            def on_check_failed(msg):
                logger.warning(f"自动检查更新失败: {msg}")
        else:
            def on_no_update():
                if show_no_update:
                    QMessageBox.information(
                        self,
                        "检查更新",
                        "当前已是最新版本！"
                    )
            
            def on_check_failed(msg):
                if not auto_check:
                    QMessageBox.warning(
                        self,
                        "检查更新失败",
                        f"无法检查更新:\n{msg}"
                    )
        
        # 创建检查线程
        # 配置 GitHub 仓库信息
        self.update_check_worker = UpdateCheckWorker(
            owner="guoshuaipeng",  # GitHub 用户名
            repo="db-ai-pro",      # 仓库名
            use_custom_api=False   # 使用 GitHub Releases API
        )
        self.update_check_worker.update_available.connect(
            lambda info: UpdateDialog(info, self).exec()
        )
        self.update_check_worker.no_update.connect(on_no_update)
        self.update_check_worker.check_failed.connect(on_check_failed)
        
        # 线程完成后自动清理
        self.update_check_worker.finished.connect(self.update_check_worker.deleteLater)
        
        self.update_check_worker.start()
    