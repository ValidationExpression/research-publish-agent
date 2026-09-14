// 端到端测试：向 CSDN + 微信公众号各发一篇测试草稿
const TOKEN = 'wechatsync-local'
const BASE = 'http://127.0.0.1:8787'

async function main() {
  // 0. 先确认插件已连接、目标平台有登录态
  const status = await (await fetch(`${BASE}/status?token=${TOKEN}`)).json()
  console.log('status:', JSON.stringify(status))
  const platforms = await (await fetch(`${BASE}/platforms?token=${TOKEN}`)).json()
  const targets = (platforms.platforms || []).filter((p) => p.id === 'csdn' || p.id === 'weixin')
  console.log(
    'targets:',
    targets.map((p) => `${p.id}:${p.name}:auth=${p.authenticated ?? p.isAuthenticated ?? p.loggedIn}`).join(', '),
    JSON.stringify(targets),
  )

  // 1. 发起同步（草稿模式，不直接发布）
  const res = await fetch(`${BASE}/sync?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platforms: ['csdn', 'weixin'],
      article: {
        title: '【测试】Wechatsync 本地服务发稿验证（可删除）',
        html: '<p>这是一篇由本地 Wechatsync 服务自动创建的<strong>测试草稿</strong>，用于验证「Cookie Provider 插件 + 本地服务」发稿链路。</p><p>验证通过后可到 CSDN / 公众号草稿箱删除。</p>',
      },
      draftOnly: true,
    }),
  })
  const start = await res.json()
  console.log('start:', JSON.stringify(start))
  if (!start.syncId) process.exit(1)

  // 2. 轮询任务状态直到完成（两平台 + 间隔，预留更长时间）
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const task = await (await fetch(`${BASE}/sync/${start.syncId}?token=${TOKEN}`)).json()
    console.log(`[poll ${i}] status=${task.status}`, JSON.stringify(task.results))
    if (task.status !== 'running') {
      console.log('FINAL:', JSON.stringify(task, null, 2))
      const ok = Array.isArray(task.results) && task.results.every((r) => r.success)
      process.exit(ok ? 0 : 1)
    }
  }
  console.error('TIMEOUT waiting for sync')
  process.exit(1)
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
