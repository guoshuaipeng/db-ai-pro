# 删除表功能

## 📋 功能说明

在数据库树形视图中，用户可以右键点击表节点，选择"删除表"来删除不需要的表。此功能提供了双重确认机制，确保用户不会误删重要数据。

## 🎯 使用方法

### 操作步骤

1. **定位到表节点**
   - 在左侧数据库树形视图中展开连接
   - 展开数据库节点
   - 找到需要删除的表

2. **右键点击表节点**
   - 右键点击要删除的表
   - 在弹出菜单中选择"删除表"

3. **第一次确认**
   - 系统弹出确认对话框，显示：
     ```
     确定要删除表 database.table_name 吗？
     
     ⚠️ 警告：此操作将删除表中的所有数据，且无法恢复！
     ```
   - 点击"Yes"继续，或"No"取消

4. **第二次确认（安全确认）**
   - 系统要求输入表名称以确认删除
   - 必须完全匹配表名（区分大小写）
   - 输入正确后点击"OK"确认

5. **执行删除**
   - 系统执行删除操作
   - 显示进度提示
   - 删除成功后，表节点自动从树中移除
   - 显示成功提示消息

## 🔒 安全机制

### 双重确认

1. **第一次确认**：防止误触
   - 标准的确认对话框
   - 明确提示警告信息
   - 默认选项为"No"

2. **第二次确认**：防止误操作
   - 要求手动输入表名
   - 必须完全匹配（包括大小写）
   - 输入错误则取消操作

### 支持的数据库类型

- ✅ MySQL / MariaDB
- ✅ PostgreSQL
- ✅ SQL Server
- ✅ SQLite
- ✅ Oracle

### SQL语句生成

根据不同数据库类型，自动生成正确的DROP TABLE语句：

| 数据库类型 | SQL语句格式 |
|-----------|------------|
| MySQL/MariaDB | `DROP TABLE \`table_name\`` |
| PostgreSQL | `DROP TABLE "table_name"` |
| SQL Server | `DROP TABLE [table_name]` |
| SQLite | `DROP TABLE "table_name"` |
| Oracle | `DROP TABLE "table_name"` |

## 🎨 用户界面

### 右键菜单布局

表节点右键菜单结构：

```
├─ 在新标签页中查询
├─ ───────────────
├─ 编辑表结构
├─ ───────────────
├─ 复制结构
├─ ───────────────
├─ 删除表           ← 新增功能
├─ ───────────────
└─ 刷新
```

### 图标

- 使用标准的垃圾桶图标 🗑️
- 与"删除数据库"、"删除连接"等功能保持一致

## 🔧 技术实现

### 代码位置

#### 1. 菜单项添加（`src/gui/handlers/menu_handler.py`）

在表节点的右键菜单中添加删除选项：

```python
# 删除表
delete_table_action = QAction(self._get_icon('delete'), "删除表", self.main_window)
delete_table_action.triggered.connect(
    lambda: self.main_window.delete_table(connection_id, database, table_name, item)
)
menu.addAction(delete_table_action)
```

#### 2. 删除逻辑实现（`src/gui/main_window.py`）

`delete_table()` 方法实现：

```python
def delete_table(self, connection_id: str, database_name: str, 
                 table_name: str, table_item: 'QTreeWidgetItem'):
    """删除表"""
    # 1. 获取连接信息
    # 2. 第一次确认（确认对话框）
    # 3. 第二次确认（输入表名）
    # 4. 生成DROP TABLE SQL
    # 5. 使用ExecuteSQLWorker执行
    # 6. 成功后从树中移除节点
    # 7. 清除缓存的表结构
```

### 关键特性

#### 1. 异步执行

使用`ExecuteSQLWorker`在后台线程执行删除操作，避免阻塞UI：

```python
worker = ExecuteSQLWorker(
    connection.get_connection_string(),
    connection.get_connect_args(),
    connection.db_type,
    sql,
    database_name
)
```

#### 2. 缓存清理

删除成功后，自动清除该表的结构缓存：

```python
from src.core.schema_cache import schema_cache
cache_key = f"{connection_id}_{database_name}_{table_name}"
if cache_key in schema_cache._cache:
    del schema_cache._cache[cache_key]
```

#### 3. UI同步更新

删除成功后，自动从树形视图中移除表节点：

```python
parent = table_item.parent()
if parent:
    parent.removeChild(table_item)
```

#### 4. 状态提示

- 状态栏显示操作进度
- Toast通知显示操作结果
- 错误处理和友好提示

## ⚠️ 注意事项

### 不可恢复

- ⚠️ 删除表是**不可恢复**的操作
- 删除前请确保已备份重要数据
- 建议在生产环境中谨慎使用

### 权限要求

- 需要数据库用户具有DROP TABLE权限
- 权限不足时会显示错误提示

### 外键约束

- 如果表被其他表的外键引用，删除可能失败
- 需要先删除外键约束或相关表

### 连接状态

- 执行删除前会检查连接是否有效
- 连接断开时会显示错误提示

## 📊 测试场景

### 正常流程

1. ✅ 右键点击表节点显示菜单
2. ✅ 点击"删除表"显示第一次确认
3. ✅ 点击Yes显示输入对话框
4. ✅ 输入正确表名执行删除
5. ✅ 删除成功，节点从树中移除
6. ✅ 显示成功提示

### 取消操作

1. ✅ 第一次确认点击No，取消操作
2. ✅ 第二次确认点击Cancel，取消操作
3. ✅ 输入错误表名，提示不匹配并取消

### 错误处理

1. ✅ 连接不存在，显示错误
2. ✅ 权限不足，显示错误
3. ✅ 表被外键引用，显示错误
4. ✅ 网络连接断开，显示错误

## 🎯 用户体验

### 优势

- ✨ **直观**：右键菜单中直接操作
- ✨ **安全**：双重确认机制
- ✨ **快速**：异步执行，不阻塞界面
- ✨ **反馈**：清晰的状态提示

### 改进建议

- [ ] 添加"移至回收站"功能（可恢复）
- [ ] 支持批量删除多个表
- [ ] 显示表的依赖关系警告
- [ ] 删除前自动备份选项

## 🔗 相关功能

- [删除数据库](./DELETE_DATABASE_FEATURE.md)（如果存在）
- [编辑表结构](./EDIT_TABLE_STRUCTURE.md)（如果存在）
- [复制表结构](./COPY_TABLE_STRUCTURE.md)（如果存在）

## 📝 更新日志

### v1.2.0 (2024-12-15)

- ✅ 新增：表节点右键菜单"删除表"功能
- ✅ 新增：双重确认机制
- ✅ 新增：支持所有主流数据库类型
- ✅ 新增：自动清理缓存
- ✅ 新增：友好的状态提示

---

**作者**: codeyG (550187704@qq.com)  
**版本**: v1.2.0  
**日期**: 2024-12-15

