# 全量 AI 改造：基于 LangGraph 的技术方案

## 1. 目标与范围

### 1.1 目标

将当前所有与 AI 交互的链路，从**多 Worker + 信号串联**或**单次 AIClient 调用**统一改为 **LangGraph 状态图**驱动，实现：

- **流程可编排**：各场景的步骤（选表、拉 schema、选枚举、生成 SQL/命令/配置等）用图结构清晰表达，支持条件分支与重试。
- **状态集中**：每个场景的输入、中间结果、输出和错误统一在对应 State 中，便于扩展和观测。
- **可扩展**：新增节点或分支（如校验、多轮澄清）只需改图，不必改散落各处的 Worker 与回调。

### 1.2 范围（全量）

- **查询**：SQL 编辑器「AI 输入框 → 直接查询」—— 选表 → 拉表结构 → 枚举识别/拉取 → 生成 SQL（→ 可选校验/重试）。
- **建表**：新建表多轮对话 —— 选参考表 → 拉参考表结构 → 根据对话历史生成 CREATE TABLE。
- **改表**：编辑表结构 —— 根据当前表结构 + 对话历史生成 ALTER TABLE（→ 可选校验/重试）。
- **Redis**：自然语言生成 Redis 命令 —— 根据用户输入 + 可用 key 列表生成命令（→ 可选校验/重试）。
- **连接解析**：从粘贴文本解析连接配置 —— 提取连接参数并输出 JSON（→ 可选校验/修正）。

上述五类 AI 交互**全部**用 LangGraph 图驱动，统一由各场景对应的 Worker 内 `graph.invoke(initial_state)` 执行，信号与 UI 契约保持不变。

---

## 2. 现状简要分析

### 2.1 当前流程概览

| 场景 | 当前流程 | LLM 调用次数 | 串联方式 |
|------|----------|---------------|----------|
| **查询** | 选表 → 拉 schema → 选枚举/拉枚举值 → 生成 SQL | 3 | 多 Worker + 信号槽 |
| **建表** | 选参考表 → 拉参考 schema → 生成 CREATE TABLE | 2 | 多 Worker + 信号槽 |
| **改表** | 生成 ALTER TABLE（对话历史 + 当前表结构） | 1 | 单 Worker |
| **Redis** | 生成 Redis 命令（user_query + key 列表） | 1 | 内嵌 Worker |
| **连接解析** | 从粘贴文本解析为连接 JSON | 1 | 同步 AIClient 调用 |

### 2.2 查询（现状）

```
用户输入自然语言
  → AITableSelectorWorker → select_tables() → selected_tables
  → SchemaWorker → table_schema
  → [若配置允许] AIEnumSelectorWorker → select_enum_columns() → 查枚举值 → table_schema 增强
  → AIWorker → generate_sql() → sql
  → DDL 检查 → 写入编辑器 / 自动执行
```

痛点：流程分散在多个回调和成员变量，无校验重试闭环。

### 2.3 建表（现状）

```
用户多轮对话（每轮追加到 conversation_history）
  → CreateTableSelectReferenceWorker → 选参考表（LLM）
  → SchemaWorker → 拉参考表结构
  → CreateTableAIWorker → 根据 conversation_history + reference_schema + current_sql 生成 CREATE TABLE（LLM）
  → 仅返回 SQL，写入建表 Tab / 执行
```

现状已有「多轮对话」输入，但每轮**只返回 SQL**，无自然语言回复；且流程分散在多 Worker，中间状态在 create_table_tab 内维护。

### 2.4 改表（现状）

```
用户多轮对话 + 当前表结构（每轮追加到 conversation_history）
  → EditTableAIWorker → 每轮一次 LLM，根据 history + current_sql 生成 ALTER TABLE
  → 仅返回 SQL，写入编辑表 Tab / 执行
```

现状支持多轮输入，但每轮**只返回 SQL**，无自然语言回复；单 Worker 单次 LLM，扩展重试/校验需改 Worker。

### 2.5 Redis（现状）

```
用户输入 + available_keys
  → 内嵌 RedisAIWorker → ai_client.generate_redis_command()
  → 写入命令框 / 执行
```

痛点：单点调用，无校验或重试。

### 2.6 连接解析（现状）

```
用户粘贴配置文本
  → connection_dialog 内同步调用 ai_client.parse_connection_config(config_text)
  → 解析 JSON → 回填表单
```

痛点：同步阻塞 UI（若网络慢）；无「解析失败再修正」的闭环。

### 2.7 共性痛点

- 流程分散在多个 Worker 和回调里，状态散落（`_temp_*`、成员变量）。
- 条件分支（是否查枚举、是否重试）难以统一表达。
- 各场景模式不统一（有的多步、有的单步），维护成本高。

---

## 3. LangGraph 方案设计（总则）

