import { matchBrowserElement, verifyBrowserOutcome } from '../services/browser/jev'
import type { Context } from 'koa'
import { evaluateJev, parseJevRequest, testJev } from '../services/jev/client'
import { deleteJevSettings, getJevSettings, JevError, saveJevSettings } from '../services/jev/settings'

async function respond(ctx: Context, action: (profile: string) => Promise<unknown>) {
  const profile = ctx.state.profile?.name
  if (!profile) { ctx.status = 400; ctx.body = { error: 'Profile is required', code: 'jev_invalid_request' }; return }
  try {
    ctx.body = await action(profile)
  } catch (error) {
    ctx.status = error instanceof JevError ? error.status : 500
    ctx.body = {
      error: error instanceof JevError ? error.message : 'JEV settings operation failed',
      code: error instanceof JevError ? error.code : 'jev_settings_failed',
    }
  }
}

export async function getSettings(ctx: Context) { await respond(ctx, getJevSettings) }
// Enabling JEV forwards this Profile's memories and conversations to a third-party service,
// so only super administrators may change its endpoint, key, or switches.
function allowSettingsChange(ctx: Context): boolean {
  if (ctx.state.user?.role === 'super_admin') return true
  ctx.status = 403
  ctx.body = { error: 'Only super administrators can change JEV settings', code: 'jev_admin_only' }
  return false
}

export async function saveSettings(ctx: Context) {
  if (!allowSettingsChange(ctx)) return
  await respond(ctx, profile => saveJevSettings(profile, ctx.request.body))
}
export async function deleteSettings(ctx: Context) {
  if (!allowSettingsChange(ctx)) return
  await respond(ctx, deleteJevSettings)
}
export async function testConnection(ctx: Context) { await respond(ctx, testJev) }
export async function evaluate(ctx: Context) { await respond(ctx, profile => evaluateJev(profile, parseJevRequest(ctx.request.body))) }

async function browserAssessment(ctx: Context, assess: typeof matchBrowserElement) {
  const abort = new AbortController()
  const onClose = () => { if (!ctx.res.writableEnded) abort.abort() }
  ctx.res.once('close', onClose)
  try {
    await respond(ctx, profile => assess(profile, ctx.request.body, abort.signal))
  } finally { ctx.res.off('close', onClose) }
}

export async function matchBrowser(ctx: Context) { await browserAssessment(ctx, matchBrowserElement) }
export async function verifyBrowser(ctx: Context) { await browserAssessment(ctx, verifyBrowserOutcome) }
