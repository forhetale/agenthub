/**
 * Centralized schema definitions for all Hermes SQLite tables.
 * All table schemas are defined here for unified management and migration.
 */

// ============================================================================
// Usage Store (usage-store.ts)
// ============================================================================

export const USAGE_TABLE = 'session_usage'

export const MODEL_API_KEYS_TABLE = 'model_api_keys'
export const MODEL_API_KEYS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  user_id: 'INTEGER NOT NULL',
  name: 'TEXT NOT NULL',
  preview: 'TEXT NOT NULL',
  token_hash: 'TEXT NOT NULL UNIQUE',
  models_json: "TEXT NOT NULL DEFAULT '[]'",
  budget_usd: 'REAL',
  created_at: 'INTEGER NOT NULL',
  last_used_at: 'INTEGER',
}

export const USAGE_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  session_id: 'TEXT NOT NULL',
  account_id: 'TEXT',
  model_api_key_id: 'TEXT',
  model_api_pending: 'INTEGER NOT NULL DEFAULT 0',
  origin: "TEXT NOT NULL DEFAULT 'internal'",
  run_id: "TEXT NOT NULL DEFAULT ''",
  parent_run_id: "TEXT NOT NULL DEFAULT ''",
  api_duration: 'REAL',
  source: "TEXT NOT NULL DEFAULT ''",
  agent: "TEXT NOT NULL DEFAULT ''",
  usage_scope: "TEXT NOT NULL DEFAULT 'run'",
  purpose: "TEXT NOT NULL DEFAULT ''",
  api_calls: 'INTEGER NOT NULL DEFAULT 0',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  model: "TEXT NOT NULL DEFAULT ''",
  provider: "TEXT NOT NULL DEFAULT ''",
  profile: "TEXT NOT NULL DEFAULT 'default'",
  is_estimated: 'INTEGER NOT NULL DEFAULT 0',
  cost_usd: 'REAL',
  cost_source: "TEXT NOT NULL DEFAULT 'unknown'",
  cost_pricing: 'TEXT',
  created_at: 'INTEGER NOT NULL DEFAULT 0',
}

export const USAGE_RUN_INDEX = `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_usage_run
  ON ${USAGE_TABLE}(session_id, run_id, source) WHERE run_id <> ''`

export const RUN_USAGE_TABLE = 'run_usage'
export const RUN_USAGE_SCHEMA = {
  session_id: 'TEXT NOT NULL',
  run_id: 'TEXT NOT NULL',
  assistant_message_id: "TEXT NOT NULL DEFAULT ''",
  input_tokens: 'INTEGER',
  output_tokens: 'INTEGER',
  cache_read_tokens: 'INTEGER',
  cache_write_tokens: 'INTEGER',
  cache_hit_rate: 'REAL',
  cost_usd: 'REAL',
  model_duration_seconds: 'REAL',
  run_duration_seconds: 'REAL',
  tool_duration_seconds: 'REAL',
  tokens_per_second: 'REAL',
  is_estimated: 'INTEGER NOT NULL DEFAULT 0',
  completed_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}
export const RUN_USAGE_INDEXES = {
  idx_run_usage_session_run: `CREATE UNIQUE INDEX IF NOT EXISTS idx_run_usage_session_run ON ${RUN_USAGE_TABLE}(session_id, run_id)`,
  idx_run_usage_assistant: `CREATE INDEX IF NOT EXISTS idx_run_usage_assistant ON ${RUN_USAGE_TABLE}(session_id, assistant_message_id)`,
}

export const USAGE_PRICING_TABLE = 'usage_pricing'
export const USAGE_PRICING_SCHEMA = {
  profile: 'TEXT PRIMARY KEY',
  rates: "TEXT NOT NULL DEFAULT '[]'",
}

// ============================================================================
// Session Store (session-store.ts)
// ============================================================================

export const TASK_PLANS_TABLE = 'task_plans'
export const SESSION_TASKS_TABLE = 'session_tasks'
export const SESSION_TASKS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  session_id: 'TEXT',
  title: 'TEXT NOT NULL',
  summary: "TEXT NOT NULL DEFAULT ''",
  status: "TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'closed'))",
  source_message_id: 'INTEGER',
  evidence_message_id: 'INTEGER',
  completion_evidence: "TEXT NOT NULL DEFAULT ''",
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  completed_at: 'INTEGER',
  owner_user_id: 'INTEGER',
  bot_id: 'TEXT',
  revision: 'INTEGER NOT NULL DEFAULT 0',
  requirements_revision: 'INTEGER NOT NULL DEFAULT 0',
  requirements_json: "TEXT NOT NULL DEFAULT '{}'",
  selection_json: "TEXT NOT NULL DEFAULT '{}'",
  workspace: "TEXT NOT NULL DEFAULT ''",
}
export const TASK_PLANS_SCHEMA: Record<string, string> = {
  session_id: 'TEXT NOT NULL',
  plan_id: 'TEXT NOT NULL',
  run_id: 'TEXT NOT NULL',
  revision: 'INTEGER NOT NULL',
  execution_state: 'TEXT NOT NULL',
  snapshot: 'TEXT NOT NULL',
  created_at: 'INTEGER NOT NULL',
}

export const SESSIONS_TABLE = 'sessions'

export const SESSION_CATEGORIES_TABLE = 'session_categories'

export const WORKSPACE_DIRECTORIES_TABLE = 'workspace_directories'
export const WORKSPACE_DIRECTORIES_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  user_id: 'INTEGER NOT NULL',
  path: 'TEXT NOT NULL',
  path_key: 'TEXT NOT NULL',
  is_favorite: 'INTEGER NOT NULL DEFAULT 0',
  last_used: 'INTEGER NOT NULL DEFAULT 0',
  use_count: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}
export const WORKSPACE_DIRECTORIES_INDEXES = {
  uniq_workspace_directories_user_path: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_workspace_directories_user_path ON workspace_directories(user_id, path_key)',
  idx_workspace_directories_user_recent: 'CREATE INDEX IF NOT EXISTS idx_workspace_directories_user_recent ON workspace_directories(user_id, last_used DESC)',
}

export const SESSION_CATEGORIES_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  name: 'TEXT NOT NULL COLLATE NOCASE',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const SESSION_CATEGORIES_INDEXES = {
  uniq_session_categories_name: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_session_categories_name ON session_categories(name COLLATE NOCASE)',
}

export const SESSIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  profile: 'TEXT NOT NULL DEFAULT \'default\'',
  source: 'TEXT NOT NULL DEFAULT \'api_server\'',
  agent: 'TEXT NOT NULL DEFAULT \'\'',
  agent_mode: 'TEXT NOT NULL DEFAULT \'\'',
  agent_preset: 'TEXT NOT NULL DEFAULT \'\'',
  bot_type: 'TEXT NOT NULL DEFAULT \'\'',
  agent_session_id: 'TEXT NOT NULL DEFAULT \'\'',
  agent_native_session_id: 'TEXT NOT NULL DEFAULT \'\'',
  user_id: 'TEXT',
  studio_user_id: 'TEXT',
  model: 'TEXT NOT NULL DEFAULT \'\'',
  provider: 'TEXT NOT NULL DEFAULT \'\'',
  api_mode: 'TEXT NOT NULL DEFAULT \'\'',
  reasoning_effort: 'TEXT NOT NULL DEFAULT \'\'',
  title: 'TEXT',
  parent_session_id: 'TEXT',
  fork_point_message_id: 'TEXT',
  started_at: 'INTEGER NOT NULL',
  ended_at: 'INTEGER',
  end_reason: 'TEXT',
  message_count: 'INTEGER NOT NULL DEFAULT 0',
  tool_call_count: 'INTEGER NOT NULL DEFAULT 0',
  input_tokens: 'INTEGER NOT NULL DEFAULT 0',
  output_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_read_tokens: 'INTEGER NOT NULL DEFAULT 0',
  cache_write_tokens: 'INTEGER NOT NULL DEFAULT 0',
  reasoning_tokens: 'INTEGER NOT NULL DEFAULT 0',
  billing_provider: 'TEXT',
  estimated_cost_usd: 'REAL NOT NULL DEFAULT 0',
  actual_cost_usd: 'REAL',
  cost_status: 'TEXT NOT NULL DEFAULT \'\'',
  preview: 'TEXT NOT NULL DEFAULT \'\'',
  last_active: 'INTEGER NOT NULL',
  is_archived: 'INTEGER NOT NULL DEFAULT 0',
  is_pinned: 'INTEGER NOT NULL DEFAULT 0',
  push_enabled: 'INTEGER NOT NULL DEFAULT 0',
  workspace: 'TEXT',
  category_id: 'INTEGER',
  history_revision: 'INTEGER NOT NULL DEFAULT 0',
  task_summary_revision: 'INTEGER NOT NULL DEFAULT 0',
  task_summary_updated_at: 'INTEGER NOT NULL DEFAULT 0',
  /** Milliseconds of the last history clear; provider usage before it describes deleted history. */
  history_cleared_at: 'INTEGER NOT NULL DEFAULT 0',
  /** Context estimate after a history edit, separate from cumulative billed usage. */
  context_usage_estimate: 'TEXT',
}

export const SESSIONS_INDEXES = {
  idx_sessions_category_id: 'CREATE INDEX IF NOT EXISTS idx_sessions_category_id ON sessions(category_id)',
}

export const MESSAGES_TABLE = 'messages'

export const MESSAGES_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  session_id: 'TEXT NOT NULL',
  role: 'TEXT NOT NULL',
  content: 'TEXT NOT NULL DEFAULT \'\'',
  display_role: 'TEXT',
  display_content: 'TEXT',
  tool_call_id: 'TEXT',
  tool_calls: 'TEXT',
  tool_name: 'TEXT',
  run_marker: 'TEXT',
  timestamp: 'INTEGER NOT NULL',
  token_count: 'INTEGER',
  finish_reason: 'TEXT',
  reasoning: 'TEXT',
  reasoning_details: 'TEXT',
  reasoning_content: 'TEXT',
}

export const MESSAGES_INDEX = 'CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)'

export const SKILL_USAGE_EVENTS_TABLE = 'skill_usage_events'

export const SKILL_USAGE_EVENTS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  source: "TEXT NOT NULL DEFAULT 'studio'",
  message_id: 'INTEGER NOT NULL',
  session_id: 'TEXT NOT NULL',
  run_id: "TEXT NOT NULL DEFAULT ''",
  profile: "TEXT NOT NULL DEFAULT 'default'",
  agent: "TEXT NOT NULL DEFAULT ''",
  skill: 'TEXT NOT NULL',
  action: 'TEXT NOT NULL',
  timestamp: 'INTEGER NOT NULL',
}

export const SKILL_USAGE_EVENTS_INDEXES = {
  uniq_skill_usage_source_message: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_skill_usage_source_message ON skill_usage_events(source, profile, message_id)',
  idx_skill_usage_profile_timestamp: 'CREATE INDEX IF NOT EXISTS idx_skill_usage_profile_timestamp ON skill_usage_events(profile, timestamp)',
  idx_skill_usage_agent_timestamp: 'CREATE INDEX IF NOT EXISTS idx_skill_usage_agent_timestamp ON skill_usage_events(agent, timestamp)',
  idx_skill_usage_skill_timestamp: 'CREATE INDEX IF NOT EXISTS idx_skill_usage_skill_timestamp ON skill_usage_events(skill, timestamp)',
  idx_skill_usage_session: 'CREATE INDEX IF NOT EXISTS idx_skill_usage_session ON skill_usage_events(session_id)',
}

export const SKILL_USAGE_SYNC_TABLE = 'skill_usage_sync_state'

export const SKILL_USAGE_SYNC_SCHEMA: Record<string, string> = {
  source: 'TEXT PRIMARY KEY',
  last_message_id: 'INTEGER NOT NULL DEFAULT 0',
  updated_at: 'INTEGER NOT NULL DEFAULT 0',
}

// ============================================================================
// Chat Run Webhooks
// ============================================================================

export const CHAT_WEBHOOK_ENDPOINTS_TABLE = 'chat_webhook_endpoints'

export const CHAT_WEBHOOK_ENDPOINTS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  name: 'TEXT NOT NULL',
  url: 'TEXT NOT NULL',
  secret: "TEXT NOT NULL DEFAULT ''",
  event_types_json: "TEXT NOT NULL DEFAULT '[]'",
  profiles_json: "TEXT NOT NULL DEFAULT '[]'",
  enabled: 'INTEGER NOT NULL DEFAULT 1',
  include_content: 'INTEGER NOT NULL DEFAULT 0',
  include_user_content: 'INTEGER NOT NULL DEFAULT 0',
  allow_private_network: 'INTEGER NOT NULL DEFAULT 0',
  max_retries: 'INTEGER NOT NULL DEFAULT 3',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const CHAT_WEBHOOK_ENDPOINTS_INDEXES = {
  idx_chat_webhook_endpoints_enabled: 'CREATE INDEX IF NOT EXISTS idx_chat_webhook_endpoints_enabled ON chat_webhook_endpoints(enabled)',
}

