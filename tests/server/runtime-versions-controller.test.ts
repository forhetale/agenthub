import { afterEach, describe, expect, it, vi } from 'vitest'

const VERSION_MANAGER = '../../packages/server/src/modules/hermes/services/runtime/version-manager'
const RUNTIME_SELECTION = '../../packages/server/src/modules/hermes/services/runtime/selection'
const WEB_UI_RESTART = '../../packages/server/src/modules/studio/public/web-ui-restart'

async function loadRuntimeVersionsController() {
  const mocks = {
    activateDownloadedWebUiVersion: vi.fn((version: string) => ({ webUiVersion: version })),
    deleteDownloadedWebUiVersion: vi.fn((version: string) => ({ version, directory: `/webui/${version}`, active: false })),
    getRuntimeVersionStatus: vi.fn(async () => ({})),
    startRuntimeVersionDownload: vi.fn((version: string) => ({ id: 'runtime-job', kind: 'runtime', version })),
    startWebUiVersionDownload: vi.fn((version: string) => ({ id: 'webui-job', kind: 'webui', version })),
  }

  vi.resetModules()
  vi.doMock(VERSION_MANAGER, () => ({
    activateInstalledRuntimeVersion: vi.fn(),
    activateDownloadedWebUiVersion: mocks.activateDownloadedWebUiVersion,
    deleteDownloadedWebUiVersion: mocks.deleteDownloadedWebUiVersion,
    deleteInstalledRuntimeVersion: vi.fn(),
    getVersionDownloadJob: vi.fn(),
    getRuntimeVersionStatus: mocks.getRuntimeVersionStatus,
    listVersionDownloadJobs: vi.fn(() => []),
    scheduleRuntimeRootMigration: vi.fn(),
    startRuntimeVersionDownload: mocks.startRuntimeVersionDownload,
    startWebUiVersionDownload: mocks.startWebUiVersionDownload,
  }))
  vi.doMock(RUNTIME_SELECTION, () => ({ configurePreferredHermesRuntime: vi.fn(async () => undefined) }))
  vi.doMock(WEB_UI_RESTART, () => ({ scheduleWebUiRestart: vi.fn() }))

  const controller = await import('../../packages/server/src/modules/hermes/controllers/runtime-versions')
  return { controller, mocks }
}

function createCtx(body: Record<string, unknown> = {}, params: Record<string, string> = {}) {
  return {
    status: 200,
    body: null as any,
    request: { body },
    params,
    query: {},
  } as any
}

describe('runtime versions controller custom-build guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock(VERSION_MANAGER)
    vi.doUnmock(RUNTIME_SELECTION)
    vi.doUnmock(WEB_UI_RESTART)
    vi.resetModules()
  })

  it('refuses to download an upstream Web UI package on TATin custom builds', async () => {
    vi.stubGlobal('__APP_VERSION__', '0.7.21-tatin.5')
    const { controller, mocks } = await loadRuntimeVersionsController()
    const ctx = createCtx({ version: '0.7.22', source: 'github' })

    await controller.downloadWebUi(ctx)

    expect(ctx.status).toBe(409)
    expect(ctx.body).toEqual({
      success: false,
      code: 'custom_build_protected',
      message: expect.stringContaining('custom build'),
    })
    expect(mocks.startWebUiVersionDownload).not.toHaveBeenCalled()
  })

  it('refuses to activate a downloaded Web UI on TATin custom builds', async () => {
    vi.stubGlobal('__APP_VERSION__', '0.7.21-tatin.5')
    const { controller, mocks } = await loadRuntimeVersionsController()
    const ctx = createCtx({ version: '0.7.22' })

    await controller.activateWebUi(ctx)

    expect(ctx.status).toBe(409)
    expect(ctx.body).toEqual({
      success: false,
      code: 'custom_build_protected',
      message: expect.stringContaining('custom build'),
    })
    expect(mocks.activateDownloadedWebUiVersion).not.toHaveBeenCalled()
  })

  it('keeps Hermes Agent runtime downloads and Web UI cleanup available on TATin custom builds', async () => {
    vi.stubGlobal('__APP_VERSION__', '0.7.21-tatin.5')
    const { controller, mocks } = await loadRuntimeVersionsController()

    const downloadCtx = createCtx({ version: '0.20.6', source: 'cf' })
    await controller.downloadRuntime(downloadCtx)
    const deleteCtx = createCtx({}, { version: '0.7.20' })
    await controller.deleteWebUi(deleteCtx)

    expect(downloadCtx.status).toBe(202)
    expect(mocks.startRuntimeVersionDownload).toHaveBeenCalledWith('0.20.6', 'cf')
    expect(deleteCtx.body).toEqual(expect.objectContaining({ success: true }))
    expect(mocks.deleteDownloadedWebUiVersion).toHaveBeenCalledWith('0.7.20')
  })

  it('downloads and activates Web UI versions on upstream builds', async () => {
    vi.stubGlobal('__APP_VERSION__', '0.7.21')
    const { controller, mocks } = await loadRuntimeVersionsController()

    const downloadCtx = createCtx({ version: '0.7.22', source: 'github' })
    await controller.downloadWebUi(downloadCtx)
    const activateCtx = createCtx({ version: '0.7.22' })
    await controller.activateWebUi(activateCtx)

    expect(downloadCtx.status).toBe(202)
    expect(downloadCtx.body).toEqual({ success: true, job: expect.objectContaining({ kind: 'webui', version: '0.7.22' }) })
    expect(mocks.startWebUiVersionDownload).toHaveBeenCalledWith('0.7.22', 'github')
    expect(activateCtx.status).toBe(200)
    expect(activateCtx.body).toEqual({ success: true, active: { webUiVersion: '0.7.22' } })
  })
})
