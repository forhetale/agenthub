import type { HubAgentConversationStore } from '../conversations/store'
import type { HubAgentDirectoryManager } from '../directories'
import type {
  AddHubAgentMessageInput,
  CreateHubAgentSessionInput,
  HubAgentMessage,
  HubAgentSession,
  HubAgentSessionDetail,
  HubAgentSessionUsageUpdate,
  ListHubAgentMessagesInput,
  ListHubAgentSessionsInput,
  UpdateHubAgentMessageInput,
  UpdateHubAgentSessionInput,
} from '../conversations/types'
import type { HubAgentLogEntry, HubAgentLogQuery, HubAgentLogRecord } from '../logging/file-logger'
import { HubAgentFileLogger } from '../logging/file-logger'
import type { MemoryCaptureMessage, MemoryService } from '../memory/service'
import type {
  MemoryAuditEvent,
  MemoryAuditQuery,
  MemoryBatchInput,
  MemoryBatchResult,
  MemoryContext,
  MemoryCreateInput,
  MemoryDeleteInput,
  MemoryExpireInput,
  MemoryForgetInput,
  MemoryForgetResult,
  MemoryMessage,
  MemoryMessageListInput,
  MemoryNode,
  MemoryWriteInput,
  MemoryWriteResult,
  MemoryQuery,
  MemoryQueryResult,
  MemoryRuntimeIdentity,
  MemoryUpdateInput,
} from '../memory/types'
import type { AgentRuntime } from '../runtime/runtime'
import type { CreateHubAgentRuntimeOptions } from '../setup'
import type { HubAgentProfileDirectoryLayout } from '../setup'
import type {
  HubAgentSkillCreateInput,
  HubAgentSkillEditInput,
  HubAgentSkillManager,
  HubAgentSkillOperationOptions,
  HubAgentSkillPatchInput,
  HubAgentSkillSupportFileInput,
} from '../skills/manager'
import type { AgentSkill } from '../skills/types'
import type { SkillManageInput } from '../tools/skills'
import type { HubAgentToolManager } from '../tools/manager'
import type { AgentToolRegistry } from '../tools/registry'
import type {
  AgentTool,
  AgentToolContext,
  AgentToolProvider,
  AgentToolResult,
} from '../tools/types'

export type HubAgentProfileRuntimeOptions = Omit<CreateHubAgentRuntimeOptions, 'profile'>
export type HubAgentProfileSkillOperationOptions = Omit<HubAgentSkillOperationOptions, 'profile'>
export type HubAgentProfileSkillCreateInput = Omit<HubAgentSkillCreateInput, 'profile'>
export type HubAgentProfileSkillEditInput = Omit<HubAgentSkillEditInput, 'profile'>
export type HubAgentProfileSkillPatchInput = Omit<HubAgentSkillPatchInput, 'profile'>
export type HubAgentProfileSkillSupportFileInput = Omit<HubAgentSkillSupportFileInput, 'profile'>
export type HubAgentProfileMemoryIdentity = Omit<MemoryRuntimeIdentity, 'profileId'>
export type HubAgentProfileMemoryQuery = Omit<MemoryQuery, 'profileId'>
export type HubAgentProfileMemoryAuditQuery = Omit<MemoryAuditQuery, 'profileId'>
export type HubAgentProfileMemoryCreateInput = ProfileMemoryInput<MemoryCreateInput>
export type HubAgentProfileMemoryUpdateInput = ProfileMemoryInput<MemoryUpdateInput>
export type HubAgentProfileMemoryExpireInput = ProfileMemoryInput<MemoryExpireInput>
export type HubAgentProfileMemoryDeleteInput = ProfileMemoryInput<MemoryDeleteInput>
export type HubAgentProfileMemoryForgetInput = ProfileMemoryInput<MemoryForgetInput>
export type HubAgentProfileMemoryWriteInput = ProfileMemoryInput<MemoryWriteInput>
export type HubAgentProfileMemoryBatchInput = ProfileMemoryInput<MemoryBatchInput>

type ProfileMemoryInput<T extends { identity?: Partial<MemoryRuntimeIdentity> }> =
  Omit<T, 'identity'> & { identity?: Omit<Partial<MemoryRuntimeIdentity>, 'profileId'> }

/** Profile-bound filesystem locations exposed by `hubAgent.<profile>.directory`. */
export class HubAgentProfileDirectoryManager {
  readonly skillDirectory: string
  readonly logDirectory: string
  readonly workspaceDirectory: string

