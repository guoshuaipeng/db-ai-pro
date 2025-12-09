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
from src.core.connection_storage import ConnectionStorage
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
        self.connection_storage = ConnectionStorage()
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
        
        self.init_ui()
        self.setup_connections()
        self.load_saved_connections()
        
        # 延时启动预加载（避免阻塞启动）
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(1500, self.start_preload)  # 1.5秒后开始预加载
    
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
    
    def init_ui(self):
        """初始化用户界面"""
        self.setWindowTitle(self.tr("DataAI - AI驱动的数据库管理工具"))
        # 设置最小窗口尺寸
        self.setMinimumSize(1200, 800)
        
        # 设置窗口图标（如果还没有设置）
        if self.windowIcon().isNull():
            import sys
            from pathlib import Path
            # 检查是否是PyInstaller打包后的环境
            if getattr(sys, 'frozen', False):
                # PyInstaller打包后的环境，使用sys._MEIPASS获取临时目录
                base_path = Path(sys._MEIPASS)
            else:
                # 开发环境，使用项目根目录
                project_root = Path(__file__).parent.parent.parent
                base_path = project_root
            
            # 优先尝试ICO文件（Windows任务栏需要）
            icon_path = base_path / "resources" / "icons" / "app_icon.ico"
            if not icon_path.exists():
                # 其次尝试PNG文件
                icon_path = base_path / "resources" / "icons" / "app_icon.png"
            
            if icon_path.exists():
                self.setWindowIcon(QIcon(str(icon_path)))
        
        # 创建菜单栏和工具栏
        self.create_menu_bar()
        self.create_toolbar()
        
        # 创建状态栏
        self.statusBar().showMessage(self.tr("就绪"))
        
        # 创建中央部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 主布局（增加内边距，让界面更宽松）
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(8)
        central_widget.setLayout(main_layout)
        
        # 创建分割器
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        main_splitter.setHandleWidth(6)  # 增加分割器手柄宽度，更容易拖拽
        
        # 左侧：数据库连接树（带搜索功能）
        self.connection_tree = ConnectionTreeWithSearch()
        self.connection_tree.itemDoubleClicked.connect(self.on_item_double_clicked)
        self.connection_tree.itemClicked.connect(self.on_item_clicked)
        self.connection_tree.itemExpanded.connect(self.on_item_expanded)
        self.connection_tree.itemCollapsed.connect(self.on_item_collapsed)
        self.connection_tree.customContextMenuRequested.connect(self.show_connection_menu)
        
        # 设置字体（稍微增大）
        font = QFont("Microsoft YaHei", 10)
        self.connection_tree.setFont(font)
        
        main_splitter.addWidget(self.connection_tree)
        
        # 右侧：Tab控件（包含查询tab和新建表tab）
        self.right_tab_widget = QTabWidget()
        self.right_tab_widget.setTabsClosable(True)
        self.right_tab_widget.tabCloseRequested.connect(self.close_query_tab)
        # 设置Tab字体
        tab_font = QFont("Microsoft YaHei", 10)
        self.right_tab_widget.setFont(tab_font)
        
        # 第一个tab：查询（包含AI查询、SQL编辑器和结果）
        query_tab = QWidget()
        query_layout = QVBoxLayout()
        query_layout.setContentsMargins(5, 5, 5, 5)  # 增加内边距
        query_layout.setSpacing(5)
        query_tab.setLayout(query_layout)
        
        query_splitter = QSplitter(Qt.Orientation.Vertical)
        query_splitter.setChildrenCollapsible(False)
        query_splitter.setHandleWidth(6)  # 增加分割器手柄宽度
        
        # SQL编辑器（包含AI查询）
        self.sql_editor = SQLEditor()
        self.sql_editor._main_window = self
        self.sql_editor.execute_signal.connect(self.execute_query)
        self.sql_editor.set_database_info(self.db_manager, None)
        query_splitter.addWidget(self.sql_editor)
        
        # 结果表格
        self.result_table = MultiResultTable()
        self.result_table._main_window = self  # 传递主窗口引用
        query_splitter.addWidget(self.result_table)
        
        # 设置拉伸因子（调整比例，让结果区域更大）
        query_splitter.setStretchFactor(0, 2)
        query_splitter.setStretchFactor(1, 3)
        query_splitter.setSizes([450, 650])  # 增加初始高度
        
        query_layout.addWidget(query_splitter)
        self.right_tab_widget.addTab(query_tab, self.tr("查询"))
        
        main_splitter.addWidget(self.right_tab_widget)
        main_splitter.setStretchFactor(0, 0)
        main_splitter.setStretchFactor(1, 1)
        # 设置初始宽度比例（左侧连接树稍窄，右侧内容区域更宽）
        main_splitter.setSizes([280, 1320])
        
        main_layout.addWidget(main_splitter)
    
    def create_menu_bar(self):
        """创建菜单栏"""
        menubar = self.menuBar()
        
        # 文件菜单
        file_menu = menubar.addMenu(self.tr("文件(&F)"))
        
        add_connection_action = file_menu.addAction(self.tr("添加数据库连接(&N)"))
        add_connection_action.setShortcut("Ctrl+N")
        add_connection_action.triggered.connect(self.add_connection)
        
        import_action = file_menu.addAction(self.tr("从 Navicat 导入(&I)"))
        import_action.triggered.connect(self.import_from_navicat)
        
        file_menu.addSeparator()
        
        exit_action = file_menu.addAction(self.tr("退出(&X)"))
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        
        # 数据库菜单
        db_menu = menubar.addMenu(self.tr("数据库(&D)"))
        
        test_connection_action = db_menu.addAction(self.tr("测试连接(&T)"))
        test_connection_action.triggered.connect(self.test_connection)
        
        refresh_action = db_menu.addAction(self.tr("刷新(&R)"))
        refresh_action.setShortcut("Ctrl+R")
        refresh_action.triggered.connect(self.refresh_connections)
        
        # 查询菜单
        query_menu = menubar.addMenu(self.tr("查询(&Q)"))
        
        execute_action = query_menu.addAction(self.tr("执行查询(&E)"))
        execute_action.setShortcut("F5")
        execute_action.triggered.connect(self.execute_query)
        
        clear_action = query_menu.addAction(self.tr("清空查询(&C)"))
        clear_action.triggered.connect(self.clear_query)
        
        # 设置菜单
        settings_menu = menubar.addMenu(self.tr("设置(&S)"))
        
        settings_action = settings_menu.addAction(self.tr("设置(&S)"))
        settings_action.triggered.connect(self.show_settings)
        
        settings_menu.addSeparator()
        
        # AI模型配置
        ai_config_action = settings_menu.addAction(self.tr("AI模型配置(&A)"))
        ai_config_action.triggered.connect(self.configure_ai_models)
        
        # AI提示词配置
        prompt_config_action = settings_menu.addAction(self.tr("AI提示词配置(&P)"))
        prompt_config_action.triggered.connect(self.configure_prompts)
        
        # 帮助菜单
        help_menu = menubar.addMenu(self.tr("帮助(&H)"))
        
        about_action = help_menu.addAction(self.tr("关于(&A)"))
        about_action.triggered.connect(self.show_about)
        
        # 保存菜单引用以便后续更新翻译
        self.menubar = menubar
        self.file_menu = file_menu
        self.db_menu = db_menu
        self.query_menu = query_menu
        self.settings_menu = settings_menu
        self.help_menu = help_menu
    
    def create_toolbar(self):
        """创建工具栏"""
        toolbar = QToolBar()
        self.addToolBar(toolbar)
        
        # 添加连接按钮
        add_btn = QPushButton(self.tr("添加连接"))
        add_btn.clicked.connect(self.add_connection)
        toolbar.addWidget(add_btn)
        self.add_connection_btn = add_btn
        
        # 导入按钮
        import_btn = QPushButton(self.tr("导入 Navicat"))
        import_btn.clicked.connect(self.import_from_navicat)
        toolbar.addWidget(import_btn)
        self.import_navicat_btn = import_btn
        
        toolbar.addSeparator()
        
        # AI模型选择
        ai_model_label = QLabel(self.tr("AI模型:"))
        toolbar.addWidget(ai_model_label)
        self.ai_model_label = ai_model_label
        
        self.ai_model_combo = QComboBox()
        self.ai_model_combo.setMinimumWidth(200)
        self.ai_model_combo.currentIndexChanged.connect(self.on_ai_model_changed)
        toolbar.addWidget(self.ai_model_combo)
        
        # 刷新模型列表
        self.refresh_ai_models()
        
        toolbar.addSeparator()
        
        # 连接选择下拉框
        connection_label = QLabel(self.tr("当前连接:"))
        toolbar.addWidget(connection_label)
        self.connection_label = connection_label
        
        self.connection_combo = QComboBox()
        self.connection_combo.setMinimumWidth(200)
        self.connection_combo.currentTextChanged.connect(self.on_connection_combo_changed)
        toolbar.addWidget(self.connection_combo)
        
        toolbar.addSeparator()
        
        # 新建表按钮
        create_table_btn = QPushButton("新建表")
        create_table_btn.clicked.connect(self.show_create_table_dialog)
        toolbar.addWidget(create_table_btn)
    
    def setup_connections(self):
        """设置信号连接"""
        pass
    
    def load_saved_connections(self):
        """加载保存的连接"""
        connections = self.connection_storage.load_connections()
        for conn in connections:
            # 加载时不测试连接（因为密码可能已过期）
            self.db_manager.add_connection(conn, test_connection=False)
        
        if connections:
            self.refresh_connections()
            logger.info(f"已加载 {len(connections)} 个保存的连接")
    
    def start_preload(self):
        """启动预加载所有连接的表"""
        connections = self.db_manager.get_all_connections()
        if not connections:
            return
        
        # 如果已有预加载线程在运行，先停止
        if self.preload_worker and self.preload_worker.isRunning():
            self.preload_worker.stop()
            self.preload_worker.wait(1000)
            if self.preload_worker.isRunning():
                self.preload_worker.terminate()
                self.preload_worker.wait(500)
        
        # 创建并启动预加载线程
        from src.gui.workers.preload_worker import PreloadWorker
        self.preload_worker = PreloadWorker(self.db_manager)
        
        # 连接信号
        self.preload_worker.connection_loaded.connect(self.on_preload_connection_loaded)
        self.preload_worker.progress.connect(self.on_preload_progress)
        self.preload_worker.finished_all.connect(self.on_preload_finished)
        
        # 启动线程
        self.preload_worker.start()
        logger.info("开始后台预加载所有连接的表...")
    
    def on_preload_connection_loaded(self, connection_id: str, database: str, tables: List[str]):
        """预加载完成一个数据库的回调"""
        # 使用QTimer延迟执行，避免在信号回调中直接修改UI导致dataChanged警告
        from PyQt6.QtCore import QTimer
        
        def update_tree():
            try:
                # 找到对应的连接项和数据库项
                connection_item = None
                for i in range(self.connection_tree.topLevelItemCount()):
                    item = self.connection_tree.topLevelItem(i)
                    if item and item.data(0, Qt.ItemDataRole.UserRole) == connection_id:
                        connection_item = item
                        break
                
                if not connection_item:
                    return
                
                # 找到对应的数据库项
                db_item = None
                for i in range(connection_item.childCount()):
                    child = connection_item.child(i)
                    if child and child.data(0, Qt.ItemDataRole.UserRole) == database:
                        db_item = child
                        break
                
                if not db_item:
                    # 如果数据库项不存在，说明还没展开过，先创建它
                    db_item = QTreeWidgetItem(connection_item)
                    # 使用简约的绿色数据库图标
                    db_icon = get_database_icon_simple(18)
                    db_item.setIcon(0, db_icon)
                    db_item.setText(0, database)
                    db_item.setData(0, Qt.ItemDataRole.UserRole, database)
                    db_item.setToolTip(0, f"数据库: {database}\n双击展开查看表")
                
                # 检查是否已经加载过表（查找"表"分类）
                tables_category = None
                has_tables = False
                for i in range(db_item.childCount()):
                    child = db_item.child(i)
                    if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                        tables_category = child
                        # 检查"表"分类下是否有表项
                        for j in range(tables_category.childCount()):
                            table_child = tables_category.child(j)
                            if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                has_tables = True
                                break
                        break
                
                # 如果已经加载过，跳过（避免重复）
                if has_tables:
                    return
                
                # 如果没有"表"分类，创建它
                if not tables_category:
                    tables_category = QTreeWidgetItem(db_item)
                    tables_category.setText(0, "表")
                    TreeItemData.set_item_type_and_data(tables_category, TreeItemType.TABLE_CATEGORY)
                    tables_category.setIcon(0, get_category_icon("表", 16))
                    # 允许显示和展开，但不允许选中（子项仍然可以选中）
                    tables_category.setFlags(Qt.ItemFlag.ItemIsEnabled)
                
                # 添加表项（按字母顺序排序）
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
                
                logger.debug(f"预加载完成: {connection_id} -> {database} ({len(tables)} 个表)")
            except RuntimeError:
                # 树结构已改变，忽略
                pass
            except Exception as e:
                logger.warning(f"预加载更新树时出错: {str(e)}")
        
        QTimer.singleShot(1, update_tree)
    
    def on_preload_progress(self, message: str):
        """预加载进度更新"""
        # 在状态栏显示进度（可选，避免太频繁更新）
        logger.debug(f"预加载进度: {message}")
    
    def on_preload_finished(self):
        """预加载全部完成"""
        logger.info("所有连接的表预加载完成")
        self.statusBar().showMessage("预加载完成", 3000)  # 显示3秒
    
    def save_connections(self):
        """保存所有连接"""
        try:
            connections = self.db_manager.get_all_connections()
            if not connections:
                logger.warning("连接列表为空，跳过保存以避免覆盖已有数据")
                return
            
            # 记录保存的连接数量，用于调试
            logger.info(f"准备保存 {len(connections)} 个连接")
            result = self.connection_storage.save_connections(connections)
            if not result:
                logger.error("保存连接失败")
        except Exception as e:
            logger.error(f"保存连接时发生异常: {str(e)}", exc_info=True)
    
    def show_create_table_dialog(self):
        """创建新建表tab"""
        if not self.current_connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        connection = self.db_manager.get_connection(self.current_connection_id)
        if not connection:
            QMessageBox.warning(self, "警告", "连接不存在")
            return
        
        if not self.current_database:
            QMessageBox.warning(self, "警告", "请先选择一个数据库")
            return
        
        # 创建新建表tab
        create_table_tab = CreateTableTab(
            self,
            db_manager=self.db_manager,
            connection_id=self.current_connection_id,
            database=self.current_database
        )
        create_table_tab.execute_sql_signal.connect(self.execute_query)
        
        # 添加到tab控件
        tab_index = self.right_tab_widget.addTab(create_table_tab, f"新建表 - {self.current_database}")
        self.right_tab_widget.setCurrentIndex(tab_index)
    
    def copy_table_structure(self, connection_id: str, database: str, table_name: str):
        """复制表结构（生成 CREATE TABLE 语句并复制到剪贴板）"""
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self, "错误", "连接不存在")
            return
        
        # 显示状态
        self.statusBar().showMessage(f"正在生成表 {table_name} 的结构...", 0)
        
        # 停止之前的 worker（如果存在）
        if hasattr(self, 'copy_structure_worker') and self.copy_structure_worker:
            try:
                if self.copy_structure_worker.isRunning():
                    self.copy_structure_worker.stop()
                    if not self.copy_structure_worker.wait(2000):
                        self.copy_structure_worker.terminate()
                        self.copy_structure_worker.wait(500)
                try:
                    self.copy_structure_worker.create_sql_ready.disconnect()
                    self.copy_structure_worker.error_occurred.disconnect()
                except:
                    pass
                self.copy_structure_worker.deleteLater()
            except RuntimeError:
                pass
            self.copy_structure_worker = None
        
        # 创建并启动工作线程
        from src.gui.workers.copy_table_structure_worker import CopyTableStructureWorker
        
        self.copy_structure_worker = CopyTableStructureWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            database,
            table_name,
            connection.db_type.value
        )
        self.copy_structure_worker.create_sql_ready.connect(
            lambda sql: self.on_create_sql_ready(sql, table_name)
        )
        self.copy_structure_worker.error_occurred.connect(
            lambda error: self.on_copy_structure_error(error, table_name)
        )
        self.copy_structure_worker.start()
    
    def on_create_sql_ready(self, create_sql: str, table_name: str):
        """CREATE TABLE 语句生成完成回调"""
        # 复制到剪贴板
        from PyQt6.QtWidgets import QApplication
        clipboard = QApplication.clipboard()
        clipboard.setText(create_sql)
        
        # 显示成功消息（状态栏提示，3秒后自动消失）
        self.statusBar().showMessage(f"复制成功：表 {table_name} 的结构已复制到剪贴板", 3000)
        
        # 清理 worker
        if self.copy_structure_worker:
            self.copy_structure_worker.deleteLater()
            self.copy_structure_worker = None
    
    def on_copy_structure_error(self, error: str, table_name: str):
        """复制表结构错误回调"""
        # 显示错误消息（状态栏提示，5秒后自动消失）
        self.statusBar().showMessage(f"复制失败：生成表 {table_name} 的结构失败 - {error}", 5000)
        
        # 清理 worker
        if self.copy_structure_worker:
            self.copy_structure_worker.deleteLater()
            self.copy_structure_worker = None
    
    def edit_table_structure(self, connection_id: str, database: str, table_name: str):
        """编辑表结构"""
        # 检查是否已经存在该表的编辑tab
        tab_title = f"编辑表 - {table_name}"
        for i in range(self.right_tab_widget.count()):
            if self.right_tab_widget.tabText(i) == tab_title:
                # 如果已存在，切换到该tab
                self.right_tab_widget.setCurrentIndex(i)
                return
        
        # 创建编辑表结构tab
        from src.gui.widgets.edit_table_tab import EditTableTab
        
        edit_table_tab = EditTableTab(
            parent=self,
            db_manager=self.db_manager,
            connection_id=connection_id,
            database=database,
            table_name=table_name
        )
        edit_table_tab.execute_sql_signal.connect(self.execute_query)
        
        # 添加到tab控件
        tab_index = self.right_tab_widget.addTab(edit_table_tab, tab_title)
        self.right_tab_widget.setCurrentIndex(tab_index)
    
    def close_query_tab(self, index: int):
        """关闭查询tab"""
        # 第一个tab（查询tab）不能关闭
        if index == 0:
            return
        
        # 获取要关闭的tab组件
        tab_widget = self.right_tab_widget.widget(index)
        
        # 如果是新建表tab或编辑表tab，清理资源
        if isinstance(tab_widget, CreateTableTab):
            tab_widget.cleanup()
        elif hasattr(tab_widget, 'cleanup') and hasattr(tab_widget, 'table_name'):
            # 编辑表tab
            tab_widget.cleanup()
        
        self.right_tab_widget.removeTab(index)
    
    def add_connection(self):
        """添加数据库连接"""
        dialog = ConnectionDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            connection = dialog.get_connection()
            # 使用后台线程测试连接，避免阻塞UI
            self._test_and_add_connection(connection, is_edit=False)
    
    def import_from_navicat(self):
        """从 Navicat 导入连接"""
        dialog = ImportDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            selected_connections = dialog.get_selected_connections()
            
            if not selected_connections:
                QMessageBox.information(self, "提示", "未选择任何连接")
                return
            
            # 导入选中的连接（不测试连接，因为密码可能无法解密）
            success_count = 0
            
            for conn in selected_connections:
                # 导入时不测试连接
                if self.db_manager.add_connection(conn, test_connection=False):
                    success_count += 1
            
            # 刷新连接列表
            self.refresh_connections()
            
            # 保存连接
            if success_count > 0:
                self.save_connections()
            
            # 显示结果和提示
            if success_count > 0:
                reply = QMessageBox.information(
                    self, 
                    "导入成功", 
                    f"成功导入 {success_count} 个数据库连接\n\n"
                    "注意：导入的连接未测试，密码可能需要手动输入。\n"
                    "您可以在连接列表中右键点击连接进行编辑。",
                    QMessageBox.StandardButton.Ok
                )
            else:
                QMessageBox.warning(
                    self,
                    "导入失败",
                    "未能导入任何连接"
                )
    
    def edit_connection(self, connection_id: str):
        """编辑数据库连接"""
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        dialog = ConnectionDialog(self, connection)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_connection = dialog.get_connection()
            # 保存旧连接ID，用于移除
            self._editing_connection_id = connection_id
            # 使用后台线程测试连接，避免阻塞UI
            self._test_and_add_connection(new_connection, is_edit=True)
    
    def _test_and_add_connection(self, connection: DatabaseConnection, is_edit: bool = False):
        """在后台线程中测试连接，然后添加连接"""
        # 如果已有测试线程在运行，先停止
        if self.connection_test_worker and self.connection_test_worker.isRunning():
            self.connection_test_worker.stop()
            self.connection_test_worker.wait(2000)
            if self.connection_test_worker.isRunning():
                self.connection_test_worker.terminate()
                self.connection_test_worker.wait(500)
            self.connection_test_worker.deleteLater()
        
        # 保存连接信息，用于测试完成后的回调
        self._pending_connection = connection
        self._pending_is_edit = is_edit
        if is_edit:
            self._editing_connection_id = getattr(self, '_editing_connection_id', None)
        
        # 显示测试中的提示
        self.statusBar().showMessage("正在测试连接...")
        
        # 创建并启动连接测试线程
        self.connection_test_worker = ConnectionTestWorker(connection)
        self.connection_test_worker.test_finished.connect(self._on_connection_test_finished)
        self.connection_test_worker.start()
    
    def _on_connection_test_finished(self, success: bool, message: str):
        """连接测试完成后的回调"""
        connection = getattr(self, '_pending_connection', None)
        is_edit = getattr(self, '_pending_is_edit', False)
        editing_connection_id = getattr(self, '_editing_connection_id', None)
        
        # 清理临时变量
        if hasattr(self, '_pending_connection'):
            delattr(self, '_pending_connection')
        if hasattr(self, '_pending_is_edit'):
            delattr(self, '_pending_is_edit')
        if hasattr(self, '_editing_connection_id'):
            delattr(self, '_editing_connection_id')
        
        if not connection:
            return
        
        if success:
            # 测试成功，添加连接
            if is_edit and editing_connection_id:
                # 编辑模式：保持原有位置，先保存原有位置
                old_index = None
                if editing_connection_id in self.db_manager.connection_order:
                    old_index = self.db_manager.connection_order.index(editing_connection_id)
                # 移除旧连接（但保留顺序信息）
                self.db_manager.remove_connection(editing_connection_id)
                # 如果连接ID改变，需要在原位置插入新ID
                if connection.id != editing_connection_id and old_index is not None:
                    # 新ID不同，需要在原位置插入
                    self.db_manager.connection_order.insert(old_index, connection.id)
                elif connection.id == editing_connection_id and old_index is not None:
                    # ID相同，恢复原位置
                    self.db_manager.connection_order.insert(old_index, connection.id)
            
            # 添加新连接（不测试，因为已经在后台测试过了）
            if self.db_manager.add_connection(connection, test_connection=False):
                self.refresh_connections()
                self.save_connections()
                self.statusBar().showMessage("连接测试成功", 3000)
                if is_edit:
                    QMessageBox.information(self, "成功", "成功更新数据库连接")
                else:
                    QMessageBox.information(self, "成功", f"成功添加数据库连接: {connection.name}")
            else:
                self.statusBar().showMessage("添加连接失败", 3000)
                QMessageBox.warning(self, "失败", "添加数据库连接失败")
        else:
            # 测试失败，询问是否仍要保存
            self.statusBar().showMessage("连接测试失败", 3000)
            reply = QMessageBox.question(
                self,
                "连接测试失败",
                f"{message}\n\n是否仍要保存连接配置？\n（您可以稍后手动测试连接）",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                # 用户选择保存
                if is_edit and editing_connection_id:
                    # 编辑模式：保持原有位置，先保存原有位置
                    old_index = None
                    if editing_connection_id in self.db_manager.connection_order:
                        old_index = self.db_manager.connection_order.index(editing_connection_id)
                    # 移除旧连接（但保留顺序信息）
                    self.db_manager.remove_connection(editing_connection_id)
                    # 如果连接ID改变，需要在原位置插入新ID
                    if connection.id != editing_connection_id and old_index is not None:
                        # 新ID不同，需要在原位置插入
                        self.db_manager.connection_order.insert(old_index, connection.id)
                    elif connection.id == editing_connection_id and old_index is not None:
                        # ID相同，恢复原位置
                        self.db_manager.connection_order.insert(old_index, connection.id)
                
                # 保存连接（不测试）
                if self.db_manager.add_connection(connection, test_connection=False):
                    self.refresh_connections()
                    self.save_connections()
                    if is_edit:
                        QMessageBox.information(
                            self,
                            "已保存",
                            "连接配置已保存，但连接测试失败。\n请检查连接信息（特别是密码）是否正确。"
                        )
                    else:
                        QMessageBox.information(
                            self,
                            "已保存",
                            f"连接配置已保存，但连接测试失败。\n请检查连接信息（特别是密码）是否正确。"
                        )
                else:
                    QMessageBox.warning(self, "失败", "保存连接配置失败")
    
    def configure_ai_models(self):
        """配置AI模型"""
        from src.gui.dialogs.ai_model_manager_dialog import AIModelManagerDialog
        dialog = AIModelManagerDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            # 配置更新后，刷新模型列表
            self.refresh_ai_models()
    
    def configure_prompts(self):
        """配置AI提示词"""
        from src.gui.dialogs.prompt_config_dialog import PromptConfigDialog
        dialog = PromptConfigDialog(self)
        dialog.exec()
    
    def refresh_ai_models(self):
        """刷新AI模型列表"""
        if not hasattr(self, 'ai_model_combo'):
            return
        
        self.ai_model_combo.clear()
        
        # 加载所有模型配置
        models = self.ai_model_storage.load_models()
        active_models = [m for m in models if m.is_active]
        
        if not active_models:
            self.ai_model_combo.addItem("未配置模型", None)
            self.ai_model_combo.setEnabled(False)
            return
        
        self.ai_model_combo.setEnabled(True)
        
        # 获取上次使用的模型ID
        last_used_id = self.ai_model_storage.get_last_used_model_id()
        
        # 添加模型到下拉框
        selected_index = 0
        for i, model in enumerate(active_models):
            display_name = model.name
            from src.core.default_ai_model import DEFAULT_MODEL_ID
            if model.id == DEFAULT_MODEL_ID or model.is_default:
                display_name += " [系统默认]"
            self.ai_model_combo.addItem(display_name, model.id)
            
            # 优先选择上次使用的模型
            if last_used_id and model.id == last_used_id:
                selected_index = i
            # 如果没有上次使用的，选择第一个激活的模型
            elif selected_index == 0:
                selected_index = i
        
        # 设置当前选择的模型（优先使用上次使用的模型）
        if active_models:
            self.ai_model_combo.setCurrentIndex(selected_index)
            # 只有在确实需要切换时才调用（避免初始化时的重复调用）
            selected_model_id = active_models[selected_index].id
            if not self.current_ai_model_id or self.current_ai_model_id != selected_model_id:
                self.on_ai_model_changed(selected_index)
    
    def on_ai_model_changed(self, index: int):
        """AI模型选择改变"""
        model_id = self.ai_model_combo.itemData(index)
        if not model_id:
            return
        
        self.current_ai_model_id = model_id
        
        # 保存为上次使用的模型
        self.ai_model_storage.save_last_used_model_id(model_id)
        
        # 更新SQL编辑器的AI客户端
        if hasattr(self, 'sql_editor'):
            # 重新创建AI客户端
            try:
                from src.core.ai_client import AIClient
                models = self.ai_model_storage.load_models()
                model_config = next((m for m in models if m.id == model_id), None)
                if model_config:
                    self.sql_editor.ai_client = AIClient(
                        api_key=model_config.api_key.get_secret_value(),
                        base_url=model_config.get_base_url(),
                        default_model=model_config.default_model,
                        turbo_model=model_config.turbo_model
                    )
                    # 设置模型ID以便统计
                    self.sql_editor.ai_client._current_model_id = model_config.id
                    self.statusBar().showMessage(f"已切换到模型: {model_config.name}", 2000)
                else:
                    self.statusBar().showMessage("模型配置不存在", 3000)
            except Exception as e:
                logger.error(f"切换AI模型失败: {str(e)}")
                self.statusBar().showMessage(f"切换AI模型失败: {str(e)}", 3000)
    
    def remove_connection(self, connection_id: str):
        """移除数据库连接"""
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        reply = QMessageBox.question(
            self,
            "确认",
            f"确定要删除连接 '{connection.name}' 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            if self.db_manager.remove_connection(connection_id):
                self.refresh_connections()
                self.save_connections()  # 保存连接
                if self.current_connection_id == connection_id:
                    self.current_connection_id = None
                    self.sql_editor.set_status("已断开连接")
    
    def refresh_connections(self):
        """刷新连接列表"""
        # 清空树
        self.connection_tree.clear()
        self.connection_combo.clear()
        
        # 创建"我的连接"根节点
        root_item = QTreeWidgetItem(self.connection_tree.tree)
        root_item.setText(0, "我的连接")
        # 设置根节点类型
        TreeItemData.set_item_type_and_data(root_item, TreeItemType.ROOT)
        # 设置扳手图标（使用系统图标或简单绘制）
        from PyQt6.QtGui import QIcon
        # 使用简单的文本图标，或者可以创建一个简单的扳手图标
        root_item.setExpanded(True)  # 默认展开根节点
        
        # 添加所有连接
        connections = self.db_manager.get_all_connections()
        for conn in connections:
            # 创建树项（使用根节点作为父项）
            item = QTreeWidgetItem(root_item)
            
            # 设置图标（使用连接图标，蓝色服务器图标）
            icon = get_connection_icon(18)
            item.setIcon(0, icon)
            
            # 设置主行文本（连接名称）
            item.setText(0, conn.name)
            
            # 设置节点类型和数据（连接项）
            TreeItemData.set_item_type_and_data(item, TreeItemType.CONNECTION, conn.id)
            
            # 设置工具提示
            db_type_name = {
                DatabaseType.MYSQL: "MySQL",
                DatabaseType.MARIADB: "MariaDB",
                DatabaseType.POSTGRESQL: "PostgreSQL",
                DatabaseType.SQLITE: "SQLite",
                DatabaseType.ORACLE: "Oracle",
                DatabaseType.SQLSERVER: "SQL Server",
                DatabaseType.HIVE: "Hive",
            }.get(conn.db_type, conn.db_type.value)
            
            tooltip = (
                f"连接名称: {conn.name}\n"
                f"数据库类型: {db_type_name}\n"
                f"主机: {conn.host}\n"
                f"端口: {conn.port}\n"
                f"数据库: {conn.database}\n"
                f"用户名: {conn.username}"
            )
            item.setToolTip(0, tooltip)
            
            # 不自动展开，让用户手动展开
            item.setExpanded(False)
            
            # 添加到下拉框
            display_name = conn.get_display_name()
            # 如果这是当前连接且有当前数据库，显示"连接名 - 数据库名"
            if self.current_connection_id == conn.id and self.current_database:
                display_name = f"{conn.name} - {self.current_database}"
            self.connection_combo.addItem(display_name, conn.id)
        
        # 如果当前连接存在，设置下拉框选中项
        if self.current_connection_id:
            for i in range(self.connection_combo.count()):
                if self.connection_combo.itemData(i) == self.current_connection_id:
                    self.connection_combo.setCurrentIndex(i)
                    # 如果有当前数据库，更新显示文本
                    if self.current_database:
                        connection = self.db_manager.get_connection(self.current_connection_id)
                        if connection:
                            self.connection_combo.setItemText(i, f"{connection.name} - {self.current_database}")
                    break
        
        # 调整列宽
        self.connection_tree.resizeColumnToContents(0)
    
    def on_item_expanded(self, item: QTreeWidgetItem):
        """项目展开时（在UI线程中执行，确保快速返回）"""
        import time
        logger.info(f"[UI线程] on_item_expanded 开始: {item.text(0)}")
        start_time = time.time()
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和其他不需要处理的节点类型
        if item_type == TreeItemType.ROOT:
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保展开事件处理函数快速返回
        from PyQt6.QtCore import QTimer
        
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            self.load_databases_for_connection(item, connection_id, force_reload=False)
        elif item_type == TreeItemType.DATABASE:
            # 展开数据库项，加载表列表（延迟执行，避免阻塞）
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                def load_tables():
                    self.load_tables_for_database(item, connection_id, database, force_reload=False)
                    # 如果表已经加载，自动展开"表"分类
                    for i in range(item.childCount()):
                        child = item.child(i)
                        if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY and child.childCount() > 0:
                            # 检查是否有表项（不是"加载中..."或"无表"）
                            has_tables = False
                            for j in range(child.childCount()):
                                table_child = child.child(j)
                                if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                    has_tables = True
                                    break
                            if has_tables:
                                child.setExpanded(True)
                            break
                QTimer.singleShot(1, load_tables)
    
    def on_item_collapsed(self, item: QTreeWidgetItem):
        """项目折叠时"""
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 如果折叠的是数据库项，检查是否有正在加载的表，如果有则停止加载并清理
        if item_type == TreeItemType.DATABASE:
            # 检查"表"分类下是否有"加载中..."项
            for i in range(item.childCount()):
                child = item.child(i)
                if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                    # 检查"表"分类下是否有"加载中..."项
                    for j in range(child.childCount() - 1, -1, -1):
                        table_child = child.child(j)
                        if TreeItemData.get_item_type(table_child) == TreeItemType.LOADING:
                                # 停止加载线程（如果正在运行）
                                if self.table_list_worker_for_tree and self.table_list_worker_for_tree.isRunning():
                                    # 检查是否是当前数据库的加载
                                    if (hasattr(self.table_list_worker_for_tree, 'db_item') and 
                                        self.table_list_worker_for_tree.db_item == item):
                                        try:
                                            # 断开信号连接
                                            try:
                                                self.table_list_worker_for_tree.tables_ready.disconnect()
                                                self.table_list_worker_for_tree.error_occurred.disconnect()
                                            except:
                                                pass
                                            # 请求停止
                                            self.table_list_worker_for_tree.stop()
                                            # 等待停止（最多200ms，避免阻塞太久）
                                            if not self.table_list_worker_for_tree.wait(200):
                                                self.table_list_worker_for_tree.terminate()
                                                self.table_list_worker_for_tree.wait(100)
                                            self.table_list_worker_for_tree.deleteLater()
                                        except Exception as e:
                                            logger.warning(f"停止表列表worker时出错: {str(e)}")
                                        finally:
                                            self.table_list_worker_for_tree = None
                                # 移除"加载中..."项
                                try:
                                    child.removeChild(table_child)
                                except:
                                    pass
                        break
    
    def on_item_double_clicked(self, item: QTreeWidgetItem, column: int):
        """双击项目（在UI线程中执行，确保快速返回，不阻塞）"""
        import time
        import threading
        logger.info(f"[UI线程] on_item_double_clicked 开始: {item.text(0)}, 线程: {threading.current_thread().name}")
        start_time = time.time()
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和其他不需要处理的节点类型
        if item_type == TreeItemType.ROOT or item_type in (TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保双击事件处理函数快速返回
        from PyQt6.QtCore import QTimer
        
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            # 双击连接项本身，切换展开状态（这个操作很快，可以直接执行）
            logger.info(f"[UI线程] on_item_double_clicked 双击连接项本身，切换展开状态: {item.text(0)}")
            if item.isExpanded():
                item.setExpanded(False)
            else:
                item.setExpanded(True)
                # 展开时会自动触发 on_item_expanded，加载数据库列表（已经在on_item_expanded中使用延迟执行）
        elif item_type == TreeItemType.DATABASE:
            # 双击数据库项，切换展开状态，并切换到该数据库
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                # 切换到该连接和数据库（使用延迟执行，避免阻塞）
                def switch_and_expand():
                    self.set_current_connection(connection_id, database=database)
                    # 如果表已经加载，自动展开"表"分类
                    for i in range(item.childCount()):
                        child = item.child(i)
                        if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                            child.setExpanded(True)
                            break
                QTimer.singleShot(1, switch_and_expand)
            
            # 切换展开状态（这个操作很快，可以直接执行）
            if item.isExpanded():
                item.setExpanded(False)
            else:
                item.setExpanded(True)
                # 展开时会自动触发 on_item_expanded，加载表列表（已经在on_item_expanded中使用延迟执行）
        elif item_type == TreeItemType.TABLE:
            # 双击表项，查询表数据
            table_info = TreeItemData.get_table_info(item)
            if table_info:
                database, table_name = table_info
                # 查询表数据（使用延迟执行，避免阻塞）
                def query_data():
                    self.query_table_data(connection_id, table_name, database)
                QTimer.singleShot(1, query_data)
    
    def on_item_clicked(self, item: QTreeWidgetItem, column: int):
        """单击项目（在UI线程中执行，确保快速返回，不阻塞）"""
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和分类项
        if item_type in (TreeItemType.ROOT, TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        # 使用QTimer延迟执行耗时操作，确保点击事件处理函数快速返回
        from PyQt6.QtCore import QTimer
        
        # 根据节点类型执行不同的操作
        if item_type == TreeItemType.CONNECTION:
            # 点击连接项，切换到该连接（使用延迟执行）
            def switch_connection():
                self.set_current_connection(connection_id)
            QTimer.singleShot(1, switch_connection)
        elif item_type == TreeItemType.DATABASE:
            # 点击数据库项，切换到该连接和数据库（使用延迟执行）
            database = TreeItemData.get_item_data(item)
            if database and isinstance(database, str):
                def switch_database():
                    self.set_current_connection(connection_id, database=database)
                QTimer.singleShot(1, switch_database)
            
            # 单击时不自动展开，让用户通过双击或点击展开按钮来控制展开/折叠
            # 如果数据库项已经展开，且表已经加载，则展开"表"分类（这个操作很快，可以直接执行）
            if item.isExpanded():
                for i in range(item.childCount()):
                    child = item.child(i)
                    if TreeItemData.get_item_type(child) == TreeItemType.TABLE_CATEGORY:
                        # 检查是否有表项（不是"加载中..."或"无表"）
                        has_tables = False
                        for j in range(child.childCount()):
                            table_child = child.child(j)
                            if TreeItemData.get_item_type(table_child) == TreeItemType.TABLE:
                                has_tables = True
                                break
                        if has_tables:
                            child.setExpanded(True)
                        break
        elif item_type == TreeItemType.TABLE:
            # 点击表项，切换到该连接和数据库，并查询表数据
            table_info = TreeItemData.get_table_info(item)
            if table_info:
                table_database, table_name = table_info
                # 切换到该连接和数据库（使用延迟执行）
                def switch_and_query():
                    # 切换到该连接和数据库
                    self.set_current_connection(connection_id, database=table_database)
                    # 查询表数据（已经在query_table_data中使用延迟执行）
                    self.query_table_data(connection_id, table_name, table_database)
                QTimer.singleShot(1, switch_and_query)
    
    def on_connection_selected(self, item: QTreeWidgetItem, column: int):
        """连接被选中（保留用于兼容）"""
        self.on_item_clicked(item, column)
    
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
    
    def _on_connection_ready(self, connection_id: str, connection: DatabaseConnection, 
                            database: Optional[str], update_completion: bool):
        """连接就绪，更新UI"""
        self.statusBar().showMessage(f"已连接到: {connection.get_display_name()}")
        self.sql_editor.set_status(f"已连接到: {connection.name}")
        # 更新SQL编辑器的数据库信息（用于AI生成SQL）
        self.sql_editor.set_database_info(self.db_manager, connection_id, database)
        # 更新SQL编辑器的自动完成（表名和列名）- 使用延迟更新，避免阻塞UI
        if update_completion:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(100, lambda: self.update_sql_completion(connection_id))
    
    def load_databases_for_connection(self, connection_item: QTreeWidgetItem, connection_id: str, force_reload: bool = False):
        """为连接加载数据库列表"""
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
                
                # 检查当前是否在新建表或编辑表tab，如果是则切换到查询tab
                current_index = self.right_tab_widget.currentIndex()
                if current_index > 0:  # 不是查询tab（查询tab是第一个，index为0）
                    current_tab = self.right_tab_widget.widget(current_index)
                    from src.gui.widgets.edit_table_tab import EditTableTab
                    if isinstance(current_tab, CreateTableTab) or isinstance(current_tab, EditTableTab):
                        # 切换到查询tab（第一个tab）
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
        item = self.connection_tree.itemAt(position)
        if not item:
            return
        
        # 获取节点类型
        item_type = TreeItemData.get_item_type(item)
        
        # 跳过根节点和分类项
        if item_type in (TreeItemType.ROOT, TreeItemType.TABLE_CATEGORY, TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
            return
        
        # 获取连接ID（从当前项或其父项中）
        connection_id = TreeItemData.get_connection_id(item)
        if not connection_id:
            return
        
        from PyQt6.QtWidgets import QMenu
        
        menu = QMenu(self)
        
        # 根据节点类型显示不同的菜单
        if item_type == TreeItemType.TABLE:
            # 表项的右键菜单
            table_info = TreeItemData.get_table_info(item)
            if table_info:
                database, table_name = table_info
                edit_table_action = menu.addAction("编辑表结构")
                edit_table_action.triggered.connect(lambda: self.edit_table_structure(connection_id, database, table_name))
                
                menu.addSeparator()
                
                copy_structure_action = menu.addAction("复制结构")
                copy_structure_action.triggered.connect(lambda: self.copy_table_structure(connection_id, database, table_name))
                
                menu.addSeparator()
                
                # 刷新该数据库下的所有表
                refresh_action = menu.addAction("🔄 刷新")
                refresh_action.triggered.connect(lambda: self.refresh_database_tables(connection_id, database))
        elif item_type == TreeItemType.DATABASE:
            # 数据库项的右键菜单
            database = TreeItemData.get_item_data(item)
            if database:
                refresh_action = menu.addAction("🔄 刷新")
                refresh_action.triggered.connect(lambda: self.refresh_database_tables(connection_id, database))
        else:
            # 连接项的右键菜单
            edit_action = menu.addAction("编辑")
            edit_action.triggered.connect(lambda: self.edit_connection(connection_id))
            
            test_action = menu.addAction("测试连接")
            test_action.triggered.connect(lambda: self.test_connection(connection_id))
            
            menu.addSeparator()
            
            refresh_action = menu.addAction("🔄 刷新")
            refresh_action.triggered.connect(lambda: self.refresh_connection_databases(connection_id, item))
            
            menu.addSeparator()
            
            remove_action = menu.addAction("删除")
            remove_action.triggered.connect(lambda: self.remove_connection(connection_id))
        
        menu.exec(self.connection_tree.mapToGlobal(position))
    
    def refresh_connection_databases(self, connection_id: str, connection_item: QTreeWidgetItem):
        """刷新连接下的数据库列表"""
        self.load_databases_for_connection(connection_item, connection_id, force_reload=True)
        self.statusBar().showMessage("正在刷新数据库列表...", 3000)
    
    def refresh_database_tables(self, connection_id: str, database: str):
        """刷新数据库下的表列表"""
        # 找到对应的数据库项
        root_item = self.connection_tree.topLevelItem(0)
        if not root_item:
            return
        
        # 遍历所有连接
        for i in range(root_item.childCount()):
            connection_item = root_item.child(i)
            if TreeItemData.get_item_type(connection_item) != TreeItemType.CONNECTION:
                continue
            
            # 检查连接ID是否匹配
            conn_id = TreeItemData.get_item_data(connection_item)
            if conn_id != connection_id:
                continue
            
            # 遍历连接下的数据库
            for j in range(connection_item.childCount()):
                db_item = connection_item.child(j)
                if TreeItemData.get_item_type(db_item) != TreeItemType.DATABASE:
                    continue
                
                # 检查数据库名是否匹配
                db_name = TreeItemData.get_item_data(db_item)
                if db_name == database:
                    # 找到匹配的数据库项，刷新表列表
                    self.load_tables_for_database(db_item, connection_id, database, force_reload=True)
                    self.statusBar().showMessage(f"正在刷新数据库 '{database}' 的表列表...", 3000)
                    return
        
        # 如果没找到，尝试从当前选中的项获取
        current_item = self.connection_tree.currentItem()
        if current_item:
            current_type = TreeItemData.get_item_type(current_item)
            if current_type == TreeItemType.DATABASE:
                db_name = TreeItemData.get_item_data(current_item)
                if db_name == database:
                    self.load_tables_for_database(current_item, connection_id, database, force_reload=True)
                    self.statusBar().showMessage(f"正在刷新数据库 '{database}' 的表列表...", 3000)
                    return
    
    def test_connection(self, connection_id: str = None):
        """测试连接（使用后台线程，避免阻塞UI）"""
        if not connection_id:
            connection_id = self.current_connection_id
        
        if not connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        # 获取连接配置
        connection = self.db_manager.get_connection(connection_id)
        if not connection:
            QMessageBox.warning(self, "警告", "连接不存在")
            return
        
        # 使用后台线程测试连接，避免阻塞UI
        self._test_and_show_result(connection)
    
    def _test_and_show_result(self, connection: DatabaseConnection):
        """在后台线程中测试连接，然后显示结果"""
        # 异步停止旧的测试worker，不等待，避免阻塞UI
        if self.connection_test_worker:
            try:
                if self.connection_test_worker.isRunning():
                    # 断开信号连接，避免旧worker的回调影响新操作
                    try:
                        self.connection_test_worker.test_finished.disconnect()
                    except:
                        pass
                    # 请求停止，但不等待（异步停止）
                    self.connection_test_worker.stop()
                    # 不等待，让线程自己结束，稍后自动清理
                    self.connection_test_worker.deleteLater()
            except RuntimeError:
                pass
        
        # 显示测试中的提示
        self.statusBar().showMessage("正在测试连接...")
        
        # 创建并启动连接测试线程
        self.connection_test_worker = ConnectionTestWorker(connection)
        self.connection_test_worker.test_finished.connect(self._on_test_result_ready)
        self.connection_test_worker.start()
    
    def _on_test_result_ready(self, success: bool, message: str):
        """连接测试完成后的回调"""
        if success:
            self.statusBar().showMessage("连接测试成功", 3000)
            QMessageBox.information(self, "成功", message)
        else:
            self.statusBar().showMessage("连接测试失败", 3000)
            QMessageBox.warning(self, "失败", message)
    
    def execute_query(self, sql: str = None):
        """执行SQL查询（使用后台线程，避免阻塞UI）"""
        if not self.current_connection_id:
            QMessageBox.warning(self, "警告", "请先选择一个数据库连接")
            return
        
        if not sql:
            sql = self.sql_editor.get_sql()
        
        if not sql:
            QMessageBox.warning(self, "警告", "请输入SQL语句")
            return
        
        # 如果已有查询正在执行，先安全停止
        if self.query_worker:
            if self.query_worker.isRunning():
                self.query_worker.stop()
                if not self.query_worker.wait(3000):  # 等待最多3秒
                    # 如果还在运行，强制终止（不推荐，但作为最后手段）
                    logger.warning("查询线程未能在3秒内结束，强制终止")
                    self.query_worker.terminate()
                    self.query_worker.wait(1000)
                # 断开信号连接，避免在删除时触发
                try:
                    self.query_worker.query_finished.disconnect()
                    self.query_worker.query_progress.disconnect()
                except:
                    pass
            # 确保线程对象被正确清理
            self.query_worker.deleteLater()
            self.query_worker = None
        
        # 判断SQL类型
        sql_upper = sql.strip().upper()
        is_query = sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))
        
        # 获取连接信息
        connection = self.db_manager.get_connection(self.current_connection_id)
        if not connection:
            QMessageBox.warning(self, "警告", "连接不存在")
            return
        
        # 确保使用当前选中的数据库（如果当前数据库与连接配置中的不同，先切换）
        if self.current_database and self.current_database != connection.database:
            try:
                self.db_manager.switch_database(self.current_connection_id, self.current_database)
                # 重新获取连接（因为 switch_database 可能更新了连接配置）
                connection = self.db_manager.get_connection(self.current_connection_id)
                if not connection:
                    QMessageBox.warning(self, "警告", "连接不存在")
                    return
            except Exception as e:
                logger.error(f"切换数据库失败: {e}")
                QMessageBox.warning(self, "警告", f"切换数据库失败: {e}")
                return
        
        # 显示加载状态
        self.sql_editor.set_status("执行中...")
        # 注意：不清空结果，因为可能有多条SQL，每条SQL会创建一个新的Tab
        
        # 创建并启动工作线程（传递连接信息，在线程中创建引擎）
        self.query_worker = QueryWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            sql,
            is_query=is_query
        )
        
        # 连接信号
        self.query_worker.query_finished.connect(self.on_query_finished)
        self.query_worker.query_progress.connect(self.on_query_progress)
        self.query_worker.multi_query_finished.connect(self.on_multi_query_finished)
        self.query_worker.multi_query_finished.connect(self.on_multi_query_finished)
        
        # 启动线程
        self.query_worker.start()
    
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
    
    def _refresh_edit_table_tabs(self, sql: str):
        """刷新所有编辑表tab的表结构（当执行ALTER TABLE语句后）"""
        try:
            # 遍历所有tab，找到编辑表tab并刷新
            for i in range(self.right_tab_widget.count()):
                tab_widget = self.right_tab_widget.widget(i)
                if tab_widget and hasattr(tab_widget, 'table_name') and hasattr(tab_widget, 'load_table_schema'):
                    # 这是编辑表tab，强制从数据库重新获取表结构
                    tab_widget.load_table_schema(force_refresh=True)
                    logger.info(f"已自动刷新编辑表tab '{tab_widget.table_name}' 的表结构（从数据库重新获取）")
        except Exception as e:
            logger.error(f"刷新编辑表tab失败: {str(e)}")
    
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
        self.sql_editor.clear_sql()
        self.result_table.clear_all()  # 使用clear_all方法
    
    def show_settings(self):
        """显示设置对话框"""
        dialog = SettingsDialog(self, self.settings, self.translation_manager)
        dialog.language_changed.connect(self.on_language_changed)
        dialog.exec()
    
    def on_language_changed(self, new_language: str):
        """语言改变时的回调"""
        if self.translation_manager:
            # 更新设置（已经保存到注册表）
            self.settings.language = new_language
            
            # 提示用户需要重启应用
            reply = QMessageBox.information(
                self,
                self.tr("语言设置"),
                self.tr("语言设置已保存到注册表。\n\n需要重启应用程序才能使语言更改生效。\n\n是否现在重启？"),
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                # 重启应用
                self.restart_application()
    
    def restart_application(self):
        """重启应用程序"""
        import sys
        import os
        import subprocess
        
        try:
            # 获取应用程序路径
            if getattr(sys, 'frozen', False):
                # 如果是打包后的可执行文件
                executable = sys.executable
                args = [executable]
            else:
                # 如果是开发模式，使用 Python 解释器
                executable = sys.executable
                script = sys.argv[0]
                args = [executable, script]
            
            # 添加原始命令行参数（跳过脚本名）
            if len(sys.argv) > 1:
                args.extend(sys.argv[1:])
            
            # 使用 subprocess 启动新进程
            # 在 Windows 上使用 CREATE_NEW_CONSOLE 标志
            if sys.platform == "win32":
                subprocess.Popen(
                    args,
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            else:
                subprocess.Popen(args)
            
            # 关闭当前应用
            QApplication.instance().quit()
        except Exception as e:
            logger.error(f"重启应用失败: {e}")
            QMessageBox.warning(
                self,
                self.tr("错误"),
                self.tr("重启应用失败，请手动重启应用程序。")
            )
    
    def retranslate_ui(self):
        """重新翻译UI界面"""
        # 更新窗口标题
        self.setWindowTitle(self.tr("DataAI - AI驱动的数据库管理工具"))
        
        # 更新状态栏
        self.statusBar().showMessage(self.tr("就绪"))
        
        # 更新菜单栏标题和菜单项
        if hasattr(self, 'file_menu') and self.file_menu:
            self.file_menu.setTitle(self.tr("文件(&F)"))
            actions = self.file_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    # 根据快捷键匹配菜单项
                    if action.shortcut().toString() == "Ctrl+N":
                        action.setText(self.tr("添加数据库连接(&N)"))
                    elif "Navicat" in action.text() or "Navicat" in action.data():
                        action.setText(self.tr("从 Navicat 导入(&I)"))
                    elif "AI模型" in action.text() or "AI Model" in action.text():
                        action.setText(self.tr("AI模型配置(&A)"))
                    elif "提示词" in action.text() or "Prompt" in action.text():
                        action.setText(self.tr("AI提示词配置(&P)"))
                    elif action.shortcut().toString() == "Ctrl+Q":
                        action.setText(self.tr("退出(&X)"))
        
        if hasattr(self, 'db_menu') and self.db_menu:
            self.db_menu.setTitle(self.tr("数据库(&D)"))
            actions = self.db_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    if "测试" in action.text() or "Test" in action.text():
                        action.setText(self.tr("测试连接(&T)"))
                    elif action.shortcut().toString() == "F5":
                        action.setText(self.tr("刷新(&R)"))
        
        if hasattr(self, 'query_menu') and self.query_menu:
            self.query_menu.setTitle(self.tr("查询(&Q)"))
            actions = self.query_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    if "执行" in action.text() or "Execute" in action.text():
                        action.setText(self.tr("执行查询(&E)"))
                    elif "清空" in action.text() or "Clear" in action.text():
                        action.setText(self.tr("清空查询(&C)"))
        
        if hasattr(self, 'settings_menu') and self.settings_menu:
            self.settings_menu.setTitle(self.tr("设置(&S)"))
            actions = self.settings_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    action.setText(self.tr("设置(&S)"))
        
        if hasattr(self, 'help_menu') and self.help_menu:
            self.help_menu.setTitle(self.tr("帮助(&H)"))
            actions = self.help_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    action.setText(self.tr("关于(&A)"))
        
        # 更新工具栏按钮和标签
        if hasattr(self, 'add_connection_btn'):
            self.add_connection_btn.setText(self.tr("添加连接"))
        if hasattr(self, 'import_navicat_btn'):
            self.import_navicat_btn.setText(self.tr("导入 Navicat"))
        if hasattr(self, 'ai_model_label'):
            self.ai_model_label.setText(self.tr("AI模型:"))
        if hasattr(self, 'connection_label'):
            self.connection_label.setText(self.tr("当前连接:"))
        
        # 更新标签页
        if hasattr(self, 'right_tab_widget'):
            for i in range(self.right_tab_widget.count()):
                tab_text = self.right_tab_widget.tabText(i)
                # 检查是否是查询标签页
                if tab_text in ["查询", "Query"]:
                    self.right_tab_widget.setTabText(i, self.tr("查询"))
    
    def show_about(self):
        """显示关于对话框"""
        QMessageBox.about(
            self,
            "关于 DataAI",
            "DataAI - AI驱动的数据库管理工具\n\n"
            "版本 0.2.0\n\n"
            "作者: codeyG\n"
            "邮箱: 550187704@qq.com\n\n"
            "功能特性:\n"
            "- AI智能SQL生成\n"
            "- AI连接配置识别\n"
            "- 多数据库支持\n"
            "- 查询结果直接编辑\n"
            "- 数据批量删除\n\n"
            "支持的数据库:\n"
            "- MySQL/MariaDB\n"
            "- PostgreSQL\n"
            "- SQLite\n"
            "- Oracle\n"
            "- SQL Server\n\n"
            "开源协议: MIT License"
        )
    
