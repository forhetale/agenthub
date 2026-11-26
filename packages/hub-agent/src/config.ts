import type {
  ModelCapabilities,
  ModelProviderType,
  ModelReasoningEffort,
  ModelReasoningSummary,
  ModelRequestStyle,
  OpenAIChatReasoningReplayFormat,
} from './model/types'
import { DEFAULT_HUB_AGENT_JEV_CONFIG, type HubAgentJevConfig } from './jev/config'
import {
  BUILTIN_MODEL_PROVIDER_PRESETS,
  type HubAgentModelApiMode,
  type HubAgentModelProviderAuthType,
  type HubAgentModelProviderPreset,
} from './model/provider-presets'

export const HUB_AGENT_CONFIG_SCHEMA_VERSION = 15
export const HUB_AGENT_CONFIG_DIRECTORY_NAME = 'config'
export const HUB_AGENT_CONFIG_FILE_NAME = 'config.json'

export const DEFAULT_AGENT_MAX_STEPS = 90
export const DEFAULT_AGENT_MODEL_MAX_RETRIES = 3
export const DEFAULT_AGENT_TOOL_FAILURE_RECOVERY_THRESHOLD = 3
/** @deprecated Tool failures now trigger model recovery instead of terminating the run. */
export const DEFAULT_AGENT_MAX_CONSECUTIVE_TOOL_FAILURES = 6
export const DEFAULT_AGENT_SUBTASK_MAX_STEPS = 30
export const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 5 * 60 * 1_000
export const DEFAULT_MODEL_AUTHORIZATION_REFRESH_LEEWAY_MS = 5 * 60 * 1_000
export const DEFAULT_TOOL_EXECUTION_TIMEOUT_MS = 120_000
export const DEFAULT_TOOL_APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000
export const DEFAULT_CLARIFICATION_TIMEOUT_MS = 5 * 60 * 1_000
export const DEFAULT_CODE_EXEC_LANGUAGES = ['node', 'python'] as const
export const DEFAULT_CODE_EXEC_MAX_TOOL_CALLS = 50
export const DEFAULT_CODE_EXEC_MAX_OUTPUT_BYTES = 50_000
export const DEFAULT_CODE_EXEC_MAX_STDERR_BYTES = 10_000
export const DEFAULT_CODE_EXEC_MAX_SOURCE_BYTES = 200_000
export const DEFAULT_AUTOMATIC_MEMORY_TOKEN_BUDGET = 4_000
export const DEFAULT_MEMORY_RECENT_MESSAGE_LIMIT = 20
export const DEFAULT_MEMORY_SEARCH_RESULT_LIMIT = 50
export const DEFAULT_SKILL_REVIEW_TOOL_CALL_INTERVAL = 10
export const DEFAULT_HUB_AGENT_LOG_MAX_BYTES = 10 * 1024 * 1024
export const DEFAULT_COMPRESSION_THRESHOLD = 0.5
export const DEFAULT_COMPRESSION_TARGET_RATIO = 0.2
export const DEFAULT_COMPRESSION_PROTECT_LAST_N = 20
export const DEFAULT_COMPRESSION_PROTECT_FIRST_N = 3

export interface HubAgentRuntimeConfig {
  maxSteps: number
  maxModelRetries: number
  toolFailureRecoveryThreshold: number
  /** @deprecated Retained for persisted-config compatibility; it no longer terminates runs. */
  maxConsecutiveToolFailures: number
}

/**
 * Persisted provider settings owned by the user's `.hub-agent` directory.
 */
export interface HubAgentModelProviderSettings {
  label?: string
  type: ModelProviderType
  apiMode?: HubAgentModelApiMode
  requestStyle?: ModelRequestStyle
  openAIChatReasoningReplayFormat?: OpenAIChatReasoningReplayFormat
  baseUrl?: string
  endpointPath?: string
  defaultModel: string
  models?: string[]
  authType?: HubAgentModelProviderAuthType
  source?: 'builtin' | 'custom'
  apiKey?: string
  headers?: Record<string, string>
  timeoutMs?: number
  capabilities?: Partial<ModelCapabilities>
}

/** OAuth state owned by Hub Agent and persisted in the user-only config file. */
export interface HubAgentModelAuthorizationSettings {
  type: 'oauth'
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  obtainedAt?: string
  tokenUrl?: string
  clientId?: string
  clientSecret?: string
  scope?: string
  tokenParams?: Record<string, string>
  baseUrl?: string
  apiMode?: HubAgentModelApiMode
}

