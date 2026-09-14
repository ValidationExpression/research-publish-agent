/**
 * Cookie Provider 弹窗逻辑
 * 仅用于：配置本地服务地址与 Token，并显示连接状态。
 * 不读取、不上传任何文章或内容，只显示连接状态。
 */

function el<T extends HTMLElement = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as T
}

function statusText(status?: string): string {
  const map: Record<string, string> = {
    connected: '● 已连接',
    connecting: '○ 连接中…',
    disconnected: '○ 未连接',
  }
  return '状态：' + (map[status || ''] || '未知')
}

async function load(): Promise<void> {
  const s = await chrome.storage.local.get(['cpServerUrl', 'cpToken', 'cpStatus'])
  if (s.cpServerUrl) el('serverUrl').value = s.cpServerUrl
  if (s.cpToken) el('token').value = s.cpToken
  el('status').textContent = statusText(s.cpStatus)
}

async function save(): Promise<void> {
  const serverUrl = el('serverUrl').value.trim()
  const token = el('token').value.trim()
  // 直接把新配置发给 background，避免先写 storage 再发消息导致双重重连
  chrome.runtime.sendMessage({ type: 'CP_RECONNECT', payload: { serverUrl, token } })
  // 同时把配置落盘，仅用于下次启动时恢复显示
  await chrome.storage.local.set({ cpServerUrl: serverUrl, cpToken: token })
  const saved = el('saved')
  saved.textContent = '已保存，正在重连…'
  setTimeout(() => (saved.textContent = ''), 2000)
}

document.addEventListener('DOMContentLoaded', () => {
  load()
  el('save').addEventListener('click', () => void save())
  // 每 2 秒刷新一次连接状态
  setInterval(() => {
    chrome.storage.local.get(['cpStatus'], (s) => {
      el('status').textContent = statusText(s.cpStatus)
    })
  }, 2000)
})
