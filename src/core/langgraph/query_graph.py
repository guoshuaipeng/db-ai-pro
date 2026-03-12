"""
查询场景 LangGraph 状态图
流程：recall_memory → select_tables → fetch_schema → [select_enum_columns] → [fetch_enum_values] → generate_sql → write_memory
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


# ──────────────────────────────────────────────
# State
# ──────────────────────────────────────────────
class QueryGraphState(TypedDict, total=False):
    # 输入
    user_query: str
    table_info_list: List[Any]          # [{"name":"t1","comment":"..."}, ...]
    db_type: Optional[str]
    connection_string: str
    connect_args: Dict
    connection_id: Optional[str]
    database: Optional[str]
    config_query_enum: bool
    ai_client: Any                      # AIClient 实例，由 Worker 注入

    # 中间结果
    selected_tables: List[str]
    table_schema: str
    enum_columns: Dict[str, List[str]]
    should_query_enum: bool
    table_schema_with_enum: str
    memory_context: str

    # 输出
    generated_sql: str
    sql_type: str                       # SELECT / INSERT / UPDATE / DELETE / OTHER
    error: Optional[str]

    # 控制
    current_step: str
    retry_count: int


# ──────────────────────────────────────────────
# 节点
# ──────────────────────────────────────────────
def node_recall_memory(state: QueryGraphState) -> dict:
    """召回长期记忆，注入 memory_context"""
    try:
        from src.core.memory_store import MemoryStore
        store = MemoryStore(
            connection_id=state.get("connection_id", ""),
            database=state.get("database", ""),
        )
        context = store.build_memory_context(user_intent=state.get("user_query", ""))
        return {"memory_context": context, "current_step": "recall_memory"}
    except Exception as e:
        logger.warning(f"recall_memory 失败（跳过）: {e}")
        return {"memory_context": "", "current_step": "recall_memory"}


def node_select_tables(state: QueryGraphState) -> dict:
    """调用 AI 选择相关表"""
    try:
        ai_client = state["ai_client"]
        selected = ai_client.select_tables(
            state["user_query"],
            state.get("table_info_list", []),
        )
        if not selected:
            # 降级：取前 10 个表名
            info_list = state.get("table_info_list", [])
            selected = [
                (item["name"] if isinstance(item, dict) else item)
                for item in info_list[:10]
            ]
        logger.info(f"select_tables: 选中 {len(selected)} 个表: {selected}")
        return {"selected_tables": selected, "current_step": "select_tables"}
    except Exception as e:
        logger.error(f"select_tables 异常: {e}")
        return {"error": f"选表失败: {e}", "selected_tables": [], "current_step": "select_tables"}


def node_fetch_schema(state: QueryGraphState) -> dict:
    """同步拉取选中表的结构"""
    try:
        from src.core.langgraph.schema_service import fetch_schema_sync
        schema_text, table_names = fetch_schema_sync(
            connection_string=state["connection_string"],
            connect_args=state.get("connect_args", {}),
            selected_tables=state.get("selected_tables", []),
            connection_id=state.get("connection_id"),
            database=state.get("database"),
        )
        logger.info(f"fetch_schema: schema 长度={len(schema_text)}, 表数={len(table_names)}")
        return {"table_schema": schema_text, "current_step": "fetch_schema"}
    except Exception as e:
        logger.error(f"fetch_schema 异常: {e}")
        return {"error": f"拉取表结构失败: {e}", "table_schema": "", "current_step": "fetch_schema"}


def node_select_enum_columns(state: QueryGraphState) -> dict:
    """AI 识别枚举字段并判断是否需要查询枚举值"""
    try:
        ai_client = state["ai_client"]
        enum_columns, should_query = ai_client.select_enum_columns(
            state["user_query"],
            state.get("table_schema", ""),
        )
        logger.info(f"select_enum_columns: enum_columns={enum_columns}, should_query={should_query}")
        return {
            "enum_columns": enum_columns,
            "should_query_enum": should_query,
            "current_step": "select_enum_columns",
        }
    except Exception as e:
        logger.warning(f"select_enum_columns 失败（跳过）: {e}")
        return {"enum_columns": {}, "should_query_enum": False, "current_step": "select_enum_columns"}


def node_fetch_enum_values(state: QueryGraphState) -> dict:
    """同步查询枚举字段值，增强 table_schema"""
    try:
        from src.core.langgraph.schema_service import fetch_enum_values_sync
        enhanced = fetch_enum_values_sync(
            connection_string=state["connection_string"],
            connect_args=state.get("connect_args", {}),
            table_schema=state.get("table_schema", ""),
            enum_columns=state.get("enum_columns", {}),
        )
        return {"table_schema_with_enum": enhanced, "current_step": "fetch_enum_values"}
    except Exception as e:
        logger.warning(f"fetch_enum_values 失败（跳过）: {e}")
        return {"table_schema_with_enum": state.get("table_schema", ""), "current_step": "fetch_enum_values"}


def node_generate_sql(state: QueryGraphState) -> dict:
    """调用 AI 生成 SQL，要求 JSON 格式返回 {sql_type, sql}"""
    try:
        ai_client = state["ai_client"]
        user_query = state["user_query"]
        db_type = state.get("db_type", "")
        selected_tables = state.get("selected_tables", [])
        # 优先用带枚举值的 schema
        table_schema = state.get("table_schema_with_enum") or state.get("table_schema", "")
        memory_context = state.get("memory_context", "")
        retry_count = state.get("retry_count", 0)

        from src.core.prompt_config import PromptStorage
        prompt_config = PromptStorage().load_prompts()

        # ── 系统提示词 ──
        system_prompt = prompt_config.generate_sql_system
        if db_type:
            db_name = DB_TYPE_MAP.get(db_type.lower(), db_type)
            system_prompt += f"\n\n【数据库类型】当前数据库类型: {db_name}"
        system_prompt += """

