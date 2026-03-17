"""
查询场景 LangGraph 状态图 —— Tool-calling Agent 版本

架构：recall_memory → agent_sql → write_memory

agent_sql 是一个真正的 AI Agent：
- AI 拿到用户问题 + 可用工具描述
- 自主决定调用哪些工具（搜索表/拉结构/拿枚举值），或直接生成 SQL
- 工具调用在 Python 循环内执行，结果追加到对话，再让 AI 决定下一步
- AI 输出 JSON {sql_type, sql} 时循环结束

决策智能示例：
  "SELECT * FROM users WHERE id=1"    → AI 直接返回，不调用任何工具
  "查询users表今天的注册用户"           → AI 直接调 get_table_schema(["users"])，跳过搜索
  "帮我查一下今天下单金额最高的用户"    → AI 先 search_tables，再 get_schema，再按需 get_enum_values
  "查询状态为已完成的订单"              → AI 调 get_schema + get_enum_values 获取实际状态值
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

MAX_AGENT_ITERATIONS = 6      # 最多工具调用轮次（防止死循环）
MAX_ENUM_COLUMNS = 5          # 单次最多查几列枚举值


# ──────────────────────────────────────────────────────────────
# State
# ──────────────────────────────────────────────────────────────
class QueryGraphState(TypedDict, total=False):
    # ── 输入（由 Worker 注入）──────────────────────────────────
    user_query: str
    table_info_list: List[Any]     # [{"name":"t1","comment":"..."}, ...]
    db_type: Optional[str]
    connection_string: str
    connect_args: Dict
    connection_id: Optional[str]
    database: Optional[str]
    config_query_enum: bool        # 用户配置：是否允许查枚举值
    ai_client: Any                 # AIClient 实例
    execution_error: Optional[str]  # 上一次执行报错信息（用于 AI 自动修复）
    failed_sql: Optional[str]       # 上一次执行失败的 SQL

    # ── 记忆 ──────────────────────────────────────────────────
    memory_context: str

    # ── 输出 ──────────────────────────────────────────────────
    generated_sql: str
    sql_type: str                  # SELECT / INSERT / UPDATE / DELETE / OTHER
    selected_tables: List[str]     # Agent 实际用到的表（写记忆用）
    error: Optional[str]
    agent_iterations: int          # 实际工具调用次数（可观测）
    current_step: str


# ──────────────────────────────────────────────────────────────
# Tool 定义（OpenAI Function Calling 格式）
# ──────────────────────────────────────────────────────────────
def _build_tools(config_query_enum: bool = True) -> list:
    tools = [
        {
            "type": "function",
            "function": {
                "name": "search_relevant_tables",
                "description": (
                    "当你不确定用户问的是哪张表时，用此工具从数据库所有表中搜索最相关的表。"
                    "如果用户已明确提到表名，无需调用此工具。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "用自然语言描述你要找的表的用途或包含的数据"
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_table_schema",
                "description": (
                    "获取指定表的完整结构（列名、字段类型、是否可空、主键、注释等）。"
                    "当你知道要用哪些表但需要了解具体字段时，调用此工具。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table_names": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "需要获取结构的表名列表，可同时传多张表"
                        }
                    },
                    "required": ["table_names"]
                }
            }
        },
    ]
    if config_query_enum:
        tools.append({
            "type": "function",
            "function": {
                "name": "get_enum_values",
                "description": (
                    "获取某列的实际枚举值（从数据库查 DISTINCT 值）。"
                    "当 WHERE 条件涉及状态、类型、分类等字段，且你不确定实际值时使用。"
                    f"每次最多传 {MAX_ENUM_COLUMNS} 个字段。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "columns": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "table": {"type": "string", "description": "表名"},
                                    "column": {"type": "string", "description": "列名"}
                                },
                                "required": ["table", "column"]
                            },
                            "description": "需要查询枚举值的字段列表"
                        }
                    },
                    "required": ["columns"]
                }
            }
        })
    return tools


# ──────────────────────────────────────────────────────────────
# Tool 执行函数（在 Python 层调用，结果回传给 AI）
# ──────────────────────────────────────────────────────────────
def _exec_search_tables(args: dict, state: QueryGraphState) -> str:
    """search_relevant_tables 工具实现"""
    query = args.get("query", "")
    table_info_list = state.get("table_info_list", [])
    if not table_info_list:
        return "【当前数据库没有可用的表信息】"
    try:
        ai_client = state["ai_client"]
        selected = ai_client.select_tables(query, table_info_list)
        if selected:
            lines = []
            for t in selected:
                comment = ""
                for info in table_info_list:
                    if isinstance(info, dict) and info.get("name") == t:
                        comment = info.get("comment", "")
                        break
                lines.append(f"  - {t}" + (f"  # {comment}" if comment else ""))
            return f"找到以下相关表：\n" + "\n".join(lines)
        return "未找到相关表，请尝试换个描述方式"
    except Exception as e:
        logger.warning(f"search_relevant_tables 失败: {e}")
        # 降级：返回前10个表名
        all_names = [
            (i["name"] if isinstance(i, dict) else i)
            for i in table_info_list[:10]
        ]
        return f"搜索失败，返回前10个表供参考：{', '.join(all_names)}"


def _exec_get_schema(args: dict, state: QueryGraphState) -> str:
    """get_table_schema 工具实现"""
    table_names = args.get("table_names", [])
    if not table_names:
        return "请提供至少一个表名"
    try:
        from src.core.langgraph.schema_service import fetch_schema_sync
        schema_text, _ = fetch_schema_sync(
            connection_string=state.get("connection_string", ""),
            connect_args=state.get("connect_args", {}),
            selected_tables=table_names,
            connection_id=state.get("connection_id"),
            database=state.get("database"),
        )
        return schema_text if schema_text.strip() else f"未能获取表 {table_names} 的结构（可能表不存在）"
    except Exception as e:
        logger.warning(f"get_table_schema 失败: {e}")
        return f"获取表结构失败: {e}"


def _exec_get_enum_values(args: dict, state: QueryGraphState) -> str:
    """get_enum_values 工具实现"""
    columns = args.get("columns", [])[:MAX_ENUM_COLUMNS]
    if not columns:
        return "请提供至少一个字段"

    connection_string = state.get("connection_string", "")
    connect_args = state.get("connect_args", {})
    if not connection_string:
        return "无数据库连接，无法查询枚举值"

    try:
        from src.core.langgraph.schema_service import _get_field_unique_values
        from sqlalchemy import create_engine
        engine = create_engine(connection_string, connect_args=connect_args,
                               pool_pre_ping=True, echo=False, poolclass=None)
        results = []
        try:
            for item in columns:
                table = item.get("table", "")
                col = item.get("column", "")
                if table and col:
                    values = _get_field_unique_values(engine, table, col, max_values=20)
                    results.append(f"  {table}.{col} 的枚举值: {values}")
        finally:
            engine.dispose()
        return "\n".join(results) if results else "未查询到枚举值"
    except Exception as e:
        logger.warning(f"get_enum_values 失败: {e}")
        return f"查询枚举值失败: {e}"


# ──────────────────────────────────────────────────────────────
# 节点
# ──────────────────────────────────────────────────────────────
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


def node_agent_sql(state: QueryGraphState) -> dict:
    """
    Tool-calling Agent 核心节点
    AI 自主决定调用哪些工具，最终返回 JSON {sql_type, sql}
    """
    ai_client = state["ai_client"]
    user_query = state.get("user_query", "")
    db_type = state.get("db_type", "")
    db_name = DB_TYPE_MAP.get((db_type or "").lower(), db_type or "")
    memory_context = state.get("memory_context", "")
    config_query_enum = state.get("config_query_enum", True)
    table_info_list = state.get("table_info_list", [])

    # ── 系统提示词 ──────────────────────────────────────────
    db_type_hint = f"\n【数据库类型】当前数据库：{db_name}，请严格使用 {db_name} 的语法。" if db_name else ""
    memory_hint = f"\n\n【用户历史记忆（优先参考）】\n{memory_context}" if memory_context else ""

    # 构建可用表概览（帮 AI 感知数据库规模和表名）
    if table_info_list:
        table_overview_lines = []
        for item in table_info_list[:200]:  # 最多列出200个给 AI 参考
            name = item["name"] if isinstance(item, dict) else item
            comment = item.get("comment", "") if isinstance(item, dict) else ""
            table_overview_lines.append(f"  - {name}" + (f"  # {comment}" if comment else ""))
        table_overview = "【数据库所有表（概览）】\n" + "\n".join(table_overview_lines)
        if len(table_info_list) > 200:
            table_overview += f"\n  ...（共 {len(table_info_list)} 个表，其余可用 search_relevant_tables 搜索）"
    else:
        table_overview = "【当前无可用表信息，请直接根据用户需求生成 SQL】"

    system_prompt = f"""你是一个智能 SQL 生成助手，擅长根据用户需求生成精准的 SQL 语句。{db_type_hint}{memory_hint}

