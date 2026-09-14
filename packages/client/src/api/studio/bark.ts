import { request } from '../client'
export interface BarkSettings {
  serverUrl: string
  group: string
  sound: string
  studioUrl: string
  allowPrivateNetwork: boolean
  /** Notification text language (see the server NOTIFICATION_LOCALES list). */
  locale: string
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
