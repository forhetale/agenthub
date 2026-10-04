// AgentHub does not read the upstream Ekko Studio announcement feed. The endpoint and the
// prompt stay so a deployment can publish its own feed with the same response shape.

function announcementsUrl(env: NodeJS.ProcessEnv): URL | null {
  const raw = (env.HERMES_WEB_UI_ANNOUNCEMENTS_URL || '').trim()
  if (!raw) return null
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('invalid_announcement_url')
  return url
}

export async function fetchStudioAnnouncements(localeInput: unknown, env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const url = announcementsUrl(env)
  if (!url) return { ok: true, platform: 'desktop', list: [] }
  const locale = /^zh(?:[-_]|$)/i.test(String(localeInput || 'en')) ? 'zh-CN' : 'en'
  url.searchParams.set('locale', locale)
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('announcement_fetch_failed')
  const data = await response.json() as { ok?: boolean; platform?: string; list?: unknown }
  if (!data || data.ok !== true || data.platform !== 'desktop' || !Array.isArray(data.list)) {
    throw new Error('invalid_announcement_response')
  }
  return data
}
