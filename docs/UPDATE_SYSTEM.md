# 软件升级系统使用指南

## 📋 概述

DB-AI 已集成自动升级功能，支持通过 GitHub Releases 或自定义 API 检查更新。

## 🚀 功能特性

### ✅ 核心功能

1. **自动检查更新**
   - 应用启动时可选自动检查（可配置）
   - 后台检查，不阻塞主界面

2. **手动检查更新**
   - 在"关于"对话框中点击"检查更新"按钮
   - 立即检查是否有新版本

3. **更新下载**
   - 自动下载最新版本安装包
   - 显示下载进度
   - 支持断点续传（通过 urllib）

4. **智能安装**
   - Windows: 自动启动安装程序
   - macOS: 自动打开 DMG 文件
   - Linux: 自动设置执行权限并运行

5. **版本比较**
   - 自动比较版本号（支持语义化版本）
   - 只提示有新版本时才显示更新对话框

## 📁 文件结构

```
src/
├── core/
│   └── update_checker.py          # 更新检查器（核心逻辑）
├── gui/
│   ├── dialogs/
│   │   └── update_dialog.py       # 更新对话框（UI）
│   └── workers/
│       └── update_check_worker.py # 更新检查工作线程
└── main_window.py                  # 主窗口（集成检查更新功能）
```

## 🔧 配置

### 1. 使用 GitHub Releases（已配置 ✅）

已配置使用 GitHub Releases API，仓库信息：
- **仓库地址**: https://github.com/guoshuaipeng/db-ai-pro
- **Owner**: `guoshuaipeng`
- **Repo**: `db-ai-pro`

**配置位置**: `src/gui/main_window.py` 的 `check_for_updates()` 方法

```python
self.update_check_worker = UpdateCheckWorker(
    owner="guoshuaipeng",  # GitHub 用户名
    repo="db-ai-pro",      # 仓库名
    use_custom_api=False   # 使用 GitHub Releases API
)
```

**自动检查更新**: 应用启动后 3 秒自动检查更新（静默检查，只有发现新版本时才提示）

### 2. 使用自定义 API

如果你有自己的更新服务器，可以实现自定义 API：

**API 端点**: `GET https://your-domain.com/api/update/check`

**请求参数**:
- `current_version`: 当前版本号（例如 "0.2.0"）
- `platform`: 操作系统（Windows/Linux/Darwin）
- `arch`: 架构（x86_64 等）

**响应格式**:
```json
{
    "has_update": true,
    "version": "0.3.0",
    "download_url": "https://your-domain.com/releases/v0.3.0/DataAI-0.3.0.exe",
    "release_notes": "修复了一些 bug...",
    "release_date": "2024-01-20",
    "mandatory": false
}
```

配置代码：

```python
self.update_check_worker = UpdateCheckWorker(
    owner="",  # 使用自定义 API 时不需要
    repo="",   # 使用自定义 API 时不需要
    use_custom_api=True  # 启用自定义 API
)
```

## 📦 GitHub Releases 设置

### 1. 创建 Release

1. 在 GitHub 仓库中，点击 **Releases** → **Create a new release**
2. 填写版本号（例如 `v0.3.0`）
3. 填写发布标题和说明
4. **上传安装包**到 Release 的 assets 中：
   - Windows: `DataAI-0.3.0.exe`
   - macOS: `DataAI-0.3.0.dmg` 或 `DataAI-0.3.0.pkg`
   - Linux: `DataAI-0.3.0.AppImage` 或 `DataAI-0.3.0.deb`

### 2. 版本号规则

- 使用语义化版本号（Semantic Versioning）
- 格式：`主版本号.次版本号.修订号`（例如 `0.3.0`）
- GitHub Release 标签可以是 `v0.3.0` 或 `0.3.0`（代码会自动处理）

### 3. 下载链接自动识别

更新检查器会根据操作系统自动选择对应的安装包：
- **Windows**: 优先选择 `.exe` 文件
- **macOS**: 优先选择 `.dmg`，其次 `.pkg`
- **Linux**: 优先选择 `.AppImage`，其次 `.deb`

