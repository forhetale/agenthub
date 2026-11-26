import type { AgentClarificationRequest } from '../../../../../hub-agent/src'

export type HubAgentClarificationResolutionReason =
  | 'response'
  | 'timeout'
  | 'aborted'
  | 'cancelled'
  | 'unavailable'

export interface HubAgentClarificationResolution {
  response: string
  reason: HubAgentClarificationResolutionReason
}

interface PendingHubAgentClarification {
  request: AgentClarificationRequest
  requestedAt: number
  sessionId: string
  runId: string
  resolve: (response: string) => void
  timer: NodeJS.Timeout
  signal?: AbortSignal
  onAbort?: () => void
  onResolved?: (resolution: HubAgentClarificationResolution) => void
}

export interface WaitForHubAgentClarificationOptions {
  sessionId: string
  runId?: string
  signal?: AbortSignal
  onRequested: (request: AgentClarificationRequest) => void
  onResolved?: (resolution: HubAgentClarificationResolution) => void
}

export interface HubAgentClarificationResponse {
  handled: boolean
  resolved: boolean
}

const pendingClarifications = new Map<string, PendingHubAgentClarification>()

export function waitForHubAgentClarification(
  request: AgentClarificationRequest,
  options: WaitForHubAgentClarificationOptions,
): Promise<string> {
  if (options.signal?.aborted) {
    return Promise.resolve('[clarification cancelled because the run was aborted]')
  }
  if (
    pendingClarifications.has(request.clarifyId) ||
    [...pendingClarifications.values()].some(pending => pending.sessionId === options.sessionId)
  ) {
    return Promise.resolve('[another clarification is already pending for this session]')
  }

  return new Promise((resolve) => {
    const finish = (resolution: HubAgentClarificationResolution) => {
      const pending = pendingClarifications.get(request.clarifyId)
      if (!pending) return
      pendingClarifications.delete(request.clarifyId)
      clearTimeout(pending.timer)
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener('abort', pending.onAbort)
      }
      pending.onResolved?.(resolution)
      pending.resolve(resolution.response)
    }
    const timer = setTimeout(() => finish({
      response: '[user did not respond within 5m]',
      reason: 'timeout',
    }), request.timeoutMs)
    timer.unref?.()
    const onAbort = () => finish({
      response: '[clarification cancelled because the run was aborted]',
      reason: 'aborted',
    })
    pendingClarifications.set(request.clarifyId, {
      sessionId: options.sessionId,
      request: { ...request, choices: request.choices ? [...request.choices] : undefined },
      requestedAt: Date.now(),
      runId: String(options.runId || ''),
      resolve,
      timer,
      signal: options.signal,
      onAbort,
      onResolved: options.onResolved,
    })
    options.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      options.onRequested(request)
    } catch {
      finish({
        response: '[clarification could not be shown to the user]',
        reason: 'unavailable',
      })
    }
  })
}

/** Read the live broker slots independently of the bounded chat event history. */
export function pendingHubAgentClarificationEvents(sessionId: string) {
  return [...pendingClarifications.values()].filter(pending => pending.sessionId === sessionId).map(pending => ({
    event: 'clarify.requested',
    data: {
      event: 'clarify.requested', session_id: sessionId, run_id: pending.runId,
      clarify_id: pending.request.clarifyId, question: pending.request.question,
      choices: pending.request.choices ? [...pending.request.choices] : null,
      timeout_ms: pending.request.timeoutMs, requested_at: pending.requestedAt,
    },
  }))
}

export function respondToHubAgentClarification(
  sessionId: string,
  clarifyId: string,
  response: unknown,
): HubAgentClarificationResponse {
  const pending = pendingClarifications.get(clarifyId)
  if (!pending) return { handled: false, resolved: false }
  if (pending.sessionId !== sessionId) return { handled: true, resolved: false }

  pendingClarifications.delete(clarifyId)
  clearTimeout(pending.timer)
  if (pending.signal && pending.onAbort) {
    pending.signal.removeEventListener('abort', pending.onAbort)
  }
  const normalizedResponse = typeof response === 'string' ? response : String(response ?? '')
  pending.onResolved?.({
    response: normalizedResponse,
    reason: 'response',
  })
  pending.resolve(normalizedResponse)
  return { handled: true, resolved: true }
}

export function cancelPendingHubAgentClarification(
  sessionId: string,
  clarifyId: string,
  runId: string,
): HubAgentClarificationResponse {
  const pending = pendingClarifications.get(clarifyId)
  if (!pending) return { handled: false, resolved: false }
  if (
    pending.sessionId !== sessionId
    || !runId
    || pending.runId !== runId
  ) {
    return { handled: true, resolved: false }
  }

  pendingClarifications.delete(clarifyId)
  clearTimeout(pending.timer)
  if (pending.signal && pending.onAbort) {
    pending.signal.removeEventListener('abort', pending.onAbort)
  }
  const resolution: HubAgentClarificationResolution = {
    response: '[clarification cancelled because the run was aborted]',
    reason: 'aborted',
  }
  pending.onResolved?.(resolution)
  pending.resolve(resolution.response)
  return { handled: true, resolved: true }
}

export function cancelPendingHubAgentClarifications(sessionId?: string): number {
  const targets = [...pendingClarifications.entries()]
    .filter(([, pending]) => !sessionId || pending.sessionId === sessionId)
  for (const [clarifyId, pending] of targets) {
    pendingClarifications.delete(clarifyId)
    clearTimeout(pending.timer)
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    const resolution: HubAgentClarificationResolution = {
      response: '[clarification cancelled because the runtime is shutting down]',
      reason: 'cancelled',
    }
    pending.onResolved?.(resolution)
    pending.resolve(resolution.response)
  }
  return targets.length
}