export interface HubAgentModelConfig {
  defaultProvider: string
  defaultModel: string
  requestTimeoutMs: number
  temperature?: number
  maxTokens?: number
  reasoningEffort: ModelReasoningEffort
  reasoningSummary: ModelReasoningSummary
  authorizationRefreshLeewayMs: number
  providerCatalog: Record<string, HubAgentModelProviderPreset>
  disabledProviderPresets: string[]
  providers: Record<string, HubAgentModelProviderSettings>
  authorizations: Record<string, HubAgentModelAuthorizationSettings>
}

export interface HubAgentToolApprovalConfig {
  enabled: boolean
  timeoutMs: number
  permanentAllow: string[]
}

export interface HubAgentCodeExecConfig {
  enabled: boolean
  languages: Array<typeof DEFAULT_CODE_EXEC_LANGUAGES[number]>
  timeoutMs: number
  maxToolCalls: number
  maxOutputBytes: number
  maxStderrBytes: number
  maxSourceBytes: number
}

export interface HubAgentComputerUseConfig {
  enabled: boolean
  timeoutMs: number
}

export interface HubAgentToolsConfig {
  enabled: boolean
  executionTimeoutMs: number
  approvals: HubAgentToolApprovalConfig
  codeExec: HubAgentCodeExecConfig
  computerUse: HubAgentComputerUseConfig
}

export interface HubAgentMcpServerConfig {
  type?: 'stdio' | 'streamable_http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled: boolean
}

export interface HubAgentMcpProfileConfig {
  servers: Record<string, HubAgentMcpServerConfig>
}

/** Profile-scoped MCP servers persisted in Hub Agent's canonical config file. */
export interface HubAgentMcpConfig {
  enabled: boolean
  profiles: Record<string, HubAgentMcpProfileConfig>
}

export interface HubAgentDelegationConfig {
  backgroundEnabled: boolean
  subtaskMaxSteps: number
}

/**
 * Host-owned conversation compression policy. Hub Agent exposes the policy through
 * its global config; a host with durable conversation history applies it
 * before starting a runtime turn.
 */
export interface HubAgentCompressionConfig {
  enabled: boolean
  threshold: number
  targetRatio: number
  protectLastN: number
  protectFirstN: number
}

export interface HubAgentMemoryConfig {
  enabled: boolean
  recentMessageLimit: number
  automaticRecallTokenBudget: number
  searchResultLimit: number
}

export interface HubAgentSkillsProfileConfig {
  /** Skill names excluded from runtime discovery for this Profile. */
  disabled: string[]
  /** External Skill roots referenced without copying them into Hub Agent storage. */
  externalDirectories: string[]
}

export interface HubAgentSkillsConfig {
  enabled: boolean
  reviewEveryToolCalls: number
  profiles: Record<string, HubAgentSkillsProfileConfig>
}

export interface HubAgentLoggingConfig {
  maxBytes: number
}

export interface HubAgentPromptConfig {
  instructions: string[]
}

export interface HubAgentConfig {
  schemaVersion: number
  runtime: HubAgentRuntimeConfig
  model: HubAgentModelConfig
  tools: HubAgentToolsConfig
  mcp: HubAgentMcpConfig
  delegation: HubAgentDelegationConfig
  compression: HubAgentCompressionConfig
  memory: HubAgentMemoryConfig
  jev: HubAgentJevConfig
  skills: HubAgentSkillsConfig
  logging: HubAgentLoggingConfig
  prompt: HubAgentPromptConfig
}

export type HubAgentConfigPatch = {
  schemaVersion?: number
  runtime?: Partial<HubAgentRuntimeConfig>
  model?: Partial<Omit<HubAgentModelConfig, 'providerCatalog' | 'disabledProviderPresets' | 'providers' | 'authorizations'>> & {
    providerCatalog?: Record<string, HubAgentModelProviderPreset>
    disabledProviderPresets?: string[]
    providers?: Record<string, HubAgentModelProviderSettings>
    authorizations?: Record<string, HubAgentModelAuthorizationSettings>
  }
  tools?: Partial<Omit<HubAgentToolsConfig, 'approvals' | 'codeExec' | 'computerUse'>> & {
    approvals?: Partial<HubAgentToolApprovalConfig>
    codeExec?: Partial<HubAgentCodeExecConfig>
    computerUse?: Partial<HubAgentComputerUseConfig>
  }
  mcp?: Partial<Omit<HubAgentMcpConfig, 'profiles'>> & {
    profiles?: Record<string, HubAgentMcpProfileConfig>
  }
  delegation?: Partial<HubAgentDelegationConfig>
  compression?: Partial<HubAgentCompressionConfig>
  memory?: Partial<HubAgentMemoryConfig>
  jev?: Partial<HubAgentJevConfig>
  skills?: Partial<Omit<HubAgentSkillsConfig, 'profiles'>> & {
    profiles?: Record<string, Partial<HubAgentSkillsProfileConfig>>
  }
  logging?: Partial<HubAgentLoggingConfig>
  prompt?: Partial<HubAgentPromptConfig>
}

