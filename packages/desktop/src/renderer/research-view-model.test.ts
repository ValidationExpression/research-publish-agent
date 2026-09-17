import { describe, expect, it } from 'vitest'
import { canStartResearch, classifyResearchLog, getResearchLogMessage } from './research-view-model'

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

  it('keeps the user-facing log message free of transport markers', () => {
    expect(getResearchLogMessage('[error] 网络中断')).toBe('网络中断')
    expect(getResearchLogMessage('[done] 报告已生成')).toBe('报告已生成')
    expect(getResearchLogMessage('[progress] 正在检索')).toBe('正在检索')
    expect(getResearchLogMessage('任务已创建')).toBe('任务已创建')
  })
})
