import type { RouteLocationRaw } from 'vue-router'
import type { InstalledPlugin } from '@/api/studio/plugins'
import { pluginNavigation, pluginPageLocation } from '@/plugins/navigation'
import { pluginNavigationId } from '../../../shared/navigation-settings'

export interface NavigationEntry {
  id: string
  label?: string
  title?: string
  path?: string
  avatar?: string
  icon?: string
  to: RouteLocationRaw
  plugin?: InstalledPlugin
  viewId?: string
}

export const builtinNavigationEntries = (canManageAgents: boolean): NavigationEntry[] => ([
  { key: 'person', route: 'hermes.person', label: 'person.subtitle', avatar: '/person/idle.gif' },
  { key: 'chat', route: 'hermes.chat', label: 'sidebar.singleChat', path: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { key: 'group', route: 'hermes.groupChat', label: 'sidebar.groupChat', path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { key: 'workflow', route: 'hermes.workflow', label: 'sidebar.workflow', path: 'M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 12h3a4 4 0 0 0 4-4V6M8 12h3a4 4 0 0 1 4 4v2' },
  { key: 'history', route: 'hermes.history', label: 'sidebar.history', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2' },
  { key: 'connections', route: 'hermes.connections', label: 'sidebar.connections', path: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4' },
  ...(canManageAgents ? [{ key: 'agents', route: 'hermes.agentManager', label: 'sidebar.agentManager', path: 'M12 8V4H8M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3M2 14h2M20 14h2M9 13v2M15 13v2' }] : []),
  { key: 'models', route: 'hermes.models', label: 'sidebar.models', path: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3' },
  { key: 'usage', route: 'hermes.usage', label: 'sidebar.usage', path: 'M3 12h4v9H3zM10 7h4v14h-4zM17 3h4v18h-4z' },
  { key: 'studioPlugins', route: 'studio.plugins', label: 'studioPlugins.title' },
]).map(entry => ({ id: entry.key, label: entry.label, path: 'path' in entry ? entry.path : undefined,
  avatar: 'avatar' in entry ? entry.avatar : undefined, to: { name: entry.route } }))

export function navigationCatalog(plugins: InstalledPlugin[], canManageAgents: boolean): NavigationEntry[] {
  return [...builtinNavigationEntries(canManageAgents), ...plugins.filter(plugin => plugin.status === 'active').flatMap(plugin =>
    pluginNavigation(plugin).map(view => ({ id: pluginNavigationId(plugin.manifest.id, view.id), title: view.title, icon: view.icon,
      plugin, viewId: view.id, to: pluginPageLocation(plugin, view.id) }))) ]
}

export function selectedNavigationEntries(catalog: NavigationEntry[], items: string[]) {
  const entries = new Map(catalog.map(entry => [entry.id, entry]))
  return items.flatMap(id => { const entry = entries.get(id); return entry ? [entry] : [] })
}

/** Sort only displayed slots, preserving entries hidden by account permissions. */
export function reorderNavigationEntries(items: string[], visibleOrder: string[]) {
  const visible = new Set(visibleOrder)
  let index = 0
  return items.map(id => visible.has(id) ? visibleOrder[index++]! : id)
}