- **每个场景一个图**：查询、建表、改表、Redis、连接解析各对应一个 StateGraph，状态 TypedDict 独立，节点内复用现有 `AIClient` 与 prompt_config。
- **执行入口统一**：各场景仍由对应 **QThread Worker** 发起；Worker 内 `graph.invoke(initial_state)`，从 state 取结果或 error，通过现有信号回传 UI，**不改变 UI 契约**。
- **非 LLM 步骤**：拉表结构、查枚举值、查 Redis key 等仍在节点内调用现有 DB/Redis 逻辑（或抽成可注入 service）。

以下 3.x 为**查询**的详细设计；4、5、6、7 节分别为建表、改表、Redis、连接解析的图与状态设计。

---

## 3A. 查询（Query）图设计

### 3A.1 思路概述

- 用 **StateGraph** 定义「查询用」的一个图：节点 = 选表、拉 schema、选枚举、拉枚举值、生成 SQL、校验 SQL，边 = 顺序 + 条件分支。
- **状态** 集中在一份 `QueryGraphState` 中；Worker 内一次 `invoke` 跑完整图。

### 3A.2 状态定义（State）

建议使用 **TypedDict**（或 Pydantic BaseModel），便于与 LangGraph 的 reducer 兼容。示例：

```python
from typing import TypedDict, Optional, List, Dict, Any

class QueryGraphState(TypedDict, total=False):
    # 输入（由调用方注入）
    user_query: str
    table_info_list: List[Any]          # [{"name": "t1", "comment": "..."}, ...]
    db_type: Optional[str]
    current_sql: Optional[str]
    config_query_enum: bool              # 是否允许查询枚举值（来自 prompt_config）

    # 中间结果
    selected_tables: List[str]
    table_schema: str
    enum_columns: Dict[str, List[str]]   # {table: [col1, col2]}
    should_query_enum: bool
    table_schema_with_enum: str         # 拼好枚举值后的表结构，供 generate_sql 用

    # 输出
    generated_sql: str
    sql_type: str                        # AI 直接返回："SELECT" | "INSERT" | "UPDATE" | "DELETE" | "OTHER"
    error: Optional[str]

    # 控制/可观测
    current_step: str
    retry_count: int                     # 可选：校验失败重试次数
```

- `total=False` 表示所有键可选，节点只返回需要更新的字段。
- 若使用 reducer（如对 `error` 做覆盖），在 StateGraph 构造时指定即可。
- **`sql_type`** 由 AI 在 `generate_sql` 节点中一并返回，UI 不需要再用 `startswith("SELECT")` 之类的字符串硬判断；AI 比代码更懂「这是查询还是修改」。

### 3A.3 图结构（Tool-calling Agent 版本）✅ 已实现

**旧版**：固定多步流水线，AI 串联多个节点，每步都调用一次 LLM。  
**新版（当前实现）**：极简 3 节点 + Tool-calling Agent，AI 自主决策。

```
START
  → recall_memory        # 从 SQLite 召回用户历史记忆，注入 memory_context（无 LLM）
  → agent_sql            # ★ Tool-calling Agent：AI 自主决定调用哪些工具，最终输出 SQL
  → [条件] 有 error → END
  → write_memory         # 将成功查询写入长期记忆（无 LLM）
  → END
```

**agent_sql 内部自主循环**（最多 6 轮）：

```
AI 收到 [系统提示 + 数据库概览 + 历史记忆 + 用户问题]
  ↓ AI 决策 → 直接返回 JSON {sql_type, sql}？
    ↓ 是 → 循环结束
    ↓ 否 → AI 调用工具（可选）
           ├── search_relevant_tables(query)    # 从所有表中找相关表
           ├── get_table_schema(table_names)   # 获取指定表的完整字段结构
           └── get_enum_values(columns)        # 获取枚举列的实际值
         ↓ Python 执行工具，结果回传给 AI
  ↓ AI 再次决策（循环继续或输出 SQL）
```

**AI 决策示例**：

| 用户输入 | AI 决策 | 工具调用 |
|---|---|---|
| `SELECT * FROM users WHERE id=1` | 直接返回 | 0 次 |
| `查询 users 表今天的数据` | 直接查结构 | `get_table_schema(["users"])` |
| `帮我查下单量最高的用户` | 先搜表再查结构 | `search_relevant_tables` → `get_table_schema` |
| `查询状态为已完成的订单` | 查结构+枚举值 | `get_table_schema` → `get_enum_values` |

**优势**：
- 简单查询 0 工具调用，速度媲美直接 API 调用
- 复杂查询 AI 自主获取所有需要的上下文，不遗漏
- 彻底消灭固定流水线的「多余步骤」

### 3A.7 AI 同时返回 SQL 与语句类型（sql_type）

**问题背景**：当前代码在 `on_sql_generated` 回调中用 `sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", ...))`  
手动判断「查询类」还是「增删改类」，以决定是否自动执行。这种判断写在代码里，不准确（如 `WITH ... SELECT` 或多语句无法正确识别），也没必要——**生成 SQL 的 AI 本身最清楚这是什么类型**。

**改造方式**：在 `generate_sql` 节点中，修改发给 AI 的提示词，要求 AI 以 **JSON 格式**返回，同时输出 SQL 和类型，便于节点直接 `json.loads()` 解析，不再做字符串拆分。

