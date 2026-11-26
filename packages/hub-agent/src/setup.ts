import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HubAgentDatabaseManager, HubAgentDatabaseMigrationError } from './database'
import {
  HubAgentDirectoryManager,
  type HubAgentDirectoryInitializationOptions,
  type HubAgentDirectoryLayout,
} from './directories'
import { MemoryService } from './memory/service'
import { HubAgentJevClient, resolveHubAgentJevConfig, type HubAgentJevOverrides } from './jev'
import { resolveHubAgentDataDirectory } from './memory/paths'
import { SqliteMemoryStore } from './memory/store'
import { HubAgentToolApprovalService } from './tools/approval'
import {
  HubAgentConfigError,
  HubAgentConfigStore,
  type ConfiguredModelAuthorizationEntry,
  type ConfiguredModelProviderEntry,
  type InstallModelProviderPresetOptions,
} from './config-store'
import { HubAgentConversationStore } from './conversations/store'
import {
  createConfiguredModelClient,
  modelRequestDefaultsFromConfig,
  resolveConfiguredModelProvider,
  type ResolveConfiguredModelProviderInput,
} from './model/provider-config'
import type { ModelClient, ModelClientOptions, ModelProviderConfig } from './model/types'
import {
  HubAgentModelAuthorizationManager,
  type HubAgentModelAuthorizationCredentials,
  type HubAgentModelAuthorizationRefresher,
} from './model/authorization'
import { AuthorizedModelClient } from './model/authorized-client'
import { HubAgentModelManager } from './model/manager'
import type { HubAgentModelProviderPreset } from './model/provider-presets'
import { AgentRuntime } from './runtime/runtime'
import { HubAgentRuntimeManager } from './runtime/manager'
import type { AgentRuntimeOptions } from './runtime/types'
import { createDefaultToolRegistry } from './tools/registry'
import { HubAgentToolManager } from './tools/manager'
import { HubAgentSkillManager } from './skills/manager'
import { resolveHubAgentExternalSkillDirectories } from './skills/external-directories'
import { HubAgentFileLogger } from './logging/file-logger'
import type {
  HubAgentConfig,
  HubAgentConfigPatch,
  HubAgentModelAuthorizationSettings,
  HubAgentModelProviderSettings,
} from './config'
import { HubAgentManager } from './agent/manager'
import { HubAgentProfileAgent } from './agent/profile-agent'
import { HubAgentDiagnosticsRegistry, profileScope } from './diagnostics'
import {
  HUB_AGENT_RECOVERABLE_DATABASE_TABLES,
  HubAgentRecoveryService,
} from './recovery'

export interface SetupHubAgentOptions extends HubAgentDirectoryInitializationOptions {
  baseDirectory?: string
  profiles?: string[]
  /**
   * Installation-wide config patch applied to the canonical config before
   * Profile agents and runtime services are created.
   */
  config?: HubAgentConfigPatch
  /** In-memory JEV overrides, applied after persisted config.jev; never written back. */
  jev?: HubAgentJevOverrides
  env?: Record<string, string | undefined>
  packageRoot?: string
  authorizationRefresher?: HubAgentModelAuthorizationRefresher
  authorizationFetch?: ModelClientOptions['fetch']
  authorizationNow?: () => number
}

export interface HubAgentProfileDirectoryLayout {
  profile: string
  skillDirectory: string
  logDirectory: string
  workspaceDirectory: string
}

export interface CreateHubAgentRuntimeOptions extends Omit<AgentRuntimeOptions, 'memory'> {
  profile?: string
  provider?: string
  model?: string
  apiKey?: string
  clientOptions?: ModelClientOptions
  /** Disable the shared memory service for this runtime without changing global config. */
  memory?: AgentRuntimeOptions['memory'] | false
}

