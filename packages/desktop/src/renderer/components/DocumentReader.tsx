import { marked } from 'marked'
import { useState } from 'react'

export function documentBody(markdown: string): string {
  return markdown.replace(/^\uFEFF?\s*#\s+[^\n]*\n*/, '')
}

export function formatDocumentTime(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export interface DocumentReaderProps {
  title: string
  topic?: string
  completedAt?: string
  markdown: string
  onClose?: () => void
  onSendToReview?: () => void
  onDelete?: () => void
  deleting?: boolean
}

export function DocumentReader({
  title,
  topic,
  completedAt,
  markdown,
  onClose,
  onSendToReview,
  onDelete,
  deleting = false,
}: DocumentReaderProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const body = documentBody(markdown).trim()
  const html = body ? marked.parse(body) as string : ''
  const timeLabel = formatDocumentTime(completedAt)
  const meta = [topic?.trim(), timeLabel].filter(Boolean).join(' · ')

  return (
    <section className="document-reader" aria-label="研究报告">
      <div className="document-reader-bar">
        <div className="document-reader-actions">
          {onSendToReview && (
            <button type="button" className="btn btn-primary" onClick={onSendToReview}>
              送审阅
            </button>
          )}
          {onDelete && !confirmingDelete && (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(true)} disabled={deleting}>
              删除
            </button>
          )}
          {onDelete && confirmingDelete && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? '正在删除' : '确认删除'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                取消
              </button>
            </>
          )}
        </div>
        {onClose && (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
      <div className="document-reader-scroll">
        <article className="document-sheet">
          <h1 className="document-title">{title || '研究报告'}</h1>
          {meta && <p className="document-meta">{meta}</p>}
          {html ? (
            <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="preview preview-empty">这份报告还没有正文。</p>
          )}
        </article>
      </div>
    </section>
  )
}
