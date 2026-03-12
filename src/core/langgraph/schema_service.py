"""
同步版表结构获取服务
将 SchemaWorker 中的核心逻辑抽取为同步函数，供 LangGraph 节点内调用（已在 QThread 中执行，不会阻塞 UI）
"""
import logging
from typing import Tuple, List, Optional

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError

from src.core.schema_cache import get_schema_cache

logger = logging.getLogger(__name__)


def fetch_schema_sync(
    connection_string: str,
    connect_args: dict,
    selected_tables: List[str],
    connection_id: Optional[str] = None,
    database: Optional[str] = None,
    force_refresh: bool = False,
) -> Tuple[str, List[str]]:
    """
    同步获取表结构，返回 (schema_text, table_names)。
    已从缓存读取时直接返回，否则查询数据库。
    """
    # 尝试缓存
    if not force_refresh and connection_id:
        cache = get_schema_cache()
        cached = cache.get_schema(connection_id, selected_tables)
        if cached is not None:
            schema_text, table_names = cached
            logger.info(f"schema_service: 命中缓存，表数量: {len(table_names)}")
            return schema_text, table_names

    engine = None
    try:
        engine = create_engine(
            connection_string,
            connect_args=connect_args,
            pool_pre_ping=True,
            echo=False,
            poolclass=None,
        )
        inspector = inspect(engine)

        if database:
            if "mysql" in connection_string.lower() or "mariadb" in connection_string.lower():
                all_tables = inspector.get_table_names(schema=database)
            else:
                all_tables = inspector.get_table_names()
        else:
            all_tables = inspector.get_table_names()

        if selected_tables:
            tables_to_process = [t for t in selected_tables if t in all_tables]
            if not tables_to_process:
                all_tables_lower = {t.lower(): t for t in all_tables}
                for t in selected_tables:
                    matched = all_tables_lower.get(t.lower())
                    if matched:
                        tables_to_process.append(matched)
        else:
            tables_to_process = all_tables[:300]

        schema_parts: List[str] = []
        for table_name in tables_to_process:
            try:
                actual_table = table_name
                schema_name: Optional[str] = None
                if "." in table_name:
                    idx = table_name.rfind(".")
                    schema_name = table_name[:idx].strip()
                    actual_table = table_name[idx + 1:].strip()
                elif database:
                    schema_name = database

                if schema_name:
                    columns = inspector.get_columns(actual_table, schema=schema_name)
                else:
                    columns = inspector.get_columns(actual_table)

                try:
                    if schema_name:
                        pk_constraint = inspector.get_pk_constraint(actual_table, schema=schema_name)
                    else:
                        pk_constraint = inspector.get_pk_constraint(actual_table)
                    primary_keys = pk_constraint.get("constrained_columns", []) if pk_constraint else []
                    pk_info = f" [主键: {', '.join(primary_keys)}]" if primary_keys else ""
                except Exception:
                    pk_info = ""

                try:
                    table_comment = _get_table_comment(engine, table_name)
                    comment_info = f" - {table_comment}" if table_comment else ""
                except Exception:
                    comment_info = ""

                schema_parts.append(f"表: {table_name}{pk_info}{comment_info}")

                for col in columns:
                    col_name = col["name"]
                    col_type = str(col["type"])
                    nullable = "可空" if col.get("nullable", True) else "非空"

                    try:
                        col_comment = _get_column_comment(engine, table_name, col_name)
                        comment_str = f" ({col_comment})" if col_comment else ""
                    except Exception:
                        comment_str = ""

                    col_info = f"  • {col_name}: {col_type} ({nullable}){comment_str}"
                    if col.get("default") is not None:
                        default_val = str(col.get("default"))
                        if default_val:
                            col_info += f", 默认: {default_val}"
                    schema_parts.append(col_info)

                schema_parts.append("")
            except Exception as e:
                logger.error(f"schema_service: 获取表 {table_name} 结构失败: {e}")
                continue

        schema_text = "\n".join(schema_parts)

        if connection_id:
            cache = get_schema_cache()
            cache.set_schema(connection_id, schema_text, tables_to_process, selected_tables)

        logger.info(f"schema_service: 完成，共 {len(tables_to_process)} 个表")
        return schema_text, tables_to_process

    except SQLAlchemyError as e:
        logger.error(f"schema_service: SQLAlchemy 错误: {e}")
        return "", []
    except Exception as e:
        logger.error(f"schema_service: 异常: {e}")
        return "", []
    finally:
        if engine:
            try:
                engine.dispose()
            except Exception:
                pass


