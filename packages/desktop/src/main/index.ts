import { app, BrowserWindow, ipcMain, Menu, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import type { PublishRuntime } from '@wechatsync/local-server/publish-runtime'
import { loadRootEnv } from './load-root-env'
import { loadConfig, type AppConfig } from './config'
import { startResearchSidecar, stopResearchSidecar } from './research-sidecar'

let mainWindow: BrowserWindow | null = null
let publishRuntime: PublishRuntime | null = null
let config: AppConfig

function getRendererUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return 'http://127.0.0.1:5173'
  }
  return `file://${path.join(__dirname, '../renderer/index.html')}`
}

const APP_CANVAS = '#FBFAF7'
const TITLEBAR_SYMBOL = '#6F7580'
const TITLEBAR_HEIGHT = 40

function createWindow(): void {
  Menu.setApplicationMenu(null)
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: APP_CANVAS,
    autoHideMenuBar: true,
    title: 'Research Publish',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {}),
    ...(isWin
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: APP_CANVAS,
            symbolColor: TITLEBAR_SYMBOL,
            height: TITLEBAR_HEIGHT,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadURL(getRendererUrl())
}

async function startServices(): Promise<void> {
  config = loadConfig()
  const { startPublishRuntime } = await import('@wechatsync/local-server/publish-runtime')
  publishRuntime = startPublishRuntime({
    token: config.publishToken,
    httpPort: config.publishHttpPort,
    wsPort: config.publishWsPort,
  })
  startResearchSidecar(config)
}

app.whenReady().then(async () => {
  loadRootEnv()
  await startServices()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  stopResearchSidecar()
  if (publishRuntime) {
    await publishRuntime.stop()
    publishRuntime = null
  }
})

// --- IPC: config ---
ipcMain.handle('get-config', () => config)

ipcMain.handle('get-service-status', async () => {
  const base = `http://127.0.0.1:${config.publishHttpPort}`
  try {
    const res = await fetch(`${base}/status?token=${config.publishToken}`)
    const publish = await res.json()
    const health = await fetch(`http://127.0.0.1:${config.researchHttpPort}/health`).then((r) => r.json()).catch(() => ({ ok: false }))
    return { publish, research: health }
  } catch (e) {
    return { publish: { connected: false, error: String(e) }, research: { ok: false } }
  }
})

// --- IPC: publish proxy ---
ipcMain.handle('publish-fetch', async (_evt, pathAndQuery: string, init?: { method?: string; body?: string }) => {
  const url = `http://127.0.0.1:${config.publishHttpPort}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}token=${config.publishToken}`
  const res = await fetch(url, {
    method: init?.method || 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body,
  })
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, data: text }
  }
})

// --- IPC: research proxy ---
ipcMain.handle('research-fetch', async (_evt, pathAndQuery: string, init?: { method?: string; body?: string }) => {
  const sep = pathAndQuery.includes('?') ? '&' : '?'
  const url = `http://127.0.0.1:${config.researchHttpPort}${pathAndQuery}${sep}token=${config.researchToken}`
  const res = await fetch(url, {
    method: init?.method || 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body,
  })
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, data: text }
  }
})

function flushSseBuffer(
  event: IpcMainInvokeEvent,
  jobId: string,
  buffer: string,
): void {
  for (const part of buffer.split('\n\n')) {
    const line = part.split('\n').find((l) => l.startsWith('data: '))
    if (!line) continue
    const payload = JSON.parse(line.slice(6))
    event.sender.send('research-sse-event', { jobId, ...payload })
  }
}

ipcMain.handle('research-sse', async (event, jobId: string) => {
  const url = `http://127.0.0.1:${config.researchHttpPort}/research/${jobId}/events?token=${config.researchToken}`
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    event.sender.send('research-sse-error', { jobId, error: `SSE failed: ${res.status}` })
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '))
          if (line) {
            const payload = JSON.parse(line.slice(6))
            event.sender.send('research-sse-event', { jobId, ...payload })
          }
        }
      }
      if (done) {
        if (buffer.trim()) flushSseBuffer(event, jobId, buffer)
        event.sender.send('research-sse-end', { jobId })
        break
      }
    }
  } catch (e) {
    event.sender.send('research-sse-error', { jobId, error: String(e) })
  }
})
