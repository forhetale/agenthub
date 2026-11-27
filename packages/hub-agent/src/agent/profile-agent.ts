import { statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { HubAgentConfigStore } from '../config-store'
import type { HubAgentConversationStore } from '../conversations/store'
import type { HubAgentDatabaseManager } from '../database'
import type { HubAgentDirectoryManager } from '../directories'
import type { HubAgentModelAuthorizationManager } from '../model/authorization'
import type { HubAgentModelManager } from '../model/manager'
import type { MemoryService } from '../memory/service'
import type { SqliteMemoryStore } from '../memory/store'
import type { AgentRuntime } from '../runtime/runtime'
import type { CreateHubAgentRuntimeOptions, HubAgentProfileDirectoryLayout } from '../setup'
import type { HubAgentSkillManager } from '../skills/manager'
import type { HubAgentToolApprovalService } from '../tools/approval'
import type { HubAgentToolManager } from '../tools/manager'
import { HubAgentFileLogger } from '../logging/file-logger'
import {
  HubAgentProfileConversationManager,
  HubAgentProfileDirectoryManager,
  HubAgentProfileLogManager,
  HubAgentProfileMemoryManager,
  HubAgentProfileRuntimeManager,
  HubAgentProfileSkillManager,
  HubAgentProfileToolManager,
} from './modules'

export interface HubAgentProfileAgentOptions {
  profile: string
  layout: HubAgentProfileDirectoryLayout
  directories: HubAgentDirectoryManager
  rootDirectory: string
  skillsDirectory: string
  logsDirectory: string
  workspaceDirectory: string
  config: HubAgentConfigStore
  database: HubAgentDatabaseManager
  memoryStore: SqliteMemoryStore
  memory: MemoryService
  conversations: HubAgentConversationStore
  authorization: HubAgentModelAuthorizationManager
  model: HubAgentModelManager
  tools: HubAgentToolManager
  skills: HubAgentSkillManager
  toolApprovals: () => HubAgentToolApprovalService
  createRuntime: (options?: CreateHubAgentRuntimeOptions) => AgentRuntime
  onLogError?: (error: unknown) => void
}

export interface HubAgentProfileAgentValidation {
  profile: string
  configSchemaVersion: number
  directories: {
    skill: string
    log: string
    workspace: string
  }
}

/** One independent module facade bound to exactly one Hub Agent profile. */
export class HubAgentProfileAgent {
  readonly id: string
  readonly name: string
  readonly profile: string
  readonly layout: HubAgentProfileDirectoryLayout
  readonly validation: HubAgentProfileAgentValidation
  readonly directory: HubAgentProfileDirectoryManager
  readonly directories: HubAgentProfileDirectoryManager
  readonly config: HubAgentConfigStore
  readonly database: HubAgentDatabaseManager
  readonly memoryStore: SqliteMemoryStore
  readonly authorization: HubAgentModelAuthorizationManager
  readonly authorizations: HubAgentModelAuthorizationManager
  readonly model: HubAgentModelManager
  readonly tool: HubAgentProfileToolManager
  readonly skill: HubAgentProfileSkillManager
  readonly memory: HubAgentProfileMemoryManager
  readonly conversation: HubAgentProfileConversationManager
  readonly conversations: HubAgentProfileConversationManager
  readonly runtime: HubAgentProfileRuntimeManager
  readonly log: HubAgentProfileLogManager
  readonly logger: HubAgentProfileLogManager
  private readonly getToolApprovals: () => HubAgentToolApprovalService

  constructor(options: HubAgentProfileAgentOptions) {
    const config = options.config.ensureDefaults()
    this.validation = validateProfileAgent(options, config.schemaVersion)
    this.id = options.profile
    this.name = options.profile
    this.profile = options.profile
    this.layout = options.layout
    this.directory = new HubAgentProfileDirectoryManager(
      this.profile,
      options.directories,
      options.layout,
    )
    this.directories = this.directory
    this.config = options.config
    this.database = options.database
    this.memoryStore = options.memoryStore
    this.authorization = options.authorization
    this.authorizations = options.authorization
    this.model = options.model
    this.tool = new HubAgentProfileToolManager(this.profile, options.tools)
    this.skill = new HubAgentProfileSkillManager(this.profile, options.skills)
    this.memory = new HubAgentProfileMemoryManager(this.profile, options.memory)
    this.conversation = new HubAgentProfileConversationManager(this.profile, options.conversations)
    this.conversations = this.conversation
    this.runtime = new HubAgentProfileRuntimeManager(this.profile, options.createRuntime)
    const logConfig = config.logging
    this.log = new HubAgentProfileLogManager(this.profile, new HubAgentFileLogger({
      directory: options.layout.logDirectory,
      maxBytes: logConfig.maxBytes,
      onError: options.onLogError,
    }))
    this.logger = this.log
    this.getToolApprovals = options.toolApprovals
  }

  get toolApprovals(): HubAgentToolApprovalService {
    return this.getToolApprovals()
  }

  createRuntime(options: Omit<CreateHubAgentRuntimeOptions, 'profile'> = {}): AgentRuntime {
    return this.runtime.create(options)
  }
}

function validateProfileAgent(
  options: HubAgentProfileAgentOptions,
  configSchemaVersion: number,
): HubAgentProfileAgentValidation {
  if (options.layout.profile !== options.profile) {
    throw new Error(`Hub Agent profile layout mismatch: ${options.profile} != ${options.layout.profile}`)
  }
  assertManagedDirectory('skill', options.layout.skillDirectory, options.skillsDirectory, false)
  assertManagedDirectory('log', options.layout.logDirectory, options.logsDirectory, false)
  assertManagedDirectory('workspace', options.layout.workspaceDirectory, options.workspaceDirectory)
  assertInsideRoot(options.layout.skillDirectory, options.rootDirectory)
  assertInsideRoot(options.layout.logDirectory, options.rootDirectory)
  assertInsideRoot(options.layout.workspaceDirectory, options.rootDirectory)
  return {
    profile: options.profile,
    configSchemaVersion,
    directories: {
      skill: options.layout.skillDirectory,
      log: options.layout.logDirectory,
      workspace: options.layout.workspaceDirectory,
    },
  }
}

function assertManagedDirectory(kind: string, path: string, parent: string, required = true): void {
  assertInsideRoot(path, parent)
  let isDirectory = false
  try {
    isDirectory = statSync(path).isDirectory()
  } catch {
    // The message below is deliberately stable for host diagnostics.
  }
  if (required && !isDirectory) throw new Error(`Hub Agent profile ${kind} directory is not usable: ${path}`)
}

function assertInsideRoot(path: string, root: string): void {
  const child = resolve(path)
  const parent = resolve(root)
  const offset = relative(parent, child)
  if (!offset || offset.startsWith('..') || resolve(parent, offset) !== child) {
    throw new Error(`Hub Agent profile directory is outside its managed root: ${path}`)
  }
}
