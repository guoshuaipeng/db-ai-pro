"""
复制表结构工作线程 - 生成 CREATE TABLE 语句
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional, Dict, List
import logging

logger = logging.getLogger(__name__)


class CopyTableStructureWorker(QThread):
    """复制表结构工作线程 - 生成 CREATE TABLE 语句"""
    
    # 定义信号
    create_sql_ready = pyqtSignal(str)  # CREATE TABLE 语句生成完成
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, connection_string: str, connect_args: dict, database: str, table_name: str, db_type: str):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.database = database
        self.table_name = table_name
        self.db_type = db_type.lower()
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """生成 CREATE TABLE 语句（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 创建数据库引擎
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=True,
                echo=False,
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            inspector = inspect(engine)
            
            # 对于 MySQL/MariaDB，如果指定了数据库，需要使用 schema 参数
            if self.db_type in ('mysql', 'mariadb') and self.database:
                # 获取表结构（指定 schema）
                columns = inspector.get_columns(self.table_name, schema=self.database)
                pk_constraint = inspector.get_pk_constraint(self.table_name, schema=self.database)
                indexes = inspector.get_indexes(self.table_name, schema=self.database)
                foreign_keys = inspector.get_foreign_keys(self.table_name, schema=self.database)
            else:
                # 获取表结构
                columns = inspector.get_columns(self.table_name)
                pk_constraint = inspector.get_pk_constraint(self.table_name)
                indexes = inspector.get_indexes(self.table_name)
                foreign_keys = inspector.get_foreign_keys(self.table_name)
            
            # 从主键约束中提取主键列名
            primary_keys = pk_constraint.get('constrained_columns', []) if pk_constraint else []
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 根据数据库类型生成 CREATE TABLE 语句
            create_sql = self._generate_create_table_sql(
                self.table_name,
                columns,
                primary_keys,
                indexes,
                foreign_keys
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            self.create_sql_ready.emit(create_sql)
            
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"生成 CREATE TABLE 语句失败: {error_msg}")
            self.error_occurred.emit(error_msg)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"生成 CREATE TABLE 语句异常: {error_msg}")
            self.error_occurred.emit(error_msg)
        finally:
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            self.quit()
    
    def _generate_create_table_sql(self, table_name: str, columns: List[Dict], 
                                   primary_keys: List[str], indexes: List[Dict], 
                                   foreign_keys: List[Dict]) -> str:
        """根据数据库类型生成 CREATE TABLE 语句"""
        
        # 转义标识符
        def escape_identifier(name: str) -> str:
            if self.db_type in ('mysql', 'mariadb'):
                return f"`{name}`"
            elif self.db_type == 'postgresql':
                return f'"{name}"'
            elif self.db_type == 'sqlserver':
                return f"[{name}]"
            else:
                return name
        
        # 格式化默认值
        def format_default(default, col_type: str) -> str:
            if default is None:
                return ""
            
            default_str = str(default)
            
            # 处理函数调用（如 CURRENT_TIMESTAMP）
            if default_str.upper() in ('CURRENT_TIMESTAMP', 'NOW()', 'CURRENT_DATE', 'CURRENT_TIME'):
                return f" DEFAULT {default_str}"
            
            # 处理字符串类型
            if 'CHAR' in col_type.upper() or 'TEXT' in col_type.upper() or 'VARCHAR' in col_type.upper():
                # 移除可能的引号
                if default_str.startswith("'") and default_str.endswith("'"):
                    default_str = default_str[1:-1]
                return f" DEFAULT '{default_str}'"
            
            # 处理数字类型
            if default_str.isdigit() or (default_str.replace('.', '').replace('-', '').isdigit()):
                return f" DEFAULT {default_str}"
            
            # 其他情况
            return f" DEFAULT {default_str}"
        
        # 构建列定义
        column_defs = []
        for col in columns:
            col_name = col['name']
            col_type = str(col['type'])
            nullable = col.get('nullable', True)
            default = col.get('default')
            autoincrement = col.get('autoincrement', False)
            
            # 构建列定义
            col_def = f"  {escape_identifier(col_name)} {col_type}"
            
            # 添加 NOT NULL
            if not nullable:
                col_def += " NOT NULL"
            
            # 添加 AUTO_INCREMENT / AUTOINCREMENT / SERIAL
            if autoincrement:
                if self.db_type in ('mysql', 'mariadb'):
                    col_def += " AUTO_INCREMENT"
                elif self.db_type == 'sqlite':
                    col_def += " AUTOINCREMENT"
                elif self.db_type == 'postgresql':
                    # PostgreSQL 使用 SERIAL 类型，已经在类型中
                    pass
            
            # 添加默认值
            if default is not None:
                col_def += format_default(default, col_type)
            
            column_defs.append(col_def)
        
        # 构建主键约束
        pk_constraint = ""
        if primary_keys:
            pk_cols = ', '.join([escape_identifier(pk) for pk in primary_keys])
            if self.db_type in ('mysql', 'mariadb'):
                # MySQL 可以在列定义中使用 PRIMARY KEY，也可以单独定义
                pk_constraint = f",\n  PRIMARY KEY ({pk_cols})"
            elif self.db_type == 'postgresql':
                pk_constraint = f",\n  PRIMARY KEY ({pk_cols})"
            elif self.db_type == 'sqlserver':
                pk_constraint = f",\n  PRIMARY KEY ({pk_cols})"
            elif self.db_type == 'sqlite':
                pk_constraint = f",\n  PRIMARY KEY ({pk_cols})"
        
        # 构建索引（非主键索引）
        index_constraints = []
        for idx in indexes:
            if idx['name'] and not idx.get('unique', False):
                idx_cols = ', '.join([escape_identifier(col) for col in idx['column_names']])
                if self.db_type in ('mysql', 'mariadb'):
                    index_constraints.append(f",\n  INDEX {escape_identifier(idx['name'])} ({idx_cols})")
                elif self.db_type == 'postgresql':
                    index_constraints.append(f",\n  INDEX {escape_identifier(idx['name'])} ({idx_cols})")
                elif self.db_type == 'sqlserver':
                    index_constraints.append(f",\n  INDEX {escape_identifier(idx['name'])} ({idx_cols})")
        
        # 构建外键约束
        fk_constraints = []
        for fk in foreign_keys:
            fk_name = fk.get('name', '')
            local_cols = ', '.join([escape_identifier(col) for col in fk['constrained_columns']])
            ref_table = fk['referred_table']
            ref_cols = ', '.join([escape_identifier(col) for col in fk['referred_columns']])
            
            if self.db_type in ('mysql', 'mariadb'):
                fk_constraint = f",\n  CONSTRAINT {escape_identifier(fk_name)} FOREIGN KEY ({local_cols}) REFERENCES {escape_identifier(ref_table)} ({ref_cols})"
            elif self.db_type == 'postgresql':
                fk_constraint = f",\n  CONSTRAINT {escape_identifier(fk_name)} FOREIGN KEY ({local_cols}) REFERENCES {escape_identifier(ref_table)} ({ref_cols})"
            elif self.db_type == 'sqlserver':
                fk_constraint = f",\n  CONSTRAINT {escape_identifier(fk_name)} FOREIGN KEY ({local_cols}) REFERENCES {escape_identifier(ref_table)} ({ref_cols})"
            else:
                fk_constraint = f",\n  FOREIGN KEY ({local_cols}) REFERENCES {escape_identifier(ref_table)} ({ref_cols})"
            
            fk_constraints.append(fk_constraint)
        
        # 组合所有部分
        table_name_escaped = escape_identifier(self.table_name)
        
        # 如果是 MySQL/MariaDB 且指定了数据库，使用 database.table 格式
        if self.db_type in ('mysql', 'mariadb') and self.database:
            table_name_escaped = f"{escape_identifier(self.database)}.{table_name_escaped}"
        
        create_sql = f"CREATE TABLE {table_name_escaped} (\n"
        create_sql += ',\n'.join(column_defs)
        
        if pk_constraint:
            create_sql += pk_constraint
        
        create_sql += ''.join(index_constraints)
        create_sql += ''.join(fk_constraints)
        
        create_sql += "\n);"
        
        return create_sql

