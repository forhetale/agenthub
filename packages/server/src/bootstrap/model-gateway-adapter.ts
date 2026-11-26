import { configureModelGatewayAdapters } from '../modules/studio/public/model-gateway-adapters'
import { configureProviderHttp, createProviderHttpTransport } from '../modules/studio/public/provider-http'
import { configureProviderUpstream } from '../modules/studio/public/provider-upstream'
import { codingModelGatewayAdapters } from '../modules/coding-agents/public/model-gateway'
import { createHubAgentAuthorizedProviderFetch, resolveHubAgentProviderRuntimeConfig } from '../modules/hub-agent/services/provider-runtime'
import { authorizedModelProviderPreset } from '../../../hub-agent/src/model/authorized-providers'

configureModelGatewayAdapters(codingModelGatewayAdapters)
configureProviderUpstream(resolveHubAgentProviderRuntimeConfig)
configureProviderHttp(createProviderHttpTransport({
  createFetch: createHubAgentAuthorizedProviderFetch,
  headers: (provider, apiKey) => authorizedModelProviderPreset(provider, apiKey)?.headers,
}))
