import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import http from 'http'
import https from 'https'
import { config } from '../../public/config'
import { resolveSafeWebhookTarget } from '../webhooks/url-safety'
import { NOTIFICATION_LOCALES } from './locale'

export interface BarkConfig {
  serverUrl: string
  deviceKey: string
  group: string
  sound: string
  studioUrl: string
  allowPrivateNetwork: boolean
  /** Language of the notification text; see NOTIFICATION_LOCALES in session-push. */
  locale: string
}
export class BarkError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code) }
}
interface SendResult { ok: boolean; code: string; at: string }
export type BarkTransport = (config: BarkConfig, content: string) => Promise<void>
const DEFAULT_SERVER = 'https://api.day.app'
const DEFAULT_LOCALE = 'zh'

function shortText(value: unknown, max: number): string {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > max) throw new BarkError('invalid_config')
  return value.trim()
}
export function normalizeBarkConfig(input: Record<string, unknown>, previous?: BarkConfig): BarkConfig {
  let url: URL
  try { url = new URL(shortText(input.serverUrl, 2048) || DEFAULT_SERVER) } catch { throw new BarkError('invalid_server_url') }
  const allowPrivateNetwork = input.allowPrivateNetwork === true
  if ((url.protocol !== 'https:' && !(allowPrivateNetwork && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new BarkError('invalid_server_url')
  }
  const deviceKey = shortText(input.deviceKey, 512) || previous?.deviceKey || ''
  if (!/^[a-zA-Z0-9_-]{1,512}$/.test(deviceKey)) throw new BarkError('invalid_device_key')
  const studioUrl = shortText(input.studioUrl, 2048)
  if (studioUrl) {
    try {
      const target = new URL(studioUrl)
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error()
    } catch { throw new BarkError('invalid_studio_url') }
  }
  const sound = shortText(input.sound, 80)
  if (sound && !/^[a-zA-Z0-9_.-]+$/.test(sound)) throw new BarkError('invalid_config')
  const locale = shortText(input.locale, 16) || previous?.locale || 'zh'
  if (!NOTIFICATION_LOCALES.includes(locale as typeof NOTIFICATION_LOCALES[number])) throw new BarkError('invalid_config')
  return { serverUrl: url.toString().replace(/\/+$/, ''), deviceKey, group: shortText(input.group, 120) || 'TATin Studio', sound, studioUrl, allowPrivateNetwork, locale }
}

export const postBark: BarkTransport = async (settings, content) => {
  let target
  let dnsTimer: ReturnType<typeof setTimeout> | undefined
  try {
    target = await Promise.race([
      resolveSafeWebhookTarget(`${settings.serverUrl}/push`, settings.allowPrivateNetwork),
      new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error()), 8000) }),
    ])
  } catch { throw new BarkError('unsafe_or_unreachable_server', 502) }
  finally { clearTimeout(dnsTimer) }
  const url = new URL(target.url)
  const body = JSON.stringify({ device_key: settings.deviceKey, title: 'TATin Studio', body: content,
    group: settings.group, ...(settings.sound ? { sound: settings.sound } : {}),
    ...(settings.studioUrl ? { url: settings.studioUrl } : {}),
  })
  await new Promise<void>((resolve, reject) => {
    // Pin the validated IP, preserve Host/SNI, and never follow redirects.
    const req = (url.protocol === 'https:' ? https : http).request({
      protocol: url.protocol, hostname: target.address, family: target.family,
      port: url.port || undefined, path: url.pathname, method: 'POST', agent: false,
      servername: url.hostname.replace(/^\[|\]$/g, ''),
      headers: { Host: url.host, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks: Buffer[] = []; let bytes = 0
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > 65536) req.destroy(new BarkError('response_too_large', 502))
        else chunks.push(chunk)
      })
      res.on('error', () => reject(new BarkError('network_error', 502)))
      res.on('end', () => {
        const status = res.statusCode || 0
        if (status < 200 || status >= 300) return reject(new BarkError(`http_${status}`, 502))
        try {
          if (JSON.parse(Buffer.concat(chunks).toString('utf8')).code !== 200) throw new Error()
          resolve()
        } catch { reject(new BarkError('server_rejected', 502)) }
      })
    })
    const timer = setTimeout(() => req.destroy(new BarkError('timeout', 504)), 10000)
    req.on('close', () => clearTimeout(timer))
    req.on('error', error => reject(error instanceof BarkError ? error : new BarkError('network_error', 502)))
    req.end(body)
  })
}