/**
 * Initial global configuration. Existing files are reconciled recursively, so
 * newly introduced leaves are added without replacing user-owned siblings.
 */
export const DEFAULT_HUB_AGENT_CONFIG: HubAgentConfig = {
  schemaVersion: HUB_AGENT_CONFIG_SCHEMA_VERSION,
  runtime: {
    maxSteps: DEFAULT_AGENT_MAX_STEPS,
    maxModelRetries: DEFAULT_AGENT_MODEL_MAX_RETRIES,
    toolFailureRecoveryThreshold: DEFAULT_AGENT_TOOL_FAILURE_RECOVERY_THRESHOLD,
    maxConsecutiveToolFailures: DEFAULT_AGENT_MAX_CONSECUTIVE_TOOL_FAILURES,
  },
  model: {
    defaultProvider: '',
    defaultModel: '',
    requestTimeoutMs: DEFAULT_MODEL_REQUEST_TIMEOUT_MS,
    reasoningEffort: 'medium',
    reasoningSummary: 'auto',
    authorizationRefreshLeewayMs: DEFAULT_MODEL_AUTHORIZATION_REFRESH_LEEWAY_MS,
    providerCatalog: structuredClone(BUILTIN_MODEL_PROVIDER_PRESETS),
    disabledProviderPresets: [],
    providers: {},
    authorizations: {},
  },
  tools: {
    enabled: true,
    executionTimeoutMs: DEFAULT_TOOL_EXECUTION_TIMEOUT_MS,
    computerUse: { enabled: true, timeoutMs: 30_000 },
    approvals: {
      enabled: true,
      timeoutMs: DEFAULT_TOOL_APPROVAL_TIMEOUT_MS,
      permanentAllow: [],
    },
    codeExec: {
      enabled: true,
      languages: [...DEFAULT_CODE_EXEC_LANGUAGES],
      timeoutMs: DEFAULT_TOOL_EXECUTION_TIMEOUT_MS,
      maxToolCalls: DEFAULT_CODE_EXEC_MAX_TOOL_CALLS,
      maxOutputBytes: DEFAULT_CODE_EXEC_MAX_OUTPUT_BYTES,
      maxStderrBytes: DEFAULT_CODE_EXEC_MAX_STDERR_BYTES,
      maxSourceBytes: DEFAULT_CODE_EXEC_MAX_SOURCE_BYTES,
    },
  },
  mcp: {
    enabled: true,
    profiles: {},
  },
  delegation: {
    backgroundEnabled: true,
    subtaskMaxSteps: DEFAULT_AGENT_SUBTASK_MAX_STEPS,
  },
  compression: {
    enabled: true,
    threshold: DEFAULT_COMPRESSION_THRESHOLD,
    targetRatio: DEFAULT_COMPRESSION_TARGET_RATIO,
    protectLastN: DEFAULT_COMPRESSION_PROTECT_LAST_N,
    protectFirstN: DEFAULT_COMPRESSION_PROTECT_FIRST_N,
  },
  memory: {
    enabled: true,
    recentMessageLimit: DEFAULT_MEMORY_RECENT_MESSAGE_LIMIT,
    automaticRecallTokenBudget: DEFAULT_AUTOMATIC_MEMORY_TOKEN_BUDGET,
    searchResultLimit: DEFAULT_MEMORY_SEARCH_RESULT_LIMIT,
  },
  skills: {
    enabled: true,
    reviewEveryToolCalls: DEFAULT_SKILL_REVIEW_TOOL_CALL_INTERVAL,
    profiles: {},
  },
  jev: { ...DEFAULT_HUB_AGENT_JEV_CONFIG },
  logging: {
    maxBytes: DEFAULT_HUB_AGENT_LOG_MAX_BYTES,
  },
  prompt: {
    instructions: [],
  },
}

export function serializeDefaultHubAgentConfig(): string {
  return `${JSON.stringify(DEFAULT_HUB_AGENT_CONFIG, null, 2)}\n`
}
