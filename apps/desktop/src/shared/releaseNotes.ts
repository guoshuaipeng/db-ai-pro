/** Short in-app release highlights (Chinese). Full text lives in CHANGELOG.md. */
export const APP_VERSION_LABEL = '1.0.0'

export const RELEASE_NOTES_SNIPPET: { title: string; items: string[] } = {
  title: '1.0.0 本地 RC · 更新摘要',
  items: [
    '手动事务、CSV/Excel 导入、SQL 格式化与查找替换',
    '表结构：列 / 索引 / 外键关系 / DDL；样例数据与列统计',
    '查询取消与超时、破坏性 SQL 确认、结果图与多结果页',
    '无边框深色壳、Ctrl+K、多引擎（SQLite / MySQL / PG / SQL Server）+ Redis 键浏览',
    '完整说明见仓库 apps/desktop/CHANGELOG.md（尚未 GitHub Releases）',
  ],
}
