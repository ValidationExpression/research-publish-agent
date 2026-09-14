import { marked } from 'marked'
import type { ArticleDraft } from '../App'

interface Props {
  article: ArticleDraft
  onChange: (draft: ArticleDraft) => void
  onNext: () => void
}

export function ReviewPage({ article, onChange, onNext }: Props) {
  const html = marked.parse(article.markdown || '')

  return (
    <div>
      <div className="card">
        <h2>审阅报告</h2>
        <label>标题</label>
        <input
          type="text"
          value={article.title}
          onChange={(e) => onChange({ ...article, title: e.target.value })}
        />
        <div style={{ marginTop: 12 }}>
          <label>Markdown 正文</label>
          <textarea
            value={article.markdown}
            onChange={(e) => onChange({ ...article, markdown: e.target.value })}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="primary" onClick={onNext} disabled={!article.title || !article.markdown}>
            下一步：选择平台发布
          </button>
        </div>
      </div>
      <div className="card">
        <h3>预览</h3>
        <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