// ============================================================================
// Workspace Run Changes
// ============================================================================

export const WORKSPACE_RUN_CHANGES_TABLE = 'workspace_run_changes'

export const WORKSPACE_RUN_CHANGES_SCHEMA: Record<string, string> = {
  change_id: 'TEXT PRIMARY KEY',
  room_id: "TEXT NOT NULL DEFAULT ''",
  message_id: "TEXT NOT NULL DEFAULT ''",
  assistant_message_id: "TEXT NOT NULL DEFAULT ''",
  session_id: 'TEXT NOT NULL',
  run_id: 'TEXT NOT NULL DEFAULT \'\'',
  source: 'TEXT NOT NULL DEFAULT \'run\'',
  workspace: 'TEXT NOT NULL DEFAULT \'\'',
  workspace_kind: 'TEXT NOT NULL DEFAULT \'git\'',
  started_at: 'INTEGER NOT NULL DEFAULT 0',
  finished_at: 'INTEGER NOT NULL DEFAULT 0',
  files_changed: 'INTEGER NOT NULL DEFAULT 0',
  additions: 'INTEGER NOT NULL DEFAULT 0',
  deletions: 'INTEGER NOT NULL DEFAULT 0',
  truncated: 'INTEGER NOT NULL DEFAULT 0',
  total_patch_bytes: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
}

export const WORKSPACE_RUN_CHANGE_FILES_TABLE = 'workspace_run_change_files'

export const WORKSPACE_RUN_CHANGE_FILES_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  change_id: 'TEXT NOT NULL',
  session_id: 'TEXT NOT NULL',
  path: 'TEXT NOT NULL',
  old_path: 'TEXT',
  change_type: 'TEXT NOT NULL DEFAULT \'modified\'',
  additions: 'INTEGER NOT NULL DEFAULT 0',
  deletions: 'INTEGER NOT NULL DEFAULT 0',
  size_before: 'INTEGER',
  size_after: 'INTEGER',
  patch: 'TEXT',
  patch_bytes: 'INTEGER NOT NULL DEFAULT 0',
  truncated: 'INTEGER NOT NULL DEFAULT 0',
  binary: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
}

export const WORKSPACE_RUN_CHANGES_INDEXES = {
  idx_workspace_run_changes_session: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_changes_session ON workspace_run_changes(session_id, created_at)',
  idx_workspace_run_changes_assistant_message: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_changes_assistant_message ON workspace_run_changes(session_id, assistant_message_id, created_at)',
  idx_workspace_run_changes_run: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_changes_run ON workspace_run_changes(run_id)',
  idx_workspace_run_changes_room: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_changes_room ON workspace_run_changes(room_id, created_at)',
}

export const WORKSPACE_RUN_CHANGE_FILES_INDEXES = {
  idx_workspace_run_change_files_change: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_change_files_change ON workspace_run_change_files(change_id)',
  idx_workspace_run_change_files_session: 'CREATE INDEX IF NOT EXISTS idx_workspace_run_change_files_session ON workspace_run_change_files(session_id, created_at)',
}

// ============================================================================
// Workflow Store
// ============================================================================

export const WORKFLOWS_TABLE = 'workflows'

export const WORKFLOWS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  name: 'TEXT NOT NULL',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  workspace: 'TEXT',
  nodes_json: "TEXT NOT NULL DEFAULT '[]'",
  edges_json: "TEXT NOT NULL DEFAULT '[]'",
  viewport_json: "TEXT NOT NULL DEFAULT '{}'",
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const WORKFLOWS_INDEXES = {
  idx_workflows_profile: 'CREATE INDEX IF NOT EXISTS idx_workflows_profile ON workflows(profile)',
  idx_workflows_updated_at: 'CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at)',
}

export const WORKFLOW_SCHEDULES_TABLE = 'workflow_schedules'
export const WORKFLOW_SCHEDULES_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY', workflow_id: 'TEXT NOT NULL', profile: "TEXT NOT NULL DEFAULT 'default'", owner_user_id: 'INTEGER', schedule: 'TEXT NOT NULL', timezone: "TEXT NOT NULL DEFAULT 'UTC'", enabled: 'INTEGER NOT NULL DEFAULT 1', input: 'TEXT', start_node_ids_json: "TEXT NOT NULL DEFAULT '[]'", timeout_ms: 'INTEGER', concurrency_policy: "TEXT NOT NULL DEFAULT 'skip'", misfire_policy: "TEXT NOT NULL DEFAULT 'skip'", last_scheduled_at: 'INTEGER', next_run_at: 'INTEGER', last_run_id: 'TEXT', last_error: 'TEXT', created_at: 'INTEGER NOT NULL', updated_at: 'INTEGER NOT NULL',
}
export const WORKFLOW_SCHEDULES_INDEXES = { idx_workflow_schedules_workflow: 'CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow ON workflow_schedules(workflow_id)', idx_workflow_schedules_due: 'CREATE INDEX IF NOT EXISTS idx_workflow_schedules_due ON workflow_schedules(enabled, next_run_at)' }
export const WORKFLOW_SCHEDULE_TRIGGERS_TABLE = 'workflow_schedule_triggers'
export const WORKFLOW_SCHEDULE_TRIGGERS_SCHEMA: Record<string, string> = { identity: 'TEXT PRIMARY KEY', schedule_id: 'TEXT NOT NULL', workflow_id: 'TEXT NOT NULL', scheduled_at: 'INTEGER NOT NULL', created_at: 'INTEGER NOT NULL' }
export const WORKFLOW_SCHEDULE_EVENTS_TABLE = 'workflow_schedule_events'
export const WORKFLOW_SCHEDULE_EVENTS_SCHEMA: Record<string, string> = { id: 'TEXT PRIMARY KEY', schedule_id: 'TEXT NOT NULL', workflow_id: 'TEXT NOT NULL', trigger_identity: 'TEXT NOT NULL', scheduled_at: 'INTEGER NOT NULL', kind: 'TEXT NOT NULL', run_id: 'TEXT', error: 'TEXT', created_at: 'INTEGER NOT NULL' }
export const WORKFLOW_SCHEDULE_EVENTS_INDEXES = { idx_workflow_schedule_events_schedule: 'CREATE INDEX IF NOT EXISTS idx_workflow_schedule_events_schedule ON workflow_schedule_events(schedule_id, created_at)' }

export const WORKFLOW_RUNS_TABLE = 'workflow_runs'

export const WORKFLOW_RUNS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  workflow_id: 'TEXT NOT NULL',
  user_id: 'INTEGER',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  workspace: 'TEXT',
  start_node_ids_json: "TEXT NOT NULL DEFAULT '[]'",
  status: "TEXT NOT NULL DEFAULT 'queued'",
  snapshot_nodes_json: "TEXT NOT NULL DEFAULT '[]'",
  snapshot_edges_json: "TEXT NOT NULL DEFAULT '[]'",
  compiled_loops_json: "TEXT NOT NULL DEFAULT '[]'",
  requested_timeout_ms: 'INTEGER',
  deadline_at: 'INTEGER',
  started_at: 'INTEGER',
  finished_at: 'INTEGER',
  created_at: 'INTEGER NOT NULL',
  error: 'TEXT',
  trigger_source: "TEXT NOT NULL DEFAULT 'manual'",
  scheduled_at: 'INTEGER',
}

export const WORKFLOW_RUNS_INDEXES = {
  idx_workflow_runs_workflow: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id)',
  idx_workflow_runs_status: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)',
  idx_workflow_runs_created_at: 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at)',
}

export const WORKFLOW_RUN_NODE_SESSIONS_TABLE = 'workflow_run_node_sessions'

export const WORKFLOW_RUN_NODE_SESSIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  run_id: 'TEXT NOT NULL',
  workflow_id: 'TEXT NOT NULL',
  node_id: 'TEXT NOT NULL',
  execution_id: "TEXT NOT NULL DEFAULT ''",
  iteration_path_json: "TEXT NOT NULL DEFAULT '[]'",
  consumed_edge_evaluation_ids_json: "TEXT NOT NULL DEFAULT '[]'",
  session_id: 'TEXT NOT NULL',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  agent: "TEXT NOT NULL DEFAULT ''",
  agent_mode: "TEXT NOT NULL DEFAULT ''",
  status: "TEXT NOT NULL DEFAULT 'queued'",
  sequence: 'INTEGER NOT NULL DEFAULT 0',
  remaining_timeout_ms_at_start: 'INTEGER',
  started_at: 'INTEGER',
  finished_at: 'INTEGER',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  error: 'TEXT',
}

export const WORKFLOW_RUN_QUALITY_EVALUATIONS_TABLE = 'workflow_run_quality_evaluations'
export const WORKFLOW_RUN_QUALITY_EVALUATIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY', run_id: 'TEXT NOT NULL', workflow_id: 'TEXT NOT NULL', node_session_id: 'TEXT NOT NULL',
  node_id: 'TEXT NOT NULL', execution_id: 'TEXT NOT NULL', iteration_path_json: "TEXT NOT NULL DEFAULT '[]'",
  input_hash: 'TEXT NOT NULL', config_hash: 'TEXT NOT NULL', status: "TEXT NOT NULL DEFAULT 'completed'",
  decision: "TEXT NOT NULL DEFAULT 'unknown'", criteria_json: "TEXT NOT NULL DEFAULT '[]'", reason_code: "TEXT NOT NULL DEFAULT ''",
  duration_ms: 'INTEGER NOT NULL DEFAULT 0', created_at: 'INTEGER NOT NULL',
}
export const WORKFLOW_RUN_QUALITY_EVALUATIONS_INDEXES = {
  idx_workflow_quality_run: 'CREATE INDEX IF NOT EXISTS idx_workflow_quality_run ON workflow_run_quality_evaluations(run_id, created_at)',
  uniq_workflow_quality_attempt: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_quality_attempt ON workflow_run_quality_evaluations(node_session_id, input_hash, config_hash)',
}

export const WORKFLOW_RUN_NODE_SESSIONS_INDEXES = {
  idx_workflow_run_node_sessions_run: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_run ON workflow_run_node_sessions(run_id)',
  idx_workflow_run_node_sessions_workflow: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_workflow ON workflow_run_node_sessions(workflow_id)',
  idx_workflow_run_node_sessions_node: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_node ON workflow_run_node_sessions(node_id)',
  idx_workflow_run_node_sessions_session: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_session ON workflow_run_node_sessions(session_id)',
  idx_workflow_run_node_sessions_status: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_status ON workflow_run_node_sessions(status)',
  idx_workflow_run_node_sessions_sequence: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_node_sessions_sequence ON workflow_run_node_sessions(run_id, sequence)',
  uniq_workflow_run_node_sessions_run_execution: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_run_node_sessions_run_execution ON workflow_run_node_sessions(run_id, execution_id)',
}

export const WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE = 'workflow_run_edge_evaluations'

export const WORKFLOW_RUN_EDGE_EVALUATIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY', run_id: 'TEXT NOT NULL', workflow_id: 'TEXT NOT NULL', edge_id: 'TEXT NOT NULL',
  source_node_id: 'TEXT NOT NULL', source_execution_id: "TEXT NOT NULL DEFAULT ''", iteration_path_json: "TEXT NOT NULL DEFAULT '[]'",
  target_node_id: 'TEXT NOT NULL', source_outcome: 'TEXT NOT NULL',
  status: 'TEXT NOT NULL', route: 'TEXT NOT NULL', reason: 'TEXT', sequence: 'INTEGER NOT NULL',
  orchestration_json: "TEXT NOT NULL DEFAULT '{}'", condition_evaluation_json: 'TEXT', evaluated_at: 'INTEGER NOT NULL',
}

export const WORKFLOW_RUN_EDGE_EVALUATIONS_INDEXES = {
  idx_workflow_run_edge_evaluations_run_sequence: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_edge_evaluations_run_sequence ON workflow_run_edge_evaluations(run_id, sequence)',
  idx_workflow_run_edge_evaluations_edge: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_edge_evaluations_edge ON workflow_run_edge_evaluations(edge_id)',
}

