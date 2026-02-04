# 版本号管理说明

## 📋 版本号统一管理

为了保持版本号的一致性，项目采用**单一版本号源**的管理方式。

## 🎯 版本号定义位置

### 主版本号源（唯一修改位置）

**`src/__init__.py`**

```python
__version__ = "0.2.0"
```

⚠️ **重要**：这是项目中**唯一应该修改版本号的地方**。所有其他地方的版本号都从这里导入。

## 📍 版本号的使用位置

### 1. ✅ 已自动导入（无需手动更新）

- **`src/config/settings.py`**
  - 自动从 `src.__version__` 导入
  - 用于配置类中的默认版本号

- **`src/core/update_checker.py`**
  - 自动从 `src.__version__` 导入
  - 用于版本比较和更新检查

- **`src/gui/dialogs/update_dialog.py`**
  - 自动从 `src.__version__` 导入
  - 显示当前版本号

- **`src/gui/dialogs/about_dialog.py`**
  - 自动从 `src.__version__` 导入
  - 显示版本号

### 2. ⚠️ 需要手动同步

**`pyproject.toml`**

```toml
[project]
version = "0.2.0"  # 请与 src/__init__.py 中的 __version__ 同步
```

**说明**：`pyproject.toml` 是 TOML 格式，无法直接从 Python 代码导入。在修改版本号时，需要手动更新这个文件以保持同步。

## 🔧 如何更新版本号

### 步骤 1：修改主版本号

编辑 `src/__init__.py`：

```python
__version__ = "0.3.0"  # 修改为新版本号
```

### 步骤 2：同步 pyproject.toml

编辑 `pyproject.toml`：

```toml
[project]
version = "0.3.0"  # 与 src/__init__.py 保持一致
```

### 步骤 3：验证

运行应用，检查以下位置是否正确显示新版本号：
- 关于对话框
- 更新检查器中的当前版本
- 配置类中的版本号

## 📝 版本号命名规范

建议使用 [语义化版本](https://semver.org/lang/zh-CN/)（Semantic Versioning）：

```
主版本号.次版本号.修订号
```

- **主版本号**：当你做了不兼容的 API 修改
- **次版本号**：当你做了向下兼容的功能性新增
- **修订号**：当你做了向下兼容的问题修正

例如：
- `0.2.0` - 当前版本
- `0.3.0` - 下一个次要版本
- `1.0.0` - 第一个正式版本

## 🔍 版本号检查清单

更新版本号后，请检查以下位置：

- [ ] `src/__init__.py` - 主版本号源
- [ ] `pyproject.toml` - 项目配置（手动同步）
- [ ] 关于对话框中的版本号显示
- [ ] 更新检查功能中的当前版本
- [ ] GitHub Release 标签（如果有）

## 💡 自动化建议

可以考虑创建一个脚本来自动同步版本号：

```python
# scripts/sync_version.py
import re
from pathlib import Path

def sync_version(new_version: str):
    # 更新 src/__init__.py
    init_file = Path("src/__init__.py")
    content = init_file.read_text()
    content = re.sub(r'__version__ = ".*"', f'__version__ = "{new_version}"', content)
    init_file.write_text(content)
    
    # 更新 pyproject.toml
    pyproject_file = Path("pyproject.toml")
    content = pyproject_file.read_text()
    content = re.sub(r'version = ".*"', f'version = "{new_version}"', content)
    pyproject_file.write_text(content)
    
    print(f"版本号已更新为: {new_version}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        sync_version(sys.argv[1])
    else:
        print("用法: python scripts/sync_version.py 0.3.0")
```

---

**记住**：只需修改 `src/__init__.py` 和 `pyproject.toml`，其他地方的版本号会自动更新！
