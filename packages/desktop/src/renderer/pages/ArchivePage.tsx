import { useEffect, useMemo, useState } from 'react'
import { DocumentReader, formatDocumentTime } from '../components/DocumentReader'
import type { ArticleDraft } from '../App'

export interface SavedReportSummary {
  jobId: string
  title: string
  topic: string
  completedAt: string
}

interface SavedReport extends SavedReportSummary {
  markdown: string
}

interface Props {
  revision: number
  onSendToReview: (draft: ArticleDraft) => void
}

function toSummary(value: unknown): SavedReportSummary | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.jobId !== 'string' || !item.jobId.trim()) return null
  return {
    jobId: item.jobId,
    title: typeof item.title === 'string' ? item.title : '',
    topic: typeof item.topic === 'string' ? item.topic : '',
    completedAt: typeof item.completedAt === 'string' ? item.completedAt : '',
  }
}

export function ArchivePage({ revision, onSendToReview }: Props) {
  const [reports, setReports] = useState<SavedReportSummary[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SavedReport | null>(null)
  const [listPhase, setListPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailPhase, setDetailPhase] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle')
  const [deleting, setDeleting] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setListPhase('loading')
    window.desktopApi.researchFetch('/research/reports')
      .then((res) => {
        if (cancelled) return
        const data = res.ok && res.data && typeof res.data === 'object'
          ? (res.data as { reports?: unknown }).reports
          : null
        if (!Array.isArray(data)) {
          setListPhase('error')
          return
        }
        const next = data.map(toSummary).filter((item): item is SavedReportSummary => item !== null)
        setReports(next)
        setSelectedId((current) => (current && next.some((item) => item.jobId === current) ? current : next[0]?.jobId ?? null))
        setListPhase('ready')
      })
      .catch(() => {
        if (!cancelled) setListPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [revision, attempt])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      setDetailPhase('idle')
      return
    }
    let cancelled = false
    setDetailPhase('loading')
    window.desktopApi.researchFetch(`/research/reports/${selectedId}`)
      .then((res) => {
        if (cancelled) return
        if (res.status === 404) {
          setSelected(null)
          setDetailPhase('missing')
          return
        }
        const data = res.ok && res.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : null
        const summary = toSummary(data)
        if (!data || typeof data.markdown !== 'string' || !summary) {
          setDetailPhase('error')
          return
        }
        setSelected({ ...summary, markdown: data.markdown })
        setDetailPhase('ready')
      })
      .catch(() => {
        if (!cancelled) setDetailPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, revision])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return reports
    return reports.filter((report) => `${report.title} ${report.topic}`.toLowerCase().includes(needle))
  }, [query, reports])

  async function removeSelected() {
    if (!selectedId || deleting) return
    setDeleting(true)
    try {
      const res = await window.desktopApi.researchFetch(`/research/reports/${selectedId}`, { method: 'DELETE' })
      if (!res.ok) {
        setDetailPhase('error')
        return
      }
      const next = reports.filter((report) => report.jobId !== selectedId)
      setReports(next)
      setSelected(null)
      setSelectedId(next[0]?.jobId ?? null)
    } catch {
      setDetailPhase('error')
    } finally {
      setDeleting(false)
    }
  }

  const countLabel = listPhase === 'ready' ? `${reports.length} 份报告` : '本地研究报告'

  return (
    <div className="archive-workspace">
      <aside className="archive-list" aria-label="已完成的研究报告">
        <header className="archive-list-head">
          <p className="archive-kicker">ARCHIVE</p>
          <h1>研究仓库</h1>
          <p>{countLabel}</p>
        </header>
        <label className="archive-search">
          <span className="sr-only">搜索报告</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题或主题"
            disabled={listPhase !== 'ready'}
          />
        </label>
        {listPhase === 'loading' && <p className="archive-note">正在读取研究报告</p>}
        {listPhase === 'ready' && reports.length > 0 && visible.length === 0 && (
          <p className="archive-note">没有匹配的报告。</p>
        )}
        <ul className="archive-items">
          {visible.map((report) => (
            <li key={report.jobId}>
              <button
                type="button"
                className={`archive-item${report.jobId === selectedId ? ' is-selected' : ''}`}
                aria-current={report.jobId === selectedId ? 'true' : undefined}
                onClick={() => setSelectedId(report.jobId)}
              >
                <strong>{report.title || '研究报告'}</strong>
                <span>{[formatDocumentTime(report.completedAt), report.topic || '未记录主题'].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="archive-detail">
        {listPhase === 'error' && (
          <div className="archive-state" role="alert">
            <h2>暂时读不到已保存的报告</h2>
            <p>研究服务还没有准备好这份列表。重新打开应用后再试一次。</p>
            <button type="button" className="btn btn-secondary" onClick={() => setAttempt((current) => current + 1)}>
              重试
            </button>
          </div>
        )}
        {listPhase === 'ready' && reports.length === 0 && (
          <div className="archive-state">
            <h2>还没有研究报告</h2>
            <p>完成一次研究后，报告会出现在这里，可以再打开、送审阅或删除。</p>
          </div>
        )}
        {listPhase !== 'error' && detailPhase === 'loading' && <p className="archive-note">正在打开报告</p>}
        {listPhase !== 'error' && detailPhase === 'missing' && (
          <div className="archive-state" role="alert">
            <h2>找不到这份报告</h2>
            <p>文件可能已经被删掉。回到列表再选一份。</p>
          </div>
        )}
        {listPhase !== 'error' && detailPhase === 'error' && (
          <div className="archive-state" role="alert">
            <h2>报告读取失败</h2>
            <p>请稍后重试。如果一直失败，重新打开应用。</p>
          </div>
        )}
        {listPhase !== 'error' && detailPhase === 'ready' && selected && (
          <DocumentReader
            title={selected.title}
            topic={selected.topic}
            completedAt={selected.completedAt}
            markdown={selected.markdown}
            deleting={deleting}
            onDelete={() => void removeSelected()}
            onSendToReview={() => onSendToReview({ title: selected.title, markdown: selected.markdown })}
          />
        )}
      </div>
    </div>
  )
}
