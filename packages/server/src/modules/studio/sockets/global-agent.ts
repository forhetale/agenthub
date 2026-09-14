import { randomBytes } from 'crypto'
import type { Server, Socket } from 'socket.io'
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client'
import { logger } from '../public/logging'
import { authenticateUserToken, type AuthenticatedUser } from '../public/auth'
import { userCanAccessProfile } from '../public/users'
import { config } from '../public/config'
import type {
  RelayHttpRequest,
  RelayHttpResponse,
  RelaySocketCloseRequest,
  RelaySocketEventRequest,
  RelaySocketOpenRequest,
  RelaySocketResponse,
} from '../contracts/relay-protocol'

const GLOBAL_AGENT_NAMESPACE = '/global-agent'
const DEFAULT_GLOBAL_AGENT_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const MAX_REQUEST_TIMEOUT_MS = 120_000
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024
const MAX_RESPONSE_BODY_BYTES = 10 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
const ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'x-hermes-profile',
  'x-request-id',
])
const TEXTUAL_RESPONSE_TYPES = [
  'application/json',
  'application/problem+json',
  'application/x-ndjson',
  'application/javascript',
  'application/xml',
  'application/x-www-form-urlencoded',
  'text/',
]
const ALLOWED_SOCKET_NAMESPACES = new Set(['/chat-run'])
const ALLOWED_CHAT_RUN_CLIENT_EVENTS = new Set([
  'run',
  'resume',
  'abort',
  'cancel_queued_run',
  'insert_queued_run',
  'approval.respond',
  'clarify.respond',
])
const CHAT_RUN_SERVER_EVENTS = [
  'run.started',
  'message.delta',
  'message.interim',
  'reasoning.delta',
  'thinking.delta',
  'reasoning.available',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'workspace.diff.completed',
  'run.completed',
  'run.failed',
  'compression.started',
  'compression.completed',
  'abort.started',
  'abort.timeout',
  'abort.completed',
  'usage.updated',
  'agent.event',
  'subagent.event',
  'session.command',
  'session.title.updated',
  'run.queued',
  'run.queue_insertion.updated',
  'approval.requested',
  'approval.resolved',
  'clarify.requested',
  'clarify.resolved',
  'peer.user.message',
  'resumed',
]
const NON_STREAMING_SUPPRESSED_EVENTS = new Set([
  'message.delta',
  'message.interim',
  'reasoning.delta',
  'thinking.delta',
  'reasoning.available',
])
const SOCKET_IO_RESERVED_EVENTS = new Set([
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'newListener',
  'removeListener',
])

interface GlobalAgentRequestOptions {
  clientId?: string
  timeoutMs?: number
}

interface StartGlobalAgentServerOptions {
  localBaseUrl?: string
  fetchImpl?: typeof fetch
}

interface LocalSocketBridge {
  id: string
  ownerSocketId: string
  namespace: string
  socket: ClientSocket
  stream: boolean
  output: string
  reasoning: string
}

interface NormalizedBody {
  body?: BodyInit
  contentType?: string
  byteLength: number
}

function timeoutMs(value?: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : DEFAULT_GLOBAL_AGENT_TIMEOUT_MS
}

function requestTimeoutMs(value?: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REQUEST_TIMEOUT_MS
  return Math.min(Math.floor(parsed), MAX_REQUEST_TIMEOUT_MS)
}

function responseError<T extends { id?: string; ok?: boolean; error?: { code: string; message: string } }>(
  id: string | undefined,
  code: string,
  message: string,
): T {
  return {
    id,
    ok: false,
    error: { code, message },
  } as T
}

function relayError(id: string | undefined, code: string, message: string, status?: number): RelayHttpResponse {
  return {
    id,
    ...(status ? { status } : {}),
    error: { code, message },
  }
}

function socketRelayError(id: string | undefined, code: string, message: string): RelaySocketResponse {
  return {
    id,
    ok: false,
    error: { code, message },
  }
}

