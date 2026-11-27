import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../../public/config'
import { safeFileStore } from '../../public/safe-file-store'

export interface JevSettings {
  groupSummaryReviewEnabled: boolean
  groupSummaryReviewMinConfidence: number
  groupSummaryRevisionEnabled: boolean
  groupSummaryReviewTimeoutMs: number
  workflowQualityEnabled: boolean
  workflowQualityMinConfidence: number
  workflowQualityTimeoutMs: number
  groupMessageRoutingEnabled: boolean
  groupHandoffReviewEnabled: boolean
  groupLoopDetectionEnabled: boolean
  groupMessageRoutingMinConfidence: number
  groupMessageRoutingMode: 'suggest' | 'auto'
  groupMessageRoutingTimeoutMs: number
  browserMatchEnabled: boolean
  browserMatchCandidateLimit: number
  browserMatchMinConfidence: number
  browserMatchTimeoutMs: number
  browserVerifyEnabled: boolean
  browserVerifyMinConfidence: number
  browserVerifyTimeoutMs: number

  hubAgentComputerUseMatchEnabled: boolean
  hubAgentComputerUseMatchCandidateLimit: number
  hubAgentComputerUseMatchMinConfidence: number
  hubAgentComputerUseMatchTimeoutMs: number
  hubAgentComputerUseVerifyEnabled: boolean
  hubAgentComputerUseVerifyMinConfidence: number
  hubAgentComputerUseVerifyTimeoutMs: number
  hubAgentSkillsEnabled: boolean
  hubAgentSkillsCandidateLimit: number
  hubAgentSkillsMinConfidence: number
  hubAgentSkillsTimeoutMs: number
  personMemoryEnabled: boolean
  personMemoryKindRoutingEnabled: boolean
  personMemoryRelevanceFilterEnabled: boolean
  personMemoryRerankEnabled: boolean
  personMemoryWriteReviewEnabled: boolean
  personMemoryCandidateLimit: number
  personMemoryRecallMinConfidence: number
  personMemoryFilterMinConfidence: number
  personMemoryMinConfidence: number
  personMemoryTimeoutMs: number
  hubAgentMemoryEnabled: boolean
  hubAgentMemoryKindRoutingEnabled: boolean
  hubAgentMemoryRelevanceFilterEnabled: boolean
  hubAgentMemoryRerankEnabled: boolean
  hubAgentMemoryWriteReviewEnabled: boolean
  hubAgentMemoryCandidateLimit: number
  hubAgentMemoryRecallMinConfidence: number
  hubAgentMemoryFilterMinConfidence: number
  hubAgentMemoryMinConfidence: number
  hubAgentMemoryTimeoutMs: number
  baseUrl: string
  model: string
  timeoutMs: number
  hasApiKey: boolean
}

export interface JevCredentialSettings extends Omit<JevSettings, 'hasApiKey'> { apiKey: string }
type StoredSettings = JevCredentialSettings

export class JevError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'jev_invalid_request') { super(message) }
}

const defaults: StoredSettings = {
  groupSummaryReviewEnabled: false,
  groupSummaryReviewMinConfidence: 0.8,
  groupSummaryRevisionEnabled: false,
  groupSummaryReviewTimeoutMs: 3000,
  workflowQualityEnabled: false,
  workflowQualityMinConfidence: 0.8,
  workflowQualityTimeoutMs: 5000,
  groupMessageRoutingEnabled: false,
  groupHandoffReviewEnabled: true,
  groupLoopDetectionEnabled: true,
  groupMessageRoutingMinConfidence: 0.9,
  groupMessageRoutingMode: 'suggest',
  groupMessageRoutingTimeoutMs: 1500,
  browserMatchEnabled: false,
  browserMatchCandidateLimit: 20,
  browserMatchMinConfidence: 0.8,
  browserMatchTimeoutMs: 3000,
  browserVerifyEnabled: false,
  browserVerifyMinConfidence: 0.8,
  browserVerifyTimeoutMs: 3000,

  hubAgentComputerUseMatchEnabled: false,
  hubAgentComputerUseMatchCandidateLimit: 20,
  hubAgentComputerUseMatchMinConfidence: 0.8,
  hubAgentComputerUseMatchTimeoutMs: 3000,
  hubAgentComputerUseVerifyEnabled: false,
  hubAgentComputerUseVerifyMinConfidence: 0.8,
  hubAgentComputerUseVerifyTimeoutMs: 3000,
  hubAgentSkillsEnabled: false,
  hubAgentSkillsCandidateLimit: 20,
  hubAgentSkillsMinConfidence: 0.8,
  hubAgentSkillsTimeoutMs: 3000,
  personMemoryEnabled: false,
  personMemoryKindRoutingEnabled: true,
  personMemoryRelevanceFilterEnabled: true,
  personMemoryRerankEnabled: true,
  personMemoryWriteReviewEnabled: true,
  personMemoryCandidateLimit: 20,
  personMemoryRecallMinConfidence: 0.5,
  personMemoryFilterMinConfidence: 0.8,
  personMemoryMinConfidence: 0.8,
  personMemoryTimeoutMs: 3000,
  hubAgentMemoryEnabled: false,
  hubAgentMemoryKindRoutingEnabled: true,
  hubAgentMemoryRelevanceFilterEnabled: true,
  hubAgentMemoryRerankEnabled: true,
  hubAgentMemoryWriteReviewEnabled: true,
  hubAgentMemoryCandidateLimit: 20,
  hubAgentMemoryRecallMinConfidence: 0.5,
  hubAgentMemoryFilterMinConfidence: 0.8,
  hubAgentMemoryMinConfidence: 0.8,
  hubAgentMemoryTimeoutMs: 3000,

  baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', timeoutMs: 10_000, apiKey: '',
}

