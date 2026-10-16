# DataAI Desktop（TypeScript）

本地优先的数据库工作台：连接管理、Monaco SQL、多引擎查询、结果分析、表结构 / 外键一览、CSV·Excel 导入、手动事务、AI 助手（可选）。

**版本：1.4.0**（基于 1.0.0 本地 RC） — 功能对齐 M3–M18；**尚未**做 GitHub Releases 发版。

## 要求

- Node.js 20+（建议 LTS）
- Windows / Linux；macOS 可开发，未作为发版主路径
- 原生模块 `better-sqlite3`：开发机需能编译（Windows 通常需要 **Visual Studio Build Tools** + 桌面 C++ 工作负载）。日常 Soft QA 使用 `npm install --ignore-scripts` 可跳过重建。

## Soft QA / 开发

在仓库中的本目录执行：

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```

| 命令 | 作用 |
|------|------|
| `npm test` | Vitest 单元测试 |
| `npm run typecheck` | `tsc`（main + renderer） |
| `npm run smoke` | 构建后跑内置 SQLite 冒烟 |
| `npm run dev` | Electron 开发窗 |
| `npm run rebuild:native` | 按当前 Electron 重建 better-sqlite3 |

工作区副本路径示例：`E:\pythonProjects\db-ai\_ts_workspace\db-ai-pro-m2\apps\desktop`。

## 已接入驱动

| 引擎 | 查询 | 表结构 / 外键 | 事务 | 备注 |
|------|------|----------------|------|------|
| SQLite | ✅ | ✅ | ✅ | 示例零售库可一键恢复 |
| MySQL / MariaDB | ✅ | ✅ | ✅ | |
| PostgreSQL | ✅ | ✅ | ✅ | public schema |
| SQL Server | ✅ | ✅ | ✅ | |
| Redis | 键浏览器 | — | — | 不用 SQL 编辑器 |
| Oracle / Hive | 仅保存连接 | — | — | 执行未接入（本 RC 范围外） |

## 主要能力（M3–M18）

- 无边框深色 TitleBar、状态栏、Ctrl+K 命令面板、F1 快捷键
- SQL 多标签、格式化（Shift+Alt+F）、查找/替换（Ctrl+F / Ctrl+H）
- 取消 / 超时、破坏性 SQL 确认、结果多页与图表
- 表结构（列 / 索引 / 关系 / DDL）、样例数据、列统计、导入向导
- 手动事务（状态栏「事务中」）
- Schema Diff：两表列级对比 + 建议 ALTER 预览
- 收藏文件夹；结果表快速筛选
- 结果表列排序 / 固定列 / 行号
- 深色主题抛光；设置高对比度
- 连接导入导出、查询历史与收藏、AI 助手（需配置）

详见 [CHANGELOG.md](./CHANGELOG.md)。

## Tip-pack / 便携包（阻塞说明）

`npm run pack:tip` / `dist:win:portable` 会走 `electron-builder` 打包。在未安装 **Visual Studio Build Tools**（或等价 C++ 工具链）的机器上，`better-sqlite3` 重建与原生依赖打包常会失败。

- **本机 RC 以 Soft QA + `npm run dev` 为准**，不强制打 tip 包。
- 需要 tip 时：先装好 VS Build Tools，再 `npm run rebuild:native`，然后 `npm run pack:tip`。

## 许可

MIT
