# DataAI Desktop (TypeScript)

Milestone 9：

- 无边框深色自定义标题栏（frameless，对齐 AI-SSH-Pro 一体壳，无 Windows 白条）
- 命令面板（Ctrl+K / Ctrl+Shift+P）：模糊搜索运行、计划、收藏、历史、导入导出、助手等
- 快捷键说明（F1）；Explain = Ctrl+Shift+E；对象树搜索 = Ctrl+Shift+F
- 状态栏：连接/引擎、最近一次运行行数与耗时、系统密钥提示
- 保留 M3–M8
- 版本 **0.9.0**

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```
