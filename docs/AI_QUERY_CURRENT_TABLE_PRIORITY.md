# AI查询：优先使用SQL编辑器中的表

## 📋 功能说明

在AI查询时，如果SQL编辑器中已有脚本，当用户输入不限定表名时（如"查询name字段"、"添加条件"、"只看active的"），AI会智能地优先使用编辑器中已有的表，而不是重新从数据库的所有表中选择。

这大大提升了用户体验，让用户可以快速对当前正在查看的表进行各种查询操作，而无需每次都明确指定表名。

## 🎯 应用场景

### 场景1：在查看表数据后添加筛选条件

**操作流程**：
1. 用户执行：`SELECT * FROM users`
2. 查看结果后，在AI输入框输入："只看active的用户"
3. **之前**：AI可能会选择其他包含"active"字段的表
4. **现在**：AI直接使用`users`表，生成：`SELECT * FROM users WHERE status = 'active'`

### 场景2：快速添加排序

**操作流程**：
1. 用户执行：`SELECT * FROM orders WHERE date > '2024-01-01'`
2. 在AI输入框输入："按金额倒序排列"
3. **之前**：AI可能重新选择表
4. **现在**：AI直接基于当前SQL修改，生成：`SELECT * FROM orders WHERE date > '2024-01-01' ORDER BY amount DESC`

### 场景3：查询特定字段

**操作流程**：
1. 用户执行：`SELECT * FROM products`
2. 在AI输入框输入："只查询name和price字段"
3. **之前**：AI可能选择其他表
4. **现在**：AI使用当前表，生成：`SELECT name, price FROM products`

## 🔧 技术实现

### 核心逻辑

#### 1. 从SQL中提取表名

在`src/core/ai_client.py`中新增了`_extract_table_names_from_sql()`方法：

```python
def _extract_table_names_from_sql(self, sql: str, available_tables: list) -> list:
    """从SQL语句中提取表名"""
    # 使用正则表达式匹配FROM、JOIN、INTO、UPDATE等关键字后的表名
    patterns = [
        r'\bFROM\s+[`"\[]?(\w+)[`"\]]?',  # FROM table
        r'\bJOIN\s+[`"\[]?(\w+)[`"\]]?',  # JOIN table
        r'\bINTO\s+[`"\[]?(\w+)[`"\]]?',  # INTO table
        r'\bUPDATE\s+[`"\[]?(\w+)[`"\]]?',  # UPDATE table
    ]
    # ... 提取逻辑
```

**支持的SQL格式**：
- 标准表名：`FROM users`
- 带反引号：`FROM `users``
- 带引号：`FROM "users"`
- 带方括号：`FROM [users]`（SQL Server）
- JOIN语句：`FROM orders JOIN customers`
- UPDATE语句：`UPDATE users SET ...`
- INSERT语句：`INSERT INTO users ...`

#### 2. 判断用户查询是否指定表名

在`src/core/ai_client.py`中新增了`_user_query_specifies_table()`方法：

```python
def _user_query_specifies_table(self, user_query: str, available_tables: list) -> bool:
    """判断用户查询是否明确指定了表名"""
    # 检查用户查询中是否明确提到某个表
    # 例如："查询users表"、"查看orders中的数据"
    # 而不是："查询name字段"、"添加条件"
```

**判断规则**：
- ✅ "查询users表" → 指定了表
- ✅ "查看orders中的订单" → 指定了表
- ❌ "查询name字段" → 未指定表
- ❌ "添加条件" → 未指定表
- ❌ "只看active的" → 未指定表

#### 3. 智能表选择逻辑

在`select_tables()`方法中的决策流程：

```python
# 1. 从当前SQL中提取表名
tables_in_current_sql = self._extract_table_names_from_sql(current_sql, table_names_only)

# 2. 如果用户查询未指定表名，且当前SQL中有表，直接使用
if tables_in_current_sql and not self._user_query_specifies_table(user_query, table_names_only):
    return tables_in_current_sql  # 直接返回，不调用AI

