import { Mark, IconDatabase, IconPlus, IconClock } from './icons'
import { recentQueryTitle, type RecentQueryItem, type RecentTableItem } from '@shared/recentItems'

type WelcomePanelProps = {
  version?: string
  recentTables: RecentTableItem[]
  recentQueries: RecentQueryItem[]
  onNewConnection: () => void
  onRestoreSample: () => void
  onImportConnections: () => void
  onOpenRecentTable: (item: RecentTableItem) => void
  onOpenRecentQuery: (item: RecentQueryItem) => void
  onDismiss: () => void
}

export function WelcomePanel({
  version,
  recentTables,
  recentQueries,
  onNewConnection,
  onRestoreSample,
  onImportConnections,
  onOpenRecentTable,
  onOpenRecentQuery,
  onDismiss,
}: WelcomePanelProps) {
  const hasRecent = recentTables.length > 0 || recentQueries.length > 0

  return (
    <section className="welcome-panel" aria-label="欢迎使用 DataAI">
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="welcome-mark">
            <Mark size={28} />
          </div>
          <div>
            <p className="welcome-kicker">本机数据库工作台</p>
            <h1 className="welcome-title">欢迎使用 DataAI{version ? ` ${version}` : ''}</h1>
            <p className="welcome-lead">
              连接 SQLite / MySQL / PostgreSQL / SQL Server 与 Redis，编写 SQL、浏览结果、收藏片段。先选一个起点即可。
            </p>
          </div>
        </div>

        <div className="welcome-actions" role="group" aria-label="快速开始">
          <button type="button" className="welcome-action is-primary" onClick={onRestoreSample}>
            <span className="welcome-action-icon" aria-hidden="true">
              <IconDatabase />
            </span>
            <span className="welcome-action-copy">
              <strong>打开示例 SQLite</strong>
              <span>一键恢复零售示例库，立刻可跑查询</span>
            </span>
          </button>
          <button type="button" className="welcome-action" onClick={onNewConnection}>
            <span className="welcome-action-icon" aria-hidden="true">
              <IconPlus />
            </span>
            <span className="welcome-action-copy">
              <strong>新建连接</strong>
              <span>SQLite 文件或远程数据库 / Redis</span>
            </span>
          </button>
          <button type="button" className="welcome-action" onClick={onImportConnections}>
            <span className="welcome-action-icon" aria-hidden="true">
              <IconClock />
            </span>
            <span className="welcome-action-copy">
              <strong>导入连接</strong>
              <span>从备份 JSON 合并已有连接（仅密封密文）</span>
            </span>
          </button>
        </div>

        {hasRecent && (
          <div className="welcome-recent">
            <div className="welcome-recent-head">最近</div>
            <div className="welcome-recent-cols">
              {recentTables.length > 0 && (
                <div className="welcome-recent-block">
                  <div className="welcome-recent-label">表</div>
                  {recentTables.slice(0, 5).map((item) => (
                    <button
                      key={`${item.connectionId}:${item.tableName}`}
                      type="button"
                      className="welcome-recent-row"
                      onClick={() => onOpenRecentTable(item)}
                    >
                      <span>{item.tableName}</span>
                      <span className="welcome-recent-sub">{item.connectionName || '连接'}</span>
                    </button>
                  ))}
                </div>
              )}
              {recentQueries.length > 0 && (
                <div className="welcome-recent-block">
                  <div className="welcome-recent-label">查询</div>
                  {recentQueries.slice(0, 5).map((item, index) => (
                    <button
                      key={`${item.at}:${index}`}
                      type="button"
                      className="welcome-recent-row"
                      onClick={() => onOpenRecentQuery(item)}
                    >
                      <span>{recentQueryTitle(item.sql)}</span>
                      <span className="welcome-recent-sub">{item.connectionName || '连接'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="welcome-foot">
          <p className="welcome-hint">有连接后将自动进入工作区。也可随时在侧栏新建连接。</p>
          <button type="button" className="btn btn-ghost tiny-btn" onClick={onDismiss}>
            不再显示欢迎页
          </button>
        </div>
      </div>
    </section>
  )
}
