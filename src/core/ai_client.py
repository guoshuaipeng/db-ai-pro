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
    
    def generate_sql(self, user_query: str, table_schema: Optional[str] = None, db_type: Optional[str] = None, current_sql: Optional[str] = None, all_table_names: Optional[list] = None) -> str:
        """
        根据用户查询生成SQL
        
        :param user_query: 用户的中文查询
        :param table_schema: 可选的表结构信息
        :param db_type: 可选的数据库类型（mysql, postgresql, oracle, sqlserver, sqlite, mariadb）
        :param current_sql: 当前SQL编辑器中的SQL（可选，如果提供，AI会优先基于此SQL进行修改）
        :param all_table_names: 所有表名列表（可选，用于让AI知道所有可用表）
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
            
            # 如果传入了表名列表，优先使用它（这应该是AI选中的表，而不是所有表）
            # 如果没有传入表名列表，则从表结构中提取
            if all_table_names and len(all_table_names) > 0:
                # 这是AI已经选中的表，只使用这些表生成SQL
                table_names = all_table_names
                self.logger.info(f"使用AI选中的表: {len(table_names)} 个表: {table_names}")
            elif table_schema and table_schema.strip():
                # 从表结构信息中提取所有表名
                table_names = []
                for line in table_schema.split('\n'):
                    if line.startswith('表: '):
                        table_name = line.split('表: ')[1].split(' [')[0].strip()
                        if table_name:
                            table_names.append(table_name)
                
                self.logger.info(f"从表结构中提取到 {len(table_names)} 个表名: {table_names}")
            else:
                table_names = []
                self.logger.warning("⚠️ 没有表名列表，AI可能无法正确选择表")
            
            # 格式化表名列表，每行一个，更清晰
            if table_names:
                table_list_formatted = '\n'.join([f'  - {name}' for name in table_names])
                table_list_single = ', '.join(table_names)
            else:
                # 如果提取不到表名，但表结构不为空，可能是格式问题
                self.logger.warning("⚠️ 无法获取表名列表")
                table_list_formatted = '  (无法获取表名列表，请查看下方表结构信息)'
                table_list_single = '无法获取'
            
            if table_schema and table_schema.strip():
                
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
                
                # 当前SQL部分（如果存在）- 仅作为参考，表名应该使用AI已选中的表
                current_sql_section = ""
                if current_sql and current_sql.strip():
                    current_sql_section = f"""
【当前SQL编辑器中的SQL（仅作为参考）】
{current_sql}

⚠️ 注意：
- 如果用户输入只是修改查询条件（如添加WHERE条件、修改字段等），可以基于当前SQL的结构进行修改
- **但是表名必须使用上述"可用表名列表"中AI已经为你选择的表**，不要使用当前SQL中的表（除非当前SQL中的表也在"可用表名列表"中）"""
                
                user_prompt = f"""【用户需求】
{user_query}{db_type_info}{current_sql_section}
【数据库表结构】
当前数据库包含以下表和列信息：

{table_schema}

【可用表名列表】
以下是AI已经为你选择的相关表名（你生成的SQL必须且只能使用这些表名）：
{table_list_formatted}

⚠️ 重要约束：
- 你生成的SQL中使用的表名必须完全匹配上述列表中的表名
- 这是AI根据你的需求已经选择的相关表，请优先使用这些表
- 绝对不能使用列表外的任何表名
- **列名限制**：你生成的SQL中使用的列名必须完全匹配表结构中列出的列名
- **绝对不能使用表结构中没有的列名**，即使列名看起来合理也不行
- 如果用户描述的列名不在表结构中，请从表结构中选择最相似或最相关的列名

【你的任务】
根据用户需求"{user_query}"，执行以下步骤：
1. **使用AI已选中的表**：上述"可用表名列表"中的表是AI根据你的需求已经选择的相关表，请直接使用这些表
2. 如果当前SQL编辑器中有SQL语句，且用户输入只是修改查询条件（如添加WHERE条件、修改字段等），可以基于当前SQL修改，但表名必须使用"可用表名列表"中的表
3. **仔细查看这些表的列信息**，找到匹配用户需求的列名（必须使用表结构中实际存在的列名）
4. **识别枚举字段**：如果字段信息中包含"[字段值: ...]"，说明该字段可能是枚举类型，请根据字段值推断其含义
5. **使用正确的枚举值**：在WHERE条件中使用枚举字段时，必须使用表结构中显示的字段值
6. 理解用户的具体需求（查询、统计、筛选、排序等）
7. 生成准确的SQL查询语句，确保所有列名和枚举值都来自表结构

