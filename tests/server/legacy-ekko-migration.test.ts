import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'

const sqliteState = vi.hoisted(() => ({
  db: null as DatabaseSync | null,
  storagePath: '',
}))

vi.mock('../../packages/server/src/modules/studio/infrastructure/database', () => ({
  getDb: () => sqliteState.db,
  getStoragePath: () => sqliteState.storagePath,
  isSqliteAvailable: () => true,
  ensureParentDir: () => {},
}))

vi.mock('../../packages/server/src/modules/studio/public/agent-status-registry', () => ({
  isAgentAvailable: (id: string) => id === 'hub-agent',
}))

import {
  AGENT_FAMILIES,
  normalizeAgentFamily,
} from '../../packages/server/src/modules/studio/contracts/agents/family'
import {
  AGENT_RUNTIMES,
  agentFamilyForRuntime,
  normalizeAgentRuntime,
} from '../../packages/server/src/modules/studio/contracts/agents/runtime'
import {
  historySessionSource,
  isBuiltinHubAgent,
  normalizeHubAgentRunData,
  normalizeSessionIdentity,
} from '../../packages/server/src/modules/studio/contracts/history-source'
import {
  initAllHermesTables,
  migrateLegacyEkkoIdentifiers,
} from '../../packages/server/src/modules/studio/infrastructure/database/schemas'
import {
  assertAgentAvailable,
  resolveAgentStatusId,
} from '../../packages/server/src/modules/studio/services/agent-availability'
import { reasoningCodec } from '../../packages/server/src/modules/studio/services/model-api/reasoning'

const tempDirs: string[] = []