export const WORKFLOW_RUN_LOOP_EPOCHS_TABLE = 'workflow_run_loop_epochs'
export const WORKFLOW_RUN_LOOP_EPOCHS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY', run_id: 'TEXT NOT NULL', workflow_id: 'TEXT NOT NULL', loop_id: 'TEXT NOT NULL',
  iteration: 'INTEGER NOT NULL', iteration_path_json: "TEXT NOT NULL DEFAULT '[]'", status: 'TEXT NOT NULL',
  exit_reason: 'TEXT', sequence: 'INTEGER NOT NULL', started_at: 'INTEGER NOT NULL', finished_at: 'INTEGER NOT NULL',
}
export const WORKFLOW_RUN_LOOP_EPOCHS_INDEXES = {
  idx_workflow_run_loop_epochs_run_sequence: 'CREATE INDEX IF NOT EXISTS idx_workflow_run_loop_epochs_run_sequence ON workflow_run_loop_epochs(run_id, sequence)',
  uniq_workflow_run_loop_epochs_identity: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_run_loop_epochs_identity ON workflow_run_loop_epochs(run_id, loop_id, iteration_path_json)',
}

// ============================================================================
// Compression Snapshot (compression-snapshot.ts)
// ============================================================================

export const COMPRESSION_SNAPSHOT_TABLE = 'chat_compression_snapshots'

export const COMPRESSION_SNAPSHOT_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  summary: 'TEXT NOT NULL DEFAULT \'\'',
  last_message_index: 'INTEGER NOT NULL DEFAULT 0',
  message_count_at_time: 'INTEGER NOT NULL DEFAULT 0',
  compressed_through_message_id: 'INTEGER',
  protected_head_through_message_id: 'INTEGER',
  history_revision: 'INTEGER NOT NULL DEFAULT 0',
  updated_at: 'INTEGER NOT NULL',
}

// ============================================================================
// Model Context (model-context.ts)
// ============================================================================

export const MODEL_CONTEXT_TABLE = 'model_context'

export const MODEL_CONTEXT_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  provider: 'TEXT NOT NULL',
  model: 'TEXT NOT NULL',
  context_limit: 'INTEGER NOT NULL',
}

export const MODEL_CONTEXT_INDEX = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_model_context_profile_provider_model ON model_context(profile, provider, model)'
export const LEGACY_MODEL_CONTEXT_INDEX = 'idx_model_context_provider_model'

// ============================================================================
// Provider Configuration Audit
// ============================================================================

export const PROVIDER_AUDIT_TABLE = 'provider_audit_events'

export const PROVIDER_AUDIT_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  created_at: 'INTEGER NOT NULL',
  actor_user_id: 'INTEGER',
  actor_username: "TEXT NOT NULL DEFAULT ''",
  actor_role: "TEXT NOT NULL DEFAULT ''",
  profile: "TEXT NOT NULL DEFAULT 'default'",
  provider_id: 'TEXT NOT NULL',
  provider_label: "TEXT NOT NULL DEFAULT ''",
  action: 'TEXT NOT NULL',
  fields_json: "TEXT NOT NULL DEFAULT '[]'",
  result: "TEXT NOT NULL DEFAULT 'success'",
  details_json: "TEXT NOT NULL DEFAULT '{}'",
  revision_before: "TEXT NOT NULL DEFAULT ''",
  revision_after: "TEXT NOT NULL DEFAULT ''",
}

export const PROVIDER_AUDIT_INDEXES = {
  idx_provider_audit_created: 'CREATE INDEX IF NOT EXISTS idx_provider_audit_created ON provider_audit_events(created_at)',
  idx_provider_audit_profile: 'CREATE INDEX IF NOT EXISTS idx_provider_audit_profile ON provider_audit_events(profile, created_at)',
  idx_provider_audit_provider: 'CREATE INDEX IF NOT EXISTS idx_provider_audit_provider ON provider_audit_events(provider_id, created_at)',
}

// ============================================================================
// Users and Profile Access
// ============================================================================

export const USERS_TABLE = 'users'

export const USERS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  username: 'TEXT NOT NULL UNIQUE',
  password_hash: 'TEXT NOT NULL',
  role: "TEXT NOT NULL DEFAULT 'admin'",
  status: "TEXT NOT NULL DEFAULT 'active'",
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  last_login_at: 'INTEGER',
  avatar: "TEXT NOT NULL DEFAULT ''",
}

export const USER_PROFILES_TABLE = 'user_profiles'

export const USER_PROFILES_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER NOT NULL',
  profile_name: "TEXT NOT NULL DEFAULT 'default'",
  is_default: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
}

export const USER_PROFILES_INDEXES = {
  idx_user_profiles_user: 'CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id)',
  idx_user_profiles_profile: 'CREATE INDEX IF NOT EXISTS idx_user_profiles_profile ON user_profiles(profile_name)',
  idx_user_profiles_default: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_default ON user_profiles(user_id) WHERE is_default = 1',
}

export const USER_THEMES_TABLE = 'user_themes'
export const USER_NAVIGATION_TABLE = 'user_navigation'
export const USER_NAVIGATION_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER PRIMARY KEY',
  items_json: "TEXT NOT NULL DEFAULT '[]'",
  schema_version: 'INTEGER NOT NULL DEFAULT 0',
  updated_at: 'INTEGER NOT NULL',
}
export const USER_THEME_PRESETS_TABLE = 'user_theme_presets'

export const USER_THEME_PRESETS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  user_id: 'INTEGER NOT NULL',
  name: 'TEXT NOT NULL',
  settings_json: 'TEXT NOT NULL',
  background_filename: 'TEXT',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}


export const USER_THEMES_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER PRIMARY KEY',
  active_preset_id: 'TEXT',
  brightness: 'TEXT',
  style: 'TEXT',
  font_size: 'INTEGER NOT NULL DEFAULT 14',
  text_color: 'TEXT',
  accent_color: 'TEXT',
  background_filename: 'TEXT',
  background_original_name: 'TEXT',
  background_mime: 'TEXT',
  appearance_json: "TEXT NOT NULL DEFAULT '{}'",
  background_updated_at: 'INTEGER NOT NULL DEFAULT 0',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
}

export const STT_PROVIDER_SETTINGS_TABLE = 'stt_provider_settings'

export const STT_PROVIDER_SETTINGS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  user_id: 'INTEGER NOT NULL',
  provider: 'TEXT NOT NULL',
  settings_json: `TEXT NOT NULL DEFAULT '{}'`,
  secrets_json: `TEXT NOT NULL DEFAULT '{}'`,
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const STT_PROVIDER_SETTINGS_INDEXES = {
  idx_stt_provider_settings_user: 'CREATE INDEX IF NOT EXISTS idx_stt_provider_settings_user ON stt_provider_settings(user_id)',
  idx_stt_provider_settings_user_provider: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_stt_provider_settings_user_provider ON stt_provider_settings(user_id, provider)',
}

export const STT_USER_SETTINGS_TABLE = 'stt_user_settings'

export const STT_USER_SETTINGS_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER PRIMARY KEY',
  active_provider: "TEXT NOT NULL DEFAULT 'browser'",
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const STT_PROFILE_PROVIDER_SETTINGS_TABLE = 'stt_profile_provider_settings'

export const STT_PROFILE_PROVIDER_SETTINGS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  provider: 'TEXT NOT NULL',
  settings_json: `TEXT NOT NULL DEFAULT '{}'`,
  secrets_json: `TEXT NOT NULL DEFAULT '{}'`,
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const STT_PROFILE_PROVIDER_SETTINGS_INDEXES = {
  idx_stt_profile_provider_settings_profile: 'CREATE INDEX IF NOT EXISTS idx_stt_profile_provider_settings_profile ON stt_profile_provider_settings(profile)',
  idx_stt_profile_provider_settings_profile_provider: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_stt_profile_provider_settings_profile_provider ON stt_profile_provider_settings(profile, provider)',
}

export const STT_PROFILE_SETTINGS_TABLE = 'stt_profile_settings'

