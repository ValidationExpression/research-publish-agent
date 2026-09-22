import { parseHTML } from 'linkedom'
// @ts-ignore turndown 无内置类型且环境无法安装 @types/turndown
import TurndownService from 'turndown'
import type { PreprocessConfig } from '@wechatsync/core/adapters'

/** 不应被"空元素清理"移除的标签（自闭合 / 媒体 / void 元素） */
const PRESERVE_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'source', 'area', 'embed', 'video',
  'audio', 'picture', 'col', 'wbr', 'meta', 'link',
])

/**
 * 按各平台 preprocessConfig 用 linkedom 清洗 HTML。
 * 目标：产出能被各平台 Web 编辑器接受的干净 HTML（与原 Content Script 预处理等价）。
 * 平台特定的进一步转换由对应 adapter 在 publish 内完成（如知乎 transformContent）。
 *
 * linkedom 的 parseHTML 把片段当成整页解析：以 <h1>/<p> 开头时，
 * 会把该标签当成根节点并插入空的 head/body，正文进不了 document.body。
 * 先建空文档再赋 innerHTML，按片段解析。
 */
function parseArticleDocument(rawHtml: string): {
  documentElement: any
  body: any
  querySelectorAll: (s: string) => any[]
  createElement: (t: string) => any
} {
  if (/<(?:html|body)[\s>]/i.test(rawHtml)) {
    return parseHTML(rawHtml).document as any
  }
  const { document } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>')
  document.body.innerHTML = rawHtml
  return document as any
}

export function preprocessHtml(rawHtml: string, config: PreprocessConfig): string {
  if (!rawHtml) return rawHtml
  const document = parseArticleDocument(rawHtml)
  const doc = document as unknown as {
    documentElement: any
    body: any
    querySelectorAll: (s: string) => any[]
    createElement: (t: string) => any
  }
  const root: any = doc.documentElement || document

  // 1. 移除注释节点
  if (config.removeComments) removeComments(root)

  // 2. 移除 iframe（多数平台不支持）
  if (config.removeIframes) doc.querySelectorAll('iframe').forEach((n: any) => n.remove())

  // 3. 移除微信等特殊标签（部分平台需连同父元素一起移除）
  if (config.removeSpecialTags) {
    const specials = ['mpvoice', 'mpvideo', 'mpprofile', 'qqmusic', 'mpcommonmusic', 'wxaudio', 'mp-statistics']
    for (const tag of specials) {
      doc.querySelectorAll(tag).forEach((n: any) => {
        if (config.removeSpecialTagsWithParent && n.parentElement) n.parentElement.remove()
        else n.remove()
      })
    }
  }

  // 4. 懒加载图片 data-src -> src（否则图片不显示）
  if (config.processLazyImages) {
    doc.querySelectorAll('img').forEach((img: any) => {
      const ds = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-loading-src')
      if (ds) img.setAttribute('src', ds)
    })
  }

  // 5. 代码块处理：保留纯文本（用 textContent 防止富文本标签污染）
  if (config.processCodeBlocks) {
    doc.querySelectorAll('pre').forEach((pre: any) => {
      const code = pre.querySelector ? pre.querySelector('code') : null
      if (code) code.textContent = code.textContent
    })
  }

  // 6. 移除 data-* 属性
  if (config.removeDataAttributes) {
    doc.querySelectorAll('*').forEach((el: any) => {
      Array.from(el.attributes || []).forEach((a: any) => {
        if (a.name.startsWith('data-')) el.removeAttribute(a.name)
      })
    })
  }

  // 7. 移除 srcset / sizes
  if (config.removeSrcset) doc.querySelectorAll('img').forEach((img: any) => img.removeAttribute('srcset'))
  if (config.removeSizes) doc.querySelectorAll('img').forEach((img: any) => img.removeAttribute('sizes'))

  // 8. section -> div
  if (config.convertSectionToDiv) {
    doc.querySelectorAll('section').forEach((sec: any) => {
      const div = doc.createElement('div')
      div.innerHTML = sec.innerHTML
      if (sec.className) div.className = sec.className
      if (sec.parentNode) sec.parentNode.replaceChild(div, sec)
    })
  }

  // 9. 移除空元素（保留媒体/void 标签）
  if (config.removeEmptyElements) removeEmpty(doc)

  let html = getBodyHtml(document)
  if (config.compactHtml && html) {
    html = html.replace(/>\s+</g, '><').replace(/\s+/g, ' ')
  }
  return html || ''
}

/** HTML -> Markdown（turndown，代码块围栏 + ATX 标题） */
function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  return td.turndown(html)
}

/**
 * 预处理并按平台要求的输出格式返回双格式内容：
 * - html：清洗后的 HTML
 * - markdown：当平台 outputFormat 为 markdown（如 CSDN）时由 HTML 转换而来，
 *   否则为空字符串（由调用方优先使用调用者显式传入的 markdown）
 */
export function preprocessArticle(
  rawHtml: string,
  config: PreprocessConfig,
): { html: string; markdown: string } {
  const html = preprocessHtml(rawHtml, config)
  const markdown =
    config.outputFormat === 'markdown' && html ? htmlToMarkdown(html) : ''
  return { html, markdown }
}

/**
 * 提取正文 HTML。linkedom 对无 <body> 的片段可能把内容挂在 <html> 下，
 * 因此优先取 body.innerHTML，否则取 <html> 下除 head/body 之外的元素。
 */
function getBodyHtml(document: any): string {
  if (document.body && document.body.innerHTML && document.body.innerHTML.trim()) {
    return document.body.innerHTML
  }
  const htmlEl = document.documentElement
  if (htmlEl) {
    const parts: string[] = []
    for (const child of htmlEl.children || []) {
      const tag = (child.tagName || '').toLowerCase()
      if (tag === 'head' || tag === 'body') continue
      parts.push(child.outerHTML || '')
    }
    if (parts.length) return parts.join('')
    if (document.body) return document.body.innerHTML
  }
  return typeof document.toString === 'function' ? document.toString() : ''
}

function removeComments(node: any): void {
  const found: any[] = []
  const collect = (n: any) => {
    if (!n) return
    if (n.nodeType === 8) found.push(n)
    const children = n.childNodes || n.children || []
    for (const c of children) collect(c)
  }
  collect(node)
  found.forEach((n) => n.parentNode && n.parentNode.removeChild(n))
}

function removeEmpty(doc: any): void {
  let changed = true
  while (changed) {
    changed = false
    const els = doc.documentElement ? doc.documentElement.querySelectorAll('*') : []
    for (const el of els) {
      const tag = (el.tagName || '').toLowerCase()
      if (PRESERVE_TAGS.has(tag)) continue // 不移除媒体/void 元素
      const text = (el.textContent || '').trim()
      const hasImg = el.querySelector && el.querySelector('img')
      const hasSvg = el.querySelector && el.querySelector('svg')
      if (!text && !hasImg && !hasSvg && el.childNodes && el.childNodes.length <= 1) {
        if (el.parentNode && el.parentNode !== doc.documentElement) {
          el.remove()
          changed = true
        }
      }
    }
  }
}
