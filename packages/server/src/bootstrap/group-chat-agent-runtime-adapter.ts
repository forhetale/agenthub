import { resolveAgentGatewayRuntime, resolveAgentGatewayModelConfigs } from './provider-gateway-client'
import { AgentBridgeClient } from '../modules/hermes/services/bridge/client'
import { SessionDeleter } from '../modules/hermes/services/history/session-deleter'
import { getAvailableModelGroupsForProfile } from '../modules/hermes/controllers/models'
import { respondToHubAgentToolApproval } from '../modules/hub-agent/services/approvals'
import {
  cancelPendingHubAgentClarification,
  respondToHubAgentClarification,
} from '../modules/hub-agent/services/clarifications'
import { getGlobalHubAgent } from '../modules/hub-agent/services/manager'
import {
  createHubAgentAuthorizedProviderFetch,
} from '../modules/hub-agent/services/provider-runtime'
import { configureGroupChatAgentRuntime } from '../modules/studio/public/group-chat-agent-runtime'
import { createModelClient } from '../../../hub-agent/src'

configureGroupChatAgentRuntime({
  createPrimaryAgentBridge: options => new AgentBridgeClient(options),
  cancelHubAgentClarification: cancelPendingHubAgentClarification,
  respondToHubAgentToolApproval,
  respondToHubAgentClarification,
  createHubAgentModelClient: createModelClient,
  resolveHubAgentModelProviderConfigs: resolveAgentGatewayModelConfigs,
  getHubAgent: getGlobalHubAgent,
  resolveHubAgentProviderRuntimeConfig: resolveAgentGatewayRuntime,
  createHubAgentAuthorizedProviderFetch,
  drainPrimaryAgentSessions: profile => SessionDeleter.getInstance().drain(profile),
  getAvailableModelGroups: getAvailableModelGroupsForProfile,
})
