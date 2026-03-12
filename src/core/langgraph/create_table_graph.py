"""
建表场景 LangGraph 状态图
流程：recall_memory → select_reference_tables → fetch_reference_schema → generate_create_table → write_memory
多轮交互：每轮由 UI 传入新的 conversation_history，图每次独立 invoke
"""
import logging
import re
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)

DB_TYPE_MAP = {
    "mysql": "MySQL", "mariadb": "MariaDB", "postgresql": "PostgreSQL",
    "oracle": "Oracle", "sqlserver": "SQL Server", "sqlite": "SQLite",
}


# ──────────────────────────────────────────────
# State
# ──────────────────────────────────────────────
class CreateTableGraphState(TypedDict, total=False):
    # 输入
    ai_client: Any
    conversation_history: List[Dict]   # [{"role":"user","content":"..."},...]
    database: Optional[str]
    db_type: Optional[str]
    connection_string: str
    connect_args: Dict
    connection_id: Optional[str]
    all_table_names: List[str]
    current_sql: str                   # 当前已有的建表 SQL（多轮时传入）

    # 中间结果
    selected_reference_tables: List[str]
    reference_schema: str
    memory_context: str

    # 输出
    generated_sql: str
    assistant_message: str             # AI 的自然语言回复（用于对话气泡）
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


def node_select_reference_tables(state: CreateTableGraphState) -> dict:
    """AI 从所有表中选出参考表（最多5个）"""
    try:
        ai_client = state["ai_client"]
        all_table_names = state.get("all_table_names", [])
        if not all_table_names:
            return {"selected_reference_tables": [], "current_step": "select_reference_tables"}

        history = state.get("conversation_history", [])
        latest_user = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")

        selected = ai_client.select_tables(latest_user, all_table_names)
        selected = selected[:5]
        logger.info(f"select_reference_tables: {selected}")
        return {"selected_reference_tables": selected, "current_step": "select_reference_tables"}
    except Exception as e:
        logger.warning(f"select_reference_tables 失败（跳过）: {e}")
        return {"selected_reference_tables": [], "current_step": "select_reference_tables"}


def node_fetch_reference_schema(state: CreateTableGraphState) -> dict:
    """拉取参考表结构"""
    try:
        selected = state.get("selected_reference_tables", [])
        if not selected:
            return {"reference_schema": "", "current_step": "fetch_reference_schema"}

        from src.core.langgraph.schema_service import fetch_schema_sync
        schema_text, _ = fetch_schema_sync(
            connection_string=state.get("connection_string", ""),
            connect_args=state.get("connect_args", {}),
            selected_tables=selected,
            connection_id=state.get("connection_id"),
            database=state.get("database"),
        )
        return {"reference_schema": schema_text, "current_step": "fetch_reference_schema"}
    except Exception as e:
        logger.warning(f"fetch_reference_schema 失败（跳过）: {e}")
        return {"reference_schema": "", "current_step": "fetch_reference_schema"}


