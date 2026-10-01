import { describe, expect, it, vi } from 'vitest'
import {
  formatSessionPushContent,
  SessionPushNotifier,
} from '../../packages/server/src/modules/studio/services/notifications/session-push'

describe('session push notifications', () => {
  it('delivers a completed run through Bark for push-enabled sessions', async () => {
    const sendBark = vi.fn().mockResolvedValue({})
    const notifier = new SessionPushNotifier({
      readSession: () => ({
        id: 'session-1',
        user_id: '7',
        push_enabled: 1,
        title: 'One target',
        preview: '',
      } as any),
      barkReady: () => true,
      readLocale: () => 'zh',
      sendBark,
      now: () => 1_000,
    })

    await expect(notifier.notify('session-1', 'run.completed', {
      run_id: 'run-1',
      output: 'Done',
    }, 'codex')).resolves.toBe(1)

    expect(sendBark).toHaveBeenCalledTimes(1)
    expect(sendBark.mock.calls[0][0]).toBe(7)
    expect(sendBark.mock.calls[0][1]).toBe('Codex 有一条已完成消息，请到 TATin Studio 查看')
  })

  it('formats privacy-safe status messages for the interacting agent', () => {
    expect(formatSessionPushContent('bridge', 'run.completed', 'zh')).toBe(
      'Hermes 有一条已完成消息，请到 TATin Studio 查看',
    )
    expect(formatSessionPushContent('ekko', 'approval.requested', 'zh')).toBe(
      'Ekko 有一条待授权消息，请到 TATin Studio 授权',
    )
    expect(formatSessionPushContent('claude-code', 'clarify.requested', 'zh')).toBe(
      'Claude 有一条待回答消息，请到 TATin Studio 回答',
    )
    expect(formatSessionPushContent('codex', 'run.completed', 'en')).toBe(
      'Codex has a completed message. Open TATin Studio to view it.',
    )
    expect(formatSessionPushContent('cursor', 'run.completed', 'zh')).toBe(
      'Cursor 有一条已完成消息，请到 TATin Studio 查看',
    )
  })

  it('falls back to Simplified Chinese for unknown notification locales', () => {
    expect(formatSessionPushContent('codex', 'run.completed', 'klingon')).toBe(
      'Codex 有一条已完成消息，请到 TATin Studio 查看',
    )
  })

  it('does not send when Bark is not configured', async () => {
    const sendBark = vi.fn()
    const notifier = new SessionPushNotifier({
      readSession: () => ({
        id: 'session-1',
        user_id: '7',
        push_enabled: 1,
        title: 'No Bark',
        preview: '',
      } as any),
      barkReady: () => false,
      sendBark,
    })

    await expect(notifier.notify('session-1', 'run.completed', { run_id: 'run-2' })).resolves.toBe(0)
    expect(sendBark).not.toHaveBeenCalled()
  })

  it('releases failed dedupe entries so a retry can still notify', async () => {
    const sendBark = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({})
    const notifier = new SessionPushNotifier({
      readSession: () => ({
        id: 'session-1',
        user_id: '7',
        push_enabled: 1,
        title: 'Retry',
        preview: '',
      } as any),
      barkReady: () => true,
      readLocale: () => 'zh',
      sendBark,
    })

    await expect(notifier.notify('session-1', 'run.completed', { run_id: 'run-3' })).resolves.toBe(0)
    await expect(notifier.notify('session-1', 'run.completed', { run_id: 'run-3' })).resolves.toBe(1)
    expect(sendBark).toHaveBeenCalledTimes(2)
  })
})
