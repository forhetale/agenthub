import { request } from '@/api/client'

export type HubAgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type HubAgentReasoningSummary = 'auto' | 'concise' | 'detailed'
export type HubAgentCodeExecLanguage = 'node' | 'python'

export interface HubAgentSettingsConfig {
  runtime: {
    maxSteps: number
    maxModelRetries: number
    toolFailureRecoveryThreshold: number
    /** @deprecated Retained for older Hub Agent config files. */
    maxConsecutiveToolFailures: number
  }
  model: {
    defaultProvider: string
    defaultModel: string
    requestTimeoutMs: number
    temperature: number | null
    maxTokens: number | null
    reasoningEffort: HubAgentReasoningEffort
    reasoningSummary: HubAgentReasoningSummary
    authorizationRefreshLeewayMs: number
  }
  tools: {
    enabled: boolean
    executionTimeoutMs: number
    computerUse: {
      enabled: boolean
      timeoutMs: number
    }
    approvals: {
      enabled: boolean
      timeoutMs: number
      permanentAllow: string[]
    }
    codeExec: {
      enabled: boolean
      languages: HubAgentCodeExecLanguage[]
      timeoutMs: number
      maxToolCalls: number
      maxOutputBytes: number
      maxStderrBytes: number
      maxSourceBytes: number
    }
  }
  mcp: { enabled: boolean }
  delegation: {
    backgroundEnabled: boolean
    subtaskMaxSteps: number
  }
  compression: {
    enabled: boolean
    threshold: number
    targetRatio: number
    protectLastN: number
    protectFirstN: number
  }
  memory: {
    enabled: boolean
    recentMessageLimit: number
    automaticRecallTokenBudget: number
    searchResultLimit: number
  }
  skills: {
    enabled: boolean
    reviewEveryToolCalls: number
  }
  logging: { maxBytes: number }
  prompt: { instructions: string[] }
}

export interface HubAgentSettingsProvider {
  id: string
  label: string
  defaultModel: string
  models: string[]
  authorizationConfigured: boolean
}

export interface HubAgentSettingsSnapshot {
  schemaVersion: number
  configPath: string
  config: HubAgentSettingsConfig
  providers: HubAgentSettingsProvider[]
  runtimeRefresh?: { refreshed: number; deferred: number }
}

export async function fetchHubAgentSettings(): Promise<HubAgentSettingsSnapshot> {
  return request<HubAgentSettingsSnapshot & { ok: boolean }>('/api/hub-agent/config')
}

export async function saveHubAgentSettings(config: HubAgentSettingsConfig): Promise<HubAgentSettingsSnapshot> {
  return request<HubAgentSettingsSnapshot & { ok: boolean }>('/api/hub-agent/config', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}