**提示词约定（JSON 输出格式）**：

```
【输出格式】
只返回如下 JSON，不要有任何额外文字、解释或 markdown 代码块：

{
  "sql_type": "<类型>",
  "sql": "<SQL语句>"
}

其中 sql_type 必须是以下枚举值之一：
- "SELECT"：查询语句（含 SHOW、DESC、EXPLAIN 等只读操作）
- "INSERT"：插入数据
- "UPDATE"：更新数据
- "DELETE"：删除数据
- "OTHER"：其他（如多语句、DDL 等）

示例：
{
  "sql_type": "SELECT",
  "sql": "SELECT * FROM users WHERE status = 'active'"
}

多语句示例：
{
  "sql_type": "UPDATE",
  "sql": "UPDATE users SET status='active' WHERE id=1;\nSELECT * FROM users WHERE id=1;"
}
```

**节点内解析**：

```python
import json, re

def parse_ai_sql_response(raw: str) -> tuple[str, str]:
    """从 AI 返回的 JSON 中提取 sql 和 sql_type，兼容 markdown 代码块包裹的情况"""
    # 去除可能的 ```json ... ``` 包裹
    text = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    sql = data.get("sql", "").strip()
    sql_type = data.get("sql_type", "OTHER").upper()
    return sql, sql_type
```

`generate_sql` 节点调用上述解析函数，分别写入 `state["generated_sql"]` 和 `state["sql_type"]`。

**UI 使用**：Worker 通过信号把 `generated_sql` 和 `sql_type` 一起回传；UI 直接读 `sql_type` 来决定是否自动执行、显示什么提示——**代码里不再有任何 `startswith` 判断**。

```python
# 改造前（代码里硬判断，容易误判）
sql_upper = sql.strip().upper()
is_query = sql_upper.startswith(("SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"))

# 改造后（直接读 AI 给的 JSON 字段，准确可靠）
is_query = sql_type == "SELECT"
```

**JSON 格式的优势**：
- 解析标准，不需要自定义分隔符解析逻辑
- 即使 SQL 内部包含换行、特殊字符也不影响解析
- 便于后续扩展（如 AI 同时返回 `summary`、`affected_tables` 等更多元信息）
- JSON 解析失败时有明确异常，可写入 `state["error"]` 触发重试

### 3A.4 LLM 与现有 AIClient 的衔接

- LangGraph 的节点是普通 Python 函数，**不强制**用 LangChain 的 LCEL。
- 节点内继续使用现有 **OpenAI 兼容 client**（即当前 `AIClient._get_client()` 与 `chat.completions.create`），无需替换为 LangChain 的 ChatOpenAI（若希望统一，可再包一层 LangChain 的 OpenAI 兼容封装，由配置 base_url/api_key 注入）。
- 提示词仍从现有 **prompt_config**（如 `generate_sql_system`、`select_tables_system`、`select_enum_columns_system`）读取，节点内调 `PromptStorage().load_prompts()` 即可，保持与设置界面一致。

### 3A.5 与 GUI 的对接方式（保持现有 Worker 契约）

- **入口不变**：用户点击「直接查询」或回车，仍由 `sql_editor` 触发 `generate_sql_from_ai()`；若需要先选表再跑图，可保留「先 AITableSelectorWorker 再后续」的入口，但**后续整段改为一次 LangGraph 调用**；或改为「整条链路都进图」（表列表也作为 state 输入，由图的第一个节点拿）。
- **推荐**：整条链路进图。即：
  - 在「准备阶段」仍由当前逻辑拿到 `table_info_list`、`db_type`、`current_sql`、`config_query_enum`、`user_query`；
  - 然后创建 **一个** Worker（如 `QueryLangGraphWorker`），传入上述 state 初始值；
  - Worker 内：`state = graph.invoke(initial_state)`，跑完后从 `state["generated_sql"]`、`state["sql_type"]` 或 `state["error"]` 发出 `sql_generated(sql, sql_type)` / `error_occurred`。
- 这样，**原有 AIWorker、AITableSelectorWorker、AIEnumSelectorWorker 等在此链路上的调用都可以收拢到图内**，UI 只和一个 Worker 交互，步骤进度可通过 state 的 `current_step` 或 stream 暴露到状态栏（可选）。

### 3A.6 依赖与运行环境

- 新增依赖：`langgraph`（必选）、可选 `langchain-core` 若要用其 OpenAI 封装。
- Python 版本与现有一致（>=3.8）；若 LangGraph 对 3.12+ 有更好支持，可保持现状。
- 图执行在 **QThread** 内同步 `invoke`，不阻塞主线程；若 LangGraph 提供异步 `ainvoke`，且希望少占线程，可再考虑在 Worker 内用 asyncio.run(ainvoke(...))，需注意与 PyQt 事件循环的兼容性。

---

## 4. 建表（Create Table）图设计

### 4.1 状态定义