function requestedAgentRole(auth: Record<string, unknown>): boolean {
  const role = String(auth.role || '').trim()
  return role === 'hermes-studio' || role === 'agent'
}

function isRelayHttpResponse(value: NormalizedBody | RelayHttpResponse): value is RelayHttpResponse {
  return 'error' in value
}

function normalizeMethod(method?: string): string | null {
  const normalized = String(method || 'GET').trim().toUpperCase()
  return ALLOWED_METHODS.has(normalized) ? normalized : null
}

function normalizeRelayPath(path?: string): string | null {
  const raw = String(path || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null

  const parsed = new URL(raw, 'http://hermes-relay.local')
  const normalized = `${parsed.pathname}${parsed.search}`
  if (parsed.pathname === '/v1' || parsed.pathname.startsWith('/v1/')) return null
  return normalized
}

function normalizeSocketBridgeId(id?: string): string | null {
  const normalized = String(id || '').trim()
  if (!normalized || normalized.length > 128) return null
  return normalized
}

function normalizeSocketNamespace(namespace?: string): string | null {
  const normalized = String(namespace || '').trim()
  return ALLOWED_SOCKET_NAMESPACES.has(normalized) ? normalized : null
}

function normalizeSocketQuery(query?: RelaySocketOpenRequest['query']): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue
    normalized[key] = String(value)
  }
  return normalized
}

function normalizeSocketAuth(auth?: RelaySocketOpenRequest['auth']): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(auth || {})) {
    if (value == null) continue
    normalized[key] = value
  }
  return normalized
}

function streamMode(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeHeaders(headers?: RelayHttpRequest['headers']): Headers {
  const normalized = new Headers()
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = name.toLowerCase()
    if (!ALLOWED_REQUEST_HEADERS.has(lower) || value == null) continue
    const headerValue = Array.isArray(value) ? value.find(Boolean) : value
    if (headerValue) normalized.set(lower, String(headerValue))
  }
  return normalized
}

function normalizeRequestBody(request: RelayHttpRequest, method: string, headers: Headers): NormalizedBody | RelayHttpResponse {
  if (method === 'GET' || method === 'HEAD') {
    return { byteLength: 0 }
  }

  if (typeof request.bodyBase64 === 'string') {
    const buffer = Buffer.from(request.bodyBase64, 'base64')
    if (buffer.byteLength > MAX_REQUEST_BODY_BYTES) {
      return relayError(request.id, 'request_body_too_large', 'Relay request body exceeds the local size limit', 413)
    }
    return { body: buffer, byteLength: buffer.byteLength }
  }

  if (request.body == null) {
    return { byteLength: 0 }
  }

  if (typeof request.body === 'string') {
    const byteLength = Buffer.byteLength(request.body)
    if (byteLength > MAX_REQUEST_BODY_BYTES) {
      return relayError(request.id, 'request_body_too_large', 'Relay request body exceeds the local size limit', 413)
    }
    return { body: request.body, byteLength }
  }

  const serialized = JSON.stringify(request.body)
  const byteLength = Buffer.byteLength(serialized)
  if (byteLength > MAX_REQUEST_BODY_BYTES) {
    return relayError(request.id, 'request_body_too_large', 'Relay request body exceeds the local size limit', 413)
  }
  if (!headers.has('content-type')) {
    return { body: serialized, contentType: 'application/json', byteLength }
  }
  return { body: serialized, byteLength }
}

function responseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'connection' || lower === 'transfer-encoding') return
    headers[lower] = value
  })
  return headers
}

