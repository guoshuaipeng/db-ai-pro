# DataAI 桌面端（TypeScript）

这是 DataAI 的新桌面壳。技术栈是 Electron、Vite、React、TypeScript。当前完整产品仍是仓库里的 PyQt6 应用，本目录不替换它，也不替换 PyInstaller 安装包。

## 安装与运行

```bash
cd apps/desktop
npm install
npm run dev
```

`npm install` 会为当前 Electron 重新编译 `better-sqlite3`。如果原生模块没有编出来，再执行：

```bash
npm run rebuild:native
```

其他命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发窗口 |
| `npm run dev:web` | 只开界面预览（不能打开网络数据库） |
| `npm test` | 语句切分、标识符、错误文案；有环境变量时连真实库 |
| `npm run typecheck` | 主进程与界面的 TypeScript 检查 |
| `npm run smoke` | 在 Electron 里建示例库并执行 SQLite |
| `npm run smoke:servers` | 对 `DATAAI_MYSQL` / `DATAAI_PG` 做实库冒烟 |
| `npm run build` | 产出 `out/` |
| `npm run pack:tip` | Linux tip 包，见下文 |

在仓库根目录也可以：

```bash
npm run desktop:install
npm run desktop
npm run desktop:pack
```

## 这一版能做什么

- 连接、对象、SQL、结果、助手五段工作区，深色主题
- 查询标签和结果标签横向滚动，标题不会被压短
- Monaco SQL 编辑器，F5 或 Ctrl/⌘ Enter 运行
- SQLite（`better-sqlite3`）、MySQL / MariaDB（`mysql2`）、PostgreSQL（`pg`）在主进程执行
- 对象树读取当前库的表和列。点表名会按方言生成 `SELECT`（MySQL / MariaDB 用反引号，其余用双引号）
- 连接失败时，树里留下错误卡片，而不是只弹一条提示。对话框里的「测试」只探测，不强制保存
- 多条语句遇到第一条错误就停止
- 连接与模型密钥优先用 Electron `safeStorage` 加密；系统没有密钥环时不把密码写入磁盘
- OpenAI 兼容接口的流式自然语言转 SQL；未配置密钥时用本地预览流式起草。已打开的 SQLite / MySQL / PostgreSQL 会把表结构交给起草

首次启动会在用户数据目录放一个「示例业务库」，并恢复一组可执行的查询标签。删掉全部连接后，侧栏会给出新建连接和恢复示例库。

Oracle、SQL Server、Hive、Redis 仍只保存连接。

### 实库冒烟

没有 Docker 时，在本机起一个 MySQL 或 MariaDB，以及 PostgreSQL，然后：

```bash
export DATAAI_MYSQL='mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE'
export DATAAI_PG='postgres://USER:PASSWORD@127.0.0.1:5432/DATABASE'
npm run smoke:servers
```

没设这两个变量时，`npm test` 仍会跑驱动能加载、拒绝端口会写成中文的检查，并跳过实库用例。界面预览（`npm run dev:web`）不会去连这些服务器。

在这台开发环境上，冒烟打过 MariaDB 10.11（MySQL 协议，端口 3306）和 PostgreSQL 16（端口 5432）。没有另起一套 Oracle MySQL。MariaDB 与 MySQL 共用 `mysql2`。

## Linux tip 包

PyQt 的 `build_exe` 不变。TypeScript 壳另外用 electron-builder 出夜间包，产物在 `apps/desktop/release/`，不提交进仓库。

在 Linux 上：

```bash
cd apps/desktop
npm install
npm run pack:tip
```

这会先编译 `out/`，再打 `release/DataAI-0.2.0-linux-tip.tar.gz`。解压后运行里面的 `dataai-desktop`。`better-sqlite3` 会按当前 Electron 重编译，并在打包时从 asar 里拆出来。

## Windows 安装包（作者机器）

不要在 Linux 上交叉编译 Windows 包。在 Windows 上安装 Node.js，以及能编译原生模块的 Visual Studio C++ 生成工具，然后：

```bash
cd apps/desktop
npm install
npm run dist:win
```

产物是 `release/DataAI-0.2.0-win-tip.exe`（NSIS，可选安装目录）。这还不是对外发布物，PyInstaller 打出来的 DataAI.exe 仍然是默认安装包。

## 仍由 Python 提供

PyQt6 界面、LangGraph 智能体、SQL Server / Oracle / Hive / Redis 驱动、Navicat 导入、记忆、表结构同步和 PyInstaller 安装包都还在 `src/`。运行方式不变：

```bash
python src/main.py
```

后续里程碑见仓库根目录的 [MIGRATION.md](../../MIGRATION.md)。
