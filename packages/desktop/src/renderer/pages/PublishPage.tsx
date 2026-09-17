import { useEffect, useState } from 'react'
import { marked } from 'marked'
import type { ArticleDraft } from '../App'

interface Platform {
  id: string
  name: string
  loggedIn: boolean
}

interface SyncResult {
  platform: string
  success: boolean
  postUrl?: string
  error?: string
}

interface Props {
  article: ArticleDraft
}

export function PublishPage({ article }: Props) {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(['csdn', 'weixin']))
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<SyncResult[]>([])
  const [log, setLog] = useState('')

  useEffect(() => {
    void loadPlatforms()
  }, [])

  async function loadPlatforms() {
    const res = await window.desktopApi.publishFetch('/platforms')
    if (res.ok && res.data && typeof res.data === 'object') {
      const list = (res.data as { platforms: Platform[] }).platforms
      const sorted = [...list].sort((a, b) => {
        if (a.loggedIn !== b.loggedIn) return a.loggedIn ? -1 : 1
        return a.name.localeCompare(b.name, 'zh-CN')
      })
      setPlatforms(sorted)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function publish() {
    if (selected.size === 0) return
    setPublishing(true)
    setResults([])
    setLog('正在发布草稿…')

    const html = await marked.parse(article.markdown)
    const res = await window.desktopApi.publishFetch('/sync', {
      method: 'POST',
      body: JSON.stringify({
        platforms: [...selected],
        article: {
          title: article.title,
          html,
          markdown: article.markdown,
        },
        draftOnly: true,
      }),
    })

    if (!res.ok || !res.data || typeof res.data !== 'object') {
      setLog('发布请求失败')
      setPublishing(false)
      return
    }

    const syncId = (res.data as { syncId: string }).syncId
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const taskRes = await window.desktopApi.publishFetch(`/sync/${syncId}`)
      if (!taskRes.ok || !taskRes.data || typeof taskRes.data !== 'object') continue
      const task = taskRes.data as { status: string; results: SyncResult[] }
      setResults(task.results || [])
      if (task.status !== 'running') {
        setLog(task.status === 'completed' ? '发布完成（草稿）' : '发布结束')
        setPublishing(false)
        return
      }
    }
    setLog('等待超时')
    setPublishing(false)
  }

  const loggedInCount = platforms.filter((p) => p.loggedIn).length

  return (
    <div className="card">
      <h2>发布到平台（草稿）</h2>
      <p style={{ fontSize: 13, color: '#9ca3af' }}>标题：{article.title}</p>
      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
        共 {platforms.length} 个平台，{loggedInCount} 个已登录
        {platforms.length > 0 && (
          <button
            type="button"
            onClick={() => void loadPlatforms()}
            style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px' }}
          >
            刷新登录态
          </button>
        )}
      </p>
      <div className="platform-list" style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
        {platforms.map((p) => (
          <label key={p.id} className="platform-item">
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
            />
            <span>{p.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: p.loggedIn ? '#86efac' : '#fca5a5' }}>
              {p.loggedIn ? '已登录' : '未登录'}
            </span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="primary" onClick={publish} disabled={publishing || selected.size === 0}>
          {publishing ? '发布中…' : '发布草稿'}
        </button>
      </div>
      {log && <p style={{ marginTop: 12, fontSize: 13 }}>{log}</p>}
      {results.length > 0 && (
        <ul style={{ fontSize: 13, marginTop: 8 }}>
          {results.map((r) => (
            <li key={r.platform}>
              <strong>{r.platform}</strong>: {r.success ? '成功' : '失败'}
              {r.postUrl && (
                <> — <a href={r.postUrl} style={{ color: '#93c5fd' }}>{r.postUrl}</a></>
              )}
              {r.error && <> — {r.error}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
