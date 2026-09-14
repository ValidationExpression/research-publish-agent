import { useCallback, useEffect, useState } from 'react'
import { ResearchPage } from './pages/ResearchPage'
import { ReviewPage } from './pages/ReviewPage'
import { PublishPage } from './pages/PublishPage'

export type AppStep = 'research' | 'review' | 'publish'

export interface ArticleDraft {
  title: string
  markdown: string
}

export default function App() {
  const [step, setStep] = useState<AppStep>('research')
  const [publishConnected, setPublishConnected] = useState(false)
  const [researchOk, setResearchOk] = useState(false)
  const [config, setConfig] = useState<{ publishToken: string } | null>(null)
  const [article, setArticle] = useState<ArticleDraft>({ title: '', markdown: '' })

  const refreshStatus = useCallback(async () => {
    const status = await window.desktopApi.getServiceStatus() as {
      publish?: { connected?: boolean }
      research?: { ok?: boolean }
    }
    setPublishConnected(!!status.publish?.connected)
    setResearchOk(!!status.research?.ok)
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

  return (
    <div className="app">
      <header className="header">
        <h1>Research Publish Agent</h1>
        <div className="status-bar">
          <span className={`pill ${publishConnected ? 'ok' : 'bad'}`}>
            Cookie 插件 {publishConnected ? '已连接' : '未连接'}
          </span>
          <span className={`pill ${researchOk ? 'ok' : 'bad'}`}>
            研究服务 {researchOk ? '运行中' : '未就绪'}
          </span>
        </div>
      </header>

      {!publishConnected && (
        <div className="content">
          <div className="wizard">
            <strong>首次使用：</strong>在 Chrome 加载 <code>packages/cookie-provider/dist</code>，
            Token 填 <code>{config?.publishToken || 'wechatsync-local'}</code>，并在浏览器登录目标平台。
          </div>
        </div>
      )}

      <nav className="nav">
        <button className={step === 'research' ? 'active' : ''} onClick={() => setStep('research')}>1. 研究</button>
        <button className={step === 'review' ? 'active' : ''} onClick={() => setStep('review')} disabled={!article.markdown}>2. 审阅</button>
        <button className={step === 'publish' ? 'active' : ''} onClick={() => setStep('publish')} disabled={!article.title}>3. 发布</button>
      </nav>

      <main className="content">
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
  )
}