export const STT_PROFILE_SETTINGS_SCHEMA: Record<string, string> = {
  profile: "TEXT PRIMARY KEY DEFAULT 'default'",
  active_provider: "TEXT NOT NULL DEFAULT 'browser'",
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const TTS_PROVIDER_SETTINGS_TABLE = 'tts_provider_settings'

export const TTS_PROVIDER_SETTINGS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  user_id: 'INTEGER NOT NULL',
  provider: 'TEXT NOT NULL',
  settings_json: `TEXT NOT NULL DEFAULT '{}'`,
  secrets_json: `TEXT NOT NULL DEFAULT '{}'`,
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const TTS_PROVIDER_SETTINGS_INDEXES = {
  idx_tts_provider_settings_user: 'CREATE INDEX IF NOT EXISTS idx_tts_provider_settings_user ON tts_provider_settings(user_id)',
  idx_tts_provider_settings_user_provider: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_provider_settings_user_provider ON tts_provider_settings(user_id, provider)',
}

export const TTS_USER_SETTINGS_TABLE = 'tts_user_settings'

export const TTS_USER_SETTINGS_SCHEMA: Record<string, string> = {
  user_id: 'INTEGER PRIMARY KEY',
  active_provider: "TEXT NOT NULL DEFAULT 'edge'",
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const TTS_PROFILE_PROVIDER_SETTINGS_TABLE = 'tts_profile_provider_settings'

export const TTS_PROFILE_PROVIDER_SETTINGS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  profile: "TEXT NOT NULL DEFAULT 'default'",
  provider: 'TEXT NOT NULL',
  settings_json: `TEXT NOT NULL DEFAULT '{}'`,
  secrets_json: `TEXT NOT NULL DEFAULT '{}'`,
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

export const TTS_PROFILE_PROVIDER_SETTINGS_INDEXES = {
  idx_tts_profile_provider_settings_profile: 'CREATE INDEX IF NOT EXISTS idx_tts_profile_provider_settings_profile ON tts_profile_provider_settings(profile)',
  idx_tts_profile_provider_settings_profile_provider: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_profile_provider_settings_profile_provider ON tts_profile_provider_settings(profile, provider)',
}

export const TTS_PROFILE_SETTINGS_TABLE = 'tts_profile_settings'

export const TTS_PROFILE_SETTINGS_SCHEMA: Record<string, string> = {
  profile: "TEXT PRIMARY KEY DEFAULT 'default'",
  active_provider: "TEXT NOT NULL DEFAULT 'edge'",
  created_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
  updated_at: `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`,
}

// ============================================================================
// Group Chat (modules/studio/sockets/group-chat.ts)
// ============================================================================

export const GC_ROOMS_TABLE = 'gc_rooms'

export const GC_ROOMS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  name: 'TEXT NOT NULL',
  inviteCode: 'TEXT UNIQUE',
  createdAt: 'INTEGER NOT NULL DEFAULT 0',
  summaryProfile: "TEXT NOT NULL DEFAULT 'default'",
  summaryProvider: "TEXT NOT NULL DEFAULT ''",
  summaryModel: "TEXT NOT NULL DEFAULT ''",
  summaryApiMode: "TEXT NOT NULL DEFAULT ''",
  summaryEveryTurns: 'INTEGER NOT NULL DEFAULT 20',
  summaryGeneration: 'INTEGER NOT NULL DEFAULT 0',
  messageDeletionRevision: 'INTEGER NOT NULL DEFAULT 0',
  triggerTokens: 'INTEGER NOT NULL DEFAULT 100000',
  maxHistoryTokens: 'INTEGER NOT NULL DEFAULT 32000',
  tailMessageCount: 'INTEGER NOT NULL DEFAULT 10',
  totalTokens: 'INTEGER NOT NULL DEFAULT 0',
  tokenAccountingVersion: 'INTEGER NOT NULL DEFAULT 0',
  sessionSeed: "TEXT NOT NULL DEFAULT '0'",
  workspace: "TEXT NOT NULL DEFAULT ''",
  ownerAuthUserId: 'INTEGER',
  allowGuestAgents: 'INTEGER NOT NULL DEFAULT 0',
  guestAgentApproval: "TEXT NOT NULL DEFAULT 'owner'",
  maxGuestAgentsPerMember: 'INTEGER NOT NULL DEFAULT 1',
  allowRemoteWorkspaceAccess: 'INTEGER NOT NULL DEFAULT 0',
  agentHandoffEnabled: 'INTEGER NOT NULL DEFAULT 1',
  agentHandoffMaxDepth: 'INTEGER',
  agentHandoffUnlimited: 'INTEGER NOT NULL DEFAULT 0',
}

export const GC_HANDOFF_CHAINS_TABLE = 'gc_handoff_chains'

export const GC_HANDOFF_CHAINS_SCHEMA: Record<string, string> = {
  chainId: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  sourceMessageId: 'TEXT NOT NULL',
  currentDepth: 'INTEGER NOT NULL DEFAULT 0',
  maxDepth: 'INTEGER',
  unlimited: 'INTEGER NOT NULL DEFAULT 0',
  targetAgentId: "TEXT NOT NULL DEFAULT ''",
  targetSnapshot: "TEXT NOT NULL DEFAULT '{}'",
  status: "TEXT NOT NULL DEFAULT 'active'",
  stopReason: "TEXT NOT NULL DEFAULT ''",
  continueUsed: 'INTEGER NOT NULL DEFAULT 0',
  attemptId: 'TEXT',
  lastError: 'TEXT',
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}

export const GC_HANDOFF_CHAINS_INDEXES = {
  idx_gc_handoff_chains_room: 'CREATE INDEX idx_gc_handoff_chains_room ON gc_handoff_chains(roomId, updatedAt)',
}

export const GC_HANDOFF_ATTEMPTS_TABLE = 'gc_handoff_attempts'
export const GC_HANDOFF_ATTEMPTS_SCHEMA: Record<string, string> = {
  attemptId: 'TEXT PRIMARY KEY',
  chainId: 'TEXT NOT NULL',
  roomId: 'TEXT NOT NULL',
  sourceInstanceId: "TEXT NOT NULL DEFAULT 'studio'",
  targetAgentId: "TEXT NOT NULL DEFAULT ''",
  targetSnapshot: "TEXT NOT NULL DEFAULT '{}'",
  payloadDigest: "TEXT NOT NULL DEFAULT ''",
  replacesAttemptId: 'TEXT',
  status: "TEXT NOT NULL DEFAULT 'claimed'",
  leaseUntil: 'INTEGER NOT NULL DEFAULT 0',
  attemptCount: 'INTEGER NOT NULL DEFAULT 0',
  lastError: 'TEXT',
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}
export const GC_HANDOFF_ATTEMPTS_INDEXES = {
  idx_gc_handoff_attempts_chain_history: 'CREATE INDEX IF NOT EXISTS idx_gc_handoff_attempts_chain_history ON gc_handoff_attempts(chainId, createdAt)',
  idx_gc_handoff_attempts_chain_active: "CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_handoff_attempts_chain_active ON gc_handoff_attempts(chainId) WHERE status IN ('claimed', 'admitted', 'dispatched', 'outcome_unknown')",
  idx_gc_handoff_attempts_lease: 'CREATE INDEX IF NOT EXISTS idx_gc_handoff_attempts_lease ON gc_handoff_attempts(status, leaseUntil)',
}

export const GC_HANDOFF_OUTBOX_TABLE = 'gc_handoff_outbox'
export const GC_HANDOFF_OUTBOX_SCHEMA: Record<string, string> = {
  attemptId: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  payload: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'pending'",
  availableAt: 'INTEGER NOT NULL DEFAULT 0',
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}
export const GC_HANDOFF_OUTBOX_INDEXES = {
  idx_gc_handoff_outbox_ready: 'CREATE INDEX idx_gc_handoff_outbox_ready ON gc_handoff_outbox(status, availableAt)',
}

export const GC_HANDOFF_DELIVERIES_TABLE = 'gc_handoff_deliveries'
export const GC_HANDOFF_DELIVERIES_SCHEMA: Record<string, string> = {
  attemptId: 'TEXT PRIMARY KEY',
  targetAgentId: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'accepted'",
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}
export const GC_HANDOFF_DELIVERIES_INDEXES = {
  idx_gc_handoff_deliveries_target: 'CREATE INDEX idx_gc_handoff_deliveries_target ON gc_handoff_deliveries(targetAgentId, status)',
}

export const GC_HANDOFF_INBOX_TABLE = 'gc_handoff_inbox'
export const GC_HANDOFF_INBOX_SCHEMA: Record<string, string> = {
  inboxId: 'TEXT PRIMARY KEY',
  sourceInstanceId: "TEXT NOT NULL DEFAULT 'studio'",
  attemptId: 'TEXT NOT NULL',
  targetAgentId: 'TEXT NOT NULL',
  targetSnapshot: "TEXT NOT NULL DEFAULT '{}'",
  payloadDigest: "TEXT NOT NULL DEFAULT ''",
  payload: "TEXT NOT NULL DEFAULT '{}'",
  receipt: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'admitted'",
  stateVersion: 'INTEGER NOT NULL DEFAULT 1',
  executionId: 'TEXT',
  leaseUntil: 'INTEGER NOT NULL DEFAULT 0',
  invocationStartedAt: 'INTEGER',
  terminalMessageId: 'TEXT',
  lastError: 'TEXT',
  tombstone: 'TEXT',
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}
export const GC_HANDOFF_INBOX_INDEXES = {
  idx_gc_handoff_inbox_attempt: 'CREATE UNIQUE INDEX idx_gc_handoff_inbox_attempt ON gc_handoff_inbox(sourceInstanceId, attemptId)',
  idx_gc_handoff_inbox_ready: "CREATE INDEX idx_gc_handoff_inbox_ready ON gc_handoff_inbox(status, leaseUntil)",
}

export const GC_MESSAGES_TABLE = 'gc_messages'

export const GC_MESSAGES_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  senderId: 'TEXT NOT NULL',
  senderName: 'TEXT NOT NULL',
  senderType: "TEXT NOT NULL DEFAULT ''",
  senderAgentRecordId: "TEXT NOT NULL DEFAULT ''",
  content: 'TEXT NOT NULL',
  timestamp: 'INTEGER NOT NULL',
  persistedAt: 'INTEGER NOT NULL DEFAULT 0',
  mentions: "TEXT NOT NULL DEFAULT '[]'",
  run_id: 'TEXT',
  role: "TEXT NOT NULL DEFAULT 'user'",
  tool_call_id: 'TEXT',
  tool_calls: 'TEXT',
  tool_name: 'TEXT',
  finish_reason: 'TEXT',
  reasoning: 'TEXT',
  reasoning_details: 'TEXT',
  reasoning_content: 'TEXT',
}

export const GC_MESSAGE_ROUTING_CONTEXTS_TABLE = 'gc_message_routing_contexts'
export const GC_MESSAGE_ROUTING_CONTEXTS_SCHEMA: Record<string, string> = { messageId: 'TEXT PRIMARY KEY', roomId: 'TEXT NOT NULL', messageHash: 'TEXT NOT NULL', requesterMemberId: 'TEXT NOT NULL', requesterAuthUserId: 'INTEGER', createdAt: 'INTEGER NOT NULL' }
export const GC_MESSAGE_ROUTING_DECISIONS_TABLE = 'gc_message_routing_decisions'
export const GC_MESSAGE_ROUTING_DECISIONS_SCHEMA: Record<string, string> = { messageId: 'TEXT PRIMARY KEY', roomId: 'TEXT NOT NULL', messageHash: 'TEXT NOT NULL', candidateHash: 'TEXT NOT NULL', configHash: 'TEXT NOT NULL', targetAgentId: 'TEXT', targetAgentName: 'TEXT', mode: "TEXT NOT NULL DEFAULT 'suggest'", status: "TEXT NOT NULL DEFAULT 'suggested'", queueId: 'TEXT', confidence: 'REAL', handoffComplete: 'INTEGER', loopDetected: 'INTEGER', createdAt: 'INTEGER NOT NULL', updatedAt: 'INTEGER NOT NULL' }
export const GC_MESSAGE_ROUTING_CLAIMS_TABLE = 'gc_message_routing_claims'
export const GC_MESSAGE_ROUTING_CLAIMS_SCHEMA: Record<string, string> = { messageId: 'TEXT PRIMARY KEY', roomId: 'TEXT NOT NULL', targetAgentId: 'TEXT NOT NULL', queueId: 'TEXT NOT NULL', status: "TEXT NOT NULL DEFAULT 'queued'", createdAt: 'INTEGER NOT NULL', updatedAt: 'INTEGER NOT NULL' }

export const GC_EXECUTION_QUEUE_TABLE = 'gc_execution_queue'

export const GC_EXECUTION_QUEUE_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  messageId: 'TEXT NOT NULL',
  targetAgentId: 'TEXT NOT NULL',
  targetAgentName: 'TEXT NOT NULL',
  requesterMemberId: 'TEXT NOT NULL',
  cancelCapabilityHash: "TEXT NOT NULL DEFAULT ''",
  textSummary: "TEXT NOT NULL DEFAULT ''",
  sequence: 'INTEGER NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'queued'",
  createdAt: 'INTEGER NOT NULL',
  startedAt: 'INTEGER',
  finishedAt: 'INTEGER',
  lastError: 'TEXT',
}

export const GC_EXECUTION_QUEUE_INDEXES = {
  idx_gc_execution_queue_message_target:
    'CREATE UNIQUE INDEX idx_gc_execution_queue_message_target ON gc_execution_queue(messageId, targetAgentId)',
  idx_gc_execution_queue_room_status_sequence:
    'CREATE INDEX idx_gc_execution_queue_room_status_sequence ON gc_execution_queue(roomId, status, sequence)',
}

export const GC_ACTIVITY_MIGRATIONS_TABLE = 'gc_activity_migrations'

export const GC_ACTIVITY_MIGRATIONS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  migrationCutoff: 'INTEGER NOT NULL',
}

export const GC_ROOM_AGENTS_TABLE = 'gc_room_agents'

export const GC_ROOM_AGENTS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  agentId: 'TEXT NOT NULL',
  agent: "TEXT NOT NULL DEFAULT 'hermes'",
  agentMode: "TEXT NOT NULL DEFAULT 'scoped'",
  priorAgentMode: "TEXT NOT NULL DEFAULT ''",
  profile: 'TEXT NOT NULL',
  provider: "TEXT NOT NULL DEFAULT ''",
  model: "TEXT NOT NULL DEFAULT ''",
  apiMode: "TEXT NOT NULL DEFAULT ''",
  reasoningEffort: "TEXT NOT NULL DEFAULT ''",
  agentPreset: "TEXT NOT NULL DEFAULT ''",
  name: 'TEXT NOT NULL',
  description: "TEXT NOT NULL DEFAULT ''",
  avatar: "TEXT NOT NULL DEFAULT ''",
  invited: 'INTEGER NOT NULL DEFAULT 0',
  executorType: "TEXT NOT NULL DEFAULT 'server'",
  ownerMemberId: "TEXT NOT NULL DEFAULT ''",
  connectorId: "TEXT NOT NULL DEFAULT ''",
  remoteOrigin: "TEXT NOT NULL DEFAULT ''",
  removedAt: 'INTEGER NOT NULL DEFAULT 0',
}

export const GC_AGENT_PRESETS_TABLE = 'gc_agent_presets'

export const GC_AGENT_PRESETS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  ownerUserId: 'INTEGER NOT NULL',
  agent: "TEXT NOT NULL DEFAULT 'hermes'",
  agentMode: "TEXT NOT NULL DEFAULT 'scoped'",
  priorAgentMode: "TEXT NOT NULL DEFAULT ''",
  profile: 'TEXT NOT NULL',
  provider: 'TEXT NOT NULL',
  model: 'TEXT NOT NULL',
  apiMode: "TEXT NOT NULL DEFAULT ''",
  reasoningEffort: "TEXT NOT NULL DEFAULT ''",
  agentPreset: "TEXT NOT NULL DEFAULT ''",
  name: 'TEXT NOT NULL',
  description: "TEXT NOT NULL DEFAULT ''",
  avatar: "TEXT NOT NULL DEFAULT ''",
  createdAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}

export const GC_AGENT_PAIRING_REQUESTS_TABLE = 'gc_agent_pairing_requests'

export const GC_AGENT_PAIRING_REQUESTS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  ownerMemberId: 'TEXT NOT NULL',
  ownerName: 'TEXT NOT NULL',
  requesterSecretHash: 'TEXT NOT NULL',
  pairingTicketHash: 'TEXT NOT NULL UNIQUE',
  targetOrigin: 'TEXT NOT NULL',
  agentJson: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'pending'",
  createdAt: 'INTEGER NOT NULL',
  expiresAt: 'INTEGER NOT NULL',
  approvedAt: 'INTEGER',
  ticketExpiresAt: 'INTEGER',
  consumedAt: 'INTEGER',
  decidedByAuthUserId: 'INTEGER',
  failureReason: "TEXT NOT NULL DEFAULT ''",
}

export const GC_AGENT_CONNECTORS_TABLE = 'gc_agent_connectors'

