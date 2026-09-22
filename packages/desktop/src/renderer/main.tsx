import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

function installDevPreviewApi(): void {
  if (window.desktopApi) return

  const sample = {
    title: '2026 年主流 AI Agent 框架对比',
    markdown: [
      '# 2026 年主流 AI Agent 框架对比',
      '',
      '本文从架构设计、工具调用、状态管理与生产部署四个维度进行比较。',
      '',
      '## 核心结论',
      '',
      '- 不同框架面向的工程阶段并不相同。',
      '- 生产选型应优先考虑可观测性与故障恢复。',
      '',
      '> 框架能力只是起点，可靠的运行机制决定最终效果。',
    ].join('\n'),
  }
  const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

  let onEvent: ((data: { jobId: string; type: string; message?: string; id?: string; query?: string; status?: 'running' | 'done' | 'error'; sources?: { title: string; url: string }[]; elapsed?: number }) => void) | undefined

  window.desktopApi = {
    platform: 'web',
    titleBarHeight: 0,
    getConfig: async () => ({ publishToken: 'wechatsync-local' }),
    getServiceStatus: async () => ({ publish: { connected: true }, research: { ok: true } }),
    researchFetch: async (path) => {
      if (path === '/research') return { ok: true, status: 200, data: { jobId: 'preview' } }
      if (path.includes('/report')) return { ok: true, status: 200, data: sample }
      if (path.includes('/status')) return { ok: true, status: 200, data: { status: 'completed', hasReport: true } }
      return { ok: false, status: 404, data: null }
    },
    publishFetch: async (path) => {
      if (path.startsWith('/platforms')) {
        return {
          ok: true,
          status: 200,
          data: {
            platforms: [
              { id: 'weixin', name: '微信公众号', loggedIn: true },
              { id: 'csdn', name: 'CSDN', loggedIn: true },
              { id: 'zhihu', name: '知乎', loggedIn: false },
              { id: 'juejin', name: '掘金', loggedIn: false },
            ],
          },
        }
      }
      if (path === '/sync') return { ok: true, status: 200, data: { syncId: 'preview' } }
      if (path.startsWith('/sync/')) {
        return {
          ok: true,
          status: 200,
          data: {
            status: 'completed',
            results: [
              { platform: 'weixin', success: true, postUrl: 'https://example.com/draft' },
              { platform: 'csdn', success: false, error: '未登录' },
            ],
          },
        }
      }
      return { ok: false, status: 404, data: null }
    },
    onResearchSseEvent: (cb) => {
      onEvent = cb
      return () => {
        onEvent = undefined
      }
    },
    onResearchSseError: () => () => {},
    onResearchSseEnd: () => () => {},
    startResearchSse: async (jobId) => {
      const push = (event: { type: string; message?: string; id?: string; query?: string; status?: 'running' | 'done' | 'error'; sources?: { title: string; url: string }[]; elapsed?: number }) => {
        onEvent?.({ jobId, ...event })
      }
      push({ type: 'thinking', message: '先比较这些框架各自解决的工程问题，再决定检索哪些对比。' })
      await delay(350)
      push({ type: 'search', id: 's1', query: '2026 AI Agent framework comparison', status: 'running', message: '2026 AI Agent framework comparison' })
      await delay(400)
      push({
        type: 'search',
        id: 's1',
        query: '2026 AI Agent framework comparison',
        status: 'done',
        message: '2026 AI Agent framework comparison',
        sources: [{ title: 'LangGraph docs', url: 'https://example.com/langgraph' }],
      })
      await delay(250)
      push({ type: 'phase', message: 'writing' })
      push({ type: 'report', message: sample.markdown.slice(0, 48) })
      await delay(250)
      push({ type: 'report', message: sample.markdown.slice(48) })
      await delay(200)
      push({ type: 'done', message: '研究报告已生成' })
    },
  }
}

if (import.meta.env.DEV) {
  installDevPreviewApi()
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
