// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasLegacySessionPins, legacySessionPinsKey, migrateLegacySessionPins } from '@/utils/legacy-session-pins'

const httpError = (status: number) => Object.assign(new Error(`API Error ${status}`), { status })

describe('legacy session pin migration', () => {
  beforeEach(() => localStorage.clear())

  it('pins every listed legacy browser pin on the server once and drops the browser entry', async () => {
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['a', 'b', 'a', '', 42]))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(['a', 'b'], pin)).resolves.toEqual(new Set(['a', 'b']))
    expect(pin.mock.calls).toEqual([['a', true], ['b', true]])
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()

    await expect(migrateLegacySessionPins(['a', 'b'], pin)).resolves.toEqual(new Set())
    expect(pin).toHaveBeenCalledTimes(2)
  })

  it('moves pins of chats from any profile, whichever profile the entry was saved under', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['shared', 'home']))
    localStorage.setItem(legacySessionPinsKey('old-profile'), JSON.stringify(['shared', 'office']))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(['shared', 'home', 'office'], pin)).resolves.toEqual(new Set(['shared', 'home', 'office']))
    expect(pin).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
    expect(localStorage.getItem(legacySessionPinsKey('old-profile'))).toBeNull()
  })

  it('leaves pins of chats this user cannot see for an account that can', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['theirs', 'mine']))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    expect(hasLegacySessionPins(['other'])).toBe(false)
    await expect(migrateLegacySessionPins(['mine'], pin)).resolves.toEqual(new Set(['mine']))
    expect(pin.mock.calls).toEqual([['mine', true]])
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["theirs"]')
  })

  it('drops sessions the server rejects, such as deleted ones, and keeps chats owned by another account', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['gone', 'foreign', 'kept']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'gone') throw httpError(404)
      if (id === 'foreign') throw httpError(403)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins(['gone', 'foreign', 'kept'], pin)).resolves.toEqual(new Set(['kept']))
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["foreign"]')
  })

  it.each([
    ['the server cannot be reached', new TypeError('Failed to fetch')],
    ['the server fails', httpError(500)],
    ['a proxy reports the server down', httpError(502)],
    ['the server rate-limits', httpError(429)],
  ])('keeps the legacy pins for a retry when %s', async (_case, failure) => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['a']))
    const pin = vi.fn().mockRejectedValue(failure)

    await expect(migrateLegacySessionPins(['a'], pin)).resolves.toEqual(new Set())
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["a"]')
  })

  it('keeps only the pins that still need a retry, so a later unpin is not undone', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['moved', 'later', 'gone']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'later') throw httpError(503)
      if (id === 'gone') throw httpError(404)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins(['moved', 'later', 'gone'], pin)).resolves.toEqual(new Set(['moved']))
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["later"]')

    pin.mockClear().mockResolvedValue({ ok: true, is_pinned: true })
    await expect(migrateLegacySessionPins(['moved', 'later'], pin)).resolves.toEqual(new Set(['later']))
    expect(pin.mock.calls).toEqual([['later', true]])
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('drops an unreadable legacy entry without calling the server', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), '{not json')
    const pin = vi.fn()

    expect(hasLegacySessionPins([])).toBe(true)
    await expect(migrateLegacySessionPins([], pin)).resolves.toEqual(new Set())
    expect(pin).not.toHaveBeenCalled()
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('reports a pending migration only while a listed chat still has a legacy pin', async () => {
    expect(hasLegacySessionPins(['a'])).toBe(false)
    localStorage.setItem('hermes_session_profile_filter_v1', 'work')
    expect(hasLegacySessionPins(['a'])).toBe(false)
    localStorage.setItem(legacySessionPinsKey('research'), JSON.stringify(['a']))
    expect(hasLegacySessionPins(['a'])).toBe(true)
    expect(hasLegacySessionPins(['b'])).toBe(false)

    await migrateLegacySessionPins(['a'], vi.fn().mockResolvedValue({ ok: true }))
    expect(hasLegacySessionPins(['a'])).toBe(false)
  })
})
