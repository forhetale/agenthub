import { HubAgentDirectoryManager } from '../../../hub-agent/src/directories'
import { config } from '../modules/studio/public/config'

/** Use the same per-profile, per-session directory and retention as Hub Agent single chat. */
export function createPersonDefaultWorkspace(profile: string, sessionId: string): string {
  return new HubAgentDirectoryManager(config.appHome).sessionWorkspaceDirectory(profile, sessionId)
}