【输出要求】
- 只返回SQL语句，不要包含任何解释或注释
- SQL必须可以直接执行
- **重要**：必须使用"可用表名列表"中的表（这是AI已经为你选择的相关表），不要使用列表外的任何表
- **UPDATE/INSERT后添加查询**：如果生成的是UPDATE或INSERT语句，请在后面添加一个SELECT查询语句（用分号分隔），用于查看更新或插入后的数据变化情况
  - 对于UPDATE：添加 `SELECT * FROM 表名 WHERE [使用UPDATE中的WHERE条件]` 来查看更新后的数据
  - 对于INSERT：添加 `SELECT * FROM 表名 WHERE [使用能定位到新插入数据的条件，如主键、唯一字段等]` 来查看插入后的数据
  - 示例：如果生成 `UPDATE users SET status='active' WHERE id=1;`，应该返回 `UPDATE users SET status='active' WHERE id=1;SELECT * FROM users WHERE id=1;`"""
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
    
    def _extract_table_names_from_sql(self, sql: str, available_tables: list) -> list:
        """
        从SQL语句中提取表名
        
        :param sql: SQL语句
        :param available_tables: 可用的表名列表
        :return: 提取到的表名列表
        """
        import re
        
        if not sql or not available_tables:
            return []
        
        # 将SQL转换为大写以便匹配关键字
        sql_upper = sql.upper()
        
        # 提取的表名集合
        extracted_tables = []
        
        # 方法1：使用正则表达式匹配 FROM 和 JOIN 后的表名
        # 匹配 FROM table_name 或 JOIN table_name
        patterns = [
            r'\bFROM\s+[`"\[]?(\w+)[`"\]]?',  # FROM table
            r'\bJOIN\s+[`"\[]?(\w+)[`"\]]?',  # JOIN table
            r'\bINTO\s+[`"\[]?(\w+)[`"\]]?',  # INTO table (INSERT)
            r'\bUPDATE\s+[`"\[]?(\w+)[`"\]]?',  # UPDATE table
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, sql_upper)
            for match in matches:
                # 在可用表名列表中查找（不区分大小写）
                for table in available_tables:
                    if table.upper() == match:
                        if table not in extracted_tables:
                            extracted_tables.append(table)
                        break
        
        # 方法2：直接在SQL中搜索可用的表名（作为补充）
        if not extracted_tables:
            for table in available_tables:
                # 检查表名是否出现在SQL中（使用单词边界，避免部分匹配）
                pattern = r'\b' + re.escape(table) + r'\b'
                if re.search(pattern, sql, re.IGNORECASE):
                    if table not in extracted_tables:
                        extracted_tables.append(table)
        
        return extracted_tables
    
    def _user_query_specifies_table(self, user_query: str, available_tables: list) -> bool:
        """
        判断用户查询是否明确指定了表名
        
        :param user_query: 用户查询
        :param available_tables: 可用的表名列表
        :return: True表示用户明确指定了表名，False表示未指定
        """
        import re
        
        if not user_query or not available_tables:
            return False
        
        user_query_lower = user_query.lower()
        
        # 检查是否包含表名相关的关键词
        table_keywords = ['查询', '查看', '显示', '获取', '统计', '分析']
        table_specifiers = ['表', 'table', '的', '中', '里']
        
        # 如果用户查询中明确提到了某个表名
        for table in available_tables:
            # 检查表名是否出现在用户查询中
            if table.lower() in user_query_lower:
                # 进一步检查是否是在描述表（而不是字段名恰好包含表名）
                # 如果表名前后有"表"、"的"等字眼，更有可能是在指定表
                pattern = r'(' + '|'.join(table_specifiers) + r')\s*' + re.escape(table.lower())
                if re.search(pattern, user_query_lower):
                    return True
                # 或者表名后面跟着"表"
                pattern = re.escape(table.lower()) + r'\s*(' + '|'.join(table_specifiers) + r')'
                if re.search(pattern, user_query_lower):
                    return True
        
        # 如果用户查询非常简短（少于10个字符），并且不包含任何表名，认为是未指定表
        # 例如："查询name字段"、"添加条件"、"只看active的"
        if len(user_query) < 20:
            has_table_mention = False
            for table in available_tables:
                if table.lower() in user_query_lower:
                    has_table_mention = True
                    break
            if not has_table_mention:
                return False
        
        return False
    
    def select_tables(self, user_query: str, table_info_list: list, current_sql: str = None) -> list:
        """
        根据用户查询从表名列表中选择相关的表
        
        :param user_query: 用户的中文查询
        :param table_info_list: 所有可用的表信息列表，格式为 [{"name": "table1", "comment": "注释1"}, ...] 或简单的表名字符串列表（向后兼容）
        :param current_sql: 当前SQL编辑器中的SQL（可选，用于理解用户可能已经在查看某个表）
        :return: 选中的表名列表
        """
        try:
            if not table_info_list:
                self.logger.warning("表信息列表为空，无法选择表")
                return []
            
            client = self._get_client()
            prompt_config = self._get_prompt_config()
            
            # 使用配置的提示词
            system_prompt = prompt_config.select_tables_system
            
            # 处理表信息列表（支持新格式和旧格式）
            table_list_items = []
            table_names_only = []
            
            for item in table_info_list[:500]:  # 限制前500个表
                if isinstance(item, dict):
                    # 新格式：包含表名和注释
                    table_name = item.get("name", "")
                    table_comment = item.get("comment", "")
                    table_names_only.append(table_name)
                    if table_comment:
                        table_list_items.append(f'  - {table_name}  # {table_comment}')
                    else:
                        table_list_items.append(f'  - {table_name}')
                else:
                    # 旧格式：只有表名字符串（向后兼容）
                    table_names_only.append(item)
                    table_list_items.append(f'  - {item}')
            
            # 从当前SQL中提取表名（仅用于在提示词中提示AI，不作为直接返回的依据）
            tables_in_current_sql = []
            if current_sql and current_sql.strip():
                tables_in_current_sql = self._extract_table_names_from_sql(current_sql, table_names_only)
                self.logger.info(f"从当前SQL中提取到的表名: {tables_in_current_sql}")
                
                # 不再直接返回当前SQL中的表，而是让AI从所有表中选择
                # 这样AI可以根据用户查询从所有表中选择最相关的表
                # 例如用户查询"查询支付订单表的数量"时，AI应该选择"支付订单表"而不是当前SQL中的表
            
            # 格式化表名列表（将当前SQL中的表放在前面）
            if tables_in_current_sql:
                # 将当前SQL中的表放在列表最前面
                priority_tables = []
                other_tables = []
                for item in table_list_items:
                    table_name = item.split('#')[0].strip().lstrip('- ').strip()
                    if table_name in tables_in_current_sql:
                        priority_tables.append(f'  - {table_name} 【当前SQL中的表】' + (f'  # {item.split("#")[1]}' if '#' in item else ''))
                    else:
                        other_tables.append(item)
                table_list_items = priority_tables + other_tables
            
            table_list_formatted = '\n'.join(table_list_items)
            table_list_single = ', '.join(table_names_only)
            
            # 如果有当前SQL，添加到提示词中
            current_sql_section = ""
            if current_sql and current_sql.strip():
                current_sql_section = f"""