{table_overview}

【工具使用决策原则】
1. 用户已给出完整 SQL → 直接返回，无需调用任何工具
2. 用户明确指定了表名（如"查询 users 表"）→ 直接调用 get_table_schema，跳过 search_relevant_tables
3. 用户描述模糊，不知道用哪张表 → 先调用 search_relevant_tables 搜索，再调用 get_table_schema
4. WHERE 条件涉及状态/类型/分类等枚举字段，且你不确定实际值 → 调用 get_enum_values
5. 最少调用原则：已有足够信息就直接生成，不要过度查询
6. 只生成 DML/DQL 语句，拒绝生成 DDL（CREATE/ALTER/DROP）

【输出格式 —— 极其重要，违反即为错误】
工具调用完成后（或直接生成时），你的回复必须且只能是以下 JSON，不得包含任何分析过程、解释说明、markdown 标记或其他文字：
{{
  "sql_type": "<类型>",
  "sql": "<完整SQL>"
}}
sql_type 枚举：SELECT（含只读操作）/ INSERT / UPDATE / DELETE / OTHER
⚠️ 禁止：在 JSON 前后输出任何文字、禁止用 ```json 包裹、禁止输出思考过程"""

    # ── 错误修复上下文（自动重试时注入）──────────────────────
    execution_error = state.get("execution_error", "")
    failed_sql = state.get("failed_sql", "")
    if execution_error and failed_sql:
        user_message = (
            f"用户需求：{user_query}\n\n"
            f"【注意：以下 SQL 执行时报错，请分析原因并修复】\n"
            f"错误 SQL：\n```sql\n{failed_sql}\n```\n"
            f"数据库报错：{execution_error}\n\n"
            f"请根据报错信息和表结构（可调用工具重新获取），生成修复后的正确 SQL。"
        )
        logger.info(f"agent_sql 进入修复模式，错误: {execution_error[:100]}")
    else:
        user_message = f"用户需求：{user_query}"

    # ── 工具列表 ──────────────────────────────────────────────
    tools = _build_tools(config_query_enum)

    # ── 对话消息历史 ──────────────────────────────────────────
    messages: List[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    # ── Agent 循环 ────────────────────────────────────────────
    selected_tables: List[str] = []
    iterations = 0

    try:
        for iteration in range(MAX_AGENT_ITERATIONS):
            iterations = iteration + 1
            logger.info(f"agent_sql 第 {iterations} 轮调用")

            try:
                response = ai_client.chat_complete(
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    caller="agent_sql",
                )
            except Exception as api_err:
                # 某些模型不支持 tools 参数，降级到无工具模式
                if "tool" in str(api_err).lower() or "function" in str(api_err).lower():
                    logger.warning(f"模型不支持 tool calling，降级到直接生成: {api_err}")
                    return _fallback_generate_sql(state, ai_client, system_prompt, user_message)
                raise

            choice = response.choices[0]
            msg = choice.message

            # ── 情况1：AI 调用工具 ──────────────────────────
            if choice.finish_reason == "tool_calls" and msg.tool_calls:
                # 把 AI 的消息追加到对话
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            }
                        }
                        for tc in msg.tool_calls
                    ]
                })

                # 执行每个工具调用
                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}

                    logger.info(f"agent_sql 调用工具: {tool_name}({args})")

                    if tool_name == "search_relevant_tables":
                        result = _exec_search_tables(args, state)
                    elif tool_name == "get_table_schema":
                        result = _exec_get_schema(args, state)
                        # 记录 AI 实际用到的表
                        selected_tables.extend(args.get("table_names", []))
                    elif tool_name == "get_enum_values":
                        result = _exec_get_enum_values(args, state)
                    else:
                        result = f"未知工具: {tool_name}"

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

            # ── 情况2：AI 完成，生成最终输出 ──────────────────
            elif choice.finish_reason in ("stop", "length", None):
                raw = (msg.content or "").strip()
                sql, sql_type = _parse_sql_response(raw)

                if not sql:
                    logger.warning(f"agent_sql: AI 输出内容无法解析为 SQL，将重试。原文前300字: {raw[:300]}")
                    # 把 AI 的回复以及重试要求追加到对话，让 AI 再次输出
                    messages.append({"role": "assistant", "content": raw})
                    messages.append({
                        "role": "user",
                        "content": (
                            "你的回复格式不正确。请只输出以下格式的 JSON，不要任何其他文字：\n"
                            '{"sql_type": "SELECT", "sql": "你的SQL语句"}'
                        )
                    })
                    continue  # 继续循环让 AI 重新输出

                # DDL 拦截
                upper = sql.strip().upper()
                ddl_kws = ["CREATE TABLE", "CREATE DATABASE", "ALTER TABLE",
                           "DROP TABLE", "DROP DATABASE", "TRUNCATE"]
                if any(upper.startswith(k) for k in ddl_kws):
                    return {
                        "error": "查询功能不支持 DDL 语句，请使用建表/改表功能",
                        "current_step": "agent_sql",
                    }

                logger.info(f"agent_sql 完成: sql_type={sql_type}, 迭代={iterations}, 表={selected_tables}")
                return {
                    "generated_sql": sql,
                    "sql_type": sql_type,
                    "selected_tables": list(set(selected_tables)),
                    "agent_iterations": iterations,
                    "error": None,
                    "current_step": "agent_sql",
                }
            else:
                logger.warning(f"agent_sql: 未知 finish_reason={choice.finish_reason}")
                break

        return {"error": f"AI 在 {MAX_AGENT_ITERATIONS} 轮内未完成生成，请重试", "current_step": "agent_sql"}

    except Exception as e:
        logger.error(f"agent_sql 异常: {e}", exc_info=True)
        return {"error": f"AI生成SQL失败: {e}", "current_step": "agent_sql"}


def node_write_memory(state: QueryGraphState) -> dict:
    """将本次成功的查询写入长期记忆，并在条件满足时触发压缩"""
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
        # 写入后检查是否需要压缩（传入 ai_client 供 AI 生成摘要，无则降级统计摘要）
        store.compress_if_needed(ai_client=state.get("ai_client"))
    except Exception as e:
        logger.warning(f"write_memory 失败（跳过）: {e}")
    return {"current_step": "write_memory"}


# ──────────────────────────────────────────────────────────────
# 降级：模型不支持 tool calling 时直接生成（保留兼容性）
# ──────────────────────────────────────────────────────────────
def _fallback_generate_sql(state: QueryGraphState, ai_client, system_prompt: str, user_message: str) -> dict:
    """当模型不支持 tool calling 时，用传统方式生成 SQL"""
    logger.info("降级到无工具模式生成 SQL")
    try:
        from src.core.prompt_config import PromptStorage
        prompt_config = PromptStorage().load_prompts()
        sys_p = prompt_config.generate_sql_system + "\n\n【输出格式】以 JSON 返回：{\"sql_type\":\"...\",\"sql\":\"...\"}"
        response = ai_client.chat_complete(
            messages=[
                {"role": "system", "content": sys_p},
                {"role": "user", "content": user_message},
            ],
            caller="agent_sql_fallback",
        )
        raw = response.choices[0].message.content.strip()
        sql, sql_type = _parse_sql_response(raw)
        return {
            "generated_sql": sql,
            "sql_type": sql_type,
            "selected_tables": [],
            "agent_iterations": 1,
            "error": None,
            "current_step": "agent_sql",
        }
    except Exception as e:
        return {"error": f"降级生成失败: {e}", "current_step": "agent_sql"}


# ──────────────────────────────────────────────────────────────
# 辅助：解析 JSON 响应
# ──────────────────────────────────────────────────────────────
def _parse_sql_response(raw: str):
    """
    从 AI 响应中提取 {sql_type, sql} JSON。
    兼容以下情况：
    1. 纯 JSON
    2. ```json ... ``` 代码块
    3. 混合文字 + JSON（AI 多输出了解释性内容）
    4. 完全没有 JSON（降级为关键字判断）
    """
    text = raw.strip()

    # ── 策略1：直接 json.loads 整体 ──────────────────────────
    cleaned = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
        if "sql" in data:
            return data.get("sql", "").strip(), data.get("sql_type", "OTHER").upper()
    except (json.JSONDecodeError, ValueError):
        pass

    # ── 策略2：在混合文本中寻找最后一个 {...} JSON 块 ─────────
    # 用贪心匹配，从右往左找完整 JSON 对象
    brace_matches = list(re.finditer(r'\{[^{}]*"sql"[^{}]*\}', text, re.DOTALL))
    if brace_matches:
        for m in reversed(brace_matches):
            try:
                data = json.loads(m.group())
                if "sql" in data:
                    sql = data.get("sql", "").strip()
                    sql_type = data.get("sql_type", "OTHER").upper()
                    logger.info("_parse_sql_response: 从混合文本中提取到 JSON")
                    return sql, sql_type
            except (json.JSONDecodeError, ValueError):
                continue

    # ── 策略3：在代码块中找 SQL ──────────────────────────────
    code_block = re.search(r"```(?:sql)?\s*(SELECT|INSERT|UPDATE|DELETE|WITH|SHOW|DESC).*?```",
                           text, re.IGNORECASE | re.DOTALL)
    if code_block:
        sql = code_block.group().strip()
        sql = re.sub(r"^```(?:sql)?\s*", "", sql, flags=re.IGNORECASE)
        sql = re.sub(r"\s*```$", "", sql).strip()
        upper = sql.upper()
        for t in ("SELECT", "INSERT", "UPDATE", "DELETE"):
            if upper.startswith(t):
                return sql, t
        return sql, "OTHER"

    # ── 策略4：降级，把文本当 SQL（仅在以 SQL 关键字开头时）──
    upper = cleaned.upper().lstrip()
    for t in ("SELECT", "INSERT", "UPDATE", "DELETE", "SHOW", "DESC", "WITH"):
        if upper.startswith(t):
            return cleaned, t

    # ── 最终降级：返回空，让外层报错 ─────────────────────────
    logger.warning(f"_parse_sql_response: 无法从响应中提取 SQL，原始内容前200字: {raw[:200]}")
    return "", "OTHER"


# ──────────────────────────────────────────────────────────────
# 条件边
# ──────────────────────────────────────────────────────────────
def _route_after_agent(state: QueryGraphState) -> str:
    if state.get("error"):
        return END
    return "write_memory"


# ──────────────────────────────────────────────────────────────
# 图构建（极简：recall → agent → write_memory）
# ──────────────────────────────────────────────────────────────
def build_query_graph() -> StateGraph:
    g = StateGraph(QueryGraphState)

    g.add_node("recall_memory", node_recall_memory)
    g.add_node("agent_sql", node_agent_sql)
    g.add_node("write_memory", node_write_memory)

    g.add_edge(START, "recall_memory")
    g.add_edge("recall_memory", "agent_sql")
    g.add_conditional_edges(
        "agent_sql", _route_after_agent,
        {"write_memory": "write_memory", END: END}
    )
    g.add_edge("write_memory", END)

    return g


_compiled_query_graph = None


def get_query_graph():
    global _compiled_query_graph
    if _compiled_query_graph is None:
        _compiled_query_graph = build_query_graph().compile()
    return _compiled_query_graph
