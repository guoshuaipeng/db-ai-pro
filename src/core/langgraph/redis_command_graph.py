"""
Redis 命令生成 LangGraph 状态图
流程：generate_redis_command（→ 可选重试）
"""
import logging
import re
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


class RedisCommandGraphState(TypedDict, total=False):
    ai_client: Any
    user_query: str
    available_keys: List[str]

    generated_command: str
    error: Optional[str]
    current_step: str
    retry_count: int


def node_generate_command(state: RedisCommandGraphState) -> dict:
    try:
        ai_client = state["ai_client"]
        command = ai_client.generate_redis_command(
            state["user_query"],
            state.get("available_keys") or [],
        )
        # 清理 markdown 围栏
        command = _strip_fence(command)
        logger.info(f"generate_redis_command: {command[:100]}")
        return {"generated_command": command, "error": None, "current_step": "generate_command"}
    except Exception as e:
        logger.error(f"generate_redis_command 异常: {e}")
        return {"error": f"AI生成Redis命令失败: {e}", "current_step": "generate_command"}


def _strip_fence(text: str) -> str:
    text = text.strip()
    for prefix in ["```redis", "```bash", "```shell", "```"]:
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _route_after_generate(state: RedisCommandGraphState) -> str:
    if state.get("error"):
        if state.get("retry_count", 0) < 1:
            return "generate_command"
        return END
    return END


def build_redis_command_graph() -> StateGraph:
    g = StateGraph(RedisCommandGraphState)
    g.add_node("generate_command", node_generate_command)
    g.add_edge(START, "generate_command")
    g.add_conditional_edges("generate_command", _route_after_generate,
                            {"generate_command": "generate_command", END: END})
    return g


_compiled_graph = None


def get_redis_command_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_redis_command_graph().compile()
    return _compiled_graph
