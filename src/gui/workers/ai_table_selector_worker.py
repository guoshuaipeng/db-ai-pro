"""
AI选择表工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging

logger = logging.getLogger(__name__)


class AITableSelectorWorker(QThread):
    """AI选择表工作线程"""
    
    # 定义信号
    tables_selected = pyqtSignal(list)  # 选中的表名列表
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, ai_client, user_query: str, table_info_list: list, current_sql: str = None):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_info_list = table_info_list or []  # 包含表名和注释的字典列表
        self.current_sql = current_sql  # 当前SQL编辑器中的SQL
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI选择表（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AITableSelectorWorker: 开始选择表，用户查询: {self.user_query[:100]}")
            logger.info(f"AITableSelectorWorker: 可用表数量: {len(self.table_info_list)}")
            if self.current_sql:
                logger.info(f"AITableSelectorWorker: 当前SQL: {self.current_sql[:200]}")
            
            # 调用AI选择表（传递包含注释的表信息列表）
            selected_tables = self.ai_client.select_tables(self.user_query, self.table_info_list, self.current_sql)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AITableSelectorWorker: AI选择了 {len(selected_tables)} 个表: {selected_tables}")
            
            # 如果AI没有选择任何表，使用前10个表（降级处理）
            if not selected_tables:
                logger.warning("AITableSelectorWorker: AI未选择任何表，使用前10个表作为降级处理")
                # 从表信息列表中提取表名（兼容字符串和字典格式）
                fallback_tables = self._extract_table_names(self.table_info_list[:10])
                selected_tables = fallback_tables
            
            # 发送选中的表
            self.tables_selected.emit(selected_tables)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI选择表失败: {error_msg}", exc_info=True)
            
            # 发送错误信号（让UI显示错误）
            self.error_occurred.emit(f"AI选择表失败: {error_msg}")
            
            # 如果失败，使用前10个表作为降级处理
            try:
                fallback_tables = self._extract_table_names(self.table_info_list[:10]) if self.table_info_list else []
                logger.warning(f"AITableSelectorWorker: 使用降级处理，选择前10个表: {fallback_tables}")
                self.tables_selected.emit(fallback_tables)
            except Exception as fallback_error:
                logger.error(f"降级处理也失败: {str(fallback_error)}", exc_info=True)
                # 最后的降级：发送空列表
                self.tables_selected.emit([])
        finally:
            # 确保线程正确结束
            self.quit()
    
    def _extract_table_names(self, table_info_list: list) -> list:
        """从表信息列表中提取表名（兼容字符串和字典格式）
        
        Args:
            table_info_list: 表信息列表，可能是字符串列表或字典列表
            
        Returns:
            表名列表
        """
        table_names = []
        for table_info in table_info_list:
            try:
                if isinstance(table_info, dict):
                    # 如果是字典，提取 "name" 字段
                    table_names.append(table_info.get("name", str(table_info)))
                elif isinstance(table_info, str):
                    # 如果是字符串，直接使用
                    table_names.append(table_info)
                else:
                    # 其他类型，转换为字符串
                    logger.warning(f"表信息格式不正确，期望字典或字符串，实际: {type(table_info)}, 值: {table_info}")
                    table_names.append(str(table_info))
            except Exception as e:
                logger.error(f"提取表名失败: {str(e)}, table_info: {table_info}")
                continue
        return table_names

