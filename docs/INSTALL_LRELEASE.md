# 安装 lrelease 工具的方法

`lrelease` 是 Qt 工具链中的翻译文件编译工具，用于将 `.ts` 文件编译为 `.qm` 文件。

## 方法1: 安装 Qt6 开源版本（推荐，免费）

Qt6 有开源版本（LGPL/GPL 许可证），个人和开源项目可以免费使用。

### Windows

1. **下载 Qt6 安装程序**
   - 访问：https://www.qt.io/download-open-source
   - 选择 "Qt Online Installer" 或 "Qt Offline Installer"
   - 注册 Qt 账号（免费）

2. **安装步骤**
   - 运行安装程序
   - 登录或注册账号
   - 选择安装路径（建议默认）
   - **重要**：在组件选择页面，确保勾选：
     - `Qt 6.x.x` (选择最新版本)
     - `Qt 6.x.x Tools` (包含 lrelease)
     - `MinGW` 或 `MSVC` 编译器（选择一个即可）

3. **配置环境变量**
   - 安装完成后，将 Qt 的 bin 目录添加到 PATH
   - 例如：`C:\Qt\6.x.x\mingw_xx\bin` 或 `C:\Qt\6.x.x\msvc_xx\bin`
   - 或者在安装时选择 "Add to PATH"

4. **验证安装**
   ```bash
   lrelease -version
   ```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install qt6-tools-dev
```

### Linux (Fedora)

```bash
sudo dnf install qt6-devel
```

### macOS

```bash
brew install qt6
```

## 方法2: 使用包管理器（Windows）

### 使用 Chocolatey

```bash
# 安装 Chocolatey（如果未安装）
# 访问：https://chocolatey.org/install

# 安装 Qt6 工具
choco install qtcreator
```

### 使用 winget

```bash
winget install Qt.QtCreator
```

注意：这些可能只安装 Qt Creator，不一定包含 lrelease。

## 方法3: 只下载 lrelease 工具（最小安装）

### Windows

1. 访问 Qt 官方下载页面
2. 下载 "Qt Maintenance Tool"
3. 使用维护工具只安装 "Qt 6.x.x Tools" 组件

## 方法4: 使用 Docker（无需本地安装）

```bash
# 使用包含 Qt 工具的 Docker 镜像
docker run -it -v $(pwd):/workspace qt:latest bash
cd /workspace
lrelease translations/dataai_en_US.ts -qm translations/dataai_en_US.qm
```

## 方法5: 使用在线工具（无需安装）

1. 搜索 "ts to qm converter online"
2. 上传 `.ts` 文件
3. 下载生成的 `.qm` 文件
4. 保存到项目目录

## 方法6: 使用预编译的 lrelease（如果可用）

某些社区可能提供独立的 lrelease 可执行文件，但官方不提供。

## 方法7: 从 PyQt6 安装目录查找

有时 PyQt6 的完整安装可能包含工具：

```bash
# 检查 PyQt6 安装目录
python -c "import PyQt6; import os; print(os.path.dirname(PyQt6.__file__))"
# 然后检查该目录下的 Qt6/bin/lrelease.exe
```

## 推荐方案

对于 Windows 用户，**推荐使用方法1**：
- Qt6 开源版本完全免费（LGPL 许可证）
- 安装简单，有图形界面
- 只需要安装工具组件，不需要完整 SDK
- 安装大小约 200-500MB（只安装工具）

## 验证安装

安装完成后，运行：

```bash
lrelease -version
```

如果显示版本信息，说明安装成功。

## 生成 .qm 文件

安装成功后，运行：

```bash
lrelease resources/translations/dataai_en_US.ts -qm resources/translations/dataai_en_US.qm
```

## 注意事项

1. **许可证**：Qt6 开源版本使用 LGPL/GPL 许可证，对于开源项目和个人使用是免费的
2. **商业使用**：如果用于商业闭源项目，需要购买商业许可证
3. **最小安装**：如果只需要 lrelease，可以只安装 "Qt Tools" 组件，不需要完整的 Qt SDK

## 快速开始（Windows）

1. 访问：https://www.qt.io/download-open-source
2. 下载并运行 Qt Online Installer
3. 注册/登录账号
4. 选择安装路径
5. **只选择**：`Qt 6.x.x` 和 `Qt 6.x.x Tools`
6. 完成安装
7. 将 `C:\Qt\6.x.x\mingw_xx\bin` 添加到 PATH
8. 运行 `lrelease -version` 验证

