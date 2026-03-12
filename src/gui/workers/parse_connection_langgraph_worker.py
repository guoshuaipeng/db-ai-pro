"""
基于 LangGraph 的连接配置解析工作线程
将原来同步阻塞 UI 的 ai_client.parse_connection_config() 改为异步 Worker
"""
import logging
from typing import Any, Dict

from PyQt6.QtCore import QThread, pyqtSignal

logger = logging.getLogger(__name__)


class ParseConnectionLangGraphWorker(QThread):
    """
    信号：
      config_parsed(config: dict)
      error_occurred(error: str)
      status_update(message: str)
    """

    config_parsed = pyqtSignal(dict)
    error_occurred = pyqtSignal(str)
    status_update = pyqtSignal(str)

    def __init__(self, ai_client: Any, config_text: str):
        super().__init__()
        self.ai_client = ai_client
        self.config_text = config_text
        self._should_stop = False

    def stop(self):
        self._should_stop = True
        self.requestInterruption()

    def run(self):
        if self.isInterruptionRequested() or self._should_stop:
            return

        self.status_update.emit("AI正在解析连接配置...")

        try:
            from src.core.langgraph.parse_connection_graph import get_parse_connection_graph

            initial_state = {
                "ai_client": self.ai_client,
                "config_text": self.config_text,
                "parsed_config": {},
                "error": None,
                "current_step": "",
                "retry_count": 0,
            }

            graph = get_parse_connection_graph()
            final_state = initial_state.copy()

            for chunk in graph.stream(initial_state, stream_mode="updates"):
                if self.isInterruptionRequested() or self._should_stop:
                    return
                for node_name, updates in chunk.items():
                    final_state.update(updates)

            if final_state.get("error"):
                self.error_occurred.emit(final_state["error"])
            elif final_state.get("parsed_config"):
                self.config_parsed.emit(final_state["parsed_config"])
            else:
                self.error_occurred.emit("AI未能解析连接配置，请重试")

        except Exception as e:
            logger.error(f"ParseConnectionLangGraphWorker 异常: {e}", exc_info=True)
            self.error_occurred.emit(f"解析连接配置失败: {e}")
