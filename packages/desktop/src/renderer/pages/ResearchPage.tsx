import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import type { ArticleDraft } from '../App'
import { IconArrowRight, IconGlobe, IconLayers, IconReport } from '../components/Icons'
import {
  type AssistantMessage,
  type ResearchConversation,
  type ResearchSseEvent,
  appendTurn,
  applyResearchEvent,
  articleFromAssistant,
  attachJob,
  canStartResearch,
  createConversation,
  failActiveTurn,
  finalizeReport,
  historyForRequest,
  isResearchRunning,
  parseResearchReport,
  RESEARCH_SUGGESTIONS,
} from '../research-view-model'

interface Props {
  onSendToReview: (draft: ArticleDraft) => void
  onThreadChange: (active: boolean) => void
}

export function ResearchPage({ onSendToReview, onThreadChange }: Props) {
  const [conversation, setConversation] = useState<ResearchConversation>(() => createConversation())
  const [topic, setTopic] = useState('')
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean | undefined>>({})
  const startingRef = useRef(false)
  const expectingJobRef = useRef<string | null>(null)
  const pollingRef = useRef<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const running = isResearchRunning(conversation)
  const threaded = conversation.messages.length > 0

  useEffect(() => {
    onThreadChange(threaded)
  }, [onThreadChange, threaded])

  useEffect(() => {
    const offEv = window.desktopApi.onResearchSseEvent((ev) => {
      const event = ev as ResearchSseEvent
      setConversation((current) => applyToConversation(current, event, expectingJobRef.current))
      if (event.type === 'done') void pollUntilDone(event.jobId, true)
    })
    const offErr = window.desktopApi.onResearchSseError((ev) => {
      void pollUntilDone(ev.jobId)
    })
    const offEnd = window.desktopApi.onResearchSseEnd((ev) => {
      void pollUntilDone(ev.jobId)
    })
    return () => {
      offEv()
      offErr()
      offEnd()
    }
  }, [])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversation])

  async function loadReport(id: string): Promise<boolean> {
    try {
      const res = await window.desktopApi.researchFetch(`/research/${id}/report`)
      const report = res.ok ? parseResearchReport(res.data) : null
      if (!report) return false
      setConversation((current) => finalizeReport(claimExpectedJob(current, id, expectingJobRef.current), id, report))
      return true
    } catch {
      return false
    }
  }

  async function pollUntilDone(id: string, tryReportFirst = false) {
    if (pollingRef.current === id) return
    pollingRef.current = id
    try {
      if (tryReportFirst && await loadReport(id)) return
      for (let i = 0; i < 180; i++) {
        const statusRes = await window.desktopApi.researchFetch(`/research/${id}/status`)
        if (statusRes.ok && statusRes.data && typeof statusRes.data === 'object') {
          const status = statusRes.data as { status: string; error?: string; hasReport?: boolean }
          if (status.status === 'failed' || status.status === 'cancelled') {
            const message = typeof status.error === 'string' && status.error.trim() ? status.error : '研究失败'
            setConversation((current) => applyToConversation(current, { jobId: id, type: 'error', message }, expectingJobRef.current))
            return
          }
          if (status.status === 'completed' || status.hasReport) {
            if (await loadReport(id)) return
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      setConversation((current) => applyToConversation(current, {
        jobId: id,
        type: 'error',
        message: '等待报告超时，请稍后重试',
      }, expectingJobRef.current))
    } catch {
      setConversation((current) => applyToConversation(current, {
        jobId: id,
        type: 'error',
        message: '检查研究状态失败，请稍后重试',
      }, expectingJobRef.current))
    } finally {
      if (pollingRef.current === id) pollingRef.current = null
    }
  }

  async function startResearch() {
    const text = topic.trim()
    if (startingRef.current || !canStartResearch(text, running)) return
    startingRef.current = true
    const history = historyForRequest(conversation.messages)
    setConversation((current) => appendTurn(current, text))
    setTopic('')
    try {
      const res = await window.desktopApi.researchFetch('/research', {
        method: 'POST',
        body: JSON.stringify({ topic: text, history }),
      })
      if (!res.ok || !res.data || typeof res.data !== 'object') {
        setConversation((current) => failActiveTurn(current, '启动研究失败'))
        return
      }
      const id = (res.data as { jobId: string }).jobId
      expectingJobRef.current = id
      setConversation((current) => attachJob(current, id))
      try {
        await window.desktopApi.startResearchSse(id)
      } catch {
        void pollUntilDone(id)
      }
    } catch {
      setConversation((current) => failActiveTurn(current, '启动研究时发生错误，请重试'))
    } finally {
      startingRef.current = false
    }
  }

  async function cancelResearch() {
    const active = conversation.messages.find((message) => message.id === conversation.activeAssistantId)
    if (!active || active.role !== 'assistant' || !active.jobId) return
    try {
      await window.desktopApi.researchFetch(`/research/${active.jobId}/cancel`, { method: 'POST' })
    } catch {
      setConversation((current) => applyToConversation(current, {
        jobId: active.jobId || '',
        type: 'error',
        message: '取消研究失败，请稍后重试',
      }, expectingJobRef.current))
    }
  }

  function newConversation() {
    if (running || startingRef.current) return
    setConversation(createConversation())
    setTopic('')
    setExpandedThinking({})
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void startResearch()
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canStartResearch(topic, running)) {
      event.preventDefault()
      void startResearch()
    }
  }

  const composer = (
    <form className={`research-composer${threaded ? ' is-dock' : ''}`} onSubmit={onSubmit}>
      <div className="research-composer-main">
        <label className="sr-only" htmlFor="research-topic">研究主题</label>
        <textarea
          id="research-topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={threaded ? '继续追问，或让它改一版报告' : '例如：2026 年 AI Agent 框架对比'}
          disabled={running}
          maxLength={2000}
          autoComplete="off"
          rows={threaded ? 2 : 5}
        />
        <div className="research-composer-footer">
          <div className="research-composer-meta">
            <span aria-live="polite">{topic.length} / 2000</span>
            <span className="research-shortcut">Ctrl / ⌘ + Enter 发送</span>
          </div>
          <div className="research-composer-actions">
            {running && (
              <button type="button" className="btn btn-ghost" onClick={() => void cancelResearch()}>
                停止
              </button>
            )}
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
      </div>
    </form>
  )

  if (!threaded) {
    return (
      <div className="research-chat">
        {composer}
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
      </div>
    )
  }

  return (
    <div className="research-chat is-thread">
      <div className="research-thread-bar">
        <p className="research-thread-title">研究对话</p>
        <button type="button" className="btn btn-ghost" onClick={newConversation} disabled={running}>
          新对话
        </button>
      </div>
      <div className="research-thread" role="log" aria-live="polite" aria-relevant="additions" ref={threadRef}>
        {conversation.messages.map((message) => (
          message.role === 'user' ? (
            <article key={message.id} className="chat-turn is-user">
              <p>{message.content}</p>
            </article>
          ) : (
            <AssistantTurn
              key={message.id}
              message={message}
              thinkingOpen={expandedThinking[message.id]}
              onThinkingOpen={(open) => setExpandedThinking((current) => ({ ...current, [message.id]: open }))}
              onSendToReview={onSendToReview}
            />
          )
        ))}
      </div>
      {composer}
    </div>
  )
}

function claimExpectedJob(
  conversation: ResearchConversation,
  jobId: string,
  expectedJobId: string | null,
): ResearchConversation {
  if (!jobId || jobId !== expectedJobId) return conversation
  const active = conversation.messages.find((message) => message.id === conversation.activeAssistantId)
  if (!active || active.role !== 'assistant' || active.jobId) return conversation
  return attachJob(conversation, jobId)
}

function applyToConversation(
  conversation: ResearchConversation,
  event: ResearchSseEvent,
  expectedJobId: string | null,
): ResearchConversation {
  const claimed = claimExpectedJob(conversation, event.jobId, expectedJobId)
  const known = claimed.messages.some((message) => message.role === 'assistant' && message.jobId === event.jobId)
  if (!known) return conversation
  return applyResearchEvent(claimed, event)
}

function AssistantTurn({
  message,
  thinkingOpen,
  onThinkingOpen,
  onSendToReview,
}: {
  message: AssistantMessage
  thinkingOpen: boolean | undefined
  onThinkingOpen: (open: boolean) => void
  onSendToReview: (draft: ArticleDraft) => void
}) {
  const autoOpen = message.phase === 'thinking' && message.searches.length === 0
  const open = thinkingOpen ?? autoOpen
  const showReport = message.phase === 'writing' || message.phase === 'done' || message.markdown.trim().length > 0
  const article = articleFromAssistant(message)
  const html = message.markdown.trim() ? marked.parse(message.markdown) as string : ''
  const thinkingLabel = message.searches.length > 0 || message.phase === 'writing' || message.phase === 'done'
    ? '已思考'
    : '思考过程'

  return (
    <article className={`chat-turn is-assistant is-${message.phase}`} aria-busy={message.phase !== 'done' && message.phase !== 'error'}>
      <section className="chat-thinking">
        <button
          type="button"
          className="chat-disclosure"
          aria-expanded={open}
          onClick={() => onThinkingOpen(!open)}
        >
          {thinkingLabel}
          {message.elapsed > 0 && message.phase !== 'done' && message.phase !== 'error' && (
            <span>已用时 {message.elapsed} 秒</span>
          )}
        </button>
        {open && (
          <div className={`chat-thinking-body${message.phase === 'thinking' ? ' chat-caret' : ''}`}>
            {message.thinking.trim() ? message.thinking : '正在思考…'}
          </div>
        )}
      </section>

      {message.searches.length > 0 && (
        <section className="chat-search-block" aria-label="搜索过程">
          <h3>搜索过程</h3>
          <ul className="chat-searches">
            {message.searches.map((search) => (
              <li key={search.id} className={`chat-search is-${search.status}`}>
                <div className="chat-search-line">
                  <strong>{search.query}</strong>
                  <span>{search.status === 'running' ? '检索中' : search.status === 'error' ? '检索失败' : '已完成'}</span>
                </div>
                {search.sources.length > 0 && (
                  <ul className="chat-sources">
                    {search.sources.map((source) => (
                      <li key={`${search.id}-${source.url}`}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                        ) : source.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {showReport && (
        <section className="chat-report" aria-label="研究报告">
          <div className="chat-report-bar">
            <h3>{message.phase === 'writing' ? '正在整理研究报告' : '研究报告'}</h3>
            {article && (
              <button type="button" className="btn btn-primary" onClick={() => onSendToReview(article)}>
                送审阅
              </button>
            )}
          </div>
          {html ? (
            <div className={`preview${message.phase === 'writing' ? ' chat-caret' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="preview preview-empty chat-caret">正在根据检索结果整理报告…</p>
          )}
        </section>
      )}

      {message.error && <p className="chat-error" role="alert">{message.error}</p>}
    </article>
  )
}
