// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasLegacySessionPins, legacySessionPinsKey, migrateLegacySessionPins } from '@/utils/legacy-session-pins'

const httpError = (status: number) => Object.assign(new Error(`API Error ${status}`), { status })
const PROFILES = ['default', 'work', 'research']

describe('legacy session pin migration', () => {
  beforeEach(() => localStorage.clear())

  it('pins every legacy browser pin on the server once and drops the browser entry', async () => {
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['a', 'b', 'a', '', 42]))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(2)
    expect(pin.mock.calls).toEqual([['a', true], ['b', true]])
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(0)
    expect(pin).toHaveBeenCalledTimes(2)
  })

  it('migrates the entries of every accessible profile, whatever profile the sidebar filters by', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['shared', 'home']))
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['shared', 'office']))
    localStorage.setItem('hermes_session_profile_filter_v1', 'work')
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(3)
    expect(pin.mock.calls.map(call => call[0]).sort()).toEqual(['home', 'office', 'shared'])
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
    expect(localStorage.getItem(legacySessionPinsKey('work'))).toBeNull()
    expect(localStorage.getItem('hermes_session_profile_filter_v1')).toBe('work')
  })

  it('leaves the entries of profiles this user cannot open for an account that can', async () => {
    localStorage.setItem(legacySessionPinsKey('admin-only'), JSON.stringify(['theirs']))
    localStorage.setItem(legacySessionPinsKey('work'), JSON.stringify(['mine']))
    const pin = vi.fn().mockResolvedValue({ ok: true, is_pinned: true })

    expect(hasLegacySessionPins(['admin-only'])).toBe(true)
    await expect(migrateLegacySessionPins(['work'], pin)).resolves.toBe(1)
    expect(pin.mock.calls).toEqual([['mine', true]])
    expect(localStorage.getItem(legacySessionPinsKey('admin-only'))).toBe('["theirs"]')
    expect(hasLegacySessionPins(['work'])).toBe(false)
  })

  it('skips sessions the server rejects, such as deleted ones', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['gone', 'kept']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'gone') throw httpError(404)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(1)
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

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(0)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["a"]')
  })

  it('keeps only the pins that still need a retry, so a later unpin is not undone', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), JSON.stringify(['moved', 'later', 'gone']))
    const pin = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'later') throw httpError(503)
      if (id === 'gone') throw httpError(404)
      return { ok: true, is_pinned: true }
    })

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(1)
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBe('["later"]')

    pin.mockClear().mockResolvedValue({ ok: true, is_pinned: true })
    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(1)
    expect(pin.mock.calls).toEqual([['later', true]])
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('drops an unreadable legacy entry without calling the server', async () => {
    localStorage.setItem(legacySessionPinsKey('default'), '{not json')
    const pin = vi.fn()

    await expect(migrateLegacySessionPins(PROFILES, pin)).resolves.toBe(0)
    expect(pin).not.toHaveBeenCalled()
    expect(localStorage.getItem(legacySessionPinsKey('default'))).toBeNull()
  })

  it('reports a pending migration only while an accessible profile still has a legacy entry', async () => {
    expect(hasLegacySessionPins(PROFILES)).toBe(false)
    localStorage.setItem('hermes_session_profile_filter_v1', 'work')
    expect(hasLegacySessionPins(PROFILES)).toBe(false)
    localStorage.setItem(legacySessionPinsKey('research'), JSON.stringify(['a']))
    expect(hasLegacySessionPins(PROFILES)).toBe(true)
    expect(hasLegacySessionPins([])).toBe(false)

    await migrateLegacySessionPins(PROFILES, vi.fn().mockResolvedValue({ ok: true }))
    expect(hasLegacySessionPins(PROFILES)).toBe(false)
  })
})
