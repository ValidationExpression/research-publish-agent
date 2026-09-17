import { describe, expect, it } from 'vitest'
import { getWorkflowSteps } from './workflow'

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
