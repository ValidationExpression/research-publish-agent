import { describe, expect, it } from 'vitest'
import { getServiceStatusView, getWorkflowSteps } from './workflow'

describe('getWorkflowSteps', () => {
  it('locks later steps before a report exists', () => {
    const steps = getWorkflowSteps('research', { title: '', markdown: '' })
    expect(steps.map(({ state }) => state)).toEqual(['active', 'locked', 'locked'])
  })

  it('unlocks review after research completes', () => {
    const steps = getWorkflowSteps('review', { title: '标题', markdown: '# 报告' })
    expect(steps.map(({ state }) => state)).toEqual(['complete', 'active', 'available'])
  })

  it('marks previous steps complete on publish', () => {
    const steps = getWorkflowSteps('publish', { title: '标题', markdown: '# 报告' })
    expect(steps.map(({ state }) => state)).toEqual(['complete', 'complete', 'active'])
  })
})

describe('getServiceStatusView', () => {
  it('shows a checking state before the first service response', () => {
    expect(getServiceStatusView('publish', 'loading', false, false)).toEqual({
      label: '检查中',
      state: 'checking',
    })
  })

  it('marks a last-known status stale after a refresh failure', () => {
    expect(getServiceStatusView('publish', 'error', true, true)).toEqual({
      label: '刷新失败 · 上次已连接',
      state: 'stale',
    })
  })
})
