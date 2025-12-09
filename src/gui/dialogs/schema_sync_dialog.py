"""
数据库结构同步对话框
"""
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFormLayout,
    QComboBox,
    QPushButton,
    QDialogButtonBox,
    QMessageBox,
    QLabel,
    QGroupBox,
    QTableWidget,
    QTableWidgetItem,
    QCheckBox,
    QTextEdit,
    QSplitter,
    QHeaderView,
    QAbstractItemView,
    QTreeWidget,
    QTreeWidgetItem,
    QWizard,
    QWizardPage,
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from typing import Optional, List, Dict, Tuple
import logging

from src.core.database_connection import DatabaseConnection, DatabaseType
from src.core.database_manager import DatabaseManager

logger = logging.getLogger(__name__)


class SchemaSyncWorker(QThread):
    """结构同步工作线程"""
    
    # 定义信号
    comparison_ready = pyqtSignal(list)  # 比较结果: [(table_name, diff_type, details), ...]
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, source_conn: DatabaseConnection, source_db: str,
                 target_conn: DatabaseConnection, target_db: str,
                 db_manager: DatabaseManager):
        super().__init__()
        self.source_conn = source_conn
        self.source_db = source_db
        self.target_conn = target_conn
        self.target_db = target_db
        self.db_manager = db_manager
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def _normalize_default(self, default, col_type: str = "") -> Optional[str]:
        """规范化默认值，用于比较"""
        if default is None:
            return None
        
        # 处理 SQLAlchemy 的 ColumnDefault 对象
        from sqlalchemy.schema import ColumnDefault
        if isinstance(default, ColumnDefault):
            # 获取实际的默认值
            default = default.arg
        
        if default is None:
            return None
        
        # 转换为字符串
        default_str = str(default).strip()
        
        # 处理函数调用（如 CURRENT_TIMESTAMP）
        default_upper = default_str.upper()
        if default_upper in ('CURRENT_TIMESTAMP', 'NOW()', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP()'):
            return default_upper
        
        # 处理字符串类型（移除引号以便比较）
        if col_type and ('CHAR' in col_type.upper() or 'TEXT' in col_type.upper() or 'VARCHAR' in col_type.upper()):
            # 移除单引号或双引号
            if (default_str.startswith("'") and default_str.endswith("'")) or \
               (default_str.startswith('"') and default_str.endswith('"')):
                default_str = default_str[1:-1]
        
        # 处理数字类型（规范化格式）
        if default_str.replace('.', '').replace('-', '').replace('+', '').isdigit():
            # 移除前导零（除了小数点前）
            try:
                if '.' in default_str:
                    return str(float(default_str))
                else:
                    return str(int(default_str))
            except:
                pass
        
        return default_str
    
    def run(self):
        """比较表结构（在工作线程中运行）"""
        from sqlalchemy import create_engine, inspect
        from sqlalchemy.exc import SQLAlchemyError
        
        source_engine = None
        target_engine = None
        
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 创建源数据库引擎
            source_engine = create_engine(
                self.source_conn.get_connection_string(),
                connect_args=self.source_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            # 创建目标数据库引擎
            target_engine = create_engine(
                self.target_conn.get_connection_string(),
                connect_args=self.target_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            source_inspector = inspect(source_engine)
            target_inspector = inspect(target_engine)
            
            # 获取源数据库的表列表
            if self.source_db and self.source_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                source_tables = source_inspector.get_table_names(schema=self.source_db)
            else:
                source_tables = source_inspector.get_table_names()
            
            # 获取目标数据库的表列表
            if self.target_db and self.target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                target_tables = target_inspector.get_table_names(schema=self.target_db)
            else:
                target_tables = target_inspector.get_table_names()
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 比较表结构
            differences = []
            
            # 找出新增的表（在源中存在，在目标中不存在）
            for table in source_tables:
                if table not in target_tables:
                    differences.append({
                        'table_name': table,
                        'diff_type': 'new',
                        'details': '表不存在，需要创建'
                    })
            
            # 找出删除的表（在目标中存在，在源中不存在）
            for table in target_tables:
                if table not in source_tables:
                    differences.append({
                        'table_name': table,
                        'diff_type': 'delete',
                        'details': '表在源中不存在，需要删除'
                    })
            
            # 比较共同存在的表的结构
            common_tables = set(source_tables) & set(target_tables)
            for table in common_tables:
                if self.isInterruptionRequested() or self._should_stop:
                    return
                
                # 获取源表结构
                if self.source_db and self.source_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    source_columns = source_inspector.get_columns(table, schema=self.source_db)
                    source_pk = source_inspector.get_pk_constraint(table, schema=self.source_db)
                else:
                    source_columns = source_inspector.get_columns(table)
                    source_pk = source_inspector.get_pk_constraint(table)
                
                # 获取目标表结构
                if self.target_db and self.target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    target_columns = target_inspector.get_columns(table, schema=self.target_db)
                    target_pk = target_inspector.get_pk_constraint(table, schema=self.target_db)
                else:
                    target_columns = target_inspector.get_columns(table)
                    target_pk = target_inspector.get_pk_constraint(table)
                
                # 比较列
                source_cols_dict = {col['name']: col for col in source_columns}
                target_cols_dict = {col['name']: col for col in target_columns}
                
                col_diffs = []
                
                # 找出新增的列
                for col_name in source_cols_dict:
                    if col_name not in target_cols_dict:
                        col_diffs.append(f"新增列: {col_name}")
                
                # 找出删除的列
                for col_name in target_cols_dict:
                    if col_name not in source_cols_dict:
                        col_diffs.append(f"删除列: {col_name}")
                
                # 找出修改的列
                for col_name in source_cols_dict:
                    if col_name in target_cols_dict:
                        source_col = source_cols_dict[col_name]
                        target_col = target_cols_dict[col_name]
                        
                        # 比较类型
                        if str(source_col['type']) != str(target_col['type']):
                            col_diffs.append(f"列 {col_name} 类型不同: {source_col['type']} -> {target_col['type']}")
                        
                        # 比较是否可空
                        if source_col.get('nullable') != target_col.get('nullable'):
                            col_diffs.append(f"列 {col_name} 可空性不同")
                        
                        # 比较默认值（规范化后比较）
                        source_default = self._normalize_default(source_col.get('default'), str(source_col.get('type', '')))
                        target_default = self._normalize_default(target_col.get('default'), str(target_col.get('type', '')))
                        
                        # 比较规范化后的默认值
                        if source_default != target_default:
                            source_default_str = str(source_col.get('default', '')) if source_col.get('default') is not None else 'NULL'
                            target_default_str = str(target_col.get('default', '')) if target_col.get('default') is not None else 'NULL'
                            col_diffs.append(f"列 {col_name} 默认值不同: {source_default_str} -> {target_default_str}")
                
                # 比较主键
                source_pk_cols = source_pk.get('constrained_columns', []) if source_pk else []
                target_pk_cols = target_pk.get('constrained_columns', []) if target_pk else []
                if set(source_pk_cols) != set(target_pk_cols):
                    col_diffs.append(f"主键不同: {source_pk_cols} -> {target_pk_cols}")
                
                if col_diffs:
                    differences.append({
                        'table_name': table,
                        'diff_type': 'modify',
                        'details': '; '.join(col_diffs)
                    })
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            self.comparison_ready.emit(differences)
            
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"比较表结构失败: {error_msg}")
            self.error_occurred.emit(error_msg)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"比较表结构异常: {error_msg}")
            self.error_occurred.emit(error_msg)
        finally:
            if source_engine:
                try:
                    source_engine.dispose()
                except:
                    pass
            if target_engine:
                try:
                    target_engine.dispose()
                except:
                    pass


class Step1SelectDatabasesPage(QWizardPage):
    """第一步：选择数据库"""
    
    def __init__(self, db_manager: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.setTitle("步骤 1/3: 选择数据库")
        self.setSubTitle("请选择源数据库和目标数据库")
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(16, 16, 16, 16)
        self.setLayout(layout)
        
        # 源数据库选择
        source_group = QGroupBox("源数据库")
        source_layout = QFormLayout()
        source_layout.setSpacing(8)
        
        self.source_conn_combo = QComboBox()
        self.source_conn_combo.currentIndexChanged.connect(self.on_source_conn_changed)
        source_layout.addRow("连接:", self.source_conn_combo)
        
        self.source_db_combo = QComboBox()
        source_layout.addRow("数据库:", self.source_db_combo)
        
        source_group.setLayout(source_layout)
        layout.addWidget(source_group)
        
        # 目标数据库选择
        target_group = QGroupBox("目标数据库")
        target_layout = QFormLayout()
        target_layout.setSpacing(8)
        
        self.target_conn_combo = QComboBox()
        self.target_conn_combo.currentIndexChanged.connect(self.on_target_conn_changed)
        target_layout.addRow("连接:", self.target_conn_combo)
        
        self.target_db_combo = QComboBox()
        target_layout.addRow("数据库:", self.target_db_combo)
        
        target_group.setLayout(target_layout)
        layout.addWidget(target_group)
        
        layout.addStretch()
        
        # 加载连接列表
        self.load_connections()
    
    def load_connections(self):
        """加载连接列表"""
        if not self.db_manager:
            return
        
        connections = self.db_manager.get_all_connections()
        
        self.source_conn_combo.clear()
        self.target_conn_combo.clear()
        
        for conn in connections:
            display_name = f"{conn.name} ({conn.db_type.value})"
            self.source_conn_combo.addItem(display_name, conn.id)
            self.target_conn_combo.addItem(display_name, conn.id)
    
    def on_source_conn_changed(self):
        """源连接改变"""
        self.load_databases(self.source_conn_combo, self.source_db_combo)
    
    def on_target_conn_changed(self):
        """目标连接改变"""
        self.load_databases(self.target_conn_combo, self.target_db_combo)
    
    def load_databases(self, conn_combo: QComboBox, db_combo: QComboBox):
        """加载数据库列表"""
        if not self.db_manager:
            return
        
        conn_id = conn_combo.currentData()
        if not conn_id:
            db_combo.clear()
            return
        
        try:
            databases = self.db_manager.get_databases(conn_id)
            db_combo.clear()
            for db in databases:
                db_combo.addItem(db, db)
        except Exception as e:
            logger.error(f"加载数据库列表失败: {e}")
            db_combo.clear()
    
    def validatePage(self) -> bool:
        """验证页面"""
        source_conn_id = self.source_conn_combo.currentData()
        target_conn_id = self.target_conn_combo.currentData()
        source_db = self.source_db_combo.currentData()
        target_db = self.target_db_combo.currentData()
        
        if not source_conn_id or not target_conn_id:
            QMessageBox.warning(self, "警告", "请选择源数据库和目标数据库连接")
            return False
        
        if not source_db or not target_db:
            QMessageBox.warning(self, "警告", "请选择源数据库和目标数据库")
            return False
        
        return True


class Step2CompareResultsPage(QWizardPage):
    """第二步：显示比对结果"""
    
    def __init__(self, db_manager: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.setTitle("步骤 2/3: 比对结果")
        self.setSubTitle("查看数据库结构差异，选择需要同步的项")
        
        self.differences = []
        self.sync_worker = None
        self.diff_checkboxes = {}
        self.comparison_complete = False
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(16, 16, 16, 16)
        self.setLayout(layout)
        
        # 状态标签
        self.status_label = QLabel('点击"下一步"开始比较...')
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.status_label)
        
        # 差异树
        self.diff_tree = QTreeWidget()
        self.diff_tree.setColumnCount(3)
        self.diff_tree.setHeaderLabels(["选择", "差异项", "详情"])
        self.diff_tree.setHeaderHidden(False)
        self.diff_tree.setRootIsDecorated(True)
        self.diff_tree.setItemsExpandable(True)
        self.diff_tree.setExpandsOnDoubleClick(False)
        self.diff_tree.setColumnWidth(0, 50)
        layout.addWidget(self.diff_tree)
        
        # 按钮
        btn_layout = QHBoxLayout()
        select_all_btn = QPushButton("全选")
        select_all_btn.clicked.connect(lambda: self.select_all_diffs(True))
        select_none_btn = QPushButton("取消全选")
        select_none_btn.clicked.connect(lambda: self.select_all_diffs(False))
        expand_all_btn = QPushButton("展开全部")
        expand_all_btn.clicked.connect(lambda: self.diff_tree.expandAll())
        collapse_all_btn = QPushButton("折叠全部")
        collapse_all_btn.clicked.connect(lambda: self.diff_tree.collapseAll())
        btn_layout.addWidget(select_all_btn)
        btn_layout.addWidget(select_none_btn)
        btn_layout.addWidget(expand_all_btn)
        btn_layout.addWidget(collapse_all_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)
    
    def initializePage(self):
        """页面初始化时自动开始比较"""
        if not self.comparison_complete:
            self.start_comparison()
    
    def start_comparison(self):
        """开始比较"""
        wizard = self.wizard()
        if not wizard:
            return
        
        # 从第一步页面直接获取值
        step1 = wizard.page(0)
        if not step1:
            return
        
        source_conn_id = step1.source_conn_combo.currentData()
        target_conn_id = step1.target_conn_combo.currentData()
        source_db = step1.source_db_combo.currentData()
        target_db = step1.target_db_combo.currentData()
        
        if not source_conn_id or not target_conn_id or not source_db or not target_db:
            return
        
        source_conn = self.db_manager.get_connection(source_conn_id)
        target_conn = self.db_manager.get_connection(target_conn_id)
        
        if not source_conn or not target_conn:
            return
        
        # 清空结果
        self.diff_tree.clear()
        self.diff_checkboxes = {}
        self.comparison_complete = False
        
        # 更新状态
        self.status_label.setText("正在比较表结构...")
        self.status_label.setStyleSheet("color: #1976d2; padding: 5px; font-weight: bold;")
        
        # 停止之前的比较
        if self.sync_worker and self.sync_worker.isRunning():
            self.sync_worker.stop()
            self.sync_worker.wait(2000)
            if self.sync_worker.isRunning():
                self.sync_worker.terminate()
                self.sync_worker.wait(1000)
            self.sync_worker.deleteLater()
        
        # 创建并启动比较线程
        self.sync_worker = SchemaSyncWorker(
            source_conn, source_db,
            target_conn, target_db,
            self.db_manager
        )
        self.sync_worker.comparison_ready.connect(self.on_comparison_ready)
        self.sync_worker.error_occurred.connect(self.on_comparison_error)
        self.sync_worker.start()
    
    def on_comparison_ready(self, differences: List[Dict]):
        """比较完成"""
        self.differences = differences
        self.comparison_complete = True
        
        # 更新状态
        diff_count = len(differences)
        if diff_count == 0:
            self.status_label.setText("比较完成：未发现差异")
            self.status_label.setStyleSheet("color: #4caf50; padding: 5px;")
        else:
            new_count = sum(1 for d in differences if d['diff_type'] == 'new')
            modify_count = sum(1 for d in differences if d['diff_type'] == 'modify')
            delete_count = sum(1 for d in differences if d['diff_type'] == 'delete')
            self.status_label.setText(
                f"比较完成：发现 {diff_count} 个差异 "
                f"(新增: {new_count}, 修改: {modify_count}, 删除: {delete_count})"
            )
            self.status_label.setStyleSheet("color: #4caf50; padding: 5px;")
        
        # 清空树和复选框字典
        self.diff_tree.clear()
        self.diff_checkboxes.clear()
        
        from PyQt6.QtGui import QColor
        
        for diff in differences:
            table_name = diff['table_name']
            diff_type = diff['diff_type']
            details = diff['details']
            
            # 创建表节点
            table_item = QTreeWidgetItem(self.diff_tree)
            table_item.setText(1, table_name)
            table_item.setExpanded(True)
            
            # 差异类型文本
            type_text = {
                'new': '新增表',
                'delete': '删除表',
                'modify': '修改表'
            }.get(diff_type, diff_type)
            
            # 根据类型设置颜色
            if diff_type == 'new':
                table_item.setBackground(1, QColor(200, 255, 200))
            elif diff_type == 'delete':
                table_item.setBackground(1, QColor(255, 200, 200))
            elif diff_type == 'modify':
                table_item.setBackground(1, QColor(255, 255, 200))
            
            # 添加复选框
            checkbox = QCheckBox()
            checkbox.setChecked(True)
            checkbox.stateChanged.connect(self.on_checkbox_changed)
            self.diff_tree.setItemWidget(table_item, 0, checkbox)
            self.diff_checkboxes[table_name] = checkbox
            
            # 创建类型节点
            type_item = QTreeWidgetItem(table_item)
            type_item.setText(1, type_text)
            type_item.setBackground(1, table_item.background(1))
            
            # 解析差异详情
            if details:
                detail_items = details.split('; ')
                for detail_item in detail_items:
                    if detail_item.strip():
                        detail_node = QTreeWidgetItem(type_item)
                        detail_node.setText(1, detail_item.strip())
                        detail_node.setExpanded(True)
            
            if type_item.childCount() == 0:
                type_item.setText(2, details)
        
        self.diff_tree.resizeColumnToContents(1)
    
    def on_comparison_error(self, error: str):
        """比较错误"""
        self.comparison_complete = True
        self.status_label.setText(f"比较失败: {error[:50]}...")
        self.status_label.setStyleSheet("color: #f44336; padding: 5px;")
        QMessageBox.warning(self, "错误", f"比较表结构失败: {error}")
    
    def on_checkbox_changed(self):
        """复选框改变"""
        wizard = self.wizard()
        if wizard:
            wizard.update_sql_preview()
    
    def select_all_diffs(self, select: bool):
        """全选/取消全选"""
        if not self.diff_checkboxes:
            return
        
        for table_name, checkbox in self.diff_checkboxes.items():
            if checkbox:
                # 临时断开信号，避免触发更新
                try:
                    checkbox.stateChanged.disconnect()
                except:
                    pass
                checkbox.setChecked(select)
                # 重新连接信号
                checkbox.stateChanged.connect(self.on_checkbox_changed)
    
    def validatePage(self) -> bool:
        """验证页面"""
        if not self.comparison_complete:
            QMessageBox.warning(self, "警告", "请等待比较完成")
            return False
        
        # 检查是否至少选择了一个差异
        has_selected = False
        for checkbox in self.diff_checkboxes.values():
            if checkbox and checkbox.isChecked():
                has_selected = True
                break
        
        if not has_selected:
            QMessageBox.warning(self, "警告", "请至少选择一个需要同步的差异")
            return False
        
        return True


class Step3PreviewAndExecutePage(QWizardPage):
    """第三步：预览SQL并执行同步"""
    
    def __init__(self, db_manager: DatabaseManager, parent=None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.setTitle("步骤 3/3: 预览并执行")
        self.setSubTitle("预览同步SQL脚本，确认后执行同步")
        
        self.init_ui()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(16, 16, 16, 16)
        self.setLayout(layout)
        
        # SQL预览
        sql_label = QLabel("同步SQL脚本预览:")
        layout.addWidget(sql_label)
        
        self.sql_preview = QTextEdit()
        self.sql_preview.setReadOnly(True)
        self.sql_preview.setFontFamily("Consolas")
        self.sql_preview.setFontPointSize(10)
        layout.addWidget(self.sql_preview)
        
        # 执行状态
        self.execute_status = QLabel("")
        self.execute_status.setStyleSheet("color: #666; padding: 5px;")
        layout.addWidget(self.execute_status)
    
    def initializePage(self):
        """页面初始化时生成SQL预览"""
        self.update_sql_preview()
    
    def update_sql_preview(self):
        """更新SQL预览"""
        wizard = self.wizard()
        if not wizard:
            return
        
        # 从第一步页面获取数据库选择
        step1 = wizard.page(0)
        if not step1:
            return
        
        source_conn_id = step1.source_conn_combo.currentData()
        target_conn_id = step1.target_conn_combo.currentData()
        source_db = step1.source_db_combo.currentData()
        target_db = step1.target_db_combo.currentData()
        
        if not source_conn_id or not target_conn_id:
            return
        
        # 获取第二步的数据
        step2 = wizard.page(1)  # 第二步是索引1
        if not step2 or not hasattr(step2, 'differences'):
            return
        
        differences = step2.differences
        diff_checkboxes = step2.diff_checkboxes
        
        source_conn = self.db_manager.get_connection(source_conn_id)
        target_conn = self.db_manager.get_connection(target_conn_id)
        
        if not source_conn or not target_conn:
            return
        
        sql_statements = []
        
        for diff in differences:
            table_name = diff['table_name']
            checkbox = diff_checkboxes.get(table_name)
            if not checkbox or not checkbox.isChecked():
                continue
            
            diff_type = diff['diff_type']
            
            if diff_type == 'new':
                sql = self._generate_create_table_sql(source_conn, source_db, table_name, target_conn, target_db)
                if sql:
                    sql_statements.append(f"-- 创建表: {table_name}\n{sql}\n")
            elif diff_type == 'delete':
                sql = self._generate_drop_table_sql(target_conn, target_db, table_name)
                if sql:
                    sql_statements.append(f"-- 删除表: {table_name}\n{sql}\n")
            elif diff_type == 'modify':
                sql = self._generate_alter_table_sql(source_conn, source_db, table_name, target_conn, target_db, diff.get('details', ''))
                if sql:
                    sql_statements.append(f"-- 修改表: {table_name}\n{sql}\n")
        
        self.sql_preview.setText('\n'.join(sql_statements))
    
    def _generate_create_table_sql(self, source_conn, source_db, table_name, target_conn, target_db):
        """生成CREATE TABLE语句"""
        from src.gui.workers.copy_table_structure_worker import CopyTableStructureWorker
        from PyQt6.QtCore import QEventLoop
        
        worker = CopyTableStructureWorker(
            source_conn.get_connection_string(),
            source_conn.get_connect_args(),
            source_db,
            table_name,
            source_conn.db_type.value
        )
        
        loop = QEventLoop()
        worker.create_sql_ready.connect(loop.quit)
        worker.error_occurred.connect(loop.quit)
        worker.start()
        loop.exec()
        
        if hasattr(worker, 'create_sql'):
            return worker.create_sql
        return None
    
    def _generate_drop_table_sql(self, target_conn, target_db, table_name):
        """生成DROP TABLE语句"""
        from src.core.database_connection import DatabaseType
        
        def escape_identifier(name: str, db_type: DatabaseType) -> str:
            if db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                return f"`{name}`"
            elif db_type == DatabaseType.POSTGRESQL:
                return f'"{name}"'
            elif db_type == DatabaseType.SQLSERVER:
                return f"[{name}]"
            else:
                return name
        
        table_name_escaped = escape_identifier(table_name, target_conn.db_type)
        if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            table_name_escaped = f"{escape_identifier(target_db, target_conn.db_type)}.{table_name_escaped}"
        
        return f"DROP TABLE {table_name_escaped};"
    
    def _generate_alter_table_sql(self, source_conn, source_db, table_name, target_conn, target_db, details):
        """生成ALTER TABLE语句"""
        from sqlalchemy import create_engine, inspect
        from src.core.database_connection import DatabaseType
        
        def escape_identifier(name: str, db_type: DatabaseType) -> str:
            if db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                return f"`{name}`"
            elif db_type == DatabaseType.POSTGRESQL:
                return f'"{name}"'
            elif db_type == DatabaseType.SQLSERVER:
                return f"[{name}]"
            else:
                return name
        
        try:
            # 创建源和目标引擎
            source_engine = create_engine(
                source_conn.get_connection_string(),
                connect_args=source_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            target_engine = create_engine(
                target_conn.get_connection_string(),
                connect_args=target_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            source_inspector = inspect(source_engine)
            target_inspector = inspect(target_engine)
            
            # 获取源表结构
            if source_db and source_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                source_columns = source_inspector.get_columns(table_name, schema=source_db)
                source_pk = source_inspector.get_pk_constraint(table_name, schema=source_db)
            else:
                source_columns = source_inspector.get_columns(table_name)
                source_pk = source_inspector.get_pk_constraint(table_name)
            
            # 获取目标表结构
            if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                target_columns = target_inspector.get_columns(table_name, schema=target_db)
                target_pk = target_inspector.get_pk_constraint(table_name, schema=target_db)
            else:
                target_columns = target_inspector.get_columns(table_name)
                target_pk = target_inspector.get_pk_constraint(table_name)
            
            source_cols_dict = {col['name']: col for col in source_columns}
            target_cols_dict = {col['name']: col for col in target_columns}
            
            alter_statements = []
            table_name_escaped = escape_identifier(table_name, target_conn.db_type)
            if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                table_name_escaped = f"{escape_identifier(target_db, target_conn.db_type)}.{table_name_escaped}"
            
            # 找出新增的列
            for col_name in source_cols_dict:
                if col_name not in target_cols_dict:
                    source_col = source_cols_dict[col_name]
                    col_type = str(source_col['type'])
                    nullable = source_col.get('nullable', True)
                    default = source_col.get('default')
                    
                    col_def = f"ADD COLUMN {escape_identifier(col_name, target_conn.db_type)} {col_type}"
                    if not nullable:
                        col_def += " NOT NULL"
                    if default is not None:
                        default_str = str(default)
                        if 'CHAR' in col_type.upper() or 'TEXT' in col_type.upper():
                            col_def += f" DEFAULT '{default_str}'"
                        else:
                            col_def += f" DEFAULT {default_str}"
                    
                    alter_statements.append(f"ALTER TABLE {table_name_escaped} {col_def};")
            
            # 找出删除的列（谨慎处理，通常不自动删除）
            deleted_cols = [col_name for col_name in target_cols_dict if col_name not in source_cols_dict]
            if deleted_cols:
                alter_statements.append(f"-- 警告：以下列在源表中不存在，需要手动删除：{', '.join(deleted_cols)}")
            
            # 找出修改的列
            for col_name in source_cols_dict:
                if col_name in target_cols_dict:
                    source_col = source_cols_dict[col_name]
                    target_col = target_cols_dict[col_name]
                    
                    # 比较类型
                    if str(source_col['type']) != str(target_col['type']):
                        alter_statements.append(
                            f"ALTER TABLE {table_name_escaped} "
                            f"MODIFY COLUMN {escape_identifier(col_name, target_conn.db_type)} {source_col['type']};"
                        )
                    
                    # 比较可空性
                    if source_col.get('nullable') != target_col.get('nullable'):
                        nullable_str = "NULL" if source_col.get('nullable', True) else "NOT NULL"
                        alter_statements.append(
                            f"ALTER TABLE {table_name_escaped} "
                            f"MODIFY COLUMN {escape_identifier(col_name, target_conn.db_type)} {nullable_str};"
                        )
            
            # 比较主键
            source_pk_cols = source_pk.get('constrained_columns', []) if source_pk else []
            target_pk_cols = target_pk.get('constrained_columns', []) if target_pk else []
            if set(source_pk_cols) != set(target_pk_cols):
                if target_pk_cols:
                    alter_statements.append(f"-- 需要删除旧主键: {', '.join(target_pk_cols)}")
                if source_pk_cols:
                    pk_cols_str = ', '.join([escape_identifier(col, target_conn.db_type) for col in source_pk_cols])
                    alter_statements.append(
                        f"ALTER TABLE {table_name_escaped} "
                        f"ADD PRIMARY KEY ({pk_cols_str});"
                    )
            
            source_engine.dispose()
            target_engine.dispose()
            
            if alter_statements:
                return '\n'.join(alter_statements)
            else:
                return "-- 无需修改"
                
        except Exception as e:
            logger.error(f"生成ALTER TABLE语句失败: {e}")
            return f"-- 生成ALTER TABLE语句失败: {str(e)}"
    
    def validatePage(self) -> bool:
        """验证页面并执行同步"""
        sql = self.sql_preview.toPlainText().strip()
        if not sql:
            QMessageBox.warning(self, "警告", "没有需要执行的SQL语句")
            return False
        
        # 确认执行
        reply = QMessageBox.question(
            self,
            "确认执行",
            "确定要执行同步吗？此操作将修改目标数据库结构。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return False
        
        # 执行同步
        self.execute_status.setText("正在执行同步...")
        self.execute_status.setStyleSheet("color: #1976d2; padding: 5px; font-weight: bold;")
        
        wizard = self.wizard()
        if wizard and hasattr(wizard, 'main_window'):
            # 使用主窗口的execute_query方法执行SQL
            main_window = wizard.main_window
            if main_window:
                main_window.execute_query(sql)
                self.execute_status.setText("同步执行完成！")
                self.execute_status.setStyleSheet("color: #4caf50; padding: 5px;")
                QMessageBox.information(self, "成功", "数据库结构同步完成！")
                return True
        
        self.execute_status.setText("执行失败：无法获取主窗口")
        self.execute_status.setStyleSheet("color: #f44336; padding: 5px;")
        return False


class SchemaSyncDialog(QWizard):
    """数据库结构同步向导"""
    
    def __init__(self, parent=None, db_manager: DatabaseManager = None):
        super().__init__(parent)
        self.db_manager = db_manager
        self.main_window = parent  # 保存主窗口引用
        self.setWindowTitle("数据库结构同步")
        self.setModal(True)
        self.resize(1000, 700)
        
        # 添加页面
        self.addPage(Step1SelectDatabasesPage(db_manager, self))
        self.addPage(Step2CompareResultsPage(db_manager, self))
        self.addPage(Step3PreviewAndExecutePage(db_manager, self))
        
        # 设置页面完成按钮文本
        self.setButtonText(QWizard.WizardButton.NextButton, "下一步")
        self.setButtonText(QWizard.WizardButton.BackButton, "上一步")
        self.setButtonText(QWizard.WizardButton.FinishButton, "执行同步")
        self.setButtonText(QWizard.WizardButton.CancelButton, "取消")
    
    def initializePage(self, page_id: int):
        """页面初始化"""
        if page_id == 1:  # 第二步
            # 从第一步获取值，触发比较
            step2 = self.page(1)
            if step2 and hasattr(step2, 'start_comparison'):
                step2.start_comparison()
        elif page_id == 2:  # 第三步
            # 更新SQL预览
            step3 = self.page(2)
            if step3:
                step3.update_sql_preview()
    
    def update_sql_preview(self):
        """更新SQL预览（供第二步调用）"""
        step3 = self.page(2)
        if step3:
            step3.update_sql_preview()
    
    def init_ui(self):
        """初始化UI"""
        layout = QVBoxLayout()
        layout.setSpacing(12)
        layout.setContentsMargins(16, 16, 16, 16)
        self.setLayout(layout)
        
        # 源数据库选择
        source_group = QGroupBox("源数据库")
        source_layout = QFormLayout()
        source_layout.setSpacing(8)
        
        self.source_conn_combo = QComboBox()
        self.source_conn_combo.currentIndexChanged.connect(self.on_source_conn_changed)
        source_layout.addRow("连接:", self.source_conn_combo)
        
        self.source_db_combo = QComboBox()
        source_layout.addRow("数据库:", self.source_db_combo)
        
        source_group.setLayout(source_layout)
        layout.addWidget(source_group)
        
        # 目标数据库选择
        target_group = QGroupBox("目标数据库")
        target_layout = QFormLayout()
        target_layout.setSpacing(8)
        
        self.target_conn_combo = QComboBox()
        self.target_conn_combo.currentIndexChanged.connect(self.on_target_conn_changed)
        target_layout.addRow("连接:", self.target_conn_combo)
        
        self.target_db_combo = QComboBox()
        target_layout.addRow("数据库:", self.target_db_combo)
        
        target_group.setLayout(target_layout)
        layout.addWidget(target_group)
        
        # 比较按钮和状态标签
        compare_layout = QHBoxLayout()
        self.compare_btn = QPushButton("🔍 比较结构")
        self.compare_btn.clicked.connect(self.compare_schemas)
        compare_layout.addWidget(self.compare_btn)
        
        self.status_label = QLabel("就绪")
        self.status_label.setStyleSheet("color: #666; padding: 5px;")
        compare_layout.addStretch()
        compare_layout.addWidget(self.status_label)
        layout.addLayout(compare_layout)
        
        # 分割器：差异列表和SQL预览
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # 左侧：差异列表（使用树形视图）
        diff_group = QGroupBox("结构差异")
        diff_layout = QVBoxLayout()
        
        self.diff_tree = QTreeWidget()
        self.diff_tree.setColumnCount(3)
        self.diff_tree.setHeaderLabels(["选择", "差异项", "详情"])
        self.diff_tree.setHeaderHidden(False)
        self.diff_tree.setRootIsDecorated(True)
        self.diff_tree.setItemsExpandable(True)
        self.diff_tree.setExpandsOnDoubleClick(False)
        self.diff_tree.header().setStretchLastSection(True)
        self.diff_tree.setColumnWidth(0, 50)  # 选择列固定宽度
        self.diff_tree.itemChanged.connect(self.on_diff_item_changed)
        
        # 全选/取消全选按钮
        select_btn_layout = QHBoxLayout()
        select_all_btn = QPushButton("全选")
        select_all_btn.clicked.connect(lambda: self.select_all_diffs(True))
        select_none_btn = QPushButton("取消全选")
        select_none_btn.clicked.connect(lambda: self.select_all_diffs(False))
        expand_all_btn = QPushButton("展开全部")
        expand_all_btn.clicked.connect(lambda: self.diff_tree.expandAll())
        collapse_all_btn = QPushButton("折叠全部")
        collapse_all_btn.clicked.connect(lambda: self.diff_tree.collapseAll())
        select_btn_layout.addWidget(select_all_btn)
        select_btn_layout.addWidget(select_none_btn)
        select_btn_layout.addWidget(expand_all_btn)
        select_btn_layout.addWidget(collapse_all_btn)
        select_btn_layout.addStretch()
        
        diff_layout.addLayout(select_btn_layout)
        diff_layout.addWidget(self.diff_tree)
        diff_group.setLayout(diff_layout)
        splitter.addWidget(diff_group)
        
        # 右侧：SQL预览
        sql_group = QGroupBox("SQL预览")
        sql_layout = QVBoxLayout()
        
        self.sql_preview = QTextEdit()
        self.sql_preview.setReadOnly(True)
        self.sql_preview.setFontFamily("Consolas")
        self.sql_preview.setFontPointSize(10)
        sql_layout.addWidget(self.sql_preview)
        
        sql_group.setLayout(sql_layout)
        splitter.addWidget(sql_group)
        
        splitter.setSizes([400, 600])
        layout.addWidget(splitter)
        
        # 按钮
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.button(QDialogButtonBox.StandardButton.Ok).setText("执行同步")
        button_box.button(QDialogButtonBox.StandardButton.Ok).clicked.connect(self.execute_sync)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)
        
        # 加载连接列表
        self.load_connections()
    
    def load_connections(self):
        """加载连接列表"""
        if not self.db_manager:
            return
        
        connections = self.db_manager.get_all_connections()
        
        self.source_conn_combo.clear()
        self.target_conn_combo.clear()
        
        for conn in connections:
            display_name = f"{conn.name} ({conn.db_type.value})"
            self.source_conn_combo.addItem(display_name, conn.id)
            self.target_conn_combo.addItem(display_name, conn.id)
    
    def on_source_conn_changed(self):
        """源连接改变"""
        self.load_databases(self.source_conn_combo, self.source_db_combo)
    
    def on_target_conn_changed(self):
        """目标连接改变"""
        self.load_databases(self.target_conn_combo, self.target_db_combo)
    
    def load_databases(self, conn_combo: QComboBox, db_combo: QComboBox):
        """加载数据库列表"""
        if not self.db_manager:
            return
        
        conn_id = conn_combo.currentData()
        if not conn_id:
            db_combo.clear()
            return
        
        try:
            databases = self.db_manager.get_databases(conn_id)
            db_combo.clear()
            for db in databases:
                db_combo.addItem(db, db)
        except Exception as e:
            logger.error(f"加载数据库列表失败: {e}")
            db_combo.clear()
    
    def compare_schemas(self):
        """比较表结构"""
        source_conn_id = self.source_conn_combo.currentData()
        target_conn_id = self.target_conn_combo.currentData()
        source_db = self.source_db_combo.currentData()
        target_db = self.target_db_combo.currentData()
        
        if not source_conn_id or not target_conn_id:
            QMessageBox.warning(self, "警告", "请选择源数据库和目标数据库连接")
            return
        
        if not source_db or not target_db:
            QMessageBox.warning(self, "警告", "请选择源数据库和目标数据库")
            return
        
        source_conn = self.db_manager.get_connection(source_conn_id)
        target_conn = self.db_manager.get_connection(target_conn_id)
        
        if not source_conn or not target_conn:
            QMessageBox.warning(self, "警告", "连接不存在")
            return
        
        # 停止之前的比较
        if self.sync_worker and self.sync_worker.isRunning():
            self.sync_worker.stop()
            self.sync_worker.wait(2000)
            if self.sync_worker.isRunning():
                self.sync_worker.terminate()
                self.sync_worker.wait(1000)
            self.sync_worker.deleteLater()
        
        # 清空结果
        self.diff_tree.clear()
        self.sql_preview.clear()
        
        # 更新状态
        self.status_label.setText("正在比较表结构...")
        self.status_label.setStyleSheet("color: #1976d2; padding: 5px; font-weight: bold;")
        self.compare_btn.setEnabled(False)  # 禁用按钮，防止重复点击
        
        # 创建并启动比较线程
        self.sync_worker = SchemaSyncWorker(
            source_conn, source_db,
            target_conn, target_db,
            self.db_manager
        )
        self.sync_worker.comparison_ready.connect(self.on_comparison_ready)
        self.sync_worker.error_occurred.connect(self.on_comparison_error)
        self.sync_worker.finished.connect(self.on_comparison_finished)
        self.sync_worker.start()
    
    def on_comparison_ready(self, differences: List[Dict]):
        """比较完成"""
        self.differences = differences
        
        # 更新状态
        diff_count = len(differences)
        if diff_count == 0:
            self.status_label.setText("比较完成：未发现差异")
            self.status_label.setStyleSheet("color: #4caf50; padding: 5px;")
        else:
            new_count = sum(1 for d in differences if d['diff_type'] == 'new')
            modify_count = sum(1 for d in differences if d['diff_type'] == 'modify')
            delete_count = sum(1 for d in differences if d['diff_type'] == 'delete')
            self.status_label.setText(
                f"比较完成：发现 {diff_count} 个差异 "
                f"(新增: {new_count}, 修改: {modify_count}, 删除: {delete_count})"
            )
            self.status_label.setStyleSheet("color: #4caf50; padding: 5px;")
        
        # 重新启用按钮
        self.compare_btn.setEnabled(True)
        
        # 清空树
        self.diff_tree.clear()
        
        # 存储复选框引用，用于后续操作
        self.diff_checkboxes = {}
        
        from PyQt6.QtGui import QColor
        
        for diff in differences:
            table_name = diff['table_name']
            diff_type = diff['diff_type']
            details = diff['details']
            
            # 创建表节点（根节点）
            table_item = QTreeWidgetItem(self.diff_tree)
            table_item.setText(0, table_name)
            table_item.setExpanded(True)  # 默认展开
            
            # 差异类型文本
            type_text = {
                'new': '新增表',
                'delete': '删除表',
                'modify': '修改表'
            }.get(diff_type, diff_type)
            
            # 根据类型设置颜色
            if diff_type == 'new':
                table_item.setBackground(0, QColor(200, 255, 200))  # 浅绿色
            elif diff_type == 'delete':
                table_item.setBackground(0, QColor(255, 200, 200))  # 浅红色
            elif diff_type == 'modify':
                table_item.setBackground(0, QColor(255, 255, 200))  # 浅黄色
            
            # 设置表名（在第二列）
            table_item.setText(1, table_name)
            
            # 添加复选框到第一列
            checkbox = QCheckBox()
            checkbox.setChecked(True)  # 默认选中
            checkbox.stateChanged.connect(self.generate_sql_preview)
            self.diff_tree.setItemWidget(table_item, 0, checkbox)
            # 保存复选框引用
            self.diff_checkboxes[table_name] = checkbox
            
            # 创建类型节点
            type_item = QTreeWidgetItem(table_item)
            type_item.setText(1, type_text)  # 在第二列显示类型
            type_item.setBackground(1, table_item.background(1))
            
            # 解析差异详情，创建子节点
            if details:
                # 按分号分割不同的差异项
                detail_items = details.split('; ')
                for detail_item in detail_items:
                    if detail_item.strip():
                        detail_node = QTreeWidgetItem(type_item)
                        detail_node.setText(1, detail_item.strip())  # 在第二列显示详情
                        detail_node.setText(2, "")  # 第三列留空
                        detail_node.setExpanded(True)
            
            # 如果只有类型节点，展开它
            if type_item.childCount() == 0:
                type_item.setText(2, details)  # 如果没有子项，直接在第三列显示详情
        
        # 调整列宽
        self.diff_tree.resizeColumnToContents(0)
        
        # 生成SQL预览
        self.generate_sql_preview()
    
    def on_comparison_error(self, error: str):
        """比较错误"""
        # 更新状态
        self.status_label.setText(f"比较失败: {error[:50]}...")
        self.status_label.setStyleSheet("color: #f44336; padding: 5px;")
        
        # 重新启用按钮
        self.compare_btn.setEnabled(True)
        
        QMessageBox.warning(self, "错误", f"比较表结构失败: {error}")
    
    def on_comparison_finished(self):
        """比较线程结束（无论成功或失败）"""
        # 确保按钮被重新启用
        if hasattr(self, 'compare_btn'):
            self.compare_btn.setEnabled(True)
    
    def on_diff_item_changed(self, item: QTreeWidgetItem):
        """差异项改变"""
        # 当树节点改变时，可以在这里处理
        pass
    
    def select_all_diffs(self, select: bool):
        """全选/取消全选"""
        for table_name, checkbox in self.diff_checkboxes.items():
            if checkbox:
                checkbox.setChecked(select)
        self.generate_sql_preview()
    
    def generate_sql_preview(self):
        """生成SQL预览"""
        source_conn_id = self.source_conn_combo.currentData()
        target_conn_id = self.target_conn_combo.currentData()
        source_db = self.source_db_combo.currentData()
        target_db = self.target_db_combo.currentData()
        
        if not source_conn_id or not target_conn_id:
            return
        
        source_conn = self.db_manager.get_connection(source_conn_id)
        target_conn = self.db_manager.get_connection(target_conn_id)
        
        if not source_conn or not target_conn:
            return
        
        sql_statements = []
        
        for diff in self.differences:
            table_name = diff['table_name']
            checkbox = self.diff_checkboxes.get(table_name)
            if not checkbox or not checkbox.isChecked():
                continue
            
            diff_type = diff['diff_type']
            
            if diff_type == 'new':
                # 生成 CREATE TABLE 语句
                sql = self._generate_create_table_sql(source_conn, source_db, table_name, target_conn, target_db)
                if sql:
                    sql_statements.append(f"-- 创建表: {table_name}\n{sql}\n")
            elif diff_type == 'delete':
                # 生成 DROP TABLE 语句
                sql = self._generate_drop_table_sql(target_conn, target_db, table_name)
                if sql:
                    sql_statements.append(f"-- 删除表: {table_name}\n{sql}\n")
            elif diff_type == 'modify':
                # 生成 ALTER TABLE 语句
                sql = self._generate_alter_table_sql(source_conn, source_db, table_name, target_conn, target_db, diff.get('details', ''))
                if sql:
                    sql_statements.append(f"-- 修改表: {table_name}\n{sql}\n")
        
        self.sql_preview.setText('\n'.join(sql_statements))
    
    def _generate_create_table_sql(self, source_conn: DatabaseConnection, source_db: str,
                                   table_name: str, target_conn: DatabaseConnection, target_db: str) -> str:
        """生成 CREATE TABLE 语句"""
        from src.gui.workers.copy_table_structure_worker import CopyTableStructureWorker
        from PyQt6.QtCore import QEventLoop
        
        # 使用现有的复制表结构工作线程
        worker = CopyTableStructureWorker(
            source_conn.get_connection_string(),
            source_conn.get_connect_args(),
            source_db,
            table_name,
            source_conn.db_type.value
        )
        
        sql_result = [None]
        error_result = [None]
        
        def on_sql_ready(sql: str):
            sql_result[0] = sql
        
        def on_error(error: str):
            error_result[0] = error
        
        worker.create_sql_ready.connect(on_sql_ready)
        worker.error_occurred.connect(on_error)
        worker.start()
        worker.wait(10000)  # 等待最多10秒
        
        if error_result[0]:
            logger.error(f"生成CREATE TABLE失败: {error_result[0]}")
            return ""
        
        if sql_result[0]:
            # 调整表名和数据库名以匹配目标数据库
            sql = sql_result[0]
            # 替换源数据库名为目标数据库名（如果是MySQL/MariaDB）
            if source_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB) and source_db:
                if target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB) and target_db:
                    sql = sql.replace(f"`{source_db}`.`{table_name}`", f"`{target_db}`.`{table_name}`")
                    sql = sql.replace(f"`{source_db}`.", f"`{target_db}`.")
            
            return sql
        
        return ""
    
    def _generate_drop_table_sql(self, target_conn: DatabaseConnection, target_db: str, table_name: str) -> str:
        """生成 DROP TABLE 语句"""
        def escape_identifier(name: str) -> str:
            if target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                return f"`{name}`"
            elif target_conn.db_type == DatabaseType.POSTGRESQL:
                return f'"{name}"'
            elif target_conn.db_type == DatabaseType.SQLSERVER:
                return f"[{name}]"
            else:
                return name
        
        table_name_escaped = escape_identifier(table_name)
        if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
            table_name_escaped = f"{escape_identifier(target_db)}.{table_name_escaped}"
        
        return f"DROP TABLE {table_name_escaped};"
    
    def _generate_alter_table_sql(self, source_conn: DatabaseConnection, source_db: str,
                                  table_name: str, target_conn: DatabaseConnection, target_db: str, details: str = "") -> str:
        """生成 ALTER TABLE 语句"""
        from sqlalchemy import create_engine, inspect
        from sqlalchemy.exc import SQLAlchemyError
        
        def escape_identifier(name: str, db_type: DatabaseType) -> str:
            if db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                return f"`{name}`"
            elif db_type == DatabaseType.POSTGRESQL:
                return f'"{name}"'
            elif db_type == DatabaseType.SQLSERVER:
                return f"[{name}]"
            else:
                return name
        
        try:
            # 创建源和目标引擎
            source_engine = create_engine(
                source_conn.get_connection_string(),
                connect_args=source_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            target_engine = create_engine(
                target_conn.get_connection_string(),
                connect_args=target_conn.get_connect_args(),
                pool_pre_ping=False,
                echo=False,
                poolclass=None
            )
            
            source_inspector = inspect(source_engine)
            target_inspector = inspect(target_engine)
            
            # 获取源表结构
            if source_db and source_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                source_columns = source_inspector.get_columns(table_name, schema=source_db)
                source_pk = source_inspector.get_pk_constraint(table_name, schema=source_db)
            else:
                source_columns = source_inspector.get_columns(table_name)
                source_pk = source_inspector.get_pk_constraint(table_name)
            
            # 获取目标表结构
            if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                target_columns = target_inspector.get_columns(table_name, schema=target_db)
                target_pk = target_inspector.get_pk_constraint(table_name, schema=target_db)
            else:
                target_columns = target_inspector.get_columns(table_name)
                target_pk = target_inspector.get_pk_constraint(table_name)
            
            source_cols_dict = {col['name']: col for col in source_columns}
            target_cols_dict = {col['name']: col for col in target_columns}
            
            alter_statements = []
            table_name_escaped = escape_identifier(table_name, target_conn.db_type)
            if target_db and target_conn.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                table_name_escaped = f"{escape_identifier(target_db, target_conn.db_type)}.{table_name_escaped}"
            
            # 找出新增的列
            for col_name in source_cols_dict:
                if col_name not in target_cols_dict:
                    source_col = source_cols_dict[col_name]
                    col_type = str(source_col['type'])
                    nullable = source_col.get('nullable', True)
                    default = source_col.get('default')
                    
                    col_def = f"ADD COLUMN {escape_identifier(col_name, target_conn.db_type)} {col_type}"
                    if not nullable:
                        col_def += " NOT NULL"
                    if default is not None:
                        default_str = str(default)
                        if 'CHAR' in col_type.upper() or 'TEXT' in col_type.upper():
                            col_def += f" DEFAULT '{default_str}'"
                        else:
                            col_def += f" DEFAULT {default_str}"
                    
                    alter_statements.append(f"ALTER TABLE {table_name_escaped} {col_def};")
            
            # 找出删除的列（谨慎处理，通常不自动删除）
            # 这里只生成注释，不实际执行
            deleted_cols = [col_name for col_name in target_cols_dict if col_name not in source_cols_dict]
            if deleted_cols:
                alter_statements.append(f"-- 警告：以下列在源表中不存在，需要手动删除：{', '.join(deleted_cols)}")
            
            # 找出修改的列
            for col_name in source_cols_dict:
                if col_name in target_cols_dict:
                    source_col = source_cols_dict[col_name]
                    target_col = target_cols_dict[col_name]
                    
                    # 比较类型
                    if str(source_col['type']) != str(target_col['type']):
                        alter_statements.append(
                            f"ALTER TABLE {table_name_escaped} "
                            f"MODIFY COLUMN {escape_identifier(col_name, target_conn.db_type)} {source_col['type']};"
                        )
                    
                    # 比较可空性
                    if source_col.get('nullable') != target_col.get('nullable'):
                        nullable_str = "NULL" if source_col.get('nullable', True) else "NOT NULL"
                        alter_statements.append(
                            f"ALTER TABLE {table_name_escaped} "
                            f"MODIFY COLUMN {escape_identifier(col_name, target_conn.db_type)} {nullable_str};"
                        )
            
            # 比较主键
            source_pk_cols = source_pk.get('constrained_columns', []) if source_pk else []
            target_pk_cols = target_pk.get('constrained_columns', []) if target_pk else []
            if set(source_pk_cols) != set(target_pk_cols):
                # 如果主键不同，需要先删除旧主键，再添加新主键
                if target_pk_cols:
                    alter_statements.append(f"-- 需要删除旧主键: {', '.join(target_pk_cols)}")
                if source_pk_cols:
                    pk_cols_str = ', '.join([escape_identifier(col, target_conn.db_type) for col in source_pk_cols])
                    alter_statements.append(
                        f"ALTER TABLE {table_name_escaped} "
                        f"ADD PRIMARY KEY ({pk_cols_str});"
                    )
            
            source_engine.dispose()
            target_engine.dispose()
            
            if alter_statements:
                return '\n'.join(alter_statements)
            else:
                return "-- 无需修改"
                
        except Exception as e:
            logger.error(f"生成ALTER TABLE语句失败: {e}")
            return f"-- 生成ALTER TABLE语句失败: {str(e)}"
    
    def execute_sync(self):
        """执行同步"""
        selected_count = 0
        for i in range(self.diff_table.rowCount()):
            checkbox = self.diff_table.cellWidget(i, 0)
            if checkbox and checkbox.isChecked():
                selected_count += 1
        
        if selected_count == 0:
            QMessageBox.warning(self, "警告", "请至少选择一个要同步的项")
            return
        
        reply = QMessageBox.question(
            self,
            "确认",
            f"确定要执行同步吗？\n将执行 {selected_count} 个操作。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # 获取SQL语句并执行
            sql_text = self.sql_preview.toPlainText()
            if sql_text and sql_text.strip():
                # 过滤掉注释行
                sql_lines = [line for line in sql_text.split('\n') if line.strip() and not line.strip().startswith('--')]
                if sql_lines:
                    # 通过主窗口执行SQL
                    main_window = self.parent()
                    if main_window and hasattr(main_window, 'execute_query'):
                        # 确保切换到目标数据库连接
                        target_conn_id = self.target_conn_combo.currentData()
                        target_db = self.target_db_combo.currentData()
                        
                        if target_conn_id:
                            # 切换到目标连接和数据库
                            main_window.set_current_connection(target_conn_id, database=target_db)
                            
                            # 将SQL复制到SQL编辑器并执行
                            main_window.sql_editor.set_sql(sql_text)
                            main_window.execute_query(sql_text)
                            QMessageBox.information(
                                self, 
                                "成功", 
                                f"已执行 {selected_count} 个同步操作\n"
                                f"SQL已复制到查询编辑器并执行\n"
                                f"目标数据库: {self.target_conn_combo.currentText()} - {target_db}"
                            )
                            self.accept()
                        else:
                            QMessageBox.warning(self, "错误", "无法获取目标数据库连接")
                    else:
                        # 如果没有主窗口，提示用户手动复制
                        QMessageBox.information(
                            self, 
                            "提示", 
                            f"SQL已生成，共 {selected_count} 个操作\n\n"
                            "请手动复制SQL到查询编辑器执行，或关闭对话框后在查询编辑器中查看。"
                        )
                        self.accept()
                else:
                    QMessageBox.warning(self, "警告", "没有可执行的SQL语句（只有注释）")
            else:
                QMessageBox.warning(self, "警告", "没有可执行的SQL语句")

