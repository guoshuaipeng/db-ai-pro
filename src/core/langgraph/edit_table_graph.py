"""
改表场景 LangGraph 状态图 —— Tool-calling Agent 版本
流程：recall_memory → agent_alter_table → write_memory
多轮交互：每轮由 UI 传入新的 conversation_history，图每次独立 invoke

agent_alter_table：
- AI 自主决定是否需要重新查询最新表结构（refresh_table_schema）
- 生成 ALTER TABLE + 自然语言回复
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)

DB_TYPE_MAP = {
    "mysql": "MySQL", "mariadb": "MariaDB", "postgresql": "PostgreSQL",
    "oracle": "Oracle", "sqlserver": "SQL Server", "sqlite": "SQLite",
}

MAX_AGENT_ITERATIONS = 4


# ──────────────────────────────────────────────
# State
# ──────────────────────────────────────────────
class EditTableGraphState(TypedDict, total=False):
    ai_client: Any
    conversation_history: List[Dict]
    database: Optional[str]
    db_type: Optional[str]
    table_name: Optional[str]
    current_table_schema: str
    current_sql: str
    connection_id: Optional[str]
    connection_string: str
    connect_args: Dict

    memory_context: str
    generated_sql: str
    assistant_message: str
    agent_iterations: int
    error: Optional[str]
    current_step: str


# ──────────────────────────────────────────────
# 节点
# ──────────────────────────────────────────────
def node_recall_memory(state: EditTableGraphState) -> dict:
    try:
        from src.core.memory_store import MemoryStore
        store = MemoryStore(connection_id=state.get("connection_id", ""), database=state.get("database", ""))
        ctx = store.build_memory_context()
        return {"memory_context": ctx, "current_step": "recall_memory"}
    except Exception as e:
        logger.warning(f"recall_memory 失败: {e}")
        return {"memory_context": "", "current_step": "recall_memory"}


def node_agent_alter_table(state: EditTableGraphState) -> dict:
    """
    Tool-calling Agent：AI 自主决定是否刷新表结构，然后生成 ALTER TABLE
    """
    ai_client = state["ai_client"]
    db_type = state.get("db_type", "")
    db_name = DB_TYPE_MAP.get((db_type or "").lower(), db_type or "")
    memory_context = state.get("memory_context", "")
    table_name = state.get("table_name") or "未指定"
    current_schema = state.get("current_table_schema", "")
    connection_string = state.get("connection_string", "")

    db_type_hint = f"\n【数据库类型】{db_name}，请严格使用 {db_name} 的 ALTER TABLE 语法。" if db_name else ""
    memory_hint = f"\n\n【历史命名规范（请遵循）】\n{memory_context}" if memory_context else ""

    current_schema_section = f"\n\n【当前表结构】\n{current_schema}" if current_schema.strip() else ""

    history = state.get("conversation_history", [])
    conv_text = "\n".join(
        f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
        for m in history[-12:]
    )

    current_sql = state.get("current_sql", "")
    current_sql_section = f"\n\n【当前 ALTER 语句（在此基础上修改）】\n{current_sql}" if current_sql.strip() else ""

    system_prompt = f"""你是一个智能改表助手，根据用户需求生成 ALTER TABLE 语句。{db_type_hint}{memory_hint}

{current_schema_section}

【工具使用原则】
- 如果当前表结构已提供 → 通常无需调用工具，直接生成 ALTER TABLE
- 如果用户提到了你不确定的字段或约束 → 调用 refresh_table_schema 获取最新结构再生成
- 最少调用原则

