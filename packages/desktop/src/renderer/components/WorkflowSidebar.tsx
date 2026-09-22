import type { AppStep, ServiceRequestPhase, WorkflowArticle, WorkspaceScreen } from '../workflow'
import { getServiceStatusView, getWorkflowSteps } from '../workflow'
import { IconArchive, IconCheck, IconCpu, IconLock, IconPlug, IconPublish, IconResearch, IconReview } from './Icons'

export interface WorkflowSidebarProps {
  currentStep: WorkspaceScreen
  article: WorkflowArticle
  publishConnected: boolean
  researchOk: boolean
  serviceStatusPhase: ServiceRequestPhase
  hasResolvedServiceStatus: boolean
  serviceStatusError: string | null
  onStepChange: (step: AppStep) => void
  onOpenArchive: () => void
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
  serviceStatusPhase,
  hasResolvedServiceStatus,
  serviceStatusError,
  onStepChange,
  onOpenArchive,
}: WorkflowSidebarProps) {
  const steps = getWorkflowSteps(currentStep, article)
  const publishStatus = getServiceStatusView(
    'publish',
    serviceStatusPhase,
    publishConnected,
    hasResolvedServiceStatus,
  )
  const researchStatus = getServiceStatusView(
    'research',
    serviceStatusPhase,
    researchOk,
    hasResolvedServiceStatus,
  )

  return (
    <aside className="workflow-sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span className="brand-logo" aria-hidden="true">R</span>
          <div className="brand-copy">
            <span className="brand-name">Research Publish</span>
            <span className="brand-sub">研究 · 审阅 · 发布</span>
          </div>
        </div>
        <span className="workspace-label">工作台</span>
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
              <span className="step-index">
                {step.state === 'complete' ? <><IconCheck /><span className="sr-only">已完成</span></> : step.index}
              </span>
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

      <button
        type="button"
        className={`archive-nav-item${currentStep === 'archive' ? ' active' : ''}`}
        aria-current={currentStep === 'archive' ? 'page' : undefined}
        onClick={onOpenArchive}
      >
        <IconArchive size={16} />
        研究仓库
      </button>

      <div className="sidebar-status" aria-label="服务状态">
        <div className="status-row">
          <span className="status-label"><IconPlug /> Cookie 插件</span>
          <span className={`status-chip ${publishStatus.state === 'healthy' ? 'ok' : 'bad'}`}>
            {publishStatus.label}
          </span>
        </div>
        <div className="status-row">
          <span className="status-label"><IconCpu /> 研究服务</span>
          <span className={`status-chip ${researchStatus.state === 'healthy' ? 'ok' : 'bad'}`}>
            {researchStatus.label}
          </span>
        </div>
        {serviceStatusError && (
          <p role="status">
            {hasResolvedServiceStatus ? '状态刷新失败，已保留上次检查结果。' : '服务状态检查失败，请稍后重试。'}
          </p>
        )}
      </div>
    </aside>
  )
}
