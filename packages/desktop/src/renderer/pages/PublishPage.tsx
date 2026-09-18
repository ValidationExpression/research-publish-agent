import { useEffect, useState } from 'react'
import { marked } from 'marked'
import type { ArticleDraft } from '../App'
import { IconAlert, IconCheck, IconLock, IconRefresh } from '../components/Icons'
import {
  parseSyncStart,
  parseSyncStatus,
  reconcileSelection,
  seedPreferredSelection,
  sortPlatforms,
  type PublishPlatform,
  type PublishSyncResult,
} from '../publish-view-model'

interface Props {
  article: ArticleDraft
}

const platformLoadError = '无法读取平台状态，请确认 Cookie 插件已连接后重试。'
const preferredPlatformIds = ['csdn', 'weixin']

export function PublishPage({ article }: Props) {
  const [platforms, setPlatforms] = useState<PublishPlatform[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingPlatforms, setLoadingPlatforms] = useState(true)
  const [platformError, setPlatformError] = useState<string | null>(null)
  const [hasLoadedPlatforms, setHasLoadedPlatforms] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<PublishSyncResult[]>([])
  const [log, setLog] = useState('')

  useEffect(() => {
    void loadPlatforms()
  }, [])

  async function loadPlatforms() {
    setLoadingPlatforms(true)
    setPlatformError(null)

    try {
      const res = await window.desktopApi.publishFetch('/platforms')
      if (!res.ok || !res.data || typeof res.data !== 'object') {
        setPlatformError('无法读取平台状态，请确认 Cookie 插件已连接后重试。')
        setLoadingPlatforms(false)
        return
      }

      const list = (res.data as { platforms?: PublishPlatform[] }).platforms
      if (!Array.isArray(list)) {
        setPlatformError(platformLoadError)
        setLoadingPlatforms(false)
        return
      }

      const sorted = sortPlatforms(list)
      setPlatforms(sorted)
      setSelected((previous) => hasLoadedPlatforms
        ? reconcileSelection(sorted, previous)
        : seedPreferredSelection(sorted, preferredPlatformIds))
      setHasLoadedPlatforms(true)
      setLoadingPlatforms(false)
    } catch {
      setPlatformError(platformLoadError)
      setLoadingPlatforms(false)
    }
  }

  function toggle(id: string) {
    const platform = platforms.find((item) => item.id === id)
    if (!platform?.loggedIn || publishing) return

    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function publish() {
    if (selected.size === 0 || publishing || loadingPlatforms || platformError) return

    setPublishing(true)
    setResults([])
    setLog('正在发布草稿…')

    try {
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

      const syncId = parseSyncStart(res.data)
      if (!syncId) {
        setLog('发布请求响应无效，请重试。')
        setPublishing(false)
        return
      }

      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        let taskRes
        try {
          taskRes = await window.desktopApi.publishFetch(`/sync/${syncId}`)
        } catch {
          setLog('发布状态查询失败，请重试。')
          setPublishing(false)
          return
        }

        if (!taskRes.ok || !taskRes.data || typeof taskRes.data !== 'object') {
          setLog('发布状态响应无效，请重试。')
          setPublishing(false)
          return
        }

        const task = parseSyncStatus(taskRes.data)
        if (!task) {
          setLog('发布状态响应无效，请重试。')
          setPublishing(false)
          return
        }

        setResults(task.results)
        if (task.status === 'completed') {
          setLog('发布完成（草稿）')
          setPublishing(false)
          return
        }
        if (task.status === 'failed') {
          setLog(task.results.length > 0 ? '发布失败，请查看下方平台结果。' : '发布失败。')
          setPublishing(false)
          return
        }
      }

      setLog('等待超时')
      setPublishing(false)
    } catch {
      setLog('发布请求失败')
      setPublishing(false)
    }
  }

  const loggedInCount = platforms.filter((platform) => platform.loggedIn).length
  const platformName = (id: string) => platforms.find((platform) => platform.id === id)?.name || id
  const canPublish = !loadingPlatforms && !platformError && !publishing && selected.size > 0

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">选择发布平台</h2>
          <p className="card-subtitle">
            {article.title || '未命名文稿'} · {loggedInCount} 个已登录 · {selected.size} 个待同步
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadPlatforms()}
          disabled={loadingPlatforms || publishing}
        >
          {loadingPlatforms ? <span className="spinner" aria-hidden="true" /> : <IconRefresh />}
          刷新登录态
        </button>
      </div>

      {platformError ? (
        <div className="platform-empty" role="alert">
          <p style={{ marginTop: 0 }}>{platformError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void loadPlatforms()}>
            <IconRefresh /> 重试
          </button>
        </div>
      ) : loadingPlatforms ? (
        <p className="platform-empty" role="status">正在读取平台登录状态…</p>
      ) : platforms.length === 0 ? (
        <p className="platform-empty">尚未读到平台列表。确认 Cookie 插件已连接后，点右上角刷新。</p>
      ) : (
        <div className="platform-list" role="group" aria-label="发布平台" style={{ gridTemplateColumns: '1fr' }}>
          {platforms.map((platform) => {
            const isSelected = selected.has(platform.id)
            const isUnavailable = !platform.loggedIn
            return (
              <label
                key={platform.id}
                className={`platform-item ${isSelected ? 'selected' : ''}`}
                aria-disabled={isUnavailable || publishing}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(platform.id)}
                  disabled={isUnavailable || publishing}
                />
                <span className="platform-name">{platform.name}</span>
                <span className={`platform-status ${platform.loggedIn ? 'ok' : 'bad'}`}>
                  {platform.loggedIn ? '已登录' : <><IconLock size={12} /> 未登录</>}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <div
        className="actions"
        style={{ position: 'sticky', bottom: 0, paddingTop: 16, paddingBottom: 2, background: 'var(--ivory)' }}
      >
        <button type="button" className="btn btn-primary" onClick={() => void publish()} disabled={!canPublish}>
          {publishing ? (
            <>
              <span className="spinner" aria-hidden="true" />
              发布中…
            </>
          ) : (
            '发布草稿'
          )}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {log && <p className="card-subtitle" style={{ marginTop: 16 }}>{log}</p>}

        {results.length > 0 && (
          <ul className="result-list">
            {results.map((result) => (
              <li key={result.platform} className={`result-item ${result.success ? 'success' : 'fail'}`}>
                {result.success ? <IconCheck className="result-icon" /> : <IconAlert className="result-icon" />}
                <div>
                  <strong>{platformName(result.platform)}</strong>
                  {' — '}
                  {result.success ? '成功' : '失败'}
                  {result.postUrl && (
                    <>
                      {' '}
                      <a href={result.postUrl} target="_blank" rel="noreferrer">{result.postUrl}</a>
                    </>
                  )}
                  {result.error && <> — {result.error}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