function settingsPath(): string {
  return join(config.appHome, 'models', 'jev', 'global.json')
}

const LEGACY_JEV_KEY_PREFIXES: Array<[string, string]> = [
  ['ekkoComputerUse', 'hubAgentComputerUse'],
  ['ekkoSkills', 'hubAgentSkills'],
  ['ekkoMemory', 'hubAgentMemory'],
]

function mapLegacyJevKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    let targetKey = key
    for (const [legacyPrefix, nextPrefix] of LEGACY_JEV_KEY_PREFIXES) {
      if (key.startsWith(legacyPrefix)) {
        targetKey = `${nextPrefix}${key.slice(legacyPrefix.length)}`
        break
      }
    }
    if (!Object.hasOwn(mapped, targetKey) || targetKey === key) mapped[targetKey] = val
  }
  return mapped
}

function normalize(input: unknown, current = defaults): StoredSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new JevError('Invalid JEV settings')
  const value = mapLegacyJevKeys(input as Record<string, unknown>)
  if (Object.keys(value).some(key => !['personMemoryEnabled', 'personMemoryKindRoutingEnabled', 'personMemoryRelevanceFilterEnabled', 'personMemoryRerankEnabled', 'personMemoryWriteReviewEnabled', 'personMemoryCandidateLimit', 'personMemoryRecallMinConfidence', 'personMemoryFilterMinConfidence', 'personMemoryMinConfidence', 'personMemoryTimeoutMs', 'hubAgentComputerUseMatchEnabled', 'hubAgentComputerUseMatchCandidateLimit', 'hubAgentComputerUseMatchMinConfidence', 'hubAgentComputerUseMatchTimeoutMs', 'hubAgentComputerUseVerifyEnabled', 'hubAgentComputerUseVerifyMinConfidence', 'hubAgentComputerUseVerifyTimeoutMs', 'browserMatchEnabled', 'browserMatchCandidateLimit', 'browserMatchMinConfidence', 'browserMatchTimeoutMs', 'browserVerifyEnabled', 'browserVerifyMinConfidence', 'browserVerifyTimeoutMs', 'groupSummaryReviewEnabled', 'groupSummaryReviewMinConfidence', 'groupSummaryRevisionEnabled', 'groupSummaryReviewTimeoutMs', 'workflowQualityEnabled', 'workflowQualityMinConfidence', 'workflowQualityTimeoutMs', 'groupMessageRoutingEnabled', 'groupHandoffReviewEnabled', 'groupLoopDetectionEnabled', 'groupMessageRoutingMinConfidence', 'groupMessageRoutingMode', 'groupMessageRoutingTimeoutMs', 'baseUrl', 'model', 'timeoutMs', 'apiKey', 'hubAgentSkillsEnabled', 'hubAgentSkillsCandidateLimit', 'hubAgentSkillsMinConfidence', 'hubAgentSkillsTimeoutMs', 'hubAgentMemoryEnabled', 'hubAgentMemoryKindRoutingEnabled', 'hubAgentMemoryRelevanceFilterEnabled', 'hubAgentMemoryRerankEnabled', 'hubAgentMemoryWriteReviewEnabled', 'hubAgentMemoryCandidateLimit', 'hubAgentMemoryRecallMinConfidence', 'hubAgentMemoryFilterMinConfidence', 'hubAgentMemoryMinConfidence', 'hubAgentMemoryTimeoutMs'].includes(key))) {
    throw new JevError('Unknown JEV setting')
  }
  const next = { ...current }
  if (value.hubAgentMemoryEnabled !== undefined) {
    if (typeof value.hubAgentMemoryEnabled !== 'boolean') throw new JevError('JEV hubAgentMemoryEnabled must be a boolean')
    next.hubAgentMemoryEnabled = value.hubAgentMemoryEnabled
  }
  for (const key of ['personMemoryEnabled', 'personMemoryKindRoutingEnabled', 'personMemoryRelevanceFilterEnabled', 'personMemoryRerankEnabled', 'personMemoryWriteReviewEnabled', 'browserMatchEnabled', 'browserVerifyEnabled', 'groupSummaryReviewEnabled', 'groupSummaryRevisionEnabled', 'workflowQualityEnabled', 'groupMessageRoutingEnabled', 'groupHandoffReviewEnabled', 'groupLoopDetectionEnabled', 'hubAgentSkillsEnabled', 'hubAgentMemoryKindRoutingEnabled', 'hubAgentMemoryRelevanceFilterEnabled', 'hubAgentMemoryRerankEnabled', 'hubAgentMemoryWriteReviewEnabled'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'boolean') throw new JevError(`Invalid JEV ${key}`)
    next[key] = value[key]
  }
  if (value.hubAgentComputerUseMatchEnabled !== undefined) next.hubAgentComputerUseMatchEnabled = value.hubAgentComputerUseMatchEnabled as boolean
  if (value.hubAgentComputerUseMatchCandidateLimit !== undefined) next.hubAgentComputerUseMatchCandidateLimit = value.hubAgentComputerUseMatchCandidateLimit as number
  if (value.hubAgentComputerUseMatchMinConfidence !== undefined) next.hubAgentComputerUseMatchMinConfidence = value.hubAgentComputerUseMatchMinConfidence as number
  if (value.hubAgentComputerUseMatchTimeoutMs !== undefined) next.hubAgentComputerUseMatchTimeoutMs = value.hubAgentComputerUseMatchTimeoutMs as number
  if (value.hubAgentComputerUseVerifyEnabled !== undefined) next.hubAgentComputerUseVerifyEnabled = value.hubAgentComputerUseVerifyEnabled as boolean
  if (value.hubAgentComputerUseVerifyMinConfidence !== undefined) next.hubAgentComputerUseVerifyMinConfidence = value.hubAgentComputerUseVerifyMinConfidence as number
  if (value.hubAgentComputerUseVerifyTimeoutMs !== undefined) next.hubAgentComputerUseVerifyTimeoutMs = value.hubAgentComputerUseVerifyTimeoutMs as number
  if (typeof next.hubAgentComputerUseMatchEnabled !== 'boolean') throw new JevError('Invalid JEV hubAgentComputerUseMatchEnabled')
  if (!Number.isInteger(next.hubAgentComputerUseMatchCandidateLimit) || next.hubAgentComputerUseMatchCandidateLimit < 1 || next.hubAgentComputerUseMatchCandidateLimit > 50) throw new JevError('Invalid JEV hubAgentComputerUseMatchCandidateLimit')
  if (!Number.isFinite(next.hubAgentComputerUseMatchMinConfidence) || next.hubAgentComputerUseMatchMinConfidence < 0.5 || next.hubAgentComputerUseMatchMinConfidence > 1) throw new JevError('Invalid JEV hubAgentComputerUseMatchMinConfidence')
  if (!Number.isInteger(next.hubAgentComputerUseMatchTimeoutMs) || next.hubAgentComputerUseMatchTimeoutMs < 100 || next.hubAgentComputerUseMatchTimeoutMs > 30000) throw new JevError('Invalid JEV hubAgentComputerUseMatchTimeoutMs')
  if (typeof next.hubAgentComputerUseVerifyEnabled !== 'boolean') throw new JevError('Invalid JEV hubAgentComputerUseVerifyEnabled')
  if (!Number.isFinite(next.hubAgentComputerUseVerifyMinConfidence) || next.hubAgentComputerUseVerifyMinConfidence < 0.5 || next.hubAgentComputerUseVerifyMinConfidence > 1) throw new JevError('Invalid JEV hubAgentComputerUseVerifyMinConfidence')
  if (!Number.isInteger(next.hubAgentComputerUseVerifyTimeoutMs) || next.hubAgentComputerUseVerifyTimeoutMs < 100 || next.hubAgentComputerUseVerifyTimeoutMs > 30000) throw new JevError('Invalid JEV hubAgentComputerUseVerifyTimeoutMs')
  if (value.browserMatchCandidateLimit !== undefined) next.browserMatchCandidateLimit = value.browserMatchCandidateLimit as number
  if (!Number.isInteger(next.browserMatchCandidateLimit) || next.browserMatchCandidateLimit < 1 || next.browserMatchCandidateLimit > 50) throw new JevError('Invalid JEV browserMatchCandidateLimit')
  if (value.browserMatchMinConfidence !== undefined) next.browserMatchMinConfidence = value.browserMatchMinConfidence as number
  if (!Number.isFinite(next.browserMatchMinConfidence) || next.browserMatchMinConfidence < 0.5 || next.browserMatchMinConfidence > 1) throw new JevError('Invalid JEV browserMatchMinConfidence')
  if (value.browserMatchTimeoutMs !== undefined) next.browserMatchTimeoutMs = value.browserMatchTimeoutMs as number
  if (!Number.isInteger(next.browserMatchTimeoutMs) || next.browserMatchTimeoutMs < 100 || next.browserMatchTimeoutMs > 30000) throw new JevError('Invalid JEV browserMatchTimeoutMs')
  if (value.browserVerifyMinConfidence !== undefined) next.browserVerifyMinConfidence = value.browserVerifyMinConfidence as number
  if (!Number.isFinite(next.browserVerifyMinConfidence) || next.browserVerifyMinConfidence < 0.5 || next.browserVerifyMinConfidence > 1) throw new JevError('Invalid JEV browserVerifyMinConfidence')
  if (value.browserVerifyTimeoutMs !== undefined) next.browserVerifyTimeoutMs = value.browserVerifyTimeoutMs as number
  if (!Number.isInteger(next.browserVerifyTimeoutMs) || next.browserVerifyTimeoutMs < 100 || next.browserVerifyTimeoutMs > 30000) throw new JevError('Invalid JEV browserVerifyTimeoutMs')
  if (value.groupMessageRoutingMode !== undefined) {
    if (value.groupMessageRoutingMode !== 'suggest' && value.groupMessageRoutingMode !== 'auto') throw new JevError('Invalid JEV group message routing mode')
    next.groupMessageRoutingMode = value.groupMessageRoutingMode
  }
  if (value.groupMessageRoutingMinConfidence !== undefined) next.groupMessageRoutingMinConfidence = value.groupMessageRoutingMinConfidence as number
  if (value.groupMessageRoutingTimeoutMs !== undefined) next.groupMessageRoutingTimeoutMs = value.groupMessageRoutingTimeoutMs as number
  if (!Number.isFinite(next.groupMessageRoutingMinConfidence) || next.groupMessageRoutingMinConfidence < 0.5 || next.groupMessageRoutingMinConfidence > 1) throw new JevError('Invalid JEV group message routing confidence')
  if (!Number.isInteger(next.groupMessageRoutingTimeoutMs) || next.groupMessageRoutingTimeoutMs < 100 || next.groupMessageRoutingTimeoutMs > 30000) throw new JevError('Invalid JEV group message routing timeout')
  if (value.workflowQualityMinConfidence !== undefined) next.workflowQualityMinConfidence = value.workflowQualityMinConfidence as number
  if (value.workflowQualityTimeoutMs !== undefined) next.workflowQualityTimeoutMs = value.workflowQualityTimeoutMs as number
  if (!Number.isFinite(next.workflowQualityMinConfidence) || next.workflowQualityMinConfidence < 0.5 || next.workflowQualityMinConfidence > 1) throw new JevError('Invalid JEV workflow quality confidence')
  if (!Number.isInteger(next.workflowQualityTimeoutMs) || next.workflowQualityTimeoutMs < 100 || next.workflowQualityTimeoutMs > 30000) throw new JevError('Invalid JEV workflow quality timeout')
  if (value.groupSummaryReviewMinConfidence !== undefined) next.groupSummaryReviewMinConfidence = value.groupSummaryReviewMinConfidence as number
  if (value.groupSummaryReviewTimeoutMs !== undefined) next.groupSummaryReviewTimeoutMs = value.groupSummaryReviewTimeoutMs as number
  if (!Number.isFinite(next.groupSummaryReviewMinConfidence) || next.groupSummaryReviewMinConfidence < 0.5 || next.groupSummaryReviewMinConfidence > 1) throw new JevError('Invalid JEV group summary review confidence')
  if (!Number.isInteger(next.groupSummaryReviewTimeoutMs) || next.groupSummaryReviewTimeoutMs < 100 || next.groupSummaryReviewTimeoutMs > 30000) throw new JevError('Invalid JEV group summary review timeout')
  if (value.hubAgentSkillsCandidateLimit !== undefined) next.hubAgentSkillsCandidateLimit = value.hubAgentSkillsCandidateLimit as number
  if (value.hubAgentSkillsMinConfidence !== undefined) next.hubAgentSkillsMinConfidence = value.hubAgentSkillsMinConfidence as number
  if (value.hubAgentSkillsTimeoutMs !== undefined) next.hubAgentSkillsTimeoutMs = value.hubAgentSkillsTimeoutMs as number
  if (!Number.isInteger(next.hubAgentSkillsCandidateLimit) || next.hubAgentSkillsCandidateLimit < 1 || next.hubAgentSkillsCandidateLimit > 50) throw new JevError('Invalid JEV skills candidate limit')
  if (!Number.isFinite(next.hubAgentSkillsMinConfidence) || next.hubAgentSkillsMinConfidence < 0.5 || next.hubAgentSkillsMinConfidence > 1) throw new JevError('Invalid JEV skills confidence')
  if (!Number.isInteger(next.hubAgentSkillsTimeoutMs) || next.hubAgentSkillsTimeoutMs < 100 || next.hubAgentSkillsTimeoutMs > 30000) throw new JevError('Invalid JEV skills timeout')
  if (value.hubAgentMemoryCandidateLimit !== undefined) next.hubAgentMemoryCandidateLimit = value.hubAgentMemoryCandidateLimit as number
  if (value.hubAgentMemoryRecallMinConfidence !== undefined) next.hubAgentMemoryRecallMinConfidence = value.hubAgentMemoryRecallMinConfidence as number
  if (value.hubAgentMemoryFilterMinConfidence !== undefined) next.hubAgentMemoryFilterMinConfidence = value.hubAgentMemoryFilterMinConfidence as number
  if (value.hubAgentMemoryMinConfidence !== undefined) next.hubAgentMemoryMinConfidence = value.hubAgentMemoryMinConfidence as number
  if (value.hubAgentMemoryTimeoutMs !== undefined) next.hubAgentMemoryTimeoutMs = value.hubAgentMemoryTimeoutMs as number
  if (!Number.isInteger(next.hubAgentMemoryCandidateLimit) || next.hubAgentMemoryCandidateLimit < 1 || next.hubAgentMemoryCandidateLimit > 50) throw new JevError('Invalid JEV memory candidate limit')
  if (!Number.isFinite(next.hubAgentMemoryRecallMinConfidence) || next.hubAgentMemoryRecallMinConfidence < 0.5 || next.hubAgentMemoryRecallMinConfidence > 1) throw new JevError('Invalid JEV memory recall confidence')
  if (!Number.isFinite(next.hubAgentMemoryFilterMinConfidence) || next.hubAgentMemoryFilterMinConfidence < 0.5 || next.hubAgentMemoryFilterMinConfidence > 1) throw new JevError('Invalid JEV memory filter confidence')
  if (!Number.isFinite(next.hubAgentMemoryMinConfidence) || next.hubAgentMemoryMinConfidence < 0.5 || next.hubAgentMemoryMinConfidence > 1) throw new JevError('Invalid JEV memory confidence')
  if (!Number.isInteger(next.hubAgentMemoryTimeoutMs) || next.hubAgentMemoryTimeoutMs < 100 || next.hubAgentMemoryTimeoutMs > 30000) throw new JevError('Invalid JEV memory timeout')
  if (value.personMemoryCandidateLimit !== undefined) next.personMemoryCandidateLimit = value.personMemoryCandidateLimit as number
  if (value.personMemoryRecallMinConfidence !== undefined) next.personMemoryRecallMinConfidence = value.personMemoryRecallMinConfidence as number
  if (value.personMemoryFilterMinConfidence !== undefined) next.personMemoryFilterMinConfidence = value.personMemoryFilterMinConfidence as number
  if (value.personMemoryMinConfidence !== undefined) next.personMemoryMinConfidence = value.personMemoryMinConfidence as number
  if (value.personMemoryTimeoutMs !== undefined) next.personMemoryTimeoutMs = value.personMemoryTimeoutMs as number
  if (!Number.isInteger(next.personMemoryCandidateLimit) || next.personMemoryCandidateLimit < 1 || next.personMemoryCandidateLimit > 50) throw new JevError('Invalid JEV memory candidate limit')
  if (!Number.isFinite(next.personMemoryRecallMinConfidence) || next.personMemoryRecallMinConfidence < 0.5 || next.personMemoryRecallMinConfidence > 1) throw new JevError('Invalid JEV memory recall confidence')
  if (!Number.isFinite(next.personMemoryFilterMinConfidence) || next.personMemoryFilterMinConfidence < 0.5 || next.personMemoryFilterMinConfidence > 1) throw new JevError('Invalid JEV memory filter confidence')
  if (!Number.isFinite(next.personMemoryMinConfidence) || next.personMemoryMinConfidence < 0.5 || next.personMemoryMinConfidence > 1) throw new JevError('Invalid JEV memory confidence')
  if (!Number.isInteger(next.personMemoryTimeoutMs) || next.personMemoryTimeoutMs < 100 || next.personMemoryTimeoutMs > 30000) throw new JevError('Invalid JEV memory timeout')
  for (const key of ['baseUrl', 'model', 'apiKey'] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string' || value[key].length > 4096) throw new JevError(`Invalid JEV ${key}`)
    // Empty API key fields preserve the saved credential. DELETE clears it.
    if (key !== 'apiKey' || value[key].trim()) next[key] = value[key].trim()
  }
  if (value.timeoutMs !== undefined) next.timeoutMs = value.timeoutMs as number
  if (!Number.isInteger(next.timeoutMs) || next.timeoutMs < 1000 || next.timeoutMs > 120_000) {
    throw new JevError('JEV timeout must be between 1000 and 120000 ms')
  }
  if (!next.model || next.model.length > 200 || /[\r\n]/.test(next.model)) throw new JevError('Invalid JEV model')
  let url: URL
  try { url = new URL(next.baseUrl) } catch { throw new JevError('Invalid JEV base URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new JevError('JEV base URL must use HTTP(S) without credentials, query or fragment')
  }
  // The SDK appends /v1/systemone; accept versioned bases and complete endpoints too.
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1(?:\/systemone)?$/, '') || '/'
  next.baseUrl = url.toString().replace(/\/+$/, '')
  if (/[\r\n]/.test(next.apiKey)) throw new JevError('Invalid JEV API key')
  return next
}

