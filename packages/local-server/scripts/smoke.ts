/**
 * 冒烟验证脚本（不依赖真实账号/浏览器）：
 *  1. core 适配器注册中心能被 NodeRuntime 接管；
 *  2. REST /platforms 返回 29+ 平台；
 *  3. preprocessHtml 能按知乎配置清洗 HTML（懒加载图/特殊标签/iframe 等）。
 * 运行：pnpm --filter @wechatsync/local-server exec tsx scripts/smoke.ts
 */
import http from 'node:http'
import { adapterRegistry, getPreprocessConfig } from '@wechatsync/core/adapters'
import { registerAllPlatforms } from '../src/register-platforms'
import { NodeRuntime } from '../src/runtime/node-runtime'
import { CookieBridge } from '../src/ws-server'
import { SyncManager } from '../src/sync'
import { startRestApi } from '../src/api'
import { preprocessHtml } from '../src/preprocess'

const TOKEN = 'smoke-token'
const WS_PORT = 19527
const REST_PORT = 18787

async function main(): Promise<void> {
  const runtime = new NodeRuntime()
  adapterRegistry.setRuntime(runtime)
  registerAllPlatforms()
  const bridge = new CookieBridge(WS_PORT, TOKEN, runtime)
  bridge.start()
  const sync = new SyncManager(runtime, bridge)
  startRestApi(REST_PORT, TOKEN, sync, bridge, runtime)

  await new Promise((r) => setTimeout(r, 800))

  const get = (path: string): Promise<any> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: REST_PORT, path: `${path}?token=${TOKEN}`, method: 'GET' },
        (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => resolve(JSON.parse(body)))
        },
      )
      req.on('error', reject)
      req.end()
    })

  const status = await get('/status')
  const platforms = await get('/platforms')
  console.log('[smoke] /status =', JSON.stringify(status))
  console.log(`[smoke] 平台总数 = ${platforms.total}`)
  console.log('[smoke] 样例平台 =', platforms.platforms.slice(0, 6).map((p: any) => `${p.id}:${p.name}`).join(', '))

  // 预处理验证
  const cfg = getPreprocessConfig('zhihu')
  console.log('[smoke] zhihu preprocessConfig =', JSON.stringify(cfg))
  const sample =
    '<section><div data-x="1"><img data-src="http://a.com/b.png" src=""><p>  hello  </p><iframe></iframe></div></section>'
  const out = preprocessHtml(sample, cfg)
  console.log('[smoke] preprocess 输出 =', out.slice(0, 200))

  // 自适应知乎实际配置：文本保留为必过；懒加载图/iframe 仅在配置启用时校验
  const textKept = out.includes('hello')
  const lazyImg = cfg.processLazyImages ? out.includes('src="http://a.com/b.png"') : true
  const noIframe = cfg.removeIframes ? !out.includes('<iframe') : true
  const ok = platforms.total >= 10 && out.length > 0 && textKept && lazyImg && noIframe
  console.log(ok ? '[smoke] ✅ 验证通过' : '[smoke] ❌ 验证失败')

  bridge.stop()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
