"""
基于 LangGraph 的 Redis 命令生成工作线程
替代 redis_data_viewer 内嵌的 RedisAIWorker
"""
import logging
from typing import Any, List, Optional

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class RedisCommandLangGraphWorker(QThread):
    """
    信号：
      command_generated(command: str)
      error_occurred(error: str)
      status_update(message: str)
    """

    command_generated = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    status_update = pyqtSignal(str)

    def __init__(
        self,
        ai_client: Any,
        user_query: str,
        available_keys: Optional[List[str]] = None,
    ):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.available_keys = available_keys or []
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI正在生成Redis命令...")

        try:
            from src.core.langgraph.redis_command_graph import get_redis_command_graph

            initial_state = {
                "ai_client": self.ai_client,
                "user_query": self.user_query,
                "available_keys": self.available_keys,
                "generated_command": "",
                "error": None,
                "current_step": "",
                "retry_count": 0,
            }

            graph = get_redis_command_graph()
            final_state = initial_state.copy()

            for chunk in graph.stream(initial_state, stream_mode="updates"):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                for node_name, updates in chunk.items():
                    final_state.update(updates)

            if final_state.get("error"):
                self.error_occurred.emit(final_state["error"])
            elif final_state.get("generated_command"):
                self.command_generated.emit(final_state["generated_command"])
            else:
                self.error_occurred.emit("AI未能生成Redis命令，请重试")

        except Exception as e:
            logger.error(f"RedisCommandLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"AI生成Redis命令失败: {e}")
