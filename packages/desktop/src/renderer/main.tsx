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
  let savedReports = [
    {
      jobId: 'preview-agent',
      title: '2026 年主流 AI Agent 框架对比',
      topic: '2026 年主流 AI Agent 框架的能力与适用场景对比',
      completedAt: '2026-09-22T08:30:00.000Z',
      markdown: sample.markdown,
    },
    {
      jobId: 'preview-cost',
      title: '大模型推理成本的构成',
      topic: '大模型推理成本的构成与工程优化路径',
      completedAt: '2026-09-20T03:15:00.000Z',
      markdown: '# 大模型推理成本的构成\n\n推理成本主要来自算力、显存和请求排队。\n\n## 优化路径\n\n- 批处理与缓存可以降低单次请求成本。\n- 规格选择应跟延迟目标一起看。\n',
    },
  ]
  const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

  let onEvent: ((data: { jobId: string; type: string; message?: string; id?: string; query?: string; status?: 'running' | 'done' | 'error'; sources?: { title: string; url: string }[]; elapsed?: number }) => void) | undefined

  window.desktopApi = {
    platform: 'web',
    titleBarHeight: 0,
    getConfig: async () => ({ publishToken: 'wechatsync-local' }),
    getServiceStatus: async () => ({ publish: { connected: true }, research: { ok: true } }),
    researchFetch: async (path, init) => {
      if (path === '/research/reports') {
        return {
          ok: true,
          status: 200,
          data: {
            reports: savedReports.map(({ jobId, title, topic, completedAt }) => ({ jobId, title, topic, completedAt })),
          },
        }
      }
      if (path.startsWith('/research/reports/')) {
        const jobId = path.slice('/research/reports/'.length)
        if (init?.method === 'DELETE') {
          const next = savedReports.filter((report) => report.jobId !== jobId)
          if (next.length === savedReports.length) return { ok: false, status: 404, data: null }
          savedReports = next
          return { ok: true, status: 200, data: { ok: true } }
        }
        const report = savedReports.find((item) => item.jobId === jobId)
        return report
          ? { ok: true, status: 200, data: report }
          : { ok: false, status: 404, data: null }
      }
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
