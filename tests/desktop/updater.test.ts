import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isCustomBuildWebUi,
  isWindowsUpdaterLockError,
  pendingUpdateDirectories,
} from '../../packages/desktop/src/main/updater-helpers'
import {
  desktopUpdateChannel,
  resolveDesktopUpdateSource,
  validateTestUpdateUrl,
} from '../../packages/desktop/src/main/updater-source'

const desktopRequire = createRequire(new URL('../../packages/desktop/package.json', import.meta.url))

function resolveDesktopModule(specifier: string): string {
  try {
    return desktopRequire.resolve(specifier)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
    return specifier
  }
}

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

  const electronMock = () => ({
    app: {
      isPackaged: true,
      getVersion: () => '0.8.32',
      getLocale: () => 'en',
      getName: () => 'AgentHub',
      getPath: () => webuiRoot,
      getAppPath: () => webuiRoot,
    },
    dialog: { showMessageBox },
    autoUpdater: { on: vi.fn() },
  })
  const electronUpdaterMock = () => ({
    autoUpdater,
    CancellationToken: class { cancelled = false; cancel() { this.cancelled = true } },
  })

  vi.resetModules()
  for (const id of new Set(['electron', resolveDesktopModule('electron')])) {
    vi.doMock(id, electronMock)
  }
  for (const id of new Set(['electron-updater', resolveDesktopModule('electron-updater')])) {
    vi.doMock(id, electronUpdaterMock)
  }
  vi.doMock('../../packages/desktop/src/main/paths', () => ({ defaultWebuiDir: () => webuiRoot }))

  const updater = await import('../../packages/desktop/src/main/updater')
  return { updater, autoUpdater, showMessageBox }
}

describe('desktop updater custom-build guard', () => {
  afterEach(() => {
    for (const id of new Set(['electron', resolveDesktopModule('electron')])) {
      vi.doUnmock(id)
    }
    for (const id of new Set(['electron-updater', resolveDesktopModule('electron-updater')])) {
      vi.doUnmock(id)
    }
    vi.doUnmock('../../packages/desktop/src/main/paths')
    vi.unstubAllEnvs()
    vi.resetModules()
    for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('detects custom builds from the bundled Web UI package version', () => {
    expect(isCustomBuildWebUi(createWebUiRoot(JSON.stringify({ version: '0.8.32-agenthub.1' })))).toBe(true)
    expect(isCustomBuildWebUi(createWebUiRoot(JSON.stringify({ version: '0.7.21-tatin.5' })))).toBe(true)
    expect(isCustomBuildWebUi(createWebUiRoot(JSON.stringify({ version: '0.8.32' })))).toBe(false)
    expect(isCustomBuildWebUi(createWebUiRoot('not json'))).toBe(false)
    expect(isCustomBuildWebUi(createWebUiRoot(null))).toBe(false)
    // In development the desktop app bundles the repository root as its Web UI.
    expect(isCustomBuildWebUi(process.cwd())).toBe(true)
  })

  it('refuses to download or install upstream desktop updates on a custom build', async () => {
    const { updater, autoUpdater } = await loadUpdater('0.8.32-agenthub.1')

    expect(() => updater.downloadDesktopUpdate()).toThrow('Custom builds do not download upstream desktop updates')
    await expect(updater.installDesktopUpdate()).resolves.toMatchObject({ status: updater.getDesktopUpdateState().status })

    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('refuses to download or install upstream desktop updates on a legacy tatin custom build', async () => {
    const { updater, autoUpdater } = await loadUpdater('0.7.21-tatin.5')

    expect(() => updater.downloadDesktopUpdate()).toThrow('Custom builds do not download upstream desktop updates')
    await expect(updater.installDesktopUpdate()).resolves.toMatchObject({ status: updater.getDesktopUpdateState().status })

    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('never contacts the upstream update feed from a custom build', async () => {
    vi.stubEnv('HERMES_DESKTOP_ENABLE_AUTO_UPDATE', '')
    const { updater, autoUpdater, showMessageBox } = await loadUpdater('0.8.32-agenthub.1')

    updater.initAutoUpdater()
    await updater.checkForDesktopUpdates(false)
    await updater.checkForDesktopUpdates(true)

    expect(autoUpdater.on).not.toHaveBeenCalled()
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(showMessageBox).toHaveBeenCalledOnce()
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('AgentHub custom build does not install upstream updates'),
    }))
  })

  it('keeps checking the non-commercial feed for non-custom builds', async () => {
    vi.stubEnv('HERMES_DESKTOP_ENABLE_AUTO_UPDATE', '')
    const { updater, autoUpdater } = await loadUpdater('0.8.32')

    updater.initAutoUpdater()

    await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce())
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/forhetale/agenthub/releases/latest/download',
      channel: desktopUpdateChannel(),
    })
  })
})

describe('desktop updater helpers and source policy', () => {
  it('resolves non-commercial release feeds and rejects production URLs as test feeds', () => {
    expect(resolveDesktopUpdateSource({ name: 'hermes-studio', version: '0.8.32' })).toEqual({
      channel: 'stable',
      url: 'https://github.com/forhetale/agenthub/releases/latest/download',
      fallbackUrl: 'https://github.com/forhetale/agenthub/releases/latest/download',
    })
    expect(() => validateTestUpdateUrl('https://github.com/forhetale/agenthub/releases/latest/download')).toThrow()
    expect(() => validateTestUpdateUrl('https://example.com/feed/latest.yml')).toThrow()
    expect(validateTestUpdateUrl('https://example.com/test-feed')).toBe('https://example.com/test-feed/')
  })

  it('detects Squirrel locked-exe update failures', () => {
    expect(isWindowsUpdaterLockError(new Error('Failed to uninstall old application files. Please try running the installer again.: 2'))).toBe(true)
    expect(isWindowsUpdaterLockError(new Error('Squirrel update failed with code 2'))).toBe(true)
    expect(isWindowsUpdaterLockError(new Error('network timeout'))).toBe(false)
  })

  it('includes local and roaming pending update cache directories', () => {
    const local = 'C:\\Users\\A\\AppData\\Local'
    const roaming = 'C:\\Users\\A\\AppData\\Roaming'
    expect(pendingUpdateDirectories({
      appDataPath: roaming,
      localAppData: local,
      appName: 'AgentHub',
    })).toEqual(expect.arrayContaining([
      join(local, 'AgentHub-updater', 'pending'),
      join(local, 'agenthub-updater', 'pending'),
      join(local, 'Hermes Studio-updater', 'pending'),
      join(local, 'hermes-studio-updater', 'pending'),
      join(roaming, 'hermes-studio-updater', 'pending'),
    ]))
  })

  it('checks on startup without forcing auto-download or auto-install', () => {
    const updaterSource = readFileSync(resolve('packages/desktop/src/main/updater.ts'), 'utf-8')
    const mainSource = readFileSync(resolve('packages/desktop/src/main/index.ts'), 'utf-8')

    expect(mainSource).toContain('checkForDesktopUpdates(true)')
    expect(updaterSource).toContain('checkForDesktopUpdates(false)')
    expect(updaterSource).toContain('autoUpdater.autoDownload = false')
    expect(updaterSource).toContain('autoUpdater.autoInstallOnAppQuit = false')
    expect(updaterSource).toContain("buttons: [t('update.download'), t('update.later')]")
    expect(updaterSource).toContain('if (response === 0) downloadDesktopUpdate()')
    expect(updaterSource).not.toContain('setInterval(')
  })
})
