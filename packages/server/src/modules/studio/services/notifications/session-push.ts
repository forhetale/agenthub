import { logger } from '../../public/logging'
import { getSession, type HermesSessionRow } from '../../repositories/session-store'
import { barkService } from './bark'
import { normalizeNotificationLocale, type NotificationLocale } from './locale'
import { notificationPreview } from './notification-preview'

export type SessionPushEvent = 'run.completed' | 'approval.requested' | 'clarify.requested'
export type SessionPushAgent = 'bridge' | 'ekko' | 'claude-code' | 'codex' | 'pi' | 'grok' | 'opencode' | 'dsh' | 'cursor'

export interface SessionPushDetails {
  /** Final reply text of a completed run; read only when the user enabled content previews. */
  completionText?: () => string
}

interface SessionPushDependencies {
  readSession: (sessionId: string) => HermesSessionRow | null
  barkReady: (userId: number) => boolean
  sendBark: (userId: number, content: string, shouldSend: () => boolean, title?: string) => Promise<unknown>
  readLocale: (userId: number) => NotificationLocale
  readContentPreview: (userId: number) => boolean
  now: () => number
}

/** Chats a user starts follow their Bark preference; sessions the system creates stay quiet. */
export function defaultSessionPushEnabled(userId: unknown): boolean {
  const id = Number(userId)
  if (!Number.isSafeInteger(id) || id <= 0) return false
  try {
    return barkService.read(id)?.defaultSessionPush !== false
  } catch {
    return true
  }
}

const SUPPORTED_EVENTS = new Set<SessionPushEvent>([
  'run.completed',
  'approval.requested',
  'clarify.requested',
])
const DEDUPE_TTL_MS = 10 * 60 * 1000
const MAX_PREVIEW_LENGTH = 1_200

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  bridge: 'Hermes',
  hermes: 'Hermes',
  ekko: 'Ekko',
  'ekko-agent': 'Ekko',
  claude: 'Claude',
  'claude-code': 'Claude',
  codex: 'Codex',
  pi: 'Pi',
  grok: 'Grok',
  opencode: 'OpenCode',
  cursor: 'Cursor',
}

const SESSION_PUSH_MESSAGES: Record<NotificationLocale, Record<SessionPushEvent, string>> = {
  zh: {
    'run.completed': '{agent} 有一条已完成消息，请到 TATin Studio 查看',
    'approval.requested': '{agent} 有一条待授权消息，请到 TATin Studio 授权',
    'clarify.requested': '{agent} 有一条待回答消息，请到 TATin Studio 回答',
  },
  'zh-TW': {
    'run.completed': '{agent} 有一則已完成訊息，請到 TATin Studio 查看',
    'approval.requested': '{agent} 有一則待授權訊息，請到 TATin Studio 授權',
    'clarify.requested': '{agent} 有一則待回答訊息，請到 TATin Studio 回答',
  },
  en: {
    'run.completed': '{agent} has a completed message. Open TATin Studio to view it.',
    'approval.requested': '{agent} has a message awaiting authorization. Open TATin Studio to authorize it.',
    'clarify.requested': '{agent} has a message awaiting your response. Open TATin Studio to answer it.',
  },
  ja: {
    'run.completed': '{agent} から完了済みのメッセージがあります。TATin Studio で確認してください。',
    'approval.requested': '{agent} から承認待ちのメッセージがあります。TATin Studio で承認してください。',
    'clarify.requested': '{agent} から回答待ちのメッセージがあります。TATin Studio で回答してください。',
  },
  ko: {
    'run.completed': '{agent}에 완료된 메시지가 있습니다. TATin Studio에서 확인해 주세요.',
    'approval.requested': '{agent}에 승인 대기 중인 메시지가 있습니다. TATin Studio에서 승인해 주세요.',
    'clarify.requested': '{agent}에 답변 대기 중인 메시지가 있습니다. TATin Studio에서 답변해 주세요.',
  },
  fr: {
    'run.completed': '{agent} a un message terminé. Consultez-le dans TATin Studio.',
    'approval.requested': '{agent} a un message en attente d’autorisation. Ouvrez TATin Studio pour l’autoriser.',
    'clarify.requested': '{agent} a un message en attente de réponse. Ouvrez TATin Studio pour y répondre.',
  },
  es: {
    'run.completed': '{agent} tiene un mensaje completado. Ábrelo en TATin Studio.',
    'approval.requested': '{agent} tiene un mensaje pendiente de autorización. Abre TATin Studio para autorizarlo.',
    'clarify.requested': '{agent} tiene un mensaje pendiente de respuesta. Abre TATin Studio para responderlo.',
  },
  de: {
    'run.completed': '{agent} hat eine abgeschlossene Nachricht. Öffne TATin Studio, um sie anzusehen.',
    'approval.requested': '{agent} hat eine Nachricht, die auf Freigabe wartet. Öffne TATin Studio, um sie freizugeben.',
    'clarify.requested': '{agent} hat eine Nachricht, die auf deine Antwort wartet. Öffne TATin Studio, um zu antworten.',
  },
  pt: {
    'run.completed': '{agent} tem uma mensagem concluída. Abra o TATin Studio para visualizá-la.',
    'approval.requested': '{agent} tem uma mensagem aguardando autorização. Abra o TATin Studio para autorizá-la.',
    'clarify.requested': '{agent} tem uma mensagem aguardando resposta. Abra o TATin Studio para respondê-la.',
  },
  ru: {
    'run.completed': 'У {agent} есть завершённое сообщение. Откройте TATin Studio, чтобы посмотреть его.',
    'approval.requested': 'У {agent} есть сообщение, ожидающее разрешения. Откройте TATin Studio, чтобы разрешить его.',
    'clarify.requested': 'У {agent} есть сообщение, ожидающее ответа. Откройте TATin Studio, чтобы ответить.',
  },
  ar: {
    'run.completed': 'لدى {agent} رسالة مكتملة. افتح TATin Studio لعرضها.',
    'approval.requested': 'لدى {agent} رسالة بانتظار التفويض. افتح TATin Studio لتفويضها.',
    'clarify.requested': 'لدى {agent} رسالة بانتظار الإجابة. افتح TATin Studio للإجابة عنها.',
  },
}


