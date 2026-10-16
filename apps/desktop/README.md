# DataAI 桌面端（TypeScript）

这是 DataAI 的新桌面壳，Milestone 1。技术栈是 Electron、Vite、React、TypeScript。当前完整产品仍是仓库里的 PyQt6 应用，本目录不替换它。

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
| `npm run dev:web` | 只开界面预览（不执行真实 SQLite） |
| `npm test` | 语句切分、标签种子、树过滤 |
| `npm run typecheck` | 主进程与界面的 TypeScript 检查 |
| `npm run smoke` | 在 Electron 里建示例库并执行 SQL |
| `npm run build` | 产出 `out/` |

在仓库根目录也可以：

```bash
npm run desktop:install
npm run desktop
```

## 这一版能做什么

- 连接、对象、SQL、结果、助手五段工作区，深色主题
- 查询标签和结果标签横向滚动，标题不会被压短
- Monaco SQL 编辑器，F5 或 Ctrl/⌘ Enter 运行
- SQLite 通过 `better-sqlite3` 在主进程执行，支持多条语句
- 连接与模型密钥优先用 Electron `safeStorage` 加密；系统没有密钥环时不把密码写入磁盘
- OpenAI 兼容接口的流式自然语言转 SQL；未配置密钥时用本地预览流式起草

首次启动会在用户数据目录放一个「示例业务库」，并恢复一组可执行的查询标签。删掉全部连接后，侧栏会给出新建连接和恢复示例库。

MySQL、PostgreSQL、Oracle、SQL Server、Hive、Redis 可以保存连接，本里程碑不执行。

## 仍由 Python 提供

PyQt6 界面、LangGraph 智能体、多数据库驱动、Navicat 导入、记忆、表结构同步和安装包都还在 `src/`。运行方式不变：

```bash
python src/main.py
```

后续里程碑见仓库根目录的 [MIGRATION.md](../../MIGRATION.md)。
