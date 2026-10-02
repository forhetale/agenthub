// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasLegacySessionPins, legacySessionPinsKey, migrateLegacySessionPins } from '@/utils/legacy-session-pins'

const httpError = (status: number) => Object.assign(new Error(`API Error ${status}`), { status })

describe('legacy session pin migration', () => {
  beforeEach(() => localStorage.clear())

  it('pins every legacy browser pin on the server once and drops the browser entry', async () => {
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['a', 'b', 'a', '', 42]))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(2)
    expect(pin.mock.calls).toEqual([['a', true], ['b', true]])
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(0)
    expect(pin).toHaveBeenCalledTimes(2)
  })

  it('migrates the entries of every profile, whatever profile the sidebar filters by', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['shared', 'home']))
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['shared', 'office']))
    localStorage.setItem('hermes_session_profile_filter_v1', 'work')
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(3)
    expect(pin.mock.calls.map(call => call[0]).sort()).toEqual(['home', 'office', 'shared'])
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()
    expect(localStorage.getItem('hermes_session_profile_filter_v1')).toBe('work')
  })

  it('skips sessions the server rejects, such as deleted ones', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['gone', 'kept']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'gone') throw httpError(404)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(1)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it.each([
    ['the server cannot be reached', new TypeError('Failed to fetch')],
    ['the server fails', httpError(500)],
    ['a proxy reports the server down', httpError(502)],
    ['the server rate-limits', httpError(429)],
  ])('keeps the legacy pins for a retry when %s', async (_case, failure) => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['a']))
    const pin = vi.fn().mockRejectedValue(failure)

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(0)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["a"]')
  })

  it('drops an unreadable legacy entry without calling the server', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), '{not json')
    const pin = vi.fn()

    await expect(migrateLegacySessionPins(pin)).resolves.toBe(0)
    expect(pin).not.toHaveBeenCalled()
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('reports a pending migration only while any profile still has a legacy entry', async () => {
    expect(hasLegacySessionPins()).toBe(false)
    localStorage.setItem('hermes_session_profile_filter_v1', 'work')
    expect(hasLegacySessionPins()).toBe(false)
    localStorage.setItem(legacySessionPinsKey('research'), JSON.stringify(['a']))
    expect(hasLegacySessionPins()).toBe(true)

    await migrateLegacySessionPins(vi.fn().mockResolvedValue({ ok: true }))
    expect(hasLegacySessionPins()).toBe(false)
  })
})