  constructor(
    readonly profile: string,
    private readonly directories: HubAgentDirectoryManager,
    layout?: HubAgentProfileDirectoryLayout,
  ) {
    this.skillDirectory = layout?.skillDirectory ?? directories.profileSkillsPath(profile)
    this.logDirectory = layout?.logDirectory ?? directories.profileLogsDirectory(profile)
    this.workspaceDirectory = layout?.workspaceDirectory ?? directories.profileWorkspaceDirectory(profile)
  }

  sessionWorkspaceDirectory(sessionId: string): string {
    return this.directories.sessionWorkspaceDirectory(this.profile, sessionId)
  }
}

/** Profile-bound tool operations exposed by `hubAgent.<profile>.tool`. */
export class HubAgentProfileToolManager {
  constructor(
    readonly profile: string,
    private readonly tools: HubAgentToolManager,
  ) {}

  registry(): AgentToolRegistry {
    return this.tools.registry(this.profile)
  }

  createRuntimeRegistry(): AgentToolRegistry {
    return this.tools.createRuntimeRegistry(this.profile)
  }

  definitions() {
    return this.tools.definitions(this.profile)
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name, this.profile)
  }

  register(tool: AgentTool): void {
    this.tools.register(tool, this.profile)
  }

  registerMany(tools: AgentTool[]): void {
    this.tools.registerMany(tools, this.profile)
  }

  unregister(name: string): boolean {
    return this.tools.unregister(name, this.profile)
  }

  registerProvider(provider: AgentToolProvider): void {
    this.tools.registerProvider(provider, this.profile)
  }

  unregisterProvider(providerId: string): boolean {
    return this.tools.unregisterProvider(providerId, this.profile)
  }

  refresh(context?: AgentToolContext): Promise<void> {
    return this.tools.refresh(profileContext(this.profile, context), this.profile)
  }

  execute(
    name: string,
    input: Record<string, unknown>,
    context?: AgentToolContext,
  ): Promise<AgentToolResult> {
    return this.tools.execute(name, input, profileContext(this.profile, context), this.profile)
  }
}

/** Profile-bound skill operations exposed by `hubAgent.<profile>.skill`. */
export class HubAgentProfileSkillManager {
  constructor(
    readonly profile: string,
    private readonly skills: HubAgentSkillManager,
  ) {}

  register(skill: AgentSkill): void {
    this.skills.register(skill, this.profile)
  }

  registerMany(skills: AgentSkill[]): void {
    this.skills.registerMany(skills, this.profile)
  }

  unregister(id: string): boolean {
    return this.skills.unregister(id, this.profile)
  }

  get(id: string): AgentSkill | undefined {
    return this.skills.get(id, this.profile)
  }

  registered(): AgentSkill[] {
    return this.skills.registered(this.profile)
  }

  discover(query = '', options: HubAgentProfileSkillOperationOptions = {}): Promise<AgentToolResult> {
    return this.skills.discover(query, { ...options, profile: this.profile })
  }

  view(
    name: string,
    filePath?: string,
    options: HubAgentProfileSkillOperationOptions = {},
  ): Promise<AgentToolResult> {
    return this.skills.view(name, filePath, { ...options, profile: this.profile })
  }

  create(input: HubAgentProfileSkillCreateInput): Promise<AgentToolResult> {
    return this.skills.create({ ...input, profile: this.profile })
  }

  edit(input: HubAgentProfileSkillEditInput): Promise<AgentToolResult> {
    return this.skills.edit({ ...input, profile: this.profile })
  }

  patch(input: HubAgentProfileSkillPatchInput): Promise<AgentToolResult> {
    return this.skills.patch({ ...input, profile: this.profile })
  }

  delete(
    name: string,
    options: HubAgentProfileSkillOperationOptions & { confirmed: boolean },
  ): Promise<AgentToolResult> {
    return this.skills.delete(name, { ...options, profile: this.profile })
  }

  writeFile(
    input: HubAgentProfileSkillSupportFileInput & { fileContent: string },
  ): Promise<AgentToolResult> {
    return this.skills.writeFile({ ...input, profile: this.profile })
  }

  removeFile(input: HubAgentProfileSkillSupportFileInput): Promise<AgentToolResult> {
    return this.skills.removeFile({ ...input, profile: this.profile })
  }

  manage(
    input: SkillManageInput,
    options: HubAgentProfileSkillOperationOptions = {},
  ): Promise<AgentToolResult> {
    return this.skills.manage(input, { ...options, profile: this.profile })
  }

