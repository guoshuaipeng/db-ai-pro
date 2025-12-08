"""
AI选择枚举字段并判断是否需要查询工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging

logger = logging.getLogger(__name__)


class AIEnumSelectorWorker(QThread):
    """AI选择枚举字段并判断是否需要查询工作线程"""
    
    # 定义信号
    enum_selection_ready = pyqtSignal(dict, bool)  # 选中的枚举字段和是否需要查询 (enum_columns, should_query)
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, ai_client, user_query: str, table_schema: str):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_schema = table_schema
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI选择枚举字段并判断是否需要查询（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AIEnumSelectorWorker: 开始选择枚举字段并判断是否需要查询，用户查询: {self.user_query[:100]}")
            logger.info(f"AIEnumSelectorWorker: 表结构长度: {len(self.table_schema)}")
            
            # 调用AI选择枚举字段并判断是否需要查询（合并为一次调用）
            enum_columns, should_query = self.ai_client.select_enum_columns(self.user_query, self.table_schema)
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AIEnumSelectorWorker: AI选择了枚举字段: {enum_columns}")
            logger.info(f"AIEnumSelectorWorker: 是否需要查询枚举值: {should_query}")
            
            # 发送选中的枚举字段和判断结果
            self.enum_selection_ready.emit(enum_columns, should_query)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI选择枚举字段并判断失败: {error_msg}")
            # 如果失败，返回空字典和False（不查询枚举值，避免性能问题）
            self.enum_selection_ready.emit({}, False)
        finally:
            # 确保线程正确结束
            self.quit()

