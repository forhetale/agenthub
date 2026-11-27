import type { AgentFamily } from './family'

export const AGENT_RUNTIMES = ['hermes', 'hub', 'claude-code', 'codex', 'pi', 'grok', 'opencode', 'dsh', 'cursor', 'antigravity', 'qwen', 'kimi', 'codebuddy', 'qoder', 'copilot', 'zcode'] as const

export type AgentRuntime = typeof AGENT_RUNTIMES[number] | `plugin:${string}/${string}`
export type CodingAgentRuntime = Extract<AgentRuntime, 'claude-code' | 'codex' | 'pi' | 'grok' | 'opencode' | 'dsh' | 'cursor' | 'antigravity' | 'qwen' | 'kimi' | 'codebuddy' | 'qoder' | 'copilot' | 'zcode'>

const AGENT_RUNTIME_SET = new Set<string>(AGENT_RUNTIMES)

const RUNTIME_FAMILIES: Record<AgentRuntime, AgentFamily> = {
  hermes: 'hermes',
  hub: 'hub',
  'claude-code': 'coding',
  codex: 'coding',
  pi: 'coding',
  grok: 'coding',
  opencode: 'coding',
  dsh: 'coding',
  cursor: 'coding',
  antigravity: 'coding',
  qwen: 'coding',
  kimi: 'coding',
  codebuddy: 'coding',
  qoder: 'coding',
  copilot: 'coding',
  zcode: 'coding',

}

export function isAgentRuntime(value: unknown): value is AgentRuntime {
  return typeof value === 'string' && (AGENT_RUNTIME_SET.has(value) || /^plugin:[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/.test(value))
}

/** Normalize current and legacy agent runtime values ('ekko'/'ekko-agent' -> 'hub'). */
export function normalizeAgentRuntime(value: unknown): AgentRuntime | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'ekko' || lower === 'ekko-agent' || lower === 'ekko_agent' || lower === 'hub-agent' || lower === 'hub_agent') {
    return 'hub'
  }
  return isAgentRuntime(trimmed) ? trimmed : undefined
}

export function agentFamilyForRuntime(runtime: AgentRuntime): AgentFamily {
  return runtime.startsWith('plugin:') ? 'coding' : RUNTIME_FAMILIES[runtime]
}
