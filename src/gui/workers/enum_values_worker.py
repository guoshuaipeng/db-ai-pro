"""
获取枚举字段值工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)


class EnumValuesWorker(QThread):
    """获取枚举字段值工作线程"""
    
    # 定义信号
    enum_values_ready = pyqtSignal(str)  # 包含枚举值的表结构文本
    
    def __init__(self, connection_string: str, connect_args: dict, table_schema: str, enum_columns: dict):
        super().__init__()
        self.connection_string = connection_string
        self.connect_args = connect_args
        self.table_schema = table_schema
        self.enum_columns = enum_columns  # {table_name: [column_names]}
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """获取枚举字段值（在工作线程中运行）"""
        engine = None
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 在线程中创建新的数据库引擎
            engine = create_engine(
                self.connection_string,
                connect_args=self.connect_args,
                pool_pre_ping=True,
                echo=False,
                poolclass=None
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 解析表结构，为选中的枚举字段添加值
            lines = self.table_schema.split('\n')
            result_lines = []
            current_table = None
            
            for line in lines:
                result_lines.append(line)
                
                # 检测表名行
                if line.startswith('表: '):
                    table_part = line[3:].strip()
                    if ' [' in table_part:
                        current_table = table_part.split(' [')[0].strip()
                    elif ' - ' in table_part:
                        current_table = table_part.split(' - ')[0].strip()
                    else:
                        current_table = table_part.strip()
                
                # 检测列信息行，如果是枚举字段，添加字段值
                elif line.startswith('  • ') and current_table:
                    # 检查这个字段是否是选中的枚举字段
                    if current_table in self.enum_columns:
                        col_part = line[4:].strip()
                        if ':' in col_part:
                            col_name = col_part.split(':')[0].strip()
                            if col_name in self.enum_columns[current_table]:
                                # 查询该字段的唯一值
                                try:
                                    field_values = self._get_field_unique_values(engine, current_table, col_name)
                                    if field_values:
                                        # 添加字段值信息
                                        if len(field_values) <= 15:
                                            values_str = f" [字段值: {', '.join(map(str, field_values))}]"
                                        else:
                                            values_str = f" [字段值示例: {', '.join(map(str, field_values[:10]))}... (共{len(field_values)}个)]"
                                        # 在行末尾添加字段值（在默认值之后）
                                        if ', 默认:' in line:
                                            # 在默认值之前插入
                                            line = line.replace(', 默认:', f"{values_str}, 默认:")
                                        else:
                                            # 在行末尾添加
                                            line = line + values_str
                                        result_lines[-1] = line  # 更新最后一行
                                        logger.debug(f"为字段 {current_table}.{col_name} 添加了 {len(field_values)} 个值")
                                except Exception as e:
                                    logger.debug(f"获取字段 {current_table}.{col_name} 的值失败: {str(e)}")
            
            # 重新组合表结构
            enhanced_schema = '\n'.join(result_lines)
            
            if not (self.isInterruptionRequested() or self._should_stop):
                self.enum_values_ready.emit(enhanced_schema)
                
        except SQLAlchemyError as e:
            error_msg = str(e)
            logger.error(f"获取枚举字段值失败: {error_msg}")
            # 如果失败，返回原始表结构
            self.enum_values_ready.emit(self.table_schema)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"获取枚举字段值异常: {error_msg}")
            self.enum_values_ready.emit(self.table_schema)
        finally:
            # 清理引擎
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.debug(f"清理引擎时出错: {str(e)}")
            
            # 确保线程正确结束
            self.quit()
    
    def _get_field_unique_values(self, engine, table_name: str, column_name: str, max_values: int = 20) -> list:
        """获取字段的唯一值"""
        try:
            url_str = str(engine.url)
            
            with engine.connect() as conn:
                # 验证表名和列名
                if not (table_name.replace('_', '').replace('.', '').isalnum() and 
                        column_name.replace('_', '').replace('.', '').isalnum()):
                    logger.warning(f"表名或列名包含非法字符，跳过查询: {table_name}.{column_name}")
                    return []
                
                # 根据数据库类型使用不同的引号
                if 'mysql' in url_str or 'mariadb' in url_str:
                    query = text(f"""
                        SELECT DISTINCT `{column_name}` 
                        FROM `{table_name}` 
                        WHERE `{column_name}` IS NOT NULL
                        LIMIT :max_values
                    """)
                elif 'postgresql' in url_str:
                    query = text(f"""
                        SELECT DISTINCT "{column_name}" 
                        FROM "{table_name}" 
                        WHERE "{column_name}" IS NOT NULL
                        LIMIT :max_values
                    """)
                else:
                    query = text(f"""
                        SELECT DISTINCT [{column_name}] 
                        FROM [{table_name}] 
                        WHERE [{column_name}] IS NOT NULL
                        LIMIT :max_values
                    """)
                
                result = conn.execute(query, {"max_values": max_values})
                
                values = []
                for row in result:
                    if row[0] is not None:
                        val = str(row[0])
                        if val:
                            values.append(val)
                
                return values
                
        except Exception as e:
            logger.debug(f"获取列 {table_name}.{column_name} 的唯一值失败: {str(e)}")
            return []

