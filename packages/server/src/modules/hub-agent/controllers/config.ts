import type { Context } from 'koa'
import { refreshGlobalHubAgentRuntimes } from '../services/manager'
import { getHubAgentSettings, updateHubAgentSettings } from '../services/config'

function errorResponse(ctx: Context, error: unknown): void {
  ctx.status = 400
  ctx.body = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }
}

export async function get(ctx: Context): Promise<void> {
  try {
    ctx.body = { ok: true, ...getHubAgentSettings() }
  } catch (error) {
    errorResponse(ctx, error)
  }
}

export async function update(ctx: Context): Promise<void> {
  try {
    const snapshot = updateHubAgentSettings((ctx.request.body as { config?: unknown } | undefined)?.config)
    const runtimeRefresh = refreshGlobalHubAgentRuntimes()
    ctx.body = { ok: true, ...snapshot, runtimeRefresh }
  } catch (error) {
    errorResponse(ctx, error)
  }
}
