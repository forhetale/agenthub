import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCustomBuildWebUi, isWindowsUpdaterLockError, pendingUpdateDirectories } from '../../packages/desktop/src/main/updater-helpers'

const tempRoots: string[] = []

function createWebUiRoot(packageJson: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-updater-webui-'))
  tempRoots.push(root)
  if (packageJson !== null) writeFileSync(join(root, 'package.json'), packageJson)
  return root
}

async function loadUpdater(bundledWebUiVersion: string) {
  const webuiRoot = createWebUiRoot(JSON.stringify({ name: 'hermes-web-ui', version: bundledWebUiVersion }))
  const showMessageBox = vi.fn().mockResolvedValue({ response: 1 })
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  }

  vi.resetModules()
  vi.doMock('electron', () => ({
    app: {
      isPackaged: true,
      getVersion: () => '0.7.21',
      getLocale: () => 'en',
      getName: () => 'Ekko Studio',
      getPath: () => webuiRoot,
    },
    dialog: { showMessageBox },
  }))
  vi.doMock('electron-updater', () => ({ autoUpdater }))
  vi.doMock('../../packages/desktop/src/main/paths', () => ({ defaultWebuiDir: () => webuiRoot }))

  const updater = await import('../../packages/desktop/src/main/updater')
  return { updater, autoUpdater, showMessageBox }
}

describe('desktop updater custom-build guard', () => {
  afterEach(() => {
    vi.doUnmock('electron')
    vi.doUnmock('electron-updater')
    vi.doUnmock('../../packages/desktop/src/main/paths')
    vi.unstubAllEnvs()
    vi.resetModules()
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('detects custom builds from the bundled Web UI package version', () => {
    expect(isCustomBuildWebUi(createWebUiRoot(JSON.stringify({ version: '0.7.21-tatin.5' })))).toBe(true)
    expect(isCustomBuildWebUi(createWebUiRoot(JSON.stringify({ version: '0.7.21' })))).toBe(false)
    expect(isCustomBuildWebUi(createWebUiRoot('not json'))).toBe(false)
    expect(isCustomBuildWebUi(createWebUiRoot(null))).toBe(false)
    // In development the desktop app bundles the repository root as its Web UI.
    expect(isCustomBuildWebUi(process.cwd())).toBe(true)
  })

  it('never contacts the upstream update feed from a custom build', async () => {
    vi.stubEnv('HERMES_DESKTOP_ENABLE_AUTO_UPDATE', '')
    const { updater, autoUpdater, showMessageBox } = await loadUpdater('0.7.21-tatin.5')

    updater.initAutoUpdater()
    await updater.checkForDesktopUpdates(false)
    await updater.checkForDesktopUpdates(true)

    expect(autoUpdater.on).not.toHaveBeenCalled()
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(showMessageBox).toHaveBeenCalledOnce()
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('TATin Studio custom build does not install upstream updates'),
    }))
  })

  it('keeps checking the update feed for upstream builds', async () => {
    vi.stubEnv('HERMES_DESKTOP_ENABLE_AUTO_UPDATE', '')
    const { updater, autoUpdater } = await loadUpdater('0.7.21')

    updater.initAutoUpdater()

    await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce())
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({ provider: 'generic', url: 'https://download.ekkolearnai.com/latest' })
  })
})

describe('desktop updater helpers', () => {
  it('detects Squirrel locked-exe update failures', async () => {
    expect(isWindowsUpdaterLockError(new Error('Failed to uninstall old application files. Please try running the installer again.: 2'))).toBe(true)
    expect(isWindowsUpdaterLockError(new Error('Squirrel update failed with code 2'))).toBe(true)
    expect(isWindowsUpdaterLockError(new Error('network timeout'))).toBe(false)
  })

  it('includes local and roaming pending update cache directories', async () => {
    expect(pendingUpdateDirectories({
      appDataPath: 'C:\\Users\\A\\AppData\\Roaming',
      localAppData: 'C:\\Users\\A\\AppData\\Local',
      appName: 'Ekko Studio',
    })).toEqual(expect.arrayContaining([
      'C:\\Users\\A\\AppData\\Local/Ekko Studio-updater/pending',
      'C:\\Users\\A\\AppData\\Local/ekko-studio-updater/pending',
      'C:\\Users\\A\\AppData\\Local/Hermes Studio-updater/pending',
      'C:\\Users\\A\\AppData\\Local/hermes-studio-updater/pending',
      'C:\\Users\\A\\AppData\\Roaming/hermes-studio-updater/pending',
    ]))
  })

  it('checks on startup and from the tray without forcing an update', () => {
    const updaterSource = readFileSync(resolve('packages/desktop/src/main/updater.ts'), 'utf-8')
    const mainSource = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(mainSource).toContain('checkForDesktopUpdates(true)')
    expect(updaterSource).toContain('checkForDesktopUpdates(false)')
    expect(updaterSource).toContain('autoUpdater.autoDownload = false')
    expect(updaterSource).toContain('autoUpdater.autoInstallOnAppQuit = true')
    expect(updaterSource).toContain("buttons: [t('update.download'), t('update.later')]")
    expect(updaterSource).toContain('if (response === 0) {\n    await autoUpdater.downloadUpdate()')
    expect(updaterSource).not.toContain('setInterval(')
  })

  it('gracefully stops the current app before starting a downloaded update', () => {
    const updaterSource = readFileSync(resolve('packages/desktop/src/main/updater.ts'), 'utf-8')
    const mainSource = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(mainSource).toContain('async function prepareAppShutdown(): Promise<void>')
    expect(mainSource).toContain('await stopWebUiServer().catch(() => undefined)')
    expect(mainSource).toContain('initAutoUpdater({ beforeQuitAndInstall: prepareAppShutdown })')
    expect(mainSource).toContain('try {\n      await prepareAppShutdown()\n    } finally {\n      appLifecycle.finalizeExit(0)')

    const prepareCurrentInstance = updaterSource.indexOf('await options.beforeQuitAndInstall?.()')
    const stopOtherInstances = updaterSource.indexOf('await stopOtherWindowsAppInstances()', prepareCurrentInstance)
    const startInstaller = updaterSource.indexOf('autoUpdater.quitAndInstall()', stopOtherInstances)
    expect(prepareCurrentInstance).toBeGreaterThan(-1)
    expect(stopOtherInstances).toBeGreaterThan(prepareCurrentInstance)
    expect(startInstaller).toBeGreaterThan(stopOtherInstances)
  })
})