```python
class CreateTableGraphState(TypedDict, total=False):
    # 输入（多轮由 UI 每次传入完整 history + 上一轮 SQL）
    conversation_history: List[Dict[str, str]]  # [{"role":"user"/"assistant","content":"..."}]
    database: Optional[str]
    db_type: Optional[str]
    all_table_names: List[str]                  # 当前库所有表名（供选参考表）
    current_sql: str                            # 上一轮已生成的建表 SQL，供本轮「基于此修改」

    # 中间结果
    reference_tables: List[str]                 # AI 选出的参考表
    reference_schema: str                        # 拉取到的参考表结构
    generated_sql: str                          # 本轮生成的完整建表 SQL
    assistant_message: str                      # 可选：本轮 AI 的自然语言回复（用于对话气泡）
    error: Optional[str]
    current_step: str
```

### 4.2 图结构

```
START
  → select_reference_tables   # LLM：从 all_table_names 中选与需求最相关的前若干表
  → fetch_reference_schema    # 按 reference_tables 拉表结构（无 LLM）
  → generate_create_table    # LLM：conversation_history + reference_schema + current_sql → CREATE TABLE
  → [可选] validate_ddl      # 语法/表名冲突等检查，失败可重试
  → END
```

- **select_reference_tables**：封装现有「选参考表」逻辑（原 CreateTableSelectReferenceWorker），写 `reference_tables`；若无表可选可写 `error` 并 END。
- **fetch_reference_schema**：同步拉取 `reference_tables` 的结构，写 `reference_schema`。
- **generate_create_table**：封装现有 CreateTableAIWorker 内的一次 LLM 调用（提示词来自 `create_table_generate_sql_system`），写 `generated_sql`；**多轮时**可同时产出 `assistant_message`（见 4.3）。

### 4.3 多轮交互（建表）

建表场景是**多轮对话**，而不是「用户说一句 → 只返回一条 SQL」：

- **每轮流程**：用户在当前轮输入一句话（如「创建一个用户表，要有 id、name、created_at」或「再加一个 status 字段，默认 active」）→ UI 将本条**追加**到 `conversation_history`，并把上一轮 AI 产出的 `current_sql` 带入 state → 启动 Worker，执行图 → 图返回本轮的 `generated_sql`（及可选的 `assistant_message`）→ UI 把「用户本条」和「AI 本条回复」都追加到对话历史，并更新展示的 SQL。
- **状态在 UI 侧累积**：`conversation_history` 由 UI 维护并每次 invoke 时完整传入；图内只读该历史 + `current_sql`（上一轮生成的建表语句），生成本轮的 CREATE TABLE。这样用户可以说「先建个用户表」→ 得到 SQL → 再说「加个头像字段」「把 name 改成 100 长度」等，逐轮细化。
- **首轮与后续轮**：首轮通常没有 `current_sql`，图会从对话中理解需求并生成完整建表语句；后续轮把上一轮的 `generated_sql` 作为下一轮的 `current_sql` 传入，提示词中要求「基于当前建表语句修改/补充」。
- **AI 回复内容**：除 `generated_sql` 外，可增加 `assistant_message`（自然语言），例如「已根据你的要求添加了 status 字段，默认值 'active'。当前建表语句如下。」便于在对话气泡中展示，而 SQL 区域单独显示可执行的 `generated_sql`。生成节点可让 LLM 一次输出「简短说明 + SQL」（用约定分隔或 JSON），再在节点内拆成 `assistant_message` 与 `generated_sql`。

### 4.4 与 GUI 对接

- 建表 Tab：**每次用户发送一条消息**时，用当前**完整** `conversation_history`、上一轮得到的 `current_sql`、以及 database/db_type/all_table_names 构建 `CreateTableGraphState`，启动 **CreateTableLangGraphWorker**；Worker 内 `create_table_graph.invoke(state)`，从 state 取 `generated_sql`、可选 `assistant_message`、或 `error`，通过 `sql_generated` / `error_occurred`（及可选 `message_received`）回传。
- UI 在收到结果后：将本轮用户消息与 AI 回复（`assistant_message` 或「生成的 SQL」摘要）追加到对话历史并刷新对话区；将 `generated_sql` 写入 SQL 预览/编辑区，并作为下一轮的 `current_sql`。
- 原 **CreateTableSelectReferenceWorker + SchemaWorker + CreateTableAIWorker** 收拢为同一图；**多轮**由 UI 多次 invoke + 累积 history 实现。

---

## 5. 改表（Edit Table）图设计

### 5.1 状态定义

```python
class EditTableGraphState(TypedDict, total=False):
    # 输入（多轮由 UI 每次传入完整 history + 上一轮 ALTER SQL）
    conversation_history: List[Dict[str, str]]
    database: Optional[str]
    table_name: Optional[str]
    current_table_schema: str    # 当前表结构（可随轮次更新为「执行后的结构」）
    current_sql: str             # 上一轮已生成的 ALTER 语句，供本轮「基于此再改」
    db_type: Optional[str]

    # 输出
    generated_sql: str           # 本轮生成的 ALTER TABLE
    assistant_message: str       # 可选：本轮 AI 的自然语言回复（用于对话气泡）
    error: Optional[str]
    current_step: str
    retry_count: int            # 可选：校验失败重试
```

