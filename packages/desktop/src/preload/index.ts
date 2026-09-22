import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopApi', {
  platform: process.platform,
  titleBarHeight: process.platform === 'win32' || process.platform === 'darwin' ? 40 : 0,
  getConfig: () => ipcRenderer.invoke('get-config'),
  getServiceStatus: () => ipcRenderer.invoke('get-service-status'),
  publishFetch: (path: string, init?: { method?: string; body?: string }) =>
    ipcRenderer.invoke('publish-fetch', path, init),
  researchFetch: (path: string, init?: { method?: string; body?: string }) =>
    ipcRenderer.invoke('research-fetch', path, init),
  onResearchSseEvent: (cb: (data: ResearchSsePayload) => void) => {
    const handler = (_: unknown, data: ResearchSsePayload) => cb(data)
    ipcRenderer.on('research-sse-event', handler)
    return () => ipcRenderer.removeListener('research-sse-event', handler)
  },
  onResearchSseError: (cb: (data: { jobId: string; error: string }) => void) => {
    const handler = (_: unknown, data: { jobId: string; error: string }) => cb(data)
    ipcRenderer.on('research-sse-error', handler)
    return () => ipcRenderer.removeListener('research-sse-error', handler)
  },
  onResearchSseEnd: (cb: (data: { jobId: string }) => void) => {
    const handler = (_: unknown, data: { jobId: string }) => cb(data)
    ipcRenderer.on('research-sse-end', handler)
    return () => ipcRenderer.removeListener('research-sse-end', handler)
  },
  startResearchSse: (jobId: string) => ipcRenderer.invoke('research-sse', jobId),
})

type ResearchSsePayload = {
  jobId: string
  type: string
  message?: string
  id?: string
  query?: string
  status?: 'running' | 'done' | 'error'
  sources?: { title: string; url: string }[]
  elapsed?: number
}

export type DesktopApi = {
  platform: string
  titleBarHeight: number
  getConfig: () => Promise<unknown>
  getServiceStatus: () => Promise<unknown>
  publishFetch: (path: string, init?: { method?: string; body?: string }) => Promise<{ ok: boolean; status: number; data: unknown }>
  researchFetch: (path: string, init?: { method?: string; body?: string }) => Promise<{ ok: boolean; status: number; data: unknown }>
  onResearchSseEvent: (cb: (data: {
    jobId: string
    type: string
    message?: string
    id?: string
    query?: string
    status?: 'running' | 'done' | 'error'
    sources?: { title: string; url: string }[]
    elapsed?: number
  }) => void) => () => void
  onResearchSseError: (cb: (data: { jobId: string; error: string }) => void) => () => void
  onResearchSseEnd: (cb: (data: { jobId: string }) => void) => () => void
  startResearchSse: (jobId: string) => Promise<void>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
