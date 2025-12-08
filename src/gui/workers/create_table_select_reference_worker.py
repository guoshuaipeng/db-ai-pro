"""
AI选择参考表工作线程（用于新建表功能）
"""
from PyQt6.QtCore import QThread, pyqtSignal
import logging
from typing import List

logger = logging.getLogger(__name__)


class CreateTableSelectReferenceWorker(QThread):
    """AI选择参考表工作线程（从所有表名中选择与建表需求匹配度高的前5个表）"""
    
    tables_selected = pyqtSignal(list)  # 选中的表名列表
    error_occurred = pyqtSignal(str)  # 错误信号
    
    def __init__(self, ai_client, user_query: str, table_names: List[str]):
        super().__init__()
        self.ai_client = ai_client
        self.user_query = user_query
        self.table_names = table_names
        self._should_stop = False
    
    def stop(self):
        """安全停止线程"""
        self._should_stop = True
        self.requestInterruption()
    
    def run(self):
        """执行AI选择参考表（在工作线程中运行）"""
        try:
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            logger.info(f"CreateTableSelectReferenceWorker: 开始选择参考表，用户查询: {self.user_query[:100]}")
            logger.info(f"CreateTableSelectReferenceWorker: 可用表数量: {len(self.table_names)}")
            
            if not self.table_names:
                logger.warning("CreateTableSelectReferenceWorker: 表名列表为空")
                self.tables_selected.emit([])
                return
            
            # 从配置中加载提示词
            from src.core.prompt_config import PromptStorage
            prompt_storage = PromptStorage()
            prompt_config = prompt_storage.load_prompts()
            system_prompt = prompt_config.create_table_select_reference_tables_system
            
            # 构建用户提示词
            user_prompt = f"""【用户想要创建的表的需求描述】
{self.user_query}

【可用的表名列表】
{chr(10).join(self.table_names)}

【你的任务】
根据用户想要创建的表的需求描述，从上述表名列表中选择最相关、匹配度最高的表作为参考（最多选择5个表）。
这些表将作为参考，帮助AI生成与现有表结构风格一致的建表语句。"""
            
            # 调用AI选择表
            from openai import OpenAI
            
            client = OpenAI(
                api_key=self.ai_client.api_key,
                base_url=self.ai_client.base_url
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            response = client.chat.completions.create(
                model=self.ai_client.turbo_model,  # 使用turbo模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                top_p=0.9,
            )
            
            if self.isInterruptionRequested() or self._should_stop:
                return
            
            selected_text = response.choices[0].message.content.strip()
            
            logger.info(f"CreateTableSelectReferenceWorker: AI返回的原始内容:\n{selected_text}")
            
            # 解析返回的表名
            selected_tables = []
            # 尝试按行分割
            lines = selected_text.split('\n')
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                # 移除可能的列表标记（如 "- ", "• ", "1. " 等）
                line = line.lstrip('- •*1234567890. ').strip()
                # 如果是逗号分隔的，也处理
                if ',' in line:
                    for part in line.split(','):
                        part = part.strip()
                        if part and part in self.table_names:
                            selected_tables.append(part)
                else:
                    # 检查是否是有效的表名
                    if line in self.table_names:
                        selected_tables.append(line)
            
            # 去重并限制为最多5个
            selected_tables = list(dict.fromkeys(selected_tables))[:5]
            
            logger.info(f"CreateTableSelectReferenceWorker: 解析后的选中表名: {selected_tables}")
            
            # 发送选中的表
            self.tables_selected.emit(selected_tables)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"AI选择参考表失败: {error_msg}")
            # 如果失败，返回空列表
            self.tables_selected.emit([])
        finally:
            self.quit()

