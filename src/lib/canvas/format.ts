import type { AgentRole } from '../contracts/common'

/** 去掉 `toFixed(1)` 产生的 `.0` 尾巴。 */
function stripTrailingZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

export function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n)
  }
  if (n < 1_000_000) {
    return `${stripTrailingZero((n / 1000).toFixed(1))}K`
  }
  return `${stripTrailingZero((n / 1_000_000).toFixed(1))}M`
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export type RoleFamily = 'gather' | 'reason' | 'produce' | 'review'

export interface RoleInfo {
  family: RoleFamily
  label: string
}

const ROLE_INFO: Record<AgentRole, RoleInfo> = {
  researcher: { family: 'gather', label: '调研' },
  analyst: { family: 'reason', label: '分析' },
  coder: { family: 'reason', label: '编码' },
  specialist: { family: 'reason', label: '专家' },
  writer: { family: 'produce', label: '写作' },
  synthesizer: { family: 'produce', label: '综合' },
  reviewer: { family: 'review', label: '审校' },
  judge: { family: 'review', label: '多路择优' },
  aligner: { family: 'review', label: '方向校准' },
}

/** lib 层只提供族与中文名，图标在组件层按 family 映射。 */
export function roleInfo(role: AgentRole): RoleInfo {
  return ROLE_INFO[role]
}
