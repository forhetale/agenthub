import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'

export const HUB_AGENT_DATA_DIR_NAME = '.hub-agent'
export const HUB_AGENT_DATABASE_FILE_NAME = 'hub-agent.db'
export const HUB_AGENT_HERMES_SKILL_CLEANUP_FILENAME = '.hub-agent-hermes-skill-cleanup-v2.json'
export const HUB_AGENT_BUILTIN_SKILL_MANIFEST_FILENAME = '.hub-agent-builtin-skills.json'
export const HUB_AGENT_BUILTIN_SKILL_MANIFEST_OWNER = 'hub-agent'
export const HUB_AGENT_SKILL_RESET_QUARANTINE_PREFIX = '.hub-agent-skills-reset-'
export const HUB_AGENT_SKILL_MARKER_FILENAME = '.hub-agent-skill.json'
export const HUB_AGENT_SKILL_BACKUPS_DIR_NAME = '.hub-agent-backups'
export const HUB_AGENT_SKILL_ARCHIVE_DIR_NAME = '.hub-agent-archive'

// Backwards-compatibility migration constants for automatic upgrades from legacy ~/.ekko installs.
export const LEGACY_DATA_DIR_NAME = '.ekko'
export const LEGACY_DATABASE_FILE_NAME = 'ekko.db'
export const LEGACY_HERMES_SKILL_CLEANUP_FILENAME = '.ekko-hermes-skill-cleanup-v2.json'
export const LEGACY_BUILTIN_SKILL_MANIFEST_FILENAME = '.ekko-builtin-skills.json'
export const LEGACY_BUILTIN_SKILL_MANIFEST_OWNER = 'ekko-agent'
export const LEGACY_SKILL_RESET_QUARANTINE_PREFIX = '.ekko-skills-reset-'
export const LEGACY_SKILL_MARKER_FILENAME = '.ekko-skill.json'
export const LEGACY_SKILL_BACKUPS_DIR_NAME = '.ekko-backups'
export const LEGACY_SKILL_ARCHIVE_DIR_NAME = '.ekko-archive'
export const LEGACY_LOG_FILE_NAME = 'ekko-agent.jsonl'

const LEGACY_CONFIG_PATH_PATTERN = /(^|[\\/])\.ekko(?=[\\/]|$)/gu

/**
 * Idempotently migrates a legacy `<appHome>/.ekko` data directory and its
 * owned database, config paths, skill markers, and log files to `.hub-agent`
 * before any SQLite connection or config normalization runs.
 */
export function migrateLegacyHubAgentStorage(targetRootDirectory: string): void {
  const resolvedRoot = resolve(targetRootDirectory)
  if (basename(resolvedRoot) === HUB_AGENT_DATA_DIR_NAME) {
    const legacyRoot = join(dirname(resolvedRoot), LEGACY_DATA_DIR_NAME)
    if (!existsSync(resolvedRoot) && existsSync(legacyRoot)) {
      moveDirectoryAtomically(legacyRoot, resolvedRoot)
    }
  }

  if (!existsSync(resolvedRoot)) return

  migrateLegacyDatabase(resolvedRoot)
  migrateLegacyCleanupMarker(resolvedRoot)
  migrateLegacyConfigPaths(join(resolvedRoot, 'config', 'config.json'))
  migrateLegacyProfileArtifacts(resolvedRoot)
}

/**
 * Atomically renames a SQLite database and its optional `-wal` / `-shm` companion
 * files, rolling back every already-moved file if a later step fails.
 */
export function renameDatabaseFamily(
  sourcePath: string,
  targetPath: string,
  options: { skipExistingTarget?: boolean } = {},
): void {
  const moved: Array<{ source: string; target: string }> = []
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const source = `${sourcePath}${suffix}`
      const target = `${targetPath}${suffix}`
      if (!existsSync(source)) continue
      if (options.skipExistingTarget && existsSync(target)) continue
      renameSync(source, target)
      moved.push({ source, target })
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      try {
        renameSync(item.target, item.source)
      } catch {
        // Preserve the original rename error and every recoverable file.
      }
    }
    throw error
  }
}

function migrateLegacyDatabase(rootDirectory: string): void {
  const legacyDatabasePath = join(rootDirectory, LEGACY_DATABASE_FILE_NAME)
  const targetDatabasePath = join(rootDirectory, HUB_AGENT_DATABASE_FILE_NAME)
  if (!existsSync(legacyDatabasePath) || existsSync(targetDatabasePath)) return
  renameDatabaseFamily(legacyDatabasePath, targetDatabasePath, { skipExistingTarget: true })
}

function migrateLegacyCleanupMarker(rootDirectory: string): void {
  const legacyCleanupPath = join(rootDirectory, LEGACY_HERMES_SKILL_CLEANUP_FILENAME)
  const targetCleanupPath = join(rootDirectory, HUB_AGENT_HERMES_SKILL_CLEANUP_FILENAME)
  if (!existsSync(legacyCleanupPath) || existsSync(targetCleanupPath)) return
  try {
    renameSync(legacyCleanupPath, targetCleanupPath)
  } catch {
    // Non-fatal: the directory manager still recognizes the legacy marker if rename fails.
  }
}