export const GC_AGENT_CONNECTORS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  roomAgentId: 'TEXT NOT NULL',
  agentId: 'TEXT NOT NULL',
  ownerMemberId: 'TEXT NOT NULL',
  targetOrigin: 'TEXT NOT NULL',
  credentialHash: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'offline'",
  createdAt: 'INTEGER NOT NULL',
  lastSeenAt: 'INTEGER NOT NULL',
  revokedAt: 'INTEGER',
}

export const GC_CONTEXT_SNAPSHOTS_TABLE = 'gc_context_snapshots'

export const GC_CONTEXT_SNAPSHOTS_SCHEMA: Record<string, string> = {
  roomId: 'TEXT PRIMARY KEY',
  summary: 'TEXT NOT NULL DEFAULT \'\'',
  lastMessageId: 'TEXT NOT NULL',
  lastMessageTimestamp: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
}

export const GC_ROOM_SUMMARIES_TABLE = 'gc_room_summaries'

export const GC_ROOM_SUMMARIES_SCHEMA: Record<string, string> = {
  roomId: 'TEXT PRIMARY KEY',
  summary: "TEXT NOT NULL DEFAULT ''",
  summaryThroughMessageId: "TEXT NOT NULL DEFAULT ''",
  summaryThroughMessageTimestamp: 'INTEGER NOT NULL DEFAULT 0',
  summarizedTurnCount: 'INTEGER NOT NULL DEFAULT 0',
  status: "TEXT NOT NULL DEFAULT 'idle'",
  version: 'INTEGER NOT NULL DEFAULT 0',
  updatedAt: 'INTEGER NOT NULL DEFAULT 0',
  lastError: 'TEXT',
  summaryRunToken: "TEXT NOT NULL DEFAULT ''",
  summaryLeaseExpiresAt: 'INTEGER NOT NULL DEFAULT 0',
  summaryRunGeneration: 'INTEGER NOT NULL DEFAULT 0',
  summaryDrainThroughMessageId: "TEXT NOT NULL DEFAULT ''",
}

export const GC_SUMMARY_REVIEWS_TABLE = 'gc_summary_reviews'
export const GC_SUMMARY_REVIEWS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  sourceVersion: 'INTEGER NOT NULL',
  sourceSummaryHash: 'TEXT NOT NULL',
  sourceAnchor: "TEXT NOT NULL DEFAULT ''",
  sourceTurnCount: 'INTEGER NOT NULL DEFAULT 0',
  inputHash: 'TEXT NOT NULL',
  configHash: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'completed'",
  decision: "TEXT NOT NULL DEFAULT 'unknown'",
  ruleResultsJson: "TEXT NOT NULL DEFAULT '[]'",
  reasonCode: "TEXT NOT NULL DEFAULT ''",
  durationMs: 'INTEGER NOT NULL DEFAULT 0',
  createdAt: 'INTEGER NOT NULL',
  appliedRevisionVersion: 'INTEGER',
}
export const GC_SUMMARY_REVIEWS_INDEXES = {
  idx_gc_summary_reviews_room_version: 'CREATE INDEX IF NOT EXISTS idx_gc_summary_reviews_room_version ON gc_summary_reviews(roomId, sourceVersion, createdAt DESC)',
  idx_gc_summary_reviews_attempt: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_gc_summary_reviews_attempt ON gc_summary_reviews(roomId, inputHash, configHash)',
}

export const GC_ROOM_MEMBERS_TABLE = 'gc_room_members'

export const GC_ROOM_MEMBERS_SCHEMA: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  roomId: 'TEXT NOT NULL',
  userId: 'TEXT NOT NULL',
  userName: 'TEXT NOT NULL',
  description: "TEXT NOT NULL DEFAULT ''",
  joinedAt: 'INTEGER NOT NULL',
  updatedAt: 'INTEGER NOT NULL',
  avatar: "TEXT NOT NULL DEFAULT ''",
  authUserId: 'INTEGER',
}

export const GC_PENDING_SESSION_DELETES_TABLE = 'gc_pending_session_deletes'

export const GC_PENDING_SESSION_DELETES_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  profile_name: 'TEXT NOT NULL',
  status: "TEXT NOT NULL DEFAULT 'pending'",
  attempt_count: 'INTEGER NOT NULL DEFAULT 0',
  last_error: 'TEXT',
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  next_attempt_at: 'INTEGER NOT NULL DEFAULT 0',
}

export const GC_SESSION_PROFILES_TABLE = 'gc_session_profiles'

export const GC_SESSION_PROFILES_SCHEMA: Record<string, string> = {
  session_id: 'TEXT PRIMARY KEY',
  room_id: 'TEXT NOT NULL',
  agent_id: 'TEXT NOT NULL',
  profile_name: 'TEXT NOT NULL',
  created_at: 'INTEGER NOT NULL',
}

// ============================================================================
// Schema Sync Utilities
// ============================================================================

import { getDb, getStoragePath } from './index'
import { initPersonTables } from './person-schema'
import { initPersonWorkspaceBindings } from './person-workspace-schema'
import { initSessionStateTables } from './session-state-schema'
import { BUILTIN_HISTORY_SOURCES, BUILTIN_HUB_AGENT_IDS, LEGACY_EKKO_AGENT_IDS } from '../../contracts/history-source'

const LEGACY_RUNTIME_ALIASES = new Set(['ekko', 'ekko-agent', 'ekko_agent', 'hub-agent', 'hub_agent'])
const LEGACY_GROUP_ALIASES = ['ekko', 'ekko-agent', 'ekko_agent', 'hub-agent', 'hub_agent'] as const
const LEGACY_WORKFLOW_AGENT_ALIASES = new Set(['ekko', 'ekko-agent', 'ekko_agent', 'hub', 'hub_agent'])

function normalizeJsonWorkflowNodes(rawJson: string): string | null {
  try {
    const parsed = JSON.parse(rawJson)
    if (!Array.isArray(parsed)) return null
    let changed = false
    for (const node of parsed) {
      const data = node?.data
      if (!data || typeof data !== 'object') continue
      for (const field of ['agent', 'codingAgentId'] as const) {
        const value = typeof data[field] === 'string' ? data[field].trim() : ''
        if (value && LEGACY_WORKFLOW_AGENT_ALIASES.has(value.toLowerCase()) && value !== 'hub-agent') {
          data[field] = 'hub-agent'
          changed = true
        }
      }
    }
    return changed ? JSON.stringify(parsed) : null
  } catch {
    return null
  }
}

function normalizeJsonPersonSelection(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  let changed = false
  if (Array.isArray(value)) {
    for (const item of value) {
      if (normalizeJsonPersonSelection(item)) changed = true
    }
    return changed
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.runtime === 'string' && LEGACY_RUNTIME_ALIASES.has(obj.runtime.trim().toLowerCase()) && obj.runtime !== 'hub') {
    obj.runtime = 'hub'
    changed = true
  }
  for (const nested of Object.values(obj)) {
    if (normalizeJsonPersonSelection(nested)) changed = true
  }
  return changed
}

function normalizeJsonTaskPlanSnapshot(rawJson: string): string | null {
  try {
    const parsed = JSON.parse(rawJson)
    if (!parsed || typeof parsed !== 'object') return null
    let changed = false
    if (typeof parsed.agent === 'string' && LEGACY_WORKFLOW_AGENT_ALIASES.has(parsed.agent.trim().toLowerCase()) && parsed.agent !== 'hub-agent') {
      parsed.agent = 'hub-agent'
      changed = true
    }
    if (typeof parsed.runtime === 'string' && LEGACY_RUNTIME_ALIASES.has(parsed.runtime.trim().toLowerCase()) && parsed.runtime !== 'hub') {
      parsed.runtime = 'hub'
      changed = true
    }
    return changed ? JSON.stringify(parsed) : null
  } catch {
    return null
  }
}

/**
 * Idempotently migrate legacy 'ekko' / 'ekko-agent' / 'ekko_agent' database values
 * to 'hub' / 'hub-agent' / 'hub_agent' across session, usage, group chat, workflow,
 * skill, task plan, and Person tables. Safe to invoke repeatedly or on partial fixtures.
 */
export function migrateLegacyEkkoIdentifiers(db: NonNullable<ReturnType<typeof getDb>>): void {
  const runInTx = !db.isTransaction
  if (runInTx) db.exec('BEGIN IMMEDIATE')
  try {
    if (tableExists(db, SESSIONS_TABLE)) {
      const legacyBuiltinSources = [...BUILTIN_HISTORY_SOURCES, ...LEGACY_EKKO_AGENT_IDS]
      db.prepare(`UPDATE ${SESSIONS_TABLE} SET source = 'builtin_agent', agent = 'hub-agent'
        WHERE source IN (${legacyBuiltinSources.map(() => '?').join(', ')})
        AND LOWER(TRIM(COALESCE(agent, ''))) IN (${BUILTIN_HUB_AGENT_IDS.map(() => '?').join(', ')})
        AND (source <> 'builtin_agent' OR agent <> 'hub-agent')`)
        .run(...legacyBuiltinSources, ...BUILTIN_HUB_AGENT_IDS)

      const remainingAliases = [...LEGACY_EKKO_AGENT_IDS, 'hub', 'hub_agent']
      db.prepare(`UPDATE ${SESSIONS_TABLE} SET agent = 'hub-agent'
        WHERE LOWER(TRIM(COALESCE(agent, ''))) IN (${remainingAliases.map(() => '?').join(', ')})
        AND agent <> 'hub-agent'`)
        .run(...remainingAliases)
    }

    if (tableExists(db, USAGE_TABLE)) {
      db.prepare(`UPDATE ${USAGE_TABLE} SET source = 'hub_agent'
        WHERE LOWER(TRIM(COALESCE(source, ''))) = 'ekko_agent'
        AND (run_id = '' OR NOT EXISTS (
          SELECT 1 FROM ${USAGE_TABLE} u2
          WHERE u2.session_id = ${USAGE_TABLE}.session_id AND u2.run_id = ${USAGE_TABLE}.run_id AND u2.source = 'hub_agent'
        ))`).run()
      const usageAgentAliases = [...LEGACY_EKKO_AGENT_IDS, 'hub', 'hub-agent']
      db.prepare(`UPDATE ${USAGE_TABLE} SET agent = 'hub_agent'
        WHERE LOWER(TRIM(COALESCE(agent, ''))) IN (${usageAgentAliases.map(() => '?').join(', ')})
        AND agent <> 'hub_agent'`)
        .run(...usageAgentAliases)
    }

    for (const table of [GC_ROOM_AGENTS_TABLE, GC_AGENT_PRESETS_TABLE]) {
      if (!tableExists(db, table)) continue
      db.prepare(`UPDATE ${table} SET agent = 'hub'
        WHERE LOWER(TRIM(COALESCE(agent, ''))) IN (${LEGACY_GROUP_ALIASES.map(() => '?').join(', ')})
        AND agent <> 'hub'`).run(...LEGACY_GROUP_ALIASES)
    }

    for (const [table, canonical] of [
      [WORKFLOW_RUN_NODE_SESSIONS_TABLE, 'hub-agent'],
      [SKILL_USAGE_EVENTS_TABLE, 'hub-agent'],
    ] as const) {
      if (!tableExists(db, table)) continue
      const aliases = [...LEGACY_EKKO_AGENT_IDS, 'hub', 'hub_agent']
      db.prepare(`UPDATE ${table} SET agent = ?
        WHERE LOWER(TRIM(COALESCE(agent, ''))) IN (${aliases.map(() => '?').join(', ')})
        AND agent <> ?`).run(canonical, ...aliases, canonical)
    }

    if (tableExists(db, WORKFLOWS_TABLE)) {
      const rows = db.prepare(`SELECT id, nodes_json FROM ${WORKFLOWS_TABLE} WHERE LOWER(nodes_json) LIKE '%ekko%'`).all() as Array<{ id: string; nodes_json: string }>
      const update = db.prepare(`UPDATE ${WORKFLOWS_TABLE} SET nodes_json = ? WHERE id = ?`)
      for (const row of rows) {
        const next = normalizeJsonWorkflowNodes(row.nodes_json)
        if (next) update.run(next, row.id)
      }
    }

    if (tableExists(db, WORKFLOW_RUNS_TABLE)) {
      const rows = db.prepare(`SELECT id, snapshot_nodes_json FROM ${WORKFLOW_RUNS_TABLE} WHERE LOWER(snapshot_nodes_json) LIKE '%ekko%'`).all() as Array<{ id: string; snapshot_nodes_json: string }>
      const update = db.prepare(`UPDATE ${WORKFLOW_RUNS_TABLE} SET snapshot_nodes_json = ? WHERE id = ?`)
      for (const row of rows) {
        const next = normalizeJsonWorkflowNodes(row.snapshot_nodes_json)
        if (next) update.run(next, row.id)
      }
    }

    for (const [table, column, keyCol] of [
      ['person_accounts', 'settings_json', 'user_id'],
      ['person_conversation_settings', 'settings_json', 'session_id'],
      ['person_executions', 'selection_json', 'id'],
      [SESSION_TASKS_TABLE, 'selection_json', 'id'],
    ] as const) {
      if (!tableExists(db, table)) continue
      const rows = db.prepare(`SELECT ${keyCol} AS key_val, ${column} AS json_val FROM ${table} WHERE LOWER(${column}) LIKE '%ekko%'`).all() as Array<{ key_val: string | number; json_val: string }>
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${keyCol} = ?`)
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.json_val)
          if (normalizeJsonPersonSelection(parsed)) update.run(JSON.stringify(parsed), row.key_val)
        } catch {
          // Leave malformed legacy JSON untouched.
        }
      }
    }

    if (tableExists(db, TASK_PLANS_TABLE)) {
      const rows = db.prepare(`SELECT session_id, plan_id, snapshot FROM ${TASK_PLANS_TABLE} WHERE LOWER(snapshot) LIKE '%ekko%'`).all() as Array<{ session_id: string; plan_id: string; snapshot: string }>
      const update = db.prepare(`UPDATE ${TASK_PLANS_TABLE} SET snapshot = ? WHERE session_id = ? AND plan_id = ?`)
      for (const row of rows) {
        const next = normalizeJsonTaskPlanSnapshot(row.snapshot)
        if (next) update.run(next, row.session_id, row.plan_id)
      }
    }

    if (runInTx) db.exec('COMMIT')
  } catch (err) {
    if (runInTx) db.exec('ROLLBACK')
    throw err
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * 检查表是否存在
 */
function tableExists(db: NonNullable<ReturnType<typeof getDb>>, tableName: string): boolean {
  const result = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName)
  return !!result
}

/**
 * 创建表（带完整 schema）
 */
function createTable(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
  schema: Record<string, string>,
  primaryKey?: string
): void {
  const colDefs = Object.entries(schema).map(([col, def]) => `${quoteIdentifier(col)} ${def}`)

  // 只在 schema 中没有主键时才添加复合主键
  const hasPrimaryKeyInSchema = Object.values(schema).some((def) =>
    def.toUpperCase().includes("PRIMARY KEY")
  )

  if (primaryKey && !hasPrimaryKeyInSchema) {
    colDefs.push(`PRIMARY KEY (${primaryKey})`)
  }

  db.exec(`CREATE TABLE ${quoteIdentifier(tableName)} (${colDefs.join(', ')})`)
}

function canAddColumnToExistingTable(schemaDef: string): boolean {
  const normalized = schemaDef.toUpperCase()
  if (normalized.includes('PRIMARY KEY')) return false
  if (normalized.includes('NOT NULL') && !normalized.includes('DEFAULT')) return false
  return true
}

function addMissingSafeColumns(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
  schema: Record<string, string>,
): void {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>
  const existingColumns = new Set(columns.map(col => col.name))

  for (const [columnName, columnDef] of Object.entries(schema)) {
    if (existingColumns.has(columnName)) continue
    if (!canAddColumnToExistingTable(columnDef)) {
      console.warn(`[Schema] ${tableName}.${columnName} cannot be added safely to existing table; skipping`)
      continue
    }
    db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDef}`)
  }
}

