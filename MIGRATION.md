# 迁移到 TypeScript 桌面端

PyQt6 应用（`src/`、`python src/main.py`）保持原样。本文件只记录桌面端重写的顺序。当前仓库没有可延续的 `electron/` 前端，所以 Milestone 1 直接新建 `apps/desktop`，不在旧页面上打补丁。

## 已落地（Milestone 1）

- Electron + Vite + React + TypeScript 工作区
- 连接树、Monaco SQL、可横向滚动的查询/结果标签、深色助手卡片、状态栏
- 本地连接存储。密码和模型密钥走系统密钥环；不可用时不落明文
- SQLite 执行（`better-sqlite3`）和 OpenAI 兼容的流式自然语言转 SQL
- 未配置模型时，本地预览仍按流式卡片起草 SQL

## 已落地（Milestone 2）

- MySQL、MariaDB（`mysql2`）和 PostgreSQL（`pg`）在主进程执行。对象树加载表和列，SQL 遇错即停
- 连不上时，侧栏用错误卡片说明原因；对话框可以单独测试。方言用色标区分
- Linux tip 包：`apps/desktop` 里 `npm run pack:tip`。Windows NSIS 只在作者的 Windows 机器上 `npm run dist:win`。PyInstaller 安装包不动

## 接下来

1. **其余驱动。** SQL Server、Oracle、Hive。对象树继续用现在的表 / 列结构。
2. **Redis。** 独立的键空间、类型和值视图，不把 Redis 塞进 SQL 结果表。
3. **助手工具。** 用 TypeScript 重做现在 LangGraph 里的选表、读结构、枚举、执行失败后改写。流式卡片继续展示步骤，而不是只给最终 SQL。
4. **建表 / 改表 / 结构同步 / Navicat 导入 / 记忆。** 沿用现有产品能力，交互放进同一个深色工作区。
5. **结果表。** 大结果虚拟滚动、单元格编辑、导出。标签滚动行为保持不变。
6. **文案。** 把界面字符串抽成中英资源。安装包仍以 PyQt 为默认发行物，TS 端目前只出 tip。
7. **体验继续打磨。** 查询历史、命令面板、结果固定列、助手步骤时间线。密度和层级保持现在这套，不退回表单式工具窗口。