### 5.2 图结构

```
START
  → generate_alter_table     # LLM：对话历史 + 当前表结构 + current_sql → ALTER TABLE
  → [可选] validate_alter    # 检查语法/列存在性等，失败写 error 并决定是否重试
  → END
```

- **generate_alter_table**：封装现有 EditTableAIWorker 内的一次 LLM 调用（`edit_table_generate_sql_system`），写 `generated_sql`；多轮时可同时产出 `assistant_message`（见 5.3）。
- **validate_alter**（可选）：可调用现有或新增的 DDL 校验逻辑，失败时增加 `retry_count` 并将错误信息写入 state，条件边回到 `generate_alter_table` 或 END。

### 5.3 多轮交互（改表）

改表场景同样是**多轮对话**，而不是单次「用户说一句 → 只返回一条 ALTER」：

- **每轮流程**：用户输入一句修改意图（如「加一个 status 字段」「把 name 改成 varchar(100)」「删除 created_at 的默认值」）→ UI 将该条**追加**到 `conversation_history`，并把上一轮的 `current_sql`（以及当前表结构 `current_table_schema`）带入 state → 启动 Worker，执行图 → 图返回本轮的 `generated_sql` 与可选的 `assistant_message` → UI 更新对话区与 SQL 预览，并将本轮 `generated_sql` 作为下一轮的 `current_sql`。
- **状态在 UI 侧累积**：对话历史由 UI 维护；若用户在某轮执行了 ALTER，表结构已变，下一轮传入的 `current_table_schema` 应为执行后的最新结构（可从库中重新拉取），以便 AI 基于「当前真实结构」继续改。
- **首轮与后续轮**：首轮无 `current_sql` 时，AI 根据「当前表结构 + 用户第一句话」生成一条 ALTER；后续轮在提示词中明确「基于当前修改语句/当前表结构继续修改」。
- **AI 回复内容**：与建表一致，可增加 `assistant_message`（如「已添加 status 字段并设置默认值，ALTER 如下。」），便于在对话气泡中展示；SQL 区域单独展示可执行的 `generated_sql`。

### 5.4 与 GUI 对接

- 编辑表 Tab：**每次用户发送一条消息**时，用当前**完整** `conversation_history`、上一轮 `current_sql`、当前表结构 `current_table_schema` 等构建 `EditTableGraphState`，启动 **EditTableLangGraphWorker**；Worker 内执行图，从 state 取 `generated_sql`、可选 `assistant_message`、或 `error`，通过 `sql_generated` / `error_occurred`（及可选 `message_received`）回传。
- UI 在收到结果后：将本轮用户消息与 AI 回复追加到对话历史，更新 SQL 预览；若用户执行了本轮的 ALTER，可刷新表结构供下一轮使用。原 **EditTableAIWorker** 替换为图执行；**多轮**由 UI 多次 invoke + 累积 history 实现。

---

## 6. Redis 命令生成图设计

### 6.1 状态定义

```python
class RedisCommandGraphState(TypedDict, total=False):
    # 输入
    user_query: str
    available_keys: List[str]   # 可选，当前库/模式的 key 列表

    # 输出
    generated_command: str
    error: Optional[str]
    current_step: str
    retry_count: int            # 可选
```

### 6.2 图结构

```
START
  → generate_redis_command   # LLM：user_query + available_keys → Redis 命令
  → [可选] validate_command   # 简单格式/危险命令检查，失败可重试
  → END
```

- **generate_redis_command**：封装现有 `ai_client.generate_redis_command(...)`，写 `generated_command`。
- **validate_command**（可选）：检查非修改类命令、SCAN 用法等，失败可带反馈重试。

### 6.3 与 GUI 对接

- Redis 视图点击「AI 生成」：构建 `RedisCommandGraphState`，启动 **RedisCommandLangGraphWorker**，完成后通过现有 `command_generated` / `error_occurred` 回传，原内嵌 RedisAIWorker 改为调用图。

---

## 7. 连接解析（Parse Connection Config）图设计

### 7.1 状态定义

```python
class ParseConnectionGraphState(TypedDict, total=False):
    # 输入
    config_text: str            # 用户粘贴的 YAML/Properties/JDBC 等

    # 输出
    parsed_config: dict         # 连接参数字典
    error: Optional[str]
    current_step: str
    retry_count: int            # 解析/JSON 失败时重试
```

### 7.2 图结构

```
START
  → parse_config              # LLM：从 config_text 提取连接参数，输出 JSON
  → normalize_json            # 提取并解析 JSON，写 parsed_config；失败写 error
  → [条件] parse_failed && retry_count < N ? → parse_config
  → END
```

- **parse_config**：封装现有 `ai_client.parse_connection_config(...)`，但节点只负责调用 LLM 并写原始文本到 state，或直接写解析后的 dict（与现有一致）。
- **normalize_json**：无 LLM，从 LLM 输出中抽 JSON、清洗、json.loads，失败时写 `error` 并可选择重试（把「期望字段缺失」等反馈给 parse_config 再调一次）。

