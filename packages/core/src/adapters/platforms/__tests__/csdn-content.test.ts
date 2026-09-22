import { describe, expect, it } from 'vitest'
import { resolveCsdnHtml } from '../csdn'

describe('resolveCsdnHtml', () => {
  it('uses provided HTML when present', () => {
    expect(resolveCsdnHtml('# 标题', '<p>已有 HTML</p>')).toBe('<p>已有 HTML</p>')
  })

  it('renders markdown to HTML when HTML is missing so CSDN content is not empty', () => {
    const html = resolveCsdnHtml('# 标题\n\n正文', '')
    expect(html).toMatch(/标题/)
    expect(html).toMatch(/正文/)
  })

  it('renders markdown to HTML when HTML is whitespace', () => {
    const html = resolveCsdnHtml('一段内容', '   ')
    expect(html).toMatch(/一段内容/)
  })

  it('returns empty string when both markdown and HTML are empty', () => {
    expect(resolveCsdnHtml('', '')).toBe('')
  })
})
