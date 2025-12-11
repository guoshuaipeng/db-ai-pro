# 索引同步功能说明

## 功能概述

数据库结构同步功能现已支持索引的比对和同步。

## 功能特性

### 1. 索引比对

系统会自动比较源数据库和目标数据库中表的索引，包括：

- **新增索引**：源数据库中存在但目标数据库中不存在的索引
- **删除索引**：目标数据库中存在但源数据库中不存在的索引
- **修改索引**：两个数据库都存在但配置不同的索引
  - 索引列的差异
  - 唯一性（UNIQUE）的差异

### 2. 索引信息展示

在比对结果页面中，会显示详细的索引差异信息：

```
新增索引: idx_user_email (唯一索引, 列: email)
删除索引: idx_old_field
索引 idx_name 列不同: [name] -> [name, created_at]
索引 idx_unique 唯一性不同: 非唯一 -> 唯一
```

### 3. SQL生成

系统会自动生成索引相关的SQL语句：

#### MySQL/MariaDB
```sql
-- 删除索引
DROP INDEX `idx_name` ON `table_name`;

-- 创建普通索引
CREATE INDEX `idx_name` ON `table_name` (`column1`, `column2`);

-- 创建唯一索引
CREATE UNIQUE INDEX `idx_email` ON `users` (`email`);
```

#### PostgreSQL
```sql
-- 删除索引
DROP INDEX "idx_name";

-- 创建索引
CREATE INDEX "idx_name" ON "table_name" ("column1", "column2");
CREATE UNIQUE INDEX "idx_email" ON "users" ("email");
```

#### SQL Server
```sql
-- 删除索引
DROP INDEX [idx_name] ON [table_name];

-- 创建索引
CREATE INDEX [idx_name] ON [table_name] ([column1], [column2]);
CREATE UNIQUE INDEX [idx_email] ON [users] ([email]);
```

#### SQLite
```sql
-- 删除索引
DROP INDEX "idx_name";

-- 创建索引
CREATE INDEX "idx_name" ON "table_name" ("column1", "column2");
CREATE UNIQUE INDEX "idx_email" ON "users" ("email");
```

## 使用步骤

1. 打开"数据库结构同步"向导
2. 选择源数据库和目标数据库
3. 系统自动比对表结构（包括索引）
4. 在比对结果页面查看索引差异
5. 选择需要同步的项目（可单独选择索引相关的修改）
6. 预览生成的SQL语句
7. 确认并执行同步

## 技术实现

### 索引比对逻辑（SchemaSyncWorker）

```python
# 获取索引信息
source_indexes = source_inspector.get_indexes(table, schema=source_db)
target_indexes = target_inspector.get_indexes(table, schema=target_db)

# 比较索引名称、列、唯一性
# 生成差异报告
```

### SQL生成逻辑（Step3PreviewAndExecutePage）

```python
# _generate_index_sql: 生成索引相关SQL
# - 删除不存在的索引
# - 修改已变更的索引（先删除后创建）
# - 创建新增的索引

# _create_index_sql: 生成CREATE INDEX语句
# 支持普通索引和唯一索引
```

## 注意事项

1. **索引修改**：如果索引的列或唯一性发生变化，系统会先删除旧索引，再创建新索引
2. **索引名称**：系统依据索引名称进行比对，请确保索引名称的唯一性
3. **性能影响**：创建索引可能会锁表，建议在低峰时段执行
4. **数据库差异**：不同数据库系统的索引语法略有不同，系统已自动适配
5. **主键索引**：主键自动创建的索引可能在某些数据库中被包含在索引列表中

## 测试建议

### 测试场景

1. **新增索引**：在源表添加索引，验证同步是否正确创建
2. **删除索引**：在源表删除索引，验证同步是否正确删除
3. **修改索引列**：修改索引的列，验证是否正确重建
4. **修改索引唯一性**：将普通索引改为唯一索引，验证同步
5. **跨数据库类型**：测试从MySQL同步到PostgreSQL等跨数据库类型场景

### 测试步骤示例

```sql
-- 1. 在源数据库创建测试表
CREATE TABLE test_index (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at DATETIME
);

-- 2. 创建索引
CREATE INDEX idx_name ON test_index (name);
CREATE UNIQUE INDEX idx_email ON test_index (email);

-- 3. 在目标数据库创建相同的表但不同的索引
CREATE TABLE test_index (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at DATETIME
);
CREATE INDEX idx_created ON test_index (created_at);

-- 4. 运行结构同步，查看差异：
--    - 新增: idx_name, idx_email
--    - 删除: idx_created

-- 5. 执行同步并验证结果
```

## 版本信息

- **添加时间**：2025-12-11
- **功能状态**：已实现
- **支持的数据库**：MySQL, MariaDB, PostgreSQL, SQL Server, SQLite

