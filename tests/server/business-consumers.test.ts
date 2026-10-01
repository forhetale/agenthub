import { beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ notifySessionPush: vi.fn(), enqueue: vi.fn(), chatCompletionText: vi.fn(() => 'final reply') }))
vi.mock('../../packages/server/src/modules/studio/public/notifications', () => ({
  notifySessionPush: doubles.notifySessionPush,
  chatCompletionText: doubles.chatCompletionText,
}))
vi.mock('../../packages/server/src/modules/studio/services/webhooks/dispatcher', () => ({
  getChatWebhookDispatcher: () => ({ enqueue: doubles.enqueue }),
}))

type Hub = typeof import('../../packages/server/src/modules/studio/services/webhooks/business-events')['businessEvents']

async function load() {
  vi.resetModules()
  const { businessEvents } = await import('../../packages/server/src/modules/studio/services/webhooks/business-events')
  const subscribe = vi.spyOn(businessEvents, 'subscribe')
  const { ensureBusinessConsumers } = await import('../../packages/server/src/modules/studio/services/webhooks/business-consumers')
  return { businessEvents, subscribe, ensureBusinessConsumers }
}

function publish(hub: Hub, type: string) {
  const chat = { id: 'e1', type, agent: 'codex', subject: { session_id: 's1' } } as any
  return hub.publish({ schema_version: 1, id: 'e1', type, occurred_at: new Date().toISOString(), profile: 'default',
    source: 'chat', subject: { session_id: 's1' }, payload: { preview: 'done' }, chat })
}

beforeEach(() => {
  vi.clearAllMocks()
  doubles.notifySessionPush.mockResolvedValue(1)
  doubles.enqueue.mockReturnValue(true)
})

describe('business event consumers', () => {
  it('registers the HTTP webhook and Bark session push consumers once', async () => {
    const { subscribe, ensureBusinessConsumers } = await load()
    ensureBusinessConsumers(); ensureBusinessConsumers()
    expect(subscribe.mock.calls.map(([name]) => name)).toEqual(['http-webhook', 'bark-session-push'])
  })

  it.each([
    ['chat.run.completed', 'run.completed'],
    ['chat.approval.requested', 'approval.requested'],
    ['chat.clarification.requested', 'clarify.requested'],
  ])('forwards %s to Bark session push as %s', async (type, event) => {
    const { businessEvents, ensureBusinessConsumers } = await load()
    ensureBusinessConsumers()
    expect(publish(businessEvents, type)).toBe(true)
    const details = event === 'run.completed' ? { completionText: expect.any(Function) } : {}
    expect(doubles.notifySessionPush).toHaveBeenCalledWith('s1', event, { preview: 'done' }, 'codex', details)
    // The reply is read lazily, only when a user opted into previews.
    expect(doubles.chatCompletionText).not.toHaveBeenCalled()
    if (event === 'run.completed') {
      expect(doubles.notifySessionPush.mock.calls[0][4].completionText()).toBe('final reply')
      expect(doubles.chatCompletionText).toHaveBeenCalledWith(expect.objectContaining({ type }))
    }
  })

  it('does not push other chat events to Bark', async () => {
    const { businessEvents, ensureBusinessConsumers } = await load()
    ensureBusinessConsumers()
    publish(businessEvents, 'chat.message.created')
    expect(doubles.enqueue).toHaveBeenCalledOnce()
    expect(doubles.notifySessionPush).not.toHaveBeenCalled()
  })
})
