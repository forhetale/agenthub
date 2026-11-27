import {
  isAuthorizedRuntimeProvider,
  resolveAuthorizedProviderRuntimeCredentials,
} from '../../studio/public/authorized-provider-runtime'

export interface HubAgentAuthorizedProviderCredentials {
  apiKey?: string
  baseUrl?: string
  apiMode?: string
}

export async function resolveHubAgentAuthorizedProviderCredentials(
  profile: string,
  provider: string,
  model?: string,
  forceRefresh = false,
  credentialScope?: string,
): Promise<HubAgentAuthorizedProviderCredentials> {
  if (!isAuthorizedRuntimeProvider(provider)) return {}

  const credentials = await resolveAuthorizedProviderRuntimeCredentials({
    profile,
    provider,
    model,
    ...(credentialScope ? { credentialScope } : {}),
    ...(forceRefresh ? { forceRefresh: true } : {}),
  })
  return {
    apiKey: credentials.apiKey,
    baseUrl: credentials.baseUrl,
    apiMode: credentials.apiMode,
  }
}
