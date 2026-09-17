/**
 * Cookie Provider 弹窗逻辑
 * 仅用于：配置本地服务地址与 Token，并显示连接状态。
 * 不读取、不上传任何文章或内容，只显示连接状态。
 */

function el<T extends HTMLElement = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as T
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  connected: { label: '已连接', cls: 'is-connected' },
  connecting: { label: '连接中', cls: 'is-connecting' },
  disconnected: { label: '未连接', cls: 'is-disconnected' },
}

function applyStatus(status?: string): void {
  const meta = STATUS_META[status || ''] ?? { label: '未知', cls: 'is-unknown' }
  const root = el<HTMLElement>('status')
  root.className = `status ${meta.cls}`
  el<HTMLElement>('statusLabel').textContent = meta.label
}

async function load(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return
  const s = await chrome.storage.local.get(['cpServerUrl', 'cpToken', 'cpStatus'])
  if (s.cpServerUrl) el('serverUrl').value = s.cpServerUrl
  if (s.cpToken) el('token').value = s.cpToken
  applyStatus(s.cpStatus)
}

async function save(): Promise<void> {
  const serverUrl = el('serverUrl').value.trim()
  const token = el('token').value.trim()
  const btn = el<HTMLButtonElement>('save')
  const saveLabel = el<HTMLElement>('saveLabel')
  const saved = el<HTMLElement>('saved')

  btn.disabled = true
  saveLabel.textContent = '正在保存…'

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage) {
    // 直接把新配置发给 background，避免先写 storage 再发消息导致双重重连
    chrome.runtime.sendMessage({ type: 'CP_RECONNECT', payload: { serverUrl, token } })
    // 同时把配置落盘，仅用于下次启动时恢复显示
    await chrome.storage.local.set({ cpServerUrl: serverUrl, cpToken: token })
  }

  saveLabel.textContent = '保存并重连'
  saved.textContent = '已保存，正在重连'
  applyStatus('connecting')
  window.setTimeout(() => {
    saved.textContent = ''
    btn.disabled = false
  }, 1800)
}

function toggleTokenVisibility(): void {
  const input = el('token')
  const btn = el<HTMLButtonElement>('toggleToken')
  const hidden = input.type === 'password'
  input.type = hidden ? 'text' : 'password'
  btn.setAttribute('aria-pressed', hidden ? 'true' : 'false')
  btn.setAttribute('aria-label', hidden ? '隐藏令牌' : '显示令牌')
}

document.addEventListener('DOMContentLoaded', () => {
  void load()
  el<HTMLFormElement>('form').addEventListener('submit', (event) => {
    event.preventDefault()
    void save()
  })
  el<HTMLButtonElement>('toggleToken').addEventListener('click', toggleTokenVisibility)
  // 每 2 秒刷新一次连接状态
  setInterval(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return
    chrome.storage.local.get(['cpStatus'], (s) => {
      applyStatus(s.cpStatus)
    })
  }, 2000)
})
