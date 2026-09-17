/**
 * CLI entry: start publish runtime from environment variables.
 */
import { loadRootEnv } from './load-root-env'
import { startPublishRuntime } from './publish-runtime'

loadRootEnv()

const TOKEN = process.env.WECHATSYNC_TOKEN || ''

if (!TOKEN) {
  console.error('[local-server] 警告：未设置 WECHATSYNC_TOKEN，REST/WS 将无鉴权（仅本地回环仍可用）')
}

startPublishRuntime({ token: TOKEN })

console.error('  用法: 加载 cookie-provider 插件并填入相同 Token -> POST /sync 选平台发草稿')
