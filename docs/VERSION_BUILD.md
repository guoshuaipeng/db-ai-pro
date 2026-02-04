# 版本号自动生成说明

## 📋 概述

项目已实现**自动生成日期时间版本号**功能。打包时会自动根据当前日期和时间生成版本号，格式为 `YYYY.MM.DD.HHMM`。

## 🎯 版本号格式

### 格式说明

**日期时间格式**: `YYYY.MM.DD.HHMM`

- **YYYY**: 年份（4位）
- **MM**: 月份（2位，01-12）
- **DD**: 日期（2位，01-31）
- **HH**: 小时（2位，00-23）
- **MM**: 分钟（2位，00-59）

### 示例

```
2025.01.20.1430  # 2025年1月20日 14:30 构建
2025.12.25.0930  # 2025年12月25日 09:30 构建
```

## 🔧 工作原理

### 1. 版本号生成逻辑

**`src/__init__.py`**:

```python
def get_version():
    """获取版本号"""
    # 打包时会设置 BUILD_VERSION 环境变量
    build_version = os.environ.get('BUILD_VERSION')
    if build_version:
        return build_version
    
    # 开发环境：使用日期时间格式（实时生成）
    now = datetime.now()
    return now.strftime("%Y.%m.%d.%H%M")

__version__ = get_version()
```

**说明**：
- **开发环境**：每次运行应用时，版本号是当前日期时间（实时生成）
- **打包环境**：打包脚本会生成版本号并设置 `BUILD_VERSION` 环境变量，打包的版本号是固定的

### 2. 打包时自动生成

**打包脚本流程**：

1. 运行 `scripts/generate_build_version.py` 生成版本号
2. 更新 `pyproject.toml` 中的版本号
3. 设置 `BUILD_VERSION` 环境变量（供打包使用）
4. 执行 PyInstaller 打包

**生成脚本**: `scripts/generate_build_version.py`

```python
# 生成版本号
version = datetime.now().strftime("%Y.%m.%d.%H%M")
# 例如: "2025.01.20.1430"

# 更新文件
update_version_files(version)
# 设置环境变量
os.environ['BUILD_VERSION'] = version
```

## 📝 使用方法

### 手动生成版本号

如果需要在打包前手动生成版本号：

```bash
# Windows
python scripts\generate_build_version.py

# Linux/Mac
python3 scripts/generate_build_version.py
```

### 打包时自动生成

打包脚本会自动生成版本号：

```bash
# Windows
build_exe.bat

# Linux/Mac
./build_exe.sh
```

**打包流程**：
1. ✅ 清理旧文件
2. ✅ 检查依赖
3. ✅ 生成图标
4. ✅ **生成构建版本号** ← 自动生成日期时间版本号
5. ✅ 执行打包

### 查看当前版本号

**运行应用**：
- 关于对话框会显示当前版本号
- 如果是开发环境，每次运行版本号可能不同（实时日期时间）

**查看代码**：
```python
from src import __version__
print(__version__)  # 例如: "2025.01.20.1430"
```

## 🔍 版本号使用位置

### ✅ 自动更新

打包脚本会自动更新以下文件：

1. **`src/__init__.py`**
   - 通过环境变量 `BUILD_VERSION` 设置
   - 开发环境：实时生成日期时间版本号

2. **`pyproject.toml`**
   - 自动更新 `version = "YYYY.MM.DD.HHMM"`

3. **`build_mac.spec`**（如果存在）
   - 自动更新 `CFBundleShortVersionString` 和 `CFBundleVersion`

### ⚠️ 手动同步

以下位置可能需要手动同步（如果需要）：

- GitHub Release 标签
- README 文件中的版本号
- 其他文档中的版本号

## 💡 使用场景

### 开发环境

- **每次运行应用**：版本号是当前日期时间
- **便于区分**：不同时间运行的应用有不同的版本号
- **调试方便**：可以快速识别应用的构建时间

### 打包环境

- **打包时固定**：打包脚本生成一个固定的日期时间版本号
- **可追溯性**：版本号包含构建时间，便于追溯问题
- **自动管理**：无需手动更新版本号

## 🚀 优势

### ✅ 自动管理

- 无需手动更新版本号
- 每次打包自动生成新的版本号
- 减少人为错误

### ✅ 时间可追溯

- 版本号包含构建时间
- 可以快速识别软件的构建时间
- 便于问题追溯和版本管理

### ✅ 唯一性

- 每个构建都有唯一的版本号（基于时间）
- 避免版本号冲突
- 便于版本比较

## 📊 版本号示例

### 开发环境

```python
# 2025年1月20日 14:30 运行应用
__version__ = "2025.01.20.1430"

# 2025年1月20日 15:45 运行应用
__version__ = "2025.01.20.1545"
```

### 打包环境

```bash
# 2025年1月20日 14:30 打包
BUILD_VERSION=2025.01.20.1430
# 打包后的应用版本号始终是 2025.01.20.1430
```

## 🔧 自定义版本号格式

如果需要修改版本号格式，可以编辑 `src/__init__.py` 和 `scripts/generate_build_version.py`：

### 示例 1: 添加秒数

```python
# 格式: YYYY.MM.DD.HHMMSS
now.strftime("%Y.%m.%d.%H%M%S")
# 示例: 2025.01.20.143045
```

### 示例 2: 简化格式

```python
# 格式: YYYYMMDDHHMM
now.strftime("%Y%m%d%H%M")
# 示例: 202501201430
```

### 示例 3: 包含日期分隔符

```python
# 格式: YYYY-MM-DD-HHMM
now.strftime("%Y-%m-%d-%H%M")
# 示例: 2025-01-20-1430
```

## 📝 注意事项

1. **版本号唯一性**：确保打包时间不冲突（同一分钟内多次打包会有相同版本号）
2. **Git 提交**：打包后 `pyproject.toml` 会改变，可以选择提交或不提交
3. **开发环境**：开发环境的版本号是动态的，每次运行可能不同
4. **版本比较**：更新检查器使用字符串比较，日期时间格式可以直接比较

## 🎯 与更新检查的兼容性

版本号自动生成与更新检查功能完全兼容：

- 更新检查器会从 `src.__version__` 读取当前版本号
- 版本号比较使用字符串比较（日期时间格式可以正常比较）
- GitHub Release 的版本号可以是日期时间格式或语义化版本

---

**记住**：打包时版本号会自动生成，无需手动管理！🎉
