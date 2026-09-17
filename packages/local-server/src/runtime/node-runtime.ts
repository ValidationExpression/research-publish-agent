/**
 * Node 运行时实现
 *
 * 让 packages/core 的平台适配器在 Node 环境下直接发稿，而无需改动任何
 * adapter 业务代码。核心职责：
 *   - fetch：注入 Cookie 请求头 + 应用适配器注册的 Header 规则 + 真实浏览器 UA；
 *   - headerRules：按 urlFilter 匹配并附加 Header（适配 CodeAdapter.withHeaderRules）；
 *   - dom：用 linkedom 提供 parseHTML/querySelector 等（供预处理层使用）；
 *   - cookies/storage/session：内存实现，Cookie 不落盘。
 *
 * adapter 里写死的 `credentials: 'include'`、浏览器专属 API 由本 Runtime 接管，
 * Node 全局 fetch 会忽略 credentials 字段，Cookie 统一在此注入。
 */
import type { RuntimeInterface } from '@wechatsync/core/runtime'
import { parseHTML } from 'linkedom'

/** 本地镜像 HeaderRule（与 core 结构一致，structural typing 兼容） */
interface HeaderRule {
  urlFilter: string
  headers: Record<string, string>
  resourceTypes?: string[]
}

/** 本地镜像 Cookie（与 core 结构一致） */
interface Cookie {
  name: string
  value: string
  domain: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: string
}

// 真实浏览器 UA，降低被平台识别为"非浏览器脚本"的概率
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 将 urlFilter 通配符转为正则（* -> 任意字符，含跨段）
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + escaped + '$')
}

/**
 * 根据请求域名从 cookieMap 选取匹配的 Cookie 串
 * cookieMap 的 key 为根域（如 zhihu.com），请求 host 可能为 www.zhihu.com
 */
function matchCookie(cookieMap: Map<string, string>, host: string): string | undefined {
  for (const [domain, cookie] of cookieMap) {
    if (host === domain || host.endsWith('.' + domain)) return cookie
  }
  return undefined
}

export class NodeRuntime implements RuntimeInterface {
  readonly type = 'node' as const

  /** domain -> "name=value; ..." 仅内存 */
  private cookieMap = new Map<string, string>()
  /** 适配器注册的 Header 规则（内部数组，避免与下方 getter 同名冲突） */
  private _headerRules: { id: string; rule: HeaderRule }[] = []
  private storageMap = new Map<string, unknown>()
  private sessionMap = new Map<string, unknown>()

  // ===== Cookie 供给（本地服务调用）=====
  /** 写入单域名 Cookie（插件回传后调用） */
  setCookiesForDomain(domain: string, cookieStr: string): void {
    this.cookieMap.set(domain, cookieStr)
  }
  /** 批量写入（domain -> cookie串） */
  setCookies(map: Record<string, string>): void {
    for (const [domain, cookie] of Object.entries(map)) this.cookieMap.set(domain, cookie)
  }
  /** 清空所有 Cookie（如插件断开/用户撤销） */
  clearCookies(): void {
    this.cookieMap.clear()
  }
  /** 是否已持有某域名（含子域后缀匹配）的 Cookie */
  hasCookie(domain: string): boolean {
    return !!matchCookie(this.cookieMap, domain)
  }
  /** 已持有的 Cookie 域名清单（供状态查询） */
  cookieDomains(): string[] {
    return Array.from(this.cookieMap.keys())
  }

  // ===== fetch：注入 Cookie + Header 规则 + UA =====
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const host = new URL(url).hostname
    const headers = new Headers(options.headers)

    // 注入 Cookie（adapter 写死的 credentials:'include' 在 Node 下无效，这里统一注入）
    const cookie = matchCookie(this.cookieMap, host)
    if (cookie) headers.set('Cookie', cookie)

    // 真实浏览器 UA
    if (!headers.has('User-Agent')) headers.set('User-Agent', BROWSER_UA)

