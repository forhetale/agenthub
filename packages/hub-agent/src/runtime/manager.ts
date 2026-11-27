import type { AgentRuntime } from './runtime'
import type { CreateHubAgentRuntimeOptions } from '../setup'

export interface HubAgentRuntimeManagerOptions {
  create: (options?: CreateHubAgentRuntimeOptions) => AgentRuntime
}

/** Public runtime module used through `hubAgent.runtime`. */
export class HubAgentRuntimeManager {
  private readonly createRuntime: HubAgentRuntimeManagerOptions['create']

  constructor(options: HubAgentRuntimeManagerOptions) {
    this.createRuntime = options.create
  }

  create(options: CreateHubAgentRuntimeOptions = {}): AgentRuntime {
    return this.createRuntime(options)
  }
}
