import type {
  HubAgentConfig,
  HubAgentModelAuthorizationSettings,
  HubAgentModelProviderSettings,
} from '../config'
import type {
  ConfiguredModelAuthorizationEntry,
  HubAgentConfigStore,
} from '../config-store'
import type { HubAgentModelApiMode } from './provider-presets'
import type { FetchLike } from './types'

export interface HubAgentModelAuthorizationCredentials {
  provider: string
  accessToken: string
  expiresAt?: string
  baseUrl?: string
  apiMode?: HubAgentModelApiMode
}

export interface HubAgentModelAuthorizationRefreshInput {
  provider: string
  model?: string
  authorization: HubAgentModelAuthorizationSettings
  providerSettings: HubAgentModelProviderSettings
}

export interface HubAgentModelAuthorizationRefreshResult {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  expiresIn?: number
  baseUrl?: string
  apiMode?: HubAgentModelApiMode
}

export type HubAgentModelAuthorizationRefresher = (
  input: HubAgentModelAuthorizationRefreshInput,
) => Promise<HubAgentModelAuthorizationRefreshResult>

export interface HubAgentModelAuthorizationManagerOptions {
  config: HubAgentConfigStore
  refresher?: HubAgentModelAuthorizationRefresher
  fetch?: FetchLike
  now?: () => number
}

export class HubAgentModelAuthorizationError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly code = 'MODEL_AUTHORIZATION_FAILED',
    readonly reloginRequired = false,
  ) {
    super(message)
    this.name = 'HubAgentModelAuthorizationError'
  }
}

/**
 * Owns persisted OAuth records and resolves a fresh access token before model
 * requests. Concurrent refreshes for one provider share the same promise.
 */
export class HubAgentModelAuthorizationManager {
  private readonly config: HubAgentConfigStore
  private readonly refresher?: HubAgentModelAuthorizationRefresher
  private readonly fetchImpl: FetchLike
  private readonly now: () => number
  private readonly refreshes = new Map<string, Promise<HubAgentModelAuthorizationCredentials>>()

  constructor(options: HubAgentModelAuthorizationManagerOptions) {
    this.config = options.config
    this.refresher = options.refresher
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.now = options.now ?? Date.now
  }

  list(): ConfiguredModelAuthorizationEntry[] {
    return this.config.listModelAuthorizations()
  }

  get(provider: string): HubAgentModelAuthorizationSettings | undefined {
    return this.config.getModelAuthorization(provider)
  }

  set(provider: string, settings: HubAgentModelAuthorizationSettings): HubAgentConfig {
    return this.config.setModelAuthorization(provider, settings)
  }

  update(provider: string, patch: Partial<HubAgentModelAuthorizationSettings>): HubAgentConfig {
    return this.config.updateModelAuthorization(provider, patch)
  }

  delete(provider: string): boolean {
    return this.config.deleteModelAuthorization(provider)
  }

  needsRefresh(provider: string): boolean {
    const normalizedProvider = normalizeProvider(provider)
    const config = this.config.read()
    const authorization = config.model.authorizations[normalizedProvider]
    if (!authorization?.accessToken) return true
    if (!authorization.expiresAt) return false
    return Date.parse(authorization.expiresAt) - this.now() <= config.model.authorizationRefreshLeewayMs
  }

  async resolve(provider: string, model?: string): Promise<HubAgentModelAuthorizationCredentials> {
    const normalizedProvider = normalizeProvider(provider)
    const config = this.config.read()
    const providerSettings = config.model.providers[normalizedProvider]
    if (!providerSettings) {
      throw new HubAgentModelAuthorizationError(
        `Configured model provider not found: ${normalizedProvider}`,
        normalizedProvider,
        'MODEL_AUTHORIZATION_PROVIDER_NOT_FOUND',
      )
    }
    const authorization = config.model.authorizations[normalizedProvider]
    if (!authorization) {
      throw new HubAgentModelAuthorizationError(
        `Model provider ${normalizedProvider} is not authorized.`,
        normalizedProvider,
        'MODEL_AUTHORIZATION_MISSING',
        true,
      )
    }

    if (!this.needsRefresh(normalizedProvider)) {
      return credentialsFromAuthorization(normalizedProvider, authorization)
    }
    return this.refresh(normalizedProvider, model)
  }

  async refresh(provider: string, model?: string): Promise<HubAgentModelAuthorizationCredentials> {
    const normalizedProvider = normalizeProvider(provider)
    const active = this.refreshes.get(normalizedProvider)
    if (active) return active

    const refresh = this.performRefresh(normalizedProvider, model)
      .finally(() => this.refreshes.delete(normalizedProvider))
    this.refreshes.set(normalizedProvider, refresh)
    return refresh
  }

