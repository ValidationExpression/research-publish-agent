import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopApi', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getServiceStatus: () => ipcRenderer.invoke('get-service-status'),
  publishFetch: (path: string, init?: { method?: string; body?: string }) =>
    ipcRenderer.invoke('publish-fetch', path, init),
  researchFetch: (path: string, init?: { method?: string; body?: string }) =>
    ipcRenderer.invoke('research-fetch', path, init),
  onResearchSseEvent: (cb: (data: { jobId: string; type: string; message: string }) => void) => {
    const handler = (_: unknown, data: { jobId: string; type: string; message: string }) => cb(data)
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

export type DesktopApi = {
  getConfig: () => Promise<unknown>
  getServiceStatus: () => Promise<unknown>
  publishFetch: (path: string, init?: { method?: string; body?: string }) => Promise<{ ok: boolean; status: number; data: unknown }>
  researchFetch: (path: string, init?: { method?: string; body?: string }) => Promise<{ ok: boolean; status: number; data: unknown }>
  onResearchSseEvent: (cb: (data: { jobId: string; type: string; message: string }) => void) => () => void
  onResearchSseError: (cb: (data: { jobId: string; error: string }) => void) => () => void
  onResearchSseEnd: (cb: (data: { jobId: string }) => void) => () => void
  startResearchSse: (jobId: string) => Promise<void>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
