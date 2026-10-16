# DataAI Desktop (TypeScript)

Milestone 5：

- 结果表虚拟滚动（@tanstack/react-virtual），保留粘性表头 / 导出 / 复制 / SQLite 编辑
- SQL Server 真连接（mssql/tedious）；Oracle / Hive 仍为「未支持」占位
- Excel 导出（exceljs）+ CSV / JSON
- 版本 0.5.0

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```
