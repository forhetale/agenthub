export type PrimaryAgentBridgeClient = Record<string, any>
export type PrimaryAgentBridgeContextEstimate = any
export type PrimaryAgentBridgeMessage = any
export type PrimaryAgentBridgeOutput = any
export type PrimaryAgentBridgeRunResult = any
export type ChatAgentMessage = any
export type ChatAgentClarificationRequest = any
export type ChatAgentOutputMessage = any
export type ChatAgentToolCall = any
export type ChatAgentToolApprovalRequest = any
export type ChatAgentToolResult = any
export type ChatModelClient = any
export type ChatModelEvent = any
export type ChatAgentRuntimeEvent = any
export type ChatModelProviderConfig = any
export type ChatModelReasoningEffort = any
export type ChatModelRequest = any
export type ChatModelResponse = any

export interface ChatAgentRuntimeDependencies {
  projectBrowserHistory?<T extends { role: string; content: unknown; name?: string | null; tool_name?: string | null }>(messages: T[], options?: { truncateOtherTools?: (content: string) => string }): T[]
  createPrimaryAgentBridge(options?: Record<string, unknown>): PrimaryAgentBridgeClient
  getPrimaryAgentBridgeManager(): any
  redactPrimaryAgentBridgeError(error: string | undefined, endpoint?: string, replacement?: string): string | undefined
  codingAgentRunManager: Record<string, any>
  sendCodingAgentRunInput(...args: any[]): any
  startCodingAgentRun(...args: any[]): any
  handleCodingAgentSessionCommand(...args: any[]): Promise<any>
  parseCodingAgentSessionCommand(...args: any[]): any
  getHubAgent(profile: string): any
  abortHubAgentBackgroundTasks(...args: any[]): Promise<any>
  hasHubAgentBackgroundTasks(...args: any[]): boolean
  createHubAgentModelClient(...args: any[]): any
  resolveHubAgentModelProviderConfigs(...args: any[]): any
  hubAgentModelRequestTimeoutMs: number
  hubAgentReasoningText(...args: any[]): string
  normalizeHubAgentReasoning(...args: any[]): any
  serializeHubAgentReasoningDetails(...args: any[]): any
  pendingHubAgentInteractions(sessionId: string): Array<{ event: string; data: any }>
  waitForHubAgentToolApproval(...args: any[]): Promise<any>
  waitForHubAgentClarification(...args: any[]): Promise<any>
  getCodingAgentMcpServers(id: string, profile: string): Record<string, unknown>
  resolveHubAgentMcpServers(...args: any[]): any
  resolveHubAgentProviderRuntimeConfig(...args: any[]): Promise<any>
  createHubAgentAuthorizedProviderFetch(...args: any[]): any
  respondToHubAgentToolApproval(...args: any[]): any
  respondToHubAgentClarification(...args: any[]): any
}

let dependencies: ChatAgentRuntimeDependencies | null = null

export function projectChatBrowserHistory<T extends { role: string; content: unknown; name?: string | null; tool_name?: string | null }>(messages: T[], options?: { truncateOtherTools?: (content: string) => string }): T[] {
  return dependencies?.projectBrowserHistory?.(messages, options) ?? messages.map(message => message.role === 'tool' && typeof message.content === 'string' && options?.truncateOtherTools
    ? { ...message, content: options.truncateOtherTools(message.content) } : message)
}

export function configureChatAgentRuntime(next: ChatAgentRuntimeDependencies): void {
  dependencies = next
}

function configured(): ChatAgentRuntimeDependencies {
  if (!dependencies) throw new Error('Studio chat Agent runtime has not been configured')
  return dependencies
}

export const createPrimaryAgentBridge = (options?: Record<string, unknown>) => (
  configured().createPrimaryAgentBridge(options)
)
export const getPrimaryAgentBridgeManager = () => configured().getPrimaryAgentBridgeManager()
export const redactPrimaryAgentBridgeError = (
  error: string | undefined,
  endpoint?: string,
  replacement?: string,
) => configured().redactPrimaryAgentBridgeError(error, endpoint, replacement)

