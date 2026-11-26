import { configurePluginMcpSync, pluginMcpServers } from '../modules/studio/public/plugin-mcp'
import { injectBundledMcpServer } from '../modules/hermes/services/mcp/studio-autoinject'
import { synchronizeHermesPluginMcpServers } from '../modules/hermes/services/mcp/plugin-sync'
import { injectManagedHubAgentMcpServers } from '../modules/hub-agent/services/mcp'
import { codingAgentRunManager } from '../modules/coding-agents/services/runtime/run-manager'

export function registerPluginMcpSync(): () => void {
  let previous = pluginMcpServers().map(server => server.name)
  return configurePluginMcpSync(async () => {
    const current = pluginMcpServers().map(server => server.name)
    const namesChanged = JSON.stringify(current) !== JSON.stringify(previous)
    const results = await Promise.allSettled([
      injectBundledMcpServer(), Promise.resolve().then(() => injectManagedHubAgentMcpServers()),
    ])
    if (namesChanged) codingAgentRunManager.invalidateMatching(() => true)
    // Runtime cleanup also runs when a config write fails: the uninstalled plugin is already unavailable.
    await synchronizeHermesPluginMcpServers([...new Set(['agenthub-plugins', ...previous, ...current])], previous.filter(name => !current.includes(name)))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    previous = current
  })
}
