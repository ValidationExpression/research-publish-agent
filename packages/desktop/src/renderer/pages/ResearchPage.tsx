import { useEffect, useRef, useState } from 'react'
import type { ArticleDraft } from '../App'

interface Props {
  onComplete: (draft: ArticleDraft) => void
}

export function ResearchPage({ onComplete }: Props) {
  const [topic, setTopic] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const jobIdRef = useRef<string | null>(null)

  useEffect(() => {
    const offEv = window.desktopApi.onResearchSseEvent((ev) => {
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      setLogs((prev) => [...prev, `[${ev.type}] ${ev.message}`])
      if (ev.type === 'done') {
        void loadReport(ev.jobId)
      }
      if (ev.type === 'error') {
        setRunning(false)
      }
    })
    const offErr = window.desktopApi.onResearchSseError((ev) => {
      if (jobIdRef.current && ev.jobId !== jobIdRef.current) return
      setLogs((prev) => [...prev, `[error] ${ev.error}`])
      setRunning(false)
    })
    return () => {
      offEv()
      offErr()
    }
  }, [onComplete])

  async function loadReport(id: string) {
    const res = await window.desktopApi.researchFetch(`/research/${id}/report`)
    if (res.ok && res.data && typeof res.data === 'object') {
      const data = res.data as { title: string; markdown: string }
      setRunning(false)
      onComplete({ title: data.title, markdown: data.markdown })
    } else {
      setLogs((prev) => [...prev, '加载报告失败'])
      setRunning(false)
    }
  }

  async function startResearch() {
    if (!topic.trim()) return
    setRunning(true)
    setLogs([])
    const res = await window.desktopApi.researchFetch('/research', {
      method: 'POST',
      body: JSON.stringify({ topic: topic.trim() }),
    })
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      setLogs(['启动研究失败'])
      setRunning(false)
      return
    }
    const id = (res.data as { jobId: string }).jobId
    jobIdRef.current = id
    setLogs([`任务已创建: ${id}`])
    void window.desktopApi.startResearchSse(id)
  }

  return (
    <div className="card">
      <h2>深度研究</h2>
      <label>研究主题</label>
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="例如：2026 年 AI Agent 框架对比"
        disabled={running}
      />
      <div style={{ marginTop: 12 }}>
        <button className="primary" onClick={startResearch} disabled={running || !topic.trim()}>
          {running ? '研究中…' : '开始研究'}
        </button>
      </div>
      {logs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <label>进度</label>
          <div className="log">{logs.join('\n')}</div>
        </div>
      )}
    </div>
  )
}
