"""
建表场景 LangGraph 状态图 —— Tool-calling Agent 版本
流程：recall_memory → agent_create_table → write_memory
多轮交互：每轮由 UI 传入新的 conversation_history，图每次独立 invoke

agent_create_table 使用 tool calling：
- AI 自主决定是否需要参考表结构（get_reference_schema）
- 然后生成 CREATE TABLE + 自然语言回复
- 多轮时 AI 可看到 conversation_history 做增量修改
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
class CreateTableGraphState(TypedDict, total=False):
    ai_client: Any
    conversation_history: List[Dict]
    database: Optional[str]
    db_type: Optional[str]
    connection_string: str
    connect_args: Dict
    connection_id: Optional[str]
    all_table_names: List[Any]     # [{"name":..,"comment":..}] 或字符串列表
    current_sql: str

    memory_context: str
    generated_sql: str
    assistant_message: str
    agent_iterations: int
    error: Optional[str]
    current_step: str


# ──────────────────────────────────────────────
# 节点
# ──────────────────────────────────────────────
def node_recall_memory(state: CreateTableGraphState) -> dict:
    try:
        from src.core.memory_store import MemoryStore
        store = MemoryStore(connection_id=state.get("connection_id", ""), database=state.get("database", ""))
        ctx = store.build_memory_context()
        return {"memory_context": ctx, "current_step": "recall_memory"}
    except Exception as e:
        logger.warning(f"recall_memory 失败: {e}")
        return {"memory_context": "", "current_step": "recall_memory"}


def node_agent_create_table(state: CreateTableGraphState) -> dict:
    """
    Tool-calling Agent：AI 自主决定是否参考已有表结构，然后生成 CREATE TABLE
    """
    ai_client = state["ai_client"]
    db_type = state.get("db_type", "")
    db_name = DB_TYPE_MAP.get((db_type or "").lower(), db_type or "")
    memory_context = state.get("memory_context", "")
    all_table_names = state.get("all_table_names", [])
    connection_string = state.get("connection_string", "")

    # 构建表概览（帮 AI 知道可以参考哪些表）
    if all_table_names and connection_string:
        lines = []
        for item in all_table_names[:100]:
            name = item["name"] if isinstance(item, dict) else item
            comment = item.get("comment", "") if isinstance(item, dict) else ""
            lines.append(f"  - {name}" + (f"  # {comment}" if comment else ""))
        table_overview = "【数据库现有表（可作为参考）】\n" + "\n".join(lines)
    else:
        table_overview = ""

    db_type_hint = f"\n【数据库类型】{db_name}，请严格使用 {db_name} 语法。" if db_name else ""
    memory_hint = f"\n\n【历史命名规范（请遵循）】\n{memory_context}" if memory_context else ""

    # 对话历史文本
    history = state.get("conversation_history", [])
    conv_text = "\n".join(
        f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
        for m in history[-12:]
    )

    current_sql = state.get("current_sql", "")
    current_sql_section = f"\n\n【当前建表语句（在此基础上修改）】\n{current_sql}" if current_sql.strip() else ""

    system_prompt = f"""你是一个智能建表助手，通过多轮对话帮助用户设计并生成 CREATE TABLE 语句。{db_type_hint}{memory_hint}

{table_overview}

【对话模式判断 —— 核心规则】
根据用户的意图决定回复模式：

模式A【纯聊天/需求探讨】：用户在描述想法、询问建议、讨论字段、还没有明确要生成 SQL
  → "sql" 字段返回空字符串 ""，只在 "message" 中自然对话
  → 示例触发：「我想建一个用户表」「字段类型用什么好？」「需要加索引吗？」「帮我规划一下」

模式B【生成/更新 SQL】：用户明确要求生成、或对话中已明确字段，可以产出完整建表语句
  → "sql" 字段返回完整的 CREATE TABLE SQL
  → 示例触发：「帮我生成建表语句」「就按这个来」「生成 SQL」「确定了」

【工具使用原则】
- 如果用户要求参考某个已有表的风格/结构 → 调用 get_reference_schema 获取参考
- 如果你已有足够信息且用户要求生成 → 直接生成，不必调用工具
- 最少调用原则：信息够了就不再查询

