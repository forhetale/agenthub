import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface HubAgentExternalSkillDirectory {
  /** Absolute directory used for discovery. */
  directory: string
  /** Original config value shown in the UI. */
  sourcePath: string
}

export interface HubAgentExternalSkillDirectoryStatus extends HubAgentExternalSkillDirectory {
  exists: boolean
  isDirectory: boolean
}

export interface ResolveHubAgentExternalSkillDirectoriesOptions {
  env?: NodeJS.ProcessEnv
  homeDirectory?: string
  cwd?: string
  localSkillDirectory?: string
}

/** Resolve Profile config paths while preserving their user-written form. */
export function resolveHubAgentExternalSkillDirectories(
  entries: readonly string[] = [],
  options: ResolveHubAgentExternalSkillDirectoriesOptions = {},
): HubAgentExternalSkillDirectory[] {
  const env = options.env ?? process.env
  const homeDirectory = resolve(options.homeDirectory || homedir())
  const cwd = resolve(options.cwd || process.cwd())
  const localDirectory = options.localSkillDirectory
    ? resolve(options.localSkillDirectory)
    : undefined
  const seen = new Set<string>()
  const directories: HubAgentExternalSkillDirectory[] = []

  for (const value of entries) {
    const sourcePath = String(value || '').trim()
    if (!sourcePath) continue
    const expandedEnvironment = sourcePath.replace(
      /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (_match, braced: string | undefined, bare: string | undefined) => env[braced || bare || ''] || '',
    )
    const expandedHome = expandedEnvironment === '~'
      ? homeDirectory
      : expandedEnvironment.startsWith('~/')
        ? join(homeDirectory, expandedEnvironment.slice(2))
        : expandedEnvironment
    const directory = resolve(cwd, expandedHome)
    if (directory === localDirectory || seen.has(directory)) continue
    seen.add(directory)
    directories.push({ directory, sourcePath })
  }

  return directories
}

export async function describeHubAgentExternalSkillDirectories(
  entries: readonly string[] = [],
  options: ResolveHubAgentExternalSkillDirectoriesOptions = {},
): Promise<HubAgentExternalSkillDirectoryStatus[]> {
  return Promise.all(resolveHubAgentExternalSkillDirectories(entries, options).map(async entry => {
    try {
      const info = await stat(entry.directory)
      return { ...entry, exists: true, isDirectory: info.isDirectory() }
    } catch {
      return { ...entry, exists: false, isDirectory: false }
    }
  }))
}
