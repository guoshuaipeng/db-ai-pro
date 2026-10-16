# DataAI Desktop (TypeScript)

Milestone 10：

- 设置中心：模型密钥（密封）、外观密度、关于页（版本 / 工作区 / 日志目录）
- 主题 token 收敛：shell / titlebar / statusbar / hairline，减少浅色缝隙
- 首屏与空态：无连接、无结果、助手空态按产品文案重排
- 保留 M3–M9（含无边框深色 TitleBar + Ctrl+K）
- 版本 **0.10.0**

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```
