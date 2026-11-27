import { resolveAgentGatewayRuntime, resolveAgentGatewayModelConfigs } from './provider-gateway-client'
import { getCodingAgentManagedMcpServerConfigs, type CodingAgentId } from '../modules/coding-agents/services'
import './agent-profile-adapter'
import { AgentBridgeClient } from '../modules/hermes/services/bridge/client'
import { getAgentBridgeManager } from '../modules/hermes/services/bridge/manager'
import { redactAgentBridgeError } from '../modules/hermes/services/bridge/redact'
import { codingAgentRunManager } from '../modules/coding-agents/services/runtime/run-manager'
import { sendCodingAgentRunInput, startCodingAgentRun } from '../modules/coding-agents'
import {
  handleCodingAgentSessionCommand,
  parseCodingAgentSessionCommand,
} from '../modules/coding-agents/services/session-command'
import {
  abortGlobalHubAgentBackgroundTasks,
  getGlobalHubAgent,
  hasGlobalHubAgentBackgroundTasks,
} from '../modules/hub-agent/services/manager'
import { pendingHubAgentToolApprovalEvents, respondToHubAgentToolApproval, waitForHubAgentToolApproval } from '../modules/hub-agent/services/approvals'
import { pendingHubAgentClarificationEvents, respondToHubAgentClarification, waitForHubAgentClarification } from '../modules/hub-agent/services/clarifications'
import { resolveHubAgentMcpServers } from '../modules/hub-agent/services/mcp'
import {
  createHubAgentAuthorizedProviderFetch,
} from '../modules/hub-agent/services/provider-runtime'
import { configureChatAgentRuntime } from '../modules/studio/public/chat-agent-runtime'
import {
  agentReasoningText,
  createModelClient,
  DEFAULT_MODEL_REQUEST_TIMEOUT_MS,
  normalizeAgentReasoning,
  projectBrowserHistory,
  serializeAgentReasoningDetails,
} from '../../../hub-agent/src'

configureChatAgentRuntime({
  projectBrowserHistory,
  createPrimaryAgentBridge: options => new AgentBridgeClient(options),
  getPrimaryAgentBridgeManager: getAgentBridgeManager,
  redactPrimaryAgentBridgeError: redactAgentBridgeError,
  codingAgentRunManager,
  sendCodingAgentRunInput,
  startCodingAgentRun,
  handleCodingAgentSessionCommand,
  parseCodingAgentSessionCommand,
  getHubAgent: getGlobalHubAgent,
  abortHubAgentBackgroundTasks: abortGlobalHubAgentBackgroundTasks,
  hasHubAgentBackgroundTasks: hasGlobalHubAgentBackgroundTasks,
  createHubAgentModelClient: createModelClient,
  resolveHubAgentModelProviderConfigs: resolveAgentGatewayModelConfigs,
  hubAgentModelRequestTimeoutMs: DEFAULT_MODEL_REQUEST_TIMEOUT_MS,
  hubAgentReasoningText: agentReasoningText,
  normalizeHubAgentReasoning: normalizeAgentReasoning,
  serializeHubAgentReasoningDetails: serializeAgentReasoningDetails,
  pendingHubAgentInteractions: sessionId => [...pendingHubAgentToolApprovalEvents(sessionId), ...pendingHubAgentClarificationEvents(sessionId)],
  waitForHubAgentToolApproval,
  waitForHubAgentClarification,
  getCodingAgentMcpServers: (id, profile) => getCodingAgentManagedMcpServerConfigs(id as CodingAgentId, profile),
  resolveHubAgentMcpServers,
  resolveHubAgentProviderRuntimeConfig: resolveAgentGatewayRuntime,
  createHubAgentAuthorizedProviderFetch,
  respondToHubAgentToolApproval,
  respondToHubAgentClarification,
})
