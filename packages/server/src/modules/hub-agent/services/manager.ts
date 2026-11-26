import {
  AgentRuntime,
  HubAgentSetup,
  HubAgentFileLogger,
  MemoryService,
  setupHubAgent,
  DEFAULT_HUB_AGENT_JEV_CONFIG,
  type HubAgentJevConfig,
  type AgentRuntimeRunInput,
  type AgentRuntimeRunResult,
  type AgentRuntimeBoundaryInterruptRequest,
  type AgentRuntimeBoundaryInterruptResult,
  type AgentRuntimeContextEstimate,
  type AgentRuntimeOptions,
  type HubAgentConfig,
  type HubAgentConfigPatch,
} from '../../../../../hub-agent/src'
import { config } from '../../studio/public/config'
import { logger } from '../../studio/public/logging'
import { getJevRuntimeConfig } from '../../studio/public/jev'
import {
  getProfilesBaseDir,
  listProfileNames,
} from '../../studio/public/profile-config'
import { denyPendingHubAgentToolApprovals } from './approvals'
import { cancelPendingHubAgentClarifications } from './clarifications'

export interface GlobalHubAgentOptions {
  setup: HubAgentSetup
  profile?: string
  memory?: MemoryService | false
  /** Installation-wide values applied before this global agent is created. */
  config?: HubAgentConfigPatch
}

export class GlobalHubAgent {
  readonly createdAt = Date.now()
  lastUsedAt = this.createdAt
  runCount = 0
  private readonly options: GlobalHubAgentOptions
  private readonly setup: HubAgentSetup
  private readonly skillDirectory: string
  private readonly logDirectory: string
  private readonly workspaceDirectory: string
  private fileLogger: HubAgentFileLogger
  private runtime?: AgentRuntime
  private activeRuns = 0
  private runtimeRefreshPending = false
  private readonly memory?: MemoryService
  private readonly memoryDatabasePath?: string

  constructor(options: GlobalHubAgentOptions) {
    this.options = options
    this.setup = options.setup
    if (options.config) this.setup.config.update(options.config)
    const profileLayout = this.setup.profile(options.profile)
    this.skillDirectory = profileLayout.skillDirectory
    this.logDirectory = profileLayout.logDirectory
    this.workspaceDirectory = profileLayout.workspaceDirectory
    this.fileLogger = this.createFileLogger()
    this.memory = options.memory === false ? undefined : options.memory ?? this.setup.memory
    this.memoryDatabasePath = this.memory === this.setup.memory
      ? this.setup.database.databasePath
      : undefined
  }

  async run(input: AgentRuntimeRunInput): Promise<AgentRuntimeRunResult> {
    this.lastUsedAt = Date.now()
    this.runCount += 1
    this.activeRuns += 1
    try {
      const runtime = this.runtimeInstance(await this.jevRuntimeConfig())
      return await runtime.run(this.withDefaultWorkspace(input))
    } finally {
      this.activeRuns -= 1
      this.applyPendingRuntimeRefresh()
      reloadGlobalHubAgentSetupAfterRecovery()
    }
  }

  async runIsolated(
    options: Omit<AgentRuntimeOptions, 'logWriter' | 'logProfile'>,
    input: AgentRuntimeRunInput,
  ): Promise<AgentRuntimeRunResult> {
    this.activeRuns += 1
    try {
      const runtime = this.setup.createRuntime({
        ...options,
        jev: await this.jevRuntimeConfig(),
        profile: this.options.profile || 'default',
        memory: options.memory ?? false,
        logWriter: this.fileLogger,
        logProfile: this.options.profile || 'default',
      })
      return await runtime.run(input)
    } finally {
      this.activeRuns -= 1
      reloadGlobalHubAgentSetupAfterRecovery()
    }
  }

  async estimateContext(input: AgentRuntimeRunInput): Promise<AgentRuntimeContextEstimate> {
    return this.runtimeInstance().estimateContext(this.withDefaultWorkspace(input))
  }

  sessionWorkspaceDirectory(sessionId: string): string {
    return this.setup.directories.sessionWorkspaceDirectory(this.options.profile || 'default', sessionId)
  }

