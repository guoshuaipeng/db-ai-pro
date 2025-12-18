"""
UI 初始化处理器
"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QSplitter, 
    QTreeWidgetItem, QToolBar, QPushButton, QComboBox, QLabel, QTabWidget,
    QGroupBox, QMenu
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QIcon
from typing import TYPE_CHECKING
import sys
from pathlib import Path
import logging

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class UIHandler:
    """UI 初始化处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def init_ui(self):
        """初始化用户界面"""
        self.main_window.setWindowTitle(self.main_window.tr("DataAI - AI驱动的数据库管理工具"))
        # 设置最小窗口尺寸
        self.main_window.setMinimumSize(1200, 800)
        # 设置初始窗口大小（避免显示时从很小的窗口闪现）
        self.main_window.resize(1600, 1000)
        
        # 设置窗口图标
        self._set_window_icon()
        
        # 测试：放开菜单栏和工具栏
        self.create_menu_bar()
        self.create_toolbar()
        
        # 创建状态栏
        self.main_window.statusBar().showMessage(self.main_window.tr("就绪"))
        
        # 创建中央部件
        self._create_central_widget()
    
    def _set_window_icon(self):
        """设置窗口图标"""
        if self.main_window.windowIcon().isNull():
            # 检查是否是PyInstaller打包后的环境
            if getattr(sys, 'frozen', False):
                # PyInstaller打包后的环境，使用sys._MEIPASS获取临时目录
                base_path = Path(sys._MEIPASS)
            else:
                # 开发环境，使用项目根目录
                project_root = Path(__file__).parent.parent.parent.parent
                base_path = project_root
            
            # 优先尝试ICO文件（Windows任务栏需要）
            icon_path = base_path / "resources" / "icons" / "app_icon.ico"
            if not icon_path.exists():
                # 其次尝试PNG文件
                icon_path = base_path / "resources" / "icons" / "app_icon.png"
            
            if icon_path.exists():
                self.main_window.setWindowIcon(QIcon(str(icon_path)))
    
    def _create_central_widget(self):
        """创建中央部件"""
        from src.gui.widgets.connection_tree_with_search import ConnectionTreeWithSearch
        from src.gui.widgets.sql_editor import SQLEditor
        from src.gui.widgets.multi_result_table import MultiResultTable
        
        central_widget = QWidget()
        self.main_window.setCentralWidget(central_widget)
        
        # 主布局（增加内边距，让界面更宽松）
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(8)
        central_widget.setLayout(main_layout)
        
        # 创建分割器
        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        main_splitter.setHandleWidth(6)  # 增加分割器手柄宽度，更容易拖拽
        
        # 左侧：数据库连接树（带搜索功能）
        self.main_window.connection_tree = ConnectionTreeWithSearch()
        
        # 注意：handler 在 __init__ 之后才初始化，所以这里先连接，稍后在 setup_connections 中重新连接
        self.main_window.connection_tree.itemDoubleClicked.connect(self.main_window.on_item_double_clicked)
        self.main_window.connection_tree.itemClicked.connect(self.main_window.on_item_clicked)
        self.main_window.connection_tree.itemExpanded.connect(self.main_window.on_item_expanded)
        self.main_window.connection_tree.itemCollapsed.connect(self.main_window.on_item_collapsed)
        self.main_window.connection_tree.customContextMenuRequested.connect(self.main_window.show_connection_menu)
        
        # 设置字体（稍微增大）
        font = QFont("Microsoft YaHei", 10)
        self.main_window.connection_tree.setFont(font)
        
        main_splitter.addWidget(self.main_window.connection_tree)
        
        # 右侧：Tab控件（包含查询tab和新建表tab）
        self.main_window.right_tab_widget = QTabWidget()
        self.main_window.right_tab_widget.setTabsClosable(True)
        self.main_window.right_tab_widget.tabCloseRequested.connect(self.main_window.close_query_tab)
        # 设置Tab字体
        tab_font = QFont("Microsoft YaHei", 10)
        self.main_window.right_tab_widget.setFont(tab_font)
        
        # 启用tab bar的鼠标滚轮支持
        tab_bar = self.main_window.right_tab_widget.tabBar()
        tab_bar.setUsesScrollButtons(True)  # 启用滚动按钮
        tab_bar.setElideMode(Qt.TextElideMode.ElideRight)  # 文本超出时省略
        
        # 设置tab bar的右键菜单
        tab_bar.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        tab_bar.customContextMenuRequested.connect(self._on_tab_bar_context_menu)
        
        # 第一个tab：查询（包含AI查询、SQL编辑器和结果）
        query_tab = QWidget()
        query_layout = QVBoxLayout()
        query_layout.setContentsMargins(5, 5, 5, 5)  # 增加内边距
        query_layout.setSpacing(5)
        query_tab.setLayout(query_layout)
        
        # 在查询tab顶部添加连接选择（用GroupBox包裹）
        connection_group = QGroupBox(self.main_window.tr("查询范围"))
        connection_group.setStyleSheet("QGroupBox { font-weight: bold; padding-top: 10px; }")
        connection_group_layout = QHBoxLayout()
        connection_group_layout.setSpacing(10)
        connection_group_layout.setContentsMargins(10, 15, 10, 10)
        connection_group.setLayout(connection_group_layout)
        
        # 当前连接
        connection_label = QLabel(self.main_window.tr("当前连接:"))
        connection_group_layout.addWidget(connection_label)
        
        self.main_window.connection_combo = QComboBox()
        self.main_window.connection_combo.setMinimumWidth(250)
        self.main_window.connection_combo.currentTextChanged.connect(self.main_window.on_connection_combo_changed)
        connection_group_layout.addWidget(self.main_window.connection_combo)
        
        # 当前数据库
        database_label = QLabel(self.main_window.tr("当前数据库:"))
        connection_group_layout.addWidget(database_label)
        
        self.main_window.database_combo = QComboBox()
        self.main_window.database_combo.setMinimumWidth(200)
        self.main_window.database_combo.currentTextChanged.connect(self.main_window.on_database_combo_changed)
        connection_group_layout.addWidget(self.main_window.database_combo)
        
        connection_group_layout.addStretch()  # 添加弹性空间
        
        query_layout.addWidget(connection_group)
        
        query_splitter = QSplitter(Qt.Orientation.Vertical)
        query_splitter.setChildrenCollapsible(False)
        query_splitter.setHandleWidth(6)  # 增加分割器手柄宽度
        
        # SQL编辑器（包含AI查询）
        self.main_window.sql_editor = SQLEditor()
        self.main_window.sql_editor._main_window = self.main_window
        self.main_window.sql_editor.execute_signal.connect(self.main_window.execute_query)
        self.main_window.sql_editor.set_database_info(self.main_window.db_manager, None)
        query_splitter.addWidget(self.main_window.sql_editor)
        
        # 结果表格
        self.main_window.result_table = MultiResultTable()
        self.main_window.result_table._main_window = self.main_window  # 传递主窗口引用
        query_splitter.addWidget(self.main_window.result_table)
        
        # 设置拉伸因子（调整比例，让结果区域更大）
        query_splitter.setStretchFactor(0, 2)
        query_splitter.setStretchFactor(1, 3)
        query_splitter.setSizes([450, 650])  # 增加初始高度
        
        query_layout.addWidget(query_splitter)
        self.main_window.right_tab_widget.addTab(query_tab, self.main_window.tr("查询"))
        
        main_splitter.addWidget(self.main_window.right_tab_widget)
        
        # 设置分割器属性，防止完全折叠
        main_splitter.setCollapsible(0, False)  # 左侧（连接树）不可折叠
        main_splitter.setCollapsible(1, False)  # 右侧（查询区域）不可折叠
        
        main_splitter.setStretchFactor(0, 0)
        main_splitter.setStretchFactor(1, 1)
        # 设置初始宽度比例（左侧连接树稍窄，右侧内容区域更宽）
        main_splitter.setSizes([280, 1320])
        
        main_layout.addWidget(main_splitter)
    
    def create_menu_bar(self):
        """创建菜单栏"""
        from PyQt6.QtGui import QAction
        
        menubar = self.main_window.menuBar()
        
        # 文件菜单
        file_menu = menubar.addMenu(self.main_window.tr("文件(&F)"))
        
        add_connection_action = QAction(self._get_icon('add'), self.main_window.tr("添加数据库连接(&N)"), self.main_window)
        add_connection_action.setShortcut("Ctrl+N")
        add_connection_action.triggered.connect(self.main_window.add_connection)
        file_menu.addAction(add_connection_action)
        
        import_action = QAction(self._get_icon('import'), self.main_window.tr("从 Navicat 导入(&I)"), self.main_window)
        import_action.triggered.connect(self.main_window.import_from_navicat)
        file_menu.addAction(import_action)
        
        file_menu.addSeparator()
        
        exit_action = QAction(self._get_icon('exit'), self.main_window.tr("退出(&X)"), self.main_window)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.main_window.close)
        file_menu.addAction(exit_action)
        
        # 数据库菜单
        db_menu = menubar.addMenu(self.main_window.tr("数据库(&D)"))
        
        test_connection_action = QAction(self._get_icon('test'), self.main_window.tr("测试连接(&T)"), self.main_window)
        test_connection_action.triggered.connect(self.main_window.test_connection)
        db_menu.addAction(test_connection_action)
        
        refresh_action = QAction(self._get_icon('refresh'), self.main_window.tr("刷新(&R)"), self.main_window)
        refresh_action.setShortcut("Ctrl+R")
        refresh_action.triggered.connect(self.main_window.refresh_connections)
        db_menu.addAction(refresh_action)
        
        db_menu.addSeparator()
        
        # 结构同步
        sync_schema_action = QAction(self._get_icon('sync'), self.main_window.tr("结构同步(&S)"), self.main_window)
        sync_schema_action.triggered.connect(self.main_window.show_schema_sync)
        db_menu.addAction(sync_schema_action)
        
        # 查询菜单
        query_menu = menubar.addMenu(self.main_window.tr("查询(&Q)"))
        
        execute_action = QAction(self._get_icon('execute'), self.main_window.tr("执行查询(&E)"), self.main_window)
        execute_action.setShortcut("F5")
        execute_action.triggered.connect(self.main_window.execute_query)
        query_menu.addAction(execute_action)
        
        clear_action = QAction(self._get_icon('clear'), self.main_window.tr("清空查询(&C)"), self.main_window)
        clear_action.triggered.connect(self.main_window.clear_query)
        query_menu.addAction(clear_action)
        
        # 设置菜单
        settings_menu = menubar.addMenu(self.main_window.tr("设置(&S)"))
        
        settings_action = QAction(self._get_icon('settings'), self.main_window.tr("设置(&S)"), self.main_window)
        settings_action.triggered.connect(self.main_window.show_settings)
        settings_menu.addAction(settings_action)
        
        settings_menu.addSeparator()
        
        # AI模型配置
        ai_config_action = QAction(self._get_icon('ai'), self.main_window.tr("AI模型配置(&A)"), self.main_window)
        ai_config_action.triggered.connect(self.main_window.configure_ai_models)
        settings_menu.addAction(ai_config_action)
        
        # AI提示词配置
        prompt_config_action = QAction(self._get_icon('edit'), self.main_window.tr("AI提示词配置(&P)"), self.main_window)
        prompt_config_action.triggered.connect(self.main_window.configure_prompts)
        settings_menu.addAction(prompt_config_action)
        
        # 帮助菜单
        help_menu = menubar.addMenu(self.main_window.tr("帮助(&H)"))
        
        about_action = QAction(self._get_icon('about'), self.main_window.tr("关于(&A)"), self.main_window)
        about_action.triggered.connect(self.main_window.show_about)
        help_menu.addAction(about_action)
        
        # 保存菜单引用以便后续更新翻译
        self.main_window.menubar = menubar
        self.main_window.file_menu = file_menu
        self.main_window.db_menu = db_menu
        self.main_window.query_menu = query_menu
        self.main_window.settings_menu = settings_menu
        self.main_window.help_menu = help_menu
    
    def create_toolbar(self):
        """创建工具栏"""
        from PyQt6.QtGui import QAction
        from PyQt6.QtCore import QSize
        
        toolbar = QToolBar()
        toolbar.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        toolbar.setIconSize(QSize(24, 24))
        self.main_window.addToolBar(toolbar)
        
        # AI 配置按钮
        ai_config_action = QAction(self._get_icon('settings'), self.main_window.tr("AI 配置"), self.main_window)
        ai_config_action.setToolTip("配置 AI 模型和 API 密钥")
        ai_config_action.triggered.connect(self.main_window.configure_ai_models)
        toolbar.addAction(ai_config_action)
        self.main_window.ai_config_action = ai_config_action
        
        toolbar.addSeparator()
        
        # 添加连接按钮
        add_action = QAction(self._get_icon('add'), self.main_window.tr("添加连接"), self.main_window)
        add_action.setToolTip("添加新的数据库连接")
        add_action.setShortcut("Ctrl+N")
        add_action.triggered.connect(self.main_window.add_connection)
        toolbar.addAction(add_action)
        self.main_window.add_connection_action = add_action
        
        # 导入按钮
        import_action = QAction(self._get_icon('import'), self.main_window.tr("导入 Navicat"), self.main_window)
        import_action.setToolTip("从 Navicat 导入数据库连接")
        import_action.triggered.connect(self.main_window.import_from_navicat)
        toolbar.addAction(import_action)
        self.main_window.import_navicat_action = import_action
        
        # 刷新按钮
        refresh_action = QAction(self._get_icon('refresh'), self.main_window.tr("刷新"), self.main_window)
        refresh_action.setToolTip("刷新数据库连接列表")
        refresh_action.setShortcut("Ctrl+R")
        refresh_action.triggered.connect(self.main_window.refresh_connections)
        toolbar.addAction(refresh_action)
        self.main_window.refresh_action = refresh_action
        
        toolbar.addSeparator()
        
        # AI模型选择
        ai_model_label = QLabel(self.main_window.tr("AI模型:"))
        toolbar.addWidget(ai_model_label)
        self.main_window.ai_model_label = ai_model_label
        
        self.main_window.ai_model_combo = QComboBox()
        self.main_window.ai_model_combo.setMinimumWidth(200)
        self.main_window.ai_model_combo.currentIndexChanged.connect(self.main_window.on_ai_model_changed)
        toolbar.addWidget(self.main_window.ai_model_combo)
        
        # 刷新模型列表
        self.main_window.refresh_ai_models()
        
        toolbar.addSeparator()
        
        # 执行查询按钮
        execute_action = QAction(self._get_icon('execute'), self.main_window.tr("执行"), self.main_window)
        execute_action.setToolTip("执行 SQL 查询")
        execute_action.setShortcut("F5")
        execute_action.triggered.connect(self.main_window.execute_query)
        toolbar.addAction(execute_action)
        self.main_window.execute_action = execute_action
    
    def _get_icon(self, icon_type: str) -> QIcon:
        """获取图标
        
        Args:
            icon_type: 图标类型
            
        Returns:
            QIcon: 图标对象
        """
        style = self.main_window.style()
        
        # 定义图标映射
        icon_map = {
            'settings': style.standardIcon(style.StandardPixmap.SP_FileDialogDetailedView),
            'add': style.standardIcon(style.StandardPixmap.SP_FileDialogNewFolder),
            'import': style.standardIcon(style.StandardPixmap.SP_DialogOpenButton),
            'refresh': style.standardIcon(style.StandardPixmap.SP_BrowserReload),
            'table': style.standardIcon(style.StandardPixmap.SP_FileDialogListView),
            'execute': style.standardIcon(style.StandardPixmap.SP_MediaPlay),
            'database': style.standardIcon(style.StandardPixmap.SP_DirIcon),
            'connection': style.standardIcon(style.StandardPixmap.SP_DriveNetIcon),
            'edit': style.standardIcon(style.StandardPixmap.SP_FileDialogContentsView),
            'delete': style.standardIcon(style.StandardPixmap.SP_TrashIcon),
            'test': style.standardIcon(style.StandardPixmap.SP_DialogApplyButton),
            'exit': style.standardIcon(style.StandardPixmap.SP_DialogCloseButton),
            'sync': style.standardIcon(style.StandardPixmap.SP_BrowserReload),
            'clear': style.standardIcon(style.StandardPixmap.SP_DialogResetButton),
            'ai': style.standardIcon(style.StandardPixmap.SP_ComputerIcon),
            'about': style.standardIcon(style.StandardPixmap.SP_MessageBoxInformation),
        }
        
        return icon_map.get(icon_type, QIcon())
    
    def retranslate_ui(self):
        """重新翻译UI界面"""
        # 更新窗口标题
        self.main_window.setWindowTitle(self.main_window.tr("DataAI - AI驱动的数据库管理工具"))
        
        # 更新状态栏
        self.main_window.statusBar().showMessage(self.main_window.tr("就绪"))
        
        # 更新菜单栏标题和菜单项
        if hasattr(self.main_window, 'file_menu') and self.main_window.file_menu:
            self.main_window.file_menu.setTitle(self.main_window.tr("文件(&F)"))
            actions = self.main_window.file_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    # 根据快捷键匹配菜单项
                    if action.shortcut().toString() == "Ctrl+N":
                        action.setText(self.main_window.tr("添加数据库连接(&N)"))
                    elif "Navicat" in action.text() or "Navicat" in action.data():
                        action.setText(self.main_window.tr("从 Navicat 导入(&I)"))
                    elif "AI模型" in action.text() or "AI Model" in action.text():
                        action.setText(self.main_window.tr("AI模型配置(&A)"))
                    elif "提示词" in action.text() or "Prompt" in action.text():
                        action.setText(self.main_window.tr("AI提示词配置(&P)"))
                    elif action.shortcut().toString() == "Ctrl+Q":
                        action.setText(self.main_window.tr("退出(&X)"))
        
        if hasattr(self.main_window, 'db_menu') and self.main_window.db_menu:
            self.main_window.db_menu.setTitle(self.main_window.tr("数据库(&D)"))
            actions = self.main_window.db_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    if "测试" in action.text() or "Test" in action.text():
                        action.setText(self.main_window.tr("测试连接(&T)"))
                    elif action.shortcut().toString() == "F5":
                        action.setText(self.main_window.tr("刷新(&R)"))
        
        if hasattr(self.main_window, 'query_menu') and self.main_window.query_menu:
            self.main_window.query_menu.setTitle(self.main_window.tr("查询(&Q)"))
            actions = self.main_window.query_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    if "执行" in action.text() or "Execute" in action.text():
                        action.setText(self.main_window.tr("执行查询(&E)"))
                    elif "清空" in action.text() or "Clear" in action.text():
                        action.setText(self.main_window.tr("清空查询(&C)"))
        
        if hasattr(self.main_window, 'settings_menu') and self.main_window.settings_menu:
            self.main_window.settings_menu.setTitle(self.main_window.tr("设置(&S)"))
            actions = self.main_window.settings_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    action.setText(self.main_window.tr("设置(&S)"))
        
        if hasattr(self.main_window, 'help_menu') and self.main_window.help_menu:
            self.main_window.help_menu.setTitle(self.main_window.tr("帮助(&H)"))
            actions = self.main_window.help_menu.actions()
            for action in actions:
                if action.text() and not action.isSeparator():
                    action.setText(self.main_window.tr("关于(&A)"))
        
        # 更新工具栏按钮和标签
        if hasattr(self.main_window, 'ai_config_action'):
            self.main_window.ai_config_action.setText(self.main_window.tr("AI 配置"))
        if hasattr(self.main_window, 'add_connection_action'):
            self.main_window.add_connection_action.setText(self.main_window.tr("添加连接"))
        if hasattr(self.main_window, 'import_navicat_action'):
            self.main_window.import_navicat_action.setText(self.main_window.tr("导入 Navicat"))
        if hasattr(self.main_window, 'refresh_action'):
            self.main_window.refresh_action.setText(self.main_window.tr("刷新"))
        if hasattr(self.main_window, 'create_table_action'):
            self.main_window.create_table_action.setText(self.main_window.tr("新建表"))
        if hasattr(self.main_window, 'execute_action'):
            self.main_window.execute_action.setText(self.main_window.tr("执行"))
        if hasattr(self.main_window, 'ai_model_label'):
            self.main_window.ai_model_label.setText(self.main_window.tr("AI模型:"))
        if hasattr(self.main_window, 'connection_label'):
            self.main_window.connection_label.setText(self.main_window.tr("当前连接:"))
        
        # 更新标签页
        if hasattr(self.main_window, 'right_tab_widget'):
            for i in range(self.main_window.right_tab_widget.count()):
                tab_text = self.main_window.right_tab_widget.tabText(i)
                # 检查是否是查询标签页
                if tab_text in ["查询", "Query"]:
                    self.main_window.right_tab_widget.setTabText(i, self.main_window.tr("查询"))
    
    def _on_tab_bar_context_menu(self, position):
        """Tab bar右键菜单处理"""
        tab_bar = self.main_window.right_tab_widget.tabBar()
        index = tab_bar.tabAt(position)
        
        # 如果点击的不是tab，不显示菜单
        if index < 0:
            return
        
        # 创建右键菜单
        menu = QMenu(self.main_window)
        tab_count = self.main_window.right_tab_widget.count()
        
        # 关闭当前tab（第一个查询tab不能关闭）
        if index > 0:
            close_action = menu.addAction(self.main_window.tr("关闭"))
            close_action.triggered.connect(lambda: self.main_window.close_query_tab(index))
        
        # 关闭其他tabs（只在有多个tab时显示，且当前tab不是第一个）
        if tab_count > 1 and index > 0:
            if menu.actions():  # 如果前面已经有菜单项，添加分隔符
                menu.addSeparator()
            close_others_action = menu.addAction(self.main_window.tr("关闭其他"))
            close_others_action.triggered.connect(lambda: self._close_other_tabs(index))
        
        # 关闭所有tabs（只在有多个tab时显示）
        if tab_count > 1:
            if menu.actions():  # 如果前面已经有菜单项，添加分隔符
                menu.addSeparator()
            close_all_action = menu.addAction(self.main_window.tr("关闭所有"))
            close_all_action.triggered.connect(self._close_all_tabs)
        
        # 只有有菜单项时才显示菜单
        if menu.actions():
            menu.exec(tab_bar.mapToGlobal(position))
    
    def _close_other_tabs(self, keep_index: int):
        """关闭除了指定index之外的所有tabs（保留第一个查询tab）"""
        # 从后往前关闭，避免索引变化
        for i in range(self.main_window.right_tab_widget.count() - 1, -1, -1):
            if i != keep_index and i != 0:  # 保留当前tab和第一个查询tab
                self.main_window.close_query_tab(i)
    
    def _close_all_tabs(self):
        """关闭所有tabs（保留第一个查询tab）"""
        # 从后往前关闭，避免索引变化
        for i in range(self.main_window.right_tab_widget.count() - 1, 0, -1):
            self.main_window.close_query_tab(i)

