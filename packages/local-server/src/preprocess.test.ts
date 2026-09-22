import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { marked } from 'marked'
import { preprocessArticle } from './preprocess'
import type { PreprocessConfig } from '@wechatsync/core/adapters'

const csdnConfig: PreprocessConfig = {
  outputFormat: 'markdown',
  removeIframes: true,
  removeComments: true,
  removeSpecialTags: true,
  removeSvgImages: true,
  processCodeBlocks: true,
  processLazyImages: true,
  removeEmptyElements: true,
  removeDataAttributes: true,
  removeSrcset: true,
  removeSizes: true,
}

describe('preprocessArticle', () => {
  it('keeps marked HTML that starts with h1 instead of dropping the fragment', async () => {
    const markdown = [
      '# 标题',
      '',
      '这是正文段落。',
      '',
      '## 小节',
      '',
      '- 列表 1',
    ].join('\n')
    const html = await marked.parse(markdown)

    const cleaned = preprocessArticle(html, csdnConfig)

    assert.match(cleaned.html, /标题/)
    assert.match(cleaned.html, /这是正文段落/)
    assert.match(cleaned.markdown, /标题/)
    assert.match(cleaned.markdown, /这是正文段落/)
  })

  it('keeps a paragraph-only HTML fragment', () => {
    const cleaned = preprocessArticle('<p>请输入内容不应出现</p>', csdnConfig)
    assert.match(cleaned.html, /请输入内容不应出现/)
    assert.match(cleaned.markdown, /请输入内容不应出现/)
  })

  it('returns empty strings for empty input', () => {
    const cleaned = preprocessArticle('', csdnConfig)
    assert.equal(cleaned.html, '')
    assert.equal(cleaned.markdown, '')
  })

  it('still extracts a complete html document', () => {
    const cleaned = preprocessArticle(
      '<!DOCTYPE html><html><head></head><body><p>完整文档</p></body></html>',
      csdnConfig,
    )
    assert.match(cleaned.html, /完整文档/)
    assert.match(cleaned.markdown, /完整文档/)
  })
})
