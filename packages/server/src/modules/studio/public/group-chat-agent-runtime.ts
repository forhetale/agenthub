export type GroupPrimaryAgentBridge = Record<string, any>
export type GroupPrimaryAgentBridgeContextEstimate = any
export type GroupPrimaryAgentBridgeMessage = any
export type GroupPrimaryAgentBridgeOutput = any

export interface GroupChatAgentRuntimeDependencies {
  createPrimaryAgentBridge(options?: Record<string, unknown>): GroupPrimaryAgentBridge
  cancelHubAgentClarification(...args: any[]): any
  respondToHubAgentToolApproval(...args: any[]): any
  respondToHubAgentClarification(...args: any[]): any
  createHubAgentModelClient(...args: any[]): any
  resolveHubAgentModelProviderConfigs(...args: any[]): any
  getHubAgent(profile: string): any
  resolveHubAgentProviderRuntimeConfig(...args: any[]): Promise<any>
  createHubAgentAuthorizedProviderFetch(...args: any[]): any
  drainPrimaryAgentSessions(profile: string): Promise<any>
  getAvailableModelGroups(profile: string): Promise<any[]>
}

let dependencies: GroupChatAgentRuntimeDependencies | null = null

export function configureGroupChatAgentRuntime(next: GroupChatAgentRuntimeDependencies): void {
  dependencies = next
}

function configured(): GroupChatAgentRuntimeDependencies {
  if (!dependencies) throw new Error('Studio group chat Agent runtime has not been configured')
  return dependencies
}

export const createGroupPrimaryAgentBridge = (options?: Record<string, unknown>) => configured().createPrimaryAgentBridge(options)
export const cancelGroupHubAgentClarification = (...args: any[]) => configured().cancelHubAgentClarification(...args)
export const respondToGroupHubAgentToolApproval = (...args: any[]) => configured().respondToHubAgentToolApproval(...args)
export const respondToGroupHubAgentClarification = (...args: any[]) => configured().respondToHubAgentClarification(...args)
export const createGroupHubAgentModelClient = (...args: any[]) => configured().createHubAgentModelClient(...args)
export const resolveGroupHubAgentModelProviderConfigs = (...args: any[]) => configured().resolveHubAgentModelProviderConfigs(...args)
export const getGroupHubAgent = (profile: string) => configured().getHubAgent(profile)
export const resolveGroupHubAgentProviderRuntimeConfig = (...args: any[]) => configured().resolveHubAgentProviderRuntimeConfig(...args)
export const createGroupHubAgentAuthorizedProviderFetch = (...args: any[]) => configured().createHubAgentAuthorizedProviderFetch(...args)
export const drainGroupPrimaryAgentSessions = (profile: string) => configured().drainPrimaryAgentSessions(profile)
export const getGroupAvailableModelGroups = (profile: string) => configured().getAvailableModelGroups(profile)
