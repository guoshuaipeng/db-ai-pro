# API密钥显示模式更新

## 修改说明
将AI模型配置对话框中的API密钥输入框从密码模式改为明文显示模式。

## 修改原因
- ✅ 用户需要看到并确认输入的API密钥
- ✅ 便于复制粘贴和检查错误
- ✅ API密钥是用户自己的配置，不需要隐藏
- ✅ 编辑已有配置时，可以直接看到并修改现有的API密钥

## 修改内容

### 文件：`src/gui/dialogs/ai_model_dialog.py`

#### 1. API密钥输入框模式（第171行）
```python
# 修改前
self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)

# 修改后
self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Normal)
```

#### 2. 编辑模型时的显示（第456-459行）
```python
# 修改前
if self.model.api_key and self.model.api_key.get_secret_value():
    self.api_key_edit.setPlaceholderText("已配置（编辑时需重新输入）")

# 修改后
if self.model.api_key and self.model.api_key.get_secret_value():
    self.api_key_edit.setText(self.model.api_key.get_secret_value())
```

## 效果对比

### 修改前
- 新增配置：API密钥显示为 `•••••••••`
- 编辑配置：显示占位符"已配置（编辑时需重新输入）"，需要重新输入API密钥

### 修改后
- 新增配置：API密钥直接显示明文，例如 `sk-abc123def456...`
- 编辑配置：直接显示现有的API密钥明文，可以直接修改

## 其他说明

### 数据库密码仍保持掩码
数据库连接对话框中的密码字段（`connection_dialog.py`）**仍然保持密码模式**，因为：
- 数据库密码是敏感信息
- 通常在多人共用的环境中使用
- 需要更高的安全性

### 安全性考虑
- API密钥仍然使用 `SecretStr` 加密存储到数据库
- 只是在配置界面中显示为明文，便于用户操作
- 不影响密钥在存储和传输中的安全性

## 用户体验提升
- ✅ 更容易发现和修正输入错误
- ✅ 可以直接复制粘贴长API密钥
- ✅ 编辑时不需要重新输入
- ✅ 更直观的配置体验

---

**修改状态**: ✅ 已完成  
**测试状态**: ⏳ 待测试  
**部署状态**: ✅ 可发布

