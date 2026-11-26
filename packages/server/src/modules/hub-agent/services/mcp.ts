import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type HubAgentSetup,
  type HubAgentMcpServerConfig as PersistedHubAgentMcpServerConfig,
} from '../../../../../hub-agent/src'
import { createMcpToolProvider } from '../../../../../hub-agent/src/tools/mcp'
import { config } from '../../studio/public/config'
import { pluginMcpServers, isPluginMcpServerName } from '../../studio/public/plugin-mcp'
import { setupGlobalHubAgent } from './manager'

const MANAGED_ENV_KEY = 'HERMES_WEB_UI_MANAGED_MCP'
const MANAGED_SERVERS: ReadonlyArray<{ name: string; toolset: string }> = [
  { name: 'agenthub-api', toolset: 'api' },
  { name: 'agenthub-plugins', toolset: 'plugins' },
  { name: 'agenthub-browser', toolset: 'browser' },
  { name: 'agenthub-use', toolset: 'use' },
]
const MANAGED_SERVER_NAMES = new Set(MANAGED_SERVERS.map(server => server.name))
const LEGACY_MANAGED_SERVER_NAMES = new Set([
  'ekko-studio-api',
  'ekko-studio-plugins',
  'ekko-studio-browser',
  'ekko-studio-use',
  'ekko-studio-interaction',
  'hermes-studio-api',
  'hermes-studio-plugins',
  'hermes-studio-browser',
  'hermes-studio-devices',
  'ekko-studio-devices',
  'hermes-studio-use',
  'hermes-studio-interaction',
  'hermes-studio-mcp',
  'hermes-studio',
  'ekko-studio-mcp',
  'hermes-web-ui-mcp',
])
const LEGACY_MANAGED_COMMANDS = new Set([
  'hermes-lan-peer-mcp',
  'hermes-devices-mcp',
  'hermes-web-ui-mcp',
  'ekko-studio-mcp',
  'hermes-studio-mcp',
  'agenthub-mcp',
])
const MCP_SERVER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/

export type HubAgentMcpServers = Record<string, unknown>
export type HubAgentMcpServerConfig = PersistedHubAgentMcpServerConfig

export interface HubAgentMcpServerInfo {
  name: string
  managed: boolean
  config: HubAgentMcpServerConfig
}

export type HubAgentMcpInjectionStatus = 'injected' | 'updated' | 'unchanged' | 'skipped'

export interface HubAgentMcpInjectionTargetResult {
  profile: string
  status: HubAgentMcpInjectionStatus
  reason?: string
}

export interface HubAgentMcpInjectionResult {
  serverNames: string[]
  command: string
  targets: HubAgentMcpInjectionTargetResult[]
}

function isEnabledEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function isDesktopRuntime(): boolean {
  return String(process.env.HERMES_DESKTOP || '').trim().toLowerCase() === 'true'
}

function allowTransientAutoinject(): boolean {
  return isEnabledEnv(process.env.HERMES_WEB_UI_ALLOW_TRANSIENT_MCP_AUTOINJECT)
}

function normalizedPathPrefix(pathname: string): string {
  return pathname.replace(/\/+$/, '') + '/'
}

function isTransientAppHome(appHome: string): boolean {
  const normalized = normalizedPathPrefix(appHome)
  const transientRoots = [tmpdir(), '/tmp', '/private/tmp']
    .filter(Boolean)
    .map(root => normalizedPathPrefix(root))
  return transientRoots.some(root => normalized.startsWith(root))
}

function shouldInjectManagedMcpServers(): boolean {
  if (isEnabledEnv(process.env.HERMES_WEB_UI_DISABLE_MCP_AUTOINJECT)) return false
  return !isTransientAppHome(config.appHome) || allowTransientAutoinject()
}

function candidateBundledMcpScripts(): string[] {
  return [
    process.env.HERMES_WEB_UI_MCP_BIN,
    join(process.cwd(), 'bin/agenthub-mcp.mjs'),
    join(__dirname, '../../../bin/agenthub-mcp.mjs'),
    join(__dirname, '../../../../../../bin/agenthub-mcp.mjs'),
    join(process.cwd(), 'bin/hermes-web-ui-mcp.mjs'),
    join(__dirname, '../../../bin/hermes-web-ui-mcp.mjs'),
    join(__dirname, '../../../../../../bin/hermes-web-ui-mcp.mjs'),
  ].filter((value): value is string => !!value)
}

