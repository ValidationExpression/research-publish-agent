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