  runtimeSkills(): AgentSkill[] {
    return this.skills.runtimeSkills(this.profile)
  }
}

/** Profile-bound runtime factory exposed by `hubAgent.<profile>.runtime`. */
export class HubAgentProfileRuntimeManager {
  constructor(
    readonly profile: string,
    private readonly createRuntime: (options?: CreateHubAgentRuntimeOptions) => AgentRuntime,
  ) {}

  create(options: HubAgentProfileRuntimeOptions = {}): AgentRuntime {
    return this.createRuntime({ ...options, profile: this.profile })
  }
}

/** Profile-isolated memory operations exposed by `hubAgent.<profile>.memory`. */
export class HubAgentProfileMemoryManager {
  constructor(
    readonly profile: string,
    private readonly memory: MemoryService,
  ) {}

  get isEnabled(): boolean {
    return this.memory.isEnabled
  }

  captureMessages(
    identity: HubAgentProfileMemoryIdentity,
    messages: MemoryCaptureMessage[],
  ): Promise<string[]> {
    return this.memory.captureMessages(this.identity(identity), messages)
  }

  retrieve(
    identity: HubAgentProfileMemoryIdentity,
    queryText?: string,
    overrides: HubAgentProfileMemoryQuery = {},
  ): Promise<MemoryContext> {
    return this.memory.retrieve(this.identity(identity), queryText, this.query(overrides))
  }

  search(
    identity: HubAgentProfileMemoryIdentity,
    query: HubAgentProfileMemoryQuery,
  ): Promise<MemoryQueryResult> {
    return this.memory.search(this.identity(identity), this.query(query))
  }

  get(id: string, identity?: Partial<HubAgentProfileMemoryIdentity>): Promise<MemoryNode | undefined> {
    return this.memory.get(id, this.identity(identity))
  }

  list(query: HubAgentProfileMemoryQuery = {}): Promise<MemoryNode[]> {
    return this.memory.list(this.query(query))
  }

  create(input: HubAgentProfileMemoryCreateInput): Promise<MemoryWriteResult> {
    return this.memory.create(this.input(input))
  }

  update(id: string, input: HubAgentProfileMemoryUpdateInput): Promise<MemoryWriteResult> {
    return this.memory.update(id, this.input(input))
  }

  expire(id: string, input: HubAgentProfileMemoryExpireInput): Promise<MemoryWriteResult> {
    return this.memory.expire(id, this.input(input))
  }

  delete(id: string, input: HubAgentProfileMemoryDeleteInput): Promise<MemoryForgetResult> {
    return this.memory.delete(id, this.input(input))
  }

  listMessages(input: MemoryMessageListInput): Promise<MemoryMessage[]> {
    return this.memory.listMessages(input)
  }

  listAuditEvents(query: HubAgentProfileMemoryAuditQuery = {}): Promise<MemoryAuditEvent[]> {
    return this.memory.listAuditEvents({ ...query, profileId: this.profile })
  }

  write(input: HubAgentProfileMemoryWriteInput): Promise<MemoryWriteResult> {
    return this.memory.write(this.input(input))
  }

  applyBatch(input: HubAgentProfileMemoryBatchInput): Promise<MemoryBatchResult> {
    return this.memory.applyBatch(this.input(input))
  }

  forget(input: HubAgentProfileMemoryForgetInput): Promise<MemoryForgetResult> {
    return this.memory.forget(this.input(input))
  }

  scheduleCapture(
    identity: HubAgentProfileMemoryIdentity,
    messages: MemoryCaptureMessage[],
  ): void {
    this.memory.scheduleCapture(this.identity(identity), messages)
  }

  drain(): Promise<void> {
    return this.memory.drain()
  }

  contextPrompt(context: MemoryContext): string {
    return this.memory.contextPrompt(context)
  }

  private identity(identity: Partial<HubAgentProfileMemoryIdentity> = {}): MemoryRuntimeIdentity {
    return { ...identity, profileId: this.profile } as MemoryRuntimeIdentity
  }

  private query(query: HubAgentProfileMemoryQuery): MemoryQuery {
    return { ...query, profileId: this.profile }
  }

  private input<T extends { identity?: Omit<Partial<MemoryRuntimeIdentity>, 'profileId'> }>(input: T): T & {
    identity: Partial<MemoryRuntimeIdentity>
  } {
    return { ...input, identity: this.identity(input.identity) }
  }
}

