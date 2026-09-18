import { type FormEvent } from 'react'
import { marked } from 'marked'
import type { ArticleDraft } from '../App'
import { IconArrowRight } from '../components/Icons'

interface Props {
  article: ArticleDraft
  onChange: (draft: ArticleDraft) => void
  onNext: () => void
}

export function ReviewPage({ article, onChange, onNext }: Props) {
  const html = marked.parse(article.markdown || '') as string
  const characterCount = article.markdown.trim().length
  const canContinue = article.title.trim().length > 0 && article.markdown.trim().length > 0

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (canContinue) onNext()
  }

  return (
    <form className="review-page" onSubmit={onSubmit}>
      <div className="review-toolbar">
        <div className="card-header">
          <div>
            <p className="card-subtitle" style={{ marginTop: 0 }}>文稿审阅</p>
            <h2 className="card-title">{characterCount} 个正文字符</h2>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!canContinue}>
            进入发布 <IconArrowRight />
          </button>
        </div>
        {!canContinue && (
          <p className="field-hint" role="status">
            请填写标题和 Markdown 正文后再进入发布。
          </p>
        )}
      </div>

      <div className="review-workspace">
        <section className="editor-pane" aria-label="文稿编辑">
          <div className="card-header">
            <div>
              <h2 className="card-title">编辑内容</h2>
              <p className="card-subtitle">标题和 Markdown 会即时同步至预览。</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="article-title">标题</label>
            <input
              id="article-title"
              type="text"
              value={article.title}
              onChange={(e) => onChange({ ...article, title: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="article-body">Markdown 正文</label>
            <textarea
              id="article-body"
              value={article.markdown}
              onChange={(e) => onChange({ ...article, markdown: e.target.value })}
            />
          </div>
        </section>

        <section className="preview-pane" aria-label="文稿预览">
          <div className="card-header">
            <div>
              <h2 className="card-title">实时预览</h2>
              <p className="card-subtitle">{article.title.trim() || '尚未填写标题'}</p>
            </div>
          </div>
          {article.markdown.trim() ? (
            <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="preview preview-empty">正文为空时，预览将在这里显示。</div>
          )}
        </section>
      </div>
    </form>
  )
}