### 7.3 与 GUI 对接

- **建议改为异步**：连接对话框点击「AI 解析」时，启动 **ParseConnectionLangGraphWorker**（QThread），Worker 内 `graph.invoke(state)`，完成后通过信号把 `parsed_config` 或 `error` 回填表单，避免同步阻塞 UI。若保留同步调用，仍可在主线程 invoke，仅不推荐。

---

## 8. 记忆系统设计（Memory）

### 8.1 记忆的三个层次

| 层次 | 范围 | 存储位置 | 说明 |
|------|------|----------|------|
| **会话记忆** | 当前会话内 | State 的 `conversation_history` | 已有，多轮对话上下文 |
| **跨会话记忆（短期）** | 当前连接/库 | LangGraph Checkpointer（SQLite） | 关闭再打开软件，对话历史仍在 |
| **长期记忆（用户画像）** | 所有连接/库 | 独立 `memory_store`（SQLite 表） | 从历史中提炼的用户偏好、命名习惯、常用模式 |

---

### 8.2 跨会话记忆：LangGraph Checkpointer

LangGraph 内置 `SqliteSaver` / `PostgresSaver`，可按 `thread_id` 持久化每次 invoke 后的完整 state，下次用同一 `thread_id` invoke 时自动恢复上一次的对话上下文。

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# 初始化（复用 config_db 的 SQLite 路径即可）
checkpointer = SqliteSaver.from_conn_string("path/to/config.db")

# 编译图时挂上 checkpointer
graph = create_table_graph.compile(checkpointer=checkpointer)

# 每次 invoke 传入 thread_id（建议：连接ID + 库名 + 场景，如 "conn1:mydb:create_table"）
config = {"configurable": {"thread_id": thread_id}}
state = graph.invoke(initial_state, config=config)
```

**thread_id 设计建议**：

| 场景 | thread_id |
|------|-----------|
| 查询（每次独立） | `f"{conn_id}:{database}:query:{uuid}"` |
| 建表（同一表可连续对话） | `f"{conn_id}:{database}:create_table"` |
| 改表（按表名区分） | `f"{conn_id}:{database}:edit_table:{table_name}"` |
| Redis 命令 | `f"{conn_id}:redis:command:{uuid}"` |

- **查询**场景每次新开对话（uuid 唯一），不跨轮累积历史（每次从头生成 SQL）。
- **建表/改表**场景使用固定 thread_id，软件重启后打开同一表继续上次的对话。

---

### 8.3 长期记忆：用户画像与偏好存储

跨会话的「用户画像」存储在一个独立的 `memory_store` 中（可复用现有 `config_db` 的 SQLite，新增若干表），内容包括：

#### 8.3.1 记忆类型

```
memory_store
  ├── naming_conventions      # 命名规范（表前缀、字段命名风格、主键命名等）
  ├── type_preferences        # 字段类型偏好（如总用 BIGINT 作主键、VARCHAR(255) 等）
  ├── frequent_queries        # 高频查询模式（如「查最近30天订单」）
  ├── table_usage             # 常用表与使用频率
  └── correction_feedback     # 用户手动纠正过的 SQL（AI 生成错了、用户改正了）
```

#### 8.3.2 Schema 设计

```sql
-- 命名规范记忆（每个连接/库维度）
CREATE TABLE memory_naming_conventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    database_name TEXT,
    pattern TEXT NOT NULL,          -- 规律描述，如 "表名使用 t_ 前缀"
    examples TEXT,                  -- JSON 数组，举例说明
    confidence REAL DEFAULT 1.0,    -- 置信度，随使用强化
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 高频查询模式
CREATE TABLE memory_query_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    database_name TEXT,
    user_intent TEXT NOT NULL,      -- 用户意图描述（如"查最近订单"）
    generated_sql TEXT NOT NULL,    -- 曾经成功生成的 SQL
    used_tables TEXT,               -- JSON 数组，涉及的表
    use_count INTEGER DEFAULT 1,    -- 使用次数，越高越优先召回
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户纠正记录（AI 生成的 SQL 被用户手动改了）
CREATE TABLE memory_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    database_name TEXT,
    user_query TEXT NOT NULL,       -- 原始用户意图
    ai_sql TEXT NOT NULL,           -- AI 生成的 SQL（错误的）
    corrected_sql TEXT NOT NULL,    -- 用户纠正后的 SQL
    correction_note TEXT,           -- 可选：用户说明原因
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 8.4 记忆的读写：图中增加两个节点

在各场景图中（尤其是**查询**和**建表/改表**），增加两个节点：

```
START
  → recall_memory              # 【新增】从 memory_store 召回相关记忆，注入 state
  → ... (原有节点) ...
  → generate_sql / generate_create_table / generate_alter_table
  → ... (原有节点) ...
  → END
  → [异步/图外] write_memory   # 【新增】图执行成功后，将本轮信息写入 memory_store
```

#### 8.4.1 `recall_memory` 节点（无 LLM）

从 `memory_store` 中查询与当前连接/库/用户意图相关的记忆，拼成 `memory_context` 字符串，写入 state：