function bundledMcpScriptPath(): string | null {
  return candidateBundledMcpScripts().find(candidate => existsSync(candidate)) || null
}

function runtimeNodePath(): string | null {
  return process.env.HERMES_AGENT_NODE?.trim() || null
}

function managedCommandConfig(toolset: string): Pick<HubAgentMcpServerConfig, 'command' | 'args'> {
  const bundledScript = bundledMcpScriptPath()
  if (bundledScript) {
    return { command: runtimeNodePath() || process.execPath, args: [bundledScript, toolset] }
  }
  if (isDesktopRuntime()) return { command: 'agenthub-mcp', args: [toolset] }
  return { command: 'agenthub-mcp', args: [toolset] }
}

function managedMcpServerConfig(
  profile: string,
  serverName: string,
  toolset: string,
): HubAgentMcpServerConfig {
  return {
    ...managedCommandConfig(toolset),
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      HERMES_WEB_UI_URL: `http://127.0.0.1:${config.port}`,
      HERMES_WEB_UI_HOME: config.appHome,
      HERMES_WEBUI_STATE_DIR: config.appHome,
      HERMES_WEB_UI_PROFILE: profile,
      HERMES_MCP_SERVER_NAME: serverName,
      HERMES_MCP_TOOLSET: toolset,
      HERMES_MCP_NATIVE_TASK_PLAN: '1',
      [MANAGED_ENV_KEY]: '1',
    },
    enabled: true,
  }
}

export function buildManagedHubAgentMcpServers(profile: string): Record<string, HubAgentMcpServerConfig> {
  if (!shouldInjectManagedMcpServers()) return {}
  const normalizedProfile = normalizeProfile(profile)
  return Object.fromEntries([...MANAGED_SERVERS, ...pluginMcpServers()].map(server => [
    server.name,
    managedMcpServerConfig(normalizedProfile, server.name, server.toolset),
  ]))
}

/** Synchronize Studio-owned MCP definitions into Hub Agent's canonical config.json. */
export function injectManagedHubAgentMcpServers(
  setup: HubAgentSetup = setupGlobalHubAgent(),
): HubAgentMcpInjectionResult {
  const managedServers = [...MANAGED_SERVERS, ...pluginMcpServers()]
  const managedNames = new Set(managedServers.map(server => server.name))
  const desiredDefault = managedMcpServerConfig(
    'default',
    MANAGED_SERVERS[0].name,
    MANAGED_SERVERS[0].toolset,
  )
  const result: HubAgentMcpInjectionResult = {
    serverNames: [...managedNames],
    command: String(desiredDefault.command),
    targets: [],
  }
  if (!shouldInjectManagedMcpServers()) return result

  const current = setup.config.read()
  const next = structuredClone(current)
  let configChanged = false
  const profiles = new Set(['default', ...setup.profiles().map(item => item.profile)])

  for (const profile of profiles) {
    const existingProfile = next.mcp.profiles[profile]
    const servers = { ...(existingProfile?.servers ?? {}) }
    const unmanagedCollision = managedServers.find(server => {
      const existing = servers[server.name]
      return existing && !isManagedServerConfig(existing)
    })
    if (unmanagedCollision) {
      result.targets.push({
        profile,
        status: 'skipped',
        reason: `existing ${unmanagedCollision.name} MCP server is not managed by AgentHub`,
      })
      continue
    }

    let profileChanged = false
    let injected = false
    let hadManagedExisting = false
    for (const { name } of MANAGED_SERVERS) {
      for (const legacyPrefix of ['ekko-studio-', 'hermes-studio-']) {
        const legacyName = name.replace(/^agenthub-/, legacyPrefix)
        const legacy = servers[legacyName]
        if (!servers[name] && isManagedServerConfig(legacy)) {
          servers[name] = legacy
          delete servers[legacyName]
          profileChanged = true
        }
      }
    }

    for (const [name, server] of Object.entries(servers)) {
      if (managedNames.has(name)) continue
      if (!LEGACY_MANAGED_SERVER_NAMES.has(name) && !isManagedServerConfig(server)) continue
      if (LEGACY_MANAGED_SERVER_NAMES.has(name) && !isManagedServerConfig(server)) continue
      delete servers[name]
      profileChanged = true
      hadManagedExisting = true
    }

    for (const definition of managedServers) {
      const existing = servers[definition.name]
      const desired = managedMcpServerConfig(profile, definition.name, definition.toolset)
      if (existing?.enabled === false) desired.enabled = false
      if (!existing) {
        servers[definition.name] = desired
        profileChanged = true
        injected = true
        continue
      }
      hadManagedExisting = true
      if (!sameServerConfig(existing, desired)) {
        servers[definition.name] = desired
        profileChanged = true
      }
    }

    if (profileChanged) {
      next.mcp.profiles[profile] = { ...existingProfile, servers }
      configChanged = true
    }
    result.targets.push({
      profile,
      status: profileChanged
        ? injected && !hadManagedExisting ? 'injected' : 'updated'
        : 'unchanged',
    })
  }

  if (configChanged) setup.config.replace(next)
  return result
}

