# AI模型使用场景说明

本文档说明在不同场景下使用的AI模型类型。

## 模型类型

系统配置了两个模型：
- **default_model** (默认模型，如 `qwen-plus`)：用于需要高准确性的场景
- **turbo_model** (快速模型，如 `qwen-turbo`)：用于快速响应的辅助场景

## 使用场景详细说明

### 1. 生成SQL查询语句 ✅ **使用 default_model**

**场景**：用户在SQL编辑器中输入中文需求，AI生成SQL语句

**位置**：`src/core/ai_client.py` → `generate_sql()`

**原因**：这是最终输出，需要高准确性，确保生成的SQL正确可执行

**调用链**：
```
SQL编辑器 → AIWorker → AIClient.generate_sql() → default_model
```

---

### 2. 选择相关表 ✅ **使用 turbo_model**

**场景**：从所有表名列表中选择与用户需求相关的表（通常1-5个）

**位置**：`src/core/ai_client.py` → `select_tables()`

**原因**：这是辅助步骤，只需要快速筛选，不需要最终输出

**调用链**：
```
SQL编辑器 → AITableSelectorWorker → AIClient.select_tables() → turbo_model
```

---

### 3. 选择枚举字段并判断是否需要查询 ✅ **使用 turbo_model**

**场景**：识别表结构中的枚举字段，并判断在生成SQL时是否需要查询枚举值

**位置**：`src/core/ai_client.py` → `select_enum_columns()`

**原因**：这是辅助判断步骤，快速响应即可

**调用链**：
```
SQL编辑器 → AIEnumSelectorWorker → AIClient.select_enum_columns() → turbo_model
```

---

### 4. 判断是否需要查询枚举值 ✅ **使用 turbo_model**

**场景**：根据用户查询需求，判断是否需要在WHERE条件中使用枚举字段的值

**位置**：`src/core/ai_client.py` → `should_query_enum_values()`

**原因**：这是辅助判断步骤，快速响应即可

**调用链**：
```
SQL编辑器 → AIEnumJudgeWorker → AIClient.should_query_enum_values() → turbo_model
```

---

### 5. 解析数据库连接配置 ✅ **使用 turbo_model**

**场景**：用户粘贴数据库配置信息（YAML、Properties、JDBC URL等），AI解析提取连接参数

**位置**：`src/core/ai_client.py` → `parse_connection_config()`

**原因**：这是辅助解析步骤，快速响应即可

**调用链**：
```
连接对话框 → ConnectionParseWorker → AIClient.parse_connection_config() → turbo_model
```

---

### 6. 生成建表语句 ✅ **使用 default_model**

**场景**：在"新建表"功能中，根据用户需求和参考表结构生成CREATE TABLE语句

**位置**：`src/gui/workers/create_table_ai_worker.py`

**原因**：这是最终输出，需要高准确性，确保生成的SQL语法正确

**调用链**：
```
新建表界面 → CreateTableAIWorker → default_model
```

---

### 7. 选择参考表（新建表功能） ✅ **使用 turbo_model**

**场景**：在"新建表"功能中，从所有表中选择与建表需求匹配度高的前5个表作为参考

**位置**：`src/gui/workers/create_table_select_reference_worker.py`

**原因**：这是辅助选择步骤，快速响应即可

**调用链**：
```
新建表界面 → CreateTableSelectReferenceWorker → turbo_model
```

---

### 8. 生成修改表语句 ✅ **使用 default_model**

**场景**：在"编辑表"功能中，根据用户需求和当前表结构生成ALTER TABLE语句

**位置**：`src/gui/workers/edit_table_ai_worker.py`

**原因**：这是最终输出，需要高准确性，确保生成的SQL语法正确

**调用链**：
```
编辑表界面 → EditTableAIWorker → default_model
```

---

## 总结

### 使用 default_model 的场景（需要高准确性）
1. ✅ 生成SQL查询语句
2. ✅ 生成建表语句
3. ✅ 生成修改表语句

### 使用 turbo_model 的场景（快速响应）
1. ✅ 选择相关表
2. ✅ 选择枚举字段
3. ✅ 判断是否需要查询枚举值
4. ✅ 解析数据库连接配置
5. ✅ 选择参考表（新建表功能）

## 设计原则

- **最终输出** → 使用 `default_model`（高准确性）
- **辅助步骤** → 使用 `turbo_model`（快速响应）

这样设计的好处：
- 在保证最终输出质量的同时，提高整体响应速度
- 降低Token使用成本（turbo模型通常更便宜）
- 优化用户体验（辅助步骤快速完成）