```python
def recall_memory(state: QueryGraphState) -> dict:
    """召回与当前意图相关的记忆，注入 state"""
    memory_store = MemoryStore(connection_id=state["connection_id"],
                               database=state.get("database"))
    context_parts = []

    # 1. 命名规范（若有）
    conventions = memory_store.get_naming_conventions()
    if conventions:
        context_parts.append("【该库历史命名规范】\n" + "\n".join(conventions))

    # 2. 相似意图的历史成功 SQL
    patterns = memory_store.search_query_patterns(state["user_query"], top_k=3)
    if patterns:
        context_parts.append("【相似历史查询参考】\n" +
                              "\n".join(f"- 意图: {p.intent}\n  SQL: {p.sql}" for p in patterns))

    # 3. 历史纠正记录（最近N条）
    corrections = memory_store.get_recent_corrections(limit=3)
    if corrections:
        context_parts.append("【用户曾纠正的错误模式】\n" +
                              "\n".join(f"- 错误: {c.ai_sql}\n  正确: {c.corrected_sql}" for c in corrections))

    return {"memory_context": "\n\n".join(context_parts)}
```

`memory_context` 注入到 `generate_sql` 节点的提示词（系统提示词末尾追加）：

```
【用户历史记忆（优先参考）】
{memory_context}
```

#### 8.4.2 `write_memory` 节点（无 LLM，异步）

图执行成功、Worker 拿到结果后（或在图的 END 节点触发），将本轮信息写入 `memory_store`：

- 记录本轮「用户意图 + 生成的 SQL + 涉及的表」到 `memory_query_patterns`（`use_count` 累加）。
- 若 UI 检测到「用户手动修改了 SQL 后执行」，额外写一条 `memory_corrections`，告知 AI 下次同类意图要避免同样错误。
- 定期（如每100次写入后）触发「记忆蒸馏」节点（可选 LLM），从 `memory_query_patterns` 中提炼「命名规范」写入 `memory_naming_conventions`，使 AI 越用越懂该库的风格。

---

### 8.5 记忆蒸馏：定期提炼用户画像

可设计一个独立的「蒸馏图」（`MemoryDistillationGraph`），由后台定时任务或在特定事件（如积累了 N 条历史）触发，让 LLM 分析历史记录并提炼出更高层次的规律：

```
START
  → load_history         # 从 memory_store 加载近期历史（查询模式、纠正记录）
  → distill_conventions  # LLM：从历史中归纳命名规范、字段类型偏好等规律
  → save_conventions     # 将归纳的规律写入 memory_naming_conventions
  → END
```

蒸馏提示词示例：

```
以下是用户在该数据库中历史生成并使用的 SQL 语句（用户确认正确的）：
{history_sqls}

请从中归纳该数据库的命名规范和设计风格，用简洁的自然语言描述（不超过10条），例如：
- 所有表以 t_ 开头
- 主键字段命名为 id，类型 BIGINT AUTO_INCREMENT
- 时间字段统一为 created_at、updated_at，类型 DATETIME
- 状态字段命名为 status，值使用数字枚举（0=禁用, 1=启用）
```

---

### 8.6 与现有 config_db 的集成

- `memory_store` 不独立开新文件，直接在现有 `config_db`（SQLite）中新增上述几张表即可，与连接配置、AI 模型配置等复用同一存储。
- `MemoryStore` 封装为 `src/core/memory_store.py`，对外提供 `recall()`、`write()`、`distill()` 等方法，供各图节点调用。
- LangGraph Checkpointer 也直接使用 `config_db` 的 SQLite 连接（可指定不同的表前缀 `lg_checkpoint_*`，与业务表区分）。

---

### 8.7 越用越聪明的实现路径

1. **第1次使用**：无记忆，AI 只靠当前库表结构和提示词生成 SQL。
2. **积累10次**：recall 节点开始召回相似历史 SQL，AI 可参考「上次你问类似问题时成功的 SQL」。
3. **用户纠正若干次**：`memory_corrections` 中记录了错误模式，AI 在相同场景下规避同类错误。
4. **积累50次**：蒸馏触发，从历史中归纳出命名规范注入系统提示词，AI 自动遵循「这个库总是用 t_ 前缀、BIGINT 主键」等规律，不再需要每次靠参考表推断。
5. **长期使用**：记忆不断累积与蒸馏，AI 越来越了解用户的数据库风格和查询习惯，生成质量稳步提升。

---

## 9. 实施步骤建议

