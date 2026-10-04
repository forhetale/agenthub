import type { Context } from 'koa'
import { getHermesWebUiVersion } from './system-info'

export const CUSTOM_BUILD_PROTECTED_CODE = 'custom_build_protected'

// Bundled servers use the injected __APP_VERSION__; dev/ts-node servers fall
// back to the root package.json, so the guards also hold outside a release build.
export function isCustomBuild(): boolean {
  const v = getHermesWebUiVersion()
  return v.includes('-agenthub.') || v.includes('-tatin.')
}
export const isTatinBuild = isCustomBuild

/**
 * Rejects a request that would replace this custom build with an upstream
 * hermes-web-ui package. Returns true when the request was rejected.
 */
export function rejectOnCustomBuild(ctx: Pick<Context, 'status' | 'body'>, message: string): boolean {
  if (!isCustomBuild()) return false
  ctx.status = 409
  ctx.body = { success: false, code: CUSTOM_BUILD_PROTECTED_CODE, message }
  return true
}
