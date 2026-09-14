import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface AppConfig {
  publishToken: string
  researchToken: string
  publishHttpPort: number
  publishWsPort: number
  researchHttpPort: number
}

const DEFAULTS: AppConfig = {
  publishToken: process.env.WECHATSYNC_TOKEN || 'wechatsync-local',
  researchToken: process.env.RESEARCH_TOKEN || 'research-local',
  publishHttpPort: Number(process.env.WECHATSYNC_HTTP_PORT || 8787),
  publishWsPort: Number(process.env.WECHATSYNC_WS_PORT || 9527),
  researchHttpPort: Number(process.env.RESEARCH_HTTP_PORT || 8765),
}

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true })
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}