export class BarkService {
  private readonly results = new Map<number, SendResult>()
  private readonly attempts = new Map<number, number[]>()
  constructor(private readonly home = config.appHome, private readonly transport: BarkTransport = postBark) {}
  private directory() { return join(this.home, 'notifications') }
  private path(userId: number) {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new BarkError('unauthorized', 401)
    return join(this.directory(), `bark-${userId}.json`)
  }
  private key(create = false): Buffer {
    const path = join(this.directory(), '.bark-key')
    if (create && !existsSync(path)) {
      mkdirSync(this.directory(), { recursive: true, mode: 0o700 })
      try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }) }
      catch (error: any) { if (error.code !== 'EEXIST') throw error }
    }
    return readFileSync(path)
  }
  read(userId: number): BarkConfig | undefined {
    const path = this.path(userId)
    if (!existsSync(path)) return undefined
    try {
      const stored = JSON.parse(readFileSync(path, 'utf8'))
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(stored.iv, 'base64'))
      decipher.setAAD(Buffer.from(`bark:${userId}:v1`))
      decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.data, 'base64')), decipher.final()]).toString('utf8'))
    } catch { throw new BarkError('storage_unavailable', 500) }
  }
  ready(userId: number): boolean { return Boolean(this.read(userId)) }
  get(userId: number) {
    const stored = this.read(userId)
    const { deviceKey: _secret, ...safe } = stored || { serverUrl: DEFAULT_SERVER, group: 'TATin Studio', sound: '', studioUrl: '', allowPrivateNetwork: false, locale: DEFAULT_LOCALE, deviceKey: '' }
    return { ...safe, hasKey: Boolean(stored), configured: Boolean(stored), pushReady: Boolean(stored), lastResult: this.results.get(userId) || null }
  }
  save(userId: number, input: Record<string, unknown>) {
    const path = this.path(userId)
    const settings = normalizeBarkConfig(input, this.read(userId))
    const key = this.key(true); const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(`bark:${userId}:v1`))
    const data = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()])
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600, flag: 'wx' })
      renameSync(temporary, path)
    } finally { if (existsSync(temporary)) unlinkSync(temporary) }
    this.results.delete(userId)
    return this.get(userId)
  }
  clear(userId: number) {
    const path = this.path(userId)
    if (existsSync(path)) unlinkSync(path)
    this.results.delete(userId)
    return this.get(userId)
  }
  async send(userId: number, content: string, shouldSend: () => boolean = () => true) {
    if (!shouldSend()) throw new BarkError('config_changed', 409)
    const settings = this.read(userId)
    if (!settings) throw new BarkError('not_configured', 409)
    const now = Date.now()
    const recent = (this.attempts.get(userId) || []).filter(time => now - time < 60000)
    if (recent.length >= 30) throw new BarkError('rate_limited', 429)
    this.attempts.set(userId, [...recent, now])
    try {
      // Retry only explicit server overload; ambiguous network failures are not retried.
      try { await this.transport(settings, content) }
      catch (error) {
        if (!(error instanceof BarkError) || !['http_429', 'http_503'].includes(error.code)) throw error
        await new Promise(resolve => setTimeout(resolve, 1000))
        const current = this.read(userId)
        if (!shouldSend() || !current || JSON.stringify(current) !== JSON.stringify(settings)) throw new BarkError('config_changed', 409)
        await this.transport(current, content)
      }
      this.results.set(userId, { ok: true, code: 'accepted', at: new Date().toISOString() })
      return { ok: true, code: 'accepted' }
    } catch (error) {
      const safe = error instanceof BarkError ? error : new BarkError('send_failed', 502)
      this.results.set(userId, { ok: false, code: safe.code, at: new Date().toISOString() })
      throw safe
    }
  }
}
export const barkService = new BarkService()
