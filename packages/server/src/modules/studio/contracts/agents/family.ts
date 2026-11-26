export const AGENT_FAMILIES = ['hermes', 'hub', 'coding'] as const

export type AgentFamily = typeof AGENT_FAMILIES[number]

const AGENT_FAMILY_SET = new Set<string>(AGENT_FAMILIES)

export function isAgentFamily(value: unknown): value is AgentFamily {
  return typeof value === 'string' && AGENT_FAMILY_SET.has(value)
}

/** Normalize current and legacy family identifiers ('ekko' -> 'hub'). */
export function normalizeAgentFamily(value: unknown): AgentFamily | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ekko' || normalized === 'hub') return 'hub'
  return AGENT_FAMILY_SET.has(normalized) ? (normalized as AgentFamily) : undefined
}
