import { setSessionPinned } from '@/api/studio/sessions'

// Studio before 0.7.23 kept session pins per browser and profile in localStorage.
// Pins now live on the session row, so move any leftover browser pins to the server once.
const LEGACY_PINS_KEY_PREFIX = 'hermes_session_pins_v1_'

type PinSession = (id: string, isPinned: boolean) => Promise<unknown>

export function legacySessionPinsKey(profile: string): string {
  return `${LEGACY_PINS_KEY_PREFIX}${profile || 'default'}`
}

/** Synchronous check so session loads only wait for a migration when one is pending. */
export function hasLegacySessionPins(profile: string): boolean {
  try {
    return localStorage.getItem(legacySessionPinsKey(profile)) !== null
  } catch {
    return false
  }
}

/**
 * Pins the legacy browser pins on the server and returns how many succeeded.
 * The legacy entry is dropped once every pin either succeeded or was rejected by the
 * server (for example a deleted session); network or sign-in failures keep it for a retry.
 */
export async function migrateLegacySessionPins(profile: string, pinSession?: PinSession): Promise<number> {
  const key = legacySessionPinsKey(profile)
  let stored: unknown
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    stored = JSON.parse(raw)
  } catch {
    stored = []
  }
  const ids = Array.isArray(stored)
    ? [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
    : []
  let migrated = 0
  let retry = false
  for (const id of ids) {
    try {
      // Resolve the API only when a pin is moved, so the usual no-op load never touches it.
      await (pinSession || setSessionPinned)(id, true)
      migrated++
    } catch (error) {
      if (typeof (error as { status?: unknown })?.status !== 'number') retry = true
    }
  }
  if (!retry) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage may be unavailable; the next load retries the idempotent pins.
    }
  }
  return migrated
}
