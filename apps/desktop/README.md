# DataAI Desktop (TypeScript)

Milestone 8：

- SQL 执行计划（SQLite EXPLAIN QUERY PLAN / MySQL·PG EXPLAIN / SQL Server SHOWPLAN_ALL）
- 助手会话记忆：启动恢复、可清空、保存时裁剪；不含密钥明文
- 连接导入/导出 JSON（仅密封 passwordCipher，导入可覆盖/新建/跳过）
- 保留 M3–M7
- 版本 **0.8.0**

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```
