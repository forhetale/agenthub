import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  describeHubAgentExternalSkillDirectories,
  type AgentToolResult,
  type HubAgentSetup,
} from '../../../../../hub-agent/src'
import { setupGlobalHubAgent } from './manager'

export interface HubAgentSkillSummary {
  name: string
  description: string
  category: string
  source: 'builtin' | 'local' | 'external'
  sourcePath?: string
  enabled: boolean
  managedByHubAgent: boolean
  builtIn: boolean
}

export interface HubAgentSkillDetail extends HubAgentSkillSummary {
  content: string
}

export interface HubAgentSkillFileEntry {
  path: string
  name: string
  isDir: boolean
}

export interface HubAgentExternalDirectoryEntry {
  raw: string
  expanded: string
  exists: boolean
  isDir: boolean
}

function normalizeProfile(profile: string): string {
  return String(profile || '').trim() || 'default'
}

function setupForProfile(profile: string, setup?: HubAgentSetup): HubAgentSetup {
  const resolved = setup || setupGlobalHubAgent()
  resolved.ensureProfile(profile)
  return resolved
}

function assertToolResult(result: AgentToolResult): void {
  if (!result.ok) throw new Error(result.error || result.content || 'Hub Agent skill operation failed.')
}

function skillContent(result: AgentToolResult): string {
  const content = String(result.content || '')
  const firstLineEnd = content.indexOf('\n')
  return firstLineEnd >= 0 ? content.slice(firstLineEnd + 1) : ''
}

export async function listHubAgentSkills(
  profileInput: string,
  query = '',
  setup?: HubAgentSetup,
): Promise<HubAgentSkillSummary[]> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  // Refresh is an explicit rescan boundary: synchronize newly shipped built-ins
  // even when the process-level Profile layout was initialized earlier.
  resolved.directories.profileSkillsDirectory(profile)
  const result = await resolved.skill.discover(query, { profile })
  assertToolResult(result)
  const data = result.data as { skills?: HubAgentSkillSummary[] } | undefined
  return Array.isArray(data?.skills) ? data.skills : []
}

export async function getHubAgentSkill(
  profileInput: string,
  name: string,
  setup?: HubAgentSetup,
): Promise<HubAgentSkillDetail> {
  const profile = normalizeProfile(profileInput)
  const result = await setupForProfile(profile, setup).skill.view(name, undefined, { profile })
  assertToolResult(result)
  const data = result.data as Omit<HubAgentSkillDetail, 'content'> | undefined
  if (!data?.name) throw new Error('Skill not found.')
  return {
    name: data.name,
    description: data.description || '',
    category: data.category || 'misc',
    source: data.source || (data.builtIn ? 'builtin' : 'local'),
    ...(data.sourcePath ? { sourcePath: data.sourcePath } : {}),
    enabled: data.enabled !== false,
    managedByHubAgent: Boolean(data.managedByHubAgent),
    builtIn: Boolean(data.builtIn),
    content: skillContent(result),
  }
}

export async function createHubAgentSkill(
  profileInput: string,
  input: { name: string; content: string; category?: string },
  setup?: HubAgentSetup,
): Promise<HubAgentSkillDetail> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  const result = await resolved.skill.create({ ...input, profile })
  assertToolResult(result)
  return getHubAgentSkill(profile, input.name, resolved)
}

export async function updateHubAgentSkill(
  profileInput: string,
  name: string,
  content: string,
  setup?: HubAgentSetup,
): Promise<HubAgentSkillDetail> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  const existing = await getHubAgentSkill(profile, name, resolved)
  if (existing.builtIn) throw new Error(`Built-in skill cannot be edited: ${existing.name}.`)
  if (existing.source !== 'local') {
    throw new Error(`Only local skills can be edited (this skill is ${existing.source}).`)
  }
  const result = await resolved.skill.edit({ name, content, profile })
  assertToolResult(result)
  return getHubAgentSkill(profile, name, resolved)
}

export async function deleteHubAgentSkill(
  profileInput: string,
  name: string,
  setup?: HubAgentSetup,
): Promise<void> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  const existing = await getHubAgentSkill(profile, name, resolved)
  if (existing.builtIn) throw new Error(`Built-in skill cannot be deleted: ${existing.name}.`)
  if (existing.source !== 'local') {
    throw new Error(`Only local skills can be deleted (this skill is ${existing.source}).`)
  }
  const result = await resolved.skill.delete(name, {
    profile,
    confirmed: true,
  })
  assertToolResult(result)
  resolved.config.setSkillEnabled(name, true, profile)
}

export async function setHubAgentSkillEnabled(
  profileInput: string,
  name: string,
  enabled: boolean,
  setup?: HubAgentSetup,
): Promise<void> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  await getHubAgentSkill(profile, name, resolved)
  resolved.config.setSkillEnabled(name, enabled, profile)
}

export async function listHubAgentExternalSkillDirectories(
  profileInput: string,
  setup?: HubAgentSetup,
): Promise<HubAgentExternalDirectoryEntry[]> {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  const layout = resolved.ensureProfile(profile)
  const entries = await describeHubAgentExternalSkillDirectories(
    resolved.config.getSkillProfile(profile).externalDirectories,
    { localSkillDirectory: layout.skillDirectory },
  )
  return entries.map(entry => ({
    raw: entry.sourcePath,
    expanded: entry.directory,
    exists: entry.exists,
    isDir: entry.isDirectory,
  }))
}

export function updateHubAgentExternalSkillDirectories(
  profileInput: string,
  directories: string[],
  setup?: HubAgentSetup,
): void {
  const profile = normalizeProfile(profileInput)
  const resolved = setupForProfile(profile, setup)
  resolved.config.setSkillExternalDirectories(directories, profile)
}

export async function getHubAgentSkillFile(
  profileInput: string,
  name: string,
  filePath: string,
  setup?: HubAgentSetup,
): Promise<string> {
  const profile = normalizeProfile(profileInput)
  const result = await setupForProfile(profile, setup).skill.view(name, filePath, { profile })
  assertToolResult(result)
  return skillContent(result)
}

export async function listHubAgentSkillFiles(
  profileInput: string,
  name: string,
  setup?: HubAgentSetup,
): Promise<HubAgentSkillFileEntry[]> {
  const profile = normalizeProfile(profileInput)
  const result = await setupForProfile(profile, setup).skill.view(name, undefined, { profile })
  assertToolResult(result)
  const baseDirectory = String((result.data as { baseDirectory?: string } | undefined)?.baseDirectory || '')
  if (!baseDirectory) return []
  const files: HubAgentSkillFileEntry[] = []
  for (const directory of ['references', 'templates', 'scripts', 'assets']) {
    await appendFiles(join(baseDirectory, directory), directory, files)
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function appendFiles(
  directory: string,
  prefix: string,
  files: HubAgentSkillFileEntry[],
): Promise<void> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    const path = `${prefix}/${entry.name}`
    if (entry.isDirectory()) await appendFiles(join(directory, entry.name), path, files)
    else if (entry.isFile()) files.push({ path, name: entry.name, isDir: false })
  }
}
