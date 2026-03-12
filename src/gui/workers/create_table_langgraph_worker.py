"""
基于 LangGraph 的建表 AI 工作线程
替代 CreateTableSelectReferenceWorker + SchemaWorker + CreateTableAIWorker 三步串联
每轮多轮对话调用一次，UI 负责维护 conversation_history
"""
import logging
from typing import Any, Dict, List, Optional

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class CreateTableLangGraphWorker(QThread):
    """
    信号：
      result_ready(sql: str, message: str)  -- 成功，sql=建表SQL，message=AI自然语言回复
      error_occurred(error: str)
      status_update(message: str)
    """

    result_ready = pyqtSignal(str, str)   # (sql, assistant_message)
    error_occurred = pyqtSignal(str)
    status_update = pyqtSignal(str)

    def __init__(
        self,
        ai_client: Any,
        conversation_history: List[Dict],
        database: Optional[str] = None,
        db_type: Optional[str] = None,
        connection_string: str = "",
        connect_args: Optional[Dict] = None,
        connection_id: Optional[str] = None,
        all_table_names: Optional[List[str]] = None,
        current_sql: str = "",
    ):
        super().__init__()
        self.ai_client = ai_client
        self.conversation_history = conversation_history
        self.database = database
        self.db_type = db_type
        self.connection_string = connection_string
        self.connect_args = connect_args or {}
        self.connection_id = connection_id
        self.all_table_names = all_table_names or []
        self.current_sql = current_sql
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI正在生成建表语句...")

        try:
            from src.core.langgraph.create_table_graph import get_create_table_graph

            initial_state = {
                "ai_client": self.ai_client,
                "conversation_history": self.conversation_history,
                "database": self.database,
                "db_type": self.db_type,
                "connection_string": self.connection_string,
                "connect_args": self.connect_args,
                "connection_id": self.connection_id,
                "all_table_names": self.all_table_names,
                "current_sql": self.current_sql,
                "selected_reference_tables": [],
                "reference_schema": "",
                "memory_context": "",
                "generated_sql": "",
                "assistant_message": "",
                "error": None,
                "current_step": "",
            }

            step_msgs = {
                "recall_memory": "正在召回历史记忆...",
                "select_reference_tables": "AI正在选择参考表...",
                "fetch_reference_schema": "正在获取参考表结构...",
                "generate_create_table": "AI正在生成建表语句...",
                "write_memory": "正在写入记忆...",
            }

            graph = get_create_table_graph()
            final_state = initial_state.copy()

            for chunk in graph.stream(initial_state, stream_mode="updates"):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                for node_name, updates in chunk.items():
                    final_state.update(updates)
                    self.status_update.emit(step_msgs.get(node_name, f"执行 {node_name}..."))

            if final_state.get("error"):
                self.error_occurred.emit(final_state["error"])
            elif final_state.get("generated_sql"):
                self.result_ready.emit(
                    final_state["generated_sql"],
                    final_state.get("assistant_message", ""),
                )
            else:
                self.error_occurred.emit("AI未能生成建表语句，请重试")

        except Exception as e:
            logger.error(f"CreateTableLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"AI生成建表语句失败: {e}")