function isSessionPushEvent(event: string): event is SessionPushEvent {
  return SUPPORTED_EVENTS.has(event as SessionPushEvent)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function preview(value: unknown): string {
  const normalized = text(value).replace(/\n{3,}/g, '\n\n')
  if (normalized.length <= MAX_PREVIEW_LENGTH) return normalized
  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
}

export function formatSessionPushContent(
  agent: SessionPushAgent | string | undefined,
  event: SessionPushEvent,
  locale: unknown,
): string {
  const agentName = AGENT_DISPLAY_NAMES[text(agent)] || 'Hermes'
  const message = SESSION_PUSH_MESSAGES[normalizeNotificationLocale(locale)][event]
  return message.replace('{agent}', agentName)
}

function eventIdentity(event: SessionPushEvent, payload: Record<string, unknown>): string {
  const id = text(payload.approval_id)
    || text(payload.clarify_id)
    || text(payload.run_id)
    || text(payload.response_id)
    || text(payload.message_id)
    || text(payload.queue_id)
  if (id) return id
  return preview(payload.question || payload.command || payload.description || payload.output || event)
}

export class SessionPushNotifier {
  private readonly recent = new Map<string, number>()
  private readonly dependencies: SessionPushDependencies

  constructor(dependencies: Partial<SessionPushDependencies> = {}) {
    this.dependencies = {
      readSession: getSession,
      barkReady: userId => barkService.ready(userId),
      sendBark: (userId, content, shouldSend, title) => barkService.send(userId, content, shouldSend, title),
      readLocale: userId => normalizeNotificationLocale(barkService.read(userId)?.locale),
      readContentPreview: userId => barkService.read(userId)?.contentPreview === true,
      now: Date.now,
      ...dependencies,
    }
  }

  async notify(
    sessionId: string,
    event: string,
    rawPayload: unknown,
    agent?: SessionPushAgent,
    details: SessionPushDetails = {},
  ): Promise<number> {
    if (!isSessionPushEvent(event)) return 0
    const payload = rawPayload && typeof rawPayload === 'object'
      ? rawPayload as Record<string, unknown>
      : {}
    if (event === 'run.completed' && payload.interrupted === true) return 0

    const session = this.dependencies.readSession(sessionId)
    const userId = Number(session?.user_id)
    if (!session || session.push_enabled !== 1 || !Number.isSafeInteger(userId) || userId <= 0) return 0
    if (!this.dependencies.barkReady(userId)) return 0

    const now = this.dependencies.now()
    for (const [key, seenAt] of this.recent) {
      if (now - seenAt > DEDUPE_TTL_MS) this.recent.delete(key)
    }
    const dedupeKey = `${sessionId}:${event}:${eventIdentity(event, payload)}`
    if (this.recent.has(dedupeKey)) return 0
    this.recent.set(dedupeKey, now)

    try {
      let content = formatSessionPushContent(agent || session.agent, event, this.dependencies.readLocale(userId))
      let title: string | undefined
      if (this.dependencies.readContentPreview(userId)) {
        // Only the session title and the run's final reply; approvals and questions keep status text.
        const completion = event === 'run.completed'
        const previewed = notificationPreview({ title: session.title, content: completion ? this.completionText(details) : '' }, completion)
        if (previewed.title) title = previewed.title
        if (previewed.body) content = previewed.body
      }
      const latest = this.dependencies.readSession(sessionId)
      if (!latest || latest.push_enabled !== 1 || Number(latest.user_id) !== userId) {
        this.recent.delete(dedupeKey)
        return 0
      }
      await this.dependencies.sendBark(userId, content, () => {
        const current = this.dependencies.readSession(sessionId)
        return current?.push_enabled === 1 && Number(current.user_id) === userId
      }, title)
      return 1
    } catch {
      this.recent.delete(dedupeKey)
      // Transport errors can contain credentials; log identifiers only.
      logger.warn({ sessionId, userId, event }, '[session-push] failed to send Bark notification')
      return 0
    }
  }

  private completionText(details: SessionPushDetails): string {
    try {
      return details.completionText?.() || ''
    } catch {
      return ''
    }
  }
}

const singleton = new SessionPushNotifier()

export async function notifySessionPush(
  sessionId: string,
  event: string,
  payload: unknown,
  agent?: SessionPushAgent,
  details?: SessionPushDetails,
): Promise<number> {
  return singleton.notify(sessionId, event, payload, agent, details)
}
