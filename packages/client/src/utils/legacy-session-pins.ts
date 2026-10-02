import { setSessionPinned } from '@/api/studio/sessions'

// Studio before 0.7.23 kept session pins per browser and active profile in localStorage.
// Pins now live on the session row (pinned by id, whatever the profile), so move every
// leftover browser pin to the server once.
const LEGACY_PINS_KEY_PREFIX = 'hermes_session_pins_v1_'

type PinSession = (id: string, isPinned: boolean) => Promise<unknown>

export function legacySessionPinsKey(profile: string): string {
  return `${LEGACY_PINS_KEY_PREFIX}${profile || 'default'}`
}

function legacySessionPinsKeys(): string[] {
  const keys: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(LEGACY_PINS_KEY_PREFIX)) keys.push(key)
    }
  } catch {
    // Storage may be unavailable; there is nothing to migrate then.
  }
  return keys
}

/** Synchronous check so session loads only wait for a migration when one is pending. */
export function hasLegacySessionPins(): boolean {
  return legacySessionPinsKeys().length > 0
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
 * Pins the legacy browser pins on the server and returns how many succeeded.
 * A legacy entry is dropped once every pin in it either succeeded or was rejected by the
 * server (for example a deleted session); temporary failures keep it for the next load.
 */
export async function migrateLegacySessionPins(pinSession?: PinSession): Promise<number> {
  const outcomes = new Map<string, 'pinned' | 'rejected' | 'retry'>()
  let migrated = 0
  for (const key of legacySessionPinsKeys()) {
    let retry = false
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
      if (outcome === 'retry') retry = true
    }
    if (retry) continue
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage may be unavailable; the next load retries the idempotent pins.
    }
  }
  return migrated
}