function ensureStartupConfig(config: HubAgentConfigStore): HubAgentConfig {
  try {
    return config.ensureDefaults()
  } catch (error) {
    if (!(error instanceof HubAgentConfigError)) throw error

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(
      dirname(config.configPath),
      `config.invalid-${timestamp}-${randomUUID()}.json`,
    )
    copyFileSync(config.configPath, backupPath)
    try {
      chmodSync(backupPath, 0o600)
    } catch {
      // Some filesystems do not expose POSIX permissions.
    }

    const recovered = config.reset()
    console.warn(
      `[hub-agent] invalid config was backed up to ${backupPath}; defaults restored: ${error.message}`,
    )
    return recovered
  }
}

/**
 * Process-level Hub Agent resources created before any agent run.
 *
 * The setup owns its database connection and memory service. Profile agents
 * borrow these resources and must not close them independently.
 */
export class HubAgentSetup {
  readonly directories: HubAgentDirectoryManager
  readonly layout: HubAgentDirectoryLayout
  readonly diagnostics: HubAgentDiagnosticsRegistry
  readonly recovery: HubAgentRecoveryService
  readonly config: HubAgentConfigStore
  readonly jev: HubAgentJevClient
  readonly database: HubAgentDatabaseManager
  readonly memoryStore: SqliteMemoryStore
  readonly memory: MemoryService
  readonly conversations: HubAgentConversationStore
  readonly conversation: HubAgentConversationStore
  readonly authorizations: HubAgentModelAuthorizationManager
  readonly authorization: HubAgentModelAuthorizationManager
  readonly model: HubAgentModelManager
  readonly tool: HubAgentToolManager
  readonly skill: HubAgentSkillManager
  readonly runtime: HubAgentRuntimeManager
  readonly agent: HubAgentManager
  readonly agents: HubAgentManager
  readonly default: HubAgentProfileAgent
  private readonly profileLayouts = new Map<string, HubAgentProfileDirectoryLayout>()
  private readonly directProfileProperties = new Set<string>()
  private currentToolApprovals: HubAgentToolApprovalService
  private readonly unsubscribeConfig: () => void
  private readonly jevOverrides?: HubAgentJevOverrides
  private closed = false