function migrateLegacyConfigPaths(configPath: string): void {
  if (!existsSync(configPath)) return
  let raw: string
  let parsed: unknown
  try {
    raw = readFileSync(configPath, 'utf8')
    parsed = JSON.parse(raw)
  } catch {
    return
  }

  let changed = false
  const rewriteValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const next = value.replace(LEGACY_CONFIG_PATH_PATTERN, `$1${HUB_AGENT_DATA_DIR_NAME}`)
      if (next !== value) changed = true
      return next
    }
    if (Array.isArray(value)) {
      return value.map(rewriteValue)
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) {
        result[key] = rewriteValue(entry)
      }
      return result
    }
    return value
  }

  const rewritten = rewriteValue(parsed)
  if (!changed) return

  writeJsonAtomically(configPath, rewritten)
}

function migrateLegacyProfileArtifacts(rootDirectory: string): void {
  const skillsRoot = join(rootDirectory, 'skills')
  for (const profileDir of childDirectories(skillsRoot)) {
    renameIfMissing(
      join(profileDir, LEGACY_SKILL_BACKUPS_DIR_NAME),
      join(profileDir, HUB_AGENT_SKILL_BACKUPS_DIR_NAME),
    )
    renameIfMissing(
      join(profileDir, LEGACY_SKILL_ARCHIVE_DIR_NAME),
      join(profileDir, HUB_AGENT_SKILL_ARCHIVE_DIR_NAME),
    )
    migrateBuiltinManifest(profileDir)
    for (const skillDir of childDirectories(profileDir)) {
      migrateSkillMarker(skillDir)
    }
  }

  const logsRoot = join(rootDirectory, 'logs')
  for (const profileLogDir of childDirectories(logsRoot)) {
    renameIfMissing(
      join(profileLogDir, LEGACY_LOG_FILE_NAME),
      join(profileLogDir, 'hub-agent.jsonl'),
    )
  }
}

function migrateBuiltinManifest(profileDir: string): void {
  const legacyPath = join(profileDir, LEGACY_BUILTIN_SKILL_MANIFEST_FILENAME)
  const targetPath = join(profileDir, HUB_AGENT_BUILTIN_SKILL_MANIFEST_FILENAME)
  if (!existsSync(legacyPath) || existsSync(targetPath)) return
  renameIfMissing(legacyPath, targetPath)
  try {
    const parsed = JSON.parse(readFileSync(targetPath, 'utf8')) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    let changed = false
    for (const entry of Object.values(parsed)) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>
        if (record.owner === LEGACY_BUILTIN_SKILL_MANIFEST_OWNER) {
          record.owner = HUB_AGENT_BUILTIN_SKILL_MANIFEST_OWNER
          changed = true
        }
      }
    }
    if (changed) writeJsonAtomically(targetPath, parsed)
  } catch {
    // Preserve migrated file even if manifest content was malformed.
  }
}

function migrateSkillMarker(skillDir: string): void {
  const legacyPath = join(skillDir, LEGACY_SKILL_MARKER_FILENAME)
  const targetPath = join(skillDir, HUB_AGENT_SKILL_MARKER_FILENAME)
  if (!existsSync(legacyPath) || existsSync(targetPath)) return
  renameIfMissing(legacyPath, targetPath)
  try {
    const parsed = JSON.parse(readFileSync(targetPath, 'utf8')) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && parsed.createdBy === LEGACY_BUILTIN_SKILL_MANIFEST_OWNER) {
      parsed.createdBy = HUB_AGENT_BUILTIN_SKILL_MANIFEST_OWNER
      writeJsonAtomically(targetPath, parsed)
    }
  } catch {
    // Preserve migrated marker even if unreadable.
  }
}

function moveDirectoryAtomically(sourcePath: string, targetPath: string): void {
  try {
    renameSync(sourcePath, targetPath)
    return
  } catch (error) {
    if (!isErrorWithCode(error, 'EXDEV')) throw error
  }
  const stagingPath = join(dirname(targetPath), `${HUB_AGENT_DATA_DIR_NAME}.migrating-${randomUUID()}`)
  try {
    cpSync(sourcePath, stagingPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    })
    renameSync(stagingPath, targetPath)
  } catch (error) {
    rmSync(stagingPath, { recursive: true, force: true })
    throw error
  }
  rmSync(sourcePath, { recursive: true, force: true })
}

function childDirectories(directory: string): string[] {
  if (!existsSync(directory)) return []
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => join(directory, entry.name))
  } catch {
    return []
  }
}

function renameIfMissing(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath) || existsSync(targetPath)) return
  try {
    if (lstatSync(sourcePath)) {
      renameSync(sourcePath, targetPath)
    }
  } catch {
    // Best-effort migration of auxiliary artifacts.
  }
}

function writeJsonAtomically(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      rmSync(tempPath, { force: true })
    } catch {
      // Preserve write failure.
    }
    throw error
  }
}

function isErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}