【当前SQL编辑器中的SQL】
{current_sql}

**重要提示**：用户可能已经在查看某个表的数据，只是想添加一些查询条件或修改查询。请优先使用当前SQL中已经使用的表：{', '.join(tables_in_current_sql) if tables_in_current_sql else '(未检测到表名)'}"""
            
            user_prompt = f"""【用户需求】
{user_query}{current_sql_section}

【可用表名列表】
以下是数据库中所有可用的表名（共 {len(table_info_list)} 个）：
{table_list_formatted}

【你的任务】
根据用户需求"{user_query}"，从上述表名列表中选择最相关的表（通常1-5个表）。
{"**提示**：如果用户需求中明确提到了表名（如\"支付订单表\"、\"用户表\"等），应该优先选择用户需求中提到的表。当前SQL中的表已标记，但如果用户需求明确提到了其他表，应该选择用户需求中提到的表。" if tables_in_current_sql else ""}

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
                # 移除可能的注释部分（如果AI返回了带注释的表名）
                if '#' in line:
                    line = line.split('#')[0].strip()
                # 如果是逗号分隔的，也处理
                if ',' in line:
                    for part in line.split(','):
                        part = part.strip()
                        if part and part in table_names_only:
                            selected_tables.append(part)
                else:
                    # 检查是否是有效的表名
                    if line in table_names_only:
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

