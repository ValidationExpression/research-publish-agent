/** 从平台 homepage URL 提取 hostname */
export function extractHost(homepage?: string): string | null {
  if (!homepage) return null
  try {
    return new URL(homepage).hostname
  } catch {
    return null
  }
}

const SECOND_LEVEL_TLD_PARTS = ['com', 'org', 'net', 'gov', 'edu', 'co']

/**
 * 将完整 hostname 归一为根域（如 editor.csdn.net -> csdn.net）。
 * 登录 Cookie 通常挂在父域，插件 chrome.cookies.getAll 需请求根域才能完整拿到。
 */
export function rootDomain(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const last = parts[parts.length - 1]
  const second = parts[parts.length - 2]
  if (last.length === 2 && SECOND_LEVEL_TLD_PARTS.includes(second)) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}