  hasBackgroundTasks(sessionId?: string): boolean {
    return this.runtime?.hasBackgroundTasks(sessionId) ?? false
  }

  isIdleForSetupReload(): boolean {
    return this.activeRuns === 0 && !this.hasBackgroundTasks()
  }

  async abortBackgroundTasks(sessionId?: string): Promise<number> {
    const count = await (this.runtime?.abortBackgroundTasks(sessionId) ?? 0)
    this.applyPendingRuntimeRefresh()
    reloadGlobalHubAgentSetupAfterRecovery()
    return count
  }

  requestBoundaryInterrupt(
    input: AgentRuntimeBoundaryInterruptRequest,
  ): AgentRuntimeBoundaryInterruptResult {
    return this.runtime?.requestBoundaryInterrupt(input) ?? { status: 'not_running' }
  }

  close(): void {
    void this.runtime?.abortBackgroundTasks()
    this.runtime = undefined
  }

  refreshRuntime(): 'refreshed' | 'deferred' {
    if (this.activeRuns > 0 || this.hasBackgroundTasks()) {
      this.runtimeRefreshPending = true
      return 'deferred'
    }
    this.runtime = undefined
    this.fileLogger = this.createFileLogger()
    this.runtimeRefreshPending = false
    return 'refreshed'
  }

  status() {
    return {
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      runCount: this.runCount,
      memoryEnabled: this.memory?.isEnabled ?? false,
      memoryDatabasePath: this.memoryDatabasePath,
      dataDirectory: this.setup.layout.rootDirectory,
      configDirectory: this.setup.layout.configDirectory,
      configPath: this.setup.layout.configPath,
      skillDirectory: this.skillDirectory,
      logDirectory: this.logDirectory,
      workspaceDirectory: this.workspaceDirectory,
      logFilePath: this.fileLogger.filePath,
      profile: this.options.profile || 'default',
      recovery: this.setup.recovery.snapshot(),
    }
  }

  readConfig(): HubAgentConfig {
    return this.setup.config.read()
  }

  private runtimeInstance(jev?: HubAgentJevConfig): AgentRuntime {
    this.applyPendingRuntimeRefresh()
    if (this.runtime) {
      if (jev) this.runtime.jev.configure(jev)
      return this.runtime
    }
    this.runtime = this.setup.createRuntime({
      jev: jev ?? false,
      profile: this.options.profile || 'default',
      memory: this.memory ?? false,
      logWriter: this.fileLogger,
      logProfile: this.options.profile || 'default',
    })
    return this.runtime
  }

  private async jevRuntimeConfig(): Promise<HubAgentJevConfig> {
    try {
      return await getJevRuntimeConfig()
    } catch {
      logger.warn('[hub-agent] Studio JEV settings unavailable; JEV is disabled for this run')
      return { ...DEFAULT_HUB_AGENT_JEV_CONFIG }
    }
  }

  private applyPendingRuntimeRefresh(): void {
    if (!this.runtimeRefreshPending || this.activeRuns > 0 || this.hasBackgroundTasks()) return
    this.runtime = undefined
    this.fileLogger = this.createFileLogger()
    this.runtimeRefreshPending = false
  }

  private createFileLogger(): HubAgentFileLogger {
    return new HubAgentFileLogger({
      directory: this.logDirectory,
      maxBytes: this.setup.config.read().logging.maxBytes,
    })
  }

  private withDefaultWorkspace(input: AgentRuntimeRunInput): AgentRuntimeRunInput {
    if (input.toolContext?.workspaceRoot || input.toolContext?.cwd) return input
    const sessionId = (
      input.toolContext?.sessionId ||
      (typeof input.metadata?.session_id === 'string' ? input.metadata.session_id : '')
    ).trim()
    if (!sessionId) return input
    const workspace = this.sessionWorkspaceDirectory(sessionId)
    return {
      ...input,
      toolContext: {
        ...input.toolContext,
        cwd: workspace,
        workspaceRoot: workspace,
        workspaceId: input.toolContext?.workspaceId || workspace,
      },
    }
  }
}

export function createGlobalHubAgent(
  options: GlobalHubAgentOptions,
): GlobalHubAgent {
  return new GlobalHubAgent(options)
}