    // 应用适配器注册的 Header 规则（如知乎 x-requested-with）
    for (const { rule } of this._headerRules) {
      if (globToRegExp(rule.urlFilter).test(url)) {
        for (const [k, v] of Object.entries(rule.headers)) headers.set(k, v)
      }
    }

    // credentials 在 Node 全局 fetch 无意义，忽略
    const { credentials: _credentials, ...rest } = options as RequestInit & {
      credentials?: string
    }
    return (await fetch(url, { ...rest, headers })) as unknown as Response
  }

  // ===== headerRules（使 CodeAdapter.withHeaderRules 在 Node 下可用）=====
  headerRulesApi = {
    add: async (rule: HeaderRule): Promise<string> => {
      const id = `hr_${Math.random().toString(36).slice(2, 10)}`
      this._headerRules.push({ id, rule })
      return id
    },
    remove: async (id: string): Promise<void> => {
      this._headerRules = this._headerRules.filter((h) => h.id !== id)
    },
    clear: async (): Promise<void> => {
      this._headerRules = []
    },
  }

  // headerRules 字段（RuntimeInterface 要求可选；这里提供实现）
  get headerRules(): { add: (r: HeaderRule) => Promise<string>; remove: (id: string) => Promise<void>; clear: () => Promise<void> } {
    return this.headerRulesApi
  }

  // ===== cookies（内存，适配器一般不直接使用；供完整性）=====
  cookies = {
    get: async (domain: string): Promise<Cookie[]> => {
      const cookie = this.cookieMap.get(domain)
      if (!cookie) return []
      return cookie.split(';').map((pair) => {
        const idx = pair.indexOf('=')
        return {
          name: pair.slice(0, idx).trim(),
          value: pair.slice(idx + 1).trim(),
          domain,
        }
      })
    },
    set: async (cookie: Cookie): Promise<void> => {
      const existing = this.cookieMap.get(cookie.domain) || ''
      const next = `${cookie.name}=${cookie.value}`
      const parts = existing ? existing.split('; ').filter((p) => !p.startsWith(cookie.name + '=')) : []
      parts.push(next)
      this.cookieMap.set(cookie.domain, parts.join('; '))
    },
    remove: async (name: string, domain: string): Promise<void> => {
      const existing = this.cookieMap.get(domain)
      if (!existing) return
      const parts = existing.split('; ').filter((p) => !p.startsWith(name + '='))
      this.cookieMap.set(domain, parts.join('; '))
    },
  }

  // ===== storage / session（内存）=====
  storage = {
    get: async <T>(key: string): Promise<T | null> => {
      return (this.storageMap.get(key) as T) ?? null
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      this.storageMap.set(key, value)
    },
    remove: async (key: string): Promise<void> => {
      this.storageMap.delete(key)
    },
  }

  session = {
    get: async <T>(key: string): Promise<T | null> => {
      return (this.sessionMap.get(key) as T) ?? null
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      this.sessionMap.set(key, value)
    },
  }

  // ===== dom（linkedom 实现，供预处理层使用）=====
  dom = {
    parseHTML: async (html: string): Promise<Document> => {
      const { document } = parseHTML(html)
      return document as unknown as Document
    },
    querySelector: (doc: Document, selector: string): Element | null => {
      return (doc as unknown as { querySelector(s: string): Element | null }).querySelector(selector)
    },
    querySelectorAll: (doc: Document, selector: string): Element[] => {
      return Array.from(
        (doc as unknown as { querySelectorAll(s: string): NodeListOf<Element> }).querySelectorAll(selector),
      )
    },
    getTextContent: (el: Element): string => {
      return (el as unknown as { textContent: string | null }).textContent || ''
    },
    getInnerHTML: (el: Element): string => {
      return (el as unknown as { innerHTML: string }).innerHTML || ''
    },
  }
}
