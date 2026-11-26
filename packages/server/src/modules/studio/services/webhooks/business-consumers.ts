import { chatCompletionText, notifySessionPush, type SessionPushEvent } from '../../public/notifications'
import { businessEvents } from './business-events'
import { getChatWebhookDispatcher } from './dispatcher'

const BARK_SESSION_EVENTS: Record<string, SessionPushEvent> = {
  'chat.run.completed': 'run.completed',
  'chat.approval.requested': 'approval.requested',
  'chat.clarification.requested': 'clarify.requested',
  'person.run.completed': 'run.completed',
  'person.approval.requested': 'approval.requested',
  'person.clarification.requested': 'clarify.requested',
}

let initialized = false
export function ensureBusinessConsumers(): void {
  if (initialized) return
  initialized = true
  businessEvents.subscribe('http-webhook', event => event.chat ? getChatWebhookDispatcher().enqueue(event.chat) : false)
  businessEvents.subscribe('bark-session-push', event => {
    const mapped = BARK_SESSION_EVENTS[event.type]
    const sessionId = event.chat?.subject.session_id || event.subject.session_id
    if (!mapped || !sessionId) return false
    return notifySessionPush(
      sessionId,
      mapped,
      event.payload,
      event.chat?.agent,
      mapped === 'run.completed' ? { completionText: () => chatCompletionText(event) } : {},
    )
  })
}
