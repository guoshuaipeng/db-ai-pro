# DataAI Desktop (TypeScript)

Electron + React + Vite。Milestone 4：

- AI 建表 / 改表（深色卡片多轮、参考表风格、一键执行、失败修复）
- 结果表：CSV/JSON 导出、复制、SQLite 确认后单元格编辑
- 保留 M3：助手工具链 + Redis 浏览器

## 开发

```bash
cd apps/desktop
npm install --ignore-scripts
npm run dev
```

## Soft QA

```bash
npm test
npm run typecheck
npm run smoke
```

版本：0.4.0
