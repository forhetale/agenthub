import { BUILTIN_NAVIGATION_IDS, defaultNavigationSettings, validateNavigationSettings, type NavigationSettings } from '../../../../../shared/navigation-settings'
import { getDb } from '../infrastructure/database'
import { USER_NAVIGATION_TABLE } from '../infrastructure/database/schemas'

const NAVIGATION_SCHEMA_VERSION = 2
const BUILTIN_NAVIGATION_SET = new Set<string>(BUILTIN_NAVIGATION_IDS)

function stripRemovedBuiltinNavigationItems(items: unknown): { items: unknown[]; stripped: boolean } {
  if (!Array.isArray(items)) return { items: [], stripped: false }
  const next: unknown[] = []
  let stripped = false
  for (const item of items) {
    if (typeof item === 'string' && !item.startsWith('plugin:') && !BUILTIN_NAVIGATION_SET.has(item)) {
      stripped = true
      continue
    }
    next.push(item)
  }
  return { items: next, stripped }
}

export function getUserNavigation(userId: number): NavigationSettings {
  const db = getDb()
  const row = db?.prepare(`SELECT items_json, schema_version FROM ${USER_NAVIGATION_TABLE} WHERE user_id = ?`).get(userId) as { items_json: string; schema_version: number } | undefined
  if (!row) return defaultNavigationSettings()
  let settings: NavigationSettings
  let needsSave = row.schema_version < NAVIGATION_SCHEMA_VERSION
  try {
    const rawItems = JSON.parse(row.items_json)
    const filtered = stripRemovedBuiltinNavigationItems(rawItems)
    if (filtered.stripped) needsSave = true
    settings = validateNavigationSettings({ items: filtered.items })
  } catch {
    return defaultNavigationSettings()
  }
  // Early saved lists (schema_version < 1) omitted the built-in plugin center.
  // Repair them once without undoing later explicit edits.
  if (row.schema_version < 1 && !settings.items.includes('studioPlugins')) {
    settings.items.push('studioPlugins')
    needsSave = true
  }
  if (needsSave) {
    db!.prepare(`UPDATE ${USER_NAVIGATION_TABLE} SET items_json = ?, schema_version = ?, updated_at = ? WHERE user_id = ?`)
      .run(JSON.stringify(settings.items), NAVIGATION_SCHEMA_VERSION, Date.now(), userId)
  }
  return settings
}

export function saveUserNavigation(userId: number, settings: NavigationSettings): NavigationSettings {
  const db = getDb()
  if (!db) throw new Error('Navigation storage unavailable')
  db.prepare(`INSERT INTO ${USER_NAVIGATION_TABLE} (user_id, items_json, schema_version, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET items_json = excluded.items_json, schema_version = excluded.schema_version, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(settings.items), NAVIGATION_SCHEMA_VERSION, Date.now())
  return settings
}
