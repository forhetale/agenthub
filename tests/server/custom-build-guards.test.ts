import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  appVersion: '0.8.32-agenthub.1',
  runtimeHandleUpdate: vi.fn(async (ctx: any) => {
    ctx.status = 200
    ctx.body = { success: true }
  }),
  activateDownloadedWebUiVersion: vi.fn((version: string) => ({ version })),
  startWebUiVersionDownload: vi.fn((version: string) => ({ id: `job-${version}` })),
  getPrimaryAgentVersion: vi.fn(async () => 'Hermes Agent 0.23.0'),
  getPrimaryAgentBridgeHealth: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../packages/server/src/modules/studio/public/system-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/server/src/modules/studio/public/system-info')>()
  return {
    ...actual,
    getHermesWebUiVersion: () => state.appVersion,
  }
})

vi.mock('../../packages/server/src/modules/studio/services/update/update-runtime', () => ({
  handleUpdate: state.runtimeHandleUpdate,
}))

vi.mock('../../packages/server/src/modules/hermes/services/runtime/version-manager', () => ({
  activateInstalledRuntimeVersion: vi.fn(),
  activateDownloadedWebUiVersion: state.activateDownloadedWebUiVersion,
  deleteDownloadedWebUiVersion: vi.fn(),
  deleteInstalledRuntimeVersion: vi.fn(),
  getVersionDownloadJob: vi.fn(),
  getRuntimeVersionStatus: vi.fn(),
  listVersionDownloadJobs: vi.fn(() => []),
  scheduleRuntimeRootMigration: vi.fn(),
  startRuntimeVersionDownload: vi.fn(),
  startWebUiVersionDownload: state.startWebUiVersionDownload,
}))

vi.mock('../../packages/server/src/modules/hermes/services/runtime/selection', () => ({
  configurePreferredHermesRuntime: vi.fn(async () => {}),
}))

vi.mock('../../packages/server/src/modules/studio/public/web-ui-restart', () => ({
  scheduleWebUiRestart: vi.fn(),
}))

import {
  activateWebUi,
  downloadWebUi,
} from '../../packages/server/src/modules/hermes/controllers/runtime-versions'
import { handleUpdate } from '../../packages/server/src/modules/studio/controllers/update'
import { isCustomBuild } from '../../packages/server/src/modules/studio/public/custom-build'
import { StudioHealthService } from '../../packages/server/src/modules/studio/services/health'

describe('custom-build protection guards across controllers and health', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    state.appVersion = '0.8.32-agenthub.1'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it.each(['0.8.32-agenthub.1', '0.8.32-tatin.1'])(
    'returns 409 custom_build_protected on handleUpdate, activateWebUi, and downloadWebUi for %s',
    async (version) => {
      state.appVersion = version

      const updateCtx: any = { status: 200, body: null }
      await handleUpdate(updateCtx)
      expect(updateCtx.status).toBe(409)
      expect(updateCtx.body).toEqual({
        success: false,
        code: 'custom_build_protected',
        message: expect.stringContaining('AgentHub'),
      })
      expect(state.runtimeHandleUpdate).not.toHaveBeenCalled()

      const activateCtx: any = { status: 200, body: null, request: { body: { version: '0.8.33' } } }
      await activateWebUi(activateCtx)
      expect(activateCtx.status).toBe(409)
      expect(activateCtx.body).toEqual({
        success: false,
        code: 'custom_build_protected',
        message: expect.stringContaining('AgentHub'),
      })
      expect(state.activateDownloadedWebUiVersion).not.toHaveBeenCalled()

      const downloadCtx: any = { status: 200, body: null, request: { body: { version: '0.8.33' } } }
      await downloadWebUi(downloadCtx)
      expect(downloadCtx.status).toBe(409)
      expect(downloadCtx.body).toEqual({
        success: false,
        code: 'custom_build_protected',
        message: expect.stringContaining('AgentHub'),
      })
      expect(state.startWebUiVersionDownload).not.toHaveBeenCalled()
    },
  )

  it('allows self-update, active-webui switch, and webui downloads when not a custom build', async () => {
    state.appVersion = '0.8.32'

    const updateCtx: any = { status: 200, body: null }
    await handleUpdate(updateCtx)
    expect(state.runtimeHandleUpdate).toHaveBeenCalledOnce()
    expect(updateCtx.status).toBe(200)

    const activateCtx: any = { status: 200, body: null, request: { body: { version: '0.8.33' } } }
    await activateWebUi(activateCtx)
    expect(state.activateDownloadedWebUiVersion).toHaveBeenCalledWith('0.8.33')
    expect(activateCtx.body).toEqual({ success: true, active: { version: '0.8.33' } })

    const downloadCtx: any = { status: 200, body: null, request: { body: { version: '0.8.33' } } }
    await downloadWebUi(downloadCtx)
    expect(state.startWebUiVersionDownload).toHaveBeenCalledWith('0.8.33', 'cf')
    expect(downloadCtx.status).toBe(202)
  })

  it('disables upstream update checks in StudioHealthService on custom builds', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as any

    state.appVersion = '0.8.32-agenthub.1'
    expect(isCustomBuild()).toBe(true)

    const health = new StudioHealthService({
      platform: 'darwin',
      getPrimaryAgentVersion: state.getPrimaryAgentVersion,
      getPrimaryAgentBridgeHealth: state.getPrimaryAgentBridgeHealth,
      isDockerContainer: () => false,
    })

    await health.checkLatestVersion()
    expect(fetchMock).not.toHaveBeenCalled()

    const snap = await health.snapshot()
    expect(snap.webui_latest).toBe('')
    expect(snap.webui_update_available).toBe(false)
  })
})
