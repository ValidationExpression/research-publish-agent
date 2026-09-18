export type AppStep = 'research' | 'review' | 'publish'
export type WorkflowState = 'active' | 'complete' | 'available' | 'locked'
export type ServiceRequestPhase = 'idle' | 'loading' | 'success' | 'error'
export type ServiceName = 'publish' | 'research'
export type ServiceStatusViewState = 'checking' | 'healthy' | 'unhealthy' | 'stale' | 'error'

export interface WorkflowArticle {
  title: string
  markdown: string
}

export interface WorkflowStepView {
  id: AppStep
  index: string
  title: string
  description: string
  state: WorkflowState
}

export interface ServiceStatusView {
  label: string
  state: ServiceStatusViewState
}

type ServiceStatusResult =
  | { ok: true; publishConnected: boolean; researchOk: boolean }
  | { ok: false; error: string }

export function parseServiceStatus(data: unknown): ServiceStatusResult {
  const invalid: ServiceStatusResult = { ok: false, error: '服务状态响应无效' }
  if (!data || typeof data !== 'object') return invalid
  const { publish, research } = data as Record<string, unknown>
  for (const service of [publish, research]) {
    if (!service || typeof service !== 'object') return invalid
    const { error } = service as Record<string, unknown>
    if (error !== undefined && error !== null) {
      return { ok: false, error: typeof error === 'string' && error.trim() ? error : '服务状态刷新失败' }
    }
  }
  const { connected } = publish as Record<string, unknown>
  const { ok } = research as Record<string, unknown>
  if (typeof connected !== 'boolean' || typeof ok !== 'boolean') return invalid
  return { ok: true, publishConnected: connected, researchOk: ok }
}

const STEP_COPY: Omit<WorkflowStepView, 'state'>[] = [
  { id: 'research', index: '01', title: '研究', description: '联网检索并生成报告' },
  { id: 'review', index: '02', title: '审阅', description: '调整标题与正文' },
  { id: 'publish', index: '03', title: '发布', description: '同步草稿到各平台' },
]

export function getWorkflowSteps(current: AppStep, article: WorkflowArticle): WorkflowStepView[] {
  const currentIndex = STEP_COPY.findIndex(({ id }) => id === current)
  const unlocked = new Set<AppStep>(['research'])
  if (article.markdown.trim()) unlocked.add('review')
  if (article.title.trim() && article.markdown.trim()) unlocked.add('publish')

  return STEP_COPY.map((step, index) => ({
    ...step,
    state: step.id === current
      ? 'active'
      : index < currentIndex
        ? 'complete'
        : unlocked.has(step.id)
          ? 'available'
          : 'locked',
  }))
}

export function getServiceStatusView(
  service: ServiceName,
  phase: ServiceRequestPhase,
  value: boolean,
  hasResolved: boolean,
): ServiceStatusView {
  if (phase === 'idle' || phase === 'loading') {
    return { label: '检查中', state: 'checking' }
  }

  const labels = service === 'publish'
    ? { positive: '已连接', negative: '未连接' }
    : { positive: '运行中', negative: '未就绪' }

  if (phase === 'error') {
    return hasResolved
      ? { label: `刷新失败 · 上次${value ? labels.positive : labels.negative}`, state: 'stale' }
      : { label: '检查失败', state: 'error' }
  }

  return value
    ? { label: labels.positive, state: 'healthy' }
    : { label: labels.negative, state: 'unhealthy' }
}
