export interface PublishPlatform {
  id: string
  name: string
  loggedIn: boolean
}

export interface PublishSyncResult {
  platform: string
  success: boolean
  postUrl?: string
  error?: string
}

export interface PublishSyncStatus {
  status: string
  results: PublishSyncResult[]
}

export function sortPlatforms(platforms: PublishPlatform[]): PublishPlatform[] {
  return [...platforms].sort((a, b) => {
    if (a.loggedIn !== b.loggedIn) return a.loggedIn ? -1 : 1
    const aStartsLatin = /^[A-Za-z]/.test(a.name)
    const bStartsLatin = /^[A-Za-z]/.test(b.name)
    if (aStartsLatin !== bStartsLatin) return aStartsLatin ? -1 : 1
    return a.name.localeCompare(b.name, aStartsLatin ? 'en' : 'zh-CN')
  })
}

export function reconcileSelection(platforms: PublishPlatform[], selected: Set<string>): Set<string> {
  const available = new Set(platforms.filter(({ loggedIn }) => loggedIn).map(({ id }) => id))
  return new Set([...selected].filter((id) => available.has(id)))
}

export function seedPreferredSelection(platforms: PublishPlatform[], preferred: Iterable<string>): Set<string> {
  return reconcileSelection(platforms, new Set(preferred))
}

export function parseSyncStart(data: unknown): string | null {
  if (!isRecord(data) || typeof data.syncId !== 'string' || data.syncId.trim().length === 0) return null
  return data.syncId
}

export function parseSyncStatus(data: unknown): PublishSyncStatus | null {
  if (!isRecord(data) || typeof data.status !== 'string' || !Array.isArray(data.results)) return null

  const results: PublishSyncResult[] = []
  for (const result of data.results) {
    if (!isSyncResult(result)) return null
    results.push(result)
  }

  return { status: data.status, results }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSyncResult(value: unknown): value is PublishSyncResult {
  if (!isRecord(value) || typeof value.platform !== 'string' || value.platform.trim().length === 0) return false
  if (typeof value.success !== 'boolean') return false
  if (value.postUrl !== undefined && typeof value.postUrl !== 'string') return false
  if (value.error !== undefined && typeof value.error !== 'string') return false
  return true
}
