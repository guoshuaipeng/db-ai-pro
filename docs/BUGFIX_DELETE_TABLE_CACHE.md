# Bug修复：删除表时缓存清理错误

## 🐛 问题描述

**错误信息**：
```
File "E:\pythonProjects\db-ai\src\gui\main_window.py", line 470, in on_success
    from src.core.schema_cache import schema_cache
ImportError: cannot import name 'schema_cache' from 'src.core.schema_cache'
```

**触发场景**：
- 用户在数据库树形视图中右键点击表节点
- 选择"删除表"
- 确认删除操作
- 表删除成功，但在清理缓存时报错

**影响**：
- 表实际已被删除
- 但缓存未被清理
- 错误信息显示在终端
- 不影响后续操作

## 🔍 原因分析

### 错误代码

在 `src/gui/main_window.py` 第470行左右：

```python
# 错误的导入方式
from src.core.schema_cache import schema_cache
cache_key = f"{connection_id}_{database_name}_{table_name}"
if cache_key in schema_cache._cache:
    del schema_cache._cache[cache_key]
```

### 问题根源

`src/core/schema_cache.py` 使用了**单例模式**：

```python
# 全局缓存实例
_schema_cache_instance: Optional[SchemaCache] = None

def get_schema_cache() -> SchemaCache:
    """获取全局缓存实例（单例模式）"""
    global _schema_cache_instance
    if _schema_cache_instance is None:
        _schema_cache_instance = SchemaCache()
    return _schema_cache_instance
```

**关键点**：
1. 模块中没有直接导出名为 `schema_cache` 的实例
2. 应该使用 `get_schema_cache()` 函数获取单例实例
3. 缓存的内部结构是 `_schema_cache` 和 `_table_list_cache`，不是 `_cache`

## ✅ 修复方案

### 修复后的代码

```python
# 正确的导入和使用方式
from src.core.schema_cache import get_schema_cache
schema_cache = get_schema_cache()
# 清除该连接的所有缓存，因为表被删除了
schema_cache.clear_connection_cache(connection_id)
```

### 改进说明

1. **正确导入**：使用 `get_schema_cache()` 函数
2. **简化逻辑**：直接调用 `clear_connection_cache()` 清除整个连接的缓存
3. **更彻底**：之前只清除单个表的缓存，现在清除整个连接的缓存更安全

### 优势

- ✅ 符合单例模式的使用规范
- ✅ 使用公共API而不是访问私有属性
- ✅ 清理更彻底，避免遗留缓存
- ✅ 代码更简洁易懂

## 🧪 测试验证

### 测试步骤

1. 启动应用程序
2. 连接到数据库
3. 右键点击任意表节点
4. 选择"删除表"
5. 完成双重确认
6. 观察删除过程

### 预期结果

- ✅ 表被成功删除
- ✅ 表节点从树中移除
- ✅ 无错误信息显示
- ✅ 缓存被正确清理

### 实际结果

- ✅ 所有功能正常工作
- ✅ 无导入错误
- ✅ 缓存清理成功

## 📝 修改的文件

**src/gui/main_window.py**：

**修改位置**：`delete_table()` 方法中的缓存清理部分

**修改前**：
```python
# 清除可能缓存的表结构
from src.core.schema_cache import schema_cache
cache_key = f"{connection_id}_{database_name}_{table_name}"
if cache_key in schema_cache._cache:
    del schema_cache._cache[cache_key]
```

**修改后**：
```python
# 清除可能缓存的表结构
from src.core.schema_cache import get_schema_cache
schema_cache = get_schema_cache()
# 清除该连接的所有缓存，因为表被删除了
schema_cache.clear_connection_cache(connection_id)
```

## 🎯 经验教训

### 1. 遵循模块的API设计

**教训**：
- 不应该直接导入模块内部的私有实例
- 应该使用模块提供的公共函数/方法
- 查看源码了解正确的使用方式

**正确做法**：
```python
# ✅ 使用公共API
from module import get_instance
instance = get_instance()

# ❌ 避免直接导入私有实例
from module import _private_instance
```

### 2. 单例模式的使用

**特点**：
- 全局只有一个实例
- 通过工厂函数获取
- 不直接实例化类

**标准用法**：
```python
# 定义
def get_singleton():
    if not exists:
        create_new()
    return instance

# 使用
obj = get_singleton()
```

### 3. 使用公共API而不是私有属性

**原则**：
- 使用公共方法：`cache.clear_connection_cache()`
- 避免直接访问：`cache._cache[key]`

**优势**：
- 封装性更好
- 不依赖内部实现
- 升级时不易出错

## 🔗 相关文档

- [删除表功能](./DELETE_TABLE_FEATURE.md)
- [Schema缓存设计](./SCHEMA_CACHE_DESIGN.md)（如果存在）

## 📊 影响分析

### 影响范围

- ✅ 只影响删除表功能的缓存清理
- ✅ 不影响其他功能
- ✅ 表删除本身正常工作

### 用户体验

**修复前**：
- 表被删除
- 终端显示错误
- 用户可能担心

**修复后**：
- 表被删除
- 无错误信息
- 缓存正确清理

## 📝 版本信息

**Bug发现版本**: v1.2.0  
**修复版本**: v1.2.1  
**修复日期**: 2024-12-15  
**修复作者**: codeyG

## ✅ 状态

- [x] Bug已修复
- [x] 代码已测试
- [x] 文档已更新
- [x] 无linter错误

---

**注意**：此Bug不影响数据安全，表已被正确删除，只是缓存清理时报错。

