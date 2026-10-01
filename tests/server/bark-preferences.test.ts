import { afterAll, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'fs'

// Real BarkService on a temporary home; only the outbound HTTP transport is faked.
const bark = vi.hoisted(() => ({ home: '', transport: vi.fn() }))
vi.mock('../../packages/server/src/modules/studio/services/notifications/bark', async importOriginal => {
  const original = await importOriginal<typeof import('../../packages/server/src/modules/studio/services/notifications/bark')>()
  const fs = await import('node:fs'), os = await import('node:os'), nodePath = await import('node:path')
  bark.home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'tatin-bark-preferences-'))
  return { ...original, barkService: new original.BarkService(bark.home, bark.transport) }
})

import { barkService, normalizeBarkConfig } from '../../packages/server/src/modules/studio/services/notifications/bark'
import { defaultSessionPushEnabled } from '../../packages/server/src/modules/studio/services/notifications/session-push'

const input = { serverUrl: 'https://api.day.app', deviceKey: 'TEST_DEVICE_KEY_ONLY' }
afterAll(() => rmSync(bark.home, { recursive: true, force: true }))

describe('Bark push preferences', () => {
  it('defaults to pushing new chats and keeping notification content private', () => {
    expect(normalizeBarkConfig(input)).toMatchObject({ defaultSessionPush: true, contentPreview: false })
    expect(barkService.get(1)).toMatchObject({ configured: false, defaultSessionPush: true, contentPreview: false })
  })

  it('saves both switches and keeps them when a later edit omits or mistypes them', () => {
    expect(barkService.save(2, { ...input, defaultSessionPush: false, contentPreview: true }))
      .toMatchObject({ defaultSessionPush: false, contentPreview: true })
    expect(barkService.save(2, { ...input, group: 'Edited' })).toMatchObject({ defaultSessionPush: false, contentPreview: true, group: 'Edited' })
    expect(barkService.save(2, { ...input, defaultSessionPush: 'false', contentPreview: 1 }))
      .toMatchObject({ defaultSessionPush: false, contentPreview: true })
  })

  it('passes a preview title to the transport and keeps the default title otherwise', async () => {
    bark.transport.mockResolvedValue(undefined)
    barkService.save(3, input)
    await barkService.send(3, 'Summary text', () => true, 'Weekly report')
    await barkService.send(3, 'Status text')
    expect(bark.transport.mock.calls.map(call => [call[1], call[2]])).toEqual([
      ['Summary text', 'Weekly report'],
      ['Status text', undefined],
    ])
  })

  it('applies the owner default to chats they start, and keeps system sessions quiet', () => {
    expect(defaultSessionPushEnabled(4)).toBe(true)
    barkService.save(4, { ...input, defaultSessionPush: false })
    expect(defaultSessionPushEnabled(4)).toBe(false)
    barkService.save(4, { ...input, defaultSessionPush: true })
    expect(defaultSessionPushEnabled('4')).toBe(true)
    for (const owner of [undefined, null, 0, -1, 'abc']) expect(defaultSessionPushEnabled(owner)).toBe(false)
  })
})
