"""
数据库查询工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


class QueryWorker(QThread):
    """数据库查询工作线程"""
    
    # 定义信号
    query_finished = pyqtSignal(bool, object, object, object, object)  # success, data, error, affected_rows, columns
    query_progress = pyqtSignal(str)  # 进度消息
    # 多条SQL的信号
    multi_query_finished = pyqtSignal(list)  # [(sql, success, data, error, affected_rows, columns), ...]
    
    def __init__(self, connection_string: str, connect_args: dict, sql: str, is_query: bool = True):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.sql = sql
        self.is_query = is_query
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def _split_sql_statements(self, sql: str) -> List[str]:
        """分割多条SQL语句（按分号分隔）"""
        # 简单的SQL分割（按分号分隔，忽略字符串中的分号）
        statements = []
        current_statement = ""
        in_string = False
        string_char = None
        
        for char in sql:
            if char in ("'", '"', '`') and (not current_statement or current_statement[-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            
            current_statement += char
            
            if not in_string and char == ';':
                stmt = current_statement.strip()
                if stmt:
                    statements.append(stmt)
                current_statement = ""
        
        # 添加最后一条语句（如果没有分号结尾）
        if current_statement.strip():
            statements.append(current_statement.strip())
        
        return statements if statements else [sql]
    
    def run(self):
        """执行查询（在工作线程中运行）"""
        engine = None
        try:
            # 检查是否已经被请求停止
            if self.isInterruptionRequested() or self._should_stop:
                return
            # 在线程中创建新的数据库引擎（线程安全）
            self.query_progress.emit("正在连接数据库...")
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=True,
                echo=False,
                poolclass=None  # 不使用连接池，每个线程独立连接
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 分割多条SQL
            sql_statements = self._split_sql_statements(self.sql)
            
            if len(sql_statements) > 1:
                # 多条SQL，使用multi_query_finished信号
                results = []
                for idx, sql_stmt in enumerate(sql_statements):
                    if self.isInterruptionRequested() or self._should_stop:
                        return
                    
                    self.query_progress.emit(f"正在执行查询 {idx + 1}/{len(sql_statements)}...")
                    
                    try:
                        # 对每条SQL语句单独判断是查询还是非查询
                        stmt_upper = sql_stmt.strip().upper()
                        is_stmt_query = stmt_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))
                        
                        if is_stmt_query:
                            # 执行查询
                            with engine.connect() as conn:
                                result = conn.execute(text(sql_stmt))
                                
                                # 获取列名（即使没有数据，也能获取列名）
                                columns = list(result.keys())
                                
                                # 获取数据
                                rows = []
                                for row in result:
                                    if self.isInterruptionRequested() or self._should_stop:
                                        return
                                    rows.append(dict(row._mapping))
                                
                                results.append((sql_stmt, True, rows, None, None, columns))
                        else:
                            # 执行非查询语句
                            # 如果是DELETE语句，在日志中打印
                            if stmt_upper.startswith('DELETE'):
                                logger.info("=" * 80)
                                logger.info(f"执行DELETE语句: {sql_stmt}")
                                logger.info("=" * 80)
                            
                            # 对于非查询语句，使用connect()而不是begin()，避免result对象过早关闭的问题
                            with engine.connect() as conn:
                                result = conn.execute(text(sql_stmt))
                                # 在事务提交前获取rowcount
                                affected_rows = result.rowcount
                                # 手动提交事务
                                conn.commit()
                                results.append((sql_stmt, True, None, None, affected_rows, None))
                    except Exception as e:
                        error_msg = str(e)
                        logger.error(f"执行SQL失败: {error_msg}")
                        results.append((sql_stmt, False, None, error_msg, None, None))
                
                self.query_progress.emit("所有查询完成")
                self.multi_query_finished.emit(results)
            else:
                # 单条SQL，使用原有的query_finished信号（保持兼容）
                self.query_progress.emit("正在执行查询...")
                
                if self.is_query:
                    # 执行查询
                    with engine.connect() as conn:
                        if self.isInterruptionRequested() or self._should_stop:
                            return
                        
                        result = conn.execute(text(self.sql))
                        
                        if self.isInterruptionRequested() or self._should_stop:
                            return
                        
                        # 获取列名（即使没有数据，也能获取列名）
                        columns = list(result.keys())
                        
                        # 获取数据
                        rows = []
                        for row in result:
                            if self.isInterruptionRequested() or self._should_stop:
                                return
                            rows.append(dict(row._mapping))
                        
                        self.query_progress.emit("查询完成")
                        self.query_finished.emit(True, rows, None, None, columns)
                else:
                    # 执行非查询语句（INSERT, UPDATE, DELETE等）
                    # 如果是DELETE语句，在日志中打印
                    if self.sql.strip().upper().startswith('DELETE'):
                        logger.info("=" * 80)
                        logger.info(f"执行DELETE语句: {self.sql}")
                        logger.info("=" * 80)
                    
                    # 对于非查询语句，使用connect()而不是begin()，避免result对象过早关闭的问题
                    with engine.connect() as conn:
                        if self.isInterruptionRequested() or self._should_stop:
                            return
                        
                        result = conn.execute(text(self.sql))
                        # 在事务提交前获取rowcount
                        affected_rows = result.rowcount
                        # 手动提交事务
                        conn.commit()
                        
                        self.query_progress.emit(f"执行成功，影响 {affected_rows} 行")
                        self.query_finished.emit(True, None, None, affected_rows, None)
                    
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"数据库查询错误: {error_msg}")
            self.query_progress.emit(f"查询失败: {error_msg}")
            self.query_finished.emit(False, None, error_msg, None, None)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"查询线程异常: {error_msg}")
            self.query_progress.emit(f"执行异常: {error_msg}")
            self.query_finished.emit(False, None, error_msg, None, None)
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            
            # 确保线程正确结束
            self.quit()

