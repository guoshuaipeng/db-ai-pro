## DataAI 本地开发 / 打包 / 发布 Skill

### 作用

帮助你在本机完成 DataAI 项目的**提交代码、打包 EXE、发布到 GitHub/Gitee Release**的标准流程，并在需要时提醒前置条件（环境变量、版本号等）。

> 本 Skill 默认项目根目录：`e:\pythonProjects\db-ai`

---

### 触发语句示例

- 「帮我**提交一下本次代码**」
- 「帮我**重新打一个最新的 EXE**」
- 「帮我**发布到 Gitee / GitHub Release**」
- 「从头带我走一遍**提交流程 + 打包 + 发布**」

---

### 一、提交代码（Git 提交流程）

**前提**：本地改动已自测通过，提交信息统一用中文（用户约定）。

1. **查看当前状态**

   ```powershell
   cd e:\pythonProjects\db-ai
   git status
   ```

2. **确认改动内容**

   ```powershell
   git diff
   ```

3. **添加需要提交的文件**

   ```powershell
   git add <文件或目录路径>
   # 一般可以：
   git add src scripts .vscode
   ```

4. **使用中文提交说明（推荐格式）**

   ```powershell
   git commit -m "类型：一句话概述本次改动"
   ```

   示例：

   - `git commit -m "优化：AI 查询状态栏提示文案"`
   - `git commit -m "修复：CLI 连接列表命令在无配置时的异常"`
   - `git commit -m "特性：新增命令行 AI 查询入口"`

5. **可选：推送到远程**

   ```powershell
   git push origin main
   ```

---

### 二、打包 EXE（生成最新版本 DataAI.exe）

DataAI 使用 PyInstaller 打包，项目已经内置了打包脚本和 VSCode 启动配置。

#### 方式 A：直接用命令行打包（推荐）

在 PowerShell 中：

```powershell
cd e:\pythonProjects\db-ai
python scripts/run_build.py build_exe.bat
```

这个脚本会自动完成：

1. 清理旧的 `build/`、`dist/`、`__pycache__` 等目录；
2. 检查 PyInstaller 及主要依赖（必要时自动安装 requirements.txt）；
3. 生成 ICO 图标（失败则用 PNG 图标，不影响打包）；
4. 生成构建版本号（`scripts/generate_build_version.py`，失败则使用默认版本）；
5. 调用：

   ```powershell
   pyinstaller build_exe.spec --clean --noconfirm
   ```

打包成功后，输出在：

```text
e:\pythonProjects\db-ai\dist\DataAI.exe
e:\pythonProjects\db-ai\dist\VERSION.txt
```

#### 方式 B：在 VSCode 中使用调试配置打包

1. 打开 VSCode，确保工作区路径是 `e:\pythonProjects\db-ai`。
2. 打开左侧「运行和调试」面板。
3. 在配置列表中选择：

   - **「📦 打包 (build_exe.bat)」**

4. 点击「开始调试」按钮（或按 F5）运行。

这等价于执行：

```powershell
python scripts/run_build.py build_exe.bat
```

---

### 三、发布 DataAI.exe 到 GitHub / Gitee Release

发布脚本：`scripts/publish_release.py`  
会自动：

- 读取当前版本号（`VERSION.txt` 或 `pyproject.toml`）；
- 推送对应的 Git tag；
- 创建或复用 GitHub/Gitee 上的 Release；
- 上传 `dist\DataAI.exe` 作为版本附件。

#### 1. 事前准备：配置访问令牌（只需一次）

**GitHub Token（可选，如果只发 Gitee 可以略过）**

- 获取地址：`https://github.com/settings/tokens`
- 权限：至少包含 `repo`。
- 在 PowerShell 中执行一次（持久保存到用户环境变量）：

  ```powershell
  setx GITHUB_TOKEN "你的GitHub Token"
  ```

**Gitee Token（推荐配置）**

- 获取地址：`https://gitee.com/profile/personal_access_tokens`
- 权限：至少包含 `projects`。
- 在 PowerShell 中执行一次：

  ```powershell
  setx GITEE_ACCESS_TOKEN "你的Gitee Token"
  ```

重新打开一个新的 PowerShell 窗口后，脚本会自动读取这些环境变量。

#### 2. 一次性发布到 GitHub + Gitee

```powershell
cd e:\pythonProjects\db-ai
python scripts/publish_release.py
```

脚本会：

1. 确认 `dist\DataAI.exe` 是否存在；
2. 显示版本号和文件信息；
3. 让你输入本次「发布说明」（直接回车则使用默认模版）。

#### 3. 仅发布到 GitHub / 仅发布到 Gitee

- **仅 GitHub：**

  ```powershell
  python scripts/publish_release.py --github-only
  ```

- **仅 Gitee：**

  ```powershell
  python scripts/publish_release.py --gitee-only
  ```

#### 4. 预演发布（不真正创建 Release）

```powershell
python scripts/publish_release.py --dry-run
```

脚本会打印将要执行的操作，但不会创建 tag / Release 或上传文件。

#### 5. 在 VSCode 中快速执行发布脚本

在 `.vscode/launch.json` 中已经配置了几种发布模式，你可以通过 VSCode 的「运行和调试」面板直接使用：

- **「🚀 发布到 GitHub + Gitee」**  
  等价于：`python scripts/publish_release.py`

- **「🐙 仅发布到 GitHub」**  
  等价于：`python scripts/publish_release.py --github-only`

- **「🦊 仅发布到 Gitee」**  
  等价于：`python scripts/publish_release.py --gitee-only`

- **「🧪 发布预演 (Dry-Run)」**  
  等价于：`python scripts/publish_release.py --dry-run`

---

### 四、推荐的一键日常流程（手动）

