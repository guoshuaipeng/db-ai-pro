# 表分类节点右键菜单增强

## 📋 功能说明

在数据库树形视图中，"表"分类节点（📋 表）现在也支持右键菜单，提供快捷操作。

## 🎯 新增功能

### 右键菜单

在"表"分类节点上点击右键，显示菜单：

```
┌─────────────────┐
│ ✨ 新建表       │
│ ───────────────  │
│ 🔄 刷新         │
└─────────────────┘
```

### 功能说明

#### 1. 新建表

**操作**：
- 右键点击"📋 表"节点
- 选择"✨ 新建表"
- 打开AI新建表对话框

**作用**：
- 在当前数据库中创建新表
- 与数据库节点的"新建表"功能相同
- 更方便快捷

#### 2. 刷新

**操作**：
- 右键点击"📋 表"节点
- 选择"🔄 刷新"
- 刷新表列表

**作用**：
- 重新从数据库加载表列表
- 显示最新的表
- 与数据库节点的"刷新"功能相同

## 🎨 树形结构示例

```
📁 MySQL连接
  └─ 📂 test_database
      ├─ 📋 表             ← 右键点击这里！
      │   ├─ 📊 users
      │   ├─ 📊 orders
      │   └─ 📊 products
      └─ 其他节点...
```

## 💡 使用场景

### 场景1：快速创建新表

**之前的操作**：
1. 右键点击数据库节点 → 新建表

**现在的操作**：
1. 展开数据库，看到"表"节点
2. 右键点击"表"节点 → 新建表

**优势**：
- 视觉上更直观
- 就在表列表旁边
- 操作更自然

### 场景2：刷新表列表

**之前的操作**：
1. 需要找到并右键点击数据库节点
2. 或者右键点击某个表，然后刷新

**现在的操作**：
1. 直接右键点击"表"节点 → 刷新

**优势**：
- 更符合直觉
- 刷新的就是表列表
- 操作位置更精准

### 场景3：多数据库操作

**场景**：同时操作多个数据库的表

**操作**：
```
📁 MySQL连接
  ├─ 📂 db1
  │   └─ 📋 表  ← 右键：新建表/刷新
  ├─ 📂 db2
  │   └─ 📋 表  ← 右键：新建表/刷新
  └─ 📂 db3
      └─ 📋 表  ← 右键：新建表/刷新
```

**优势**：
- 每个数据库的表操作独立
- 不需要折叠/展开数据库节点
- 提高效率

## 🔧 技术实现

### 修改的文件

**src/gui/handlers/menu_handler.py**

### 关键改动

#### 1. 移除TABLE_CATEGORY的跳过

**修改前**：
```python
# 跳过根节点和分类项
if item_type in (TreeItemType.ROOT, TreeItemType.TABLE_CATEGORY, 
                 TreeItemType.LOADING, TreeItemType.ERROR, TreeItemType.EMPTY):
    return
```

**修改后**：
```python
# 跳过根节点和特殊节点
if item_type in (TreeItemType.ROOT, TreeItemType.LOADING, 
                 TreeItemType.ERROR, TreeItemType.EMPTY):
    return
```

#### 2. 添加TABLE_CATEGORY菜单处理

```python
if item_type == TreeItemType.TABLE_CATEGORY:
    # "表"分类节点的右键菜单
    # 获取父节点（数据库节点）的数据库名
    parent_item = item.parent()
    if parent_item:
        database = TreeItemData.get_item_data(parent_item)
        if database:
            # 新建表
            create_table_action = QAction(
                self._get_icon('create'), "新建表", self.main_window
            )
            create_table_action.triggered.connect(
                lambda: self.main_window.create_table_in_database(connection_id, database)
            )
            menu.addAction(create_table_action)
            
            menu.addSeparator()
            
            # 刷新表列表
            refresh_action = QAction(
                self._get_icon('refresh'), "刷新", self.main_window
            )
            refresh_action.triggered.connect(
                lambda: self.main_window.tree_data_handler.refresh_database_tables(
                    connection_id, database
                )
            )
            menu.addAction(refresh_action)
```

### 获取数据库名的方法

通过父节点获取：
```python
parent_item = item.parent()  # 获取父节点（数据库节点）
database = TreeItemData.get_item_data(parent_item)  # 获取数据库名
```

## 📊 菜单对比

### 数据库节点菜单

```
┌─────────────────┐
│ ✨ 新建表       │
│ ───────────────  │
│ 🗑️ 删除数据库   │
│ ───────────────  │
│ 🔄 刷新         │
└─────────────────┘
```

### 表分类节点菜单（新增）

```
┌─────────────────┐
│ ✨ 新建表       │  ← 与数据库节点相同
│ ───────────────  │
│ 🔄 刷新         │  ← 与数据库节点相同
└─────────────────┘
```

### 表节点菜单

```
┌──────────────────────┐
│ 📄 在新标签页中查询  │
│ ────────────────────  │
│ ✏️ 编辑表结构        │
│ ────────────────────  │
│ 📋 复制结构          │
│ ────────────────────  │
│ 🗑️ 删除表            │
│ ────────────────────  │
│ 🔄 刷新              │
└──────────────────────┘
```

## 🎯 用户体验改进

### 改进点

1. **一致性**：
   - 表分类节点和数据库节点有类似的菜单
   - 都提供"新建表"和"刷新"功能
   - 符合用户预期

2. **便捷性**：
   - 减少鼠标移动距离
   - 操作更直观
   - 提高效率

3. **逻辑性**：
   - 在"表"节点上操作表
   - 语义更清晰
   - 更符合直觉

### 用户反馈（预期）

- ✨ "终于可以在'表'节点上右键了！"
- ✨ "刷新表列表更方便了"
- ✨ "新建表的入口更多了"

## 🔗 相关功能

- [新建表](./CREATE_TABLE.md)
- [刷新功能](./REFRESH_FEATURE.md)
- [数据库树形视图](./TREE_VIEW.md)
- [右键菜单](./CONTEXT_MENU.md)

## 📝 更新日志

### v1.2.0 (2024-12-15)

- ✅ 新增："表"分类节点右键菜单
- ✅ 新增：菜单项"新建表"
- ✅ 新增：菜单项"刷新"
- ✅ 优化：菜单布局与数据库节点保持一致

## 💡 使用提示

### 提示1：快捷刷新

如果只想刷新表列表：
- 直接右键"表"节点 → 刷新
- 不需要找到数据库节点

### 提示2：快速新建表

如果正在查看表列表，想新建表：
- 直接右键"表"节点 → 新建表
- 不需要返回上层

### 提示3：批量操作

如果要在多个数据库中新建表：
- 依次展开各数据库
- 右键各个"表"节点
- 快速创建

## 🐛 注意事项

### 权限要求

- 需要有CREATE TABLE权限才能新建表
- 没有权限时会显示错误提示

### 数据库支持

- 所有数据库类型都支持
- SQLite可能不显示"表"节点（取决于实现）

## 📊 影响分析

### 影响范围

- ✅ 只影响"表"分类节点的右键菜单
- ✅ 不影响其他节点的菜单
- ✅ 不改变现有功能

### 向后兼容

- ✅ 完全向后兼容
- ✅ 原有操作方式仍然可用
- ✅ 只是增加了新的操作入口

---

**作者**: codeyG (550187704@qq.com)  
**版本**: v1.2.0  
**日期**: 2024-12-15