def _get_table_comment(engine, table_name: str) -> str:
    url_str = str(engine.url)
    try:
        if "mysql" in url_str or "mariadb" in url_str:
            db_name = engine.url.database
            if not db_name:
                return ""
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT TABLE_COMMENT FROM information_schema.TABLES "
                         "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl"),
                    {"db": db_name, "tbl": table_name},
                )
                row = result.fetchone()
                return (row[0] or "").strip() if row else ""
        elif "postgresql" in url_str:
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT obj_description(c.oid, 'pg_class') "
                         "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                         "WHERE n.nspname = 'public' AND c.relname = :tbl"),
                    {"tbl": table_name},
                )
                row = result.fetchone()
                return (row[0] or "").strip() if row else ""
    except Exception as e:
        logger.debug(f"获取表注释失败 {table_name}: {e}")
    return ""


def _get_column_comment(engine, table_name: str, column_name: str) -> str:
    url_str = str(engine.url)
    try:
        if "mysql" in url_str or "mariadb" in url_str:
            db_name = engine.url.database
            if not db_name:
                return ""
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT COLUMN_COMMENT FROM information_schema.COLUMNS "
                         "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl AND COLUMN_NAME = :col"),
                    {"db": db_name, "tbl": table_name, "col": column_name},
                )
                row = result.fetchone()
                return (row[0] or "").strip() if row else ""
        elif "postgresql" in url_str:
            with engine.connect() as conn:
                result = conn.execute(
                    text("SELECT col_description(a.attrelid, a.attnum) "
                         "FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid "
                         "WHERE c.relname = :tbl AND a.attname = :col AND a.attnum > 0"),
                    {"tbl": table_name, "col": column_name},
                )
                row = result.fetchone()
                return (row[0] or "").strip() if row else ""
    except Exception as e:
        logger.debug(f"获取列注释失败 {table_name}.{column_name}: {e}")
    return ""


def fetch_enum_values_sync(
    connection_string: str,
    connect_args: dict,
    table_schema: str,
    enum_columns: dict,
) -> str:
    """
    同步查询枚举字段值并拼入表结构文本，返回增强后的 schema_text。
    """
    engine = None
    try:
        engine = create_engine(
            connection_string,
            connect_args=connect_args,
            pool_pre_ping=True,
            echo=False,
            poolclass=None,
        )

        lines = table_schema.split("\n")
        result_lines = []
        current_table: Optional[str] = None

        for line in lines:
            result_lines.append(line)

            if line.startswith("表: "):
                table_part = line[3:].strip()
                if " [" in table_part:
                    current_table = table_part.split(" [")[0].strip()
                elif " - " in table_part:
                    current_table = table_part.split(" - ")[0].strip()
                else:
                    current_table = table_part.strip()

            elif line.startswith("  • ") and current_table:
                if current_table in enum_columns:
                    col_part = line[4:].strip()
                    if ":" in col_part:
                        col_name = col_part.split(":")[0].strip()
                        if col_name in enum_columns[current_table]:
                            try:
                                field_values = _get_field_unique_values(engine, current_table, col_name)
                                if field_values:
                                    if len(field_values) <= 15:
                                        values_str = f" [字段值: {', '.join(map(str, field_values))}]"
                                    else:
                                        values_str = f" [字段值示例: {', '.join(map(str, field_values[:10]))}... (共{len(field_values)}个)]"
                                    if ", 默认:" in line:
                                        line = line.replace(", 默认:", f"{values_str}, 默认:")
                                    else:
                                        line = line + values_str
                                    result_lines[-1] = line
                            except Exception as e:
                                logger.debug(f"获取枚举值失败 {current_table}.{col_name}: {e}")

        return "\n".join(result_lines)
    except Exception as e:
        logger.error(f"fetch_enum_values_sync 异常: {e}")
        return table_schema
    finally:
        if engine:
            try:
                engine.dispose()
            except Exception:
                pass


def _get_field_unique_values(engine, table_name: str, column_name: str, max_values: int = 20) -> list:
    url_str = str(engine.url)
    try:
        if not (table_name.replace("_", "").replace(".", "").isalnum() and
                column_name.replace("_", "").replace(".", "").isalnum()):
            return []
        with engine.connect() as conn:
            if "mysql" in url_str or "mariadb" in url_str:
                q = text(f"SELECT DISTINCT `{column_name}` FROM `{table_name}` "
                         f"WHERE `{column_name}` IS NOT NULL LIMIT :n")
            elif "postgresql" in url_str:
                q = text(f'SELECT DISTINCT "{column_name}" FROM "{table_name}" '
                         f'WHERE "{column_name}" IS NOT NULL LIMIT :n')
            else:
                q = text(f"SELECT DISTINCT [{column_name}] FROM [{table_name}] "
                         f"WHERE [{column_name}] IS NOT NULL LIMIT :n")
            result = conn.execute(q, {"n": max_values})
            return [str(row[0]) for row in result if row[0] is not None]
    except Exception as e:
        logger.debug(f"_get_field_unique_values 失败: {e}")
        return []
