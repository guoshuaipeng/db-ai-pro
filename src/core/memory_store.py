"""
AI 记忆存储
三层记忆架构：
  1. 会话记忆：State 内的 conversation_history（由各图 State 持有）
  2. 跨会话记忆：LangGraph Checkpointer（由各图 compile 时挂载）
  3. 长期记忆：本文件，读写 config_db 中的记忆表，使 AI 越用越懂用户库
"""
import json
import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)


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
    def build_memory_context(self, user_intent: str = "", max_tokens: int = 400) -> str:
        """组装记忆上下文字符串，注入到 AI 提示词末尾"""
        parts: List[str] = []

        conventions = self.get_naming_conventions(limit=8)
        if conventions:
            parts.append("【该库历史命名规范】\n" + "\n".join(f"- {c}" for c in conventions))

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
