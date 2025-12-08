"""
AI生成修改表语句工作线程
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class EditTableAIWorker(QThread):
    """AI生成修改表语句工作线程"""
    
    sql_generated = pyqtSignal(str)  # SQL生成完成信号
    error_occurred = pyqtSignal(str)  # 错误信号
    
    def __init__(self, ai_client, conversation_history: List[Dict], database: str = None, 
                 table_name: str = None, current_table_schema: str = "", current_sql: str = "", db_type: str = None):
        super().__init__()
        self.ai_client = ai_client
        self.conversation_history = conversation_history
        self.database = database
        self.table_name = table_name
        self.current_table_schema = current_table_schema  # 当前表结构
        self.current_sql = current_sql  # 当前的修改语句
        self.db_type = db_type  # 数据库类型
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI生成修改表语句（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            # 从配置中加载提示词
            from src.core.prompt_config import PromptStorage
            prompt_storage = PromptStorage()
            prompt_config = prompt_storage.load_prompts()
            system_prompt = prompt_config.edit_table_generate_sql_system
            
            # 添加数据库类型信息到系统提示词
            if self.db_type:
                db_type_name_map = {
                    "mysql": "MySQL",
                    "mariadb": "MariaDB",
                    "postgresql": "PostgreSQL",
                    "oracle": "Oracle",
                    "sqlserver": "SQL Server",
                    "sqlite": "SQLite",
                }
                db_type_name = db_type_name_map.get(self.db_type.lower(), self.db_type)
                system_prompt += f"\n\n【重要】当前数据库类型: {db_type_name}\n请根据 {db_type_name} 的SQL语法规范生成ALTER TABLE语句，注意不同数据库的语法差异（如字段修改语法、约束语法等）。"
            
            # 构建用户提示词（包含对话历史）
            conversation_text = "\n".join([
                f"{'用户' if msg['role'] == 'user' else 'AI'}: {msg['content']}"
                for msg in self.conversation_history[-10:]  # 只使用最近10条消息
            ])
            
            # 构建用户提示词
            table_schema_section = ""
            if self.current_table_schema and self.current_table_schema.strip():
                table_schema_section = f"""
【当前表结构】
{self.current_table_schema}"""
            
            current_sql_section = ""
            if self.current_sql and self.current_sql.strip():
                current_sql_section = f"""
【当前的修改语句】
{self.current_sql}

如果用户要求修改或补充，请基于上述当前的修改语句进行修改和完善。"""
            
            db_type_info = ""
            if self.db_type:
                db_type_name_map = {
                    "mysql": "MySQL",
                    "mariadb": "MariaDB",
                    "postgresql": "PostgreSQL",
                    "oracle": "Oracle",
                    "sqlserver": "SQL Server",
                    "sqlite": "SQLite",
                }
                db_type_name = db_type_name_map.get(self.db_type.lower(), self.db_type)
                db_type_info = f"\n数据库类型: {db_type_name}\n请使用 {db_type_name} 的SQL语法规范。"
            
            user_prompt = f"""【对话历史】
{conversation_text}

【当前数据库】
数据库名: {self.database if self.database else '未指定'}{db_type_info}

【要修改的表】
表名: {self.table_name}{table_schema_section}{current_sql_section}

【你的任务】
根据上述对话历史，生成完整的ALTER TABLE语句来修改表结构。如果用户只是补充或修改，请基于之前的对话或当前的修改语句生成完整的ALTER TABLE语句。
请确保生成的ALTER TABLE语句语法正确，可以直接执行。"""
            
            # 调用AI生成SQL
            from openai import OpenAI
            
            client = OpenAI(
                api_key=self.ai_client.api_key,
                base_url=self.ai_client.base_url
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            response = client.chat.completions.create(
                model=self.ai_client.default_model,  # 使用默认模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            sql = response.choices[0].message.content.strip()
            
            # 清理SQL（移除可能的markdown代码块标记）
            if sql.startswith("```sql"):
                sql = sql[6:]
            elif sql.startswith("```"):
                sql = sql[3:]
            if sql.endswith("```"):
                sql = sql[:-3]
            sql = sql.strip()
            
            # 发送结果
            self.sql_generated.emit(sql)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI生成修改表语句失败: {error_msg}")
            self.error_occurred.emit(error_msg)
        finally:
            self.quit()

