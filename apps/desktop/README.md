# DataAI Desktop (TypeScript)

Milestone 6：

- Windows tip / portable 包脚本（electron-builder `portable`，产物目录 `release/`）
- 连接密码与 AI Key 使用 Electron `safeStorage`（DPAPI）密封；加载时迁移旧明文
- 按连接持久化查询历史（成功/失败），暗色面板可打开/重跑
- 保留 M3–M5：助手工具链、Redis、建改表、结果虚拟滚动、SQL Server、Excel 导出
- 版本 **0.6.0**

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
```

## Tip 包

```bash
npm run pack:tip
# 期望产物：release/DataAI-0.6.0-win-tip.exe
# 或未完成 portable 时：release/win-unpacked/DataAI.exe
```

**本机 blocker（2026-10-16）**：`electron-builder` 默认会 `@electron/rebuild` 编译 `better-sqlite3`，需要 Visual Studio Build Tools（含 C++ 工作负载）。当前机器缺 VS，完整 `npm run pack:tip` 会失败。安装 VS Build Tools 后重跑即可；或在已有可用原生二进制时用 `npx electron-builder --win portable --publish never --config.npmRebuild=false` 跳过重建。

桌面快捷方式 `DataAI 最新版.lnk` → `scripts/launch-dataai-latest.bat`：优先最新 `DataAI-*-win-tip.exe` / `release/win-unpacked/DataAI.exe`，否则回退 `npm run dev`（先 M2 工作区，再主仓库）。
