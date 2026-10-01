import { randomUUID } from 'node:crypto'
import { businessEvents, type BusinessEvent } from './business-events'
import { ensureBusinessConsumers } from './business-consumers'

export function stateEvent(type: string, profile: string, subject: BusinessEvent['subject'], payload: BusinessEvent['payload']): BusinessEvent {
  return { schema_version: 1, id: randomUUID(), type, profile, subject, payload,
    source: subject.room_id ? 'group_chat' : subject.workflow_id ? 'workflow' : 'chat', occurred_at: new Date().toISOString() }
}
/** State updates share the notification event stream, without completion alerts. */
export function publishAppState(event: BusinessEvent): void {
  ensureBusinessConsumers()
  businessEvents.publish({ ...event, chat: {
    id: event.id, type: event.type as 'chat.run.updated' | 'group.run.updated' | 'workflow.run.updated',
    occurred_at: event.occurred_at, profile: event.profile, source: event.source as 'chat' | 'group_chat' | 'workflow',
    subject: event.subject, summary: { status: 'updated' }, state: event.payload.state as Record<string, unknown>,
  } })
}
