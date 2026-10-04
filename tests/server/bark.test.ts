import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import http from 'http'
import { BarkError, BarkService, normalizeBarkConfig, postBark } from '../../packages/server/src/modules/studio/services/notifications/bark'
import { SessionPushNotifier } from '../../packages/server/src/modules/studio/services/notifications/session-push'
const homes: string[] = []
function service(send = vi.fn().mockResolvedValue(undefined)) {
  const home = mkdtempSync(join(tmpdir(), 'tatin-bark-test-')); homes.push(home)
  return { home, send, service: new BarkService(home, send) }
}
const input = { serverUrl: 'https://api.day.app', deviceKey: 'TEST_DEVICE_KEY_ONLY', group: 'AgentHub' }
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
describe('Bark configuration and security', () => {
  it('encrypts credentials, redacts reads, persists across restarts, and isolates users', () => {
    const { home, service: s } = service()
    expect(s.get(1).configured).toBe(false)
    expect(s.save(1, input)).toMatchObject({ hasKey: true, pushReady: true })
    expect(JSON.stringify(s.get(1))).not.toContain(input.deviceKey)
    const directory = join(home, 'notifications')
    expect(readFileSync(join(directory, 'bark-1.json'), 'utf8')).not.toContain(input.deviceKey)
    expect(statSync(join(directory, '.bark-key')).mode & 0o777).toBe(0o600)
    expect(statSync(join(directory, 'bark-1.json')).mode & 0o777).toBe(0o600)
    expect(new BarkService(home).read(1)?.deviceKey).toBe(input.deviceKey)
    expect(s.get(2).configured).toBe(false)
    copyFileSync(join(directory, 'bark-1.json'), join(directory, 'bark-2.json'))
    expect(() => s.read(2)).toThrow('storage_unavailable')
    expect(readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false)
  })
  it('retains a saved key on blank edits and supports explicit deletion', () => {
    const { service: s } = service()
    s.save(7, input); s.save(7, { ...input, deviceKey: '', group: 'new' })
    expect(s.read(7)).toMatchObject({ deviceKey: input.deviceKey, group: 'new' })
    expect(s.clear(7).hasKey).toBe(false)
    expect(() => s.save(7, { ...input, deviceKey: '' })).toThrow('invalid_device_key')
  })
  it.each(['file:///tmp/a', 'http://public.example', 'https://user:password@example.org', 'https://api.day.app?key=secret', 'https://api.day.app/#secret'])('rejects unsafe URL shape %s', serverUrl => {
    expect(() => normalizeBarkConfig({ ...input, serverUrl })).toThrow('invalid_server_url')
  })
  it('rejects untrusted user IDs and invalid jump URLs', () => {
    const { service: s } = service()
    expect(() => s.get(-1)).toThrow('unauthorized')
    expect(() => normalizeBarkConfig({ ...input, studioUrl: 'javascript:alert(1)' })).toThrow('invalid_studio_url')
  })
  it('records safe status and does not expose transport error content', async () => {
    const { service: s } = service(vi.fn().mockRejectedValue(new Error(input.deviceKey)))
    s.save(1, input)
    await expect(s.send(1, 'status only')).rejects.toThrow('send_failed')
    expect(JSON.stringify(s.get(1))).not.toContain(input.deviceKey)
    expect(s.get(1).lastResult).toMatchObject({ ok: false, code: 'send_failed' })
  })
  it('rate limits per user', async () => {
    const { service: s, send } = service(); s.save(1, input); s.save(2, input)
    for (let n = 0; n < 30; n++) await s.send(1, 'status')
    await expect(s.send(1, 'status')).rejects.toThrow('rate_limited')
    await s.send(2, 'status')
    expect(send).toHaveBeenCalledTimes(31)
  })
})
describe('Bark transport', () => {
  it('blocks private targets unless explicitly allowed', async () => {
    const settings = normalizeBarkConfig({ ...input, serverUrl: 'https://127.0.0.1' })
    await expect(postBark(settings, 'status')).rejects.toThrow('unsafe_or_unreachable_server')
  })
  it('uses POST JSON, validates business response and refuses redirects', async () => {
    let status = 200; let code = 200; const requests: any[] = []
    const server = http.createServer((req, res) => {
      let body = ''; req.on('data', chunk => { body += chunk }); req.on('end', () => {
        requests.push({ method: req.method, path: req.url, body: JSON.parse(body) })
        res.writeHead(status, { 'Content-Type': 'application/json', Location: 'http://127.0.0.1:1/secret' })
        res.end(JSON.stringify({ code }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as any).port
    const settings = normalizeBarkConfig({ ...input, serverUrl: `http://127.0.0.1:${port}`, allowPrivateNetwork: true })
    try {
      await postBark(settings, '状态通知')
      expect(requests[0]).toMatchObject({ method: 'POST', path: '/push', body: { device_key: input.deviceKey, title: 'AgentHub', body: '状态通知' } })
      code = 400; await expect(postBark(settings, 'status')).rejects.toThrow('server_rejected')
      status = 302; await expect(postBark(settings, 'status')).rejects.toThrow('http_302')
      expect(requests).toHaveLength(3)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
function notifier(overrides: Record<string, any> = {}) {
  const sendBark = vi.fn().mockResolvedValue({})
  const session = { id: 's1', user_id: '7', push_enabled: 1, agent: 'codex' }
  return { sendBark, session, notifier: new SessionPushNotifier({
    readSession: () => session as any, barkReady: () => true, sendBark,
    readLocale: () => 'zh', ...overrides,
  }) }
}
describe('Bark session integration', () => {
  it.each(['run.completed', 'approval.requested', 'clarify.requested'])('routes %s to Bark and deduplicates', async event => {
    const { notifier: n, sendBark } = notifier()
    expect(await n.notify('s1', event, { run_id: 'r1', output: 'PRIVATE OUTPUT', command: 'PRIVATE COMMAND' }, 'codex')).toBe(1)
    expect(await n.notify('s1', event, { run_id: 'r1' }, 'codex')).toBe(0)
    expect(sendBark).toHaveBeenCalledTimes(1)
    expect(sendBark.mock.calls[0][0]).toBe(7)
    expect(sendBark.mock.calls[0][1]).toContain('AgentHub')
    expect(sendBark.mock.calls[0][1]).not.toContain('PRIVATE')
  })
  it('honors disabled sessions, invalid owner, unsupported events and interrupted runs', async () => {
    const { notifier: n, session, sendBark } = notifier()
    expect(await n.notify('s1', 'run.completed', { interrupted: true })).toBe(0)
    expect(await n.notify('s1', 'tool.completed', {})).toBe(0)
    session.push_enabled = 0; expect(await n.notify('s1', 'run.completed', {})).toBe(0)
    session.push_enabled = 1; session.user_id = ''; expect(await n.notify('s1', 'run.completed', {})).toBe(0)
    expect(sendBark).not.toHaveBeenCalled()
  })
  it('releases failed dedupe entries and rejects duplicate concurrent events', async () => {
    let release!: () => void
    const sendBark = vi.fn().mockRejectedValueOnce(new BarkError('timeout')).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const { notifier: n } = notifier({ sendBark })
    expect(await n.notify('s1', 'run.completed', { run_id: 'r1' })).toBe(0)
    const pending = n.notify('s1', 'run.completed', { run_id: 'r1' })
    expect(await n.notify('s1', 'run.completed', { run_id: 'r1' })).toBe(0)
    release(); expect(await pending).toBe(1)
  })
  it('reports Bark transport errors as an unsent notification without throwing', async () => {
    const sendBark = vi.fn().mockRejectedValue(new Error('offline'))
    const { notifier: n } = notifier({ sendBark })
    await expect(n.notify('s1', 'run.completed', { run_id: 'r1' })).resolves.toBe(0)
    expect(sendBark).toHaveBeenCalledTimes(1)
  })
})
