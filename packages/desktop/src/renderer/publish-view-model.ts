export interface PublishPlatform {
  id: string
  name: string
  loggedIn: boolean
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
