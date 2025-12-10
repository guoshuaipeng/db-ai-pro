"""
分页查询工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class PaginationWorker(QThread):
    """分页查询工作线程"""
    
    # 信号：查询完成 (success, data, error, columns)
    query_finished = pyqtSignal(bool, object, str, object)
    
    # 信号：COUNT 查询完成 (total_rows)
    count_finished = pyqtSignal(int)
    
    def __init__(self, connection_string: str, connect_args: dict, 
                 sql: str, page: int, page_size: int, get_count: bool = False):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.sql = sql  # 原始SQL（不带LIMIT）
        self.page = page
        self.page_size = page_size
        self.get_count = get_count  # 是否同时获取总行数
        self._should_stop = False
    
    def stop(self):
        """停止线程"""
        self._should_stop = True
    
    def run(self):
        """执行分页查询"""
        engine = None
        try:
            # 创建引擎
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=True,
                pool_recycle=3600
            )
            
            # 如果需要获取总行数，先执行 COUNT 查询
            if self.get_count:
                self._execute_count(engine)
            
            if self._should_stop:
                return
            
            # 执行分页查询
            offset = (self.page - 1) * self.page_size
            sql_with_limit = f"{self.sql} LIMIT {self.page_size} OFFSET {offset}"
            
            logger.info(f"执行分页查询: {sql_with_limit}")
            
            with engine.connect() as conn:
                result = conn.execute(text(sql_with_limit))
                
                # 获取列名
                columns = list(result.keys())
                
                # 获取数据
                rows = result.fetchall()
                data = [dict(zip(columns, row)) for row in rows]
                
                # 发送成功信号
                self.query_finished.emit(True, data, "", columns)
        
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"分页查询失败: {error_msg}")
            self.query_finished.emit(False, None, error_msg, None)
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"分页查询异常: {error_msg}", exc_info=True)
            self.query_finished.emit(False, None, error_msg, None)
        
        finally:
            if engine:
                engine.dispose()
    
    def _execute_count(self, engine):
        """执行 COUNT 查询获取总行数"""
        try:
            # 从原始 SQL 中提取 FROM 子句
            import re
            
            # 移除 ORDER BY 子句（COUNT 不需要排序）
            sql_without_order = re.sub(r'\s+ORDER\s+BY\s+[^;]+', '', self.sql, flags=re.IGNORECASE)
            
            # 构造 COUNT 查询
            # 简单方式：SELECT COUNT(*) FROM (原始SQL) AS count_query
            count_sql = f"SELECT COUNT(*) as total FROM ({sql_without_order}) AS count_query"
            
            logger.info(f"执行 COUNT 查询: {count_sql}")
            
            with engine.connect() as conn:
                result = conn.execute(text(count_sql))
                row = result.fetchone()
                total_rows = row[0] if row else 0
                
                logger.info(f"总行数: {total_rows}")
                self.count_finished.emit(total_rows)
        
        except Exception as e:
            logger.error(f"COUNT 查询失败: {e}", exc_info=True)
            # COUNT 失败不影响分页查询，默认返回0
            self.count_finished.emit(0)