【输出格式】
以 JSON 返回（不含任何额外文字）：
{{
  "type": "sql" | "chat",
  "sql": "<完整的 CREATE TABLE SQL，纯聊天时为空字符串 \"\">",
  "message": "<自然语言回复：解释说明、追问、建议，或生成SQL后的说明>"
}}
type 说明：
- "sql"  → 本次返回了建表 SQL（模式B），sql 字段有内容
- "chat" → 本次仅对话（模式A），sql 字段为空字符串"""

    user_prompt = (
        f"【对话历史】\n{conv_text}\n"
        f"\n【数据库】{state.get('database') or '未指定'}"
        + (f"\n数据库类型: {db_name}" if db_name else "")
        + current_sql_section
        + "\n\n请根据以上对话历史，生成或修改 CREATE TABLE 语句，以 JSON 返回。"
    )

    # 工具：获取参考表结构
    tools = []
    if all_table_names and connection_string:
        tools.append({
            "type": "function",
            "function": {
                "name": "get_reference_schema",
                "description": "获取数据库中已有表的结构，作为建表的命名和类型参考。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table_names": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "要获取结构的参考表名列表（最多5个）"
                        }
                    },
                    "required": ["table_names"]
                }
            }
        })

    messages: List[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    iterations = 0
    try:
        for iteration in range(MAX_AGENT_ITERATIONS):
            iterations = iteration + 1
            response = ai_client.chat_complete(
                messages=messages,
                tools=tools or None,
                tool_choice="auto" if tools else None,
                caller="agent_create_table",
            )
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
                    if tc.function.name == "get_reference_schema":
                        result = _exec_get_reference_schema(args, state)
                    else:
                        result = f"未知工具: {tc.function.name}"
                    logger.info(f"agent_create_table 工具 {tc.function.name}: {result[:100]}")
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

            elif choice.finish_reason in ("stop", "length", None):
                raw = (msg.content or "").strip()
                sql, message = _parse_json_response(raw)
                return {
                    "generated_sql": sql,
                    "assistant_message": message,
                    "agent_iterations": iterations,
                    "error": None,
                    "current_step": "agent_create_table",
                }
            else:
                break

        return {"error": "AI 未能完成建表语句生成", "current_step": "agent_create_table"}
    except Exception as e:
        logger.error(f"agent_create_table 异常: {e}", exc_info=True)
        return {"error": f"AI生成建表语句失败: {e}", "current_step": "agent_create_table"}


def node_write_memory(state: CreateTableGraphState) -> dict:
    try:
        if state.get("error") or not state.get("generated_sql"):
            return {"current_step": "write_memory"}
        from src.core.memory_store import MemoryStore
        store = MemoryStore(connection_id=state.get("connection_id", ""), database=state.get("database", ""))
        store.write_query_pattern(
            user_intent="建表",
            generated_sql=state.get("generated_sql", ""),
            used_tables=[],
        )
    except Exception as e:
        logger.warning(f"write_memory 失败: {e}")
    return {"current_step": "write_memory"}


# ──────────────────────────────────────────────
# 工具实现
# ──────────────────────────────────────────────
def _exec_get_reference_schema(args: dict, state: CreateTableGraphState) -> str:
    table_names = args.get("table_names", [])[:5]
    if not table_names:
        return "请提供表名"
    try:
        from src.core.langgraph.schema_service import fetch_schema_sync
        schema_text, _ = fetch_schema_sync(
            connection_string=state.get("connection_string", ""),
            connect_args=state.get("connect_args", {}),
            selected_tables=table_names,
            connection_id=state.get("connection_id"),
            database=state.get("database"),
        )
        return schema_text if schema_text.strip() else f"未找到表 {table_names} 的结构"
    except Exception as e:
        return f"获取参考表结构失败: {e}"


# ──────────────────────────────────────────────
# 辅助
# ──────────────────────────────────────────────
def _parse_json_response(raw: str):
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        data = json.loads(text)
        msg_type = data.get("type", "").strip().lower()
        sql = data.get("sql", "").strip()
        message = data.get("message", "").strip()
        # 如果 type 明确为 chat，忽略 sql 字段（防止 AI 误填）
        if msg_type == "chat":
            sql = ""
        return sql, message
    except Exception:
        # JSON 解析失败：根据内容特征判断
        candidate = _strip_fence(raw)
        sql_keywords = ("CREATE ", "ALTER ", "DROP ", "CREATE TABLE")
        if any(candidate.upper().startswith(kw) for kw in sql_keywords):
            return candidate, ""
        return "", raw.strip()


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
def _route_after_agent(state: CreateTableGraphState) -> str:
    return END if state.get("error") else "write_memory"


# ──────────────────────────────────────────────
# 图构建
# ──────────────────────────────────────────────
def build_create_table_graph() -> StateGraph:
    g = StateGraph(CreateTableGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("agent_create_table", node_agent_create_table)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "agent_create_table")
    g.add_conditional_edges("agent_create_table", _route_after_agent,
                            {"write_memory": "write_memory", END: END})
    g.add_edge("write_memory", END)

    return g


_compiled_graph = None


def get_create_table_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_create_table_graph().compile()
    return _compiled_graph