function publicSettings(value: StoredSettings): JevSettings {
  return {
    personMemoryEnabled: value.personMemoryEnabled,
    personMemoryKindRoutingEnabled: value.personMemoryKindRoutingEnabled,
    personMemoryRelevanceFilterEnabled: value.personMemoryRelevanceFilterEnabled,
    personMemoryRerankEnabled: value.personMemoryRerankEnabled,
    personMemoryWriteReviewEnabled: value.personMemoryWriteReviewEnabled,
    personMemoryCandidateLimit: value.personMemoryCandidateLimit,
    personMemoryRecallMinConfidence: value.personMemoryRecallMinConfidence,
    personMemoryFilterMinConfidence: value.personMemoryFilterMinConfidence,
    personMemoryMinConfidence: value.personMemoryMinConfidence,
    personMemoryTimeoutMs: value.personMemoryTimeoutMs,
    groupMessageRoutingEnabled: value.groupMessageRoutingEnabled, groupHandoffReviewEnabled: value.groupHandoffReviewEnabled, groupLoopDetectionEnabled: value.groupLoopDetectionEnabled, groupMessageRoutingMinConfidence: value.groupMessageRoutingMinConfidence, groupMessageRoutingMode: value.groupMessageRoutingMode, groupMessageRoutingTimeoutMs: value.groupMessageRoutingTimeoutMs,
    workflowQualityEnabled: value.workflowQualityEnabled, workflowQualityMinConfidence: value.workflowQualityMinConfidence, workflowQualityTimeoutMs: value.workflowQualityTimeoutMs,
    groupSummaryReviewEnabled: value.groupSummaryReviewEnabled, groupSummaryReviewMinConfidence: value.groupSummaryReviewMinConfidence, groupSummaryRevisionEnabled: value.groupSummaryRevisionEnabled, groupSummaryReviewTimeoutMs: value.groupSummaryReviewTimeoutMs,
    hubAgentComputerUseMatchEnabled: value.hubAgentComputerUseMatchEnabled,
    hubAgentComputerUseMatchCandidateLimit: value.hubAgentComputerUseMatchCandidateLimit,
    hubAgentComputerUseMatchMinConfidence: value.hubAgentComputerUseMatchMinConfidence,
    hubAgentComputerUseMatchTimeoutMs: value.hubAgentComputerUseMatchTimeoutMs,
    hubAgentComputerUseVerifyEnabled: value.hubAgentComputerUseVerifyEnabled,
    hubAgentComputerUseVerifyMinConfidence: value.hubAgentComputerUseVerifyMinConfidence,
    hubAgentComputerUseVerifyTimeoutMs: value.hubAgentComputerUseVerifyTimeoutMs,
    browserMatchEnabled: value.browserMatchEnabled,
    browserMatchCandidateLimit: value.browserMatchCandidateLimit,
    browserMatchMinConfidence: value.browserMatchMinConfidence,
    browserMatchTimeoutMs: value.browserMatchTimeoutMs,
    browserVerifyEnabled: value.browserVerifyEnabled,
    browserVerifyMinConfidence: value.browserVerifyMinConfidence,
    browserVerifyTimeoutMs: value.browserVerifyTimeoutMs,
    hubAgentSkillsEnabled: value.hubAgentSkillsEnabled, hubAgentSkillsCandidateLimit: value.hubAgentSkillsCandidateLimit,
    hubAgentSkillsMinConfidence: value.hubAgentSkillsMinConfidence, hubAgentSkillsTimeoutMs: value.hubAgentSkillsTimeoutMs,
    baseUrl: value.baseUrl, model: value.model, timeoutMs: value.timeoutMs, hubAgentMemoryEnabled: value.hubAgentMemoryEnabled, hubAgentMemoryKindRoutingEnabled: value.hubAgentMemoryKindRoutingEnabled, hubAgentMemoryRelevanceFilterEnabled: value.hubAgentMemoryRelevanceFilterEnabled, hubAgentMemoryRerankEnabled: value.hubAgentMemoryRerankEnabled, hubAgentMemoryWriteReviewEnabled: value.hubAgentMemoryWriteReviewEnabled, hubAgentMemoryCandidateLimit: value.hubAgentMemoryCandidateLimit, hubAgentMemoryRecallMinConfidence: value.hubAgentMemoryRecallMinConfidence, hubAgentMemoryFilterMinConfidence: value.hubAgentMemoryFilterMinConfidence, hubAgentMemoryMinConfidence: value.hubAgentMemoryMinConfidence, hubAgentMemoryTimeoutMs: value.hubAgentMemoryTimeoutMs, hasApiKey: !!value.apiKey }
}

