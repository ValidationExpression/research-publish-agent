/**
 * Discovery domain: platform trend/hot-topic read model.
 * Separate from publish adapters (write model).
 */

export interface TrendItem {
  platform: string
  title: string
  url?: string
  heat?: number
  capturedAt: string
}

export interface TrendListOptions {
  limit?: number
}

export interface TrendProvider {
  readonly platformId: string
  listTrends(opts?: TrendListOptions): Promise<TrendItem[]>
}