  constructor(options: SetupHubAgentOptions = {}) {
    this.jevOverrides = options.jev === undefined ? undefined : structuredClone(options.jev)
    const dataDirectory = resolveHubAgentDataDirectory({
      baseDirectory: options.baseDirectory,
      env: options.env,
      packageRoot: options.packageRoot,
    })
    this.diagnostics = new HubAgentDiagnosticsRegistry()
    this.directories = new HubAgentDirectoryManager(dirname(dataDirectory))
    let startupSkillError: unknown
    this.layout = this.directories.initialize({
      hermesRootDirectory: options.hermesRootDirectory,
      onSkillError: error => {
        startupSkillError = error
        try {
          options.onSkillError?.(error)
        } catch (callbackError) {
          console.warn(
            `[hub-agent] onSkillError callback failed: ` +
            `${callbackError instanceof Error ? callbackError.message : String(callbackError)}`,
          )
        }
      },
    })
    this.recovery = new HubAgentRecoveryService({
      diagnostics: this.diagnostics,
      directories: this.directories,
      databasePath: this.layout.databasePath,
      env: options.env,
    })
    if (startupSkillError) {
      this.recovery.recordSkillsFailure(undefined, 'startup.initialize_skills', startupSkillError)
    }
    this.config = new HubAgentConfigStore({ configPath: this.layout.configPath })
    const startupConfig = ensureStartupConfig(this.config)
    const config = options.config
      ? this.config.update(options.config)
      : startupConfig
    this.jev = new HubAgentJevClient(resolveHubAgentJevConfig(config.jev, this.jevOverrides))
    this.authorizations = new HubAgentModelAuthorizationManager({
      config: this.config,
      refresher: options.authorizationRefresher,
      fetch: options.authorizationFetch,
      now: options.authorizationNow,
    })
    this.currentToolApprovals = this.createToolApprovals(config)
    this.authorization = this.authorizations
    this.tool = new HubAgentToolManager({
      createRegistry: profile => this.createProfileToolRegistry(profile),
    })
    this.unsubscribeConfig = this.config.onDidChange(nextConfig => {
      this.jev.configure(resolveHubAgentJevConfig(nextConfig.jev, this.jevOverrides))
      this.currentToolApprovals = this.createToolApprovals(nextConfig)
      this.tool.invalidate()
      this.memory?.configure({
        enabled: nextConfig.memory.enabled,
        recentMessageLimit: nextConfig.memory.recentMessageLimit,
        automaticRecallTokenBudget: nextConfig.memory.automaticRecallTokenBudget,
        searchResultLimit: nextConfig.memory.searchResultLimit,
      })
    })
    this.skill = new HubAgentSkillManager(this.tool)
    this.model = new HubAgentModelManager({
      config: this.config,
      authorizations: this.authorizations,
      resolveProvider: input => this.modelProviderConfig(input),
      createClient: (input, clientOptions) => this.createModelClient(input, clientOptions),
    })
    this.runtime = new HubAgentRuntimeManager({
      create: runtimeOptions => this.createRuntime(runtimeOptions),
    })
    let database = new HubAgentDatabaseManager({
      databasePath: this.layout.databasePath,
      env: options.env,
    })
    let memoryStore: SqliteMemoryStore
    let conversations: HubAgentConversationStore
    try {
      try {
        memoryStore = new SqliteMemoryStore(database)
        conversations = new HubAgentConversationStore(database)
      } catch (error) {
        database.close()
        if (!(error instanceof HubAgentDatabaseMigrationError) || error.lockFailure) throw error

        const backupPath = database.quarantineForRebuild()
        database = new HubAgentDatabaseManager({
          databasePath: this.layout.databasePath,
          env: options.env,
        })
        try {
          memoryStore = new SqliteMemoryStore(database)
          conversations = new HubAgentConversationStore(database)
        } catch (rebuildError) {
          database.restoreQuarantinedDatabase(backupPath)
          throw new Error(
            `Hub Agent database rebuild failed; the original database was restored from ${backupPath}.`,
            { cause: rebuildError },
          )
        }

        try {
          const recovery = database.recoverCompatibleTables(
            backupPath,
            HUB_AGENT_RECOVERABLE_DATABASE_TABLES,
          )
          memoryStore.rebuildSearchIndex()
          console.warn(
            `[hub-agent] database rebuilt after migration failure; backup=${backupPath}; ` +
            `recovered=${JSON.stringify(recovery.recoveredTables)}; skipped=${JSON.stringify(recovery.skippedTables)}`,
          )
        } catch (recoveryError) {
          console.warn(
            `[hub-agent] database rebuilt but data recovery could not read the backup at ${backupPath}: ` +
            `${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
          )
        }
      }
    } catch (error) {
      database.close()
      this.recovery.recordDatabaseFailure('startup.initialize_persistent_database', error)
      console.warn(
        `[hub-agent] persistent database unavailable; Core is continuing with ephemeral storage: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      )
      database = new HubAgentDatabaseManager({ databasePath: ':memory:', env: options.env })
      memoryStore = new SqliteMemoryStore(database)
      conversations = new HubAgentConversationStore(database)
    }

    this.database = database
    this.memoryStore = memoryStore
    this.recovery.configureMemorySelfCheck(() => {
      memoryStore.databaseManager.connection.prepare('SELECT 1 FROM memory_nodes LIMIT 1').get()
      return { ok: true, detail: `Active memory store is readable (${database.databasePath}).` }
    })
    this.memory = this.createMemoryService(config, memoryStore)
    this.conversations = conversations
    this.conversation = conversations

    this.agent = new HubAgentManager({
      create: profile => this.createProfileAgent(profile),
      onCreate: profileAgent => this.attachProfileAgent(profileAgent),
      onRemove: profileAgent => this.detachProfileAgent(profileAgent),
    })
    this.agents = this.agent

    const profiles = new Set([
      'default',
      ...this.directories.profileNames(),
      ...(options.profiles ?? []),
    ])
    try {
      for (const profile of profiles) this.agent.ensure(profile)
      this.default = this.agent.get('default')
    } catch (error) {
      this.close()
      throw error
    }
  }

  ensureProfile(profile = 'default'): HubAgentProfileDirectoryLayout {
    const layout = this.ensureProfileLayout(profile)
    this.agent.ensure(layout.profile)
    return layout
  }

  private ensureProfileLayout(profile = 'default'): HubAgentProfileDirectoryLayout {
    const normalizedProfile = String(profile || '').trim() || 'default'
    const existing = this.profileLayouts.get(normalizedProfile)
    if (existing) return existing
    const skillDirectory = this.directories.profileSkillsPath(normalizedProfile)
    try {
      this.directories.synchronizeProfileSkills(normalizedProfile)
      const selfCheck = this.recovery.selfCheckAndResolve('skills', normalizedProfile)
      if (!selfCheck.ok) {
        this.recovery.recordSkillsFailure(
          normalizedProfile,
          'profile.validate_bundled_skills',
          new Error(selfCheck.checks.filter(check => !check.ok).map(check => check.detail).join('; ')),
        )
      }
    } catch (error) {
      this.recovery.recordSkillsFailure(normalizedProfile, 'profile.sync_bundled_skills', error)
    }
    let logDirectory = this.directories.profileLogsPath(normalizedProfile)
    try {
      logDirectory = this.directories.profileLogsDirectory(normalizedProfile)
      const selfCheck = this.recovery.selfCheckAndResolve('logs', normalizedProfile)
      if (!selfCheck.ok) {
        this.recovery.recordLogsFailure(
          normalizedProfile,
          'profile.validate_log_directory',
          new Error(selfCheck.checks.filter(check => !check.ok).map(check => check.detail).join('; ')),
        )
      }
    } catch (error) {
      this.recovery.recordLogsFailure(normalizedProfile, 'profile.initialize_log_directory', error)
    }
    const layout = {
      profile: normalizedProfile,
      skillDirectory,
      logDirectory,
      workspaceDirectory: this.directories.profileWorkspaceDirectory(normalizedProfile),
    }
    this.profileLayouts.set(normalizedProfile, layout)
    return layout
  }

  profile(profile = 'default'): HubAgentProfileDirectoryLayout {
    const normalizedProfile = String(profile || '').trim() || 'default'
    const layout = this.profileLayouts.get(normalizedProfile)
    if (!layout) {
      throw new Error(`Hub Agent profile is not set up: ${normalizedProfile}`)
    }
    return layout
  }

  profiles(): HubAgentProfileDirectoryLayout[] {
    return this.agent.list().map(profileAgent => profileAgent.layout)
  }

  getAgent(profile = 'default'): HubAgentProfileAgent {
    return this.agent.get(profile)
  }

  get toolApprovals(): HubAgentToolApprovalService {
    return this.currentToolApprovals
  }

  modelProviderConfig(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
  ): ModelProviderConfig {
    return resolveConfiguredModelProvider({
      ...input,
      config: this.config.read(),
    })
  }

  createModelClient(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
    clientOptions: ModelClientOptions = {},
  ): ModelClient {
    const config = this.config.read()
    const provider = String(input.provider || config.model.defaultProvider || '').trim()
    const providerSettings = config.model.providers[provider]
    if (
      provider &&
      input.apiKey === undefined &&
      (providerSettings?.authType === 'oauth' || !!config.model.authorizations[provider])
    ) {
      return new AuthorizedModelClient({
        config: this.config,
        authorizations: this.authorizations,
        provider,
        model: input.model,
        clientOptions,
      })
    }
    return createConfiguredModelClient({
      ...input,
      config,
      clientOptions,
    })
  }

  createRuntime(options: CreateHubAgentRuntimeOptions = {}): AgentRuntime {
    const {
      profile = 'default',
      provider,
      model,
      apiKey,
      clientOptions,
      memory,
      ...runtimeOverrides
    } = options
    const config = this.config.read()
    const profileLayout = this.ensureProfile(profile)
    const toolsEnabled = runtimeOverrides.toolsEnabled ?? config.tools.enabled
    const skillsEnabled = runtimeOverrides.skillsEnabled ?? config.skills.enabled
    const skillDirectory = runtimeOverrides.skillDirectory ?? profileLayout.skillDirectory
    const profileSkillConfig = config.skills.profiles[profileLayout.profile] ?? {
      disabled: [],
      externalDirectories: [],
    }
    const usesProfileSkillDirectory = skillDirectory === profileLayout.skillDirectory
    const externalSkillDirectories = runtimeOverrides.externalSkillDirectories
      ?? (usesProfileSkillDirectory
        ? resolveHubAgentExternalSkillDirectories(profileSkillConfig.externalDirectories, {
            localSkillDirectory: profileLayout.skillDirectory,
          })
        : [])
    const disabledSkillNames = runtimeOverrides.disabledSkillNames
      ?? (usesProfileSkillDirectory ? profileSkillConfig.disabled : [])
    const toolAuthorizer = runtimeOverrides.toolAuthorizer ?? this.toolApprovals.authorize
    const selectedProvider = String(provider || config.model.defaultProvider || '').trim()
    const modelClient = runtimeOverrides.modelClient ?? (selectedProvider
      ? this.createModelClient({ provider: selectedProvider, model, apiKey }, clientOptions)
      : undefined)
    const tools = runtimeOverrides.tools ?? (toolsEnabled
      ? this.tool.createRuntimeRegistry(
          profile,
          usesProfileSkillDirectory
            ? undefined
            : this.createProfileToolRegistry(
                profile,
                skillDirectory,
                externalSkillDirectories,
                disabledSkillNames,
              ),
        )
      : undefined)
    const modelDefaults = {
      ...modelRequestDefaultsFromConfig(config, provider),
      ...runtimeOverrides.modelDefaults,
      ...(model ? { model } : {}),
    }
    const configuredMcpServers = config.mcp.enabled
      ? config.mcp.profiles[profileLayout.profile]?.servers ?? {}
      : {}
    const toolContext = runtimeOverrides.toolContext?.mcpServers === undefined
      ? { ...runtimeOverrides.toolContext, mcpServers: configuredMcpServers }
      : runtimeOverrides.toolContext

    return new AgentRuntime({
      ...runtimeOverrides,
      jev: resolveHubAgentJevConfig(config.jev, this.jevOverrides, runtimeOverrides.jev),
      profileId: profile,
      modelClient,
      toolsEnabled,
      tools,
      toolAuthorizer,
      toolContext,
      skillsEnabled,
      skillsAvailable: runtimeOverrides.skillsAvailable ?? (() => (
        !this.diagnostics.get('skills', 'global') &&
        !this.diagnostics.get('skills', profileScope(profileLayout.profile))
      )),
      skills: runtimeOverrides.skills ?? this.skill.runtimeSkills(profile),
      skillDirectory,
      externalSkillDirectories,
      disabledSkillNames,
      skillReviewEveryToolCalls: runtimeOverrides.skillReviewEveryToolCalls
        ?? config.skills.reviewEveryToolCalls,
      runtimeInstructions: runtimeOverrides.runtimeInstructions ?? config.prompt.instructions,
      temporaryRuntimeInstructions: () => [
        ...(runtimeOverrides.temporaryRuntimeInstructions?.() ?? []),
        this.recovery.temporaryContext(profileLayout.profile) ?? '',
      ].filter(Boolean),
      recoveryDirective: runtimeOverrides.recoveryDirective ?? (() => (
        this.recovery.runtimeDirective(profileLayout.profile)
      )),
      maxSteps: runtimeOverrides.maxSteps ?? config.runtime.maxSteps,
      maxModelRetries: runtimeOverrides.maxModelRetries ?? config.runtime.maxModelRetries,
      toolFailureRecoveryThreshold: runtimeOverrides.toolFailureRecoveryThreshold
        ?? runtimeOverrides.maxConsecutiveToolFailures
        ?? config.runtime.toolFailureRecoveryThreshold,
      backgroundDelegationEnabled: runtimeOverrides.backgroundDelegationEnabled
        ?? config.delegation.backgroundEnabled,
      subtaskMaxSteps: runtimeOverrides.subtaskMaxSteps ?? config.delegation.subtaskMaxSteps,
      modelDefaults,
      memory: memory === false
        ? undefined
        : memory ?? (config.memory.enabled ? this.memory : undefined),
      logWriter: runtimeOverrides.logWriter ?? new HubAgentFileLogger({
        directory: profileLayout.logDirectory,
        maxBytes: config.logging.maxBytes,
        onError: error => this.recovery.recordLogsFailure(
          profileLayout.profile,
          'runtime.write_log',
          error,
        ),
      }),
      logProfile: runtimeOverrides.logProfile ?? profile,
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.unsubscribeConfig()
    this.memory.close()
  }

  private createToolApprovals(config: HubAgentConfig): HubAgentToolApprovalService {
    return new HubAgentToolApprovalService({
      configPath: this.layout.configPath,
      enabled: config.tools.approvals.enabled,
      timeoutMs: config.tools.approvals.timeoutMs,
    })
  }

  private createProfileAgent(profile: string): HubAgentProfileAgent {
    this.config.ensureDefaults()
    const profileLayout = this.ensureProfileLayout(profile)
    return new HubAgentProfileAgent({
      profile: profileLayout.profile,
      layout: profileLayout,
      directories: this.directories,
      rootDirectory: this.layout.rootDirectory,
      skillsDirectory: this.layout.skillsDirectory,
      logsDirectory: this.layout.logsDirectory,
      workspaceDirectory: this.layout.workspaceDirectory,
      config: this.config,
      database: this.database,
      memoryStore: this.memoryStore,
      memory: this.memory,
      conversations: this.conversations,
      authorization: this.authorizations,
      model: this.model,
      tools: this.tool,
      skills: this.skill,
      toolApprovals: () => this.toolApprovals,
      createRuntime: options => this.createRuntime(options),
      onLogError: error => this.recovery.recordLogsFailure(
        profileLayout.profile,
        'profile.write_log',
        error,
      ),
    })
  }

  private attachProfileAgent(profileAgent: HubAgentProfileAgent): void {
    const profile = profileAgent.profile
    if (profile === 'default' || profile in this) return
    Object.defineProperty(this, profile, {
      configurable: true,
      enumerable: true,
      get: () => this.agent.find(profile),
    })
    this.directProfileProperties.add(profile)
  }

  private detachProfileAgent(profileAgent: HubAgentProfileAgent): void {
    if (!this.directProfileProperties.delete(profileAgent.profile)) return
    delete (this as Record<string, unknown>)[profileAgent.profile]
  }

  private createProfileToolRegistry(
    profile: string,
    skillDirectory?: string,
    externalSkillDirectories = resolveHubAgentExternalSkillDirectories(
      this.config.getSkillProfile(profile).externalDirectories,
      { localSkillDirectory: this.ensureProfile(profile).skillDirectory },
    ),
    disabledSkillNames = this.config.getSkillProfile(profile).disabled,
  ) {
    const config = this.config.read()
    const profileLayout = this.ensureProfile(profile)
    return createDefaultToolRegistry({
      skillDirectory: skillDirectory ?? profileLayout.skillDirectory,
      externalSkillDirectories,
      disabledSkillNames,
      authorizer: (name, input, context) => this.toolApprovals.authorize(name, input, context),
      executionTimeoutMs: config.tools.executionTimeoutMs,
      computerUse: config.tools.computerUse,
      codeExec: {
        enabled: config.tools.codeExec.enabled,
        allowedLanguages: config.tools.codeExec.languages,
        timeoutMs: config.tools.codeExec.timeoutMs,
        maxToolCalls: config.tools.codeExec.maxToolCalls,
        maxOutputBytes: config.tools.codeExec.maxOutputBytes,
        maxStderrBytes: config.tools.codeExec.maxStderrBytes,
        maxSourceBytes: config.tools.codeExec.maxSourceBytes,
      },
      recovery: this.recovery,
    })
  }

  private createMemoryService(config: HubAgentConfig, store = this.memoryStore): MemoryService {
    const ephemeral = this.database.databasePath === ':memory:'
    return new MemoryService({
      store,
      enabled: config.memory.enabled,
      storageMode: ephemeral ? 'ephemeral' : 'persistent',
      ...(ephemeral ? {
        warning: 'Persistent Hub Agent memory is unavailable; the active store is ephemeral and cannot establish whether durable memories exist.',
      } : {}),
      recentMessageLimit: config.memory.recentMessageLimit,
      automaticRecallTokenBudget: config.memory.automaticRecallTokenBudget,
      searchResultLimit: config.memory.searchResultLimit,
      onWarning: error => this.recovery.recordMemoryFailure('runtime.memory_operation', error),
    })
  }
}

/**
 * Public all-in-one facade. Namespaced stores remain available for callers
 * that prefer `agent.config`, `agent.authorizations`, or `agent.memory`.
 */
export class HubAgent extends HubAgentSetup {
  readConfig(): HubAgentConfig {
    return this.config.read()
  }

  updateConfig(patch: HubAgentConfigPatch): HubAgentConfig {
    return this.config.update(patch)
  }

  replaceConfig(config: HubAgentConfig): HubAgentConfig {
    return this.config.replace(config)
  }

  resetConfig(): HubAgentConfig {
    return this.config.reset()
  }

  listModelProviderPresets(): HubAgentModelProviderPreset[] {
    return this.config.listModelProviderPresets()
  }

  getModelProviderPreset(id: string): HubAgentModelProviderPreset | undefined {
    return this.config.getModelProviderPreset(id)
  }

  setModelProviderPreset(
    id: string,
    preset: Omit<HubAgentModelProviderPreset, 'id'> & { id?: string },
  ): HubAgentConfig {
    return this.config.setModelProviderPreset(id, preset)
  }

  updateModelProviderPreset(id: string, patch: Partial<HubAgentModelProviderPreset>): HubAgentConfig {
    return this.config.updateModelProviderPreset(id, patch)
  }

  deleteModelProviderPreset(id: string): boolean {
    return this.config.deleteModelProviderPreset(id)
  }

  installModelProviderPreset(
    id: string,
    options: InstallModelProviderPresetOptions = {},
  ): HubAgentConfig {
    return this.config.installModelProviderPreset(id, options)
  }

  listModelProviders(): ConfiguredModelProviderEntry[] {
    return this.config.listModelProviders()
  }

  getModelProvider(id: string): HubAgentModelProviderSettings | undefined {
    return this.config.getModelProvider(id)
  }

  setModelProvider(id: string, settings: HubAgentModelProviderSettings): HubAgentConfig {
    return this.config.setModelProvider(id, settings)
  }

  updateModelProvider(id: string, patch: Partial<HubAgentModelProviderSettings>): HubAgentConfig {
    return this.config.updateModelProvider(id, patch)
  }

  deleteModelProvider(id: string): boolean {
    return this.config.deleteModelProvider(id)
  }

  setDefaultModel(provider: string, model?: string): HubAgentConfig {
    return this.config.setDefaultModel(provider, model)
  }

  listModelAuthorizations(): ConfiguredModelAuthorizationEntry[] {
    return this.config.listModelAuthorizations()
  }

  getModelAuthorization(provider: string): HubAgentModelAuthorizationSettings | undefined {
    return this.authorizations.get(provider)
  }

  setModelAuthorization(provider: string, settings: HubAgentModelAuthorizationSettings): HubAgentConfig {
    return this.authorizations.set(provider, settings)
  }

  updateModelAuthorization(
    provider: string,
    patch: Partial<HubAgentModelAuthorizationSettings>,
  ): HubAgentConfig {
    return this.authorizations.update(provider, patch)
  }

  deleteModelAuthorization(provider: string): boolean {
    return this.authorizations.delete(provider)
  }

  modelAuthorizationNeedsRefresh(provider: string): boolean {
    return this.authorizations.needsRefresh(provider)
  }

  refreshModelAuthorization(
    provider: string,
    model?: string,
  ): Promise<HubAgentModelAuthorizationCredentials> {
    return this.authorizations.refresh(provider, model)
  }

  resolveModelAuthorization(
    provider: string,
    model?: string,
  ): Promise<HubAgentModelAuthorizationCredentials> {
    return this.authorizations.resolve(provider, model)
  }
}

export function setupHubAgent(options: SetupHubAgentOptions = {}): HubAgent {
  return new HubAgent(options)
}