async function legacySettings(): Promise<StoredSettings | undefined> {
  const directory = join(config.appHome, 'models', 'jev')
  let files: string[]
  try { files = (await readdir(directory)).filter(file => /^[a-f0-9]{64}\.json$/.test(file)) }
  catch (error: any) { if (error?.code === 'ENOENT') return; throw error }
  const defaultFile = `${createHash('sha256').update('default').digest('hex')}.json`
  const source = files.includes(defaultFile) ? defaultFile : files.length === 1 ? files[0] : undefined
  if (!source) return
  return normalize(JSON.parse(await readFile(join(directory, source), 'utf8')))
}

export async function readJevCredentials(): Promise<StoredSettings> {
  try { return normalize(JSON.parse(await readFile(settingsPath(), 'utf8'))) }
  catch (error: any) { if (error?.code !== 'ENOENT') throw error }
  const legacy = await legacySettings()
  if (!legacy) return { ...defaults }
  // Serialize migration with saves/resets. Existing global state always wins;
  // legacy files remain intact and deleting the global key cannot revive them.
  const result = await safeFileStore.updateText(settingsPath(), text => {
    const next = text ? normalize(JSON.parse(text)) : legacy
    return { content: JSON.stringify(next), result: next }
  })
  await chmod(settingsPath(), 0o600)
  return result!
}

