import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), clear: vi.fn(), send: vi.fn() }))
vi.mock('../../packages/server/src/modules/studio/services/notifications/bark', async importOriginal => {
  const original = await importOriginal<any>()
  return { ...original, barkService: mock }
})
import { getBark, saveBark, clearBark, testBark } from '../../packages/server/src/modules/studio/controllers/bark'
beforeEach(() => vi.clearAllMocks())
describe('Bark endpoint authorization', () => {
  it.each([getBark, saveBark, clearBark, testBark])('rejects unauthenticated calls', async handler => {
    const ctx = { state: {}, request: { body: {} } } as any
    await handler(ctx); expect(ctx.status).toBe(401)
    expect(mock.get).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled()
  })
  it('uses authenticated user identity, not an arbitrary body user ID', async () => {
    const body = { userId: 99, deviceKey: 'test' }
    const ctx = { state: { user: { id: 7, role: 'admin' } }, request: { body } } as any
    await saveBark(ctx); expect(mock.save).toHaveBeenCalledWith(7, body)
  })
  it('blocks private-network permission for ordinary admins', async () => {
    const ctx = { state: { user: { id: 7, role: 'admin' } }, request: { body: { allowPrivateNetwork: true } } } as any
    await saveBark(ctx); expect(ctx.status).toBe(403); expect(mock.save).not.toHaveBeenCalled()
  })
  it('redacts unexpected errors', async () => {
    mock.get.mockImplementationOnce(() => { throw new Error('DEVICE_KEY') })
    const ctx = { state: { user: { id: 7 } } } as any
    await getBark(ctx); expect(ctx.body).toEqual({ error: 'storage_unavailable' })
  })
})
