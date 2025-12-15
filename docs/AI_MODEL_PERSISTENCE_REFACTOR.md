# AI 模型持久化重构 - 使用 is_current 字段

## 概述

本次重构将当前使用模型的标识从 `settings` 表的 `last_used_ai_model_id` 键值对迁移到 `ai_models` 表的 `is_current` 字段。这是一个更合理和直观的设计。

## 设计变更

### 旧设计
- **存储位置**: `settings` 表
- **存储方式**: 键值对 `last_used_ai_model_id` -> 模型UUID
- **缺点**: 
  - 需要跨表查询
  - 数据分散在两个表中
  - 可能存在引用完整性问题（模型被删除但ID仍在settings中）

### 新设计
- **存储位置**: `ai_models` 表
- **存储方式**: `is_current` 字段（INTEGER，0 或 1）
- **优点**:
  - 数据集中在一个表中
  - 查询更简单高效
  - 保证数据一致性（删除模型时自动清除标记）
  - 语义更清晰

## 数据库变更

### 表结构变更

```sql
-- ai_models 表添加 is_current 字段
ALTER TABLE ai_models ADD COLUMN is_current INTEGER DEFAULT 0;
```

### 字段说明
- `is_current`: INTEGER (0 或 1)
  - `0`: 不是当前使用的模型
  - `1`: 是当前使用的模型
  - 约束: 同一时间只能有一个激活的模型标记为 `is_current = 1`

### 数据迁移

自动迁移逻辑（在 `config_db.py` 的 `_init_database` 中）：

1. 检查 `ai_models` 表是否存在 `is_current` 字段
2. 如果不存在，添加该字段
3. 从 `settings` 表读取 `last_used_ai_model_id`
4. 如果找到：
   - 将对应的激活模型标记为 `is_current = 1`
   - 删除 `settings` 表中的 `last_used_ai_model_id` 记录
5. 如果没找到：
   - 将第一个激活的模型标记为 `is_current = 1`

## 代码变更

### 1. ConfigDB 类 (`src/core/config_db.py`)

#### 新增方法

```python
def get_current_ai_model(self) -> Optional[Dict[str, Any]]:
    """
    获取当前使用的 AI 模型配置（基于 is_current 字段）
    """
    # 查询 is_current = 1 且 is_active = 1 的模型

def set_current_ai_model(self, model_id: str) -> bool:
    """
    设置当前使用的 AI 模型
    
    步骤：
    1. 检查模型是否存在且激活
    2. 取消所有模型的 is_current 标记
    3. 设置指定模型为 is_current = 1
    """
```

#### 修改方法

```python
def get_all_ai_models(self) -> List[Dict[str, Any]]:
    # 返回的字典中包含 is_current 字段

def get_ai_model_by_id(self, model_id: str) -> Optional[Dict[str, Any]]:
    # 返回的字典中包含 is_current 字段
```

### 2. AIModelStorage 类 (`src/core/ai_model_storage.py`)

#### 新增方法

```python
def get_current_model_id(self) -> Optional[str]:
    """获取当前使用的模型ID（从ai_models表的is_current字段）"""

def set_current_model(self, model_id: str) -> bool:
    """设置当前使用的模型（更新ai_models表的is_current字段）"""
```

#### 修改方法

```python
def get_current_model(self) -> Optional[AIModelConfig]:
    """
    获取当前使用的模型配置
    
    新逻辑：
    1. 查询 is_current = 1 的激活模型
    2. 如果没有，使用第一个激活的模型并标记为当前
    """
```

#### 向后兼容

保留旧方法名作为别名：

```python
def get_last_used_model_id(self) -> Optional[str]:
    """向后兼容，实际调用 get_current_model_id"""
    return self.get_current_model_id()

def save_last_used_model_id(self, model_id: str) -> bool:
    """向后兼容，实际调用 set_current_model"""
    return self.set_current_model(model_id)
```

### 3. AIModelHandler 类 (`src/gui/handlers/ai_model_handler.py`)

#### 变量名更新

```python
# 旧代码
last_used_id = self.main_window.ai_model_storage.get_last_used_model_id()
found_last_used = False

# 新代码
current_id = self.main_window.ai_model_storage.get_current_model_id()
found_current = False
```

#### 方法调用更新

```python
# 旧代码
self.main_window.ai_model_storage.save_last_used_model_id(model_id)

# 新代码
self.main_window.ai_model_storage.set_current_model(model_id)
```

## 迁移流程

### 自动迁移

用户无需手动操作，应用首次启动时会自动执行迁移：

1. **应用启动** → `main.py::init_config_database()`
2. **初始化数据库** → `ConfigDB::_init_database()`
3. **检查表结构** → 发现缺少 `is_current` 字段
4. **添加字段** → `ALTER TABLE ai_models ADD COLUMN is_current`
5. **迁移数据** → 从 `settings` 表读取 `last_used_ai_model_id`
6. **更新标记** → 将对应模型标记为 `is_current = 1`
7. **清理旧数据** → 删除 `settings` 表中的 `last_used_ai_model_id`
8. **完成迁移** → 日志记录迁移结果

### 迁移日志示例