export function resolveHubAgentMcpServers(
  profile: string,
  provided?: HubAgentMcpServers,
  setup?: HubAgentSetup,
): HubAgentMcpServers | undefined {
  let configured: Record<string, HubAgentMcpServerConfig> = {}
  try {
    const resolved = setup ?? setupGlobalHubAgent()
    if (resolved.config.read().mcp.enabled) configured = resolved.config.listMcpServers(profile)
  } catch {
    // A malformed settings file must not prevent a Hub Agent run from starting.
  }
  const merged = { ...configured, ...(provided || {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}

export function isManagedHubAgentMcpServerName(name: string): boolean {
  return MANAGED_SERVER_NAMES.has(name) || isPluginMcpServerName(name)
}

export function listHubAgentMcpServers(
  profile: string,
  setup?: HubAgentSetup,
): HubAgentMcpServerInfo[] {
  const servers = (setup ?? setupGlobalHubAgent()).config.listMcpServers(profile)
  return Object.entries(servers).map(([name, serverConfig]) => ({
    name,
    managed: isManagedHubAgentMcpServerName(name) && isManagedServerConfig(serverConfig),
    config: normalizeHubAgentMcpServerConfig(serverConfig),
  }))
}

export async function createHubAgentMcpServer(
  profile: string,
  name: string,
  serverConfig: unknown,
  setup?: HubAgentSetup,
): Promise<HubAgentMcpServerInfo> {
  const serverName = validateMcpServerName(name)
  const resolved = setup ?? setupGlobalHubAgent()
  if (resolved.config.getMcpServer(serverName, profile)) throw new Error(`MCP server already exists: ${serverName}.`)
  const normalized = normalizeHubAgentMcpServerConfig(serverConfig)
  resolved.config.setMcpServer(serverName, normalized, profile)
  return {
    name: serverName,
    managed: isManagedHubAgentMcpServerName(serverName) && isManagedServerConfig(normalized),
    config: normalized,
  }
}

export async function updateHubAgentMcpServer(
  profile: string,
  name: string,
  serverConfig: unknown,
  setup?: HubAgentSetup,
): Promise<HubAgentMcpServerInfo> {
  const serverName = validateMcpServerName(name)
  const resolved = setup ?? setupGlobalHubAgent()
  if (!resolved.config.getMcpServer(serverName, profile)) throw new Error(`MCP server not found: ${serverName}.`)
  const normalized = normalizeHubAgentMcpServerConfig(serverConfig)
  resolved.config.setMcpServer(serverName, normalized, profile)
  return {
    name: serverName,
    managed: isManagedHubAgentMcpServerName(serverName) && isManagedServerConfig(normalized),
    config: normalized,
  }
}

export async function setHubAgentMcpServerEnabled(
  profile: string,
  name: string,
  enabled: boolean,
  setup?: HubAgentSetup,
): Promise<HubAgentMcpServerInfo> {
  const serverName = validateMcpServerName(name)
  if (typeof enabled !== 'boolean') throw new Error('MCP server enabled must be a boolean.')
  const resolved = setup ?? setupGlobalHubAgent()
  const existing = resolved.config.getMcpServer(serverName, profile)
  if (!existing) throw new Error(`MCP server not found: ${serverName}.`)
  const managed = isManagedHubAgentMcpServerName(serverName) && isManagedServerConfig(existing)
  const updated = { ...existing, enabled }
  resolved.config.setMcpServer(serverName, updated, profile)
  return { name: serverName, managed, config: updated }
}

export async function deleteHubAgentMcpServer(
  profile: string,
  name: string,
  setup?: HubAgentSetup,
): Promise<void> {
  const serverName = validateMcpServerName(name)
  const resolved = setup ?? setupGlobalHubAgent()
  if (!resolved.config.deleteMcpServer(serverName, profile)) throw new Error(`MCP server not found: ${serverName}.`)
}

export async function testHubAgentMcpServer(
  profile: string,
  name: string,
  setup?: HubAgentSetup,
): Promise<Array<{ name: string; description: string }>> {
  const server = listHubAgentMcpServers(profile, setup).find(candidate => candidate.name === name)
  if (!server) throw new Error(`MCP server not found: ${name}.`)
  if (server.config.enabled === false) throw new Error('Enable the MCP server before testing it.')
  const provider = createMcpToolProvider()
  try {
    const tools = await provider.listTools({
      mcpServers: { [name]: server.config },
      timeoutMs: 5_000,
    })
    return tools.map(tool => ({
      name: tool.definition.name,
      description: tool.definition.description || '',
    }))
  } finally {
    await provider.listTools({ mcpServers: {} })
  }
}

function isManagedServerConfig(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const server = value as Record<string, unknown>
  const env = server.env
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    if ((env as Record<string, unknown>)[MANAGED_ENV_KEY] === '1') return true
  }
  return typeof server.command === 'string' && LEGACY_MANAGED_COMMANDS.has(server.command)
}

function sameServerConfig(left: HubAgentMcpServerConfig, right: HubAgentMcpServerConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizeProfile(profile: string): string {
  return String(profile || '').trim() || 'default'
}

function validateMcpServerName(name: string): string {
  const normalized = String(name || '').trim()
  if (!MCP_SERVER_NAME_PATTERN.test(normalized)) {
    throw new Error('MCP server names may contain letters, numbers, dots, underscores, and hyphens (maximum 64 characters).')
  }
  return normalized
}

function normalizeMcpServerType(value: unknown): '' | 'stdio' | 'streamable_http' {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'stdio') return 'stdio'
  if (
    normalized === 'http'
    || normalized === 'streamable_http'
    || normalized === 'streamable-http'
    || normalized === 'streamablehttp'
  ) {
    return 'streamable_http'
  }
  throw new Error('MCP server type must be stdio or streamable_http.')
}

function normalizeHubAgentMcpServerConfig(value: unknown): HubAgentMcpServerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MCP server config must be an object.')
  const candidate = value as Record<string, unknown>
  const command = typeof candidate.command === 'string' ? candidate.command.trim() : ''
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
  const configuredType = normalizeMcpServerType(candidate.type)
  const type = configuredType || (url && !command ? 'streamable_http' : 'stdio')
  if (type === 'stdio' && !command) throw new Error('MCP server command is required for stdio.')
  if (type === 'streamable_http' && !url) throw new Error('MCP server url is required for streamable_http.')
  if (url) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error('MCP server url must be valid.')
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('MCP server url must use http or https.')
    }
  }
  if (candidate.args !== undefined && (!Array.isArray(candidate.args) || candidate.args.some(arg => typeof arg !== 'string'))) {
    throw new Error('MCP server args must be an array of strings.')
  }
  if (candidate.env !== undefined && (!candidate.env || typeof candidate.env !== 'object' || Array.isArray(candidate.env))) {
    throw new Error('MCP server env must be an object of string values.')
  }
  const env = candidate.env as Record<string, unknown> | undefined
  if (env && Object.values(env).some(item => typeof item !== 'string')) {
    throw new Error('MCP server env must be an object of string values.')
  }
  if (candidate.headers !== undefined && (!candidate.headers || typeof candidate.headers !== 'object' || Array.isArray(candidate.headers))) {
    throw new Error('MCP server headers must be an object of string values.')
  }
  const headers = candidate.headers as Record<string, unknown> | undefined
  if (headers && Object.values(headers).some(item => typeof item !== 'string')) {
    throw new Error('MCP server headers must be an object of string values.')
  }
  if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') {
    throw new Error('MCP server enabled must be a boolean.')
  }
  return {
    ...(configuredType || type === 'streamable_http' ? { type: type as 'stdio' | 'streamable_http' } : {}),
    ...(type === 'stdio' ? {
      command,
      ...(candidate.args ? { args: [...candidate.args] as string[] } : {}),
      ...(env ? { env: { ...env } as Record<string, string> } : {}),
    } : {}),
    ...(type === 'streamable_http' ? {
      url,
      ...(headers ? { headers: { ...headers } as Record<string, string> } : {}),
    } : {}),
    enabled: candidate.enabled !== false,
  }
}
