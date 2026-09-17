import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ArticleDraft } from '../App'
import { IconArrowRight, IconGlobe, IconLayers, IconReport } from '../components/Icons'
import { RESEARCH_SUGGESTIONS, canStartResearch, classifyResearchLog } from '../research-view-model'

interface Props {
  onComplete: (draft: ArticleDraft) => void
}

export function ResearchPage({ onComplete }: Props) {
  const [topic, setTopic] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const jobIdRef = useRef<string | null>(null)
  const doneRef = useRef(false)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const offEv = window.desktopApi.onResearchSseEvent((ev) => {
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      setLogs((prev) => [...prev, `[${ev.type}] ${ev.message}`])
      if (ev.type === 'done') {
        doneRef.current = true
        void loadReport(ev.jobId)
      }
      if (ev.type === 'error') {
        setRunning(false)
      }
    })
    const offErr = window.desktopApi.onResearchSseError((ev) => {
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      setLogs((prev) => [...prev, `[error] ${ev.error}`])
      void pollUntilDone(ev.jobId)
    })
    const offEnd = window.desktopApi.onResearchSseEnd((ev) => {
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      if (!doneRef.current) {
        void pollUntilDone(ev.jobId)
      }
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

  async function loadReport(id: string): Promise<boolean> {
    const res = await window.desktopApi.researchFetch(`/research/${id}/report`)
    if (res.ok && res.data && typeof res.data === 'object') {
      const data = res.data as { title: string; markdown: string }
      if ((data.markdown || '').trim()) {
        doneRef.current = true
        setRunning(false)
        onComplete({ title: data.title, markdown: data.markdown })
        return true
      }
    }
    return false
  }

  async function pollUntilDone(id: string) {
    for (let i = 0; i < 30; i++) {
      if (doneRef.current) return
      const statusRes = await window.desktopApi.researchFetch(`/research/${id}/status`)
      if (statusRes.ok && statusRes.data && typeof statusRes.data === 'object') {
        const status = statusRes.data as { status: string; error?: string; hasReport?: boolean }
        if (status.status === 'failed') {
          setLogs((prev) => [...prev, `[error] ${status.error || '研究失败'}`])
          setRunning(false)
          return
        }
        if (status.status === 'completed' || status.hasReport) {
          const ok = await loadReport(id)
          if (ok) return
        }
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    setLogs((prev) => [...prev, '[error] 等待报告超时，请稍后重试'])
    setRunning(false)
  }

  async function startResearch() {
    if (!canStartResearch(topic, running)) return
    setRunning(true)
    setLogs([])
    doneRef.current = false
    const res = await window.desktopApi.researchFetch('/research', {
      method: 'POST',
      body: JSON.stringify({ topic: topic.trim() }),
    })
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      setLogs(['[error] 启动研究失败'])
      setRunning(false)
      return
    }
    const id = (res.data as { jobId: string }).jobId
    jobIdRef.current = id
    setLogs([`任务已创建: ${id}`])
    void window.desktopApi.startResearchSse(id)
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

      {logs.length > 0 && (
        <section className="research-progress" aria-label="研究进度">
          <div className="research-progress-header">
            <span className="research-progress-title">研究进度</span>
            {running && <span className="spinner" aria-label="研究中" />}
          </div>
          <ol className="research-timeline" role="log" aria-live="polite" ref={logRef}>
            {logs.map((line, i) => (
              <li key={i} className={`research-timeline-row is-${classifyResearchLog(line)}`}>
                <span className="research-timeline-marker" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </form>
  )
}