```
INFO: 检测到ai_models表缺少is_current字段，正在添加...
INFO: 已添加is_current字段
INFO: 已将模型 88e7a70e-44f7-466c-92dd-06f7c36aee1b 标记为当前使用（从settings表迁移）
INFO: 已删除settings表中的last_used_ai_model_id记录
```

## 测试验证

### 测试脚本

运行 `test_current_model.py` 验证迁移结果：

```bash
python test_current_model.py
```

### 测试项目

1. ✅ 检查 `is_current` 字段是否存在
2. ✅ 检查是否有且仅有一个模型标记为当前使用
3. ✅ 检查 `settings` 表中的旧记录是否已清理
4. ✅ 测试 SQL 查询是否能正确找到当前模型

### 预期输出

```
======================================================================
测试当前使用模型的新实现 (is_current 字段)
======================================================================

1. 检查表结构:
   [OK] 找到 is_current 字段 (类型: INTEGER, 默认值: 0)

2. 所有AI模型的 is_current 状态:
   [88e7a70e...] 通义千问 (aliyun_qianwen) [Active]
   [88e7a70e...] MOONSHOT (moonshot) [Inactive]
   [a8d508bf...] 腾讯混元 (tencent_hunyuan) [Active] <- CURRENT
   
   [OK] 有 1 个模型标记为当前使用

3. 检查是否已清理旧的 settings 记录:
   [OK] settings 表中已清理 last_used_ai_model_id

4. 查询当前使用的模型 (SQL测试):
   [OK] 当前使用的模型:
       ID: a8d508bf-c687-4a94-8248-e1cc3c6cbc16
       Name: 腾讯混元
       Provider: tencent_hunyuan

======================================================================
测试完成!
======================================================================
```

## 使用示例

### 获取当前使用的模型

```python
from src.core.ai_model_storage import AIModelStorage

storage = AIModelStorage()
current_model = storage.get_current_model()
if current_model:
    print(f"当前使用的模型: {current_model.name}")
```

### 设置当前使用的模型

```python
from src.core.ai_model_storage import AIModelStorage

storage = AIModelStorage()
success = storage.set_current_model("model-uuid-here")
if success:
    print("已设置当前使用的模型")
```

### 在 GUI 中切换模型

```python
# 用户在下拉框中选择模型时
def on_ai_model_changed(self, index: int):
    model_id = self.ai_model_combo.itemData(index)
    self.ai_model_storage.set_current_model(model_id)
```

## 数据一致性保证

### 唯一性约束

`set_current_model()` 方法确保同一时间只有一个模型标记为当前使用：

```python
def set_current_ai_model(self, model_id: str) -> bool:
    # 1. 取消所有模型的 is_current 标记
    cursor.execute("UPDATE ai_models SET is_current = 0")
    
    # 2. 设置指定模型为当前使用
    cursor.execute("UPDATE ai_models SET is_current = 1 WHERE id = ?", (model_id,))
```

### 删除模型时的处理

当删除一个标记为当前使用的模型时：

1. 模型记录被删除，`is_current` 标记也随之删除
2. 下次调用 `get_current_model()` 时：
   - 发现没有标记为当前的模型
   - 自动选择第一个激活的模型
   - 标记该模型为当前使用

## 性能优化

### 查询效率

新设计的查询更简单高效：

```sql
-- 旧设计（需要JOIN）
SELECT * FROM ai_models 
WHERE id = (SELECT value FROM settings WHERE key = 'last_used_ai_model_id')
  AND is_active = 1;

-- 新设计（单表查询）
SELECT * FROM ai_models 
WHERE is_current = 1 AND is_active = 1 
LIMIT 1;
```

### 建议添加索引

如果模型数量很多，可以考虑添加索引：

```sql
CREATE INDEX idx_ai_models_is_current ON ai_models(is_current, is_active);
```

## 回滚方案

如果需要回滚到旧设计（不推荐）：

```sql
-- 1. 从 is_current 迁移回 settings
INSERT OR REPLACE INTO settings (key, value, value_type, updated_at)
SELECT 'last_used_ai_model_id', id, 'str', datetime('now')
FROM ai_models
WHERE is_current = 1
LIMIT 1;

-- 2. 可选：删除 is_current 字段（SQLite 不支持 DROP COLUMN）
-- 需要重建表来删除字段，不推荐
```

## 相关文件

### 修改的文件
- `src/core/config_db.py` - 数据库表结构和访问方法
- `src/core/ai_model_storage.py` - AI模型存储管理器
- `src/gui/handlers/ai_model_handler.py` - GUI中的AI模型处理逻辑

### 测试文件
- `test_current_model.py` - 验证迁移结果的测试脚本

### 文档文件
- `docs/AI_MODEL_PERSISTENCE_FIX.md` - 之前的修复文档（已过时）
- `docs/AI_MODEL_PERSISTENCE_REFACTOR.md` - 本文档

## 总结

本次重构带来的改进：

1. ✅ **更清晰的数据模型** - 当前使用的模型信息直接存储在模型表中
2. ✅ **更简单的查询** - 单表查询，无需JOIN
3. ✅ **更好的数据一致性** - 删除模型时自动清除标记
4. ✅ **更高的性能** - 减少跨表查询
5. ✅ **向后兼容** - 保留旧方法名作为别名
6. ✅ **自动迁移** - 用户无感知升级

所有改动都经过测试验证，确保了数据的正确迁移和功能的正常运行。

