import { randomUUID } from 'node:crypto'

export type HubAgentCapability = 'skills' | 'database' | 'memory' | 'logs'
export type HubAgentDiagnosticScope = 'global' | `profile:${string}`
export type HubAgentDiagnosticStatus = 'active' | 'resolved'

export interface HubAgentRecoveryPlan {
  tool: string
  summary: string
  steps: string[]
  automatic: boolean
  requiresConfirmation?: boolean
  source?: string
  target?: string
  schemaOwner?: string
  schema?: Record<string, string[]>
}

export interface HubAgentDiagnosticInput {
  component: HubAgentCapability
  scope?: HubAgentDiagnosticScope
  operation: string
  error: unknown
  effect: string
  recovery: HubAgentRecoveryPlan
  metadata?: Record<string, unknown>
}

export interface HubAgentDiagnosticIncident {
  incidentId: string
  revision: number
  component: HubAgentCapability
  scope: HubAgentDiagnosticScope
  operation: string
  code: string
  message: string
  effect: string
  recovery: HubAgentRecoveryPlan
  metadata?: Record<string, unknown>
  status: HubAgentDiagnosticStatus
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt?: string
  selfCheck?: HubAgentSelfCheckResult
}

export interface HubAgentSelfCheckResult {
  ok: boolean
  component: HubAgentCapability | 'all'
  checkedAt: string
  checks: Array<{
    name: string
    ok: boolean
    detail: string
  }>
  metadata?: Record<string, unknown>
}

export interface HubAgentDiagnosticsSnapshot {
  coreAvailable: true
  status: 'ok' | 'degraded'
  active: HubAgentDiagnosticIncident[]
  recent: HubAgentDiagnosticIncident[]
}

const MAX_DIAGNOSTIC_HISTORY = 100

/**
 * Process-local incident registry. It intentionally has no database or Skill
 * dependency, so diagnostics remain available when either optional capability
 * is broken.
 */
export class HubAgentDiagnosticsRegistry {
  private revision = 0
  private readonly active = new Map<string, HubAgentDiagnosticIncident>()
  private readonly history: HubAgentDiagnosticIncident[] = []

  report(input: HubAgentDiagnosticInput): HubAgentDiagnosticIncident {
    const now = new Date().toISOString()
    const scope = input.scope ?? 'global'
    const key = diagnosticKey(input.component, scope)
    const previous = this.active.get(key)
    const code = errorCode(input.error)
    const message = errorMessage(input.error)
    if (
      previous &&
      previous.operation === input.operation &&
      previous.code === code &&
      previous.message === message
    ) {
      previous.lastSeenAt = now
      return cloneIncident(previous)
    }
    if (previous) {
      previous.status = 'resolved'
      previous.resolvedAt = now
      this.pushHistory(previous)
    }
    const incident: HubAgentDiagnosticIncident = {
      incidentId: randomUUID(),
      revision: ++this.revision,
      component: input.component,
      scope,
      operation: input.operation,
      code,
      message,
      effect: input.effect,
      recovery: structuredClone(input.recovery),
      ...(input.metadata ? { metadata: structuredClone(input.metadata) } : {}),
      status: 'active',
      firstSeenAt: now,
      lastSeenAt: now,
    }
    this.active.set(key, incident)
    return cloneIncident(incident)
  }

  resolve(
    component: HubAgentCapability,
    scope: HubAgentDiagnosticScope,
    selfCheck: HubAgentSelfCheckResult,
    incidentId?: string,
  ): boolean {
    if (!selfCheck.ok) return false
    const key = diagnosticKey(component, scope)
    const incident = this.active.get(key)
    if (!incident || (incidentId && incident.incidentId !== incidentId)) return false
    incident.status = 'resolved'
    incident.resolvedAt = selfCheck.checkedAt
    incident.selfCheck = structuredClone(selfCheck)
    this.active.delete(key)
    this.pushHistory(incident)
    return true
  }

  get(component: HubAgentCapability, scope: HubAgentDiagnosticScope = 'global'):
    HubAgentDiagnosticIncident | undefined {
    const incident = this.active.get(diagnosticKey(component, scope))
    return incident ? cloneIncident(incident) : undefined
  }

  snapshot(): HubAgentDiagnosticsSnapshot {
    const active = [...this.active.values()]
      .sort((left, right) => left.revision - right.revision)
      .map(cloneIncident)
    return {
      coreAvailable: true,
      status: active.length ? 'degraded' : 'ok',
      active,
      recent: this.history.slice(-20).reverse().map(cloneIncident),
    }
  }

  temporaryContext(profile = 'default'): string | undefined {
    const scope = profileScope(profile)
    const incidents = [...this.active.values()]
      .filter(incident => incident.scope === 'global' || incident.scope === scope)
      .sort((left, right) => left.revision - right.revision)
    if (!incidents.length) return undefined
    const lines = [
      'Hub Agent Core is available, but optional capabilities are degraded.',
      'This is ephemeral host diagnostics, not remembered conversation content.',
      'Do not invent paths or SQL. Use the named built-in recovery tools and trust only their self-check results.',
      'Active automatic incidents are mandatory maintenance: repair them before answering unrelated requests, and do not ask the user whether to run a safe retry.',
      'Never interpret an ephemeral or degraded memory result as proof that the durable memory store is empty.',
    ]
    for (const incident of incidents) {
      lines.push(
        `- incident=${incident.incidentId} revision=${incident.revision} component=${incident.component} scope=${incident.scope}`,
        `  operation=${incident.operation} code=${incident.code} error=${incident.message}`,
        `  effect=${incident.effect}`,
        `  recoveryTool=${incident.recovery.tool} automatic=${incident.recovery.automatic}`,
        `  recovery=${incident.recovery.summary}`,
      )
      if (incident.recovery.source) lines.push(`  source=${incident.recovery.source}`)
      if (incident.recovery.target) lines.push(`  target=${incident.recovery.target}`)
      if (incident.recovery.schemaOwner) lines.push(`  schemaOwner=${incident.recovery.schemaOwner}`)
      for (const [table, fields] of Object.entries(incident.recovery.schema ?? {})) {
        lines.push(`  schemaTable=${table} fields=${fields.join(',')}`)
      }
      for (const step of incident.recovery.steps) lines.push(`  step=${step}`)
    }
    return lines.join('\n')
  }

  private pushHistory(incident: HubAgentDiagnosticIncident): void {
    this.history.push(cloneIncident(incident))
    if (this.history.length > MAX_DIAGNOSTIC_HISTORY) {
      this.history.splice(0, this.history.length - MAX_DIAGNOSTIC_HISTORY)
    }
  }
}

export function profileScope(profile: string): HubAgentDiagnosticScope {
  return `profile:${String(profile || '').trim() || 'default'}`
}

function diagnosticKey(component: HubAgentCapability, scope: HubAgentDiagnosticScope): string {
  return `${component}\0${scope}`
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return error instanceof Error && error.name ? error.name : 'UNKNOWN'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function cloneIncident(incident: HubAgentDiagnosticIncident): HubAgentDiagnosticIncident {
  return structuredClone(incident)
}
