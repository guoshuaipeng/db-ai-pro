# AI模型配置迁移到SQLite

## 📋 更新说明

本次更新将AI模型配置从JSON文件和硬编码的默认模型完全迁移到SQLite数据库。

## 🎯 主要变更

### 1. 移除硬编码的默认模型
- ✅ 删除了 `src/core/default_ai_model.py` 文件
- ✅ 移除了从环境变量读取默认模型的逻辑
- ✅ 所有模型配置现在都存储在SQLite数据库中

### 2. 移除JSON文件存储
- ✅ 不再使用 `~/.db-ai/ai_models.json` 文件
- ✅ 所有模型配置都存储在 `~/.db-ai/config.db` 数据库中

### 3. 数据库表结构更新

新的 `ai_models` 表结构：

```sql
CREATE TABLE ai_models (
    id TEXT PRIMARY KEY,              -- 模型ID (UUID)
    name TEXT NOT NULL,               -- 模型名称
    provider TEXT NOT NULL,           -- 提供商 (aliyun_qianwen, openai等)
    api_key TEXT,                     -- API密钥
    base_url TEXT,                    -- API基础URL
    default_model TEXT NOT NULL,      -- 默认模型名称
    turbo_model TEXT NOT NULL,        -- Turbo模型名称
    is_active INTEGER DEFAULT 1,      -- 是否激活
    is_default INTEGER DEFAULT 0,     -- 是否为默认模型
    created_at TEXT NOT NULL,         -- 创建时间
    updated_at TEXT NOT NULL          -- 更新时间
)
```

### 4. 自动迁移

程序启动时会自动检测并迁移旧的配置：
- 如果存在 `ai_models.json` 文件，会自动迁移到SQLite
- 迁移成功后，JSON文件会被重命名为 `ai_models.json.backup`
- 旧的数据库表结构会自动升级到新结构

## 🔄 迁移过程

### 对用户的影响

1. **首次启动（旧用户）**：
   - 程序自动检测 `ai_models.json` 文件
   - 自动迁移所有模型配置到SQLite
   - JSON文件被重命名为备份文件
   - 用户无需手动操作

2. **新用户**：
   - 首次启动时没有任何模型配置
   - 需要在"AI模型管理"中添加第一个模型
   - 添加模型后直接保存到SQLite

3. **模型配置保持**：
   - 所有已配置的模型都会被保留
   - 上次使用的模型会被记住
   - 默认模型设置会被保留

## ✨ 新功能

### 1. 所有模型都可编辑
- 现在允许编辑任何模型，包括默认模型
- 不再有"硬编码模型不可编辑"的限制

### 2. 更好的模型管理
- 模型配置完全由用户控制
- 可以删除任何不需要的模型
- 可以随时更改默认模型

### 3. 数据一致性
- 所有配置数据都在同一个SQLite数据库中
- 事务支持，确保数据一致性
- 自动备份机制

## 📂 文件位置

### SQLite数据库
- **位置**: `~/.db-ai/config.db`
- **包含内容**:
  - 数据库连接配置
  - 提示词配置
  - 树视图缓存
  - AI模型配置
  - 应用设置

### 备份文件（如果有）
- `~/.db-ai/ai_models.json.backup` - 迁移前的JSON配置备份

## 🔧 开发说明

### 主要修改的文件

1. **src/core/config_db.py**
   - 更新 `ai_models` 表结构
   - 添加自动表结构迁移逻辑
   - 更新所有AI模型相关方法
   - 添加 `migrate_ai_models_from_json()` 方法

2. **src/core/ai_model_storage.py**
   - 完全重写，使用SQLite
   - 移除JSON文件操作代码
   - 移除硬编码默认模型加载
   - 简化代码逻辑

3. **src/core/default_ai_model.py**
   - ✅ 已删除（不再需要）

4. **src/gui/dialogs/ai_model_manager_dialog.py**
   - 移除"默认模型不可编辑"的限制
   - 更新显示逻辑

5. **src/gui/handlers/ai_model_handler.py**
   - 更新默认模型显示标记
   - 移除硬编码模型ID检查

6. **src/main.py**
   - 更新迁移逻辑，包含AI模型配置

## 🎨 用户界面变更

### AI模型管理对话框
- "系统默认" 标记改为 "默认" 标记
- 所有模型都可以编辑和删除
- 更简洁的界面提示

### AI模型下拉框
- 默认模型显示 "[默认]" 标记
- 不再显示 "[系统默认]"

## ⚠️ 注意事项

### 备份建议
- 迁移会自动创建备份，但建议用户定期备份 `config.db` 文件

### 模型配置要求
- 至少需要配置一个模型才能使用AI功能
- 建议配置至少一个模型并设置为默认

### API密钥安全
- API密钥在SQLite中加密存储（使用现有的加密机制）
- 迁移过程中会保持加密状态

## 🚀 测试建议

### 测试场景

1. **新用户测试**
   - 删除 `~/.db-ai` 目录
   - 启动程序
   - 添加第一个模型
   - 验证模型保存和加载

2. **旧用户迁移测试**
   - 备份现有的 `ai_models.json`
   - 启动程序
   - 验证自动迁移
   - 检查所有模型配置是否正确
   - 验证上次使用的模型是否正确

3. **编辑功能测试**
   - 编辑默认模型
   - 更改默认模型配置
   - 删除模型
   - 添加新模型

## 📝 版本历史

- **v1.2.0** (2025-12-12)
  - 完全迁移到SQLite
  - 移除JSON文件和硬编码默认模型
  - 支持所有模型可编辑
  - 自动数据迁移

## 🔗 相关文档

- [AI模型配置说明](./AI_MODEL_USAGE.md)
- [构建说明](../README_BUILD.md)
- [数据库配置](./DATABASE_CONFIG.md)

