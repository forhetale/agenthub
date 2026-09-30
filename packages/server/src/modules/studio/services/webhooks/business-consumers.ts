import { businessEvents } from './business-events'
import { getChatWebhookDispatcher } from './dispatcher'
import { notifySessionPush } from '../../public/notifications'

const SESSION_PUSH_EVENTS = new Set(['chat.run.completed', 'chat.approval.requested', 'chat.clarification.requested'])
let initialized = false
export function ensureBusinessConsumers(): void {
  if (initialized) return
  initialized = true
  businessEvents.subscribe('http-webhook', event => event.chat ? getChatWebhookDispatcher().enqueue(event.chat) : false)
  businessEvents.subscribe('bark-session-push', event => {
    if (!event.chat || !SESSION_PUSH_EVENTS.has(event.type)) return
    const original = event.type === 'chat.clarification.requested' ? 'clarify.requested' : event.type.slice(5)
    return notifySessionPush(event.subject.session_id!, original, event.payload, event.chat.agent)
  })
}