afterEach(() => {
  sqliteState.db?.close()
  sqliteState.db = null
  sqliteState.storagePath = ''
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Insert into SQLite schema fixtures while filling required columns that vary across tables. */
function insertWithRequiredDefaults(
  db: DatabaseSync,
  table: string,
  row: Record<string, unknown>,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }>
  const record: Record<string, unknown> = { ...row }
  for (const col of cols) {
    if (Object.hasOwn(record, col.name)) continue
    if (col.pk && col.type.toUpperCase() === 'INTEGER') continue
    if (col.notnull === 1 && col.dflt_value === null) {
      const upper = col.type.toUpperCase()
      record[col.name] = upper.includes('INT') || upper.includes('REAL') ? 0 : ''
    }
  }
  const keys = Object.keys(record)
  const placeholders = keys.map(() => '?').join(', ')
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(
    ...(keys.map(key => record[key]) as Array<string | number | null>),
  )
}

describe('legacy ekko SQLite startup migration and runtime normalizers', () => {
  it('migrates legacy ekko identifiers across hermes-web-ui.db tables idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-sqlite-mig-'))
    tempDirs.push(dir)
    const dbPath = join(dir, 'hermes-web-ui.db')
    const db = new DatabaseSync(dbPath)
    sqliteState.db = db
    sqliteState.storagePath = dbPath

    initAllHermesTables()

    insertWithRequiredDefaults(db, 'sessions', {
      id: 'sess-ekko-1',
      source: 'ekko',
      agent: 'ekko-agent',
      started_at: 100,
      last_active: 200,
    })
    insertWithRequiredDefaults(db, 'sessions', {
      id: 'sess-ekko-gc',
      source: 'group_chat',
      agent: 'ekko',
      started_at: 100,
      last_active: 200,
    })
    insertWithRequiredDefaults(db, 'session_usage', {
      session_id: 'sess-ekko-1',
      run_id: 'run-legacy-1',
      source: 'ekko_agent',
      agent: 'ekko-agent',
    })
    // Existing target row ensures unique idx_session_usage_run does not fail during upgrade.
    insertWithRequiredDefaults(db, 'session_usage', {
      session_id: 'sess-conflict',
      run_id: 'run-dup',
      source: 'hub_agent',
      agent: 'hub-agent',
    })
    insertWithRequiredDefaults(db, 'session_usage', {
      session_id: 'sess-conflict',
      run_id: 'run-dup',
      source: 'ekko_agent',
      agent: 'ekko-agent',
    })
    insertWithRequiredDefaults(db, 'gc_room_agents', {
      id: 'gc-agent-1',
      roomId: 'room-1',
      agent: 'ekko-agent',
      profile: 'default',
      name: 'Legacy Hub',
    })
    insertWithRequiredDefaults(db, 'gc_agent_presets', {
      id: 'gc-preset-1',
      ownerUserId: 1,
      agent: 'ekko',
      profile: 'default',
      provider: 'openai',
      model: 'gpt-5',
      name: 'Preset',
      createdAt: 10,
      updatedAt: 10,
    })
    insertWithRequiredDefaults(db, 'workflow_run_node_sessions', {
      id: 'wf-ns-1',
      run_id: 'wf-run-1',
      workflow_id: 'wf-1',
      node_id: 'node-1',
      session_id: 'sess-ekko-1',
      agent: 'ekko_agent',
      created_at: 10,
      updated_at: 10,
    })
    insertWithRequiredDefaults(db, 'skill_usage_events', {
      source: 'studio',
      message_id: 1,
      session_id: 'sess-ekko-1',
      profile: 'default',
      agent: 'ekko-agent',
      skill: 'planning',
      action: 'read',
      timestamp: 10,
    })
    insertWithRequiredDefaults(db, 'workflows', {
      id: 'wf-1',
      name: 'Legacy Workflow',
      nodes_json: JSON.stringify([
        { id: 'n1', data: { agent: 'ekko-agent', codingAgentId: 'ekko' } },
      ]),
      created_at: 10,
      updated_at: 10,
    })
    insertWithRequiredDefaults(db, 'workflow_runs', {
      id: 'wf-run-1',
      workflow_id: 'wf-1',
      snapshot_nodes_json: JSON.stringify([
        { id: 'n1', data: { agent: 'ekko', codingAgentId: 'ekko-agent' } },
      ]),
      created_at: 10,
    })
    insertWithRequiredDefaults(db, 'person_accounts', {
      user_id: 1,
      settings_json: JSON.stringify({ runtime: 'ekko-agent', nested: { agent: 'ekko' } }),
      revision: 1,
    })
    insertWithRequiredDefaults(db, 'person_conversation_settings', {
      session_id: 'person-main-1',
      owner_user_id: 1,
      settings_json: JSON.stringify({ model: { runtime: 'ekko', provider: 'openai', model: 'gpt-5' } }),
    })
    insertWithRequiredDefaults(db, 'person_executions', {
      id: 'exec-1',
      task_id: 'task-1',
      owner_user_id: 1,
      requirements_revision: 1,
      state: 'completed',
      session_id: 'person-main-1',
      selection_json: JSON.stringify({ runtime: 'ekko' }),
      created_at: 10,
      updated_at: 10,
    })
    insertWithRequiredDefaults(db, 'session_tasks', {
      id: 'task-1',
      session_id: 'sess-ekko-1',
      title: 'Legacy Task',
      selection_json: JSON.stringify({ runtime: 'ekko-agent' }),
      created_at: 10,
      updated_at: 10,
    })
    insertWithRequiredDefaults(db, 'task_plans', {
      session_id: 'sess-ekko-1',
      plan_id: 'plan-1',
      run_id: 'run-legacy-1',
      revision: 1,
      execution_state: 'completed',
      snapshot: JSON.stringify({ agent: 'ekko-agent', runtime: 'ekko' }),
      created_at: 10,
    })

    // Re-running initAllHermesTables simulates upgrading an existing hermes-web-ui.db.
    initAllHermesTables()
    // Second explicit call proves full idempotency.
    migrateLegacyEkkoIdentifiers(db)

    expect(db.prepare('SELECT source, agent FROM sessions WHERE id = ?').get('sess-ekko-1')).toEqual({
      source: 'builtin_agent',
      agent: 'hub-agent',
    })
    expect(db.prepare('SELECT source, agent FROM sessions WHERE id = ?').get('sess-ekko-gc')).toEqual({
      source: 'group_chat',
      agent: 'hub-agent',
    })
    expect(
      db.prepare('SELECT source, agent FROM session_usage WHERE session_id = ?').get('sess-ekko-1'),
    ).toEqual({
      source: 'hub_agent',
      agent: 'hub_agent',
    })
    expect(
      db.prepare('SELECT source, agent FROM session_usage WHERE session_id = ? ORDER BY source').all('sess-conflict'),
    ).toEqual([
      { source: 'ekko_agent', agent: 'hub_agent' },
      { source: 'hub_agent', agent: 'hub_agent' },
    ])
    expect(db.prepare('SELECT agent FROM gc_room_agents WHERE id = ?').get('gc-agent-1')).toEqual({
      agent: 'hub',
    })
    expect(db.prepare('SELECT agent FROM gc_agent_presets WHERE id = ?').get('gc-preset-1')).toEqual({
      agent: 'hub',
    })
    expect(db.prepare('SELECT agent FROM workflow_run_node_sessions WHERE id = ?').get('wf-ns-1')).toEqual({
      agent: 'hub-agent',
    })
    expect(db.prepare('SELECT source, agent FROM skill_usage_events WHERE session_id = ?').get('sess-ekko-1')).toEqual({
      source: 'studio',
      agent: 'hub-agent',
    })

    const wfNodes = JSON.parse(
      (db.prepare('SELECT nodes_json FROM workflows WHERE id = ?').get('wf-1') as { nodes_json: string }).nodes_json,
    )
    expect(wfNodes[0].data).toEqual({ agent: 'hub-agent', codingAgentId: 'hub-agent' })

    const runNodes = JSON.parse(
      (db.prepare('SELECT snapshot_nodes_json FROM workflow_runs WHERE id = ?').get('wf-run-1') as { snapshot_nodes_json: string }).snapshot_nodes_json,
    )
    expect(runNodes[0].data).toEqual({ agent: 'hub-agent', codingAgentId: 'hub-agent' })

    const personAcct = JSON.parse(
      (db.prepare('SELECT settings_json FROM person_accounts WHERE user_id = ?').get(1) as { settings_json: string }).settings_json,
    )
    expect(personAcct.runtime).toBe('hub')

    const personConv = JSON.parse(
      (db.prepare('SELECT settings_json FROM person_conversation_settings WHERE session_id = ?').get('person-main-1') as { settings_json: string }).settings_json,
    )
    expect(personConv.model.runtime).toBe('hub')

    const execSelection = JSON.parse(
      (db.prepare('SELECT selection_json FROM person_executions WHERE id = ?').get('exec-1') as { selection_json: string }).selection_json,
    )
    expect(execSelection.runtime).toBe('hub')

    const taskSelection = JSON.parse(
      (db.prepare('SELECT selection_json FROM session_tasks WHERE id = ?').get('task-1') as { selection_json: string }).selection_json,
    )
    expect(taskSelection.runtime).toBe('hub')

    const planSnapshot = JSON.parse(
      (db.prepare('SELECT snapshot FROM task_plans WHERE plan_id = ?').get('plan-1') as { snapshot: string }).snapshot,
    )
    expect(planSnapshot).toEqual({ agent: 'hub-agent', runtime: 'hub' })
  })

  it('normalizes legacy ekko family, runtime, history-source, availability, and reasoning tokens', async () => {
    expect(AGENT_FAMILIES).toEqual(['hermes', 'hub', 'coding'])
    expect(AGENT_RUNTIMES).toContain('hub')
    expect(AGENT_RUNTIMES).not.toContain('ekko')

    expect(normalizeAgentFamily('ekko')).toBe('hub')
    expect(normalizeAgentFamily('hub')).toBe('hub')
    expect(normalizeAgentRuntime('ekko')).toBe('hub')
    expect(normalizeAgentRuntime('ekko-agent')).toBe('hub')
    expect(normalizeAgentRuntime('ekko_agent')).toBe('hub')
    expect(agentFamilyForRuntime('hub')).toBe('hub')

    expect(isBuiltinHubAgent('ekko')).toBe(true)
    expect(isBuiltinHubAgent('ekko-agent')).toBe(true)
    expect(isBuiltinHubAgent('hub-agent')).toBe(true)
    expect(historySessionSource({ source: 'ekko', agent: 'ekko-agent' })).toBe('ekko')
    expect(historySessionSource({ source: 'api_server', agent: 'ekko-agent' })).toBe('builtin_agent')
    expect(normalizeSessionIdentity({ source: 'cli', agent: 'ekko' })).toEqual({
      source: 'builtin_agent',
      agent: 'hub-agent',
    })

    const runData: { source?: string; session_source?: string; agent_id?: string; coding_agent_id?: string } = {
      source: 'ekko',
      agent_id: 'ekko-agent',
      coding_agent_id: 'ekko',
    }
    normalizeHubAgentRunData(runData)
    expect(runData).toEqual({
      source: 'builtin_agent',
      agent_id: 'hub-agent',
      coding_agent_id: 'hub-agent',
    })

    expect(resolveAgentStatusId('ekko')).toBe('hub-agent')
    expect(resolveAgentStatusId('ekko-agent')).toBe('hub-agent')
    expect(assertAgentAvailable('ekko-agent')).toBe('hub-agent')

    const dir = mkdtempSync(join(tmpdir(), 'agenthub-reasoning-'))
    tempDirs.push(dir)
    const codec = await reasoningCodec(dir, 'test-scope')
    const encoded = codec.encode({ text: 'step 1' })
    expect(encoded.startsWith('hub_r1.')).toBe(true)
    expect(codec.decode(encoded)).toEqual({ text: 'step 1' })
    expect(codec.decode(`ekko_r1.${encoded.slice('hub_r1.'.length)}`)).toEqual({ text: 'step 1' })
  })
})
