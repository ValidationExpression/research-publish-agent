import { describe, expect, it } from 'vitest'
import {
  parseSyncStart,
  parseSyncStatus,
  reconcileSelection,
  seedPreferredSelection,
  sortPlatforms,
} from './publish-view-model'

const platforms = [
  { id: 'zhihu', name: '知乎', loggedIn: false },
  { id: 'csdn', name: 'CSDN', loggedIn: true },
  { id: 'weixin', name: '微信公众号', loggedIn: true },
]

describe('publish view model', () => {
  it('puts logged-in platforms first', () => {
    expect(sortPlatforms(platforms).map(({ id }) => id)).toEqual(['csdn', 'weixin', 'zhihu'])
  })

  it('orders Latin platform names before Chinese platform names within each login group', () => {
    expect(sortPlatforms([...platforms].reverse()).map(({ id }) => id)).toEqual(['csdn', 'weixin', 'zhihu'])
  })

  it('orders Latin-leading names within a login group', () => {
    expect(sortPlatforms([
      { id: 'csdn', name: 'CSDN', loggedIn: true },
      { id: 'bilibili', name: 'Bilibili', loggedIn: true },
    ]).map(({ id }) => id)).toEqual(['bilibili', 'csdn'])
  })

  it('removes unavailable platforms from selection', () => {
    expect([...reconcileSelection(platforms, new Set(['csdn', 'zhihu']))]).toEqual(['csdn'])
  })

  it('seeds preferred selections only from known logged-in platforms', () => {
    expect([...seedPreferredSelection(platforms, ['csdn', 'weixin', 'zhihu', 'unknown'])])
      .toEqual(['csdn', 'weixin'])
  })

  it('accepts only a non-empty sync ID', () => {
    expect(parseSyncStart({ syncId: 'sync-123' })).toBe('sync-123')
    expect(parseSyncStart({ syncId: '   ' })).toBeNull()
  })

  it('rejects malformed polling payloads', () => {
    expect(parseSyncStatus({
      status: 'running',
      results: [{ platform: 'csdn', success: true, postUrl: 'https://example.com' }],
    })).toEqual({
      status: 'running',
      results: [{ platform: 'csdn', success: true, postUrl: 'https://example.com' }],
    })
    expect(parseSyncStatus({ status: 'running', results: [{ platform: 'csdn', success: 'yes' }] })).toBeNull()
  })

  it('accepts a failed terminal status', () => {
    expect(parseSyncStatus({
      status: 'failed',
      results: [{ platform: 'csdn', success: false, error: 'Cookie 已过期' }],
    })).toEqual({
      status: 'failed',
      results: [{ platform: 'csdn', success: false, error: 'Cookie 已过期' }],
    })
  })

  it('rejects empty and unknown polling statuses', () => {
    expect(parseSyncStatus({ status: '', results: [] })).toBeNull()
    expect(parseSyncStatus({ status: 'cancelled', results: [] })).toBeNull()
  })
})