export const chatCodingAgentRunManager = {
  waitForSessionExit: (...args: any[]) => configured().codingAgentRunManager.waitForSessionExit(...args),
  hasSession: (...args: any[]) => configured().codingAgentRunManager.hasSession(...args),
  stop: (...args: any[]) => configured().codingAgentRunManager.stop(...args),
  isSessionLaunchCompatible: (...args: any[]) => configured().codingAgentRunManager.isSessionLaunchCompatible(...args),
  isSessionProcessing: (...args: any[]) => configured().codingAgentRunManager.isSessionProcessing(...args),
  runIdForSession: (...args: any[]) => configured().codingAgentRunManager.runIdForSession(...args),
  interruptForQueueInsertion: (...args: any[]) => configured().codingAgentRunManager.interruptForQueueInsertion(...args),
  resolveApproval: (...args: any[]) => configured().codingAgentRunManager.resolveApproval(...args),
  resolveClarification: (...args: any[]) => configured().codingAgentRunManager.resolveClarification(...args),
}

export const sendChatCodingAgentRunInput = (...args: any[]) => configured().sendCodingAgentRunInput(...args)
export const startChatCodingAgentRun = (...args: any[]) => configured().startCodingAgentRun(...args)
export const handleChatCodingAgentSessionCommand = (...args: any[]) => configured().handleCodingAgentSessionCommand(...args)
export const parseChatCodingAgentSessionCommand = (...args: any[]) => configured().parseCodingAgentSessionCommand(...args)

export const getChatHubAgent = (profile: string) => configured().getHubAgent(profile)
export const abortChatHubAgentBackgroundTasks = (...args: any[]) => configured().abortHubAgentBackgroundTasks(...args)
export const hasChatHubAgentBackgroundTasks = (...args: any[]) => configured().hasHubAgentBackgroundTasks(...args)
export const createChatHubAgentModelClient = (...args: any[]) => configured().createHubAgentModelClient(...args)
export const resolveChatHubAgentModelProviderConfigs = (...args: any[]) => configured().resolveHubAgentModelProviderConfigs(...args)
export const getChatHubAgentModelRequestTimeoutMs = () => configured().hubAgentModelRequestTimeoutMs
export const chatHubAgentReasoningText = (...args: any[]) => configured().hubAgentReasoningText(...args)
export const normalizeChatHubAgentReasoning = (...args: any[]) => configured().normalizeHubAgentReasoning(...args)
export const serializeChatHubAgentReasoningDetails = (...args: any[]) => configured().serializeHubAgentReasoningDetails(...args)
export const waitForChatHubAgentToolApproval = (...args: any[]) => configured().waitForHubAgentToolApproval(...args)
export const waitForChatHubAgentClarification = (...args: any[]) => configured().waitForHubAgentClarification(...args)
export const resolveChatHubAgentMcpServers = (...args: any[]) => configured().resolveHubAgentMcpServers(...args)
export const resolveChatHubAgentProviderRuntimeConfig = (...args: any[]) => configured().resolveHubAgentProviderRuntimeConfig(...args)
export const createChatHubAgentAuthorizedProviderFetch = (...args: any[]) => configured().createHubAgentAuthorizedProviderFetch(...args)
export const respondToChatHubAgentToolApproval = (...args: any[]) => configured().respondToHubAgentToolApproval(...args)
export const respondToChatHubAgentClarification = (...args: any[]) => configured().respondToHubAgentClarification(...args)

export const getChatCodingAgentMcpServers = (id: string, profile: string) => configured().getCodingAgentMcpServers(id, profile)

export const pendingChatHubAgentInteractions = (sessionId: string): Array<{ event: string; data: any }> => configured().pendingHubAgentInteractions(sessionId)
