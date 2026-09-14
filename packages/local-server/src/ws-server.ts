/**
 * Cookie Bridge —— 本地服务侧的 WebSocket 服务端
 *
 * 等待「Cookie Provider 插件」连入（仅 127.0.0.1），在发稿需要时主动向插件
 * 请求指定域名的 Cookie，并写入 NodeRuntime 内存。本地服务拿到 Cookie 后
 * 全部发稿逻辑在 Node 本地完成，不再依赖插件转发请求。
 *
 * 仅 127.0.0.1 监听 + Token 鉴权（请求中携带 WECHATSYNC_TOKEN）。
 */
import { WebSocketServer, WebSocket } from 'ws'
import type { NodeRuntime } from './runtime/node-runtime'

export class CookieBridge {
  private wss: WebSocketServer | null = null
  private client: WebSocket | null = null
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }
  >()
  private connected = false
  private readonly token: string
  private readonly runtime: NodeRuntime
  private readonly port: number

  constructor(port: number, token: string, runtime: NodeRuntime) {
    this.port = port
    this.token = token
    this.runtime = runtime
  }

  start(): void {
    this.wss = new WebSocketServer({ port: this.port, host: '127.0.0.1' })
    this.wss.on('listening', () => console.error(`[bridge] WebSocket 监听 127.0.0.1:${this.port}`))
    this.wss.on('connection', (ws: WebSocket) => {
      this.client = ws
      this.connected = true
      console.error('[bridge] Cookie Provider 插件已连接')
      ws.on('message', (data) => this.handleMessage(data.toString()))
      ws.on('close', () => {
        this.connected = false
        this.client = null
        this.runtime.clearCookies()
        console.error('[bridge] 插件断开，已清空内存 Cookie')
      })
      ws.on('error', (e) => console.error('[bridge] ws error', e))
    })
    this.wss.on('error', (e) => console.error('[bridge] ws server error', e))
  }

  isConnected(): boolean {
    return this.connected && !!this.client
  }

  status(): { connected: boolean; cookieDomains: string[] } {
    return { connected: this.isConnected(), cookieDomains: this.runtime.cookieDomains() }
  }

  /** 向插件请求指定域名的 Cookie，并写入 runtime 内存 */
  async requestCookies(domains: string[]): Promise<Record<string, string>> {
    if (!this.client) throw new Error('Cookie Provider 插件未连接')
    const result = (await this.request('getCookies', { domains })) as Record<string, string>
    this.runtime.setCookies(result)
    return result
  }

  /** 查询插件侧已登录（有 Cookie）的已知平台域名 */
  async listLoggedIn(): Promise<string[]> {
    if (!this.client) return []
    return (await this.request('listLoggedIn', {})) as string[]
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.client) return Promise.reject(new Error('插件未连接'))
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`请求插件超时: ${method}`))
      }, 60000)
      this.pending.set(id, { resolve, reject, timeout })
      this.client!.send(JSON.stringify({ id, method, token: this.token, params }))
    })
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as { id: string; result?: unknown; error?: { message: string } }
      const p = this.pending.get(msg.id)
      if (!p) return
      clearTimeout(p.timeout)
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    } catch (e) {
      console.error('[bridge] 解析插件消息失败', e)
    }
  }

  stop(): void {
    this.wss?.close()
    this.wss = null
  }
}
