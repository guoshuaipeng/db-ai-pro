# AI 模型持久化问题修复

## 问题描述

用户反映"当前使用模型持久化还是有问题"。经过调查，发现了AI模型选择无法正确持久化的根本原因。

## 持久化位置

### 配置数据库路径
```
Windows: C:\Users\你的用户名\.db-ai\config.db
Linux/Mac: ~/.db-ai/config.db
```

### 存储结构
1. **AI模型列表**：存储在 SQLite 数据库的 `ai_models` 表中
2. **当前使用的模型ID**：存储在 SQLite 数据库的 `settings` 表中
   - 键名：`last_used_ai_model_id`
   - 值：当前选择的模型的 UUID

## 发现的问题

在 `src/gui/handlers/ai_model_handler.py` 的 `refresh_ai_models()` 方法中存在一个 bug：

### 问题场景
1. 用户启动应用时，系统从数据库读取 `last_used_ai_model_id`
2. 如果该模型ID不存在或已被停用，系统会自动选择第一个激活的模型
3. **但是，这个新选择的模型ID没有保存到数据库**
4. 下次启动时，数据库中的 `last_used_ai_model_id` 仍然是旧的（无效的）ID
5. 系统再次遇到同样的问题，形成循环

### 代码问题
```python
# 旧代码（第82-84行）
# 更新当前模型ID（但不保存，保持数据库中的值）
selected_model_id = active_models[selected_index].id
self.main_window.current_ai_model_id = selected_model_id
```

注释明确说明了"但不保存"，这导致了持久化失败。

## 修复方案

### 1. 修复 `refresh_ai_models()` 方法

在 `src/gui/handlers/ai_model_handler.py` 中，当上次使用的模型未找到时，保存新选择的模型ID：

```python
# 新代码
# 更新当前模型ID
selected_model_id = active_models[selected_index].id
self.main_window.current_ai_model_id = selected_model_id

# 如果上次使用的模型未找到，保存当前选择的模型ID到数据库
if not found_last_used:
    self.main_window.ai_model_storage.save_last_used_model_id(selected_model_id)
    logger.info(f"已保存新的当前模型ID到数据库: {selected_model_id}")
```

### 2. 增强日志记录

在 `src/core/ai_model_storage.py` 中添加了更详细的日志：

```python
def get_last_used_model_id(self) -> Optional[str]:
    """获取上次使用的模型ID（从SQLite settings表）"""
    try:
        model_id = self._config_db.get_setting('last_used_ai_model_id', None)
        if model_id:
            logger.debug(f"从数据库读取到上次使用的模型ID: {model_id}")
        else:
            logger.debug("数据库中没有保存上次使用的模型ID")
        return model_id if model_id else None
    except Exception as e:
        logger.warning(f"读取上次使用的模型ID失败: {str(e)}")
        return None
```

### 3. 添加数据库路径日志

在初始化 `AIModelStorage` 时记录数据库路径：

```python
def __init__(self):
    """初始化存储管理器"""
    from src.core.config_db import get_config_db
    self._config_db = get_config_db()
    logger.debug(f"AI模型存储管理器已初始化，数据库路径: {self._config_db.get_db_path()}")
```

## 持久化流程

### 完整的持久化流程

1. **应用启动**
   - 创建 `AIModelStorage` 实例
   - 调用 `refresh_ai_models()` 加载模型列表
   - 从数据库读取 `last_used_ai_model_id`
   - 如果找到对应的激活模型，选中它
   - 如果没找到，选中第一个激活的模型，**并保存到数据库**

2. **用户切换模型**
   - 触发 `on_ai_model_changed()` 事件
   - 调用 `save_last_used_model_id()` 保存新的模型ID
   - 更新 SQL 编辑器的 AI 客户端

3. **应用关闭**
   - 配置已自动保存到数据库
   - 下次启动时会恢复用户的选择

## 验证方法

### 方法1: 使用 SQLite 工具查看

```bash
# Windows PowerShell
sqlite3 "$env:USERPROFILE\.db-ai\config.db" "SELECT key, value FROM settings WHERE key = 'last_used_ai_model_id'"

# Linux/Mac
sqlite3 ~/.db-ai/config.db "SELECT key, value FROM settings WHERE key = 'last_used_ai_model_id'"
```

### 方法2: 使用 Python 脚本

```python
import sqlite3
from pathlib import Path

db_path = Path.home() / ".db-ai" / "config.db"
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 查看当前使用的模型ID
cursor.execute('SELECT key, value FROM settings WHERE key = "last_used_ai_model_id"')
print("当前使用的模型ID:", cursor.fetchone())

# 查看所有模型
cursor.execute('SELECT id, name, provider, is_active FROM ai_models')
print("\n所有AI模型:")
for row in cursor.fetchall():
    print(f"  ID: {row[0]}, Name: {row[1]}, Provider: {row[2]}, Active: {bool(row[3])}")

conn.close()
```

### 方法3: 查看应用日志

应用日志中会包含以下信息：
- `"AI模型存储管理器已初始化，数据库路径: ..."`
- `"从数据库读取到上次使用的模型ID: ..."`
- `"已保存当前使用的模型ID到数据库: ..."`

## 相关文件

### 修改的文件
- `src/gui/handlers/ai_model_handler.py` - 修复模型选择持久化逻辑
- `src/core/ai_model_storage.py` - 增强日志记录

### 相关文件
- `src/core/config_db.py` - 配置数据库管理
- `src/core/ai_model_config.py` - AI模型配置数据结构
- `src/config/settings.py` - 应用配置（包含配置目录定义）

## 测试建议

1. **测试场景1：正常启动**
   - 启动应用，选择一个AI模型
   - 关闭应用，再次启动
   - 验证：应该自动选中上次使用的模型

2. **测试场景2：删除模型后启动**
   - 启动应用，选择一个AI模型（模型A）
   - 在AI模型配置中删除模型A
   - 关闭应用，再次启动
   - 验证：应该自动选中第一个激活的模型，并保存该选择

3. **测试场景3：停用模型后启动**
   - 启动应用，选择一个AI模型（模型A）
   - 在AI模型配置中停用模型A
   - 关闭应用，再次启动
   - 验证：应该自动选中第一个激活的模型，并保存该选择

4. **测试场景4：查看日志**
   - 启动应用，查看日志文件
   - 验证：日志中应包含数据库路径和模型ID信息

## 总结

此次修复解决了AI模型选择无法正确持久化的问题。主要改进：

1. ✅ 修复了当上次使用的模型不存在时，新选择的模型ID未保存的bug
2. ✅ 增强了日志记录，便于调试和追踪问题
3. ✅ 添加了数据库路径日志，让用户清楚地知道配置文件的位置

所有的模型配置和当前选择都持久化存储在 SQLite 数据库中，确保了应用重启后能正确恢复用户的选择。

