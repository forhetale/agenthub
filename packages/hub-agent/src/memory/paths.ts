import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { HubAgentDirectoryManager } from '../directories'

export interface HubAgentDataPathOptions {
  baseDirectory?: string
  env?: Record<string, string | undefined>
  homeDir?: string
  packageRoot?: string
}

export function resolveHubAgentDataDirectory(options: HubAgentDataPathOptions = {}): string {
  if (isHubAgentDevelopmentEnvironment(options.env ?? process.env)) {
    const packageRoot = options.packageRoot || resolve(__dirname, '..', '..')
    return join(packageRoot, '.hub-agent')
  }
  return new HubAgentDirectoryManager(options.baseDirectory || options.homeDir || homedir()).rootDirectory
}

export function resolveHubAgentDatabasePath(options: HubAgentDataPathOptions = {}): string {
  return join(resolveHubAgentDataDirectory(options), 'hub-agent.db')
}

export function isHubAgentDevelopmentEnvironment(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.NODE_ENV !== 'test' && env.VITEST !== 'true'
}
