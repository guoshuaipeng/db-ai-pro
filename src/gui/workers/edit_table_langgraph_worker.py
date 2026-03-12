"""
基于 LangGraph 的改表 AI 工作线程
替代原 EditTableAIWorker
多轮交互：每轮 UI 传入新的 conversation_history，Worker 执行一次图
"""
import logging
from typing import Any, Dict, List, Optional

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class EditTableLangGraphWorker(QThread):
    """
    信号：
      result_ready(sql: str, message: str)  -- 成功
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
        table_name: Optional[str] = None,
        current_table_schema: str = "",
        current_sql: str = "",
        connection_id: Optional[str] = None,
        connection_string: str = "",
        connect_args: Optional[Dict] = None,
    ):
        super().__init__()
        self.ai_client = ai_client
        self.conversation_history = conversation_history
        self.database = database
        self.db_type = db_type
        self.table_name = table_name
        self.current_table_schema = current_table_schema
        self.current_sql = current_sql
        self.connection_id = connection_id
        self.connection_string = connection_string
        self.connect_args = connect_args or {}
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI正在生成改表语句...")

        try:
            from src.core.langgraph.edit_table_graph import get_edit_table_graph

            initial_state = {
                "ai_client": self.ai_client,
                "conversation_history": self.conversation_history,
                "database": self.database,
                "db_type": self.db_type,
                "table_name": self.table_name,
                "current_table_schema": self.current_table_schema,
                "current_sql": self.current_sql,
                "connection_id": self.connection_id,
                "connection_string": self.connection_string,
                "connect_args": self.connect_args,
                "memory_context": "",
                "generated_sql": "",
                "assistant_message": "",
                "agent_iterations": 0,
                "error": None,
                "current_step": "",
            }

            step_msgs = {
                "recall_memory": "正在召回历史记忆...",
                "agent_alter_table": "AI Agent 正在分析并生成改表语句...",
                "write_memory": "正在写入记忆...",
            }

            graph = get_edit_table_graph()
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
                self.error_occurred.emit("AI未能生成改表语句，请重试")

        except Exception as e:
            logger.error(f"EditTableLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"AI生成改表语句失败: {e}")
