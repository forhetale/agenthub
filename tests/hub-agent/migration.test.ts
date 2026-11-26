import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_HUB_AGENT_JEV_CONFIG,
  HUB_AGENT_CONVERSATION_MIGRATIONS,
  HubAgentDatabaseManager,
  HubAgentDirectoryManager,
  setupHubAgent,
} from '../../packages/hub-agent/src'

const tempRoots: string[] = []

function makeTempBase(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hub-agent-migration-test-'))
  tempRoots.push(dir)
  return dir
}

/**
 * Produces a valid SQLite WAL database snapshot plus non-empty `-wal` and `-shm`
 * sidecars containing an uncheckpointed committed transaction.
 */
function writeLegacyDatabaseWithWal(targetDbPath: string): void {
  const stagingDir = makeTempBase()
  const stagingDbPath = join(stagingDir, 'ekko.db')
  const manager = new HubAgentDatabaseManager({
    databasePath: stagingDbPath,
    env: { NODE_ENV: 'production' },
  })
  manager.migrate(HUB_AGENT_CONVERSATION_MIGRATIONS)
  const db = manager.connection
  db.exec('PRAGMA wal_autocheckpoint=0')
  db.prepare(
    `INSERT INTO sessions (id, profile, source, agent, title, started_at, last_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('session-base', 'default', 'ekko-agent', 'ekko-agent', 'Base session', 100, 100)
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')

  db.exec('BEGIN IMMEDIATE')
  db.prepare(
    `INSERT INTO sessions (id, profile, source, agent, title, started_at, last_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('session-wal-only', 'default', 'ekko-agent', 'ekko-agent', 'WAL uncommitted frame', 200, 200)
  db.exec('COMMIT')

  expect(existsSync(`${stagingDbPath}-wal`)).toBe(true)
  expect(readFileSync(`${stagingDbPath}-wal`).length).toBeGreaterThan(0)
  expect(existsSync(`${stagingDbPath}-shm`)).toBe(true)

  mkdirSync(join(targetDbPath, '..'), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${stagingDbPath}${suffix}`)) {
      copyFileSync(`${stagingDbPath}${suffix}`, `${targetDbPath}${suffix}`)
    }
  }
  manager.close()
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()!
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('Hub Agent directory and database migration', () => {
  it('initializes a fresh .hub-agent layout with hub-agent.db and default-off JEV', () => {
    const base = makeTempBase()
    const agent = setupHubAgent({ baseDirectory: base })
    try {
      const expectedRoot = join(base, '.hub-agent')
      const expectedDb = join(expectedRoot, 'hub-agent.db')

      expect(agent.layout.rootDirectory).toBe(expectedRoot)
      expect(agent.layout.databasePath).toBe(expectedDb)
      expect(existsSync(expectedRoot)).toBe(true)
      expect(existsSync(expectedDb)).toBe(true)
      expect(existsSync(join(expectedRoot, 'config', 'config.json'))).toBe(true)
      expect(existsSync(join(base, '.ekko'))).toBe(false)
      expect(existsSync(join(expectedRoot, 'ekko.db'))).toBe(false)

      expect(DEFAULT_HUB_AGENT_JEV_CONFIG.enabled).toBe(false)
      expect(agent.jev.available).toBe(false)
      expect(agent.jev.settings).toMatchObject({
        enabled: false,
        memoryEnabled: false,
        skillsEnabled: false,
        computerUseMatchEnabled: false,
        computerUseVerifyEnabled: false,
      })

      agent.default.conversation.createSession({ id: 'fresh-session', title: 'Fresh' })
      expect(agent.default.conversation.getSession('fresh-session')?.title).toBe('Fresh')
    } finally {
      agent.close()
    }
  })

  it('migrates .ekko to .hub-agent including ekko.db (-wal/-shm), config.json paths, cleanup marker, skills, and logs', async () => {
    const base = makeTempBase()
    const legacyRoot = join(base, '.ekko')
    const fakeHermesRoot = join(base, '.hermes')
    mkdirSync(fakeHermesRoot, { recursive: true })

    writeLegacyDatabaseWithWal(join(legacyRoot, 'ekko.db'))

    mkdirSync(join(legacyRoot, 'config'), { recursive: true })
    const legacyExternalPath = join(base, '.ekko', 'external-skills')
    const legacyMcpPath = join(base, '.ekko', 'mcp-data')
    writeFileSync(
      join(legacyRoot, 'config', 'config.json'),
      `${JSON.stringify({
        schemaVersion: 15,
        prompt: { instructions: ['ekko-note-untouched'] },
        skills: {
          enabled: true,
          profiles: {
            default: {
              externalDirectories: [legacyExternalPath, 'C:\\Users\\alice\\.ekko\\extra'],
              disabled: [],
            },
          },
        },
        mcp: {
          enabled: true,
          profiles: {
            default: {
              servers: {
                local: {
                  command: 'node',
                  args: [legacyMcpPath, '/srv/data/.ekko'],
                },
              },
            },
          },
        },
      }, null, 2)}\n`,
      'utf8',
    )

    writeFileSync(
      join(legacyRoot, '.ekko-hermes-skill-cleanup-v2.json'),
      JSON.stringify({ version: 2, resetSkillsDirectory: true }),
      'utf8',
    )

    const legacySkillDir = join(legacyRoot, 'skills', 'default', 'custom-workflow')
    mkdirSync(legacySkillDir, { recursive: true })
    writeFileSync(join(legacyRoot, 'skills', 'default', 'preserve.txt'), 'kept', 'utf8')
    writeFileSync(
      join(legacySkillDir, 'SKILL.md'),
      [
        '---',
        'name: custom-workflow',
        'description: Migrated workflow skill',
        'metadata:',
        '  keywords:',
        '    - custom workflow',
        '---',
        '',
        '# Custom Workflow',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(legacySkillDir, '.ekko-skill.json'),
      JSON.stringify({
        createdBy: 'ekko-agent',
        origin: 'foreground',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf8',
    )

    const legacyLogDir = join(legacyRoot, 'logs', 'default')
    mkdirSync(legacyLogDir, { recursive: true })
    writeFileSync(join(legacyLogDir, 'ekko-agent.jsonl'), '{"message":"legacy"}\n', 'utf8')

    const agent = setupHubAgent({
      baseDirectory: base,
      hermesRootDirectory: fakeHermesRoot,
    })
    try {
      const targetRoot = join(base, '.hub-agent')
      expect(existsSync(legacyRoot)).toBe(false)
      expect(existsSync(targetRoot)).toBe(true)
      expect(existsSync(join(targetRoot, 'hub-agent.db'))).toBe(true)
      expect(existsSync(join(targetRoot, 'ekko.db'))).toBe(false)
      expect(existsSync(join(targetRoot, 'ekko.db-wal'))).toBe(false)
      expect(existsSync(join(targetRoot, 'ekko.db-shm'))).toBe(false)

      // Both checkpointed and WAL-only rows survive migration.
      expect(agent.default.conversation.getSession('session-base')?.title).toBe('Base session')
      expect(agent.default.conversation.getSession('session-wal-only')?.title).toBe('WAL uncommitted frame')

      // Legacy config paths rewritten without mutating non-path fields.
      const migratedConfig = agent.readConfig()
      expect(migratedConfig.prompt.instructions).toEqual(['ekko-note-untouched'])
      expect(migratedConfig.skills.profiles.default.externalDirectories).toEqual([
        join(base, '.hub-agent', 'external-skills'),
        'C:\\Users\\alice\\.hub-agent\\extra',
      ])
      expect(migratedConfig.mcp.profiles.default.servers.local.args).toEqual([
        join(base, '.hub-agent', 'mcp-data'),
        '/srv/data/.hub-agent',
      ])

      // Cleanup marker recognized & migrated so existing skills are not wiped.
      expect(existsSync(join(targetRoot, '.ekko-hermes-skill-cleanup-v2.json'))).toBe(false)
      expect(existsSync(join(targetRoot, '.hub-agent-hermes-skill-cleanup-v2.json'))).toBe(true)
      expect(readFileSync(join(targetRoot, 'skills', 'default', 'preserve.txt'), 'utf8')).toBe('kept')

      // Managed skill metadata & log files migrated.
      expect(existsSync(join(targetRoot, 'skills', 'default', 'custom-workflow', '.ekko-skill.json'))).toBe(false)
      expect(existsSync(join(targetRoot, 'skills', 'default', 'custom-workflow', '.hub-agent-skill.json'))).toBe(true)
      const discovered = await agent.default.skill.discover()
      const discoveredSkills = (discovered.data?.skills as Array<{ name?: string; managedByHubAgent?: boolean }> | undefined) ?? []
      const customSkill = discoveredSkills.find(skill => skill.name === 'custom-workflow')
      expect(customSkill?.managedByHubAgent).toBe(true)
      const viewed = await agent.default.skill.view('custom-workflow')
      expect(viewed.ok).toBe(true)
      expect(viewed.data?.managedByHubAgent).toBe(true)

      expect(existsSync(join(targetRoot, 'logs', 'default', 'ekko-agent.jsonl'))).toBe(false)
      expect(existsSync(join(targetRoot, 'logs', 'default', 'hub-agent.jsonl'))).toBe(true)
    } finally {
      agent.close()
    }
  })

  it('migrates ekko.db directly inside an existing .hub-agent directory before DB open', () => {
    const base = makeTempBase()
    const targetRoot = join(base, '.hub-agent')
    writeLegacyDatabaseWithWal(join(targetRoot, 'ekko.db'))
    mkdirSync(join(targetRoot, 'config'), { recursive: true })
    writeFileSync(
      join(targetRoot, 'config', 'config.json'),
      JSON.stringify({ mcp: { profiles: { default: { servers: { s: { command: '/opt/.ekko/bin/srv' } } } } } }),
      'utf8',
    )

    const dbManager = new HubAgentDatabaseManager({ baseDirectory: base })
    try {
      const row = dbManager.connection.prepare('SELECT id, title FROM sessions WHERE id = ?').get('session-wal-only') as
        | { id: string; title: string }
        | undefined
      expect(row).toEqual({ id: 'session-wal-only', title: 'WAL uncommitted frame' })
      expect(existsSync(join(targetRoot, 'hub-agent.db'))).toBe(true)
      expect(existsSync(join(targetRoot, 'ekko.db'))).toBe(false)
    } finally {
      dbManager.close()
    }

    const dirManager = new HubAgentDirectoryManager(base)
    dirManager.initialize()
    const rawConfig = JSON.parse(readFileSync(join(targetRoot, 'config', 'config.json'), 'utf8'))
    expect(rawConfig.mcp.profiles.default.servers.s.command).toBe('/opt/.hub-agent/bin/srv')
  })

  it('is idempotent when .hub-agent and hub-agent.db already exist alongside a stray .ekko directory', () => {
    const base = makeTempBase()

    const first = setupHubAgent({
      baseDirectory: base,
      config: { prompt: { instructions: ['current-hub-agent-config'] } },
    })
    try {
      first.default.conversation.createSession({ id: 'current-session', title: 'Current DB Session' })
    } finally {
      first.close()
    }

    // Create a stray .ekko directory with conflicting data after .hub-agent already exists.
    const strayLegacy = join(base, '.ekko')
    mkdirSync(join(strayLegacy, 'config'), { recursive: true })
    writeFileSync(
      join(strayLegacy, 'config', 'config.json'),
      JSON.stringify({ prompt: { instructions: ['stale-ekko-config'] } }),
      'utf8',
    )
    const strayDb = new DatabaseSync(join(strayLegacy, 'ekko.db'))
    strayDb.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT)')
    strayDb.exec("INSERT INTO sessions (id, title) VALUES ('stale-session', 'Stale')")
    strayDb.close()

    // Re-running startup keeps existing .hub-agent config & DB intact.
    const second = setupHubAgent({ baseDirectory: base })
    try {
      expect(second.readConfig().prompt.instructions).toEqual(['current-hub-agent-config'])
      expect(second.default.conversation.getSession('current-session')?.title).toBe('Current DB Session')
      expect(second.default.conversation.getSession('stale-session')).toBeNull()
      expect(existsSync(strayLegacy)).toBe(true)
    } finally {
      second.close()
    }
  })
})
