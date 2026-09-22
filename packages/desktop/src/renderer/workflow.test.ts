import { describe, expect, it } from 'vitest'
import { getServiceStatusView, getWorkflowSteps, parseServiceStatus } from './workflow'

describe('parseServiceStatus', () => {
  it('accepts explicit healthy and unhealthy service booleans', () => {
    expect(parseServiceStatus({ publish: { connected: true }, research: { ok: false } }))
      .toEqual({ ok: true, publishConnected: true, researchOk: false })
  })

  it.each(['publish', 'research'])('rejects a resolved %s error before accepting booleans', (service) => {
    const status = { publish: { connected: false }, research: { ok: false }, [service]: { error: '服务暂不可用' } }
    expect(parseServiceStatus(status)).toEqual({ ok: false, error: '服务暂不可用' })
  })

  it('rejects error payloads even when they include apparently healthy booleans', () => {
    expect(parseServiceStatus({ publish: { connected: true, error: {} }, research: { ok: true } }))
      .toEqual({ ok: false, error: '服务状态刷新失败' })
  })

  it.each([null, {}, { publish: { connected: 'false' }, research: { ok: true } }])(
    'rejects malformed service responses: %j',
    (status) => { expect(parseServiceStatus(status)).toEqual({ ok: false, error: '服务状态响应无效' }) },
  )
})

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

  it('keeps the archive outside the numbered steps', () => {
    const steps = getWorkflowSteps('archive', { title: '', markdown: '' })
    expect(steps.map(({ id }) => id)).toEqual(['research', 'review', 'publish'])
    expect(steps.map(({ state }) => state)).toEqual(['available', 'locked', 'locked'])
  })

  it('keeps review and publish locks while the archive is open', () => {
    const withReport = getWorkflowSteps('archive', { title: '标题', markdown: '# 报告' })
    expect(withReport.map(({ state }) => state)).toEqual(['available', 'available', 'available'])
    const reviewOnly = getWorkflowSteps('archive', { title: '', markdown: '# 报告' })
    expect(reviewOnly.map(({ state }) => state)).toEqual(['available', 'available', 'locked'])
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
