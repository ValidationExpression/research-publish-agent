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

  let onEvent: ((data: { jobId: string; type: string; message: string }) => void) | undefined

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
      await delay(400)
      onEvent?.({ jobId, type: 'progress', message: '正在检索可信资料…' })
      await delay(650)
      onEvent?.({ jobId, type: 'progress', message: '正在归纳框架差异与工程取舍…' })
      await delay(700)
      onEvent?.({ jobId, type: 'done', message: '报告已生成' })
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
