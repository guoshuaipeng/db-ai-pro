# DataAI Desktop (TypeScript)

Electron + React + Vite 桌面端。Milestone 3：

- 助手工具链：`search_relevant_tables` / `get_table_schema` / `get_column_enums`，深色卡片进度，SQL 失败自动修复
- Redis：连接、SCAN、string/hash/list/zset/set 深色浏览面板，对象树 Redis 徽章
- 无 API Key 时示例 SQLite 仍可本地预览

## 开发

```bash
cd apps/desktop
npm install --ignore-scripts   # Windows 若无 VS Build Tools，跳过 electron-rebuild
npm run rebuild:native         # 有 VS 时再编 better-sqlite3
npm run dev
```

## Soft QA

```bash
npm test
npm run typecheck
npm run smoke
```

版本：0.3.0