/** Profile-isolated session and message operations exposed by `hubAgent.<profile>.conversation`. */
export class HubAgentProfileConversationManager {
  constructor(
    readonly profile: string,
    private readonly conversations: HubAgentConversationStore,
  ) {}

  createSession(input: Omit<CreateHubAgentSessionInput, 'profile'> = {}): HubAgentSession {
    return this.conversations.createSession({ ...input, profile: this.profile })
  }

  getSession(id: string): HubAgentSession | null {
    return this.ownedSession(id)
  }

  listSessions(input: Omit<ListHubAgentSessionsInput, 'profile'> = {}): HubAgentSession[] {
    return this.conversations.listSessions({ ...input, profile: this.profile })
  }

  updateSession(id: string, patch: UpdateHubAgentSessionInput): HubAgentSession | null {
    return this.ownedSession(id) ? this.conversations.updateSession(id, patch) : null
  }

  renameSession(id: string, title: string | null): HubAgentSession | null {
    return this.ownedSession(id) ? this.conversations.renameSession(id, title) : null
  }

  setSessionArchived(id: string, archived: boolean): HubAgentSession | null {
    return this.ownedSession(id) ? this.conversations.setSessionArchived(id, archived) : null
  }

  endSession(id: string, reason = 'completed', endedAt?: number): HubAgentSession | null {
    return this.ownedSession(id) ? this.conversations.endSession(id, reason, endedAt) : null
  }

  reopenSession(id: string): HubAgentSession | null {
    return this.ownedSession(id) ? this.conversations.reopenSession(id) : null
  }

  deleteSession(id: string): boolean {
    return this.ownedSession(id) ? this.conversations.deleteSession(id) : false
  }

  getSessionDetail(id: string, messages: ListHubAgentMessagesInput = {}): HubAgentSessionDetail | null {
    return this.ownedSession(id) ? this.conversations.getSessionDetail(id, messages) : null
  }

  addMessage(input: AddHubAgentMessageInput): HubAgentMessage {
    this.requireSession(input.sessionId)
    return this.conversations.addMessage(input)
  }

  addMessages(inputs: AddHubAgentMessageInput[]): HubAgentMessage[] {
    for (const input of inputs) this.requireSession(input.sessionId)
    return this.conversations.addMessages(inputs)
  }

  getMessage(id: number): HubAgentMessage | null {
    const message = this.conversations.getMessage(id)
    return message && this.ownedSession(message.sessionId) ? message : null
  }

  listMessages(sessionId: string, input: ListHubAgentMessagesInput = {}): HubAgentMessage[] {
    return this.ownedSession(sessionId) ? this.conversations.listMessages(sessionId, input) : []
  }

  updateMessage(id: number, patch: UpdateHubAgentMessageInput): HubAgentMessage | null {
    return this.getMessage(id) ? this.conversations.updateMessage(id, patch) : null
  }

  deleteMessage(id: number): boolean {
    return this.getMessage(id) ? this.conversations.deleteMessage(id) : false
  }

  clearMessages(sessionId: string): number {
    return this.ownedSession(sessionId) ? this.conversations.clearMessages(sessionId) : 0
  }

  recordSessionUsage(sessionId: string, usage: HubAgentSessionUsageUpdate): HubAgentSession | null {
    return this.ownedSession(sessionId)
      ? this.conversations.recordSessionUsage(sessionId, usage)
      : null
  }

  private ownedSession(id: string): HubAgentSession | null {
    const session = this.conversations.getSession(id)
    return session?.profile === this.profile ? session : null
  }

  private requireSession(id: string): HubAgentSession {
    const session = this.ownedSession(id)
    if (!session) throw new Error(`Hub Agent session is not owned by profile ${this.profile}: ${id}`)
    return session
  }
}

/** Profile-bound structured log reader/writer exposed by `hubAgent.<profile>.log`. */
export class HubAgentProfileLogManager {
  readonly filePath: string
  readonly maxBytes: number

  constructor(
    readonly profile: string,
    private readonly logger: HubAgentFileLogger,
  ) {
    this.filePath = logger.filePath
    this.maxBytes = logger.maxBytes
  }

  write(entry: Omit<HubAgentLogEntry, 'profile'>): boolean {
    return this.logger.write({ ...entry, profile: this.profile })
  }

  query(query: HubAgentLogQuery = {}): HubAgentLogRecord[] {
    return this.logger.query(query)
  }
}

function profileContext(profile: string, context?: AgentToolContext): AgentToolContext {
  return { ...context, profileId: profile }
}
