import type { App } from 'electron'
import { win32 } from 'node:path'

// The AppUserModelId (and therefore the Run value name) did not change with
// branding. Replace that one value in place; never enable a new startup item.
export function migrateWindowsLoginItem(
  app: Pick<App, 'isPackaged' | 'getLoginItemSettings' | 'setLoginItemSettings'>,
  appUserModelId: string,
  executablePath = process.execPath,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32' || !app.isPackaged) return false
  if (win32.basename(executablePath).toLowerCase() !== 'agenthub.exe') return false

  // Migrate login entries from earlier Hermes Studio / upstream Ekko Studio Windows installs.
  for (const legacyExecutable of ['Hermes Studio.exe', 'Ekko Studio.exe']) {
    const legacyPath = win32.join(win32.dirname(executablePath), legacyExecutable)
    const args = ['--hidden']
    const settings = app.getLoginItemSettings({ path: legacyPath, args })
    const legacyItem = settings.launchItems?.find(item => (
      item.scope === 'user' && item.name === appUserModelId &&
      win32.normalize(item.path).toLowerCase() === win32.normalize(legacyPath).toLowerCase() &&
      item.args.length === 1 && item.args[0] === '--hidden' &&
      typeof item.enabled === 'boolean'
    ))
    if (!legacyItem) continue

    app.setLoginItemSettings({
      name: appUserModelId,
      path: executablePath,
      args,
      openAtLogin: true,
      enabled: legacyItem.enabled,
    })
    return true
  }
  return false
}
