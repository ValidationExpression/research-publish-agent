import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { ResearchPage } from './pages/ResearchPage'
import { ReviewPage } from './pages/ReviewPage'
import { PublishPage } from './pages/PublishPage'
import { PageHeader } from './components/PageHeader'
import { WorkflowSidebar } from './components/WorkflowSidebar'
import type { AppStep, ServiceRequestPhase, WorkflowArticle } from './workflow'

export type { AppStep } from './workflow'

export interface ArticleDraft extends WorkflowArticle {}

const PAGE_META = {
  research: {
    eyebrow: 'RESEARCH / 01',
    title: '今天想研究什么？',
    description: '输入主题，Agent 将联网检索资料并整理成可发表的 Markdown 报告。',
  },
  review: {
    eyebrow: 'REVIEW / 02',
    title: '审阅并完善报告',
    description: '调整标题与正文，并通过实时预览确认最终呈现。',
  },
  publish: {
    eyebrow: 'PUBLISH / 03',
    title: '选择发布平台',
    description: '将确认后的内容安全同步为各平台草稿。',
  },
} satisfies Record<AppStep, { eyebrow: string; title: string; description: string }>

export default function App() {
  const [step, setStep] = useState<AppStep>('research')
  const [publishConnected, setPublishConnected] = useState(false)
  const [researchOk, setResearchOk] = useState(false)
  const [serviceStatusPhase, setServiceStatusPhase] = useState<ServiceRequestPhase>('loading')
  const [hasResolvedServiceStatus, setHasResolvedServiceStatus] = useState(false)
  const [serviceStatusError, setServiceStatusError] = useState<string | null>(null)
  const [config, setConfig] = useState<{ publishToken: string } | null>(null)
  const [article, setArticle] = useState<ArticleDraft>({ title: '', markdown: '' })

  const refreshStatus = useCallback(async () => {
    setServiceStatusPhase('loading')
    try {
      const status = await window.desktopApi.getServiceStatus() as {
        publish?: { connected?: boolean }
        research?: { ok?: boolean }
      }
      setPublishConnected(!!status.publish?.connected)
      setResearchOk(!!status.research?.ok)
      setHasResolvedServiceStatus(true)
      setServiceStatusPhase('success')
      setServiceStatusError(null)
    } catch (error) {
      setServiceStatusPhase('error')
      setServiceStatusError(error instanceof Error ? error.message : '服务状态刷新失败')
      // Keep the prior status visible while a refresh is unavailable.
    }
  }, [])

  useEffect(() => {
    window.desktopApi.getConfig().then((c) => setConfig(c as { publishToken: string }))
    refreshStatus()
    const t = setInterval(refreshStatus, 5000)
    return () => clearInterval(t)
  }, [refreshStatus])

  const goReview = (draft: ArticleDraft) => {
    setArticle(draft)
    setStep('review')
  }

  const chromeHeight = window.desktopApi?.titleBarHeight ?? 0
  const platform = window.desktopApi?.platform ?? 'web'
  const hasChrome = chromeHeight > 0

  return (
    <div
      className={`window-frame${hasChrome ? ' has-chrome' : ''}`}
      style={hasChrome ? ({ '--titlebar-height': `${chromeHeight}px` } as CSSProperties) : undefined}
    >
      {hasChrome && (
        <header className={`titlebar${platform === 'darwin' ? ' is-darwin' : ''}`} aria-label="窗口标题栏">
          <span className="titlebar-mark" aria-hidden="true">R</span>
          <span className="titlebar-title">Research Publish</span>
        </header>
      )}
      <div className="app-shell">
        <WorkflowSidebar
          currentStep={step}
          article={article}
          publishConnected={publishConnected}
          researchOk={researchOk}
          serviceStatusPhase={serviceStatusPhase}
          hasResolvedServiceStatus={hasResolvedServiceStatus}
          serviceStatusError={serviceStatusError}
          onStepChange={setStep}
        />

      <div className="main-panel">
        <PageHeader {...PAGE_META[step]} />

        <main className="content">
          {hasResolvedServiceStatus && !publishConnected && (
            <div className="onboarding-banner" role="status">
              <div>
                <strong>首次使用</strong>
                ：在 Chrome 加载扩展目录{' '}
                <code className="inline-code">packages/cookie-provider/dist</code>
                ，Token 填写{' '}
                <code className="inline-code">{config?.publishToken || 'wechatsync-local'}</code>
                ，并在浏览器登录目标平台。
              </div>
            </div>
          )}

          {step === 'research' && <ResearchPage onComplete={goReview} />}
          {step === 'review' && (
            <ReviewPage
              article={article}
              onChange={setArticle}
              onNext={() => setStep('publish')}
            />
          )}
          {step === 'publish' && <PublishPage article={article} />}
        </main>
      </div>
      </div>
    </div>
  )
}
