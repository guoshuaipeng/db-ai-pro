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
)
from PyQt6.QtCore import Qt, pyqtSignal, QThread, QThread, QTimer
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
        self._query_table_timer = None  # 用于防抖的定时器
        
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
        
        self.ui_handler.init_ui()
        self.setup_connections()
        self.load_saved_connections()
        
        # 延时启动预加载（避免阻塞启动）
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(1500, self.preload_handler.start_preload)  # 1.5秒后开始预加载
    
    def closeEvent(self, event):
        """窗口关闭事件"""
        logger.info("开始关闭窗口，停止所有线程...")
        
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
        
        # 停止所有数据库列表工作线程
        for worker in list(self.database_list_workers.values()):
            try:
                if worker and worker.isRunning():
                    worker.stop()
                    if not worker.wait(2000):
                        worker.terminate()
                        worker.wait(1000)
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    worker.deleteLater()
            except RuntimeError:
                pass
        self.database_list_workers.clear()
        
        # 停止所有正在运行的线程（使用统一的停止方法）
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
                    if worker.isRunning():
                        logger.debug(f"停止线程: {name}")
                        worker.stop()
                        if not worker.wait(timeout):
                            logger.warning(f"{name} 未能在 {timeout}ms 内结束，强制终止")
                            worker.terminate()
                            worker.wait(1000)
                        worker.deleteLater()
                        setattr(self, name, None)
                except RuntimeError:
                    # 对象已被删除，忽略
                    logger.debug(f"{name} 已被删除，跳过")
                    setattr(self, name, None)
                except Exception as e:
                    logger.warning(f"停止 {name} 时出错: {str(e)}")
                    try:
                        setattr(self, name, None)
                    except:
                        pass
        
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
            self.refresh_connections()
            logger.info(f"已加载 {len(connections)} 个保存的连接")
    
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
                worker.deleteLater()
            
            worker.finished.connect(cleanup)
            worker.error.connect(cleanup)
            
        except Exception as e:
            logger.error(f"创建数据库失败: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "错误", f"创建数据库失败: {str(e)}")
    
    def close_query_tab(self, index: int):
        """关闭查询tab"""
        self.table_structure_handler.close_query_tab(index)
    
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
            # 从下拉框文本中提取数据库名（如果有的话）
            # 格式可能是 "连接名 - 数据库名" 或 "连接名 (mysql://...)"
            database = None
            if " - " in text:
                # 提取数据库名（格式：连接名 - 数据库名）
                parts = text.split(" - ", 1)
                if len(parts) == 2:
                    database = parts[1].strip()
            else:
                # 如果文本格式是 "连接名 (mysql://.../数据库名)"，使用连接配置中的数据库
                connection = self.db_manager.get_connection(connection_id)
                if connection:
                    database = connection.database
            
            self.set_current_connection(connection_id, database=database)
    
    def set_current_connection(self, connection_id: str, update_completion: bool = True, database: Optional[str] = None):
        """设置当前连接（确保所有操作都是非阻塞的）"""
        self.current_connection_id = connection_id
        connection = self.db_manager.get_connection(connection_id)
        if connection:
            # 如果未指定数据库，使用连接配置中的数据库
            if database is None:
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
                    # 如果有数据库参数，更新显示文本为"连接名 - 数据库名"
                    if database:
                        display_text = f"{connection.name} - {database}"
                    else:
                        # 使用简单的显示名称，避免调用可能耗时的 get_display_name()
                        display_text = f"{connection.name} ({connection.db_type.value})"
                    self.connection_combo.setItemText(i, display_text)
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
                self.statusBar().showMessage(f"切换完成: {connection.name}")
                self.sql_editor.set_status(f"切换完成: {connection.name}")
            
            # 更新SQL编辑器的数据库信息（用于AI生成SQL时获取表结构）
            # 这确保直接查询时也能获取到表列表
            self.sql_editor.set_database_info(self.db_manager, connection_id, database)
    
    
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
                    worker.deleteLater()
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
                try:
                    if old_worker and old_worker.isRunning():
                        # 断开信号连接，避免旧worker的回调影响新操作
                        try:
                            old_worker.databases_ready.disconnect()
                            old_worker.error_occurred.disconnect()
                        except:
                            pass
                        # 请求停止
                        old_worker.stop()
                        # 等待线程停止（最多等待500ms，避免长时间阻塞）
                        if not old_worker.wait(500):
                            # 如果等待超时，强制终止
                            logger.warning(f"数据库列表worker未能在500ms内停止，强制终止")
                            old_worker.terminate()
                            old_worker.wait(200)
                        # 线程已停止，安全删除
                        old_worker.deleteLater()
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
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
                connection.db_type
            )
            
            # 保存引用以便在回调中使用
            worker.loading_item = loading_item
            worker.connection_item = connection_item
            worker.connection_id = connection_id
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
            
            # 将worker存储到字典中
            self.database_list_workers[connection_id] = worker
            worker.start()
        
        # 延迟1ms执行，确保展开事件处理函数立即返回
        QTimer.singleShot(1, start_database_loading)
    
    def load_tables_for_database(self, db_item: QTreeWidgetItem, connection_id: str, database: str, force_reload: bool = False):
        """为数据库加载表列表"""
        # 检查是否已经加载过表
        has_tables = False
        loading_item = None
        
        # 清理现有的表项、加载项、错误项、"表"分类项
        items_to_remove = []
        tables_category = None
        for i in range(db_item.childCount()):
            child = db_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            
            if child_type == TreeItemType.TABLE_CATEGORY:
                # 保留"表"分类项，检查其子项
                tables_category = child
                # 检查"表"分类下是否有表项，并清理"加载中..."项
                for j in range(tables_category.childCount() - 1, -1, -1):
                    table_child = tables_category.child(j)
                    table_child_type = TreeItemData.get_item_type(table_child)
                    if table_child_type == TreeItemType.LOADING:
                        # 清理"加载中..."项
                        tables_category.removeChild(table_child)
                    elif table_child_type == TreeItemType.TABLE:
                        has_tables = True
                # 如果强制重新加载，清理"表"分类下的所有子项
                if force_reload:
                    for j in range(tables_category.childCount() - 1, -1, -1):
                        tables_category.removeChild(tables_category.child(j))
            elif child_type in (TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
                items_to_remove.append(child)
            elif child_type == TreeItemType.DATABASE:
                # 这是表项（旧结构，应该不存在了，但保留兼容性）
                items_to_remove.append(child)
                has_tables = True
        
        # 如果已经加载过且不强制重新加载，直接返回
        if has_tables and not force_reload:
            return
        
        # 移除旧的表项、加载项、错误项
        for item in items_to_remove:
            db_item.removeChild(item)
        
        # 显示加载状态（在"表"分类下显示，如果没有则创建）
        if not tables_category:
            tables_category = QTreeWidgetItem(db_item)
            tables_category.setText(0, "表")
            TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
            tables_category.setIcon(0, get_category_icon("表", 16))
            # 允许显示和展开，但不允许选中（子项仍然可以选中）
            tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
        
        loading_item = QTreeWidgetItem(tables_category)
        loading_item.setText(0, "加载中...")
        TreeItemData.set_item_type_and_data(loading_item, TreeItemType.LOADING)
        loading_item.setFlags(Qt.ItemFlag.NoItemFlags)  # 禁用交互
        # 不自动展开，让用户手动展开
        # db_item.setExpanded(True)  # 已移除
        self.connection_tree.update()
        
        # 使用QTimer延迟执行数据库连接操作，确保不阻塞UI
        from PyQt6.QtCore import QTimer
        
        def start_table_loading():
            # 获取连接信息
            connection = self.db_manager.get_connection(connection_id)
            if not connection:
                if loading_item:
                    try:
                        tables_category.removeChild(loading_item)
                    except:
                        pass
                try:
                    error_item = QTreeWidgetItem(tables_category)
                    error_item.setText(0, "错误: 连接不存在")
                except:
                    pass
                return
            
            # 停止之前的表列表工作线程（如果存在）
            if self.table_list_worker_for_tree:
                try:
                    if self.table_list_worker_for_tree.isRunning():
                        # 断开信号连接，避免旧worker的回调影响新操作
                        try:
                            self.table_list_worker_for_tree.tables_ready.disconnect()
                            self.table_list_worker_for_tree.error_occurred.disconnect()
                        except:
                            pass
                        # 请求停止
                        self.table_list_worker_for_tree.stop()
                        # 等待线程停止（最多等待500ms，避免长时间阻塞）
                        if not self.table_list_worker_for_tree.wait(500):
                            # 如果等待超时，强制终止
                            logger.warning(f"表列表worker未能在500ms内停止，强制终止")
                            self.table_list_worker_for_tree.terminate()
                            self.table_list_worker_for_tree.wait(200)
                        # 线程已停止，安全删除
                        self.table_list_worker_for_tree.deleteLater()
                except RuntimeError:
                    # 对象已被删除，忽略
                    pass
                except Exception as e:
                    logger.warning(f"停止旧表列表worker时出错: {str(e)}")
                finally:
                    self.table_list_worker_for_tree = None
            
            # 创建并启动表列表工作线程（在后台线程中连接数据库）
            from src.gui.workers.table_list_worker_for_tree import TableListWorkerForTree
            self.table_list_worker_for_tree = TableListWorkerForTree(
                connection.get_connection_string(),
                connection.get_connect_args(),
                connection.db_type,
                database
            )
            # 保存引用以便在回调中使用
            self.table_list_worker_for_tree.loading_item = loading_item
            self.table_list_worker_for_tree.tables_category = tables_category
            self.table_list_worker_for_tree.db_item = db_item
            self.table_list_worker_for_tree.connection_id = connection_id
            self.table_list_worker_for_tree.database = database
            self.table_list_worker_for_tree.tables_ready.connect(
                lambda tables: self.on_tables_loaded_for_tree(db_item, tables_category, loading_item, tables)
            )
            self.table_list_worker_for_tree.error_occurred.connect(
                lambda error: self.on_tables_load_error_for_tree(db_item, tables_category, loading_item, error)
            )
            self.table_list_worker_for_tree.start()
        
        # 延迟1ms执行，确保展开事件处理函数立即返回
        QTimer.singleShot(1, start_table_loading)
    
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
        if connection_id and connection_id in self.database_list_workers:
            try:
                worker = self.database_list_workers[connection_id]
                if worker:
                    try:
                        worker.databases_ready.disconnect()
                        worker.error_occurred.disconnect()
                    except:
                        pass
                    worker.deleteLater()
                del self.database_list_workers[connection_id]
            except RuntimeError:
                pass
        
        # 检查已存在的数据库项，避免重复添加
        existing_databases = set()
        for i in range(connection_item.childCount()):
            child = connection_item.child(i)
            child_type = TreeItemData.get_item_type(child)
            if child_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(child)
                if db_name and isinstance(db_name, str):
                    existing_databases.add(db_name)
        
        # 添加数据库项（按字母顺序排序），只添加不存在的
        for db_name in sorted(databases):
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
                                worker.deleteLater()
                            del self.database_list_workers[conn_id]
                        except RuntimeError:
                            pass
                        break
            except Exception:
                pass
            
            logger.info(f"[UI更新] update_ui 完成，总耗时: {time.time() - update_start:.3f}秒")
        
        # 延迟1ms执行，确保不阻塞主线程
        logger.info(f"[信号回调] 设置QTimer延迟UI更新，总耗时: {time.time() - start_time:.3f}秒")
        QTimer.singleShot(1, update_ui)
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
        
        if not tables:
            # 没有表
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
        QTimer.singleShot(1, update_ui)
    
    def query_table_data_in_new_tab(self, connection_id: str, table_name: str, database: Optional[str] = None):
        """在新标签页中查询表数据"""
        if not connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        # 创建新的查询tab
        from PyQt6.QtWidgets import QWidget, QVBoxLayout, QSplitter, QHBoxLayout
        from src.gui.widgets.sql_editor import SQLEditor
        from src.gui.widgets.multi_result_table import MultiResultTable
        
        query_tab = QWidget()
        query_layout = QVBoxLayout()
        query_layout.setContentsMargins(5, 5, 5, 5)
        query_layout.setSpacing(5)
        query_tab.setLayout(query_layout)
        
        # 在新tab顶部添加连接显示（紧凑的一行）
        connection_bar = QWidget()
        connection_bar.setMaximumHeight(30)  # 限制最大高度
        connection_bar_layout = QHBoxLayout()
        connection_bar_layout.setContentsMargins(0, 0, 0, 0)  # 去掉内边距
        connection_bar_layout.setSpacing(8)
        connection_bar.setLayout(connection_bar_layout)
        
        connection_label = QLabel(self.tr("当前连接:"))
        connection_label.setStyleSheet("font-size: 12px;")
        connection_bar_layout.addWidget(connection_label, 0)  # 不拉伸
        
        # 使用文本标签显示连接信息
        connection_info = QLabel()
        connection = self.db_manager.get_connection(connection_id)
        if connection:
            if database:
                info_text = f"{connection.name} - {database}"
            else:
                info_text = f"{connection.name} ({connection.db_type.value})"
            connection_info.setText(info_text)
            connection_info.setStyleSheet("color: #1976d2; font-weight: bold; font-size: 12px;")
        connection_bar_layout.addWidget(connection_info, 0)  # 不拉伸
        
        connection_bar_layout.addStretch(1)  # 剩余空间拉伸
        
        query_layout.addWidget(connection_bar, 0)  # 不拉伸
        
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
        
        # 设置拉伸因子
        query_splitter.setStretchFactor(0, 2)
        query_splitter.setStretchFactor(1, 3)
        query_splitter.setSizes([450, 650])
        
        query_layout.addWidget(query_splitter)
        
        # 保存对这个tab的编辑器和结果表格的引用
        query_tab._sql_editor = sql_editor
        query_tab._result_table = result_table
        query_tab._connection_id = connection_id
        query_tab._database = database
        
        # 为这个tab的SQL编辑器创建独立的执行函数
        def execute_query_in_this_tab(sql: str = None):
            """在当前tab中执行查询"""
            if sql is None:
                sql = sql_editor.get_sql()
            
            if not sql or not sql.strip():
                QMessageBox.warning(self, "警告", "请输入SQL语句")
                return
            
            # 使用查询处理器，但传入新tab的result_table和sql_editor
            from src.gui.workers.query_worker import QueryWorker
            
            # 停止之前的查询（如果有）
            if hasattr(query_tab, '_query_worker') and query_tab._query_worker:
                try:
                    if query_tab._query_worker.isRunning():
                        query_tab._query_worker.stop()
                        query_tab._query_worker.wait(1000)
                    query_tab._query_worker.deleteLater()
                except:
                    pass
            
            # 获取连接对象
            connection = self.db_manager.get_connection(query_tab._connection_id)
            if not connection:
                QMessageBox.warning(self, "错误", "无法获取数据库连接")
                return
            
            # 创建新的查询worker
            query_tab._query_worker = QueryWorker(
                connection.get_connection_string(),
                connection.get_connect_args(),
                sql
            )
            
            # 定义回调函数（使用闭包捕获result_table和sql_editor）
            def on_query_progress(message: str):
                sql_editor.set_status(message)
            
            def on_query_finished(success: bool, data, error, affected_rows, columns=None):
                try:
                    query_sql = query_tab._query_worker.sql if hasattr(query_tab, '_query_worker') else sql
                    
                    if success:
                        if data is not None:
                            result_table.add_result(query_sql, data, None, None, columns, connection_id=query_tab._connection_id)
                            if data:
                                sql_editor.set_status(f"查询完成: {len(data)} 行")
                            else:
                                sql_editor.set_status(f"查询完成: 0 行")
                        elif affected_rows is not None:
                            result_table.add_result(query_sql, None, None, affected_rows, None, connection_id=query_tab._connection_id)
                            sql_editor.set_status(f"执行成功: 影响 {affected_rows} 行")
                    else:
                        result_table.add_result(query_sql, None, error, None, None, connection_id=query_tab._connection_id)
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
                    
                    for query_sql, success, data, error, affected_rows, columns in results:
                        if success:
                            total_success += 1
                            result_table.add_result(query_sql, data, error, affected_rows, columns, connection_id=query_tab._connection_id)
                        else:
                            total_failed += 1
                            result_table.add_result(query_sql, None, error, None, None, connection_id=query_tab._connection_id)
                    
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
        
        # 生成查询SQL
        connection = self.db_manager.get_connection(connection_id)
        if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            sql = f"SELECT * FROM `{database}`.`{table_name}` LIMIT 100"
        else:
            sql = f"SELECT * FROM `{table_name}` LIMIT 100"
        
        # 在新的SQL编辑器中显示SQL
        sql_editor.set_sql(sql)
        
        # 添加新tab（使用表名作为tab标题）
        tab_title = f"{table_name}"
        if database:
            tab_title = f"{database}.{table_name}"
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
                    self.query_worker.deleteLater()
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
                    self.connection_init_worker.deleteLater()
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
                    self.completion_worker.deleteLater()
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
                
                # 根据数据库类型生成查询SQL
                connection = self.db_manager.get_connection(connection_id)
                if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    # MySQL/MariaDB 支持跨库访问，使用 database.table 格式
                    sql = f"SELECT * FROM `{database}`.`{table_name}` LIMIT 100"
                else:
                    # 其他数据库类型（如 PostgreSQL）切换数据库后，直接使用表名
                    sql = f"SELECT * FROM `{table_name}` LIMIT 100"
                
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
                self.completion_worker.deleteLater()
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
        # 注意：不要在这里立即删除，让线程自然结束
        # 线程会在 run() 方法结束后自动结束
        if self.query_worker and not self.query_worker.isRunning():
            # 只有在线程已经结束时才清理
            worker = self.query_worker
            self.query_worker = None
            # 断开信号连接
            try:
                worker.query_finished.disconnect()
                worker.query_progress.disconnect()
                worker.multi_query_finished.disconnect()
            except:
                pass
            # 延迟删除，确保所有信号处理完成
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(200, worker.deleteLater)
    
    
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
        if self.query_worker and not self.query_worker.isRunning():
            worker = self.query_worker
            self.query_worker = None
            # 断开信号连接
            try:
                worker.query_finished.disconnect()
                worker.query_progress.disconnect()
                worker.multi_query_finished.disconnect()
            except:
                pass
            # 延迟删除，确保所有信号处理完成
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(200, worker.deleteLater)
    
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
    
