import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ArticleDraft } from '../App'
import { IconArrowRight, IconGlobe, IconLayers, IconReport } from '../components/Icons'
import { RESEARCH_SUGGESTIONS, canStartResearch, classifyResearchLog, getResearchLogMessage, parseResearchReport } from '../research-view-model'

interface Props {
  onComplete: (draft: ArticleDraft) => void
}

export function ResearchPage({ onComplete }: Props) {
  const [topic, setTopic] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const jobIdRef = useRef<string | null>(null)
  const doneRef = useRef(false)
  const pollingRef = useRef<string | null>(null)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const offEv = window.desktopApi.onResearchSseEvent((ev) => {
      if (ev.jobId !== jobIdRef.current || doneRef.current) return
      setLogs((prev) => [...prev, `[${ev.type}] ${ev.message}`])
      if (ev.type === 'done') {
        void pollUntilDone(ev.jobId, true)
      }
      if (ev.type === 'error') {
        jobIdRef.current = null
        setRunning(false)
      }
    })
    const offErr = window.desktopApi.onResearchSseError((ev) => {
      if (ev.jobId !== jobIdRef.current || doneRef.current) return
      setLogs((prev) => [...prev, `[error] ${ev.error}`])
      void pollUntilDone(ev.jobId)
    })
    const offEnd = window.desktopApi.onResearchSseEnd((ev) => {
      if (ev.jobId !== jobIdRef.current || doneRef.current) return
      void pollUntilDone(ev.jobId)
    })
    return () => {
      offEv()
      offErr()
      offEnd()
    }
  }, [onComplete])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  function stopResearchWithError(message: string) {
    jobIdRef.current = null
    setLogs((prev) => [...prev, `[error] ${message}`])
    setRunning(false)
  }

  async function loadReport(id: string): Promise<boolean> {
    try {
      const res = await window.desktopApi.researchFetch(`/research/${id}/report`)
      if (id !== jobIdRef.current || doneRef.current) return true
      const report = res.ok ? parseResearchReport(res.data) : null
      if (!report) return false
      doneRef.current = true
      setRunning(false)
      onComplete(report)
      return true
    } catch {
      return false
    }
  }

  async function pollUntilDone(id: string, tryReportFirst = false) {
    if (pollingRef.current === id || id !== jobIdRef.current || doneRef.current) return
    pollingRef.current = id
    try {
      if (tryReportFirst && await loadReport(id)) return
      for (let i = 0; i < 30; i++) {
        if (doneRef.current || id !== jobIdRef.current) return
        const statusRes = await window.desktopApi.researchFetch(`/research/${id}/status`)
        if (doneRef.current || id !== jobIdRef.current) return
        if (statusRes.ok && statusRes.data && typeof statusRes.data === 'object') {
          const status = statusRes.data as { status: string; error?: string; hasReport?: boolean }
          if (status.status === 'failed') {
            stopResearchWithError(typeof status.error === 'string' && status.error.trim() ? status.error : '研究失败')
            return
          }
          if (status.status === 'completed' || status.hasReport) {
            const ok = await loadReport(id)
            if (ok) return
          }
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (id === jobIdRef.current) stopResearchWithError('等待报告超时，请稍后重试')
    } catch {
      if (id === jobIdRef.current) stopResearchWithError('检查研究状态失败，请稍后重试')
    } finally {
      if (pollingRef.current === id) pollingRef.current = null
    }
  }

  async function startResearch() {
    if (!canStartResearch(topic, running)) return
    setRunning(true)
    setLogs([])
    doneRef.current = false
    jobIdRef.current = null
    let res: Awaited<ReturnType<typeof window.desktopApi.researchFetch>>
    try {
      res = await window.desktopApi.researchFetch('/research', {
        method: 'POST',
        body: JSON.stringify({ topic: topic.trim() }),
      })
    } catch {
      stopResearchWithError('启动研究时发生错误，请重试')
      return
    }
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      stopResearchWithError('启动研究失败')
      return
    }
    const id = (res.data as { jobId: string }).jobId
    jobIdRef.current = id
    setLogs([`任务已创建: ${id}`])
    try {
      await window.desktopApi.startResearchSse(id)
    } catch {
      setLogs((prev) => [...prev, '[error] 实时进度连接失败，正在检查研究状态'])
      void pollUntilDone(id)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void startResearch()
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canStartResearch(topic, running)) {
      e.preventDefault()
      void startResearch()
    }
  }

  return (
    <form className="research-composer" onSubmit={onSubmit}>
      <div className="research-composer-main">
        <label className="sr-only" htmlFor="research-topic">研究主题</label>
        <textarea
          id="research-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="例如：2026 年 AI Agent 框架对比"
          disabled={running}
          maxLength={2000}
          autoComplete="off"
          rows={5}
        />
        <div className="research-composer-footer">
          <div className="research-composer-meta">
            <span aria-live="polite">{topic.length} / 2000</span>
            <span className="research-shortcut">Ctrl / ⌘ + Enter 开始</span>
          </div>
          <button
            type="submit"
            className="research-submit"
            disabled={!canStartResearch(topic, running)}
            aria-label={running ? '研究中' : '开始研究'}
          >
            {running ? <span className="spinner" aria-hidden="true" /> : <IconArrowRight />}
          </button>
        </div>
      </div>

      <div className="research-suggestions" aria-label="推荐研究主题">
        <span className="research-suggestions-label">试试这些主题</span>
        <div className="research-suggestion-list">
          {RESEARCH_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="research-suggestion"
              onClick={() => setTopic(suggestion)}
              disabled={running}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <ol className="research-stages" aria-label="研究流程">
        <li><IconGlobe /><strong>联网检索</strong><span>从公开网页获取相关资料</span></li>
        <li><IconLayers /><strong>资料分析</strong><span>阅读、筛选并交叉验证</span></li>
        <li><IconReport /><strong>生成报告</strong><span>输出可继续编辑的 Markdown</span></li>
      </ol>

      {(running || logs.length > 0) && (
        <section className="research-progress" aria-label="研究进度">
          <div className="research-progress-header">
            <span className="research-progress-title" role="status">{running ? '研究进行中' : '研究进度'}</span>
            {running && <span className="spinner" aria-label="研究中" />}
          </div>
          <ol className="research-timeline" role="log" aria-live="polite" ref={logRef}>
            {logs.map((line, i) => (
              <li key={i} className={`research-timeline-row is-${classifyResearchLog(line)}`}>
                <span className="research-timeline-marker" aria-hidden="true" />
                <span>{getResearchLogMessage(line)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </form>
  )
}