function isTextualResponse(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return TEXTUAL_RESPONSE_TYPES.some(prefix => lower.startsWith(prefix) || lower.includes(prefix))
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function readResponseBody(response: Response): Promise<{ body?: string; bodyBase64?: string; truncated?: boolean }> {
  const contentType = response.headers.get('content-type') || ''
  if (!response.body) return {}

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    total += chunk.byteLength
    if (total > MAX_RESPONSE_BODY_BYTES) {
      const remaining = Math.max(0, MAX_RESPONSE_BODY_BYTES - (total - chunk.byteLength))
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(chunk)
  }

  const buffer = Buffer.concat(chunks)
  if (isTextualResponse(contentType)) {
    return { body: buffer.toString('utf-8'), truncated }
  }
  return { bodyBase64: buffer.toString('base64'), truncated }
}

export class GlobalAgentServer {
  private readonly nsp: ReturnType<Server['of']>
  private readonly clients = new Map<string, Socket>()
  private readonly frontendClients = new Map<string, Socket>()
  private readonly bridgeOwners = new Map<string, string>()
  private readonly localSocketBridges = new Map<string, LocalSocketBridge>()
  private readonly authToken = randomBytes(32).toString('hex')
  private readonly localBaseUrl: string
  private readonly fetchImpl: typeof fetch
  private initialized = false

  constructor(io: Server, options: StartGlobalAgentServerOptions = {}) {
    this.nsp = io.of(GLOBAL_AGENT_NAMESPACE)
    this.localBaseUrl = (options.localBaseUrl || `http://127.0.0.1:${config.port}`).replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl || fetch
  }

  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.nsp.use(async (socket, next) => {
      const auth = socket.handshake.auth || {}
      const token = String(auth.token || '')
      if (token === this.authToken) {
        socket.data.globalAgentRole = 'agent'
        next()
        return
      }

      const user = await authenticateUserToken(token)
      if (!user) {
        next(new Error('Unauthorized'))
        return
      }
      const profile = String(auth.profile || socket.handshake.query?.profile || '').trim()
      if (profile && !this.canAccessProfile(user, profile)) {
        next(new Error('Profile access denied'))
        return
      }
      // The JWT authenticates the user; auth.role only selects the relay protocol mode.
      socket.data.globalAgentRole = requestedAgentRole(auth) ? 'agent' : 'frontend'
      socket.data.user = user
      socket.data.userToken = token
      socket.data.profile = profile
      next()
    })
    this.nsp.on('connection', this.onConnection.bind(this))
    logger.info('[global-agent] Socket.IO ready at %s', GLOBAL_AGENT_NAMESPACE)
  }

  getNamespace(): string {
    return GLOBAL_AGENT_NAMESPACE
  }

  getAuthToken(): string {
    return this.authToken
  }

  getClientIds(): string[] {
    return Array.from(this.clients.keys())
  }

  async httpRequest(request: RelayHttpRequest, options: GlobalAgentRequestOptions = {}): Promise<RelayHttpResponse> {
    const socket = this.resolveClient(options.clientId)
    if (!socket) {
      return responseError<RelayHttpResponse>(request.id, 'global_agent_unavailable', 'No global agent client is connected')
    }
    return this.emitWithAck<RelayHttpResponse>(socket, 'http.request', request, options.timeoutMs, request.id)
  }

  async openSocket(request: RelaySocketOpenRequest, options: GlobalAgentRequestOptions = {}): Promise<RelaySocketResponse> {
    const socket = this.resolveClient(options.clientId)
    if (!socket) return responseError<RelaySocketResponse>(request.id, 'global_agent_unavailable', 'No global agent client is connected')
    return this.emitWithAck<RelaySocketResponse>(socket, 'socket.open', request, options.timeoutMs, request.id)
  }

  async emitSocketEvent(request: RelaySocketEventRequest, options: GlobalAgentRequestOptions = {}): Promise<RelaySocketResponse> {
    const socket = this.resolveClient(options.clientId)
    if (!socket) return responseError<RelaySocketResponse>(request.id, 'global_agent_unavailable', 'No global agent client is connected')
    return this.emitWithAck<RelaySocketResponse>(socket, 'socket.event', request, options.timeoutMs, request.id)
  }

  async closeSocket(request: RelaySocketCloseRequest, options: GlobalAgentRequestOptions = {}): Promise<RelaySocketResponse> {
    const socket = this.resolveClient(options.clientId)
    if (!socket) return responseError<RelaySocketResponse>(request.id, 'global_agent_unavailable', 'No global agent client is connected')
    return this.emitWithAck<RelaySocketResponse>(socket, 'socket.close', request, options.timeoutMs, request.id)
  }

  private onConnection(socket: Socket): void {
    if (socket.data.globalAgentRole === 'frontend') {
      this.onFrontendConnection(socket)
      return
    }
    this.onAgentConnection(socket)
  }

  private onAgentConnection(socket: Socket): void {
    const clientId = String(socket.handshake.auth?.instanceId || socket.id)
    const existing = this.clients.get(clientId)
    if (existing && existing.id !== socket.id) {
      this.closeInboundSocketsForOwner(existing.id)
      existing.disconnect(true)
      logger.info('[global-agent] replaced existing client id=%s old_socket=%s new_socket=%s', clientId, existing.id, socket.id)
    }
    this.clients.set(clientId, socket)
    logger.info('[global-agent] client connected id=%s socket=%s', clientId, socket.id)

    socket.on('disconnect', () => {
      if (this.clients.get(clientId)?.id === socket.id) {
        this.clients.delete(clientId)
      }
      this.closeInboundSocketsForOwner(socket.id)
      logger.info('[global-agent] client disconnected id=%s socket=%s', clientId, socket.id)
    })
    socket.on('relay.ready', (payload: unknown) => {
      logger.info({ clientId, payload }, '[global-agent] client ready')
    })
    socket.on('http.request', (request: RelayHttpRequest, ack?: (response: RelayHttpResponse) => void) => {
      void this.handleInboundHttpRequest(socket, request)
        .then(response => this.respondHttp(socket, response, ack))
        .catch((err) => this.respondHttp(
          socket,
          relayError(request?.id, 'relay_internal_error', err instanceof Error ? err.message : String(err), 500),
          ack,
        ))
    })
    socket.on('socket.open', (request: RelaySocketOpenRequest, ack?: (response: RelaySocketResponse) => void) => {
      this.respondSocket(socket, this.openInboundSocket(socket, request), ack)
    })
    socket.on('socket.event', (payload: unknown, ack?: (response: RelaySocketResponse) => void) => {
      if (ack) {
        this.respondSocket(socket, this.emitInboundSocketEvent(socket, payload as RelaySocketEventRequest), ack)
        return
      }
      this.emitFrontendBridgeEvent(clientId, payload)
      socket.broadcast.emit('relay.socket.event', { clientId, payload })
    })
    socket.on('socket.close', (request: RelaySocketCloseRequest, ack?: (response: RelaySocketResponse) => void) => {
      this.respondSocket(socket, this.closeInboundSocket(socket, request), ack)
    })
    socket.on('http.response', (payload: unknown) => {
      socket.broadcast.emit('relay.http.response', { clientId, payload })
    })
  }

  private onFrontendConnection(socket: Socket): void {
    this.frontendClients.set(socket.id, socket)
    logger.info('[global-agent] frontend connected socket=%s user=%s', socket.id, socket.data.user?.id)

    socket.on('http.request', (request: RelayHttpRequest & { clientId?: string }, ack?: (response: RelayHttpResponse) => void) => {
      void this.httpRequest(
        this.withFrontendHttpAuth(socket, request),
        { clientId: request.clientId, timeoutMs: request.timeoutMs },
      ).then(response => ack?.(response))
    })
    socket.on('socket.open', (request: RelaySocketOpenRequest & { clientId?: string; timeoutMs?: number }, ack?: (response: RelaySocketResponse) => void) => {
      void this.openSocket(
        this.withFrontendSocketAuth(socket, request),
        { clientId: request.clientId, timeoutMs: request.timeoutMs },
      ).then((response) => {
        const bridgeId = String(request.id || '').trim()
        if (!response.error && bridgeId) this.bridgeOwners.set(bridgeId, socket.id)
        ack?.(response)
      })
    })
    socket.on('socket.event', (request: RelaySocketEventRequest & { clientId?: string; timeoutMs?: number }, ack?: (response: RelaySocketResponse) => void) => {
      if (!this.frontendOwnsBridge(socket, request.id)) {
        ack?.(responseError<RelaySocketResponse>(request.id, 'socket_not_open', 'Relay socket is not open for this frontend client'))
        return
      }
      void this.emitSocketEvent(
        this.withFrontendSocketPayload(socket, request),
        { clientId: request.clientId, timeoutMs: request.timeoutMs },
      ).then(response => ack?.(response))
    })
    socket.on('socket.close', (request: RelaySocketCloseRequest & { clientId?: string; timeoutMs?: number }, ack?: (response: RelaySocketResponse) => void) => {
      if (!this.frontendOwnsBridge(socket, request.id)) {
        ack?.(responseError<RelaySocketResponse>(request.id, 'socket_not_open', 'Relay socket is not open for this frontend client'))
        return
      }
      void this.closeSocket(request, { clientId: request.clientId, timeoutMs: request.timeoutMs }).then((response) => {
        const bridgeId = String(request.id || '').trim()
        if (bridgeId) this.bridgeOwners.delete(bridgeId)
        ack?.(response)
      })
    })
    socket.on('run', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'run', payload)
    })
    socket.on('resume', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'resume', payload)
    })
    socket.on('abort', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'abort', payload)
    })
    socket.on('cancel_queued_run', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'cancel_queued_run', payload)
    })
    socket.on('insert_queued_run', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'insert_queued_run', payload)
    })
    socket.on('approval.respond', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'approval.respond', payload)
    })
    socket.on('clarify.respond', (payload: unknown) => {
      void this.emitFrontendChatEvent(socket, 'clarify.respond', payload)
    })
    socket.on('disconnect', () => {
      this.frontendClients.delete(socket.id)
      for (const [bridgeId, ownerSocketId] of this.bridgeOwners.entries()) {
        if (ownerSocketId !== socket.id) continue
        this.bridgeOwners.delete(bridgeId)
        void this.closeSocket({ id: bridgeId })
      }
      logger.info('[global-agent] frontend disconnected socket=%s user=%s', socket.id, socket.data.user?.id)
    })
  }

  private async handleInboundHttpRequest(socket: Socket, request: RelayHttpRequest): Promise<RelayHttpResponse> {
    if (!socket.data.userToken) {
      return relayError(request.id, 'unauthorized', 'A user login token is required for inbound relay requests', 401)
    }

    const method = normalizeMethod(request.method)
    if (!method) {
      return relayError(request.id, 'method_not_allowed', 'Relay request method is not allowed', 405)
    }

    const path = normalizeRelayPath(request.path)
    if (!path) {
      return relayError(request.id, 'path_not_allowed', 'Relay request path is not allowed', 403)
    }

    const headers = normalizeHeaders(request.headers)
    headers.set('authorization', `Bearer ${socket.data.userToken}`)
    const profile = this.frontendProfile(socket)
    if (profile) headers.set('x-hermes-profile', profile)

    const normalizedBody = normalizeRequestBody(request, method, headers)
    if (isRelayHttpResponse(normalizedBody)) return normalizedBody
    if (normalizedBody.contentType) headers.set('content-type', normalizedBody.contentType)

    const timeout = requestTimeoutMs(request.timeoutMs)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await this.fetchImpl(`${this.localBaseUrl}${path}`, {
        method,
        headers,
        body: normalizedBody.body,
        signal: controller.signal,
      })
      const body = await readResponseBody(response)
      return {
        id: request.id,
        status: response.status,
        headers: responseHeaders(response),
        ...body,
      }
    } catch (err) {
      const aborted = controller.signal.aborted
      return relayError(
        request.id,
        aborted ? 'request_timeout' : 'local_request_failed',
        aborted ? `Local relay request timed out after ${timeout}ms` : err instanceof Error ? err.message : String(err),
        aborted ? 504 : 502,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  private openInboundSocket(owner: Socket, request: RelaySocketOpenRequest): RelaySocketResponse {
    if (!owner.data.userToken) {
      return socketRelayError(request.id, 'unauthorized', 'A user login token is required for inbound relay sockets')
    }

    const id = normalizeSocketBridgeId(request.id)
    if (!id) return socketRelayError(request.id, 'invalid_socket_id', 'Relay socket id is required')

    const namespace = normalizeSocketNamespace(request.namespace)
    if (!namespace) return socketRelayError(id, 'namespace_not_allowed', 'Relay socket namespace is not allowed')

    this.closeInboundSocket(owner, { id })
    const profile = this.frontendProfile(owner)
    const auth = {
      ...normalizeSocketAuth(request.auth),
      token: owner.data.userToken,
    }
    const query = {
      ...normalizeSocketQuery(request.query),
      ...(profile ? { profile } : {}),
    }
    const localSocket = createClientSocket(`${this.localBaseUrl}${namespace}`, {
      auth,
      query,
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 30_000,
    })
    const bridge: LocalSocketBridge = {
      id,
      ownerSocketId: owner.id,
      namespace,
      socket: localSocket,
      stream: streamMode(request.stream),
      output: '',
      reasoning: '',
    }
    this.localSocketBridges.set(this.inboundBridgeKey(owner, id), bridge)

    localSocket.on('connect', () => {
      this.emitInboundSocketEvent(owner, bridge, 'connect', { socketId: localSocket.id })
    })
    localSocket.on('connect_error', (err: Error) => {
      this.emitInboundSocketEvent(owner, bridge, 'connect_error', { message: err.message })
    })
    localSocket.on('disconnect', (reason: string) => {
      this.emitInboundSocketEvent(owner, bridge, 'disconnect', { reason })
    })
    for (const event of CHAT_RUN_SERVER_EVENTS) {
      localSocket.on(event, (payload: unknown) => {
        this.handleInboundLocalSocketEvent(owner, bridge, event, payload)
      })
    }

    return { id, ok: true, namespace, stream: bridge.stream }
  }

  private emitInboundSocketEvent(owner: Socket, request: RelaySocketEventRequest): RelaySocketResponse
  private emitInboundSocketEvent(owner: Socket, bridge: LocalSocketBridge, event: string, payload: unknown): void
  private emitInboundSocketEvent(
    owner: Socket,
    requestOrBridge: RelaySocketEventRequest | LocalSocketBridge,
    eventName?: string,
    payload?: unknown,
  ): RelaySocketResponse | void {
    if ('socket' in requestOrBridge) {
      const bridge = requestOrBridge
      owner.emit('socket.event', {
        id: bridge.id,
        namespace: bridge.namespace,
        event: eventName,
        payload,
      })
      return
    }

    const request = requestOrBridge
    const id = normalizeSocketBridgeId(request.id)
    if (!id) return socketRelayError(request.id, 'invalid_socket_id', 'Relay socket id is required')

    const event = String(request.event || '').trim()
    if (!ALLOWED_CHAT_RUN_CLIENT_EVENTS.has(event)) {
      return socketRelayError(id, 'event_not_allowed', 'Relay socket event is not allowed')
    }

    const bridge = this.localSocketBridges.get(this.inboundBridgeKey(owner, id))
    if (!bridge || bridge.ownerSocketId !== owner.id) {
      return socketRelayError(id, 'socket_not_open', 'Relay socket is not open')
    }
    if (typeof request.stream === 'boolean') {
      bridge.stream = request.stream
    }
    if (event === 'run') {
      bridge.output = ''
      bridge.reasoning = ''
    }

    bridge.socket.emit(event, this.withInboundSocketPayload(owner, request.payload))
    return { id, ok: true, namespace: bridge.namespace, event, stream: bridge.stream }
  }

  private closeInboundSocket(owner: Socket, request: RelaySocketCloseRequest): RelaySocketResponse {
    const id = normalizeSocketBridgeId(request.id)
    if (!id) return socketRelayError(request.id, 'invalid_socket_id', 'Relay socket id is required')

    const key = this.inboundBridgeKey(owner, id)
    const bridge = this.localSocketBridges.get(key)
    if (!bridge || bridge.ownerSocketId !== owner.id) return { id, ok: true }
    bridge.socket.disconnect()
    this.localSocketBridges.delete(key)
    return { id, ok: true, namespace: bridge.namespace }
  }

  private closeInboundSocketsForOwner(ownerSocketId: string): void {
    for (const [key, bridge] of this.localSocketBridges.entries()) {
      if (bridge.ownerSocketId !== ownerSocketId) continue
      bridge.socket.disconnect()
      this.localSocketBridges.delete(key)
    }
  }

  private handleInboundLocalSocketEvent(owner: Socket, bridge: LocalSocketBridge, event: string, payload: unknown): void {
    if (!bridge.stream) {
      if (event === 'message.delta' && isRecord(payload) && typeof payload.delta === 'string') {
        bridge.output += payload.delta
        return
      }
      if ((event === 'reasoning.delta' || event === 'thinking.delta') && isRecord(payload)) {
        const delta = typeof payload.delta === 'string' ? payload.delta : typeof payload.text === 'string' ? payload.text : ''
        bridge.reasoning += delta
        return
      }
      if (NON_STREAMING_SUPPRESSED_EVENTS.has(event)) {
        return
      }
      if (event === 'run.completed') {
        this.emitInboundSocketEvent(owner, bridge, event, this.withNonStreamingOutput(payload, bridge))
        return
      }
    }

    this.emitInboundSocketEvent(owner, bridge, event, payload)
  }

  private withNonStreamingOutput(payload: unknown, bridge: LocalSocketBridge): unknown {
    if (!isRecord(payload)) {
      return {
        output: bridge.output,
        ...(bridge.reasoning ? { reasoning: bridge.reasoning } : {}),
      }
    }
    return {
      ...payload,
      output: typeof payload.output === 'string' && payload.output ? payload.output : bridge.output,
      ...(bridge.reasoning && typeof payload.reasoning !== 'string' ? { reasoning: bridge.reasoning } : {}),
    }
  }

  private withInboundSocketPayload(socket: Socket, payload: unknown): unknown {
    const profile = this.frontendProfile(socket)
    if (!profile || !isRecord(payload)) return payload
    return {
      ...payload,
      profile: typeof payload.profile === 'string' && payload.profile ? payload.profile : profile,
    }
  }

  private respondHttp(socket: Socket, response: RelayHttpResponse, ack?: (response: RelayHttpResponse) => void): void {
    if (ack) {
      ack(response)
      return
    }
    socket.emit('http.response', response)
  }

  private respondSocket(socket: Socket, response: RelaySocketResponse, ack?: (response: RelaySocketResponse) => void): void {
    if (ack) {
      ack(response)
      return
    }
    socket.emit('socket.response', response)
  }

  private inboundBridgeKey(socket: Socket, id: string): string {
    return `${socket.id}:${id}`
  }

  private resolveClient(clientId?: string): Socket | null {
    if (clientId) return this.clients.get(clientId) || null
    return this.clients.values().next().value || null
  }

  private canAccessProfile(user: AuthenticatedUser, profile: string): boolean {
    return user.role === 'super_admin' || userCanAccessProfile(user.id, profile)
  }

  private frontendProfile(socket: Socket): string {
    return String(socket.data.profile || '').trim()
  }

  private withFrontendHttpAuth(socket: Socket, request: RelayHttpRequest): RelayHttpRequest {
    const headers = { ...(request.headers || {}) }
    headers.authorization = `Bearer ${socket.data.userToken}`
    const profile = this.frontendProfile(socket)
    if (profile) headers['x-hermes-profile'] = profile
    return { ...request, headers }
  }

  private withFrontendSocketAuth(socket: Socket, request: RelaySocketOpenRequest): RelaySocketOpenRequest {
    const profile = this.frontendProfile(socket)
    return {
      ...request,
      auth: {
        ...(request.auth || {}),
        token: socket.data.userToken,
      },
      query: {
        ...(request.query || {}),
        ...(profile ? { profile } : {}),
      },
    }
  }

  private withFrontendSocketPayload(socket: Socket, request: RelaySocketEventRequest): RelaySocketEventRequest {
    const profile = this.frontendProfile(socket)
    if (!profile || !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
      return request
    }
    const payload = request.payload as Record<string, unknown>
    return {
      ...request,
      payload: {
        ...payload,
        profile: typeof payload.profile === 'string' && payload.profile ? payload.profile : profile,
      },
    }
  }

  private frontendOwnsBridge(socket: Socket, id?: string): boolean {
    const bridgeId = String(id || '').trim()
    return Boolean(bridgeId) && this.bridgeOwners.get(bridgeId) === socket.id
  }

  private frontendBridgeId(socket: Socket): string {
    return `frontend:${socket.id}:chat-run`
  }

  private async ensureFrontendChatBridge(socket: Socket): Promise<string | null> {
    const id = this.frontendBridgeId(socket)
    if (this.bridgeOwners.get(id) === socket.id) return id

    const response = await this.openSocket(this.withFrontendSocketAuth(socket, {
      id,
      namespace: '/chat-run',
      stream: true,
    }))
    if (response.error) {
      socket.emit('connect_error', new Error(response.error.message))
      return null
    }
    this.bridgeOwners.set(id, socket.id)
    return id
  }

  private async emitFrontendChatEvent(socket: Socket, event: string, payload: unknown): Promise<void> {
    const id = await this.ensureFrontendChatBridge(socket)
    if (!id) return
    const response = await this.emitSocketEvent(this.withFrontendSocketPayload(socket, {
      id,
      event,
      payload,
    }))
    if (response.error) {
      const sessionId = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? String((payload as Record<string, unknown>).session_id || '')
        : ''
      socket.emit('run.failed', {
        event: 'run.failed',
        ...(sessionId ? { session_id: sessionId } : {}),
        error: response.error.message,
      })
    }
  }

  private emitFrontendBridgeEvent(_clientId: string, event: unknown): void {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return
    const record = event as {
      id?: unknown
      event?: unknown
      payload?: unknown
    }
    const bridgeId = typeof record.id === 'string' ? record.id : ''
    const eventName = typeof record.event === 'string' ? record.event : ''
    if (!bridgeId || !eventName) return
    if (SOCKET_IO_RESERVED_EVENTS.has(eventName)) return
    const ownerSocketId = this.bridgeOwners.get(bridgeId)
    if (!ownerSocketId) return
    this.frontendClients.get(ownerSocketId)?.emit(eventName, record.payload)
  }

  private emitWithAck<T extends { id?: string; ok?: boolean; error?: { code: string; message: string } }>(
    socket: Socket,
    event: string,
    payload: unknown,
    requestedTimeoutMs: number | undefined,
    id: string | undefined,
  ): Promise<T> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(responseError<T>(id, 'global_agent_timeout', `Global agent request timed out after ${timeoutMs(requestedTimeoutMs)}ms`))
      }, timeoutMs(requestedTimeoutMs))
      socket.emit(event, payload, (response: T) => {
        clearTimeout(timer)
        resolve(response)
      })
    })
  }
}

let activeGlobalAgentServer: GlobalAgentServer | null = null

export function getActiveGlobalAgentServer(): GlobalAgentServer | null {
  return activeGlobalAgentServer
}

export function startGlobalAgentServer(io: Server, options: StartGlobalAgentServerOptions = {}): GlobalAgentServer {
  if (activeGlobalAgentServer) return activeGlobalAgentServer
  activeGlobalAgentServer = new GlobalAgentServer(io, options)
  activeGlobalAgentServer.init()
  return activeGlobalAgentServer
}

export function getGlobalAgentServer(): GlobalAgentServer | null {
  return activeGlobalAgentServer
}