function migrateGroupChatActivityTimes(
  db: NonNullable<ReturnType<typeof getDb>>,
  migrationCutoff: number,
): void {
  if (!tableExists(db, GC_ROOMS_TABLE) || !tableExists(db, GC_MESSAGES_TABLE)) return
  const migrationId = 'legacy-activity-times-v1'
  if (db.prepare(
    `SELECT 1 FROM ${quoteIdentifier(GC_ACTIVITY_MIGRATIONS_TABLE)} WHERE id = ?`,
  ).get(migrationId)) return

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `UPDATE ${quoteIdentifier(GC_MESSAGES_TABLE)}
       SET persistedAt = timestamp
       WHERE persistedAt = 0
         AND timestamp > 0
         AND timestamp <= ?
         AND COALESCE(role, 'user') <> 'tool'
         AND COALESCE(tool_name, '') = ''
         AND COALESCE(finish_reason, '') <> 'streaming'`,
    ).run(migrationCutoff)
    db.prepare(
      `UPDATE ${quoteIdentifier(GC_ROOMS_TABLE)}
       SET createdAt = (
         SELECT MIN(m.persistedAt)
         FROM ${quoteIdentifier(GC_MESSAGES_TABLE)} m
         WHERE m.roomId = ${quoteIdentifier(GC_ROOMS_TABLE)}.id
           AND m.persistedAt > 0
       )
       WHERE createdAt = 0
         AND EXISTS (
           SELECT 1
           FROM ${quoteIdentifier(GC_MESSAGES_TABLE)} m
           WHERE m.roomId = ${quoteIdentifier(GC_ROOMS_TABLE)}.id
             AND m.persistedAt > 0
         )`,
    ).run()
    db.prepare(
      `INSERT INTO ${quoteIdentifier(GC_ACTIVITY_MIGRATIONS_TABLE)} (id, migrationCutoff) VALUES (?, ?)`,
    ).run(migrationId, migrationCutoff)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function createIndexes(
  db: NonNullable<ReturnType<typeof getDb>>,
  indexes?: Record<string, string>,
): void {
  if (!indexes) return

  for (const indexSQL of Object.values(indexes)) {
    db.exec(indexSQL)
  }
}

function indexExists(
  db: NonNullable<ReturnType<typeof getDb>>,
  indexName: string,
): boolean {
  return Boolean(db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='index' AND name=?`
  ).get(indexName))
}

function syncWorkflowRunNodeSessions(
  db: NonNullable<ReturnType<typeof getDb>>,
): void {
  if (!tableExists(db, WORKFLOW_RUN_NODE_SESSIONS_TABLE)) {
    syncTable(WORKFLOW_RUN_NODE_SESSIONS_TABLE, WORKFLOW_RUN_NODE_SESSIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_NODE_SESSIONS_INDEXES,
    })
    syncTable(WORKFLOW_RUN_QUALITY_EVALUATIONS_TABLE, WORKFLOW_RUN_QUALITY_EVALUATIONS_SCHEMA, { indexes: WORKFLOW_RUN_QUALITY_EVALUATIONS_INDEXES })
    return
  }

  const hasExecutionId = tableHasColumn(db, WORKFLOW_RUN_NODE_SESSIONS_TABLE, 'execution_id')
  const hasBlankExecutionIds = hasExecutionId && Boolean(db.prepare(
    `SELECT 1 FROM ${quoteIdentifier(WORKFLOW_RUN_NODE_SESSIONS_TABLE)} WHERE execution_id = '' LIMIT 1`
  ).get())
  const needsMigration =
    !hasExecutionId ||
    hasBlankExecutionIds ||
    indexExists(db, 'uniq_workflow_run_node_sessions_run_node') ||
    !indexExists(db, 'uniq_workflow_run_node_sessions_run_execution')

  if (!needsMigration) {
    syncTable(WORKFLOW_RUN_NODE_SESSIONS_TABLE, WORKFLOW_RUN_NODE_SESSIONS_SCHEMA)
    syncTable(WORKFLOW_RUN_QUALITY_EVALUATIONS_TABLE, WORKFLOW_RUN_QUALITY_EVALUATIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_QUALITY_EVALUATIONS_INDEXES,
    })
    return
  }

  db.exec('BEGIN')
  try {
    syncTable(WORKFLOW_RUN_NODE_SESSIONS_TABLE, WORKFLOW_RUN_NODE_SESSIONS_SCHEMA)
    db.prepare(
      `UPDATE ${quoteIdentifier(WORKFLOW_RUN_NODE_SESSIONS_TABLE)} ` +
      `SET execution_id = node_id WHERE execution_id = ''`
    ).run()
    db.exec('DROP INDEX IF EXISTS uniq_workflow_run_node_sessions_run_node')
    createIndexes(db, WORKFLOW_RUN_NODE_SESSIONS_INDEXES)
    syncTable(WORKFLOW_RUN_QUALITY_EVALUATIONS_TABLE, WORKFLOW_RUN_QUALITY_EVALUATIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_QUALITY_EVALUATIONS_INDEXES,
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function syncWorkflowRunEdgeEvaluations(
  db: NonNullable<ReturnType<typeof getDb>>,
): void {
  if (!tableExists(db, WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE)) {
    syncTable(WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE, WORKFLOW_RUN_EDGE_EVALUATIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_EDGE_EVALUATIONS_INDEXES,
    })
    return
  }

  const hasIncompatibleLegacySchema =
    !tableHasColumn(db, WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE, 'source_outcome') ||
    !tableHasColumn(db, WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE, 'route')
  if (!hasIncompatibleLegacySchema) {
    syncTable(WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE, WORKFLOW_RUN_EDGE_EVALUATIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_EDGE_EVALUATIONS_INDEXES,
    })
    return
  }

  const archiveTable = `${WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE}__legacy_v1`
  db.exec('BEGIN')
  try {
    if (tableExists(db, archiveTable)) {
      throw new Error(`cannot archive legacy ${WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE}: ${archiveTable} already exists`)
    }
    db.exec(
      `ALTER TABLE ${quoteIdentifier(WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE)} ` +
      `RENAME TO ${quoteIdentifier(archiveTable)}`
    )
    for (const indexName of Object.keys(WORKFLOW_RUN_EDGE_EVALUATIONS_INDEXES)) {
      db.exec(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`)
    }
    syncTable(WORKFLOW_RUN_EDGE_EVALUATIONS_TABLE, WORKFLOW_RUN_EDGE_EVALUATIONS_SCHEMA, {
      indexes: WORKFLOW_RUN_EDGE_EVALUATIONS_INDEXES,
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function migrateLegacySttProviderSettingsUserIdDefault(
  db: NonNullable<ReturnType<typeof getDb>>,
): void {
  if (!tableExists(db, STT_PROVIDER_SETTINGS_TABLE)) return

  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(STT_PROVIDER_SETTINGS_TABLE)})`).all() as Array<{
    name: string
    dflt_value: string | null
  }>
  const userIdColumn = columns.find((column) => column.name === 'user_id')

  if (!userIdColumn || userIdColumn.dflt_value === null) {
    return
  }

  const replacementTableName = `${STT_PROVIDER_SETTINGS_TABLE}__rebuilt`
  const preservedColumns = ['id', 'user_id', 'provider', 'settings_json', 'secrets_json', 'created_at', 'updated_at']
  const quotedPreservedColumns = preservedColumns.map((column) => quoteIdentifier(column)).join(', ')

  db.exec('BEGIN')
  try {
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(replacementTableName)}`)
    createTable(db, replacementTableName, STT_PROVIDER_SETTINGS_SCHEMA)
    db.exec(
      `INSERT INTO ${quoteIdentifier(replacementTableName)} (${quotedPreservedColumns}) ` +
      `SELECT ${quotedPreservedColumns} FROM ${quoteIdentifier(STT_PROVIDER_SETTINGS_TABLE)}`
    )
    db.exec(`DROP TABLE ${quoteIdentifier(STT_PROVIDER_SETTINGS_TABLE)}`)
    db.exec(`ALTER TABLE ${quoteIdentifier(replacementTableName)} RENAME TO ${quoteIdentifier(STT_PROVIDER_SETTINGS_TABLE)}`)
    createIndexes(db, STT_PROVIDER_SETTINGS_INDEXES)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function copyLegacyProviderSettingsToDefaultProfile(
  db: NonNullable<ReturnType<typeof getDb>>,
  sourceTableName: string,
  targetTableName: string,
): void {
  if (!tableExists(db, sourceTableName) || !tableExists(db, targetTableName)) return

  db.prepare(
    `INSERT OR IGNORE INTO ${quoteIdentifier(targetTableName)} ` +
    `(profile, provider, settings_json, secrets_json, created_at, updated_at) ` +
    `SELECT 'default', old.provider, old.settings_json, old.secrets_json, old.created_at, old.updated_at ` +
    `FROM ${quoteIdentifier(sourceTableName)} old ` +
    `WHERE old.provider IS NOT NULL ` +
    `AND NOT EXISTS (` +
    `SELECT 1 FROM ${quoteIdentifier(sourceTableName)} newer ` +
    `WHERE newer.provider = old.provider ` +
    `AND (newer.updated_at > old.updated_at OR (newer.updated_at = old.updated_at AND newer.rowid > old.rowid))` +
    `)`
  ).run()
}

