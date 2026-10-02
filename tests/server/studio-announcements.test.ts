import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStudioAnnouncements } from '../../packages/server/src/modules/studio/services/notifications/announcements'
import { getAnnouncements } from '../../packages/server/src/modules/studio/controllers/announcements'

const FEED = 'https://news.example.com/studio/announcements'
const withFeed = (url = FEED) => ({ HERMES_WEB_UI_ANNOUNCEMENTS_URL: url })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Studio announcement delivery', () => {
  it('shows no announcements and contacts no feed unless one is configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchStudioAnnouncements('zh', {})).toEqual({ ok: true, platform: 'desktop', list: [] })
    expect(await fetchStudioAnnouncements('en', { HERMES_WEB_UI_ANNOUNCEMENTS_URL: '  ' })).toEqual({ ok: true, platform: 'desktop', list: [] })

    vi.stubEnv('HERMES_WEB_UI_ANNOUNCEMENTS_URL', '')
    const ctx = { query: { locale: 'en' }, set: vi.fn() } as any
    await getAnnouncements(ctx)
    expect(ctx.status).toBeUndefined()
    expect(ctx.body).toEqual({ ok: true, platform: 'desktop', list: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([['zh-TW', 'zh-CN'], ['zh', 'zh-CN'], ['en', 'en'], ['ja', 'en']])('fetches desktop announcements from the configured feed for %s', async (input, expectedLocale) => {
    const data = { ok: true, platform: 'desktop', list: [{ id: 2 }, { id: 1 }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchStudioAnnouncements(input, withFeed())).toEqual(data)
    expect(fetchMock).toHaveBeenCalledWith(`${FEED}?locale=${expectedLocale}`, {
      headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal),
    })
  })

  it('keeps the query of the configured feed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, platform: 'desktop', list: [] })))
    vi.stubGlobal('fetch', fetchMock)
    await fetchStudioAnnouncements('en', withFeed(`${FEED}?channel=stable`))
    expect(fetchMock.mock.calls[0][0]).toBe(`${FEED}?channel=stable&locale=en`)
  })

  it.each(['file:///etc/announcements.json', 'not a url'])('refuses a feed that is not an HTTP URL: %s', async url => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchStudioAnnouncements('en', withFeed(url))).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { ok: true, platform: 'app', list: [] },
    { ok: false, platform: 'desktop', list: [] },
    { ok: true, platform: 'desktop', list: null },
    null,
  ])('rejects a malformed or wrong-platform response', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))))
    await expect(fetchStudioAnnouncements('en', withFeed())).rejects.toThrow()
  })

  it('returns a non-auth error for an unavailable announcement service', async () => {
    vi.stubEnv('HERMES_WEB_UI_ANNOUNCEMENTS_URL', FEED)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    const ctx = { query: { locale: 'en' }, set: vi.fn() } as any
    await getAnnouncements(ctx)
    expect(ctx.status).toBe(502)
    expect(ctx.body).toEqual({ ok: false, error: 'announcement_fetch_failed' })
    expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })
})
