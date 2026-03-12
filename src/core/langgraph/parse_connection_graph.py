"""
连接配置解析 LangGraph 状态图
流程：parse_config（→ 可选重试）
将同步 AI 调用改为异步 Worker，避免阻塞 UI
"""
import json
import logging
import re
from typing import Any, Dict, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


class ParseConnectionGraphState(TypedDict, total=False):
    ai_client: Any
    config_text: str

    parsed_config: Dict        # 解析后的连接参数字典
    error: Optional[str]
    current_step: str
    retry_count: int


def node_parse_config(state: ParseConnectionGraphState) -> dict:
    try:
        ai_client = state["ai_client"]
        result = ai_client.parse_connection_config(state["config_text"])
        if not isinstance(result, dict):
            return {"error": "AI返回格式不正确", "current_step": "parse_config"}
        logger.info(f"parse_connection_config: keys={list(result.keys())}")
        return {"parsed_config": result, "error": None, "current_step": "parse_config"}
    except Exception as e:
        logger.error(f"parse_connection_config 异常: {e}")
        return {"error": f"解析连接配置失败: {e}", "current_step": "parse_config"}


def _route_after_parse(state: ParseConnectionGraphState) -> str:
    if state.get("error"):
        if state.get("retry_count", 0) < 1:
            return "parse_config"
        return END
    return END


def build_parse_connection_graph() -> StateGraph:
    g = StateGraph(ParseConnectionGraphState)
    g.add_node("parse_config", node_parse_config)
    g.add_edge(START, "parse_config")
    g.add_conditional_edges("parse_config", _route_after_parse,
                            {"parse_config": "parse_config", END: END})
    return g


_compiled_graph = None


def get_parse_connection_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_parse_connection_graph().compile()
    return _compiled_graph
