"""
生成命名规范后台工作线程
"""

from typing import Any, Dict, Optional

from PyQt6.QtCore import QThread, pyqtSignal

from src.core.memory_store import MemoryStore


class GenerateNamingConventionsWorker(QThread):
    status_update = pyqtSignal(str)
    finished = pyqtSignal(bool, str)  # (ok, message)
    error_occurred = pyqtSignal(str)

    def __init__(
        self,
        ai_client: Any,
        connection_id: str,
        database: str,
        connection_string: str,
        connect_args: Optional[Dict] = None,
        parent=None,
    ):
        super().__init__(parent)
        self.ai_client = ai_client
        self.connection_id = connection_id
        self.database = database or ""
        self.connection_string = connection_string or ""
        self.connect_args = connect_args or {}

    def run(self):
        try:
            self.status_update.emit("正在拉取表结构（schema）...")
            store = MemoryStore(connection_id=self.connection_id, database=self.database)

            # MemoryStore 内部会：fetch_schema_sync -> AI 总结 -> 写回 memory_naming_conventions
            self.status_update.emit("正在调用 AI 总结命名规范...")
            ok = store.generate_naming_conventions(
                ai_client=self.ai_client,
                connection_string=self.connection_string,
                connect_args=self.connect_args,
            )
            if ok:
                self.finished.emit(True, "命名规范已生成并写入长期记忆。")
            else:
                self.finished.emit(False, "本次未能成功生成命名规范（可能是 schema 获取失败/AI 提取结果为空）。")
        except Exception as e:
            self.error_occurred.emit(str(e))

