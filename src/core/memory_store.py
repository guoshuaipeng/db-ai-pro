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
    def build_memory_context(self, user_intent: str = "", max_tokens: int = 500) -> str:
        """组装记忆上下文字符串，注入到 AI 提示词末尾"""
        parts: List[str] = []

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
    def compress_if_needed(self, ai_client=None) -> bool:
        """
        检查是否需要压缩，满足条件时执行压缩。
        返回 True 表示本次触发了压缩，False 表示跳过。
        """
        try:
            count = self._db.get_pattern_count(self.connection_id, self.database)
            if count < COMPRESS_THRESHOLD:
                return False

            last_time = self._db.get_last_compression_time(self.connection_id, self.database)
            if last_time and (datetime.now() - last_time) < timedelta(days=COMPRESS_INTERVAL_DAYS):
                return False

            logger.info(f"触发记忆压缩：connection={self.connection_id} db={self.database} patterns={count}")
            self._do_compress(ai_client, total_count=count)
            return True
        except Exception as e:
            logger.warning(f"compress_if_needed 失败（跳过）: {e}")
            return False

    def _do_compress(self, ai_client=None, total_count: int = 0):
        """执行压缩：按涉及的表分组，生成摘要并保存"""
        all_patterns = self._db.get_all_patterns_for_compression(self.connection_id, self.database)
        if not all_patterns:
            return

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
            if ai_client:
                summary = self._summarize_with_ai(table_key, patterns, ai_client)
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

    def _summarize_with_ai(self, table_key: str, patterns: list, ai_client) -> str:
        """调用 AI 生成表使用规律摘要（最多展示10条样例给AI）"""
        examples = "\n".join(
            f"- 意图：{p['user_intent']}\n  SQL：{p['generated_sql']}"
            for p in patterns[:10]
        )
        prompt = (
            f"以下是用户对【{table_key}】相关表的历史查询记录"
            f"（共{len(patterns)}条，展示前10条）：\n\n{examples}\n\n"
            "请用1~2句话归纳这些查询的规律，包括：常用字段、常见操作（统计/筛选/关联等）、"
            "典型 WHERE 条件。直接输出归纳文字，不要额外解释和标题。"
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