# 3. 否则，将当前SQL中的表标记为优先，提交给AI选择
```

### 提示词增强

#### 1. 系统提示词更新

在`src/core/prompts/query_prompts.py`中更新了`SELECT_TABLES_SYSTEM_PROMPT`：

```python
SELECT_TABLES_SYSTEM_PROMPT = """
【你的工作流程】
1. **优先检查当前SQL**：如果提供了当前SQL编辑器中的SQL，先检查其中使用的表
2. 仔细阅读用户的中文需求描述
...

【关键规则】
1. **当前SQL优先原则**：如果当前SQL编辑器中有SQL语句，并且用户需求没有明确指定其他表
   （例如用户只是要求"添加条件"、"查询某个字段"、"筛选数据"等），
   **必须优先选择当前SQL中已经使用的表**
...
```

#### 2. 用户提示词增强

在表名列表中，将当前SQL中的表标记为`【当前SQL中的表】`，让AI更容易识别：

```
【可用表名列表】
  - users 【当前SQL中的表】
  - orders
  - products
  ...
```

## 📊 性能优化

### 直接返回，跳过AI调用

当满足以下条件时，**直接返回表名，不调用AI**：
1. 当前SQL编辑器中有SQL脚本
2. 从SQL中成功提取到表名
3. 用户查询未明确指定其他表名

**优势**：
- ⚡ 响应速度更快（跳过AI调用）
- 💰 节省Token消耗
- 🎯 准确率更高（直接使用用户正在查看的表）

### 测试结果

测试用例验证：
- ✅ 从简单SELECT语句提取表名
- ✅ 从带JOIN的语句提取多个表名
- ✅ 从带反引号/引号的语句提取表名
- ✅ 从UPDATE/INSERT语句提取表名
- ✅ 正确判断用户查询是否指定表名

## 🎨 用户体验改进

### 工作流对比

#### 之前的工作流
```
用户: SELECT * FROM users
[查看结果]
用户: 只看active的
AI: [分析所有表] → 可能选择错误的表 → 生成SQL
```

#### 现在的工作流
```
用户: SELECT * FROM users
[查看结果]
用户: 只看active的
系统: [检测到当前SQL中有users表] → 直接使用users → 生成SQL
```

### 优势总结

1. **更自然的交互**：用户可以像和同事对话一样使用简短指令
2. **更快的响应**：跳过不必要的AI表选择调用
3. **更准确的结果**：直接使用用户正在查看的表，避免选错
4. **更低的成本**：减少不必要的Token消耗

## 🔄 兼容性

### 向后兼容

- ✅ 不影响现有功能
- ✅ 如果SQL编辑器为空，行为与之前完全相同
- ✅ 如果用户明确指定表名，仍然会正常选择对应的表

### 边界情况处理

1. **SQL编辑器为空**：正常进行表选择
2. **无法提取表名**：正常进行表选择
3. **用户明确指定其他表**：使用用户指定的表
4. **提取到多个表**：全部传递给AI，让AI根据用户需求选择

## 📝 代码改动

### 修改的文件

1. **src/core/ai_client.py**
   - 新增：`_extract_table_names_from_sql()` 方法
   - 新增：`_user_query_specifies_table()` 方法
   - 修改：`select_tables()` 方法 - 添加智能表优先逻辑

2. **src/core/prompts/query_prompts.py**
   - 修改：`SELECT_TABLES_SYSTEM_PROMPT` - 增强提示词，强调当前SQL优先原则

3. **README.md** & **README_en.md**
   - 添加：智能表选择功能说明
   - 添加：使用技巧

## 🎯 使用建议

### 最佳实践

1. **快速筛选**：执行`SELECT * FROM table`后，直接输入筛选条件
   ```
   只看status=1的
   筛选出price>100的
   ```

2. **字段选择**：查看全部字段后，指定需要的字段
   ```
   只要name和email字段
   查询id、name、创建时间
   ```

3. **排序和限制**：基于当前查询添加排序和限制
   ```
   按时间倒序
   取前10条
   ```

4. **条件组合**：添加更复杂的条件
   ```
   status是active且创建时间在最近一周内
   价格在100到500之间的
   ```

### 注意事项

- 如果需要查询其他表，明确指定表名：`查询 orders 表`
- 如果AI选择的表不对，可以在查询中明确指定：`在 users 表中查询...`

## 📈 未来改进

- [ ] 支持更复杂的SQL解析（子查询、CTE等）
- [ ] 记住用户最近查看的表，作为表选择的参考
- [ ] 支持从SQL注释中提取上下文信息
- [ ] 支持多表JOIN场景的智能识别

## 🔗 相关文档

- [AI模型使用说明](./AI_MODEL_USAGE.md)
- [AI模型当前使用](./AI_MODEL_CURRENT_USAGE.md)

---

**版本**: v1.2.0  
**日期**: 2024-12-12  
**作者**: codeyG