  private async performRefresh(
    provider: string,
    model?: string,
  ): Promise<HubAgentModelAuthorizationCredentials> {
    const config = this.config.read()
    const providerSettings = config.model.providers[provider]
    const authorization = config.model.authorizations[provider]
    if (!providerSettings) {
      throw new HubAgentModelAuthorizationError(
        `Configured model provider not found: ${provider}`,
        provider,
        'MODEL_AUTHORIZATION_PROVIDER_NOT_FOUND',
      )
    }
    if (!authorization) {
      throw new HubAgentModelAuthorizationError(
        `Model provider ${provider} is not authorized.`,
        provider,
        'MODEL_AUTHORIZATION_MISSING',
        true,
      )
    }

    let refreshed: HubAgentModelAuthorizationRefreshResult
    try {
      refreshed = this.refresher
        ? await this.refresher({
            provider,
            model,
            authorization: structuredClone(authorization),
            providerSettings: structuredClone(providerSettings),
          })
        : await refreshStandardOAuthToken(provider, authorization, this.fetchImpl)
    } catch (error) {
      if (error instanceof HubAgentModelAuthorizationError) throw error
      throw new HubAgentModelAuthorizationError(
        `Could not refresh ${provider} authorization: ${error instanceof Error ? error.message : String(error)}`,
        provider,
        'MODEL_AUTHORIZATION_REFRESH_FAILED',
      )
    }

    const accessToken = String(refreshed.accessToken || '').trim()
    if (!accessToken) {
      throw new HubAgentModelAuthorizationError(
        `Authorization refresh returned no access token for ${provider}.`,
        provider,
        'MODEL_AUTHORIZATION_EMPTY_TOKEN',
        true,
      )
    }
    const now = this.now()
    const expiresAt = refreshed.expiresAt
      ? normalizeExpiry(refreshed.expiresAt, provider)
      : Number.isFinite(refreshed.expiresIn) && Number(refreshed.expiresIn) > 0
        ? new Date(now + Number(refreshed.expiresIn) * 1_000).toISOString()
        : undefined
    const next: HubAgentModelAuthorizationSettings = {
      ...authorization,
      accessToken,
      refreshToken: String(refreshed.refreshToken || authorization.refreshToken || '').trim() || undefined,
      obtainedAt: new Date(now).toISOString(),
      ...(expiresAt ? { expiresAt } : {}),
      ...(refreshed.baseUrl ? { baseUrl: String(refreshed.baseUrl).trim() } : {}),
      ...(refreshed.apiMode ? { apiMode: refreshed.apiMode } : {}),
    }
    if (!expiresAt) delete next.expiresAt
    this.config.setModelAuthorization(provider, next)
    return credentialsFromAuthorization(provider, next)
  }
}

export async function refreshStandardOAuthToken(
  provider: string,
  authorization: HubAgentModelAuthorizationSettings,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<HubAgentModelAuthorizationRefreshResult> {
  const tokenUrl = String(authorization.tokenUrl || '').trim()
  const refreshToken = String(authorization.refreshToken || '').trim()
  if (!tokenUrl || !refreshToken) {
    throw new HubAgentModelAuthorizationError(
      `Model provider ${provider} requires a host refresher or tokenUrl and refreshToken.`,
      provider,
      'MODEL_AUTHORIZATION_REFRESH_UNAVAILABLE',
      !refreshToken,
    )
  }

  const body = new URLSearchParams(authorization.tokenParams || {})
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', refreshToken)
  if (authorization.clientId) body.set('client_id', authorization.clientId)
  if (authorization.clientSecret) body.set('client_secret', authorization.clientSecret)
  if (authorization.scope) body.set('scope', authorization.scope)

  const response = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const oauthCode = String(payload.error || '').trim()
    const detail = String(payload.error_description || payload.message || oauthCode || `HTTP ${response.status}`).trim()
    throw new HubAgentModelAuthorizationError(
      `OAuth refresh failed for ${provider}: ${detail}`,
      provider,
      oauthCode || 'MODEL_AUTHORIZATION_REFRESH_FAILED',
      oauthCode === 'invalid_grant' || oauthCode === 'invalid_token',
    )
  }

  return {
    accessToken: String(payload.access_token || ''),
    ...(payload.refresh_token ? { refreshToken: String(payload.refresh_token) } : {}),
    ...(Number.isFinite(Number(payload.expires_in)) ? { expiresIn: Number(payload.expires_in) } : {}),
  }
}

function credentialsFromAuthorization(
  provider: string,
  authorization: HubAgentModelAuthorizationSettings,
): HubAgentModelAuthorizationCredentials {
  const accessToken = String(authorization.accessToken || '').trim()
  if (!accessToken) {
    throw new HubAgentModelAuthorizationError(
      `Model provider ${provider} authorization has no access token.`,
      provider,
      'MODEL_AUTHORIZATION_EMPTY_TOKEN',
      true,
    )
  }
  return {
    provider,
    accessToken,
    ...(authorization.expiresAt ? { expiresAt: authorization.expiresAt } : {}),
    ...(authorization.baseUrl ? { baseUrl: authorization.baseUrl } : {}),
    ...(authorization.apiMode ? { apiMode: authorization.apiMode } : {}),
  }
}

function normalizeProvider(provider: string): string {
  const normalized = String(provider || '').trim()
  if (!normalized) throw new HubAgentModelAuthorizationError('Model provider is required.', '')
  return normalized
}

function normalizeExpiry(value: string, provider: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new HubAgentModelAuthorizationError(
      `Authorization refresh returned an invalid expiresAt for ${provider}.`,
      provider,
      'MODEL_AUTHORIZATION_INVALID_EXPIRY',
    )
  }
  return new Date(timestamp).toISOString()
}
