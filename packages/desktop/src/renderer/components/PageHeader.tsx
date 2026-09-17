import type { ReactNode } from 'react'

export interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
  status?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, status, actions }: PageHeaderProps) {
  return (
    <header className="topbar">
      <div className="section-head">
        <p className="section-num">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{description}</p>
        {status && <div className="page-header-status">{status}</div>}
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  )
}
