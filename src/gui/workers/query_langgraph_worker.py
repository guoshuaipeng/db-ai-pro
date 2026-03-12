"""
基于 LangGraph 的查询 AI 工作线程
替代原来的 AITableSelectorWorker + SchemaWorker + AIEnumSelectorWorker + AIWorker 多步串联
"""
import logging
from typing import Any, Dict, List, Optional

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class QueryLangGraphWorker(QThread):
    """
    一次性运行查询图，通过信号回传结果。
    信号：
      sql_generated(sql: str, sql_type: str)   -- 成功
      error_occurred(error: str)               -- 失败
      status_update(message: str)              -- 步骤进度（可选，供状态栏显示）
    """

    sql_generated = pyqtSignal(str, str)   # (sql, sql_type)
    error_occurred = pyqtSignal(str)
    status_update = pyqtSignal(str)

    def __init__(
        self,
        ai_client: Any,
        user_query: str,
        table_info_list: List[Any],
        db_type: Optional[str] = None,
        connection_string: str = "",
        connect_args: Optional[Dict] = None,
        connection_id: Optional[str] = None,
        database: Optional[str] = None,
        config_query_enum: bool = True,
    ):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_info_list = table_info_list or []
        self.db_type = db_type
        self.connection_string = connection_string
        self.connect_args = connect_args or {}
        self.connection_id = connection_id
        self.database = database
        self.config_query_enum = config_query_enum
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI正在分析查询意图...")

        try:
            from src.core.langgraph.query_graph import get_query_graph

            initial_state = {
                "user_query": self.user_query,
                "table_info_list": self.table_info_list,
                "db_type": self.db_type,
                "connection_string": self.connection_string,
                "connect_args": self.connect_args,
                "connection_id": self.connection_id,
                "database": self.database,
                "config_query_enum": self.config_query_enum,
                "ai_client": self.ai_client,
                "retry_count": 0,
                "selected_tables": [],
                "table_schema": "",
                "enum_columns": {},
                "should_query_enum": False,
                "table_schema_with_enum": "",
                "memory_context": "",
                "generated_sql": "",
                "sql_type": "OTHER",
                "error": None,
                "current_step": "",
            }

            graph = get_query_graph()

            # 逐步 stream 以便更新状态栏
            step_msgs = {
                "recall_memory": "正在召回历史记忆...",
                "select_tables": "AI正在选择相关表...",
                "fetch_schema": "正在获取表结构...",
                "select_enum_columns": "AI正在识别枚举字段...",
                "fetch_enum_values": "正在查询枚举字段值...",
                "generate_sql": "AI正在生成SQL...",
                "write_memory": "正在写入记忆...",
            }

            final_state = initial_state.copy()
            for chunk in graph.stream(initial_state, stream_mode="updates"):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                for node_name, updates in chunk.items():
                    final_state.update(updates)
                    msg = step_msgs.get(node_name, f"执行 {node_name}...")
                    self.status_update.emit(msg)
                    logger.debug(f"QueryLangGraph [{node_name}]: {updates}")

            if final_state.get("error"):
                self.error_occurred.emit(final_state["error"])
            elif final_state.get("generated_sql"):
                self.sql_generated.emit(
                    final_state["generated_sql"],
                    final_state.get("sql_type", "OTHER"),
                )
            else:
                self.error_occurred.emit("AI未能生成SQL，请重试")

        except Exception as e:
            logger.error(f"QueryLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"AI生成SQL失败: {e}")
