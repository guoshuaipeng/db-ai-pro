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
    
    def __init__(self, ai_client, user_query: str, table_names: list, current_sql: str = None):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_names = table_names or []
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
            logger.info(f"AITableSelectorWorker: 可用表数量: {len(self.table_names)}")
            if self.current_sql:
                logger.info(f"AITableSelectorWorker: 当前SQL: {self.current_sql[:200]}")
            
            # 调用AI选择表（传递当前SQL）
            selected_tables = self.ai_client.select_tables(self.user_query, self.table_names, self.current_sql)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AITableSelectorWorker: AI选择了 {len(selected_tables)} 个表: {selected_tables}")
            
            # 如果AI没有选择任何表，使用所有表（降级处理）
            if not selected_tables:
                logger.warning("AITableSelectorWorker: AI未选择任何表，使用前10个表作为降级处理")
                selected_tables = self.table_names[:10]
            
            # 发送选中的表
            self.tables_selected.emit(selected_tables)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI选择表失败: {error_msg}")
            # 如果失败，使用前10个表作为降级处理
            fallback_tables = self.table_names[:10] if self.table_names else []
            logger.warning(f"AITableSelectorWorker: 使用降级处理，选择前10个表: {fallback_tables}")
            self.tables_selected.emit(fallback_tables)
        finally:
            # 确保线程正确结束
            self.quit()