## 🎯 使用方法

### 方式1: 手动检查更新

1. 打开应用
2. 点击菜单栏 → **帮助** → **关于**
3. 在"关于"对话框中点击 **"🔄 检查更新"** 按钮
4. 如果有新版本，会弹出更新对话框

### 方式2: 自动检查更新（推荐）

在应用启动时自动检查更新（静默检查，只有发现新版本时才提示）：

```python
# 在 main.py 或 MainWindow.__init__() 中添加
from PyQt6.QtCore import QTimer

# 延迟 3 秒后检查更新（避免影响启动速度）
QTimer.singleShot(3000, lambda: window.check_for_updates(auto_check=True))
```

## 🛠️ 代码示例

### 在主窗口中添加自动检查

```python
# src/gui/main_window.py

def __init__(self, ...):
    super().__init__()
    # ... 其他初始化代码 ...
    
    # 延迟自动检查更新（可选）
    from PyQt6.QtCore import QTimer
    QTimer.singleShot(5000, lambda: self.check_for_updates(auto_check=True))
```

### 在菜单栏添加"检查更新"选项

```python
# 在创建菜单栏的代码中添加
help_menu = menu_bar.addMenu("帮助")
check_update_action = QAction("检查更新", self)
check_update_action.triggered.connect(lambda: self.check_for_updates(show_no_update=True))
help_menu.addAction(check_update_action)
```

## 🔍 调试

### 查看日志

更新检查的日志会输出到控制台：

```
INFO - 开始检查更新...
INFO - 发现新版本: 0.3.0 (当前版本: 0.2.0)
```

### 常见问题

#### 1. 检查更新失败

**原因**:
- 网络连接问题
- GitHub API 访问受限（需要 VPN）
- 仓库不存在或未公开

**解决方案**:
- 检查网络连接
- 使用 VPN（如果在受限地区）
- 确认仓库名和用户名正确

#### 2. 找不到下载链接

**原因**:
- Release 中没有上传 assets
- 文件名不符合命名规则

**解决方案**:
- 确保在 GitHub Release 中上传了安装包
- 文件名应包含 `.exe`（Windows）或 `.dmg`（macOS）等扩展名

#### 3. 版本号比较错误

**原因**:
- 版本号格式不正确（不是语义化版本）

**解决方案**:
- 使用标准的语义化版本号（例如 `0.3.0`）
- 不要使用 `v0.3.0` 作为版本号（GitHub Release 标签可以是 `v0.3.0`，但代码会自动处理）

## 📝 版本号管理

### 更新版本号

版本号定义在以下位置：

1. **`src/__init__.py`**:
```python
__version__ = "0.3.0"  # 更新这里
```

2. **`pyproject.toml`**:
```toml
[project]
version = "0.3.0"  # 更新这里
```

3. **`src/gui/dialogs/about_dialog.py`**:
```python
version_label = QLabel("📌 版本 0.3.0")  # 更新这里
```

建议创建一个脚本统一更新所有位置的版本号。

## 🎨 自定义更新对话框

如果需要自定义更新对话框的样式或行为，可以修改 `src/gui/dialogs/update_dialog.py`。

## 🔒 安全考虑

1. **HTTPS 连接**: 确保下载链接使用 HTTPS
2. **文件校验**: 建议添加文件哈希校验（MD5/SHA256）
3. **签名验证**: 对于生产环境，建议对安装包进行代码签名

## 📚 相关文件

- `src/core/update_checker.py` - 更新检查器核心逻辑
- `src/gui/dialogs/update_dialog.py` - 更新对话框 UI
- `src/gui/workers/update_check_worker.py` - 更新检查工作线程
- `src/gui/main_window.py` - 主窗口集成

## 🚀 未来改进

- [ ] 添加自动更新安装（无需手动确认）
- [ ] 支持增量更新
- [ ] 添加更新日志展示
- [ ] 支持多语言更新说明
- [ ] 添加文件校验（MD5/SHA256）

---

*让用户始终使用最新版本，享受最新功能！* 🎉
