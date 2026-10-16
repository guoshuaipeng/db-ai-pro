# 迁移到 TypeScript 桌面端

PyQt6 应用（`src/`、`python src/main.py`）保持原样。本文件只记录桌面端重写的顺序。当前仓库没有可延续的 `electron/` 前端，所以 Milestone 1 直接新建 `apps/desktop`，不在旧页面上打补丁。

## 已落地（Milestone 1）

- Electron + Vite + React + TypeScript 工作区
- 连接树、Monaco SQL、可横向滚动的查询/结果标签、深色助手卡片、状态栏
- 本地连接存储。密码和模型密钥走系统密钥环；不可用时不落明文
- SQLite 执行（`better-sqlite3`）和 OpenAI 兼容的流式自然语言转 SQL
- 未配置模型时，本地预览仍按流式卡片起草 SQL

## 接下来

1. **多数据库驱动。** 按现有 Python 方言接入 MySQL / MariaDB、PostgreSQL，再是 SQL Server、Oracle、Hive。对象树改为真实库、表、列，而不是“已保存”占位。
2. **Redis。** 独立的键空间、类型和值视图，不把 Redis 塞进 SQL 结果表。
3. **助手工具。** 用 TypeScript 重做现在 LangGraph 里的选表、读结构、枚举、执行失败后改写。流式卡片继续展示步骤，而不是只给最终 SQL。
4. **建表 / 改表 / 结构同步 / Navicat 导入 / 记忆。** 沿用现有产品能力，交互放进同一个深色工作区。
5. **结果表。** 大结果虚拟滚动、单元格编辑、导出。标签滚动行为保持不变。
6. **文案与打包。** 把界面字符串抽成中英资源；用 electron-builder 出安装包。PyQt 仍是默认发行物，直到 TS 端覆盖日常查询。
7. **体验继续打磨。** 查询历史、命令面板、结果固定列、助手步骤时间线。密度和层级保持现在这套，不退回表单式工具窗口。
