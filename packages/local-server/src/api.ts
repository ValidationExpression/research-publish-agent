/**
 * REST API（仅 127.0.0.1 + Token 鉴权）
 */
import http, { type Server } from 'node:http'
import { adapterRegistry, trendRegistry } from '@wechatsync/core/adapters'
import type { SyncManager } from './sync'
import type { CookieBridge } from './ws-server'
import type { NodeRuntime } from './runtime/node-runtime'

export { trendRegistry }

export function startRestApi(
  port: number,
  token: string,
  sync: SyncManager,
  bridge: CookieBridge,
  runtime: NodeRuntime,
): Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const provided =
      (req.headers['authorization']?.toString().replace('Bearer ', '')) || url.searchParams.get('token') || ''
    if (!token || provided !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200)
      res.end(JSON.stringify({ ...bridge.status(), tokenRequired: !!token }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/platforms') {
      const metas = adapterRegistry.getAllMeta()
      const platforms = metas.map((m) => ({
        id: m.id,
        name: m.name,
        homepage: m.homepage,
        loggedIn: m.homepage ? runtime.hasCookie(new URL(m.homepage).hostname) : false,
      }))
      res.writeHead(200)
      res.end(JSON.stringify({ platforms, total: platforms.length }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/trends') {
      const platformsParam = url.searchParams.get('platforms') || ''
      const platforms = platformsParam.split(',').map((s) => s.trim()).filter(Boolean)
      const limit = Number(url.searchParams.get('limit') || '20')
      try {
        const items = platforms.length
          ? await trendRegistry.listTrends(platforms, { limit })
          : []
        res.writeHead(200)
        res.end(JSON.stringify({ items }))
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        res.writeHead(500)
        res.end(JSON.stringify({ error: message }))
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/sync') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        try {
          const { platforms, article, draftOnly } = JSON.parse(body)
          if (!Array.isArray(platforms) || !article?.title) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'platforms[] 与 article.title 必填' }))
            return
          }
          const id = sync.start(platforms, article, draftOnly ?? true)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ syncId: id, status: 'running' }))
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: message }))
        }
      })
      return
    }

    const m = req.method === 'GET' ? url.pathname.match(/^\/sync\/(.+)$/) : null
    if (m) {
      const task = sync.get(m[1])
      if (!task) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      res.writeHead(200)
      res.end(JSON.stringify(task))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.listen(port, '127.0.0.1', () => {
    console.error(`[api] REST API 监听 127.0.0.1:${port}`)
  })

  return server
}
