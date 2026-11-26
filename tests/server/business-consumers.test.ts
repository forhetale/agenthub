import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BarkService } from '../../packages/server/src/modules/studio/services/notifications/bark'
import { SessionPushNotifier } from '../../packages/server/src/modules/studio/services/notifications/session-push'

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

  it.each([
    ['person.run.completed', 'run.completed'],
    ['person.approval.requested', 'approval.requested'],
    ['person.clarification.requested', 'clarify.requested'],
  ])('forwards %s to Bark session push as %s without chat webhook delivery', async (type, event) => {
    const { businessEvents, ensureBusinessConsumers } = await load()
    ensureBusinessConsumers()
    const accepted = businessEvents.publish({
      schema_version: 1,
      id: 'ep-1',
      type,
      occurred_at: new Date().toISOString(),
      profile: 'default',
      source: 'person',
      subject: { session_id: 'person-main-1' },
      payload: { preview: 'done' },
    })
    expect(accepted).toBe(false)
    const details = event === 'run.completed' ? { completionText: expect.any(Function) } : {}
    expect(doubles.notifySessionPush).toHaveBeenCalledWith('person-main-1', event, { preview: 'done' }, undefined, details)
    expect(doubles.enqueue).not.toHaveBeenCalled()
    expect(doubles.chatCompletionText).not.toHaveBeenCalled()
    if (event === 'run.completed') {
      expect(doubles.notifySessionPush.mock.calls[0][4].completionText()).toBe('final reply')
      expect(doubles.chatCompletionText).toHaveBeenCalledWith(expect.objectContaining({ type }))
    }
  })
})

describe('person session push preferences & delivery', () => {
  it('respects per-user defaultSessionPush, contentPreview, and per-session push_enabled toggle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-person-push-'))
    const transport = vi.fn().mockResolvedValue(undefined)
    try {
      const bark = new BarkService(dir, transport)
      bark.save(1, { deviceKey: 'device_key_12345', locale: 'zh' })
      expect(bark.get(1).defaultSessionPush).toBe(true)

      bark.save(1, { defaultSessionPush: false })
      expect(bark.get(1).defaultSessionPush).toBe(false)

      bark.save(1, { defaultSessionPush: true, contentPreview: false })
      expect(bark.get(1).defaultSessionPush).toBe(true)
      expect(bark.get(1).contentPreview).toBe(false)

      let sessionPushEnabled = 0
      const notifier = new SessionPushNotifier({
        readSession: () => ({
          id: 'person-main-1',
          user_id: '1',
          agent: 'hub-agent',
          push_enabled: sessionPushEnabled,
          title: '折折助手',
          preview: '',
        } as any),
        barkReady: (userId) => bark.ready(userId),
        readLocale: (userId) => bark.read(userId)?.locale || 'zh',
        readContentPreview: (userId) => Boolean(bark.read(userId)?.contentPreview),
        sendBark: (userId, content, shouldSend, title) => bark.send(userId, content, shouldSend, title),
      })

      // Per-session push_enabled=0 suppresses notifications even when Bark is ready.
      await expect(notifier.notify('person-main-1', 'run.completed', { run_id: 'r1' })).resolves.toBe(0)
      expect(transport).not.toHaveBeenCalled()

      // Per-session push_enabled=1 delivers Hub Agent status text when agent arg is omitted.
      sessionPushEnabled = 1
      const completionText = vi.fn(() => '## Done\nAll **tasks** succeeded.')
      await expect(
        notifier.notify('person-main-1', 'run.completed', { run_id: 'r2' }, undefined, { completionText }),
      ).resolves.toBe(1)
      expect(completionText).not.toHaveBeenCalled()
      expect(transport).toHaveBeenCalledTimes(1)
      expect(transport.mock.calls[0][1]).toBe('Hub Agent 有一条已完成消息，请到 AgentHub 查看')
      expect(transport.mock.calls[0][2]).toBeUndefined()

      // Enabling contentPreview sends the plain completion summary titled with the Person session name.
      bark.save(1, { contentPreview: true })
      await expect(
        notifier.notify('person-main-1', 'run.completed', { run_id: 'r3' }, undefined, { completionText }),
      ).resolves.toBe(1)
      expect(completionText).toHaveBeenCalledTimes(1)
      expect(transport).toHaveBeenCalledTimes(2)
      expect(transport.mock.calls[1][1]).toBe('Done All tasks succeeded.')
      expect(transport.mock.calls[1][2]).toBe('折折助手')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