【输出格式】
只返回如下 JSON，不要任何额外文字、解释或 markdown 代码块：
{
  "sql_type": "<类型>",
  "sql": "<SQL语句>"
}
sql_type 必须是：SELECT / INSERT / UPDATE / DELETE / OTHER
- SELECT：查询/只读操作（含 SHOW、DESC、EXPLAIN）
- INSERT：插入数据
- UPDATE：更新数据
- DELETE：删除数据
- OTHER：其他"""

        if memory_context:
            system_prompt += f"\n\n【用户历史记忆（优先参考）】\n{memory_context}"

        # ── 用户提示词 ──
        db_info = ""
        if db_type:
            db_name = DB_TYPE_MAP.get(db_type.lower(), db_type)
            db_info = f"\n【数据库类型】\n当前数据库类型: {db_name}\n请使用 {db_name} 的SQL语法规范。\n"

        if table_schema and table_schema.strip():
            if selected_tables:
                table_list = "\n".join(f"  - {t}" for t in selected_tables)
            else:
                table_list = "  (从表结构中获取)"

            user_prompt = f"""【用户需求】
{user_query}{db_info}
【数据库表结构】
{table_schema}

【可用表名列表】（你生成的SQL只能使用这些表）
{table_list}

⚠️ 重要：表名和列名必须完全匹配表结构中的名称，不能使用不存在的列名。
UPDATE/INSERT 后请附加 SELECT 查询查看结果（用分号分隔）。"""
        else:
            user_prompt = f"【用户需求】\n{user_query}\n\n请生成对应的SQL语句。"

        if retry_count > 0:
            user_prompt += f"\n\n【注意】这是第 {retry_count + 1} 次尝试，请仔细检查表名和列名是否正确。"

        # ── 调用 AI ──
        client = ai_client._get_client()
        response = client.chat.completions.create(
            model=ai_client.default_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            top_p=0.9,
        )
        ai_client._record_token_usage(response)
        raw = response.choices[0].message.content.strip()

        # ── 解析 JSON ──
        sql, sql_type = _parse_sql_response(raw)
        logger.info(f"generate_sql: sql_type={sql_type}, sql 前100字符: {sql[:100]}")

        # DDL 拦截
        sql_upper = sql.strip().upper()
        ddl_keywords = ["CREATE TABLE", "CREATE DATABASE", "ALTER TABLE", "DROP TABLE",
                        "DROP DATABASE", "TRUNCATE TABLE", "TRUNCATE"]
        if any(sql_upper.startswith(k) for k in ddl_keywords):
            return {
                "error": "查询功能不支持 DDL 语句，如需建表/改表请使用对应功能",
                "current_step": "generate_sql",
            }

        return {
            "generated_sql": sql,
            "sql_type": sql_type,
            "error": None,
            "current_step": "generate_sql",
        }
    except Exception as e:
        logger.error(f"generate_sql 异常: {e}")
        return {"error": f"AI生成SQL失败: {e}", "current_step": "generate_sql"}


def node_write_memory(state: QueryGraphState) -> dict:
    """将本次成功的查询写入长期记忆"""
    try:
        if state.get("error") or not state.get("generated_sql"):
            return {"current_step": "write_memory"}
        from src.core.memory_store import MemoryStore
        store = MemoryStore(
            connection_id=state.get("connection_id", ""),
            database=state.get("database", ""),
        )
        store.write_query_pattern(
            user_intent=state.get("user_query", ""),
            generated_sql=state.get("generated_sql", ""),
            used_tables=state.get("selected_tables", []),
        )
    except Exception as e:
        logger.warning(f"write_memory 失败（跳过）: {e}")
    return {"current_step": "write_memory"}


# ──────────────────────────────────────────────
# 辅助：解析 JSON 响应
# ──────────────────────────────────────────────
def _parse_sql_response(raw: str):
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    try:
        data = json.loads(text)
        sql = data.get("sql", "").strip()
        sql_type = data.get("sql_type", "OTHER").upper()
        return sql, sql_type
    except json.JSONDecodeError:
        # 降级：把整体当作 SQL，类型靠关键字判断
        sql = text
        upper = text.strip().upper()
        for t in ["SELECT", "INSERT", "UPDATE", "DELETE"]:
            if upper.startswith(t):
                return sql, t
        return sql, "OTHER"


# ──────────────────────────────────────────────
# 条件边
# ──────────────────────────────────────────────
def _route_after_select_tables(state: QueryGraphState) -> str:
    if state.get("error"):
        return END
    return "fetch_schema"


def _route_after_fetch_schema(state: QueryGraphState) -> str:
    if state.get("error"):
        return END
    if state.get("config_query_enum", False) and state.get("table_schema", "").strip():
        return "select_enum_columns"
    return "generate_sql"


def _route_after_select_enum(state: QueryGraphState) -> str:
    if state.get("should_query_enum") and state.get("enum_columns"):
        return "fetch_enum_values"
    return "generate_sql"


def _route_after_generate_sql(state: QueryGraphState) -> str:
    if state.get("error"):
        retry = state.get("retry_count", 0)
        if retry < 1:
            return "generate_sql"  # 最多重试1次
        return END
    return "write_memory"


# ──────────────────────────────────────────────
# 图构建
# ──────────────────────────────────────────────
def build_query_graph() -> StateGraph:
    g = StateGraph(QueryGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("select_tables", node_select_tables)
    g.add_node("fetch_schema", node_fetch_schema)
    g.add_node("select_enum_columns", node_select_enum_columns)
    g.add_node("fetch_enum_values", node_fetch_enum_values)
    g.add_node("generate_sql", node_generate_sql)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "select_tables")
    g.add_conditional_edges("select_tables", _route_after_select_tables,
                            {"fetch_schema": "fetch_schema", END: END})
    g.add_conditional_edges("fetch_schema", _route_after_fetch_schema,
                            {"select_enum_columns": "select_enum_columns",
                             "generate_sql": "generate_sql"})
    g.add_conditional_edges("select_enum_columns", _route_after_select_enum,
                            {"fetch_enum_values": "fetch_enum_values",
                             "generate_sql": "generate_sql"})
    g.add_edge("fetch_enum_values", "generate_sql")
    g.add_conditional_edges("generate_sql", _route_after_generate_sql,
                            {"generate_sql": "generate_sql",
                             "write_memory": "write_memory",
                             END: END})
    g.add_edge("write_memory", END)

    return g


# 编译后的图（单例）
_compiled_query_graph = None


def get_query_graph():
    global _compiled_query_graph
    if _compiled_query_graph is None:
        _compiled_query_graph = build_query_graph().compile()
    return _compiled_query_graph