| 阶段 | 内容 |
|------|------|
| 1. 依赖与基础设施 | `pyproject.toml` 增加 `langgraph`、`langgraph-checkpoint-sqlite`；在 `src/core/` 下新增 `langgraph/` 包（各图定义）和 `memory_store.py`（记忆读写封装）；在 `config_db` 中建好记忆相关表。 |
| 2. 查询图 | 实现 `QueryGraphState` 与查询图：recall_memory → select_tables → fetch_schema → select_enum_columns（条件）→ fetch_enum_values（条件）→ generate_sql → write_memory；接入 `QueryLangGraphWorker`。 |
| 3. 建表图 | 实现 `CreateTableGraphState` 与建表图：recall_memory → select_reference_tables → fetch_reference_schema → generate_create_table → write_memory；接入 `CreateTableLangGraphWorker`，挂 Checkpointer。 |
| 4. 改表图 | 实现 `EditTableGraphState` 与改表图：recall_memory → generate_alter_table → write_memory；接入 `EditTableLangGraphWorker`，挂 Checkpointer。 |
| 5. Redis 图 | 实现 `RedisCommandGraphState` 与 Redis 图：generate_redis_command → write_memory；接入 `RedisCommandLangGraphWorker`。 |
| 6. 连接解析图 | 实现 `ParseConnectionGraphState` 与解析图：parse_config → normalize_json（条件重试）；接入 `ParseConnectionLangGraphWorker`。 |
| 7. 记忆蒸馏 | 实现 `MemoryDistillationGraph`：load_history → distill_conventions → save_conventions；可在积累若干记录后由后台触发，或在设置里提供「优化记忆」按钮手动触发。 |
| 8. 配置与回退 | 各场景可保留「是否使用 LangGraph」配置项便于回退；设置界面增加「记忆管理」入口（查看/清除记忆、查看命名规范、查看纠正记录）。 |
| 9. 可选增强 | 各图按需启用校验节点与失败重试边；增加多轮澄清节点；记忆蒸馏从手动触发改为自动后台调度。 |

---

## 9. 风险与注意点

- **Token 与耗时**：图内多次 LLM 调用与现有一致，总 token 和延迟不会因 LangGraph 本身增加；若后续加校验重试，注意重试次数上限与提示词长度；记忆注入会增加 prompt 长度，需控制 `memory_context` 的最大 token 量（建议不超过 500 tokens）。
- **错误边界**：节点内应对异常做 try/except，将异常信息写入 `state["error"]`，并让图路由到 END，由 Worker 统一通过 `error_occurred` 上报。
- **取消**：用户点击「取消」时，Worker 需能中断；LangGraph 的 `invoke` 是同步的，可考虑用「轮询 + 线程间标志位」在长节点之间检查取消。
- **记忆隐私**：记忆库中包含用户的 SQL 历史，需明确告知用户，并在设置里提供清除记忆的选项；不应将记忆上传到任何云端，全部本地存储。
- **记忆噪声**：早期记忆质量不高，蒸馏结果可能有偏差；置信度机制（`confidence` 字段）和用户可查看/删除记忆的入口可缓解该问题；蒸馏结果应展示给用户确认，而非全自动写入。
- **Checkpointer 存储增长**：长期运行后 Checkpoint 数据会增长，需定期清理过期记录（可在建表/改表完成后清理该 thread 的历史 checkpoint）。

---

## 10. 小结

- **改造范围**：**全量**—— 查询、建表、改表、Redis 命令生成、连接解析五类 AI 交互全部改为 LangGraph 状态图驱动；每类一个图、一个 State、一个（或替换原有）Worker。
- **查询 sql_type（JSON 输出）**：查询图的 `generate_sql` 节点要求 AI 以 **JSON 格式** 同时返回 `sql` 和 `sql_type`（SELECT / INSERT / UPDATE / DELETE / OTHER），节点内 `json.loads()` 解析，Worker 信号改为 `sql_generated(sql, sql_type)`，UI 直接读 `sql_type` 决定是否自动执行，**代码里不再有任何 `startswith` 硬判断**；JSON 解析失败可写 `error` 触发重试。
- **建表 / 改表与多轮交互**：二者均为**多轮对话**—— 不是「只说一句就只回一条 SQL」，而是由 UI 维护对话历史，每轮用户发言后带完整 `conversation_history` 与上一轮 `current_sql` 调用图；图每轮返回 `generated_sql`，并可增加 `assistant_message`（自然语言回复）用于对话气泡，便于用户连续说「加个字段」「再改个类型」等逐轮细化。
- **对外接口**：各场景仍由 QThread Worker 通过现有信号回传结果（sql_generated / error_occurred、command_generated、parsed_config 等）；建表/改表可新增可选信号如 `message_received(assistant_message)`，UI 与对话框契约尽量保持兼容。
- **内部**：状态集中、流程可编排、条件分支与重试统一用图表达；LLM 与提示词继续用现有 AIClient 与 prompt_config，仅执行路径改为图驱动。
- **记忆系统（越用越聪明）**：三层记忆——①会话记忆（State 内 conversation_history）；②跨会话记忆（LangGraph Checkpointer + SQLite，thread_id 按连接/库/场景区分）；③长期用户画像（`memory_store` 存命名规范、高频查询、纠正记录，在各图的 `recall_memory` 节点召回注入提示词，在 `write_memory` 节点写回，定期由蒸馏图提炼规律）。所有记忆本地存储，设置界面提供查看/清除入口。
- **实施顺序**：建议先完成查询图与 Worker，再建表、改表、Redis、连接解析；记忆系统可在各图基础图跑通后作为独立功能接入，各部分可独立提交与回退。
