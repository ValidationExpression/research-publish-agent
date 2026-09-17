import { describe, expect, it } from 'vitest'
import { reconcileSelection, sortPlatforms } from './publish-view-model'

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

  it('removes unavailable platforms from selection', () => {
    expect([...reconcileSelection(platforms, new Set(['csdn', 'zhihu']))]).toEqual(['csdn'])
  })
})
