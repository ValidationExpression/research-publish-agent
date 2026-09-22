/**
 * 本地调度：遍历目标平台，按需向插件请求 Cookie，复用 core 适配器发草稿。
 *
 * 设计要点：
 *   - 不直接复用 extension 的 performSync（其耦合 chrome.storage/Badge/CMS），
 *     这里自写干净调度。
 *   - 对每个平台：取 meta.homepage 域名 -> 若无 Cookie 则向插件请求 ->
 *     按 preprocessConfig 预处理 HTML -> getAdapter().publish（默认草稿）。
 *   - 平台间间隔 3s，避免秒级连发触发风控。
 */
import { adapterRegistry, getAdapter, getPreprocessConfig } from '@wechatsync/core/adapters'
import { preprocessArticle } from './preprocess'
import type { CookieBridge } from './ws-server'
import type { NodeRuntime } from './runtime/node-runtime'
import { extractHost, rootDomain } from './domains'

export interface SyncResultItem {
  platform: string
  success: boolean
  postUrl?: string
  postId?: string
  draftOnly?: boolean
  error?: string
}

interface SyncTask {
  id: string
  status: 'running' | 'completed' | 'failed'
  platforms: string[]
  results: SyncResultItem[]
  startTime: number
  endTime?: number
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function genId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 平台间发文间隔（毫秒），降风控 */
const PLATFORM_INTERVAL_MS = 3000

export class SyncManager {
  private tasks = new Map<string, SyncTask>()

  constructor(
    private readonly runtime: NodeRuntime,
    private readonly bridge: CookieBridge,
  ) {}

  get(id: string): SyncTask | undefined {
    return this.tasks.get(id)
  }

  start(
    platforms: string[],
    article: { title: string; html?: string; content?: string; markdown?: string; cover?: string },
    draftOnly = true,
  ): string {
    const id = genId()
    const task: SyncTask = { id, status: 'running', platforms, results: [], startTime: Date.now() }
    this.tasks.set(id, task)
    void this.run(task, platforms, article, draftOnly)
    return id
  }

  private async run(
    task: SyncTask,
    platforms: string[],
    article: { title: string; html?: string; content?: string; markdown?: string; cover?: string },
    draftOnly: boolean,
  ): Promise<void> {
    const metas = adapterRegistry.getAllMeta()
    const metaById = new Map(metas.map((m) => [m.id, m]))

    for (const pid of platforms) {
      const meta = metaById.get(pid)
      const host = extractHost(meta?.homepage)
      try {
        // 缺失 Cookie 时向插件请求根域（chrome.cookies.getAll 连带子域，
        // 请求根域才能拿到挂在 .csdn.net 等父域上的登录 Cookie）
        const domain = host ? rootDomain(host) : null
        if (domain && !this.runtime.hasCookie(domain)) {
          await this.bridge.requestCookies([domain])
        }

        const config = getPreprocessConfig(pid)
        const rawHtml = article.html || article.content || ''
        const cleaned = preprocessArticle(rawHtml, config)

        const adapter = await getAdapter(pid)
        if (!adapter) {
          task.results.push({ platform: pid, success: false, error: '未找到适配器' })
          continue
        }

        // article 字段兼容 core 的 Article 结构：
        // html 填清洗后 HTML；markdown 填平台要求的 Markdown（outputFormat=markdown
        // 的平台如 CSDN 由预处理转换而来），保证 markdowncontent 不为空
        const payload: any = {
          title: article.title,
          html: cleaned.html || rawHtml,
          markdown: article.markdown || cleaned.markdown,
          content: cleaned.html || rawHtml,
          cover: article.cover,
        }
        const result: any = await adapter.publish(payload, {
          draftOnly,
          onImageProgress: () => {
            /* 可选：上报图片上传进度 */
          },
        })

        task.results.push({
          platform: pid,
          success: result.success,
          postUrl: result.postUrl,
          postId: result.postId,
          draftOnly: result.draftOnly,
          error: result.error,
        })
      } catch (e: any) {
        task.results.push({ platform: pid, success: false, error: e?.message || String(e) })
      }

      // 平台间间隔，降风控（避免秒级连发）
      await delay(PLATFORM_INTERVAL_MS)
    }

    task.status = 'completed'
    task.endTime = Date.now()
  }
}