def node_generate_create_table(state: CreateTableGraphState) -> dict:
    """AI 多轮生成建表 SQL，同时返回自然语言回复"""
    try:
        ai_client = state["ai_client"]
        from src.core.prompt_config import PromptStorage
        prompt_config = PromptStorage().load_prompts()

        db_type = state.get("db_type", "")
        db_name = DB_TYPE_MAP.get((db_type or "").lower(), db_type or "")

        system_prompt = prompt_config.create_table_generate_sql_system
        if db_name:
            system_prompt += (f"\n\n【重要】当前数据库类型: {db_name}\n"
                              f"请使用 {db_name} 的SQL语法规范生成CREATE TABLE语句。")

        system_prompt += """

【输出格式】
以 JSON 返回，不含任何额外文字或 markdown：
{
  "sql": "<完整的 CREATE TABLE SQL>",
  "message": "<自然语言回复，说明你做了什么或还需要什么信息（可为空字符串）>"
}"""

        memory_context = state.get("memory_context", "")
        if memory_context:
            system_prompt += f"\n\n【用户历史命名规范（请遵循）】\n{memory_context}"

        history = state.get("conversation_history", [])
        conv_text = "\n".join(
            f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
            for m in history[-10:]
        )

        reference_section = ""
        ref_schema = state.get("reference_schema", "")
        if ref_schema and ref_schema.strip():
            reference_section = f"\n\n【参考表结构（请保持一致的命名/类型风格）】\n{ref_schema}"

        current_sql_section = ""
        current_sql = state.get("current_sql", "")
        if current_sql and current_sql.strip():
            current_sql_section = (f"\n\n【当前建表语句（如用户要求修改，基于此调整）】\n{current_sql}")

        db_info = f"\n数据库名: {state.get('database') or '未指定'}"
        if db_name:
            db_info += f"\n数据库类型: {db_name}"

        user_prompt = (
            f"【对话历史】\n{conv_text}\n"
            f"\n【当前数据库】{db_info}"
            f"{reference_section}{current_sql_section}"
            f"\n\n【任务】根据对话历史生成或修改完整的 CREATE TABLE 语句，以 JSON 返回。"
        )

        client = ai_client._get_client()
        response = client.chat.completions.create(
            model=ai_client.default_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
        ai_client._record_token_usage(response)
        raw = response.choices[0].message.content.strip()

        sql, message = _parse_create_response(raw)
        return {
            "generated_sql": sql,
            "assistant_message": message,
            "error": None,
            "current_step": "generate_create_table",
        }
    except Exception as e:
        logger.error(f"generate_create_table 异常: {e}")
        return {"error": f"AI生成建表语句失败: {e}", "current_step": "generate_create_table"}


def node_write_memory(state: CreateTableGraphState) -> dict:
    try:
        if state.get("error") or not state.get("generated_sql"):
            return {"current_step": "write_memory"}
        from src.core.memory_store import MemoryStore
        store = MemoryStore(connection_id=state.get("connection_id", ""), database=state.get("database", ""))
        store.write_query_pattern(
            user_intent="建表",
            generated_sql=state.get("generated_sql", ""),
            used_tables=state.get("selected_reference_tables", []),
        )
    except Exception as e:
        logger.warning(f"write_memory 失败: {e}")
    return {"current_step": "write_memory"}


# ──────────────────────────────────────────────
# 辅助
# ──────────────────────────────────────────────
def _parse_create_response(raw: str):
    import json
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        data = json.loads(text)
        sql = data.get("sql", "").strip()
        message = data.get("message", "").strip()
        return sql, message
    except Exception:
        # 降级：整体当 SQL
        sql = _strip_code_fence(raw)
        return sql, ""


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```sql"):
        text = text[6:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


# ──────────────────────────────────────────────
# 条件边
# ──────────────────────────────────────────────
def _route_after_select_ref(state: CreateTableGraphState) -> str:
    if state.get("selected_reference_tables"):
        return "fetch_reference_schema"
    return "generate_create_table"


# ──────────────────────────────────────────────
# 图构建
# ──────────────────────────────────────────────
def build_create_table_graph() -> StateGraph:
    g = StateGraph(CreateTableGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("select_reference_tables", node_select_reference_tables)
    g.add_node("fetch_reference_schema", node_fetch_reference_schema)
    g.add_node("generate_create_table", node_generate_create_table)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "select_reference_tables")
    g.add_conditional_edges("select_reference_tables", _route_after_select_ref,
                            {"fetch_reference_schema": "fetch_reference_schema",
                             "generate_create_table": "generate_create_table"})
    g.add_edge("fetch_reference_schema", "generate_create_table")
    g.add_edge("generate_create_table", "write_memory")
    g.add_edge("write_memory", END)

    return g


_compiled_graph = None


def get_create_table_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_create_table_graph().compile()
    return _compiled_graph
