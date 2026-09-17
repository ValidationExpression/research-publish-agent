export type AppStep = 'research' | 'review' | 'publish'
export type WorkflowState = 'active' | 'complete' | 'available' | 'locked'

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
