"""
基于 LangGraph Tool-calling Agent 的查询工作线程
AI 自主决定调用哪些工具（搜索表/获取结构/查枚举值），按需执行，最终生成 SQL

信号：
  sql_generated(sql: str, sql_type: str)   -- 成功
  error_occurred(error: str)               -- 失败
  status_update(message: str)              -- 进度（显示在状态栏）
"""
import logging
from typing import Any, Dict, List, Optional

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class QueryLangGraphWorker(QThread):
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
        execution_error: Optional[str] = None,
        failed_sql: Optional[str] = None,
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
        self.execution_error = execution_error or ""
        self.failed_sql = failed_sql or ""
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI Agent 正在分析查询意图...")

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
                "execution_error": self.execution_error,
                "failed_sql": self.failed_sql,
                "memory_context": "",
                "generated_sql": "",
                "sql_type": "OTHER",
                "selected_tables": [],
                "agent_iterations": 0,
                "error": None,
                "current_step": "",
            }

            graph = get_query_graph()
            final_state = initial_state.copy()

            step_msgs = {
                "recall_memory": "正在召回历史记忆...",
                "agent_sql": "AI Agent 正在推理，按需调用工具...",
                "write_memory": "正在写入记忆...",
            }

            for chunk in graph.stream(initial_state, stream_mode="updates"):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                for node_name, updates in chunk.items():
                    final_state.update(updates)
                    # 显示更详细的状态
                    if node_name == "agent_sql":
                        iters = final_state.get("agent_iterations", 0)
                        if iters > 0:
                            self.status_update.emit(
                                f"AI Agent 完成推理（调用了 {iters} 次工具），正在整理结果..."
                            )
                        else:
                            self.status_update.emit("AI Agent 正在推理中...")
                    else:
                        self.status_update.emit(step_msgs.get(node_name, f"执行 {node_name}..."))

            if final_state.get("error"):
                self.error_occurred.emit(final_state["error"])
            elif final_state.get("generated_sql"):
                iters = final_state.get("agent_iterations", 0)
                logger.info(
                    f"QueryLangGraphWorker 成功: sql_type={final_state.get('sql_type')}, "
                    f"工具调用={iters}次, 表={final_state.get('selected_tables')}"
                )
                self.sql_generated.emit(
                    final_state["generated_sql"],
                    final_state.get("sql_type", "OTHER"),
                )
            else:
                self.error_occurred.emit("AI 未能生成 SQL，请重试")

        except Exception as e:
            logger.error(f"QueryLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"AI 生成 SQL 失败: {e}")
