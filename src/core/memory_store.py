"""
AI 记忆存储
三层记忆架构：
  1. 会话记忆：State 内的 conversation_history（由各图 State 持有）
  2. 跨会话记忆：LangGraph Checkpointer（由各图 compile 时挂载）
  3. 长期记忆：本文件，读写 config_db 中的记忆表，使 AI 越用越懂用户库

压缩策略：
  - pattern 数量 >= COMPRESS_THRESHOLD 时触发
  - 按涉及的表分组，统计每组的常用操作，生成表级摘要
  - 摘要注入 prompt，比逐条 example 信息密度更高
  - 7 天内不重复压缩，避免浪费 AI token
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

logger = logging.getLogger(__name__)

# pattern 累积超过此数量时触发压缩
COMPRESS_THRESHOLD = 30
# 两次压缩最短间隔（天）
COMPRESS_INTERVAL_DAYS = 7


@dataclass
class QueryPattern:
    user_intent: str
    generated_sql: str
    used_tables: List[str]
    use_count: int


@dataclass
class CorrectionRecord:
    user_query: str
    ai_sql: str
    corrected_sql: str
    correction_note: Optional[str] = None


class MemoryStore:
    """AI 长期记忆存取，按 connection_id + database 隔离"""

    def __init__(self, connection_id: str = "", database: str = ""):
        self.connection_id = connection_id
        self.database = database or ""
        from src.core.config_db import get_config_db
        self._db = get_config_db()
        self._ensure_tables()

    # ------------------------------------------------------------------ #
    # DDL                                                                  #
    # ------------------------------------------------------------------ #
    def _ensure_tables(self):
        """确保记忆相关表存在（幂等）"""
        try:
            self._db.ensure_memory_tables()
        except Exception as e:
            logger.warning(f"MemoryStore: 初始化表失败: {e}")

    # ------------------------------------------------------------------ #
    # 命名规范                                                              #
    # ------------------------------------------------------------------ #
    def get_naming_conventions(self, limit: int = 10) -> List[str]:
        try:
            return self._db.get_naming_conventions(self.connection_id, self.database, limit)
        except Exception as e:
            logger.warning(f"get_naming_conventions 失败: {e}")
            return []

    def save_naming_convention(self, pattern: str, examples: List[str] = None):
        try:
            self._db.save_naming_convention(
                self.connection_id, self.database, pattern, examples or []
            )
        except Exception as e:
            logger.warning(f"save_naming_convention 失败: {e}")

    def generate_naming_conventions(
        self,
        ai_client,
        connection_string: str,
        connect_args: Optional[dict] = None,
        max_tables: int = 300,
        max_schema_chars: int = 12000,
    ) -> bool:
        """
        从数据库表结构中，让 AI 归纳“命名规范”，并写回 memory_naming_conventions。

        注意：schema_service.fetch_schema_sync 内部目前对全量表名有默认上限（约 300），
        因此这里的 max_tables 主要用于提示/未来扩展，实际以 schema_service 行为为准。
        """
        if not ai_client or not connection_string or not self.connection_id:
            return False

        try:
            from src.core.langgraph.schema_service import fetch_schema_sync

            # 传空列表表示“不指定表”，schema_service 会取前若干表结构（默认上限 300）
            schema_text, table_names = fetch_schema_sync(
                connection_string=connection_string,
                connect_args=connect_args or {},
                selected_tables=[],
                connection_id=self.connection_id,
                database=self.database,
                force_refresh=False,
                max_tables=max_tables,
                include_comments=False,
            )

            schema_text = (schema_text or "").strip()
            if not schema_text:
                return False
            if len(schema_text) > max_schema_chars:
                schema_text = schema_text[:max_schema_chars] + "\n...(schema已截断)"

            prompt = (
                "你是数据库设计助手。请根据下面给出的数据库表结构（包含表名、列名、列类型、是否可空、主键、以及可能的注释），"
                "归纳该数据库/数据域的表命名与字段命名规范。\n\n"
                "要求：\n"
                "1. 输出尽量多但要精炼的命名规则（通常 6~12 条）。\n"
                "2. 每条规则的 `pattern` 用一句中文概括（尽量包含关键约束，如 snake_case / 前缀 / 后缀 / 大小写 / 是否带下划线等）。\n"
                "3. 每条规则的 `examples` 给出 2~8 个从结构里出现过的真实表名/字段名示例（或命名模板），用数组返回。\n"
                "4. 如果无法从数据中可靠提炼某条规则，则不要编造，宁可减少条数。\n\n"
                "输出格式：仅返回 JSON，不要有任何多余文字。JSON 必须是：\n"
                '{\n'
                '  "naming_conventions": [\n'
                '    {"pattern": "...", "examples": ["...", "..."]}\n'
                "  ]\n"
                "}\n\n"
                f"（结构信息：table_count={len(table_names)}；max_tables_hint={max_tables}）\n"
                f"{schema_text}\n"
            )

            resp = ai_client.chat_complete(
                messages=[{"role": "user", "content": prompt}],
                caller="memory_naming_conventions",
            )
            raw = (resp.choices[0].message.content or "").strip()
            if not raw:
                return False

            cleaned = raw
            # 兼容 ```json ... ``` 包裹
            if cleaned.startswith("```"):
                import re

                cleaned = re.sub(r"^```(?:json)?\\s*", "", cleaned, flags=re.IGNORECASE).strip()
                cleaned = re.sub(r"```$", "", cleaned).strip()

            import json as _json

            data = _json.loads(cleaned)
            conventions = data.get("naming_conventions", [])
            if not isinstance(conventions, list) or not conventions:
                return False

            # 写前覆盖旧规则，避免重复/脏数据
            try:
                self._db.clear_naming_conventions(self.connection_id, self.database)
            except Exception:
                # 清理失败不影响写入（但可能导致重复）
                pass

            saved = 0
            for c in conventions:
                if not isinstance(c, dict):
                    continue
                pattern = str(c.get("pattern", "")).strip()
                examples = c.get("examples", []) or []
                if not pattern:
                    continue
                if not isinstance(examples, list):
                    examples = [str(examples)]
                self._db.save_naming_convention(
                    self.connection_id,
                    self.database,
                    pattern,
                    [str(x) for x in examples],
                )
                saved += 1

            return saved > 0

        except Exception as e:
            logger.warning(f"generate_naming_conventions 失败: {e}")
            return False

    # ------------------------------------------------------------------ #
    # 查询模式                                                              #
    # ------------------------------------------------------------------ #
    def search_query_patterns(self, user_intent: str, top_k: int = 3) -> List[QueryPattern]:
        try:
            rows = self._db.search_query_patterns(
                self.connection_id, self.database, user_intent, top_k
            )
            return [
                QueryPattern(
                    user_intent=r["user_intent"],
                    generated_sql=r["generated_sql"],
                    used_tables=json.loads(r["used_tables"] or "[]"),
                    use_count=r["use_count"],
                )
                for r in rows
            ]
        except Exception as e:
            logger.warning(f"search_query_patterns 失败: {e}")
            return []

    def write_query_pattern(self, user_intent: str, generated_sql: str, used_tables: List[str]):
        try:
            self._db.upsert_query_pattern(
                self.connection_id, self.database, user_intent, generated_sql, used_tables
            )
        except Exception as e:
            logger.warning(f"write_query_pattern 失败: {e}")

    # ------------------------------------------------------------------ #
    # 纠正记录                                                              #
    # ------------------------------------------------------------------ #
    def get_recent_corrections(self, limit: int = 3) -> List[CorrectionRecord]:
        try:
            rows = self._db.get_recent_corrections(self.connection_id, self.database, limit)
            return [
                CorrectionRecord(
                    user_query=r["user_query"],
                    ai_sql=r["ai_sql"],
                    corrected_sql=r["corrected_sql"],
                    correction_note=r.get("correction_note"),
                )
                for r in rows
            ]
        except Exception as e:
            logger.warning(f"get_recent_corrections 失败: {e}")
            return []

    def write_correction(self, user_query: str, ai_sql: str, corrected_sql: str, note: str = ""):
        try:
            self._db.save_correction(
                self.connection_id, self.database, user_query, ai_sql, corrected_sql, note
            )
        except Exception as e:
            logger.warning(f"write_correction 失败: {e}")

    # ------------------------------------------------------------------ #
    # 召回上下文（供 recall_memory 节点使用）                                #
    # ------------------------------------------------------------------ #
    def build_memory_context(
        self,
        user_intent: str = "",
        max_tokens: int = 500,
        include_naming_conventions: bool = True,
    ) -> str:
        """组装记忆上下文字符串，注入到 AI 提示词末尾"""
        parts: List[str] = []

        if include_naming_conventions:
            conventions = self.get_naming_conventions(limit=8)
            if conventions:
                parts.append("【该库历史命名规范】\n" + "\n".join(f"- {c}" for c in conventions))

        # 优先使用表级摘要（压缩后的高密度知识）
        summaries = self.get_table_summaries()
        if summaries:
            lines = [f"- {s['table_key']}：{s['summary']}" for s in summaries[:6]]
            parts.append("【该库各表使用规律（AI归纳）】\n" + "\n".join(lines))

        # 补充相似具体案例（直接参考 SQL）
        if user_intent:
            patterns = self.search_query_patterns(user_intent, top_k=3)
            if patterns:
                lines = [
                    f"- 意图: {p.user_intent}\n  SQL: {p.generated_sql}"
                    for p in patterns
                ]
                parts.append("【相似历史查询参考】\n" + "\n".join(lines))

        corrections = self.get_recent_corrections(limit=3)
        if corrections:
            lines = [
                f"- 用户意图: {c.user_query}\n  AI错误SQL: {c.ai_sql}\n  正确SQL: {c.corrected_sql}"
                for c in corrections
            ]
            parts.append("【用户曾纠正的错误模式，请避免重复】\n" + "\n".join(lines))

        context = "\n\n".join(parts)
        # 简单按字符限制（中文1字≈1.5 token）
        max_chars = int(max_tokens * 1.5)
        if len(context) > max_chars:
            context = context[:max_chars] + "\n...(记忆已截断)"
        return context

    def get_table_summaries(self) -> List[dict]:
        """获取表级摘要列表"""
        try:
            return self._db.get_table_summaries(self.connection_id, self.database)
        except Exception as e:
            logger.warning(f"get_table_summaries 失败: {e}")
            return []

    # ------------------------------------------------------------------ #
    # 记忆压缩                                                              #
    # ------------------------------------------------------------------ #
    def compress_if_needed(
        self,
        ai_client=None,
        connection_string: str = "",
        connect_args: Optional[dict] = None,
        force: bool = False,
    ) -> bool:
        """
        检查是否需要压缩，满足条件时执行压缩。
        返回 True 表示本次触发了压缩，False 表示跳过。
        """
        try:
            count = self._db.get_pattern_count(self.connection_id, self.database)
            if not force:
                if count < COMPRESS_THRESHOLD:
                    return False

                last_time = self._db.get_last_compression_time(self.connection_id, self.database)
                if last_time and (datetime.now() - last_time) < timedelta(days=COMPRESS_INTERVAL_DAYS):
                    return False

            logger.info(f"触发记忆压缩：connection={self.connection_id} db={self.database} patterns={count}")
            compressed_count = self._do_compress(
                ai_client=ai_client,
                total_count=count,
                connection_string=connection_string,
                connect_args=connect_args or {},
            )
            return compressed_count > 0
        except Exception as e:
            logger.warning(f"compress_if_needed 失败（跳过）: {e}")
            return False

    def _do_compress(
        self,
        ai_client=None,
        total_count: int = 0,
        connection_string: str = "",
        connect_args: Optional[dict] = None,
    ):
        """执行压缩：按涉及的表分组，生成摘要并保存"""
        all_patterns = self._db.get_all_patterns_for_compression(self.connection_id, self.database)
        if not all_patterns:
            return 0

        # 按 used_tables 分组
        groups: dict = {}
        for p in all_patterns:
            tables = p["used_tables"]
            key = "、".join(sorted(tables)) if tables else "未知表"
            groups.setdefault(key, []).append(p)

        compressed_count = 0
        for table_key, patterns in groups.items():
            if len(patterns) < 2:
                # 只有1条的组，直接跳过，留给相似查询召回
                continue

            # 组内去重得到参与表名；用于拉取 schema 给 AI
            table_names = sorted(
                {t for p in patterns for t in (p.get("used_tables") or []) if t}
            )
            if ai_client:
                summary = self._summarize_with_ai(
                    table_key=table_key,
                    patterns=patterns,
                    ai_client=ai_client,
                    table_names=table_names,
                    connection_string=connection_string,
                    connect_args=connect_args or {},
                )
            else:
                summary = self._summarize_statistically(table_key, patterns)

            if summary:
                self._db.save_table_summary(
                    self.connection_id, self.database,
                    table_key, summary, len(patterns)
                )
                compressed_count += 1

        self._db.update_compression_log(self.connection_id, self.database, total_count)
        logger.info(f"记忆压缩完成：生成 {compressed_count} 条表级摘要，原始 pattern={total_count}")
        return compressed_count

    def _summarize_with_ai(
        self,
        table_key: str,
        patterns: list,
        ai_client,
        table_names: List[str],
        connection_string: str = "",
        connect_args: Optional[dict] = None,
    ) -> str:
        """调用 AI 生成表使用规律摘要（最多展示10条样例给AI）"""
        examples = "\n".join(
            f"- 意图：{p['user_intent']}\n  SQL：{p['generated_sql']}"
            for p in patterns[:10]
        )

        schema_text = ""
        if connection_string and table_names:
            try:
                # 生成摘要时，把真实表结构给 AI，提升摘要的可解释性与可执行性
                from src.core.langgraph.schema_service import fetch_schema_sync

                schema_text, _ = fetch_schema_sync(
                    connection_string=connection_string,
                    connect_args=connect_args or {},
                    selected_tables=table_names,
                    connection_id=self.connection_id,
                    database=self.database,
                    force_refresh=False,
                )
                # 防止 schema 过长导致模型输入超限
                schema_text = (schema_text or "").strip()
                if len(schema_text) > 8000:
                    schema_text = schema_text[:8000] + "\n...(schema已截断)"
            except Exception as e:
                logger.warning(f"获取 schema 给 AI 失败（降级为仅历史查询摘要）: {e}")

        prompt = (
            f"以下是用户对【{table_key}】相关表的历史查询记录"
            f"（共{len(patterns)}条，展示前10条）：\n\n{examples}\n\n"
            + (f"表结构如下（用于理解列名/主键/注释，可能已截断）：\n{schema_text}\n\n" if schema_text else "")
            + "请用2~3句话归纳这些查询的规律，包括：常用字段（按列名）、常见操作（统计/筛选/关联等）、典型 WHERE 条件。直接输出归纳文字，不要额外解释和标题。"
        )
        try:
            resp = ai_client.chat_complete(
                messages=[{"role": "user", "content": prompt}],
                caller="memory_compress",
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"AI压缩摘要失败，降级到统计摘要: {e}")
            return self._summarize_statistically(table_key, patterns)

    def _summarize_statistically(self, table_key: str, patterns: list) -> str:
        """无 AI 时的统计摘要：分析 SQL 关键词频率"""
        sqls = [p["generated_sql"].upper() for p in patterns]
        kw_map = {
            "聚合统计": ["SUM(", "COUNT(", "AVG(", "MAX(", "MIN("],
            "分组查询": ["GROUP BY"],
            "排序查询": ["ORDER BY"],
            "条件筛选": ["WHERE"],
            "多表关联": ["JOIN"],
            "分页查询": ["LIMIT"],
        }
        found = [label for label, kws in kw_map.items()
                 if sum(1 for sql in sqls if any(kw in sql for kw in kws)) > len(sqls) * 0.3]

        intents_sample = "、".join(p["user_intent"] for p in patterns[:3])
        ops = "、".join(found) if found else "查询"
        return f"共{len(patterns)}条查询记录，常见操作：{ops}。典型意图举例：{intents_sample}"
