import type { ReactNode } from 'react'

type EmptyStateProps = {
  kicker?: string
  title: string
  body: string
  icon?: ReactNode
  actions?: ReactNode
  compact?: boolean
}

export function EmptyState({ kicker, title, body, icon, actions, compact }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state is-compact' : 'empty-state'}>
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      {kicker && <p className="empty-state-kicker">{kicker}</p>}
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-body">{body}</p>
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  )
}
