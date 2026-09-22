import { describe, expect, it } from 'vitest'
import {
  applyResearchEvent,
  articleFromAssistant,
  attachJob,
  appendTurn,
  canStartResearch,
  classifyResearchLog,
  createConversation,
  getResearchLogMessage,
  historyForRequest,
  isResearchRunning,
  parseResearchReport,
  type AssistantMessage,
} from './research-view-model'

describe('parseResearchReport', () => {
  it('accepts a report and preserves its title and Markdown', () => {
    const report = { title: ' 研究标题 ', markdown: '# 报告\n\n正文\n' }
    expect(parseResearchReport(report)).toEqual(report)
  })

  it.each([undefined, '', '   '])('rejects a missing or empty title: %s', (title) => {
    expect(parseResearchReport({ title, markdown: '# 报告' })).toBeNull()
  })

  it.each([undefined, '', ' \n\t '])('rejects missing or empty Markdown: %s', (markdown) => {
    expect(parseResearchReport({ title: '标题', markdown })).toBeNull()
  })

  it.each([null, 'report', [], { title: {}, markdown: '# 报告' }, { title: '标题', markdown: 42 }].map((data) => [data]))(
    'rejects invalid payload and field types: %j',
    (data) => { expect(parseResearchReport(data)).toBeNull() },
  )
})

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

function assistantOf(messages: ReturnType<typeof createConversation>['messages']): AssistantMessage {
  const assistant = messages.find((message) => message.role === 'assistant')
  if (!assistant || assistant.role !== 'assistant') throw new Error('missing assistant')
  return assistant
}

describe('research conversation', () => {
  it('keeps thinking, search, and the report in separate fields', () => {
    let conversation = appendTurn(createConversation(), '对比 Agent 框架')
    conversation = attachJob(conversation, 'job_1')
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'thinking', message: '先看定位' })
    conversation = applyResearchEvent(conversation, {
      jobId: 'job_1',
      type: 'search',
      id: 's1',
      query: 'LangGraph vs CrewAI',
      status: 'running',
      message: 'LangGraph vs CrewAI',
    })
    conversation = applyResearchEvent(conversation, {
      jobId: 'job_1',
      type: 'search',
      id: 's1',
      query: 'LangGraph vs CrewAI',
      status: 'done',
      sources: [{ title: 'LangGraph', url: 'https://example.com/lg' }],
      message: 'LangGraph vs CrewAI',
    })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'report', message: '# 不应出现' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'heartbeat', message: '已用时 15 秒', elapsed: 15 })

    const assistant = assistantOf(conversation.messages)
    expect(assistant.thinking).toBe('先看定位')
    expect(assistant.markdown).toBe('')
    expect(assistant.phase).toBe('searching')
    expect(assistant.elapsed).toBe(15)
    expect(assistant.searches).toEqual([{
      id: 's1',
      query: 'LangGraph vs CrewAI',
      status: 'done',
      sources: [{ title: 'LangGraph', url: 'https://example.com/lg' }],
    }])

    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'phase', message: 'writing' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'report', message: '# 报告\n\n' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'report', message: '正文' })
    const written = assistantOf(conversation.messages)
    expect(written.phase).toBe('writing')
    expect(written.markdown).toBe('# 报告\n\n正文')
    expect(written.thinking).toBe('先看定位')
  })

  it('sends prior reports to the next turn and review without the thinking trace', () => {
    let conversation = appendTurn(createConversation(), '对比 Agent 框架')
    conversation = attachJob(conversation, 'job_1')
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'thinking', message: '先看定位' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'phase', message: 'writing' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'report', message: '# 报告\n\n正文' })
    conversation = applyResearchEvent(conversation, { jobId: 'job_1', type: 'done', message: '研究报告已生成' })
    const assistant = assistantOf(conversation.messages)
    expect(articleFromAssistant(assistant)).toEqual({ title: '报告', markdown: '# 报告\n\n正文' })
    expect(historyForRequest(conversation.messages)).toEqual([
      { role: 'user', content: '对比 Agent 框架' },
      { role: 'assistant', content: '# 报告\n\n正文' },
    ])
    expect(isResearchRunning(conversation)).toBe(false)
  })

  it('blocks another send while a turn is running', () => {
    let conversation = appendTurn(createConversation(), '对比 Agent 框架')
    conversation = attachJob(conversation, 'job_1')
    expect(isResearchRunning(conversation)).toBe(true)
    expect(canStartResearch('继续', isResearchRunning(conversation))).toBe(false)
  })
})