【输出格式】
以 JSON 返回（不含任何额外文字）：
{{
  "sql": "<完整的 ALTER TABLE SQL>",
  "message": "<自然语言回复，说明做了哪些修改，或询问用户还需要什么>"
}}"""

    user_prompt = (
        f"【对话历史】\n{conv_text}\n"
        f"\n【要修改的表】{table_name}"
        + (f"\n数据库: {state.get('database') or '未指定'}" if state.get("database") else "")
        + (f"\n数据库类型: {db_name}" if db_name else "")
        + current_sql_section
        + "\n\n请根据对话历史生成 ALTER TABLE 语句，以 JSON 返回。"
    )

    # 工具：刷新表结构
    tools = []
    if connection_string and table_name and table_name != "未指定":
        tools.append({
            "type": "function",
            "function": {
                "name": "refresh_table_schema",
                "description": f"重新获取 {table_name} 表的最新结构（当你不确定当前结构是否完整时使用）",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table_name": {
                            "type": "string",
                            "description": "要刷新结构的表名"
                        }
                    },
                    "required": ["table_name"]
                }
            }
        })

    messages: List[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    iterations = 0
    try:
        client = ai_client._get_client()
        call_kwargs = {"model": ai_client.default_model, "messages": messages, "temperature": 0.1}
        if tools:
            call_kwargs["tools"] = tools
            call_kwargs["tool_choice"] = "auto"

        for iteration in range(MAX_AGENT_ITERATIONS):
            iterations = iteration + 1
            response = client.chat.completions.create(**call_kwargs)
            ai_client._record_token_usage(response)
            choice = response.choices[0]
            msg = choice.message

            if choice.finish_reason == "tool_calls" and msg.tool_calls:
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in msg.tool_calls
                    ]
                })
                for tc in msg.tool_calls:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    if tc.function.name == "refresh_table_schema":
                        result = _exec_refresh_schema(args, state)
                    else:
                        result = f"未知工具: {tc.function.name}"
                    logger.info(f"agent_alter_table 工具 {tc.function.name}: {result[:100]}")
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

            elif choice.finish_reason in ("stop", "length", None):
                raw = (msg.content or "").strip()
                sql, message = _parse_json_response(raw)
                return {
                    "generated_sql": sql,
                    "assistant_message": message,
                    "agent_iterations": iterations,
                    "error": None,
                    "current_step": "agent_alter_table",
                }
            else:
                break

        return {"error": "AI 未能完成改表语句生成", "current_step": "agent_alter_table"}
    except Exception as e:
        logger.error(f"agent_alter_table 异常: {e}", exc_info=True)
        return {"error": f"AI生成改表语句失败: {e}", "current_step": "agent_alter_table"}


def node_write_memory(state: EditTableGraphState) -> dict:
    try:
        if state.get("error") or not state.get("generated_sql"):
            return {"current_step": "write_memory"}
        from src.core.memory_store import MemoryStore
        store = MemoryStore(connection_id=state.get("connection_id", ""), database=state.get("database", ""))
        store.write_query_pattern(
            user_intent="改表",
            generated_sql=state.get("generated_sql", ""),
            used_tables=[state.get("table_name", "")] if state.get("table_name") else [],
        )
    except Exception as e:
        logger.warning(f"write_memory 失败: {e}")
    return {"current_step": "write_memory"}


# ──────────────────────────────────────────────
# 工具实现
# ──────────────────────────────────────────────
def _exec_refresh_schema(args: dict, state: EditTableGraphState) -> str:
    table_name = args.get("table_name", state.get("table_name", ""))
    if not table_name:
        return "请提供表名"
    try:
        from src.core.langgraph.schema_service import fetch_schema_sync
        schema_text, _ = fetch_schema_sync(
            connection_string=state.get("connection_string", ""),
            connect_args=state.get("connect_args", {}),
            selected_tables=[table_name],
            connection_id=state.get("connection_id"),
            database=state.get("database"),
            force_refresh=True,
        )
        return schema_text if schema_text.strip() else f"未找到表 {table_name} 的结构"
    except Exception as e:
        return f"获取表结构失败: {e}"


# ──────────────────────────────────────────────
# 辅助
# ──────────────────────────────────────────────
def _parse_json_response(raw: str):
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        data = json.loads(text)
        sql = data.get("sql", "").strip()
        message = data.get("message", "").strip()
        return sql, message
    except Exception:
        sql = _strip_fence(raw)
        return sql, ""


def _strip_fence(text: str) -> str:
    text = text.strip()
    for prefix in ("```sql", "```"):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


# ──────────────────────────────────────────────
# 条件边
# ──────────────────────────────────────────────
def _route_after_agent(state: EditTableGraphState) -> str:
    return END if state.get("error") else "write_memory"


# ──────────────────────────────────────────────
# 图构建
# ──────────────────────────────────────────────
def build_edit_table_graph() -> StateGraph:
    g = StateGraph(EditTableGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("agent_alter_table", node_agent_alter_table)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "agent_alter_table")
    g.add_conditional_edges("agent_alter_table", _route_after_agent,
                            {"write_memory": "write_memory", END: END})
    g.add_edge("write_memory", END)

    return g


_compiled_graph = None


def get_edit_table_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_edit_table_graph().compile()
    return _compiled_graph
