import { setSessionPinned } from '@/api/studio/sessions'

// Studio before 0.7.23 kept session pins in localStorage under the browser's active profile,
// while its sidebar could list and pin chats of every profile. Pins now live on the session
// row, so each leftover pin of a chat the signed-in user can see moves to the server once.
const LEGACY_PINS_KEY_PREFIX = 'hermes_session_pins_v1_'

type PinSession = (id: string, isPinned: boolean) => Promise<unknown>

interface LegacyPinEntry {
  key: string
  /** null when the entry cannot be read. */
  ids: string[] | null
}

export function legacySessionPinsKey(profile: string): string {
  return `${LEGACY_PINS_KEY_PREFIX}${profile || 'default'}`
}

function readLegacyPinEntries(): LegacyPinEntry[] {
  const entries: LegacyPinEntry[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(LEGACY_PINS_KEY_PREFIX)) continue
      let stored: unknown
      try {
        stored = JSON.parse(localStorage.getItem(key) || '[]')
      } catch {
        stored = null
      }
      const ids = Array.isArray(stored)
        ? [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
        : null
      entries.push({ key, ids })
    }
  } catch {
    // Storage may be unavailable; there is nothing to migrate then.
  }
  return entries
}

/** Synchronous check so a session load only waits when one of its chats has a legacy pin. */
export function hasLegacySessionPins(visibleSessionIds: Iterable<string>): boolean {
  const visible = new Set(visibleSessionIds)
  return readLegacyPinEntries().some(entry => entry.ids === null || entry.ids.some(id => visible.has(id)))
}

// Network and sign-in failures carry no status; 5xx, timeouts and rate limits are temporary,
// and a 403 means the chat belongs to another account.
function keepsLegacyPin(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status
  return typeof status !== 'number' || status >= 500 || status === 403 || status === 408 || status === 429
}

/**
 * Pins the legacy pins of the given visible chats on the server and returns the ids now pinned.
 * Pins of chats this user cannot see stay for an account that can; a pin the server rejects
 * outright (for example a deleted chat) is dropped, and temporary failures retry on a later load.
 */
export async function migrateLegacySessionPins(visibleSessionIds: Iterable<string>, pinSession?: PinSession): Promise<Set<string>> {
  const visible = new Set(visibleSessionIds)
  const pinned = new Set<string>()
  const outcomes = new Map<string, 'pinned' | 'dropped' | 'kept'>()
  for (const { key, ids } of readLegacyPinEntries()) {
    const remaining: string[] = []
    for (const id of ids || []) {
      if (!visible.has(id)) {
        remaining.push(id)
        continue
      }
      let outcome = outcomes.get(id)
      if (!outcome) {
        try {
          // Resolve the API only when a pin is moved, so the usual no-op load never touches it.
          await (pinSession || setSessionPinned)(id, true)
          outcome = 'pinned'
          pinned.add(id)
        } catch (error) {
          outcome = keepsLegacyPin(error) ? 'kept' : 'dropped'
        }
        outcomes.set(id, outcome)
      }
      if (outcome === 'kept') remaining.push(id)
    }
    if (ids && remaining.length === ids.length) continue
    try {
      // Keep only what still needs a retry or another account, so a later unpin is never undone.
      if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining))
      else localStorage.removeItem(key)
    } catch {
      // Storage may be unavailable; the next load retries the idempotent pins.
    }
  }
  return pinned
}
