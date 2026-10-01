// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasLegacySessionPins, legacySessionPinsKey, migrateLegacySessionPins } from '@/utils/legacy-session-pins'

const httpError = (status: number) => Object.assign(new Error(`API Error ${status}`), { status })

describe('legacy session pin migration', () => {
  beforeEach(() => localStorage.clear())

  it('pins every legacy browser pin on the server once and drops the browser entry', async () => {
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['a', 'b', 'a', '', 42]))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins('work', pin)).resolves.toBe(2)
    expect(pin.mock.calls).toEqual([['a', true], ['b', true]])
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()

    await expect(migrateLegacySessionPins('work', pin)).resolves.toBe(0)
    expect(pin).toHaveBeenCalledTimes(2)
  })

  it('skips sessions the server rejects, such as deleted ones', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['gone', 'kept']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'gone') throw httpError(404)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins('', pin)).resolves.toBe(1)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('keeps the legacy pins for a retry when the server cannot be reached', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['a']))
    const pin = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(migrateLegacySessionPins('default', pin)).resolves.toBe(0)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["a"]')
  })

  it('drops an unreadable legacy entry without calling the server', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), '{not json')
    const pin = vi.fn()

    await expect(migrateLegacySessionPins('default', pin)).resolves.toBe(0)
    expect(pin).not.toHaveBeenCalled()
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('reports a pending migration only while the profile still has a legacy entry', async () => {
    expect(hasLegacySessionPins('work')).toBe(false)
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['a']))
    expect(hasLegacySessionPins('work')).toBe(true)
    expect(hasLegacySessionPins('default')).toBe(false)

    await migrateLegacySessionPins('work', vi.fn().mockResolvedValue({ ok: true }))
    expect(hasLegacySessionPins('work')).toBe(false)
  })
})
