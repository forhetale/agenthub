import { request } from '../client'
export interface BarkSettings {
  serverUrl: string
  group: string
  sound: string
  studioUrl: string
  allowPrivateNetwork: boolean
  /** Notification text language (see the server NOTIFICATION_LOCALES list). */
  locale: string
  /** New chats push by default unless the user turned this off. */
  defaultSessionPush: boolean
  /** Opt-in: notifications include the session title and a reply summary. */
  contentPreview: boolean
  hasKey: boolean
  configured: boolean
  pushReady: boolean
  lastResult: { ok: boolean; code: string; at: string } | null
}
const path = '/api/studio/notifications/bark'
export const getBarkSettings = () => request<BarkSettings>(path)
export const saveBarkSettings = (body: Record<string, unknown>) => request<BarkSettings>(path, { method: 'PUT', body: JSON.stringify(body) })
export const clearBarkSettings = () => request<BarkSettings>(path, { method: 'DELETE' })
export const testBarkSettings = () => request<{ ok: boolean; code: string }>(`${path}/test`, { method: 'POST' })
