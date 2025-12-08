"""
AI客户端，用于生成SQL查询
"""
import logging
from typing import Optional
from openai import OpenAI
from src.core.prompt_config import PromptStorage


logger = logging.getLogger(__name__)


class AIClient:
    """AI客户端，用于生成SQL查询"""
    
    def __init__(self, api_key: str = None, base_url: str = None, default_model: str = "qwen-plus", turbo_model: str = "qwen-turbo"):
        """
        初始化AI客户端
        
        :param api_key: API密钥（如果为None，将从配置中加载）
        :param base_url: API基础URL（如果为None，将使用默认URL）
        :param default_model: 默认模型名称
        :param turbo_model: Turbo模型名称
        """
        if api_key is None:
            # 从配置中加载
            from src.core.ai_model_storage import AIModelStorage
            storage = AIModelStorage()
            model_config = storage.get_default_model()
            if model_config:
                self.api_key = model_config.api_key.get_secret_value()
                self.base_url = model_config.get_base_url()
                self.default_model = model_config.default_model
                self.turbo_model = model_config.turbo_model
                self._current_model_id = model_config.id
            else:
                raise ValueError("未配置AI模型，请在菜单中配置AI模型")
        else:
            self.api_key = api_key
            self.base_url = base_url or "https://dashscope.aliyuncs.com/compatible-mode/v1"
            self.default_model = default_model
            self.turbo_model = turbo_model
            self._current_model_id = None  # 如果直接传入api_key，无法确定模型ID
        
        self._client = None
        self.logger = logging.getLogger(f"{__name__}.AIClient")
        self._prompt_storage = PromptStorage()
        self._prompt_config = None
    
    def _get_client(self):
        """懒加载OpenAI客户端"""
        if self._client is None:
            try:
                self._client = OpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                )
                self.logger.info(f"AI模型初始化成功: {self.base_url}")
            except Exception as e:
                self.logger.error(f"初始化AI模型失败: {e}")
                raise
        
        return self._client
    
    def _get_prompt_config(self):
        """懒加载提示词配置"""
        if self._prompt_config is None:
            self._prompt_config = self._prompt_storage.load_prompts()
        return self._prompt_config
    
    def _record_token_usage(self, response, model_id: str = None):
        """记录token使用情况"""
        if not hasattr(response, 'usage') or not response.usage:
            self.logger.debug("Response没有usage属性，跳过token统计")
            return
        
        try:
            from src.core.ai_token_stats import TokenStatsStorage
            # 使用传入的model_id，如果没有则使用当前模型的ID
            target_model_id = model_id or self._current_model_id
            
            # 如果还是没有，尝试通过api_key查找对应的模型ID
            if not target_model_id:
                from src.core.ai_model_storage import AIModelStorage
                storage = AIModelStorage()
                models = storage.load_models()
                # 通过api_key匹配模型（需要解密比较）
                for model in models:
                    try:
                        if model.api_key.get_secret_value() == self.api_key:
                            target_model_id = model.id
                            self._current_model_id = model.id  # 缓存起来
                            break
                    except:
                        continue
            
            if not target_model_id:
                self.logger.warning("无法确定模型ID，跳过token统计")
                return
            
            prompt_tokens = getattr(response.usage, 'prompt_tokens', 0)
            completion_tokens = getattr(response.usage, 'completion_tokens', 0)
            
            if prompt_tokens > 0 or completion_tokens > 0:
                token_storage = TokenStatsStorage()
                token_storage.add_usage(target_model_id, prompt_tokens, completion_tokens)
                self.logger.info(f"已记录Token使用: 模型ID={target_model_id}, 输入={prompt_tokens}, 输出={completion_tokens}, 总计={prompt_tokens + completion_tokens}")
            else:
                self.logger.debug(f"Token使用为0，跳过记录: 模型ID={target_model_id}")
        except Exception as e:
            self.logger.warning(f"记录Token使用情况失败: {str(e)}", exc_info=True)
    
    def generate_sql(self, user_query: str, table_schema: Optional[str] = None, db_type: Optional[str] = None, current_sql: Optional[str] = None) -> str:
        """
        根据用户查询生成SQL
        
        :param user_query: 用户的中文查询
        :param table_schema: 可选的表结构信息
        :param db_type: 可选的数据库类型（mysql, postgresql, oracle, sqlserver, sqlite, mariadb）
        :param current_sql: 当前SQL编辑器中的SQL（可选，如果提供，AI会优先基于此SQL进行修改）
        :return: 生成的SQL语句
        """
        try:
            # 记录接收到的参数
            self.logger.info(f"generate_sql 被调用，user_query: {user_query[:100] if user_query else 'None'}")
            self.logger.info(f"table_schema 是否为空: {not table_schema or not table_schema.strip()}, 长度: {len(table_schema) if table_schema else 0}")
            if table_schema and table_schema.strip():
                self.logger.info(f"table_schema 前1000字符:\n{table_schema[:1000]}")
            else:
                self.logger.warning("⚠️ table_schema 为空或只包含空白字符，AI将无法使用表结构信息！")
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 使用配置的提示词
            system_prompt = prompt_config.generate_sql_system
            
            # 添加数据库类型信息到系统提示词
            if db_type:
                db_type_name_map = {
                    "mysql": "MySQL",
                    "mariadb": "MariaDB",
                    "postgresql": "PostgreSQL",
                    "oracle": "Oracle",
                    "sqlserver": "SQL Server",
                    "sqlite": "SQLite",
                }
                db_type_name = db_type_name_map.get(db_type.lower(), db_type)
                system_prompt += f"\n\n【重要】当前数据库类型: {db_type_name}\n请根据 {db_type_name} 的SQL语法规范生成SQL语句，注意不同数据库的语法差异（如字符串引号、日期函数、分页语法等）。"
            
            if table_schema and table_schema.strip():
                # 从表结构信息中提取所有表名
                table_names = []
                for line in table_schema.split('\n'):
                    if line.startswith('表: '):
                        table_name = line.split('表: ')[1].split(' [')[0].strip()
                        if table_name:
                            table_names.append(table_name)
                
                self.logger.info(f"从表结构中提取到 {len(table_names)} 个表名: {table_names}")
                
                # 格式化表名列表，每行一个，更清晰
                if table_names:
                    table_list_formatted = '\n'.join([f'  - {name}' for name in table_names])
                    table_list_single = ', '.join(table_names)
                else:
                    # 如果提取不到表名，但表结构不为空，可能是格式问题
                    self.logger.warning("⚠️ 无法从表结构中提取表名，但表结构不为空，可能是格式问题")
                    table_list_formatted = '  (无法提取表名，请查看下方表结构信息)'
                    table_list_single = '无法提取'
                
                # 构建清晰的用户提示词
                db_type_info = ""
                if db_type:
                    db_type_name_map = {
                        "mysql": "MySQL",
                        "mariadb": "MariaDB",
                        "postgresql": "PostgreSQL",
                        "oracle": "Oracle",
                        "sqlserver": "SQL Server",
                        "sqlite": "SQLite",
                    }
                    db_type_name = db_type_name_map.get(db_type.lower(), db_type)
                    db_type_info = f"\n【数据库类型】\n当前数据库类型: {db_type_name}\n请使用 {db_type_name} 的SQL语法规范。\n"
                
                # 当前SQL部分（如果存在）
                current_sql_section = ""
                if current_sql and current_sql.strip():
                    current_sql_section = f"""
【当前SQL编辑器中的SQL（优先使用）】
{current_sql}

⚠️ 重要规则：
1. 如果当前SQL编辑器中有SQL语句，请优先基于此SQL进行修改和完善，而不是生成全新的SQL
2. 如果用户输入没有明确指定表名（只指定了列名、查询条件或操作），请使用当前SQL中的表
3. 例如：如果当前SQL是 `SELECT * FROM users`，用户输入"查询name字段"或"添加where条件"，应该基于当前SQL修改，生成 `SELECT name FROM users` 或添加WHERE条件，而不是查找其他表
4. 用户可能只是想添加条件、修改字段或调整查询逻辑，请保持使用当前SQL中的表"""
                
                user_prompt = f"""【用户需求】
{user_query}{db_type_info}{current_sql_section}
【数据库表结构】
当前数据库包含以下表和列信息：

{table_schema}

【可用表名列表】
以下是数据库中所有可用的表名（你生成的SQL必须且只能使用这些表名）：
{table_list_formatted}

⚠️ 重要约束：
- 你生成的SQL中使用的表名必须完全匹配上述列表中的表名
- 如果用户描述的表名不在列表中，请从列表中选择最相似或最相关的表
- 绝对不能使用列表外的任何表名
- **列名限制**：你生成的SQL中使用的列名必须完全匹配表结构中列出的列名
- **绝对不能使用表结构中没有的列名**，即使列名看起来合理也不行
- 如果用户描述的列名不在表结构中，请从表结构中选择最相似或最相关的列名

【你的任务】
根据用户需求"{user_query}"，执行以下步骤：
1. **优先判断**：如果当前SQL编辑器中有SQL语句，且用户输入没有明确指定表名（只指定了列名、查询条件或操作），请优先使用当前SQL中的表
2. 如果当前SQL中没有表或用户明确指定了其他表名，则查看"可用表名列表"，找出与用户需求最相关的表（可以是1个或多个）
3. **仔细查看这些表的列信息**，找到匹配用户需求的列名（必须使用表结构中实际存在的列名）
4. **识别枚举字段**：如果字段信息中包含"[字段值: ...]"，说明该字段可能是枚举类型，请根据字段值推断其含义
5. **使用正确的枚举值**：在WHERE条件中使用枚举字段时，必须使用表结构中显示的字段值
6. 理解用户的具体需求（查询、统计、筛选、排序等）
7. 生成准确的SQL查询语句，确保所有列名和枚举值都来自表结构

【输出要求】
- **只返回一条SQL语句**，不要生成多条SQL
- 只返回SQL语句，不要包含任何解释或注释
- SQL必须可以直接执行
- 如果查询可能返回大量数据，请添加LIMIT限制
- **重要**：如果当前SQL编辑器中有SQL，请基于该SQL进行修改，而不是生成全新的SQL"""
            else:
                # 表结构为空的情况
                self.logger.warning("⚠️ 表结构为空，无法为AI提供数据库表信息")
                
                # 当前SQL部分（如果存在）
                current_sql_section = ""
                if current_sql and current_sql.strip():
                    current_sql_section = f"""
【当前SQL编辑器中的SQL（优先使用）】
{current_sql}

⚠️ 重要：如果当前SQL编辑器中有SQL语句，请优先基于此SQL进行修改和完善，而不是生成全新的SQL。"""
                
                user_prompt = f"""【用户需求】
{user_query}{current_sql_section}

【任务】
请生成对应的SQL查询语句。如果涉及表名或列名，请使用常见的命名（如users, orders, id, name, created_at等）。

【注意事项】
- **只返回一条SQL语句**，不要生成多条SQL
- 仔细理解用户意图，生成最符合需求的SQL
- 确保SQL语法正确，可以直接执行
- 如果当前SQL编辑器中有SQL，请基于该SQL进行修改"""
            
            # 记录发送给AI的完整内容（用于调试）
            self.logger.info("=" * 80)
            self.logger.info("发送给AI的完整提示词:")
            self.logger.info("=" * 80)
            self.logger.info(f"【系统提示词】\n{system_prompt}")
            self.logger.info("-" * 80)
            self.logger.info(f"【用户提示词】\n{user_prompt}")
            self.logger.info("=" * 80)
            
            # 调用AI生成SQL
            # 使用默认模型（更准确，因为这是最终输出）
            response = client.chat.completions.create(
                model=self.default_model,  # 使用配置的默认模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,  # 进一步降低随机性，生成更准确的SQL
                top_p=0.9,  # 控制生成的多样性
            )
            
            # 记录token使用情况
            self._record_token_usage(response)
            
            sql = response.choices[0].message.content.strip()
            
            # 清理SQL（移除可能的markdown代码块标记）
            if sql.startswith("```sql"):
                sql = sql[6:]
            elif sql.startswith("```"):
                sql = sql[3:]
            if sql.endswith("```"):
                sql = sql[:-3]
            sql = sql.strip()
            
            # 如果AI返回了多条SQL（用分号分隔），只取第一条
            if ';' in sql:
                # 按分号分割，取第一条非空SQL
                sql_parts = [s.strip() for s in sql.split(';') if s.strip()]
                if sql_parts:
                    original_sql = sql
                    sql = sql_parts[0]
                    self.logger.warning(f"AI返回了多条SQL，只使用第一条")
                    self.logger.info(f"原始返回: {original_sql}")
                    if len(sql_parts) > 1:
                        self.logger.info(f"其他SQL被忽略: {sql_parts[1:]}")
            
            # 记录AI返回的完整内容
            self.logger.info("-" * 80)
            self.logger.info(f"AI返回的原始内容:\n{response.choices[0].message.content}")
            self.logger.info("-" * 80)
            self.logger.info(f"清理后的SQL: {sql}")
            self.logger.info("=" * 80)
            
            return sql
            
        except Exception as e:
            self.logger.error(f"生成SQL失败: {str(e)}")
            raise Exception(f"AI生成SQL失败: {str(e)}")
    
    def select_tables(self, user_query: str, table_names: list, current_sql: str = None) -> list:
        """
        根据用户查询从表名列表中选择相关的表
        
        :param user_query: 用户的中文查询
        :param table_names: 所有可用的表名列表
        :param current_sql: 当前SQL编辑器中的SQL（可选，用于理解用户可能已经在查看某个表）
        :return: 选中的表名列表
        """
        try:
            if not table_names:
                self.logger.warning("表名列表为空，无法选择表")
                return []
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 使用配置的提示词
            system_prompt = prompt_config.select_tables_system
            
            # 格式化表名列表
            table_list_formatted = '\n'.join([f'  - {name}' for name in table_names[:500]])  # 限制前500个表
            table_list_single = ', '.join(table_names[:500])
            
            # 如果有当前SQL，添加到提示词中
            current_sql_section = ""
            if current_sql and current_sql.strip():
                current_sql_section = f"""
【当前SQL编辑器中的SQL】
{current_sql}

**重要提示**：用户可能已经在查看某个表的数据，只是想添加一些查询条件。请优先考虑当前SQL中已经使用的表。"""
            
            user_prompt = f"""【用户需求】
{user_query}{current_sql_section}

【可用表名列表】
以下是数据库中所有可用的表名（共 {len(table_names)} 个）：
{table_list_formatted}

【你的任务】
根据用户需求"{user_query}"，从上述表名列表中选择最相关的表（通常1-5个表）。
{"如果当前SQL中已经使用了某些表，请优先选择这些表。" if current_sql and current_sql.strip() else ""}

【输出要求】
只返回选中的表名，每行一个，不要包含任何解释或注释。"""
            
            self.logger.info("=" * 80)
            self.logger.info("发送给AI选择表的提示词:")
            self.logger.info("=" * 80)
            self.logger.info(f"【系统提示词】\n{system_prompt}")
            self.logger.info("-" * 80)
            self.logger.info(f"【用户提示词】\n{user_prompt}")
            self.logger.info("=" * 80)
            
            # 调用AI选择表
            response = client.chat.completions.create(
                model=self.turbo_model,  # 使用配置的turbo模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                top_p=0.9,
            )
            
            # 记录token使用情况
            self._record_token_usage(response)
            
            selected_text = response.choices[0].message.content.strip()
            
            self.logger.info(f"AI返回的原始内容:\n{selected_text}")
            
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
                        if part and part in table_names:
                            selected_tables.append(part)
                else:
                    # 检查是否是有效的表名
                    if line in table_names:
                        selected_tables.append(line)
            
            # 去重
            selected_tables = list(dict.fromkeys(selected_tables))
            
            self.logger.info(f"解析后的选中表名: {selected_tables}")
            self.logger.info("=" * 80)
            
            return selected_tables
            
        except Exception as e:
            self.logger.error(f"AI选择表失败: {str(e)}")
            # 如果AI选择失败，返回空列表，后续会使用所有表
            return []
    
    def select_enum_columns(self, user_query: str, table_schema: str) -> tuple[dict, bool]:
        """
        根据用户查询和表结构，选择可能是枚举的字段，并判断是否需要查询枚举值
        
        :param user_query: 用户的中文查询
        :param table_schema: 表结构信息
        :return: 元组 (enum_columns, should_query)
            - enum_columns: 字典，key为表名，value为该表中可能是枚举的列名列表
            - should_query: 布尔值，True表示需要查询枚举值，False表示不需要
        """
        try:
            if not table_schema or not table_schema.strip():
                self.logger.warning("表结构为空，无法选择枚举字段")
                return {}, False
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 使用配置的提示词，并添加判断是否需要查询的逻辑
            system_prompt = prompt_config.select_enum_columns_system
            
            user_prompt = f"""【用户需求】
{user_query}

【数据库表结构】
{table_schema}

【你的任务】
1. 识别哪些字段可能是枚举类型
2. 判断在生成SQL查询时，是否需要查询这些枚举字段的具体值

【判断是否需要查询枚举值的标准】
只有在以下情况下，才需要查询枚举字段的值：
- 用户的查询条件中明确涉及枚举字段（如：查询状态为"激活"的用户、查找类型为"VIP"的订单等）
- 需要在WHERE条件中使用枚举字段的具体值

不需要查询枚举值的情况：
- 用户只是查询数据，不涉及枚举字段的过滤条件
- 用户查询的是统计信息、聚合数据（如：COUNT、SUM、AVG等）
- 用户查询的是所有数据，没有WHERE条件
- 枚举字段不在查询条件中使用

【输出格式】
请按照以下格式输出，分为两部分：

【枚举字段】
表名.列名
表名.列名
...

【是否需要查询枚举值】
需要 或 不需要

示例：
【枚举字段】
users.status
orders.state

【是否需要查询枚举值】
需要"""
            
            self.logger.info("=" * 80)
            self.logger.info("发送给AI选择枚举字段并判断是否需要查询的提示词:")
            self.logger.info("=" * 80)
            self.logger.info(f"【系统提示词】\n{system_prompt}")
            self.logger.info("-" * 80)
            self.logger.info(f"【用户提示词】\n{user_prompt}")
            self.logger.info("=" * 80)
            
            # 调用AI选择枚举字段并判断是否需要查询
            response = client.chat.completions.create(
                model=self.turbo_model,  # 使用配置的turbo模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                top_p=0.9,
            )
            
            # 记录token使用情况
            self._record_token_usage(response)
            
            response_text = response.choices[0].message.content.strip()
            
            self.logger.info(f"AI返回的原始内容:\n{response_text}")
            
            # 解析返回的内容
            enum_columns = {}  # {table_name: [column_names]}
            should_query = False  # 默认不需要查询
            
            # 分离枚举字段部分和判断部分
            lines = response_text.split('\n')
            in_enum_section = False
            in_judgment_section = False
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # 检查是否进入枚举字段部分
                if '【枚举字段】' in line or '枚举字段' in line:
                    in_enum_section = True
                    in_judgment_section = False
                    continue
                
                # 检查是否进入判断部分
                if '【是否需要查询枚举值】' in line or '是否需要查询' in line:
                    in_enum_section = False
                    in_judgment_section = True
                    continue
                
                # 解析枚举字段
                if in_enum_section:
                    # 移除可能的列表标记
                    line = line.lstrip('- •*1234567890. ').strip()
                    # 检查格式是否为 "表名.列名"
                    if '.' in line:
                        parts = line.split('.', 1)
                        if len(parts) == 2:
                            table_name = parts[0].strip()
                            column_name = parts[1].strip()
                            if table_name and column_name:
                                if table_name not in enum_columns:
                                    enum_columns[table_name] = []
                                if column_name not in enum_columns[table_name]:
                                    enum_columns[table_name].append(column_name)
                
                # 解析判断结果
                if in_judgment_section:
                    line_lower = line.lower()
                    if '需要' in line_lower or 'yes' in line_lower or 'true' in line_lower:
                        should_query = True
                        break
            
            # 如果没有找到明确的判断部分，尝试从整个文本中查找
            if not in_judgment_section:
                response_lower = response_text.lower()
                if '需要' in response_lower or 'yes' in response_lower or 'true' in response_lower:
                    # 检查上下文，确保是判断结果
                    if '查询' in response_lower or 'query' in response_lower:
                        should_query = True
            
            self.logger.info(f"解析后的枚举字段: {enum_columns}")
            self.logger.info(f"是否需要查询枚举值: {should_query}")
            self.logger.info("=" * 80)
            
            return enum_columns, should_query
            
        except Exception as e:
            self.logger.error(f"AI选择枚举字段并判断失败: {str(e)}")
            # 如果失败，返回空字典和False（不查询枚举值，避免性能问题）
            return {}, False
    
    def should_query_enum_values(self, user_query: str, enum_columns: dict, table_schema: str) -> bool:
        """
        判断是否需要查询枚举字段的值
        
        :param user_query: 用户的中文查询
        :param enum_columns: 已识别的枚举字段 {table_name: [column_names]}
        :param table_schema: 表结构信息
        :return: True表示需要查询枚举值，False表示不需要
        """
        try:
            # 如果没有枚举字段，直接返回False
            if not enum_columns or not any(enum_columns.values()):
                self.logger.info("没有枚举字段，不需要查询枚举值")
                return False
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 构建枚举字段列表
            enum_fields_list = []
            for table_name, columns in enum_columns.items():
                for column_name in columns:
                    enum_fields_list.append(f"{table_name}.{column_name}")
            enum_fields_text = "\n".join(enum_fields_list)
            
            system_prompt = """你是一个专业的数据库助手。你的任务是判断在生成SQL查询时，是否需要查询枚举字段的具体值。

【枚举字段查询的必要性】
只有在以下情况下，才需要查询枚举字段的值：
1. 用户的查询条件中明确涉及枚举字段（如：查询状态为"激活"的用户、查找类型为"VIP"的订单等）
2. 需要在WHERE条件中使用枚举字段的具体值
3. 用户查询中提到了枚举字段可能的值（如：状态、类型、级别等）

【不需要查询枚举值的情况】
1. 用户只是查询数据，不涉及枚举字段的过滤条件
2. 用户查询的是统计信息、聚合数据（如：COUNT、SUM、AVG等）
3. 用户查询的是所有数据，没有WHERE条件
4. 枚举字段不在查询条件中使用

【判断原则】
- 如果用户的查询条件中会用到枚举字段的值，返回"需要"
- 如果用户的查询只是展示数据或统计，不涉及枚举字段过滤，返回"不需要"
- 如果不确定，返回"不需要"（因为查询枚举值比较耗时）

【输出格式】
只返回"需要"或"不需要"，不要包含任何其他文字。"""
            
            user_prompt = f"""【用户需求】
{user_query}

【已识别的枚举字段】
{enum_fields_text}

【你的任务】
判断在生成SQL查询时，是否需要查询这些枚举字段的具体值。

请分析用户的查询需求，判断是否会在WHERE条件中使用枚举字段的值。
如果用户的查询条件中会用到枚举字段的值（如：WHERE status = 'active'），返回"需要"。
如果用户的查询只是展示数据或统计，不涉及枚举字段过滤，返回"不需要"。

只返回"需要"或"不需要"。"""
            
            self.logger.info("=" * 80)
            self.logger.info("发送给AI判断是否需要查询枚举值的提示词:")
            self.logger.info("=" * 80)
            self.logger.info(f"【系统提示词】\n{system_prompt}")
            self.logger.info("-" * 80)
            self.logger.info(f"【用户提示词】\n{user_prompt}")
            self.logger.info("=" * 80)
            
            # 调用AI判断
            response = client.chat.completions.create(
                model=self.turbo_model,  # 使用配置的turbo模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                top_p=0.9,
            )
            
            # 记录token使用情况
            self._record_token_usage(response)
            
            result_text = response.choices[0].message.content.strip().lower()
            
            self.logger.info(f"AI返回的判断结果: {result_text}")
            
            # 判断结果
            if "需要" in result_text or "yes" in result_text or "true" in result_text:
                self.logger.info("AI判断：需要查询枚举值")
                return True
            else:
                self.logger.info("AI判断：不需要查询枚举值")
                return False
            
        except Exception as e:
            self.logger.error(f"AI判断是否需要查询枚举值失败: {str(e)}")
            # 如果失败，默认返回False（不查询枚举值，避免性能问题）
            self.logger.warning("判断失败，默认不查询枚举值（避免性能问题）")
            return False
    
    def parse_connection_config(self, config_text: str) -> dict:
        """
        解析数据库连接配置信息
        
        :param config_text: 用户粘贴的配置信息（可能是YAML、Properties、JDBC URL等格式）
        :return: 解析后的连接参数字典，包含 db_type, host, port, database, username, password
        """
        try:
            if not config_text or not config_text.strip():
                self.logger.warning("配置文本为空，无法解析")
                return {}
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 使用配置的提示词
            system_prompt = prompt_config.parse_connection_config_system
            
            user_prompt = f"""【配置信息】
{config_text}

【你的任务】
请从上述配置信息中提取数据库连接参数，并以JSON格式返回。"""
            
            self.logger.info("=" * 80)
            self.logger.info("发送给AI解析连接配置的提示词:")
            self.logger.info("=" * 80)
            self.logger.info(f"【系统提示词】\n{system_prompt}")
            self.logger.info("-" * 80)
            self.logger.info(f"【用户提示词】\n{user_prompt}")
            self.logger.info("=" * 80)
            
            # 调用AI解析配置
            response = client.chat.completions.create(
                model=self.turbo_model,  # 使用配置的turbo模型
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                top_p=0.9,
            )
            
            # 记录token使用情况
            self._record_token_usage(response)
            
            result_text = response.choices[0].message.content.strip()
            
            self.logger.info(f"AI返回的原始内容:\n{result_text}")
            
            # 尝试解析JSON
            import json
            import re
            
            # 尝试提取JSON部分（可能包含在markdown代码块中）
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', result_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(0)
            else:
                json_str = result_text
            
            # 清理可能的markdown代码块标记
            if json_str.startswith("```json"):
                json_str = json_str[7:]
            elif json_str.startswith("```"):
                json_str = json_str[3:]
            if json_str.endswith("```"):
                json_str = json_str[:-3]
            json_str = json_str.strip()
            
            # 解析JSON
            try:
                config_dict = json.loads(json_str)
                self.logger.info(f"解析后的配置: {config_dict}")
                self.logger.info("=" * 80)
                return config_dict
            except json.JSONDecodeError as e:
                self.logger.error(f"JSON解析失败: {str(e)}, 原始内容: {json_str}")
                return {}
            
        except Exception as e:
            self.logger.error(f"AI解析连接配置失败: {str(e)}")
            return {}

