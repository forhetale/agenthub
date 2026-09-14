import type { Context } from 'koa'
import { barkService, BarkError } from '../services/notifications/bark'

async function handle(ctx: Context, operation: (userId: number) => unknown) {
  const userId = Number(ctx.state?.user?.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) { ctx.status = 401; ctx.body = { error: 'Unauthorized' }; return }
  try { ctx.body = await operation(userId) }
  catch (error) {
    ctx.status = error instanceof BarkError ? error.status : 500
    ctx.body = { error: error instanceof BarkError ? error.code : 'storage_unavailable' }
  }
}
export async function getBark(ctx: Context) { await handle(ctx, id => barkService.get(id)) }
export async function saveBark(ctx: Context) {
  await handle(ctx, id => {
    const body = ctx.request.body as Record<string, unknown> | undefined
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BarkError('invalid_config')
    if (body.allowPrivateNetwork === true && ctx.state.user?.role !== 'super_admin') throw new BarkError('private_network_admin_only', 403)
    return barkService.save(id, body)
  })
}
export async function clearBark(ctx: Context) { await handle(ctx, id => barkService.clear(id)) }
export async function testBark(ctx: Context) {
  await handle(ctx, id => barkService.send(id, 'TATin Studio · Bark test / 消息推送测试'))
}
