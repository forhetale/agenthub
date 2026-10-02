import { setSessionPinned } from '@/api/studio/sessions'

// Studio before 0.7.23 kept session pins per browser and active profile in localStorage.
// Pins now live on the session row (pinned by id, whatever the profile), so move every
// leftover browser pin to the server once.
const LEGACY_PINS_KEY_PREFIX = 'hermes_session_pins_v1_'

type PinSession = (id: string, isPinned: boolean) => Promise<unknown>

export function legacySessionPinsKey(profile: string): string {
  return `${LEGACY_PINS_KEY_PREFIX}${profile || 'default'}`
}

// Only profiles the signed-in user can open are migrated; other accounts' entries stay for them.
function legacySessionPinsKeys(profiles: readonly string[]): string[] {
  const allowed = new Set(profiles.map(profile => legacySessionPinsKey(profile)))
  const keys: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key && allowed.has(key)) keys.push(key)
    }
  } catch {
    // Storage may be unavailable; there is nothing to migrate then.
  }
  return keys
}

/** Synchronous check so session loads only wait for a migration when one is pending. */
export function hasLegacySessionPins(profiles: readonly string[]): boolean {
  return legacySessionPinsKeys(profiles).length > 0
}

function readLegacyPinIds(key: string): string[] {
  let stored: unknown
  try {
    stored = JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    stored = []
  }
  return Array.isArray(stored)
    ? [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
    : []
}

// Network and sign-in failures carry no status; 5xx, timeouts and rate limits are temporary too.
function isTemporaryFailure(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status
  return typeof status !== 'number' || status >= 500 || status === 408 || status === 429
}

/**
 * Pins the legacy browser pins of the given profiles on the server and returns how many
 * succeeded. Pins that succeeded or were rejected by the server (for example a deleted
 * session) leave the entry; temporary failures stay in it for the next load.
 */
export async function migrateLegacySessionPins(profiles: readonly string[], pinSession?: PinSession): Promise<number> {
  const outcomes = new Map<string, 'pinned' | 'rejected' | 'retry'>()
  let migrated = 0
  for (const key of legacySessionPinsKeys(profiles)) {
    const retryIds: string[] = []
    for (const id of readLegacyPinIds(key)) {
      let outcome = outcomes.get(id)
      if (!outcome) {
        try {
          // Resolve the API only when a pin is moved, so the usual no-op load never touches it.
          await (pinSession || setSessionPinned)(id, true)
          outcome = 'pinned'
          migrated++
        } catch (error) {
          outcome = isTemporaryFailure(error) ? 'retry' : 'rejected'
        }
        outcomes.set(id, outcome)
      }
      if (outcome === 'retry') retryIds.push(id)
    }
    try {
      // Keep only what still needs a retry, so a later unpin is never pinned again.
      if (retryIds.length) localStorage.setItem(key, JSON.stringify(retryIds))
      else localStorage.removeItem(key)
    } catch {
      // Storage may be unavailable; the next load retries the idempotent pins.
    }
  }
  return migrated
}
