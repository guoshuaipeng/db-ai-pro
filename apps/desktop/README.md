# DataAI Desktop (TypeScript)

Milestone 7：

- Monaco SQL 补全：按当前连接 schema 提示表/列（Ctrl+Space / 输入触发）
- 收藏 SQL 片段：全局或按连接保存，暗色面板插入编辑器
- 对象树搜索：主机 / 库 / 表 / 列过滤，显示匹配统计
- 保留 M3–M6：助手、Redis、建改表、虚拟滚动、SQL Server、Excel、tip 脚本、密钥密封、查询历史
- 版本 **0.7.0**

## Soft QA

```bash
cd apps/desktop
npm install --ignore-scripts
npm test
npm run typecheck
npm run smoke
npm run dev
```
