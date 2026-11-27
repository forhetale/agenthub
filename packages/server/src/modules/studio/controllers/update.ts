import type { Context } from 'koa'
import { rejectOnCustomBuild } from '../public/custom-build'
import { handleUpdate as handleRuntimeUpdate } from '../services/update/update-runtime'

export async function handleUpdate(ctx: Context) {
  if (rejectOnCustomBuild(ctx, 'In-app self-update is disabled on AgentHub custom builds. Please update from source or download the latest AgentHub release.')) {
    return
  }
  await handleRuntimeUpdate(ctx)
}
