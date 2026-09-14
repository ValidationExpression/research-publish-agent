/**
 * Cookie Provider 背景脚本（Service Worker）
 *
 * 职责（仅此而已）：
 *   1. 通过 WebSocket 连接本地 Wechatsync 服务（ws://localhost:9527）；
 *   2. 在 Token 校验通过后，按本地服务的请求用 chrome.cookies 读取
 *      用户已登录平台的 Cookie 并回传；
 *   3. 不执行任何发稿逻辑、不读取/上传文章内容。
 *
 * 安全：仅使用内存中的 Cookie 字符串，不落盘；连接需 Token 鉴权；
 * 仅监听本地回环地址。
 *
 * 重连策略：MV3 Service Worker 会被 idle 挂起，普通 setTimeout 不再执行。
 * 因此用 chrome.alarms 触发重连，闹钟可以唤醒 Service Worker。
 */

const WS_OPEN = 1

// 已知平台根域（用于 listLoggedIn 概览）。getCookies 也接受本地服务
// 传入的任意域名，这里只是提供一个"已登录平台"的可读清单。
const KNOWN_DOMAINS: string[] = [
  'zhihu.com', 'juejin.cn', 'csdn.net', 'weibo.com', 'xiaohongshu.com',
  'toutiao.com', 'jianshu.com', 'bilibili.com', 'baijiahao.com', 'yuque.com',
  'douban.com', 'sohu.com', 'xueqiu.com', 'woshipm.com', 'cnblogs.com',
  'oschina.net', 'segmentfault.com', 'imooc.com', '51cto.com', 'eastmoney.com',
  'smzdm.com', 'netease.com', 'typecho.org', 'wordpress.com', 'weixin.qq.com',
  'mp.weixin.qq.com', 'twitter.com', 'x.com', 'douyin.com',
]

interface StoredConfig {
  serverUrl: string
  token: string
}
interface ReqMsg {
  id: string
  method: string
  token?: string
  params?: Record<string, unknown>
}
interface ResMsg {
  id: string
  result?: unknown
  error?: { code: number; message: string }
}

let ws: WebSocket | null = null
let cfg: StoredConfig = { serverUrl: 'ws://localhost:9527', token: '' }

function loadConfig(): Promise<StoredConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cpServerUrl', 'cpToken'], (s) => {
      cfg = {
        serverUrl: s.cpServerUrl || 'ws://localhost:9527',
        token: s.cpToken || '',
      }
      resolve(cfg)
    })
  })
}

async function setStatus(status: string): Promise<void> {
  await chrome.storage.local.set({ cpStatus: status })
}

function connect(): void {
  if (ws && ws.readyState === WS_OPEN) return
  void setStatus('connecting')
  try {
    ws = new WebSocket(cfg.serverUrl)
  } catch {
    scheduleReconnect()
    return
  }
  ws.onopen = () => {
    void setStatus('connected')
    // 连接成功时清除待执行的重连闹钟，并开始保活
    chrome.alarms.clear('cp-reconnect').catch(() => {})
    startKeepalive()
  }
  ws.onmessage = (e) => void handleMessage(e.data as string)
  ws.onclose = () => {
    ws = null
    void setStatus('disconnected')
    stopKeepalive()
    scheduleReconnect()
  }
  ws.onerror = () => {
    // 错误后通常会触发 close，由 close 负责重连
  }
}

function scheduleReconnect(): void {
  // 使用 chrome.alarms 而不是 setTimeout，因为 MV3 Service Worker idle 后
  // setTimeout 会停止；alarms 能唤醒 worker 并继续重连。
  chrome.alarms.create('cp-reconnect', { delayInMinutes: 5 / 60 })
}

// 保活：MV3 Service Worker 在 WebSocket 空闲时会被 idle 挂起并杀掉连接。
// 用周期性 alarm 唤醒 worker 并发送 ping，使连接持续活跃、不被回收。
function startKeepalive(): void {
  chrome.alarms.create('cp-keepalive', { periodInMinutes: 0.2 })
}

function stopKeepalive(): void {
  chrome.alarms.clear('cp-keepalive').catch(() => {})
}

function send(m: ResMsg): void {
  if (ws && ws.readyState === WS_OPEN) ws.send(JSON.stringify(m))
}

async function handleMessage(data: string): Promise<void> {
  let msg: ReqMsg
  try {
    msg = JSON.parse(data)
  } catch {
    return
  }

  // Token 校验：未配置或服务端携带的 Token 不匹配则拒绝
  if (!cfg.token || msg.token !== cfg.token) {
    send({ id: msg.id, error: { code: 403, message: 'invalid or missing token' } })
    return
  }

  try {
    const result = await handleMethod(msg.method, msg.params || {})
    send({ id: msg.id, result })
  } catch (err) {
    send({ id: msg.id, error: { code: -1, message: (err as Error).message } })
  }
}

async function handleMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    // 按域名返回 Cookie 字符串（domain -> "name=value; ..."）
    case 'getCookies': {
      const domains = (params.domains as string[] | undefined) || []
      const out: Record<string, string> = {}
      for (const domain of domains) {
        const cookies = await chrome.cookies.getAll({ domain })
        if (cookies.length) {
          out[domain] = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
        }
      }
      return out
    }

    // 返回已登录（有 Cookie）的已知平台域名清单
    case 'listLoggedIn': {
      const logged: string[] = []
      for (const domain of KNOWN_DOMAINS) {
        const cookies = await chrome.cookies.getAll({ domain })
        if (cookies.length) logged.push(domain)
      }
      return logged
    }

    // 语义同 getCookies，提示"重新读取"（本实现无缓存，直接读取即可）
    case 'refreshCookies': {
      return handleMethod('getCookies', params)
    }

    case 'ping':
      return { ok: true }

    default:
      throw new Error(`unknown method: ${method}`)
  }
}

// 来自 popup 的重连/保存指令：直接带新配置，避免 storage.onChanged 双重触发
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CP_RECONNECT' && message.payload) {
    const { serverUrl, token } = message.payload as StoredConfig
    cfg = { serverUrl: serverUrl || cfg.serverUrl, token: token ?? cfg.token }
    void chrome.storage.local.set({
      cpServerUrl: cfg.serverUrl,
      cpToken: cfg.token,
    })
    if (ws) {
      ws.close()
    } else {
      connect()
    }
    sendResponse({ ok: true })
  }
  return true
})

// 用 chrome.alarms 触发重连/保活，闹钟可唤醒被挂起的 Service Worker
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cp-reconnect') {
    connect()
  } else if (alarm.name === 'cp-keepalive') {
    // 唤醒 worker 并维持 WebSocket 活跃，避免被 idle 回收
    if (ws && ws.readyState === WS_OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'ping' }))
      } catch {
        // 发送失败交给 onclose 处理重连
      }
    }
  }
})

// 启动时从 storage 读取配置并连接
void loadConfig().then(connect)