function copyLegacyActiveSettingsToDefaultProfile(
  db: NonNullable<ReturnType<typeof getDb>>,
  sourceTableName: string,
  targetTableName: string,
): void {
  if (!tableExists(db, sourceTableName) || !tableExists(db, targetTableName)) return

  db.prepare(
    `INSERT OR IGNORE INTO ${quoteIdentifier(targetTableName)} ` +
    `(profile, active_provider, created_at, updated_at) ` +
    `SELECT 'default', active_provider, created_at, updated_at ` +
    `FROM ${quoteIdentifier(sourceTableName)} ` +
    `WHERE active_provider IS NOT NULL ` +
    `ORDER BY updated_at DESC, rowid DESC ` +
    `LIMIT 1`
  ).run()
}

function tableHasColumn(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
  columnName: string,
): boolean {
  if (!tableExists(db, tableName)) return false
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>
  return columns.some(column => column.name === columnName)
}

function pruneDuplicateProfileProviderSettings(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
): void {
  if (!tableHasColumn(db, tableName, 'profile') || !tableHasColumn(db, tableName, 'provider')) return

  db.prepare(
    `DELETE FROM ${quoteIdentifier(tableName)} ` +
    `WHERE rowid NOT IN (` +
    `SELECT kept.rowid FROM ${quoteIdentifier(tableName)} kept ` +
    `WHERE NOT EXISTS (` +
    `SELECT 1 FROM ${quoteIdentifier(tableName)} newer ` +
    `WHERE newer.profile = kept.profile ` +
    `AND newer.provider = kept.provider ` +
    `AND (newer.updated_at > kept.updated_at OR (newer.updated_at = kept.updated_at AND newer.rowid > kept.rowid))` +
    `)` +
    `)`
  ).run()
}

function pruneDuplicateProfileActiveSettings(
  db: NonNullable<ReturnType<typeof getDb>>,
  tableName: string,
): void {
  if (!tableHasColumn(db, tableName, 'profile')) return

  db.prepare(
    `DELETE FROM ${quoteIdentifier(tableName)} ` +
    `WHERE rowid NOT IN (` +
    `SELECT kept.rowid FROM ${quoteIdentifier(tableName)} kept ` +
    `WHERE NOT EXISTS (` +
    `SELECT 1 FROM ${quoteIdentifier(tableName)} newer ` +
    `WHERE newer.profile = kept.profile ` +
    `AND (newer.updated_at > kept.updated_at OR (newer.updated_at = kept.updated_at AND newer.rowid > kept.rowid))` +
    `)` +
    `)`
  ).run()
}

