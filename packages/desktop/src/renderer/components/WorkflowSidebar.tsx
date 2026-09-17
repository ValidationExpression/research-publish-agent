import type { AppStep, WorkflowArticle } from '../workflow'
import { getWorkflowSteps } from '../workflow'
import { IconCpu, IconLock, IconPlug, IconPublish, IconResearch, IconReview } from './Icons'

export interface WorkflowSidebarProps {
  currentStep: AppStep
  article: WorkflowArticle
  publishConnected: boolean
  researchOk: boolean
  onStepChange: (step: AppStep) => void
}

const STEP_ICONS = {
  research: IconResearch,
  review: IconReview,
  publish: IconPublish,
} satisfies Record<AppStep, typeof IconResearch>

const LOCKED_DESCRIPTIONS: Partial<Record<AppStep, string>> = {
  review: '完成研究报告后可用。',
  publish: '填写标题与正文后可用。',
}

export function WorkflowSidebar({
  currentStep,
  article,
  publishConnected,
  researchOk,
  onStepChange,
}: WorkflowSidebarProps) {
  const steps = getWorkflowSteps(currentStep, article)

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span className="brand-logo" aria-hidden="true">紙</span>
          <div className="brand-copy">
            <span className="brand-name">Research Publish</span>
            <span className="brand-sub">研究 · 审阅 · 发稿</span>
          </div>
        </div>
        <span className="tag brush">工作台</span>
      </div>

      <nav className="step-nav" aria-label="工作流步骤">
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.id]
          const isLocked = step.state === 'locked'
          const descriptionId = `workflow-${step.id}-description`

          return (
            <button
              key={step.id}
              type="button"
              className={`step-nav-item ${step.state === 'active' ? 'active' : ''} ${step.state === 'complete' ? 'done' : ''}`}
              onClick={() => onStepChange(step.id)}
              disabled={isLocked}
              aria-current={step.state === 'active' ? 'step' : undefined}
              aria-describedby={isLocked ? descriptionId : undefined}
            >
              <span className="step-index">{step.index}</span>
              <span className="step-copy">
                <span className="step-title">
                  <Icon size={14} />
                  {step.title}
                  {isLocked && <IconLock size={13} />}
                </span>
                <span className="step-desc" id={isLocked ? descriptionId : undefined}>
                  {isLocked ? LOCKED_DESCRIPTIONS[step.id] : step.description}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-status" aria-label="服务状态">
        <div className="status-row">
          <span className="status-label"><IconPlug /> Cookie 插件</span>
          <span className={`status-chip ${publishConnected ? 'ok' : 'bad'}`}>
            {publishConnected ? '已连接' : '未连接'}
          </span>
        </div>
        <div className="status-row">
          <span className="status-label"><IconCpu /> 研究服务</span>
          <span className={`status-chip ${researchOk ? 'ok' : 'bad'}`}>
            {researchOk ? '运行中' : '未就绪'}
          </span>
        </div>
      </div>
    </aside>
  )
}
