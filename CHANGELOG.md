# DataAI 更新日志

TypeScript 桌面端（当前主力迭代）见：[`apps/desktop/CHANGELOG.md`](apps/desktop/CHANGELOG.md)。

本仓库根目录另有历史 Python / 发行说明；**TS Desktop 1.0.0 为本地 RC**，未推 GitHub Releases。


TypeScript / Electron 桌面端（`apps/desktop`）。本文件对应本机迭代里程碑；**1.0.0 为本地 RC**，尚未发布到 GitHub Releases。

## 1.3.0 — M22 列排序 / 固定列 + 行号

- 结果表排序、钉列、行号

## 1.2.0 — M21 收藏文件夹 + 结果筛选

- 收藏文件夹；结果表客户端筛选

## 1.1.0 — M20 Schema Diff

- 表结构列级对比（可跨连接）；建议 ALTER 预览插入编辑器
- 入口：表结构「对比结构」/ Ctrl+K

## 1.0.0 — 2026-10-16（本地 RC）

- 文档与关于页对齐 1.0.0；汇总 Soft QA / 驱动 / tip-pack 说明
- 功能集合等同 M18 tip：事务、导入、格式化、查找替换、表结构与外键一览等

## 0.18.0 — M18 外键 / 关系一览

- 表结构「关系」页：SQLite / MySQL / PG / SQL Server 外键列表（尽力而为）
- 点击关联表可打开结构或查询；无外键时空态提示

## 0.17.0 — M17 SQL 格式化 + 查找替换

- 轻量 `formatSql`：工具栏 / Shift+Alt+F / Ctrl+K；有选区则只格式化选区
- Monaco Ctrl+F / Ctrl+H；深色查找主题；F1 快捷键说明

## 0.16.0 — M16 手动事务

- 开始 / 提交 / 回滚（SQLite、MySQL、PG、SQL Server）；会话粘连
- 状态栏「事务中」；关闭窗口 / 删除连接时有未提交事务提示
- 默认仍为自动提交

## 0.15.0 — M15 CSV / Excel 导入

- 导入向导：选文件、映射列、写入表；可取消

## 0.14.0 — M14 样例数据 + 列统计

- 表结构内填充样例数据；列级统计面板

## 0.13.0 — M13 表结构 / DDL / 索引

- 列、索引、DDL 查看；打开查询 / 导入入口

## 0.12.0 — M12 结果图 + 多语句结果页

- 结果图表；多语句多结果标签

## 0.11.0 — M11 取消 / 超时 + 高风险 SQL 确认

- 查询取消与超时；破坏性语句确认对话框

## 0.10.0 — M10 设置中心与壳层抛光

- 模型密钥（系统密封）、外观密度、关于页
- 深色 TitleBar / 状态栏 token 收敛；空态文案

## 更早里程碑（M3–M9 摘要）

- **连接**：多连接、对象树、导入/导出连接包、示例业务库
- **编辑**：无边框深色 TitleBar、Monaco SQL、补全、多查询标签、Ctrl+K 命令面板
- **执行**：多引擎查询（SQLite / MySQL·MariaDB / PostgreSQL / SQL Server）、历史与收藏
- **Redis**：键浏览器（非 SQL）
- **AI**：自然语言转 SQL、修复、建表/改表助手（需配置兼容 OpenAI 的接口）
- **安全**：连接密码 / API Key 本机密封存储

Oracle / Hive 仅可保存连接，查询执行仍未接入。完整 ER 画布、Navicat 深度集成不在本 RC 范围。