export async function getJevSettings(): Promise<JevSettings> {
  return publicSettings(await readJevCredentials())
}

/** Server-only host configuration for agent runtimes; never return this from an HTTP endpoint. */
export async function getJevRuntimeConfig() {
  const { hubAgentComputerUseMatchEnabled, hubAgentComputerUseMatchCandidateLimit, hubAgentComputerUseMatchMinConfidence, hubAgentComputerUseMatchTimeoutMs, hubAgentComputerUseVerifyEnabled, hubAgentComputerUseVerifyMinConfidence, hubAgentComputerUseVerifyTimeoutMs, hubAgentSkillsEnabled, hubAgentSkillsCandidateLimit, hubAgentSkillsMinConfidence, hubAgentSkillsTimeoutMs, hubAgentMemoryEnabled, hubAgentMemoryKindRoutingEnabled, hubAgentMemoryRelevanceFilterEnabled, hubAgentMemoryRerankEnabled, hubAgentMemoryWriteReviewEnabled, hubAgentMemoryCandidateLimit, hubAgentMemoryRecallMinConfidence, hubAgentMemoryFilterMinConfidence, hubAgentMemoryMinConfidence, hubAgentMemoryTimeoutMs, apiKey, baseUrl, model, timeoutMs } = await readJevCredentials()
  return { apiKey, baseUrl, model, timeoutMs, enabled: Boolean(apiKey), memoryEnabled: hubAgentMemoryEnabled,
    computerUseMatchEnabled: hubAgentComputerUseMatchEnabled,
    computerUseMatchCandidateLimit: hubAgentComputerUseMatchCandidateLimit,
    computerUseMatchMinConfidence: hubAgentComputerUseMatchMinConfidence,
    computerUseMatchTimeoutMs: hubAgentComputerUseMatchTimeoutMs,
    computerUseVerifyEnabled: hubAgentComputerUseVerifyEnabled,
    computerUseVerifyMinConfidence: hubAgentComputerUseVerifyMinConfidence,
    computerUseVerifyTimeoutMs: hubAgentComputerUseVerifyTimeoutMs,
    skillsEnabled: hubAgentSkillsEnabled,
    skillsCandidateLimit: hubAgentSkillsCandidateLimit,
    skillsMinConfidence: hubAgentSkillsMinConfidence,
    skillsTimeoutMs: hubAgentSkillsTimeoutMs,
    memoryKindRoutingEnabled: hubAgentMemoryKindRoutingEnabled,
    memoryRelevanceFilterEnabled: hubAgentMemoryRelevanceFilterEnabled,
    memoryRerankEnabled: hubAgentMemoryRerankEnabled,
    memoryWriteReviewEnabled: hubAgentMemoryWriteReviewEnabled,
    memoryCandidateLimit: hubAgentMemoryCandidateLimit,
    memoryRecallMinConfidence: hubAgentMemoryRecallMinConfidence,
    memoryFilterMinConfidence: hubAgentMemoryFilterMinConfidence,
    memoryMinConfidence: hubAgentMemoryMinConfidence,
    memoryTimeoutMs: hubAgentMemoryTimeoutMs,
  }
}

