import type { HubAgentProfileAgent } from './profile-agent'

export interface HubAgentManagerOptions {
  create: (profile: string) => HubAgentProfileAgent
  onCreate?: (agent: HubAgentProfileAgent) => void
  onRemove?: (agent: HubAgentProfileAgent) => void
}

/** Owns the one-profile-to-one-agent instance map for an Hub Agent installation. */
export class HubAgentManager {
  private readonly agents = new Map<string, HubAgentProfileAgent>()

  constructor(private readonly options: HubAgentManagerOptions) {}

  create(profile: string): HubAgentProfileAgent {
    const name = normalizeAgentProfile(profile)
    if (this.agents.has(name)) throw new Error(`Hub Agent profile agent already exists: ${name}`)
    return this.instantiate(name)
  }

  ensure(profile = 'default'): HubAgentProfileAgent {
    const name = normalizeAgentProfile(profile)
    return this.agents.get(name) ?? this.instantiate(name)
  }

  get(profile = 'default'): HubAgentProfileAgent {
    const name = normalizeAgentProfile(profile)
    const agent = this.agents.get(name)
    if (!agent) throw new Error(`Hub Agent profile agent is not set up: ${name}`)
    return agent
  }

  find(profile: string): HubAgentProfileAgent | undefined {
    return this.agents.get(normalizeAgentProfile(profile))
  }

  has(profile: string): boolean {
    return this.agents.has(normalizeAgentProfile(profile))
  }

  list(): HubAgentProfileAgent[] {
    return [...this.agents.values()]
  }

  names(): string[] {
    return [...this.agents.keys()]
  }

  remove(profile: string): boolean {
    const name = normalizeAgentProfile(profile)
    if (name === 'default') throw new Error('The default Hub Agent profile agent cannot be removed.')
    const agent = this.agents.get(name)
    if (!agent) return false
    this.agents.delete(name)
    this.options.onRemove?.(agent)
    return true
  }

  private instantiate(profile: string): HubAgentProfileAgent {
    const agent = this.options.create(profile)
    this.agents.set(profile, agent)
    try {
      this.options.onCreate?.(agent)
    } catch (error) {
      this.agents.delete(profile)
      throw error
    }
    return agent
  }
}

export function normalizeAgentProfile(profile: string): string {
  return String(profile || '').trim() || 'default'
}
