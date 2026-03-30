"""
命令行入口

提供对现有 GUI 项目的 CLI 访问能力，包括：
- 列出已配置的数据库连接
- 查看数据库列表
- 查看表列表
- 使用 AI 进行自然语言查询并执行 SQL
- 使用 AI 生成 / 修改表结构（CREATE / ALTER）
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional, List


# 将项目根目录加入 sys.path，复用现有模块
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


# 日志配置：默认 INFO，支持 --debug
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)
logger = logging.getLogger("db-ai-cli")


def _load_connection(conn_identifier: str):
    """根据 ID 或名称加载连接配置"""
    from src.core.config_db import get_config_db

    config_db = get_config_db()
    all_conns = config_db.get_all_connections()

    # 先按 id 精确匹配
    for c in all_conns:
        if c["id"] == conn_identifier:
            return c

    # 再按 name 匹配（允许用户更友好地使用）
    name_matches = [c for c in all_conns if c["name"] == conn_identifier]
    if len(name_matches) == 1:
        return name_matches[0]

    if not all_conns:
        raise SystemExit("当前尚未配置任何数据库连接，请先在 GUI 中配置。")

    msg_lines = ["未找到指定连接，请使用以下之一作为 --conn 参数："]
    for c in all_conns:
        msg_lines.append(f"- {c['id']}  ({c['name']})")
    raise SystemExit("\n".join(msg_lines))


def _build_db_connection(conn_cfg) -> "DatabaseConnection":
    """从配置数据库中的 dict 构造 DatabaseConnection 实例"""
    from src.core.database_connection import DatabaseConnection, DatabaseType

    return DatabaseConnection(
        id=conn_cfg["id"],
        name=conn_cfg["name"],
        db_type=DatabaseType(conn_cfg["db_type"]),
        host=conn_cfg.get("host") or "",
        port=int(conn_cfg.get("port") or 0),
        database=conn_cfg.get("database") or "",
        username=conn_cfg.get("username") or "",
        password=(conn_cfg.get("password") or ""),
        charset=conn_cfg.get("charset") or "utf8mb4",
        extra_params=conn_cfg.get("extra_params") or {},
    )


def _build_db_manager_and_engine(conn_identifier: str, database: Optional[str] = None):
    """根据连接标识创建 DatabaseManager 并返回连接 ID 与 DatabaseConnection"""
    from src.core.database_manager import DatabaseManager

    raw = _load_connection(conn_identifier)
    db_conn = _build_db_connection(raw)

    # 如指定 database，则覆盖配置中的 database 字段
    if database:
        db_conn.database = database

    mgr = DatabaseManager()
    ok = mgr.add_connection(db_conn, test_connection=True)
    if not ok:
        raise SystemExit("数据库连接失败，请检查连接配置和网络。")

    return mgr, db_conn.id, db_conn


def cmd_connections(args: argparse.Namespace) -> None:
    """列出所有已配置的数据库连接"""
    from src.core.config_db import get_config_db

    config_db = get_config_db()
    connections = config_db.get_all_connections()

    if not connections:
        print("当前没有任何已配置的数据库连接。请先在 GUI 中添加连接。")
        return

    print("已配置的数据库连接：")
    for idx, c in enumerate(connections, start=1):
        db_type = c["db_type"]
        name = c["name"]
        cid = c["id"]
        host = c.get("host") or ""
        port = c.get("port") or ""
        database = c.get("database") or ""
        print(f"[{idx}] {name}")
        print(f"  ID       : {cid}")
        print(f"  类型     : {db_type}")
        if host:
            print(f"  地址     : {host}:{port}")
        if database:
            print(f"  数据库   : {database}")
        print()


def cmd_databases(args: argparse.Namespace) -> None:
    """列出某个连接下的所有数据库"""
    mgr, conn_id, _ = _build_db_manager_and_engine(args.conn, database=None)
    dbs = mgr.get_databases(conn_id)
    if not dbs:
        print("未获取到数据库列表。")
        return
    print(f"连接 {args.conn} 下的数据库列表：")
    for name in dbs:
        print(f"- {name}")


def cmd_tables(args: argparse.Namespace) -> None:
    """列出指定连接 / 数据库下的表列表"""
    mgr, conn_id, db_conn = _build_db_manager_and_engine(args.conn, database=args.database)
    tables = mgr.get_tables(conn_id, database=args.database or db_conn.database)
    if not tables:
        print("未获取到表列表。")
        return
    db_label = args.database or db_conn.database or "(当前数据库)"
    print(f"连接 {args.conn}，数据库 {db_label} 下的表列表：")
    for t in tables:
        print(f"- {t}")


def _run_ai_query(
    conn_identifier: str,
    database: Optional[str],
    user_query: str,
    limit: Optional[int],
) -> None:
    """使用 LangGraph 查询图进行自然语言查询并执行 SQL"""
    from src.core.ai_client import AIClient
    from src.core.config_db import get_config_db
    from src.core.langgraph.query_graph import get_query_graph

    mgr, conn_id, db_conn = _build_db_manager_and_engine(conn_identifier, database=database)

    # 获取所有表名（不带注释）
    table_names: List[str] = mgr.get_tables(conn_id, database=db_conn.database)

    # 构造 LangGraph 初始状态
    ai_client = AIClient()
    graph = get_query_graph()

    initial_state = {
        "user_query": user_query,
        "table_info_list": table_names,
        "db_type": db_conn.db_type.value,
        "connection_string": db_conn.get_connection_string(),
        "connect_args": db_conn.get_connect_args(),
        "connection_id": conn_id,
        "database": db_conn.database,
        "config_query_enum": True,
        "ai_client": ai_client,
        "execution_error": "",
        "failed_sql": "",
        "memory_context": "",
        "generated_sql": "",
        "sql_type": "OTHER",
        "selected_tables": [],
        "agent_iterations": 0,
        "error": None,
        "current_step": "",
    }

    start_ts = datetime.now()
    final_state = graph.invoke(initial_state)

    if final_state.get("error"):
        print("AI 生成 SQL 失败：", final_state["error"])
        return

    sql = final_state.get("generated_sql") or ""
    sql_type = final_state.get("sql_type", "OTHER")

    if not sql:
        print("AI 未能生成 SQL。")
        return

    print("=== AI 生成的 SQL ===")
    print(sql)
    print("=====================")

    # 执行 SQL
    duration_ms = 0
    is_select = sql_type.upper() == "SELECT"
    if is_select:
        success, rows, err = mgr.execute_query(conn_id, sql, limit=limit)
        if not success:
            print("执行 SQL 失败：", err or "")
            return
        if not rows:
            print("查询结果为空。")
            return
        # 简单表格输出
        cols = list(rows[0].keys())
        print("\t".join(cols))
        for r in rows:
            print("\t".join(str(r.get(c, "")) for c in cols))
    else:
        success, affected, err = mgr.execute_non_query(conn_id, sql)
        if not success:
            print("执行 SQL 失败：", err or "")
            return
        print(f"执行成功，受影响行数：{affected!r}")
    # 记录到查询历史
    try:
        duration_ms = int((datetime.now() - start_ts).total_seconds() * 1000)
        config_db = get_config_db()
        config_db.add_query_history(
            connection_id=conn_id,
            database_name=db_conn.database or "",
            sql=sql,
            source="CLI",
            duration_ms=duration_ms,
            title="",
        )
    except Exception as e:  # pragma: no cover - 历史记录失败不影响主流程
        logger.debug(f"记录查询历史失败: {e}")


def cmd_ai_query(args: argparse.Namespace) -> None:
    """自然语言查询并执行 SQL"""
    _run_ai_query(
        conn_identifier=args.conn,
        database=args.database,
        user_query=args.query,
        limit=args.limit,
    )


def cmd_history(args: argparse.Namespace) -> None:
    """查看最近的查询历史"""
    from src.core.config_db import get_config_db

    config_db = get_config_db()

    connection_id = None
    if args.conn:
        # 允许用 id 或 name 过滤，复用 _load_connection
        try:
            conn_cfg = _load_connection(args.conn)
            connection_id = conn_cfg["id"]
        except SystemExit:
            # 连接不存在时，仅按原样作为过滤条件尝试
            connection_id = args.conn

    histories = config_db.get_recent_query_history(
        limit=args.limit,
        connection_id=connection_id,
        database_name=args.database,
        only_favorites=args.only_favorites,
    )

    if not histories:
        print("暂无查询历史记录。")
        return

    print("最近的查询历史：")
    for idx, h in enumerate(histories, start=1):
        star = "★" if h["is_favorite"] else " "
        title = h["title"].strip() or h["sql"].strip().replace("\n", " ")
        if len(title) > 80:
            title = title[:77] + "..."
        print(f"[{idx}] {star} {title}")
        print(f"  连接   : {h['connection_id']}")
        print(f"  数据库 : {h['database_name'] or '-'}")
        print(f"  来源   : {h['source']}")
        print(f"  时间   : {h['executed_at']}")
        if h["duration_ms"]:
            print(f"  耗时   : {h['duration_ms']} ms")
        print(f"  SQL    : {h['sql'].strip()}")
        print()


def _run_ai_create_table(
    conn_identifier: str,
    database: Optional[str],
    user_prompt: str,
    apply_changes: bool,
) -> None:
    """使用 LangGraph 建表图进行 AI 建表"""
    from src.core.ai_client import AIClient
    from src.core.langgraph.create_table_graph import get_create_table_graph

    mgr, conn_id, db_conn = _build_db_manager_and_engine(conn_identifier, database=database)
    table_names: List[str] = mgr.get_tables(conn_id, database=db_conn.database)

    ai_client = AIClient()
    graph = get_create_table_graph()

    conversation_history = [{"role": "user", "content": user_prompt}]

    state = {
        "ai_client": ai_client,
        "conversation_history": conversation_history,
        "database": db_conn.database,
        "db_type": db_conn.db_type.value,
        "connection_string": db_conn.get_connection_string(),
        "connect_args": db_conn.get_connect_args(),
        "connection_id": conn_id,
        "all_table_names": table_names,
        "current_sql": "",
        "memory_context": "",
        "generated_sql": "",
        "assistant_message": "",
        "agent_iterations": 0,
        "error": None,
        "current_step": "",
    }

    final_state = graph.invoke(state)
    if final_state.get("error"):
        print("AI 生成建表语句失败：", final_state["error"])
        return

    message = final_state.get("assistant_message") or ""
    sql = final_state.get("generated_sql") or ""

    if message:
        print("=== AI 说明 ===")
        print(message)
        print("================")

    if not sql:
        print("当前对话轮次未生成建表 SQL，可补充需求后重试。")
        return

    print("=== AI 生成的建表 SQL ===")
    print(sql)
    print("========================")

    if not apply_changes:
        print("未指定 --apply，仅展示 SQL，如需执行请加上 --apply。")
        return

    ok, affected, err = mgr.execute_non_query(conn_id, sql)
    if not ok:
        print("执行建表 SQL 失败：", err or "")
        return
    print("建表 SQL 执行成功。")


def cmd_ai_create_table(args: argparse.Namespace) -> None:
    """自然语言生成建表 SQL，可选择直接执行"""
    _run_ai_create_table(
        conn_identifier=args.conn,
        database=args.database,
        user_prompt=args.prompt,
        apply_changes=args.apply,
    )


def _run_ai_edit_table(
    conn_identifier: str,
    database: Optional[str],
    table_name: str,
    user_prompt: str,
    apply_changes: bool,
) -> None:
    """使用 LangGraph 改表图进行 AI 改表"""
    from src.core.ai_client import AIClient
    from src.core.langgraph.edit_table_graph import get_edit_table_graph
    from src.core.langgraph.schema_service import fetch_schema_sync

    mgr, conn_id, db_conn = _build_db_manager_and_engine(conn_identifier, database=database)

    # 获取当前表结构文本，供 Agent 参考
    schema_text, _ = fetch_schema_sync(
        connection_string=db_conn.get_connection_string(),
        connect_args=db_conn.get_connect_args(),
        selected_tables=[table_name],
        connection_id=conn_id,
        database=db_conn.database,
    )

    ai_client = AIClient()
    graph = get_edit_table_graph()
    conversation_history = [{"role": "user", "content": user_prompt}]

    state = {
        "ai_client": ai_client,
        "conversation_history": conversation_history,
        "database": db_conn.database,
        "db_type": db_conn.db_type.value,
        "table_name": table_name,
        "current_table_schema": schema_text,
        "current_sql": "",
        "connection_id": conn_id,
        "connection_string": db_conn.get_connection_string(),
        "connect_args": db_conn.get_connect_args(),
        "memory_context": "",
        "generated_sql": "",
        "assistant_message": "",
        "agent_iterations": 0,
        "error": None,
        "current_step": "",
    }

    final_state = graph.invoke(state)
    if final_state.get("error"):
        print("AI 生成改表语句失败：", final_state["error"])
        return

    message = final_state.get("assistant_message") or ""
    sql = final_state.get("generated_sql") or ""

    if message:
        print("=== AI 说明 ===")
        print(message)
        print("================")

    if not sql:
        print("当前对话轮次未生成 ALTER TABLE SQL，可补充需求后重试。")
        return

    print("=== AI 生成的改表 SQL ===")
    print(sql)
    print("========================")

    if not apply_changes:
        print("未指定 --apply，仅展示 SQL，如需执行请加上 --apply。")
        return

    ok, affected, err = mgr.execute_non_query(conn_id, sql)
    if not ok:
        print("执行改表 SQL 失败：", err or "")
        return
    print("改表 SQL 执行成功。")


def cmd_ai_edit_table(args: argparse.Namespace) -> None:
    """针对单表的自然语言改表，可选择直接执行"""
    _run_ai_edit_table(
        conn_identifier=args.conn,
        database=args.database,
        table_name=args.table,
        user_prompt=args.prompt,
        apply_changes=args.apply,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="db-ai-cli",
        description="数据库 AI 助手 CLI（复用 GUI 核心能力）",
    )
    parser.add_argument("--debug", action="store_true", help="启用调试日志输出")

    sub = parser.add_subparsers(dest="command", required=True)

    # connections
    p_conn = sub.add_parser("connections", help="列出已配置的数据库连接")
    p_conn.set_defaults(func=cmd_connections)

    # databases
    p_db = sub.add_parser("databases", help="列出某个连接下的数据库列表")
    p_db.add_argument("-c", "--conn", required=True, help="连接 ID 或名称")
    p_db.set_defaults(func=cmd_databases)

    # tables
    p_tbl = sub.add_parser("tables", help="列出表列表")
    p_tbl.add_argument("-c", "--conn", required=True, help="连接 ID 或名称")
    p_tbl.add_argument("-d", "--database", help="数据库名称（不指定则使用连接中的当前数据库）")
    p_tbl.set_defaults(func=cmd_tables)

    # ai-query
    p_ai_q = sub.add_parser("ai-query", help="使用 AI 进行自然语言查询并执行 SQL")
    p_ai_q.add_argument("-c", "--conn", required=True, help="连接 ID 或名称")
    p_ai_q.add_argument("-d", "--database", help="数据库名称（不指定则使用连接中的当前数据库）")
    p_ai_q.add_argument("-q", "--query", required=True, help="自然语言查询，如：'查询今天下单金额最高的前10个用户'")
    p_ai_q.add_argument("--limit", type=int, default=100, help="查询结果限制行数（仅对 SELECT 生效）")
    p_ai_q.set_defaults(func=cmd_ai_query)

    # history
    p_hist = sub.add_parser("history", help="查看最近的查询历史")
    p_hist.add_argument(
        "-c", "--conn", help="按连接 ID 或名称过滤（可选）",
    )
    p_hist.add_argument(
        "-d",
        "--database",
        help="按数据库名称过滤（可选）",
    )
    p_hist.add_argument(
        "--only-favorites",
        action="store_true",
        help="仅显示已收藏的查询",
    )
    p_hist.add_argument(
        "--limit",
        type=int,
        default=20,
        help="最多显示的记录数（默认 20）",
    )
    p_hist.set_defaults(func=cmd_history)

    # ai-create-table
    p_ai_ct = sub.add_parser("ai-create-table", help="使用 AI 生成建表 SQL，可选直接执行")
    p_ai_ct.add_argument("-c", "--conn", required=True, help="连接 ID 或名称")
    p_ai_ct.add_argument("-d", "--database", help="数据库名称（不指定则使用连接中的当前数据库）")
    p_ai_ct.add_argument("-p", "--prompt", required=True, help="自然语言描述表结构和需求")
    p_ai_ct.add_argument("--apply", action="store_true", help="直接执行生成的建表 SQL")
    p_ai_ct.set_defaults(func=cmd_ai_create_table)

    # ai-edit-table
    p_ai_et = sub.add_parser("ai-edit-table", help="针对单表的 AI 改表，可选直接执行")
    p_ai_et.add_argument("-c", "--conn", required=True, help="连接 ID 或名称")
    p_ai_et.add_argument("-d", "--database", help="数据库名称（不指定则使用连接中的当前数据库）")
    p_ai_et.add_argument("-t", "--table", required=True, help="要修改的表名")
    p_ai_et.add_argument("-p", "--prompt", required=True, help="自然语言描述需要的表结构变更")
    p_ai_et.add_argument("--apply", action="store_true", help="直接执行生成的改表 SQL")
    p_ai_et.set_defaults(func=cmd_ai_edit_table)

    return parser


def main(argv: Optional[list] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        logger.debug("已开启调试日志输出。")

    if not hasattr(args, "func"):
        parser.print_help()
        return

    args.func(args)


if __name__ == "__main__":
    main()