/** Personal assistant memory has its own controls; credentials are shared globally. */
export async function getPersonJevRuntimeConfig() {
  const { personMemoryEnabled, personMemoryKindRoutingEnabled, personMemoryRelevanceFilterEnabled, personMemoryRerankEnabled, personMemoryWriteReviewEnabled, personMemoryCandidateLimit, personMemoryRecallMinConfidence, personMemoryFilterMinConfidence, personMemoryMinConfidence, personMemoryTimeoutMs, apiKey, baseUrl, model, timeoutMs } = await readJevCredentials()
  return { apiKey, baseUrl, model, timeoutMs, enabled: Boolean(apiKey),
    memoryEnabled: personMemoryEnabled,
    memoryKindRoutingEnabled: personMemoryKindRoutingEnabled,
    memoryRelevanceFilterEnabled: personMemoryRelevanceFilterEnabled,
    memoryRerankEnabled: personMemoryRerankEnabled,
    memoryWriteReviewEnabled: personMemoryWriteReviewEnabled,
    memoryCandidateLimit: personMemoryCandidateLimit,
    memoryRecallMinConfidence: personMemoryRecallMinConfidence,
    memoryFilterMinConfidence: personMemoryFilterMinConfidence,
    memoryMinConfidence: personMemoryMinConfidence,
    memoryTimeoutMs: personMemoryTimeoutMs,
  }
}

export async function saveJevSettings(input: unknown): Promise<JevSettings> {
  const path = settingsPath()
  const directory = join(config.appHome, 'models', 'jev')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const previous = await readJevCredentials()
  const result = await safeFileStore.updateText(path, text => {
    const next = normalize(input, text ? normalize(JSON.parse(text)) : previous)
    return { content: JSON.stringify(next), result: publicSettings(next) }
  })
  await chmod(path, 0o600)
  return result!
}

export async function deleteJevSettings(): Promise<JevSettings> {
  // Use the same write lock as saving; clearing cannot race a credential update.
  const path = settingsPath()
  await mkdir(join(config.appHome, 'models', 'jev'), { recursive: true, mode: 0o700 })
  await safeFileStore.updateText(path, () => JSON.stringify(defaults))
  await chmod(path, 0o600)
  return publicSettings(defaults)
}
