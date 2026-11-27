import type { AgentMessageRole, AgentToolCall, ModelUsage } from '../model/types'

export interface HubAgentSession {
  id: string
  profile: string
  source: string
  agent: string
  agentMode: string
  agentSessionId: string
  agentNativeSessionId: string
  userId: string | null
  model: string
  provider: string
  apiMode: string
  title: string | null
  parentSessionId: string | null
  forkPointMessageId: string | null
  startedAt: number
  endedAt: number | null
  endReason: string | null
  messageCount: number
  toolCallCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  billingProvider: string | null
  estimatedCostUsd: number
  actualCostUsd: number | null
  costStatus: string
  preview: string
  lastActive: number
  isArchived: boolean
  workspace: string | null
  categoryId: number | null
  historyRevision: number
}

export interface CreateHubAgentSessionInput {
  id?: string
  profile?: string
  source?: string
  agent?: string
  agentMode?: string
  agentSessionId?: string
  agentNativeSessionId?: string
  userId?: string | null
  model?: string
  provider?: string
  apiMode?: string
  title?: string | null
  parentSessionId?: string | null
  workspace?: string | null
  categoryId?: number | null
  startedAt?: number
}

export type UpdateHubAgentSessionInput = Partial<Pick<HubAgentSession,
  | 'source'
  | 'agent'
  | 'agentMode'
  | 'agentSessionId'
  | 'agentNativeSessionId'
  | 'userId'
  | 'model'
  | 'provider'
  | 'apiMode'
  | 'title'
  | 'parentSessionId'
  | 'forkPointMessageId'
  | 'endedAt'
  | 'endReason'
  | 'billingProvider'
  | 'estimatedCostUsd'
  | 'actualCostUsd'
  | 'costStatus'
  | 'preview'
  | 'lastActive'
  | 'isArchived'
  | 'workspace'
  | 'categoryId'
>>

export interface ListHubAgentSessionsInput {
  profile?: string
  source?: string
  agent?: string
  search?: string
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export interface HubAgentMessage {
  id: number
  sessionId: string
  role: AgentMessageRole
  content: string
  displayRole: string | null
  displayContent: string | null
  toolCallId: string | null
  toolCalls: AgentToolCall[] | null
  toolName: string | null
  timestamp: number
  tokenCount: number | null
  finishReason: string | null
  reasoning: string | null
  reasoningDetails: unknown
  reasoningContent: string | null
}

export interface AddHubAgentMessageInput {
  sessionId: string
  role: AgentMessageRole
  content?: string
  displayRole?: string | null
  displayContent?: string | null
  toolCallId?: string | null
  toolCalls?: AgentToolCall[] | null
  toolName?: string | null
  timestamp?: number
  tokenCount?: number | null
  finishReason?: string | null
  reasoning?: string | null
  reasoningDetails?: unknown
  reasoningContent?: string | null
}

export type UpdateHubAgentMessageInput = Partial<Pick<HubAgentMessage,
  | 'role'
  | 'content'
  | 'displayRole'
  | 'displayContent'
  | 'toolCallId'
  | 'toolCalls'
  | 'toolName'
  | 'timestamp'
  | 'tokenCount'
  | 'finishReason'
  | 'reasoning'
  | 'reasoningDetails'
  | 'reasoningContent'
>>

export interface ListHubAgentMessagesInput {
  limit?: number
  offset?: number
  afterId?: number
  beforeId?: number
  roles?: AgentMessageRole[]
}

export interface HubAgentSessionDetail extends HubAgentSession {
  messages: HubAgentMessage[]
}

export interface HubAgentSessionUsageUpdate extends ModelUsage {
  billingProvider?: string
  estimatedCostUsd?: number
  actualCostUsd?: number | null
  costStatus?: string
}
