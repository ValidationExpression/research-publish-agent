import { describe, expect, it } from 'vitest'
import { canStartResearch, classifyResearchLog } from './research-view-model'

describe('research view model', () => {
  it('starts only with non-empty text while idle', () => {
    expect(canStartResearch('  ', false)).toBe(false)
    expect(canStartResearch('AI Agent 框架对比', true)).toBe(false)
    expect(canStartResearch('AI Agent 框架对比', false)).toBe(true)
  })

  it('maps transport logs to semantic tones', () => {
    expect(classifyResearchLog('[error] 网络中断')).toBe('error')
    expect(classifyResearchLog('[done] 报告已生成')).toBe('done')
    expect(classifyResearchLog('[progress] 正在检索')).toBe('progress')
    expect(classifyResearchLog('任务已创建')).toBe('default')
  })
})