export interface SetupGlobalHubAgentOptions {
  baseDirectory?: string
  profiles?: string[]
  config?: HubAgentConfigPatch
  env?: Record<string, string | undefined>
}

let globalHubAgentSetup: HubAgentSetup | undefined
let globalHubAgentSetupOptions: SetupGlobalHubAgentOptions | undefined
const globalHubAgents = new Map<string, GlobalHubAgent>()

function reloadGlobalHubAgentSetupAfterRecovery(): boolean {
  if (!globalHubAgentSetup?.recovery.snapshot().capabilities.database.restartRequired) return false
  if ([...globalHubAgents.values()].some(agent => !agent.isIdleForSetupReload())) return false

  const databasePath = globalHubAgentSetup.layout.databasePath
  for (const agent of globalHubAgents.values()) agent.close()
  globalHubAgents.clear()
  globalHubAgentSetup.close()
  globalHubAgentSetup = undefined
  logger.info({ databasePath }, '[hub-agent] persistent database repaired; setup will reopen automatically')
  return true
}

export function setupGlobalHubAgent(
  options: SetupGlobalHubAgentOptions = {},
): HubAgentSetup {
  reloadGlobalHubAgentSetupAfterRecovery()
  if (globalHubAgentSetup) return globalHubAgentSetup
  if (!globalHubAgentSetupOptions) {
    globalHubAgentSetupOptions = {
      ...options,
      ...(options.profiles ? { profiles: [...options.profiles] } : {}),
      ...(options.env ? { env: { ...options.env } } : {}),
    }
  }
  const setupOptions = globalHubAgentSetupOptions
  globalHubAgentSetup = setupHubAgent({
    baseDirectory: setupOptions.baseDirectory ?? config.appHome,
    hermesRootDirectory: getProfilesBaseDir(),
    profiles: setupOptions.profiles ?? listProfileNames(),
    config: setupOptions.config,
    env: setupOptions.env,
  })
  logger.info({
    dataDirectory: globalHubAgentSetup.layout.rootDirectory,
    configPath: globalHubAgentSetup.layout.configPath,
    databasePath: globalHubAgentSetup.layout.databasePath,
    activeDatabasePath: globalHubAgentSetup.database.databasePath,
    recoveryStatus: globalHubAgentSetup.recovery.snapshot().status,
    profiles: globalHubAgentSetup.profiles().map(profile => profile.profile),
  }, '[hub-agent] setup complete')
  return globalHubAgentSetup
}

export function getGlobalHubAgent(profile = 'default'): GlobalHubAgent {
  const normalizedProfile = String(profile || '').trim() || 'default'
  const setup = setupGlobalHubAgent()
  let agent = globalHubAgents.get(normalizedProfile)
  if (!agent) {
    setup.ensureProfile(normalizedProfile)
    agent = createGlobalHubAgent({
      setup,
      profile: normalizedProfile,
    })
    globalHubAgents.set(normalizedProfile, agent)
  }
  return agent
}

export function hasGlobalHubAgentBackgroundTasks(sessionId: string): boolean {
  for (const agent of globalHubAgents.values()) {
    if (agent.hasBackgroundTasks(sessionId)) return true
  }
  return false
}

export async function abortGlobalHubAgentBackgroundTasks(sessionId: string): Promise<number> {
  const counts = await Promise.all(
    [...globalHubAgents.values()].map(agent => agent.abortBackgroundTasks(sessionId)),
  )
  return counts.reduce((sum, count) => sum + count, 0)
}

export function refreshGlobalHubAgentRuntimes(): { refreshed: number; deferred: number } {
  let refreshed = 0
  let deferred = 0
  for (const agent of globalHubAgents.values()) {
    if (agent.refreshRuntime() === 'refreshed') refreshed += 1
    else deferred += 1
  }
  return { refreshed, deferred }
}

export function closeGlobalHubAgent(): void {
  denyPendingHubAgentToolApprovals()
  cancelPendingHubAgentClarifications()
  for (const agent of globalHubAgents.values()) agent.close()
  globalHubAgents.clear()
  globalHubAgentSetup?.close()
  globalHubAgentSetup = undefined
  globalHubAgentSetupOptions = undefined
}
