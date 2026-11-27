import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute } from 'node:path'
import { getProfileUploadDir } from './upload-paths'

async function uploadedFileRealPath(path: string, profile: string): Promise<string | null> {
  const root = getProfileUploadDir(profile)
  if (!isAbsolute(path) || dirname(path) !== root || !/^(?:[a-f0-9]{16}|[a-f0-9]{24})(?:\.[a-zA-Z0-9]{1,20})?$/.test(basename(path))) return null
  const info = await lstat(path).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink()) return null
  const [actual, actualRoot] = await Promise.all([realpath(path).catch(() => ''), realpath(root).catch(() => '')])
  return actual && actualRoot && dirname(actual) === actualRoot ? actual : null
}

export async function recordSessionUploadAttachments(
  _sessionId: string,
  _profile: string,
  _input: unknown,
  _options: { allowPendingSession?: boolean } = {},
): Promise<void> {
  // Validated on demand from the profile upload directory without separate App tracking.
}

export async function isSessionUploadAttachment(_sessionId: string, profile: string, path: string): Promise<boolean> {
  return Boolean(await uploadedFileRealPath(path, profile))
}
