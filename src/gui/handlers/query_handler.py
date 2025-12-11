"""
查询执行处理器
"""
from PyQt6.QtWidgets import QMessageBox
from PyQt6.QtCore import QTimer
from typing import Optional, TYPE_CHECKING
import logging

from src.core.database_connection import DatabaseType
from src.gui.workers.query_worker import QueryWorker

if TYPE_CHECKING:
    from src.gui.main_window import MainWindow

logger = logging.getLogger(__name__)


class QueryHandler:
    """查询执行处理器"""
    
    def __init__(self, main_window: 'MainWindow'):
        self.main_window = main_window
    
    def execute_query(self, sql: str = None):
        """执行SQL查询（使用后台线程，避免阻塞UI）"""
        if not self.main_window.current_connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        if not sql:
            sql = self.main_window.sql_editor.get_sql()
        
        if not sql:
            QMessageBox.warning(self.main_window, "警告", "请输入SQL语句")
            return
        
        # 保存原始SQL（用于显示，不含自动添加的LIMIT）
        original_sql = sql
        
        # 如果已有查询正在执行，先安全停止
        if self.main_window.query_worker:
            if self.main_window.query_worker.isRunning():
                self.main_window.query_worker.stop()
                if not self.main_window.query_worker.wait(3000):  # 等待最多3秒
                    # 如果还在运行，强制终止（不推荐，但作为最后手段）
                    logger.warning("查询线程未能在3秒内结束，强制终止")
                    self.main_window.query_worker.terminate()
                    self.main_window.query_worker.wait(1000)
                # 断开信号连接，避免在删除时触发
                try:
                    self.main_window.query_worker.query_finished.disconnect()
                    self.main_window.query_worker.query_progress.disconnect()
                except:
                    pass
            # 确保线程对象被正确清理
            self.main_window.query_worker.deleteLater()
            self.main_window.query_worker = None
        
        # 判断SQL类型
        sql_upper = sql.strip().upper()
        is_query = sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))
        
        # 自动添加 LIMIT（如果是 SELECT 查询且没有 LIMIT）
        sql_for_execution = sql
        auto_limit_added = False
        if is_query and sql_upper.startswith("SELECT"):
            # 检查是否已经有 LIMIT 子句
            import re
            # 匹配 LIMIT 关键字（忽略大小写，且不在字符串中）
            if not re.search(r'\bLIMIT\b', sql, re.IGNORECASE):
                # 默认添加 LIMIT 100
                sql_for_execution = sql.strip()
                if not sql_for_execution.endswith(';'):
                    sql_for_execution += ' LIMIT 100'
                else:
                    sql_for_execution = sql_for_execution[:-1].strip() + ' LIMIT 100;'
                auto_limit_added = True
                logger.info(f"自动添加 LIMIT: {sql_for_execution}")
        
        # 获取连接信息
        connection = self.main_window.db_manager.get_connection(self.main_window.current_connection_id)
        if not connection:
            QMessageBox.warning(self.main_window, "警告", "连接不存在")
            return
        
        # 确保使用当前选中的数据库（如果当前数据库与连接配置中的不同，先切换）
        if self.main_window.current_database and self.main_window.current_database != connection.database:
            try:
                self.main_window.db_manager.switch_database(self.main_window.current_connection_id, self.main_window.current_database)
                # 重新获取连接（因为 switch_database 可能更新了连接配置）
                connection = self.main_window.db_manager.get_connection(self.main_window.current_connection_id)
                if not connection:
                    QMessageBox.warning(self.main_window, "警告", "连接不存在")
                    return
            except Exception as e:
                logger.error(f"切换数据库失败: {e}")
                QMessageBox.warning(self.main_window, "警告", f"切换数据库失败: {e}")
                return
        
        # 显示加载状态
        self.main_window.sql_editor.set_status("执行中...")
        # 注意：不清空结果，因为可能有多条SQL，每条SQL会创建一个新的Tab
        
        # 显示加载动画
        self.main_window.result_table.show_loading()
        
        # 创建并启动工作线程（传递连接信息，在线程中创建引擎）
        self.main_window.query_worker = QueryWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            sql_for_execution,  # 使用添加了LIMIT的SQL执行
            is_query=is_query
        )
        
        # 保存原始SQL和是否自动添加了LIMIT的标志（用于回调中显示）
        self.main_window.query_worker._original_sql = original_sql
        self.main_window.query_worker._auto_limit_added = auto_limit_added
        
        # 连接信号
        self.main_window.query_worker.query_finished.connect(self.on_query_finished)
        self.main_window.query_worker.query_progress.connect(self.on_query_progress)
        self.main_window.query_worker.multi_query_finished.connect(self.on_multi_query_finished)
        
        # 启动线程
        self.main_window.query_worker.start()
    
    def on_query_progress(self, message: str):
        """查询进度更新"""
        self.main_window.sql_editor.set_status(message)
    
    def on_query_finished(self, success: bool, data, error, affected_rows, columns=None):
        """查询完成回调（单条SQL）"""
        # 确保在主线程中更新UI
        try:
            # 获取SQL（优先使用原始SQL，用于显示）
            if self.main_window.query_worker and hasattr(self.main_window.query_worker, '_original_sql'):
                sql = self.main_window.query_worker._original_sql
            elif self.main_window.query_worker:
                sql = self.main_window.query_worker.sql
            else:
                sql = "查询结果"
            
            # 获取 auto_limit_added 标志
            auto_limit_added = getattr(self.main_window.query_worker, '_auto_limit_added', False) if self.main_window.query_worker else False
            
            if success:
                if data is not None:
                    # 查询结果
                    self.main_window.result_table.add_result(
                        sql, data, None, None, columns, 
                        connection_id=self.main_window.current_connection_id,
                        auto_limit_added=auto_limit_added
                    )
                    if data:
                        self.main_window.sql_editor.set_status(f"查询完成: {len(data)} 行")
                    else:
                        self.main_window.sql_editor.set_status(f"查询完成: 0 行")
                elif affected_rows is not None:
                    # 非查询语句
                    self.main_window.result_table.add_result(
                        sql, None, None, affected_rows, None, 
                        connection_id=self.main_window.current_connection_id,
                        auto_limit_added=False
                    )
                    self.main_window.sql_editor.set_status(f"执行成功: 影响 {affected_rows} 行")
                    
                    # 如果是 ALTER TABLE 语句，自动刷新编辑表tab的表结构
                    if sql and sql.strip().upper().startswith('ALTER TABLE'):
                        self.main_window.table_structure_handler._refresh_edit_table_tabs(sql)
            else:
                # 错误
                self.main_window.result_table.add_result(
                    sql, None, error, None, None, 
                    connection_id=self.main_window.current_connection_id,
                    auto_limit_added=False
                )
                self.main_window.sql_editor.set_status(f"执行失败: {error}", is_error=True)
            
            # 恢复执行按钮状态
            if hasattr(self.main_window.sql_editor, 'execute_btn'):
                self.main_window.sql_editor.execute_btn.setText("执行 (F5)")
        except Exception as e:
            logger.error(f"更新UI失败: {str(e)}")
        
        # 清理工作线程
        # 注意：不要在这里立即删除，让线程自然结束
        # 线程会在 run() 方法结束后自动结束
        if self.main_window.query_worker and not self.main_window.query_worker.isRunning():
            # 只有在线程已经结束时才清理
            worker = self.main_window.query_worker
            self.main_window.query_worker = None
            # 断开信号连接
            try:
                worker.query_finished.disconnect()
                worker.query_progress.disconnect()
                worker.multi_query_finished.disconnect()
            except:
                pass
            # 延迟删除，确保所有信号处理完成
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
                    self.main_window.result_table.add_result(sql, data, error, affected_rows, columns, connection_id=self.main_window.current_connection_id)
                    # 检查是否有 ALTER TABLE 语句
                    if sql and sql.strip().upper().startswith('ALTER TABLE'):
                        has_alter_table = True
                else:
                    total_failed += 1
                    self.main_window.result_table.add_result(sql, None, error, None, None, connection_id=self.main_window.current_connection_id)
            
            # 如果有 ALTER TABLE 语句，自动刷新编辑表tab的表结构
            if has_alter_table:
                self.main_window.table_structure_handler._refresh_edit_table_tabs("")
            
            # 更新状态
            if total_failed == 0:
                self.main_window.sql_editor.set_status(f"所有查询完成: {total_success} 条成功")
            else:
                self.main_window.sql_editor.set_status(f"查询完成: {total_success} 条成功, {total_failed} 条失败", is_error=total_failed > 0)
            
            # 恢复执行按钮状态
            if hasattr(self.main_window.sql_editor, 'execute_btn'):
                self.main_window.sql_editor.execute_btn.setText("执行 (F5)")
        except Exception as e:
            logger.error(f"更新UI失败: {str(e)}")
        
        # 清理工作线程
        if self.main_window.query_worker and not self.main_window.query_worker.isRunning():
            worker = self.main_window.query_worker
            self.main_window.query_worker = None
            # 断开信号连接
            try:
                worker.query_finished.disconnect()
                worker.query_progress.disconnect()
                worker.multi_query_finished.disconnect()
            except:
                pass
            # 延迟删除，确保所有信号处理完成
            QTimer.singleShot(200, worker.deleteLater)
    
    def query_table_data(self, connection_id: str, table_name: str, database: Optional[str] = None):
        """查询表数据（在点击事件中调用，确保不阻塞UI）"""
        if not connection_id:
            QMessageBox.warning(self.main_window, "警告", "请先选择一个数据库连接")
            return
        
        # 使用QTimer延迟执行，确保点击事件处理函数快速返回，不阻塞UI
        # 防抖：如果之前的定时器还在，先停止它
        if self.main_window._query_table_timer:
            self.main_window._query_table_timer.stop()
            self.main_window._query_table_timer = None
        
        def execute_query_async():
            try:
                # 在切换数据库前，先停止所有可能正在运行的 worker
                # 停止查询 worker
                if self.main_window.query_worker and self.main_window.query_worker.isRunning():
                    self.main_window.query_worker.stop()
                    if not self.main_window.query_worker.wait(1000):
                        self.main_window.query_worker.terminate()
                        self.main_window.query_worker.wait(500)
                    try:
                        self.main_window.query_worker.query_finished.disconnect()
                        self.main_window.query_worker.query_progress.disconnect()
                        self.main_window.query_worker.multi_query_finished.disconnect()
                    except:
                        pass
                    self.main_window.query_worker.deleteLater()
                    self.main_window.query_worker = None
                
                # 停止连接初始化 worker（如果正在运行）
                if self.main_window.connection_init_worker and self.main_window.connection_init_worker.isRunning():
                    self.main_window.connection_init_worker.stop()
                    if not self.main_window.connection_init_worker.wait(1000):
                        self.main_window.connection_init_worker.terminate()
                        self.main_window.connection_init_worker.wait(500)
                    try:
                        self.main_window.connection_init_worker.init_finished.disconnect()
                    except:
                        pass
                    self.main_window.connection_init_worker.deleteLater()
                    self.main_window.connection_init_worker = None
                
                # 停止 completion worker（如果正在运行）
                if self.main_window.completion_worker and self.main_window.completion_worker.isRunning():
                    self.main_window.completion_worker.stop()
                    if not self.main_window.completion_worker.wait(1000):
                        self.main_window.completion_worker.terminate()
                        self.main_window.completion_worker.wait(500)
                    try:
                        self.main_window.completion_worker.completion_ready.disconnect()
                    except:
                        pass
                    self.main_window.completion_worker.deleteLater()
                    self.main_window.completion_worker = None
                
                # 双击表项时，始终切换到第一个查询tab
                current_index = self.main_window.right_tab_widget.currentIndex()
                if current_index != 0:  # 不是第一个查询tab
                    # 切换到第一个查询tab
                    self.main_window.right_tab_widget.setCurrentIndex(0)
                
                # 如果指定了数据库，先切换该连接当前使用的数据库
                if database:
                    try:
                        self.main_window.db_manager.switch_database(connection_id, database)
                    except Exception as e:
                        logger.error(f"切换数据库失败: {e}")
                        QMessageBox.warning(self.main_window, "警告", f"切换数据库失败: {e}")
                        return
                
                # 设置当前连接（不立即更新完成，避免阻塞），并传递当前数据库
                self.main_window.set_current_connection(connection_id, update_completion=False, database=database)
                
                # 根据数据库类型生成查询SQL（不添加LIMIT，由分页系统自动处理）
                connection = self.main_window.db_manager.get_connection(connection_id)
                
                # 根据数据库类型选择引用符号
                def quote_identifier(name: str, db_type: DatabaseType) -> str:
                    if db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                        return f'`{name}`'
                    elif db_type in (DatabaseType.POSTGRESQL, DatabaseType.SQLITE):
                        return f'"{name}"'
                    elif db_type == DatabaseType.SQLSERVER:
                        return f'[{name}]'
                    else:
                        return name
                
                if database and connection and connection.db_type in (DatabaseType.MYSQL, DatabaseType.MARIADB):
                    # MySQL/MariaDB 支持跨库访问，使用 database.table 格式
                    db_quoted = quote_identifier(database, connection.db_type)
                    table_quoted = quote_identifier(table_name, connection.db_type)
                    sql = f"SELECT * FROM {db_quoted}.{table_quoted}"
                else:
                    # 其他数据库类型（如 PostgreSQL、SQLite）切换数据库后，直接使用表名
                    table_quoted = quote_identifier(table_name, connection.db_type) if connection else f'"{table_name}"'
                    sql = f"SELECT * FROM {table_quoted}"
                
                # 在SQL编辑器中显示
                self.main_window.sql_editor.set_sql(sql)
                
                # 自动执行查询（execute_query已经在后台线程中执行）
                self.execute_query(sql)
                
                # 更新状态
                self.main_window.statusBar().showMessage(f"查询表: {table_name}")
            except Exception as e:
                logger.error(f"查询表数据失败: {e}")
                QMessageBox.warning(self.main_window, "错误", f"查询表数据失败: {str(e)}")
            finally:
                # 清理定时器引用
                self.main_window._query_table_timer = None
        
        # 使用防抖：延迟100ms执行，如果在这100ms内又有新的点击，会取消之前的定时器
        self.main_window._query_table_timer = QTimer()
        self.main_window._query_table_timer.setSingleShot(True)
        self.main_window._query_table_timer.timeout.connect(execute_query_async)
        self.main_window._query_table_timer.start(100)  # 100ms 防抖
    
    def clear_query(self):
        """清空查询"""
        self.main_window.sql_editor.clear_sql()
        self.main_window.result_table.clear_all()  # 使用clear_all方法
    
    def update_sql_completion(self, connection_id: str):
        """更新SQL编辑器的自动完成（在后台线程中执行，避免阻塞UI）"""
        # 如果连接ID不匹配，说明连接已切换，不需要更新
        if connection_id != self.main_window.current_connection_id:
            return
        
        # 使用工作线程来获取表列表和列名，避免阻塞UI
        from src.gui.workers.completion_worker import CompletionWorker
        
        # 如果已有完成更新线程在运行，先停止
        if hasattr(self.main_window, 'completion_worker') and self.main_window.completion_worker:
            try:
                if self.main_window.completion_worker.isRunning():
                    self.main_window.completion_worker.stop()
                    if not self.main_window.completion_worker.wait(2000):
                        # 如果等待超时，强制终止
                        self.main_window.completion_worker.terminate()
                        self.main_window.completion_worker.wait(1000)
                # 断开信号连接
                try:
                    self.main_window.completion_worker.completion_ready.disconnect()
                except:
                    pass
                self.main_window.completion_worker.deleteLater()
            except RuntimeError:
                # 对象已被删除，忽略
                pass
            self.main_window.completion_worker = None
        
        connection = self.main_window.db_manager.get_connection(connection_id)
        if not connection:
            return
        
        # 创建并启动完成更新线程
        self.main_window.completion_worker = CompletionWorker(
            connection.get_connection_string(),
            connection.get_connect_args(),
            connection_id
        )
        
        # 连接信号
        self.main_window.completion_worker.completion_ready.connect(self.on_completion_ready)
        
        # 启动线程
        self.main_window.completion_worker.start()
    
    def on_completion_ready(self, connection_id: str, tables: list, columns: list):
        """完成更新回调"""
        # 检查连接ID是否仍然匹配
        if connection_id == self.main_window.current_connection_id:
            # 更新SQL编辑器的自动完成
            self.main_window.sql_editor.update_completion_words(tables, columns)

