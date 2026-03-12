"""
改表场景 LangGraph 状态图
流程：recall_memory → generate_alter_table → write_memory
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
class EditTableGraphState(TypedDict, total=False):
    ai_client: Any
    conversation_history: List[Dict]
    database: Optional[str]
    db_type: Optional[str]
    table_name: Optional[str]
    current_table_schema: str
    current_sql: str            # 当前已生成的 ALTER TABLE（多轮时传入）
    connection_id: Optional[str]

    memory_context: str
    generated_sql: str
    assistant_message: str
    error: Optional[str]
    current_step: str
    retry_count: int


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


def node_generate_alter_table(state: EditTableGraphState) -> dict:
    """AI 生成 ALTER TABLE SQL，同时返回自然语言回复"""
    try:
        ai_client = state["ai_client"]
        from src.core.prompt_config import PromptStorage
        prompt_config = PromptStorage().load_prompts()

        db_type = state.get("db_type", "")
        db_name = DB_TYPE_MAP.get((db_type or "").lower(), db_type or "")

        system_prompt = prompt_config.edit_table_generate_sql_system
        if db_name:
            system_prompt += (f"\n\n【重要】当前数据库类型: {db_name}\n"
                              f"请使用 {db_name} 的SQL语法规范生成ALTER TABLE语句。")

        system_prompt += """

【输出格式】
以 JSON 返回，不含任何额外文字或 markdown：
{
  "sql": "<完整的 ALTER TABLE SQL>",
  "message": "<自然语言回复，说明你做了什么修改或还需要什么信息（可为空字符串）>"
}"""

        memory_context = state.get("memory_context", "")
        if memory_context:
            system_prompt += f"\n\n【历史命名规范（请遵循）】\n{memory_context}"

        history = state.get("conversation_history", [])
        conv_text = "\n".join(
            f"{'用户' if m['role'] == 'user' else 'AI'}: {m['content']}"
            for m in history[-10:]
        )

        table_schema_section = ""
        current_schema = state.get("current_table_schema", "")
        if current_schema and current_schema.strip():
            table_schema_section = f"\n\n【当前表结构】\n{current_schema}"

        current_sql_section = ""
        current_sql = state.get("current_sql", "")
        if current_sql and current_sql.strip():
            current_sql_section = (f"\n\n【当前的修改语句（如用户要求修改，基于此调整）】\n{current_sql}")

        db_info = f"\n数据库名: {state.get('database') or '未指定'}"
        if db_name:
            db_info += f"\n数据库类型: {db_name}"

        retry_count = state.get("retry_count", 0)
        retry_note = f"\n\n【注意】这是第 {retry_count + 1} 次尝试，请仔细检查语法。" if retry_count > 0 else ""

        user_prompt = (
            f"【对话历史】\n{conv_text}\n"
            f"\n【当前数据库】{db_info}"
            f"\n\n【要修改的表】\n表名: {state.get('table_name') or '未指定'}"
            f"{table_schema_section}{current_sql_section}"
            f"\n\n【任务】根据对话历史生成完整的 ALTER TABLE 语句，以 JSON 返回。"
            f"{retry_note}"
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

        sql, message = _parse_alter_response(raw)
        return {
            "generated_sql": sql,
            "assistant_message": message,
            "error": None,
            "current_step": "generate_alter_table",
        }
    except Exception as e:
        logger.error(f"generate_alter_table 异常: {e}")
        return {"error": f"AI生成改表语句失败: {e}", "current_step": "generate_alter_table"}


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
# 辅助
# ──────────────────────────────────────────────
def _parse_alter_response(raw: str):
    import json
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
def _route_after_generate(state: EditTableGraphState) -> str:
    if state.get("error"):
        retry = state.get("retry_count", 0)
        if retry < 1:
            return "generate_alter_table"
        return END
    return "write_memory"


# ──────────────────────────────────────────────
# 图构建
# ──────────────────────────────────────────────
def build_edit_table_graph() -> StateGraph:
    g = StateGraph(EditTableGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("generate_alter_table", node_generate_alter_table)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "generate_alter_table")
    g.add_conditional_edges("generate_alter_table", _route_after_generate,
                            {"generate_alter_table": "generate_alter_table",
                             "write_memory": "write_memory",
                             END: END})
    g.add_edge("write_memory", END)

    return g


_compiled_graph = None


def get_edit_table_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_edit_table_graph().compile()
    return _compiled_graph
