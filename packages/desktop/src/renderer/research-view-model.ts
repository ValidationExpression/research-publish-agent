import type { WorkflowArticle } from './workflow'

export type ResearchPhase = 'thinking' | 'searching' | 'writing' | 'done' | 'error'

export interface SearchSource {
  title: string
  url: string
}

export interface SearchStep {
  id: string
  query: string
  status: 'running' | 'done' | 'error'
  sources: SearchSource[]
}

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface UserMessage {
  id: string
  role: 'user'
  content: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  jobId: string | null
  phase: ResearchPhase
  thinking: string
  searches: SearchStep[]
  markdown: string
  title: string
  error: string | null
  elapsed: number
  completedAt?: string
}

export type ChatMessage = UserMessage | AssistantMessage

export interface ResearchConversation {
  messages: ChatMessage[]
  activeAssistantId: string | null
}

export interface ResearchSseEvent {
  jobId: string
  type: string
  message?: string
  id?: string
  query?: string
  status?: SearchStep['status']
  sources?: SearchSource[]
  elapsed?: number
}

let messageSeq = 0

function nextMessageId(): string {
  messageSeq += 1
  return `m${messageSeq}`
}

export function createConversation(): ResearchConversation {
  return { messages: [], activeAssistantId: null }
}

export function appendTurn(conversation: ResearchConversation, content: string): ResearchConversation {
  const assistantId = nextMessageId()
  const assistant: AssistantMessage = {
    id: assistantId,
    role: 'assistant',
    jobId: null,
    phase: 'thinking',
    thinking: '',
    searches: [],
    markdown: '',
    title: '',
    error: null,
    elapsed: 0,
  }
  return {
    messages: [
      ...conversation.messages,
      { id: nextMessageId(), role: 'user', content: content.trim() },
      assistant,
    ],
    activeAssistantId: assistantId,
  }
}

export function attachJob(conversation: ResearchConversation, jobId: string): ResearchConversation {
  return mapActive(conversation, (message) => ({ ...message, jobId }))
}

export function failActiveTurn(conversation: ResearchConversation, error: string): ResearchConversation {
  return mapActive(conversation, (message) => ({ ...message, phase: 'error', error }))
}

export function finalizeReport(
  conversation: ResearchConversation,
  jobId: string,
  report: WorkflowArticle,
): ResearchConversation {
  return mapJob(conversation, jobId, (message) => ({
    ...message,
    phase: 'done',
    title: report.title,
    markdown: report.markdown,
    error: null,
    completedAt: message.completedAt ?? new Date().toISOString(),
  }))
}

export function isResearchRunning(conversation: ResearchConversation): boolean {
  const active = conversation.messages.find((message) => message.id === conversation.activeAssistantId)
  return !!active && active.role === 'assistant' && active.phase !== 'done' && active.phase !== 'error'
}

export function historyForRequest(messages: ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = []
  for (const message of messages) {
    if (message.role === 'user' && message.content.trim()) {
      turns.push({ role: 'user', content: message.content.trim() })
    }
    if (message.role === 'assistant' && message.phase === 'done' && message.markdown.trim()) {
      turns.push({ role: 'assistant', content: message.markdown })
    }
  }
  return turns
}

