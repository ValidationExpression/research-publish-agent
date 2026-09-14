import { ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import type { AppConfig } from './config'

let proc: ChildProcess | null = null

export function getResearchAgentDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'research-agent')
  }
  // dev: packages/desktop -> packages/research-agent
  return path.resolve(app.getAppPath(), '..', 'research-agent')
}

export function startResearchSidecar(config: AppConfig): ChildProcess {
  if (proc) return proc

  const agentDir = getResearchAgentDir()
  const env = {
    ...process.env,
    RESEARCH_HTTP_PORT: String(config.researchHttpPort),
    RESEARCH_TOKEN: config.researchToken,
    RESEARCH_DATA_DIR: path.join(app.getPath('userData'), 'research-jobs'),
  }

  const isWin = process.platform === 'win32'
  proc = spawn(isWin ? 'uv' : 'uv', ['run', 'python', '-m', 'research_agent.server'], {
    cwd: agentDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  })

  proc.stdout?.on('data', (d) => console.log('[research]', d.toString()))
  proc.stderr?.on('data', (d) => console.error('[research]', d.toString()))
  proc.on('exit', (code) => {
    console.log('[research] exited', code)
    proc = null
  })

  return proc
}

export function stopResearchSidecar(): void {
  if (proc) {
    proc.kill()
    proc = null
  }
}
