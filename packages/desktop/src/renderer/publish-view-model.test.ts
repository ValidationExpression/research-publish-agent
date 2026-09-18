import { describe, expect, it } from 'vitest'
import {
  parsePlatforms,
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

describe('parsePlatforms', () => {
  it('accepts valid platform entries including logged-out platforms', () => {
    expect(parsePlatforms({ platforms })).toEqual(platforms)
    expect(parsePlatforms({ platforms: [] })).toEqual([])
  })

  it.each([undefined, '', '  ', 42, {}])('rejects malformed IDs: %j', (id) => {
    expect(parsePlatforms({ platforms: [{ id, name: '知乎', loggedIn: true }] })).toBeNull()
  })

  it.each([undefined, '', '  ', 42, {}])('rejects malformed names: %j', (name) => {
    expect(parsePlatforms({ platforms: [{ id: 'zhihu', name, loggedIn: true }] })).toBeNull()
  })

  it.each([undefined, 'false', 0, null])('rejects nonboolean login states: %j', (loggedIn) => {
    expect(parsePlatforms({ platforms: [{ id: 'zhihu', name: '知乎', loggedIn }] })).toBeNull()
  })

  it.each([null, [], {}, { platforms: {} }, { platforms: [null] }, { platforms: [...platforms, {}] }].map((data) => [data]))(
    'rejects the whole response when the list or any entry is invalid: %j',
    (data) => { expect(parsePlatforms(data)).toBeNull() },
  )
})

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
