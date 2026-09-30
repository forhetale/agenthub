import Koa from 'koa'
import type { Context, Next } from 'koa'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Real BarkService on a temporary home; only the outbound HTTP transport is faked.
const bark = vi.hoisted(() => ({ home: '', transport: vi.fn() }))
vi.mock('../../packages/server/src/modules/studio/services/notifications/bark', async importOriginal => {
  const original = await importOriginal<typeof import('../../packages/server/src/modules/studio/services/notifications/bark')>()
  const fs = await import('node:fs'), os = await import('node:os'), nodePath = await import('node:path')
  bark.home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'tatin-bark-routes-'))
  return { ...original, barkService: new original.BarkService(bark.home, bark.transport) }
})

import { registerRoutes } from '../../packages/server/src/bootstrap/routes'
import { createRequestBodyParser } from '../../packages/server/src/modules/studio/middleware/request-body-parser'

const path = '/api/studio/notifications/bark'
const deviceKey = 'TEST_DEVICE_KEY_ONLY'
let server: Server
let base = ''

// Stands in for requireUserJwt: the test user arrives via a header instead of a JWT.
async function fakeAuth(ctx: Context, next: Next) {
  const user = ctx.get('x-test-user')
  if (user) ctx.state.user = JSON.parse(user)
  await next()
}

function call(method: string, url: string, user?: { id: number; role: string }, body?: unknown) {
  const headers: Record<string, string> = {}
  if (user) headers['x-test-user'] = JSON.stringify(user)
  if (body !== undefined) headers['content-type'] = 'application/json'
  return fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

beforeAll(async () => {
  const app = new Koa()
  app.use(createRequestBodyParser())
  registerRoutes(app, [fakeAuth])
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => bark.transport.mockReset())
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  rmSync(bark.home, { recursive: true, force: true })
})

describe('Bark notification routes through registerRoutes', () => {
  it('serves the full settings lifecycle for an ordinary user', async () => {
    const user = { id: 7, role: 'user' }
    bark.transport.mockResolvedValue(undefined)

    const initial = await call('GET', path, user)
    expect(initial.status).toBe(200)
    expect(await initial.json()).toMatchObject({ configured: false, hasKey: false, serverUrl: 'https://api.day.app' })

    const saved = await call('PUT', path, user, { serverUrl: 'https://api.day.app', deviceKey, group: 'Routes', locale: 'en' })
    expect(saved.status).toBe(200)
    const savedText = await saved.text()
    expect(savedText).not.toContain(deviceKey)
    expect(JSON.parse(savedText)).toMatchObject({ configured: true, hasKey: true, group: 'Routes', locale: 'en', allowPrivateNetwork: false })

    expect(await (await call('GET', path, user)).json()).toMatchObject({ configured: true, group: 'Routes' })
    expect(await (await call('GET', path, { id: 8, role: 'user' })).json()).toMatchObject({ configured: false })

    const test = await call('POST', `${path}/test`, user)
    expect(test.status).toBe(200)
    expect(await test.json()).toEqual({ ok: true, code: 'accepted' })
    expect(bark.transport).toHaveBeenCalledOnce()
    expect(bark.transport.mock.calls[0][0]).toMatchObject({ deviceKey, group: 'Routes' })

    const cleared = await call('DELETE', path, user)
    expect(cleared.status).toBe(200)
    expect(await cleared.json()).toMatchObject({ configured: false, hasKey: false })
    expect(existsSync(join(bark.home, 'notifications', 'bark-7.json'))).toBe(false)
  })

  it('reports a missing configuration on test sends instead of 404', async () => {
    const response = await call('POST', `${path}/test`, { id: 9, role: 'user' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'not_configured' })
    expect(bark.transport).not.toHaveBeenCalled()
  })

  it.each([['GET', path], ['PUT', path], ['DELETE', path], ['POST', `${path}/test`]])('rejects %s %s without a signed-in user', async (method, url) => {
    const response = await call(method, url, undefined, method === 'PUT' ? { deviceKey } : undefined)
    expect(response.status).toBe(401)
    expect(bark.transport).not.toHaveBeenCalled()
  })

  it('allows private network / HTTP targets only for super administrators', async () => {
    const privateTarget = { serverUrl: 'http://192.168.1.20:8080', deviceKey, allowPrivateNetwork: true }

    for (const role of ['user', 'admin']) {
      const denied = await call('PUT', path, { id: 11, role }, privateTarget)
      expect(denied.status).toBe(403)
      expect(await denied.json()).toEqual({ error: 'private_network_admin_only' })
    }
    expect(existsSync(join(bark.home, 'notifications', 'bark-11.json'))).toBe(false)

    const allowed = await call('PUT', path, { id: 12, role: 'super_admin' }, privateTarget)
    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toMatchObject({ configured: true, allowPrivateNetwork: true, serverUrl: 'http://192.168.1.20:8080' })
  })
})
