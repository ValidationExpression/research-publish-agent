/**
 * Publish runtime — embeddable in Electron main process or CLI.
 */
import type { Server } from 'node:http'
import { adapterRegistry } from '@wechatsync/core/adapters'
import { registerAllPlatforms } from './register-platforms'
import { NodeRuntime } from './runtime/node-runtime'
import { CookieBridge } from './ws-server'
import { SyncManager } from './sync'
import { startRestApi } from './api'

export interface PublishRuntimeOptions {
  token: string
  httpPort?: number
  wsPort?: number
}

export interface PublishRuntime {
  runtime: NodeRuntime
  bridge: CookieBridge
  sync: SyncManager
  httpServer: Server
  httpPort: number
  wsPort: number
  token: string
  stop(): Promise<void>
}

export function startPublishRuntime(opts: PublishRuntimeOptions): PublishRuntime {
  const httpPort = opts.httpPort ?? Number(process.env.WECHATSYNC_HTTP_PORT || 8787)
  const wsPort = opts.wsPort ?? Number(process.env.WECHATSYNC_WS_PORT || 9527)
  const token = opts.token

  const runtime = new NodeRuntime()
  adapterRegistry.setRuntime(runtime)
  registerAllPlatforms()

  const bridge = new CookieBridge(wsPort, token, runtime)
  bridge.start()

  const sync = new SyncManager(runtime, bridge)
  const httpServer = startRestApi(httpPort, token, sync, bridge, runtime)

  console.error('[publish-runtime] started')
  console.error(`  - plugin: ws://localhost:${wsPort}`)
  console.error(`  - REST: http://127.0.0.1:${httpPort}`)

  return {
    runtime,
    bridge,
    sync,
    httpServer,
    httpPort,
    wsPort,
    token,
    stop: () =>
      new Promise((resolve) => {
        bridge.stop()
        httpServer.close(() => resolve())
      }),
  }
}