function ensureProfileSettingsIndexes(
  db: NonNullable<ReturnType<typeof getDb>>,
  activeTableName: string,
  activeIndexName: string,
  providerTableName: string,
  providerIndexes: Record<string, string>,
): void {
  pruneDuplicateProfileActiveSettings(db, activeTableName)
  pruneDuplicateProfileProviderSettings(db, providerTableName)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(activeIndexName)} ON ${quoteIdentifier(activeTableName)}(profile)`)
  createIndexes(db, providerIndexes)
}

/**
 * 主同步函数
 * - 表不存在：创建
 * - 表存在：只追加安全的新列，不删除、不重建、不修改主键/类型
 */
export function syncTable(
  tableName: string,
  schema: Record<string, string>,
  options?: {
    primaryKey?: string  // 主键定义，如 "roomId, agentId" 或 "id"
    indexes?: Record<string, string>  // 索引定义
  }
): void {
  const db = getDb()
  if (!db) return

  // 1. 表不存在 → 直接创建
  if (!tableExists(db, tableName)) {
    createTable(db, tableName, schema, options?.primaryKey)

    // 创建索引
    createIndexes(db, options?.indexes)
    return
  }

  addMissingSafeColumns(db, tableName, schema)
}

/** Rebuild constraints for account-owned tasks, preserving rows and custom schema objects. */
function migrateSessionTaskSchema(db: NonNullable<ReturnType<typeof getDb>>): void {
  const legacyCheck = /CHECK\s*\(\s*status\s+IN\s*\(\s*'open'\s*,\s*'completed'\s*\)\s*\)/i
  const upgradedSql = (sql: string) => sql
    .replace(legacyCheck, "CHECK(status IN ('open', 'completed', 'closed'))")
    .replace(/((?:"session_id"|\bsession_id)\s+TEXT)\s+NOT\s+NULL\b/i, '$1')
    .replace(/((?:"source_message_id"|\bsource_message_id)\s+INTEGER)\s+NOT\s+NULL\b/i, '$1')
  const readSql = () => (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(SESSION_TASKS_TABLE) as { sql: string } | undefined)?.sql
  const original = readSql() || ''
  if (upgradedSql(original) === original) return
  db.exec('BEGIN IMMEDIATE')
  try {
    const sql = readSql() || ''
    if (upgradedSql(sql) !== sql) {
      const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL")
        .all(SESSION_TASKS_TABLE) as Array<{ sql: string }>
      const columns = (db.prepare(`PRAGMA table_info(${quoteIdentifier(SESSION_TASKS_TABLE)})`).all() as Array<{ name: string }>)
        .map(column => quoteIdentifier(column.name)).join(', ')
      const temporary = 'session_tasks_schema_upgrade'
      const createSql = upgradedSql(sql)
        .replace(/^(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)(?:"session_tasks"|session_tasks)(?=\s*\()/i, `$1${quoteIdentifier(temporary)}`)
      db.exec(createSql)
      db.exec(`INSERT INTO ${quoteIdentifier(temporary)} (${columns}) SELECT ${columns} FROM ${quoteIdentifier(SESSION_TASKS_TABLE)}`)
      // This cross-table gate references session_tasks from person_executions.
      // SQLite validates all triggers during RENAME, including the short gap after DROP.
      // Retire and restore only our gate inside this same transaction; rollback preserves it on failure.
      const acceptanceGate = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='person_acceptance_execution_gate'").get() as { sql: string } | undefined
      const acceptanceView = db.prepare("SELECT sql FROM sqlite_master WHERE type='view' AND name='person_acceptance_passes'").get() as {sql:string} | undefined
      if (acceptanceGate) db.exec('DROP TRIGGER person_acceptance_execution_gate')
      if (acceptanceView) db.exec('DROP VIEW person_acceptance_passes')
      db.exec(`DROP TABLE ${quoteIdentifier(SESSION_TASKS_TABLE)}`)
      db.exec(`ALTER TABLE ${quoteIdentifier(temporary)} RENAME TO ${quoteIdentifier(SESSION_TASKS_TABLE)}`)
      for (const object of objects) db.exec(object.sql)
      if (acceptanceView) db.exec(acceptanceView.sql)
      if (acceptanceGate) db.exec(acceptanceGate.sql)
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function cleanupHistoricalZeroLineWorkspaceDiffs(
  db: NonNullable<ReturnType<typeof getDb>>,
): void {
  const zeroLinePredicate = 'additions = 0 AND deletions = 0'
  const affectedRows = db.prepare(
    `SELECT DISTINCT change_id FROM ${WORKSPACE_RUN_CHANGE_FILES_TABLE} WHERE ${zeroLinePredicate}`,
  ).all() as Array<{ change_id: string }>
  if (affectedRows.length === 0) return

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`DELETE FROM ${WORKSPACE_RUN_CHANGE_FILES_TABLE} WHERE ${zeroLinePredicate}`).run()
    const aggregate = db.prepare(
      `SELECT COUNT(*) AS files_changed, COALESCE(SUM(additions), 0) AS additions,
        COALESCE(SUM(deletions), 0) AS deletions, COALESCE(MAX(truncated), 0) AS truncated,
        COALESCE(SUM(patch_bytes), 0) AS total_patch_bytes
       FROM ${WORKSPACE_RUN_CHANGE_FILES_TABLE} WHERE change_id = ?`,
    )
    const updateParent = db.prepare(
      `UPDATE ${WORKSPACE_RUN_CHANGES_TABLE}
       SET files_changed = ?, additions = ?, deletions = ?, truncated = ?, total_patch_bytes = ?
       WHERE change_id = ?`,
    )
    const deleteParent = db.prepare(`DELETE FROM ${WORKSPACE_RUN_CHANGES_TABLE} WHERE change_id = ?`)

    for (const { change_id: changeId } of affectedRows) {
      const totals = aggregate.get(changeId) as {
        files_changed: number
        additions: number
        deletions: number
        truncated: number
        total_patch_bytes: number
      }
      if (totals.files_changed === 0) {
        deleteParent.run(changeId)
      } else {
        updateParent.run(
          totals.files_changed,
          totals.additions,
          totals.deletions,
          totals.truncated,
          totals.total_patch_bytes,
          changeId,
        )
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// ============================================================================
// Unified Initializer
// ============================================================================

/**
 * Initialize missing Hermes SQLite tables with proper schemas.
 * Existing tables receive safe additive columns and explicit domain migrations.
 * Call this once at application bootstrap.
 */
export function initAllHermesTables(): void {
  const db = getDb()
  if (!db) return

  try {
    // Usage store
    syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_model_api_key ON ${USAGE_TABLE}(model_api_key_id, account_id)`)
    syncTable(USAGE_PRICING_TABLE, USAGE_PRICING_SCHEMA, { primaryKey: 'profile' })
    db.exec(USAGE_RUN_INDEX)
    syncTable(RUN_USAGE_TABLE, RUN_USAGE_SCHEMA, { indexes: RUN_USAGE_INDEXES })
    // syncTable only creates indexes for a new table. Existing tables need
    // these on every startup as well: completion uses the unique run key.
    createIndexes(db, RUN_USAGE_INDEXES)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_parent_run ON ${USAGE_TABLE}(session_id, parent_run_id)`)

    // Session store
    syncTable(WORKSPACE_DIRECTORIES_TABLE, WORKSPACE_DIRECTORIES_SCHEMA, {
      indexes: WORKSPACE_DIRECTORIES_INDEXES,
    })
    syncTable(SESSION_CATEGORIES_TABLE, SESSION_CATEGORIES_SCHEMA, {
      indexes: SESSION_CATEGORIES_INDEXES,
    })
    syncTable(TASK_PLANS_TABLE, TASK_PLANS_SCHEMA, {
      indexes: {
        idx_task_plans_identity: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_task_plans_identity ON task_plans(session_id, plan_id)',
        idx_task_plans_run: 'CREATE INDEX IF NOT EXISTS idx_task_plans_run ON task_plans(session_id, run_id)',
        idx_task_plans_latest: 'CREATE INDEX IF NOT EXISTS idx_task_plans_latest ON task_plans(session_id, created_at DESC)',
      },
    })
    syncTable(SESSION_TASKS_TABLE, SESSION_TASKS_SCHEMA, {
      indexes: { idx_session_tasks_session: 'CREATE INDEX IF NOT EXISTS idx_session_tasks_session ON session_tasks(session_id, created_at, id)' },
    })
    migrateSessionTaskSchema(db)
    initPersonTables(db)
    syncTable(SESSIONS_TABLE, SESSIONS_SCHEMA, {
      indexes: SESSIONS_INDEXES,
    })
    initPersonWorkspaceBindings(db)
    db.prepare(`UPDATE ${SESSIONS_TABLE} SET bot_type = 'zhezhe'
      WHERE id LIKE 'person-main-%' AND bot_type = ''`).run()
    createIndexes(db, SESSION_CATEGORIES_INDEXES)
    createIndexes(db, SESSIONS_INDEXES)
    syncTable(MESSAGES_TABLE, MESSAGES_SCHEMA)
    initSessionStateTables(db)
    db.exec(MESSAGES_INDEX)
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session_run ON messages(session_id,run_marker,id)')
    db.exec("CREATE INDEX IF NOT EXISTS idx_messages_person_timeline ON messages(session_id,timestamp*1000,printf('%020d',id))")
    syncTable(SKILL_USAGE_EVENTS_TABLE, SKILL_USAGE_EVENTS_SCHEMA, {
      indexes: SKILL_USAGE_EVENTS_INDEXES,
    })
    syncTable(SKILL_USAGE_SYNC_TABLE, SKILL_USAGE_SYNC_SCHEMA, { primaryKey: 'source' })
    syncTable(CHAT_WEBHOOK_ENDPOINTS_TABLE, CHAT_WEBHOOK_ENDPOINTS_SCHEMA, {
      indexes: CHAT_WEBHOOK_ENDPOINTS_INDEXES,
    })
    syncTable(WORKSPACE_RUN_CHANGES_TABLE, WORKSPACE_RUN_CHANGES_SCHEMA, {
      indexes: WORKSPACE_RUN_CHANGES_INDEXES,
    })
    syncTable(WORKSPACE_RUN_CHANGE_FILES_TABLE, WORKSPACE_RUN_CHANGE_FILES_SCHEMA, {
      indexes: WORKSPACE_RUN_CHANGE_FILES_INDEXES,
    })
    cleanupHistoricalZeroLineWorkspaceDiffs(db)

    // Workflow store
    syncTable(WORKFLOWS_TABLE, WORKFLOWS_SCHEMA, {
      indexes: WORKFLOWS_INDEXES,
    })
    syncTable(WORKFLOW_SCHEDULES_TABLE, WORKFLOW_SCHEDULES_SCHEMA, { indexes: WORKFLOW_SCHEDULES_INDEXES })
    syncTable(WORKFLOW_SCHEDULE_TRIGGERS_TABLE, WORKFLOW_SCHEDULE_TRIGGERS_SCHEMA)
    syncTable(WORKFLOW_SCHEDULE_EVENTS_TABLE, WORKFLOW_SCHEDULE_EVENTS_SCHEMA, { indexes: WORKFLOW_SCHEDULE_EVENTS_INDEXES })
    syncTable(WORKFLOW_RUNS_TABLE, WORKFLOW_RUNS_SCHEMA, {
      indexes: WORKFLOW_RUNS_INDEXES,
    })
    syncWorkflowRunNodeSessions(db)
    syncWorkflowRunEdgeEvaluations(db)
    syncTable(WORKFLOW_RUN_LOOP_EPOCHS_TABLE, WORKFLOW_RUN_LOOP_EPOCHS_SCHEMA, {
      indexes: WORKFLOW_RUN_LOOP_EPOCHS_INDEXES,
    })

    // Compression snapshot
    syncTable(COMPRESSION_SNAPSHOT_TABLE, COMPRESSION_SNAPSHOT_SCHEMA)

    // Model context. Existing rows are assigned to the default profile; replace
    // the legacy cross-profile uniqueness constraint with a profile-scoped one.
    syncTable(MODEL_CONTEXT_TABLE, MODEL_CONTEXT_SCHEMA)
    db.exec(`DROP INDEX IF EXISTS ${quoteIdentifier(LEGACY_MODEL_CONTEXT_INDEX)}`)
    db.exec(MODEL_CONTEXT_INDEX)

    // Provider configuration audit
    syncTable(PROVIDER_AUDIT_TABLE, PROVIDER_AUDIT_SCHEMA, {
      indexes: PROVIDER_AUDIT_INDEXES,
    })

    // Users and profile access
    syncTable(USERS_TABLE, USERS_SCHEMA)
    syncTable(MODEL_API_KEYS_TABLE, MODEL_API_KEYS_SCHEMA, {
      indexes: { idx_model_api_keys_owner: `CREATE INDEX IF NOT EXISTS idx_model_api_keys_owner ON ${MODEL_API_KEYS_TABLE}(user_id)` },
    })
    syncTable(USER_PROFILES_TABLE, USER_PROFILES_SCHEMA, {
      primaryKey: 'user_id, profile_name',
      indexes: USER_PROFILES_INDEXES,
    })
    syncTable(USER_THEMES_TABLE, USER_THEMES_SCHEMA)
    syncTable(USER_NAVIGATION_TABLE, USER_NAVIGATION_SCHEMA)
    syncTable(USER_THEME_PRESETS_TABLE, USER_THEME_PRESETS_SCHEMA, {
      indexes: { idx_user_theme_presets_user: 'CREATE INDEX IF NOT EXISTS idx_user_theme_presets_user ON user_theme_presets(user_id)' },
    })

    syncTable(STT_PROVIDER_SETTINGS_TABLE, STT_PROVIDER_SETTINGS_SCHEMA, {
      indexes: STT_PROVIDER_SETTINGS_INDEXES,
    })
    syncTable(STT_USER_SETTINGS_TABLE, STT_USER_SETTINGS_SCHEMA)
    migrateLegacySttProviderSettingsUserIdDefault(db)
    syncTable(STT_PROFILE_PROVIDER_SETTINGS_TABLE, STT_PROFILE_PROVIDER_SETTINGS_SCHEMA, {
      indexes: STT_PROFILE_PROVIDER_SETTINGS_INDEXES,
    })
    syncTable(STT_PROFILE_SETTINGS_TABLE, STT_PROFILE_SETTINGS_SCHEMA)
    ensureProfileSettingsIndexes(
      db,
      STT_PROFILE_SETTINGS_TABLE,
      'idx_stt_profile_settings_profile',
      STT_PROFILE_PROVIDER_SETTINGS_TABLE,
      STT_PROFILE_PROVIDER_SETTINGS_INDEXES,
    )
    copyLegacyProviderSettingsToDefaultProfile(db, STT_PROVIDER_SETTINGS_TABLE, STT_PROFILE_PROVIDER_SETTINGS_TABLE)
    copyLegacyActiveSettingsToDefaultProfile(db, STT_USER_SETTINGS_TABLE, STT_PROFILE_SETTINGS_TABLE)
    syncTable(TTS_PROVIDER_SETTINGS_TABLE, TTS_PROVIDER_SETTINGS_SCHEMA, {
      indexes: TTS_PROVIDER_SETTINGS_INDEXES,
    })
    syncTable(TTS_USER_SETTINGS_TABLE, TTS_USER_SETTINGS_SCHEMA)
    syncTable(TTS_PROFILE_PROVIDER_SETTINGS_TABLE, TTS_PROFILE_PROVIDER_SETTINGS_SCHEMA, {
      indexes: TTS_PROFILE_PROVIDER_SETTINGS_INDEXES,
    })
    syncTable(TTS_PROFILE_SETTINGS_TABLE, TTS_PROFILE_SETTINGS_SCHEMA)
    ensureProfileSettingsIndexes(
      db,
      TTS_PROFILE_SETTINGS_TABLE,
      'idx_tts_profile_settings_profile',
      TTS_PROFILE_PROVIDER_SETTINGS_TABLE,
      TTS_PROFILE_PROVIDER_SETTINGS_INDEXES,
    )
    copyLegacyProviderSettingsToDefaultProfile(db, TTS_PROVIDER_SETTINGS_TABLE, TTS_PROFILE_PROVIDER_SETTINGS_TABLE)
    copyLegacyActiveSettingsToDefaultProfile(db, TTS_USER_SETTINGS_TABLE, TTS_PROFILE_SETTINGS_TABLE)

    // Group chat - basic tables
    syncTable(GC_ROOMS_TABLE, GC_ROOMS_SCHEMA)
    syncTable(GC_HANDOFF_CHAINS_TABLE, GC_HANDOFF_CHAINS_SCHEMA, { indexes: GC_HANDOFF_CHAINS_INDEXES })
    syncTable(GC_HANDOFF_ATTEMPTS_TABLE, GC_HANDOFF_ATTEMPTS_SCHEMA, { indexes: GC_HANDOFF_ATTEMPTS_INDEXES })
    // Migrate the legacy one-attempt-per-chain index to retained history plus
    // a single active attempt invariant. Rebuild the partial active index so
    // upgrades adopt newly fail-closed statuses such as outcome_unknown.
    db.exec('DROP INDEX IF EXISTS idx_gc_handoff_attempts_chain')
    db.exec('DROP INDEX IF EXISTS idx_gc_handoff_attempts_chain_active')
    createIndexes(db, GC_HANDOFF_ATTEMPTS_INDEXES)
    syncTable(GC_HANDOFF_OUTBOX_TABLE, GC_HANDOFF_OUTBOX_SCHEMA, { indexes: GC_HANDOFF_OUTBOX_INDEXES })
    syncTable(GC_HANDOFF_DELIVERIES_TABLE, GC_HANDOFF_DELIVERIES_SCHEMA, { indexes: GC_HANDOFF_DELIVERIES_INDEXES })
    syncTable(GC_HANDOFF_INBOX_TABLE, GC_HANDOFF_INBOX_SCHEMA, { indexes: GC_HANDOFF_INBOX_INDEXES })
    const groupChatMessageIndexes = {
      idx_gc_messages_history_page:
        "CREATE INDEX IF NOT EXISTS idx_gc_messages_history_page ON gc_messages(roomId, timestamp DESC, id DESC)",
      idx_gc_messages_context_window:
        "CREATE INDEX IF NOT EXISTS idx_gc_messages_context_window ON gc_messages(roomId, timestamp DESC, id DESC) WHERE COALESCE(tool_name, '') <> 'workspace_diff'",
    }
    syncTable(GC_MESSAGES_TABLE, GC_MESSAGES_SCHEMA, {
      indexes: groupChatMessageIndexes,
    })
    // syncTable() creates indexes for new tables only. Existing installations
    // need the context-window index migrated explicitly to avoid scanning and
    // sorting the full message table on every persisted message.
    createIndexes(db, groupChatMessageIndexes)
    syncTable(GC_MESSAGE_ROUTING_CONTEXTS_TABLE, GC_MESSAGE_ROUTING_CONTEXTS_SCHEMA)
    syncTable(GC_MESSAGE_ROUTING_DECISIONS_TABLE, GC_MESSAGE_ROUTING_DECISIONS_SCHEMA)
    syncTable(GC_MESSAGE_ROUTING_CLAIMS_TABLE, GC_MESSAGE_ROUTING_CLAIMS_SCHEMA)
    syncTable(GC_EXECUTION_QUEUE_TABLE, GC_EXECUTION_QUEUE_SCHEMA, {
      indexes: GC_EXECUTION_QUEUE_INDEXES,
    })
    syncTable(GC_ACTIVITY_MIGRATIONS_TABLE, GC_ACTIVITY_MIGRATIONS_SCHEMA)
    migrateGroupChatActivityTimes(db, Date.now())
    syncTable(GC_CONTEXT_SNAPSHOTS_TABLE, GC_CONTEXT_SNAPSHOTS_SCHEMA)
    syncTable(GC_ROOM_SUMMARIES_TABLE, GC_ROOM_SUMMARIES_SCHEMA)
    syncTable(GC_SUMMARY_REVIEWS_TABLE, GC_SUMMARY_REVIEWS_SCHEMA, { indexes: GC_SUMMARY_REVIEWS_INDEXES })
    syncTable(GC_PENDING_SESSION_DELETES_TABLE, GC_PENDING_SESSION_DELETES_SCHEMA)
    syncTable(GC_SESSION_PROFILES_TABLE, GC_SESSION_PROFILES_SCHEMA)

    // Group chat - single-column primary key tables (PRIMARY KEY in column definition)
    syncTable(GC_ROOM_AGENTS_TABLE, GC_ROOM_AGENTS_SCHEMA, {
      indexes: {
        idx_gc_room_agents_profile: 'CREATE INDEX idx_gc_room_agents_profile ON gc_room_agents(profile)',
      }
    })
    syncTable(GC_AGENT_PRESETS_TABLE, GC_AGENT_PRESETS_SCHEMA, {
      indexes: {
        idx_gc_agent_presets_owner_updated: 'CREATE INDEX idx_gc_agent_presets_owner_updated ON gc_agent_presets(ownerUserId, updatedAt DESC)',
        idx_gc_agent_presets_owner_name: 'CREATE UNIQUE INDEX idx_gc_agent_presets_owner_name ON gc_agent_presets(ownerUserId, name)',
      },
    })
    syncTable(GC_AGENT_PAIRING_REQUESTS_TABLE, GC_AGENT_PAIRING_REQUESTS_SCHEMA, {
      indexes: {
        idx_gc_agent_pairing_room_status: 'CREATE INDEX idx_gc_agent_pairing_room_status ON gc_agent_pairing_requests(roomId, status, createdAt)',
      },
    })
    syncTable(GC_AGENT_CONNECTORS_TABLE, GC_AGENT_CONNECTORS_SCHEMA, {
      indexes: {
        idx_gc_agent_connectors_room: 'CREATE INDEX idx_gc_agent_connectors_room ON gc_agent_connectors(roomId, status)',
        idx_gc_agent_connectors_agent: 'CREATE UNIQUE INDEX idx_gc_agent_connectors_agent ON gc_agent_connectors(roomId, agentId)',
      },
    })

    syncTable(GC_ROOM_MEMBERS_TABLE, GC_ROOM_MEMBERS_SCHEMA, {
      indexes: {
        idx_gc_room_members_user: 'CREATE INDEX idx_gc_room_members_user ON gc_room_members(userId)',
      },
    })
    migrateLegacyEkkoIdentifiers(db)
  } catch (e) {
    console.error('Error initializing Hermes SQLite tables:', e)
    console.error(`[Schema] Database initialization failed. Existing database was left untouched: ${getStoragePath()}`)
    throw e
  }
}
