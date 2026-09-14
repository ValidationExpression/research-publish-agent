import type { TrendItem, TrendListOptions, TrendProvider } from './types'

class TrendRegistry {
  private providers = new Map<string, TrendProvider>()

  register(provider: TrendProvider): void {
    this.providers.set(provider.platformId, provider)
  }

  getProvider(platformId: string): TrendProvider | undefined {
    return this.providers.get(platformId)
  }

  getAllPlatformIds(): string[] {
    return [...this.providers.keys()]
  }

  async listTrends(platforms: string[], opts?: TrendListOptions): Promise<TrendItem[]> {
    const items: TrendItem[] = []
    for (const pid of platforms) {
      const provider = this.providers.get(pid)
      if (!provider) continue
      const batch = await provider.listTrends(opts)
      items.push(...batch)
    }
    return items
  }
}

export const trendRegistry = new TrendRegistry()