export function articleFromAssistant(message: AssistantMessage): WorkflowArticle | null {
  if (message.phase !== 'done') return null
  const markdown = message.markdown.trim()
  if (!markdown) return null
  const heading = markdown.match(/^#\s+(.+)$/m)
  const title = message.title.trim() || heading?.[1]?.trim() || '研究报告'
  return { title, markdown: message.markdown }
}

export function applyResearchEvent(conversation: ResearchConversation, event: ResearchSseEvent): ResearchConversation {
  return mapJob(conversation, event.jobId, (message) => reduceAssistant(message, event))
}

function reduceAssistant(message: AssistantMessage, event: ResearchSseEvent): AssistantMessage {
  if (event.type === 'planning') {
    const text = event.message?.trim()
    if (!text) return message
    return { ...message, thinking: message.thinking ? `${message.thinking}\n${text}` : text }
  }
  if (event.type === 'thinking') {
    return { ...message, thinking: message.thinking + (event.message || '') }
  }
  if (event.type === 'search') {
    return {
      ...message,
      phase: message.phase === 'writing' || message.phase === 'done' || message.phase === 'error' ? message.phase : 'searching',
      searches: upsertSearch(message.searches, event),
    }
  }
  if (event.type === 'heartbeat') {
    return { ...message, elapsed: typeof event.elapsed === 'number' ? event.elapsed : message.elapsed }
  }
  if (event.type === 'phase' && event.message === 'writing') {
    return { ...message, phase: 'writing' }
  }
  if (event.type === 'report') {
    if (message.phase !== 'writing' && message.phase !== 'done') return message
    return { ...message, markdown: message.markdown + (event.message || '') }
  }
  if (event.type === 'done') {
    return { ...message, phase: 'done', completedAt: message.completedAt ?? new Date().toISOString() }
  }
  if (event.type === 'error') {
    return { ...message, phase: 'error', error: event.message?.trim() || '研究失败' }
  }
  return message
}

function upsertSearch(searches: SearchStep[], event: ResearchSseEvent): SearchStep[] {
  const id = event.id || event.query || event.message || 'search'
  const index = searches.findIndex((search) => search.id === id)
  const previous = index >= 0 ? searches[index] : undefined
  const next: SearchStep = {
    id,
    query: event.query || event.message || previous?.query || '',
    status: event.status || previous?.status || 'running',
    sources: Array.isArray(event.sources) ? normalizeSources(event.sources) : previous?.sources || [],
  }
  if (!previous) return [...searches, next]
  return searches.map((search) => (search.id === id ? next : search))
}

function normalizeSources(sources: SearchSource[]): SearchSource[] {
  return sources.flatMap((source) => {
    const title = typeof source?.title === 'string' ? source.title : ''
    const url = typeof source?.url === 'string' ? source.url : ''
    return title || url ? [{ title: title || url, url }] : []
  })
}

function mapActive(
  conversation: ResearchConversation,
  update: (message: AssistantMessage) => AssistantMessage,
): ResearchConversation {
  const { activeAssistantId } = conversation
  if (!activeAssistantId) return conversation
  return {
    ...conversation,
    messages: conversation.messages.map((message) => (
      message.role === 'assistant' && message.id === activeAssistantId ? update(message) : message
    )),
  }
}

function mapJob(
  conversation: ResearchConversation,
  jobId: string,
  update: (message: AssistantMessage) => AssistantMessage,
): ResearchConversation {
  let changed = false
  const messages = conversation.messages.map((message) => {
    if (message.role !== 'assistant' || message.jobId !== jobId) return message
    changed = true
    return update(message)
  })
  return changed ? { ...conversation, messages } : conversation
}

export function parseResearchReport(data: unknown): WorkflowArticle | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const report = data as Record<string, unknown>
  if (typeof report.title !== 'string' || !report.title.trim()) return null
  if (typeof report.markdown !== 'string' || !report.markdown.trim()) return null
  return { title: report.title, markdown: report.markdown }
}

export const RESEARCH_SUGGESTIONS = [
  '2026 年主流 AI Agent 框架的能力与适用场景对比',
  '中国新能源汽车出海的机会、风险与区域差异',
  '大模型推理成本的构成与工程优化路径',
] as const

export function canStartResearch(topic: string, running: boolean): boolean {
  return !running && topic.trim().length > 0
}

export function classifyResearchLog(line: string): 'default' | 'progress' | 'done' | 'error' {
  if (line.includes('[error]')) return 'error'
  if (line.includes('[done]')) return 'done'
  if (line.includes('[progress]')) return 'progress'
  return 'default'
}

export function getResearchLogMessage(line: string): string {
  return line.replace(/^\[(?:error|done|progress)\]\s*/, '')
}
