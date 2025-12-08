"""
AI判断是否需要查询枚举值工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging

from src.core.ai_client import AIClient

logger = logging.getLogger(__name__)


class AIEnumJudgeWorker(QThread):
    """AI判断是否需要查询枚举值工作线程"""
    
    judgment_ready = pyqtSignal(bool)  # 判断结果 True=需要查询, False=不需要查询
    error_occurred = pyqtSignal(str)  # 错误信息
    
    def __init__(self, ai_client: AIClient, user_query: str, enum_columns: dict, table_schema: str):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.enum_columns = enum_columns
        self.table_schema = table_schema
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI判断（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AIEnumJudgeWorker: 开始判断是否需要查询枚举值，用户查询: {self.user_query[:100]}")
            logger.info(f"AIEnumJudgeWorker: 枚举字段数量: {sum(len(cols) for cols in self.enum_columns.values())}")
            
            # 调用AI判断是否需要查询枚举值
            should_query = self.ai_client.should_query_enum_values(
                self.user_query,
                self.enum_columns,
                self.table_schema
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"AIEnumJudgeWorker: AI判断结果: {'需要查询' if should_query else '不需要查询'}")
            
            # 发送判断结果
            self.judgment_ready.emit(should_query)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI判断是否需要查询枚举值失败: {error_msg}")
            # 如果失败，默认返回False（不查询枚举值，避免性能问题）
            self.judgment_ready.emit(False)
        finally:
            # 确保线程正确结束
            self.quit()

