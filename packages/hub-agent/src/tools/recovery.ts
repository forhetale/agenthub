import type {
  HubAgentDatabaseRecoveryStrategy,
  HubAgentRecoveryService,
  HubAgentSelfCheckComponent,
} from '../recovery'
import type { AgentTool, AgentToolContext, AgentToolResult } from './types'

interface SelfCheckInput extends Record<string, unknown> {
  component?: HubAgentSelfCheckComponent
  profile?: string
}

interface RepairSkillsInput extends Record<string, unknown> {
  profile?: string
}

interface RepairLogsInput extends Record<string, unknown> {
  profile?: string
}

interface RepairDatabaseInput extends Record<string, unknown> {
  strategy?: HubAgentDatabaseRecoveryStrategy
  confirmed?: boolean
}

export function createRecoveryTools(recovery: HubAgentRecoveryService): AgentTool[] {
  return [
    new HubAgentDiagnosticsTool(recovery),
    new HubAgentDatabaseSchemaTool(recovery),
    new HubAgentRepairSkillsTool(recovery),
    new HubAgentRepairLogsTool(recovery),
    new HubAgentRepairDatabaseTool(recovery),
    new HubAgentSelfCheckTool(recovery),
  ]
}

class HubAgentRepairLogsTool implements AgentTool<RepairLogsInput> {
  readonly definition = {
    name: 'hub_agent_repair_logs',
    description: 'Repair the current Profile log directory and run a deterministic writable-directory self-check. Hub Agent Core remains available while logging is degraded.',
    parameters: {
      type: 'object',
      properties: {
        profile: { type: 'string', description: 'Profile to repair. Defaults to the current runtime Profile.' },
      },
      additionalProperties: false,
    },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(input: RepairLogsInput, context?: AgentToolContext): Promise<AgentToolResult> {
    const profile = recoveryProfile(input.profile, context)
    if (profile instanceof Error) return failure(undefined, profile.message)
    const result = this.recovery.repairLogs(profile)
    return result.ok
      ? success(result)
      : failure(result, result.error || 'Hub Agent log repair did not pass self-check.')
  }
}

class HubAgentDiagnosticsTool implements AgentTool {
  readonly concurrency = 'parallel' as const
  readonly definition = {
    name: 'hub_agent_diagnostics',
    description: 'Inspect exact active Hub Agent capability errors, source/target paths, recovery plans, and whether Core is still available. This tool does not depend on Skills or the persistent database.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(): Promise<AgentToolResult> {
    return success(this.recovery.snapshot())
  }
}

class HubAgentDatabaseSchemaTool implements AgentTool {
  readonly concurrency = 'parallel' as const
  readonly definition = {
    name: 'hub_agent_database_schema',
    description: 'Show the code-owned Hub Agent SQLite schema blueprint, migration owners, tables, and fields. Never use ad-hoc SQL to reconstruct Hub Agent storage.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(): Promise<AgentToolResult> {
    return success(this.recovery.databaseSchema())
  }
}

class HubAgentRepairSkillsTool implements AgentTool<RepairSkillsInput> {
  readonly definition = {
    name: 'hub_agent_repair_skills',
    description: 'Repair bundled Hub Agent Skills by copying from the packaged source to the exact Profile target with Hub Agent ownership rules, then automatically self-check. User-modified name conflicts are preserved.',
    parameters: {
      type: 'object',
      properties: {
        profile: { type: 'string', description: 'Profile to repair. Defaults to the current runtime Profile.' },
      },
      additionalProperties: false,
    },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(input: RepairSkillsInput, context?: AgentToolContext): Promise<AgentToolResult> {
    const profile = recoveryProfile(input.profile, context)
    if (profile instanceof Error) return failure(undefined, profile.message)
    const result = this.recovery.repairSkills(profile)
    return result.ok ? success(result) : failure(result, 'Hub Agent Skill repair did not pass self-check.')
  }
}

class HubAgentRepairDatabaseTool implements AgentTool<RepairDatabaseInput> {
  readonly definition = {
    name: 'hub_agent_repair_database',
    description: 'Repair the persistent Hub Agent database with code-owned migrations and automatic self-check. Use retry first. Rebuild quarantines the current database and requires confirmed=true.',
    parameters: {
      type: 'object',
      properties: {
        strategy: {
          type: 'string',
          enum: ['retry', 'rebuild'],
          description: 'retry applies migrations in place; rebuild preserves the original as a backup and creates a replacement.',
        },
        confirmed: {
          type: 'boolean',
          description: 'Must be true for rebuild because it quarantines the current database family.',
        },
      },
      additionalProperties: false,
    },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(input: RepairDatabaseInput): Promise<AgentToolResult> {
    const strategy = input.strategy === 'rebuild' ? 'rebuild' : 'retry'
    const result = this.recovery.repairDatabase(strategy, input.confirmed === true)
    return result.ok ? success(result) : failure(result, result.error || 'Hub Agent database repair did not pass self-check.')
  }
}

class HubAgentSelfCheckTool implements AgentTool<SelfCheckInput> {
  readonly definition = {
    name: 'hub_agent_self_check',
    description: 'Run deterministic Hub Agent capability checks. Passing checks resolve only the matching current incident revision; failed checks keep the error active.',
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string', enum: ['all', 'skills', 'database', 'memory', 'logs'] },
        profile: { type: 'string', description: 'Profile for the Skills or Logs check. Defaults to the current runtime Profile.' },
      },
      additionalProperties: false,
    },
  }

  constructor(private readonly recovery: HubAgentRecoveryService) {}

  async execute(input: SelfCheckInput, context?: AgentToolContext): Promise<AgentToolResult> {
    const component = ['skills', 'database', 'memory', 'logs'].includes(String(input.component))
      ? input.component as Exclude<HubAgentSelfCheckComponent, 'all'>
      : 'all'
    const profile = recoveryProfile(input.profile, context)
    if (profile instanceof Error) return failure(undefined, profile.message)
    const result = this.recovery.selfCheckAndResolve(component, profile)
    return result.ok ? success(result) : failure(result, 'Hub Agent self-check found unresolved capability errors.')
  }
}

function success(data: unknown): AgentToolResult {
  return { ok: true, content: JSON.stringify(data, null, 2), data }
}

function failure(data: unknown, error: string): AgentToolResult {
  return { ok: false, content: JSON.stringify(data, null, 2) ?? error, data, error }
}

function recoveryProfile(value: unknown, context?: AgentToolContext): string | Error {
  const contextProfile = String(context?.profileId || '').trim()
  const requestedProfile = String(value || '').trim()
  if (contextProfile && requestedProfile && requestedProfile !== contextProfile) {
    return new Error(
      `Hub Agent recovery cannot cross Profile boundaries: ${requestedProfile} != ${contextProfile}.`,
    )
  }
  return requestedProfile || contextProfile || 'default'
}
