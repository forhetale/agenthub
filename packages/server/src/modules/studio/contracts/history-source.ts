export const LEGACY_EKKO_AGENT_IDS = ['ekko', 'ekko-agent', 'ekko_agent'] as const
export const BUILTIN_HUB_AGENT_IDS = ['hub', 'hub-agent', 'hub_agent', ...LEGACY_EKKO_AGENT_IDS] as const
export const BUILTIN_HISTORY_SOURCES = ['cli', 'api_server', 'coding_agent', 'builtin_agent'] as const

export function isBuiltinHubAgent(agent?: string | null): boolean {
  return BUILTIN_HUB_AGENT_IDS.some(value => value === (agent || '').trim().toLowerCase())
}

export function historySessionSource(session: { source?: string | null; agent?: string | null }): string {
  const source = session.source || ''
  return BUILTIN_HISTORY_SOURCES.some(value => value === source)
    && isBuiltinHubAgent(session.agent)
    ? 'builtin_agent'
    : source
}

/** Canonical storage identity; orchestrated runs retain their surface source. */
export function normalizeSessionIdentity(session: { source: string; agent: string }): { source: string; agent: string } {
  return {
    source: historySessionSource(session),
    agent: isBuiltinHubAgent(session.agent) ? 'hub-agent' : session.agent,
  }
}

/** Accept legacy Ekko/Hub Agent requests while selecting the native runtime and real source. */
export function normalizeHubAgentRunData(
  data: { source?: string; session_source?: string; agent_id?: string; coding_agent_id?: string },
  stored?: { source?: string | null; agent?: string | null } | null,
): void {
  const requestedAgent = data.agent_id || data.coding_agent_id
  if (requestedAgent && !isBuiltinHubAgent(requestedAgent)) {
    if (data.source === 'builtin_agent') throw new Error('builtin_agent source requires agent_id=hub-agent')
    return
  }
  if (!isBuiltinHubAgent(requestedAgent) && !isBuiltinHubAgent(stored?.agent) && data.source !== 'builtin_agent') return
  data.agent_id = 'hub-agent'
  if (data.coding_agent_id) data.coding_agent_id = 'hub-agent'
  const surface = [data.session_source, data.source, stored?.source].find(source =>
    source === 'group_chat' || source === 'workflow' || source === 'global_agent')
  data.source = surface || 'builtin_agent'
}
