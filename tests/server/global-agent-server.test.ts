import { beforeEach, describe, expect, it, vi } from 'vitest'
const authMocks = vi.hoisted(() => ({
  authenticateUserToken: vi.fn(),
  userCanAccessProfile: vi.fn(),
}))

const clientSocketMocks = vi.hoisted(() => {
  function createLocalSocket(id: string) {
    const handlers = new Map<string, (...args: any[]) => void>()
    const socket: any = {
      id,
      __handlers: handlers,
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        handlers.set(event, handler)
        return socket
      }),
      emit: vi.fn(),
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    }
    return socket
  }

  const localSockets: any[] = []
  const clientIo = vi.fn(() => {
    const socket = createLocalSocket(`local-socket-${localSockets.length + 1}`)
    localSockets.push(socket)
    return socket
  })
  const reset = () => {
    localSockets.length = 0
    clientIo.mockClear()
  }

  return {
    clientIo,
    localSockets,
    reset,
  }
})

const chatRunMocks = vi.hoisted(() => ({
  getChatRunServer: vi.fn(),
}))

vi.mock('../../packages/server/src/modules/studio/middleware/auth', () => ({
  authenticateUserToken: authMocks.authenticateUserToken,
}))

vi.mock('../../packages/server/src/modules/studio/repositories/users-store', () => ({
  userCanAccessProfile: authMocks.userCanAccessProfile,
}))

vi.mock('socket.io-client', () => ({
  io: clientSocketMocks.clientIo,
}))

vi.mock('../../packages/server/src/modules/studio/public/chat-run', () => ({
  getChatRunServer: chatRunMocks.getChatRunServer,
}))

function createMockNamespace() {
  const middleware: Array<(socket: any, next: (err?: Error) => void) => void> = []
  const handlers = new Map<string, (...args: any[]) => void>()
  const nsp: any = {
    use: vi.fn((fn: (socket: any, next: (err?: Error) => void) => void) => {
      middleware.push(fn)
      return nsp
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler)
      return nsp
    }),
    emit: vi.fn(),
    __middleware: middleware,
    __handlers: handlers,
  }
  return nsp
}

function createMockSocket(id: string, auth: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const handlers = new Map<string, (...args: any[]) => void>()
  const socket: any = {
    id,
    data: {},
    handshake: { auth, headers },
    broadcast: { emit: vi.fn() },
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler)
      return socket
    }),
    emit: vi.fn((_event: string, payload: unknown, ack?: (response: unknown) => void) => {
      ack?.({ id: (payload as any)?.id, status: 200, body: '{"ok":true}' })
      return socket
    }),
    disconnect: vi.fn(),
    __handlers: handlers,
  }
  return socket
}

async function waitForMockCalls(mock: { mock: { calls: unknown[] } }, count: number): Promise<void> {
  const startedAt = Date.now()
  while (mock.mock.calls.length < count && Date.now() - startedAt < 1000) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe('GlobalAgentServer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    clientSocketMocks.reset()
    authMocks.authenticateUserToken.mockResolvedValue(null)
    authMocks.userCanAccessProfile.mockReturnValue(false)
  })

  it('registers a local control namespace with token auth', async () => {
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any)
    server.init()

    expect(io.of).toHaveBeenCalledWith('/global-agent')
    expect(nsp.use).toHaveBeenCalledTimes(1)
    expect(nsp.on).toHaveBeenCalledWith('connection', expect.any(Function))

    const denied = createMockSocket('socket-denied', { token: 'wrong' })
    const deniedNext = vi.fn()
    await nsp.__middleware[0](denied, deniedNext)
    expect(deniedNext.mock.calls[0][0]).toBeInstanceOf(Error)

    const deniedAgent = createMockSocket('socket-denied-agent', { token: 'wrong', role: 'hermes-studio' })
    const deniedAgentNext = vi.fn()
    await nsp.__middleware[0](deniedAgent, deniedAgentNext)
    expect(deniedAgentNext.mock.calls[0][0]).toBeInstanceOf(Error)

    const allowed = createMockSocket('socket-allowed', { token: server.getAuthToken() })
    const allowedNext = vi.fn()
    await nsp.__middleware[0](allowed, allowedNext)
    expect(allowedNext).toHaveBeenCalledWith()
  })

  it('tracks connected clients and forwards requests with ack', async () => {
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any)
    server.init()
    const socket = createMockSocket('socket-1', { token: server.getAuthToken(), instanceId: 'local-global-agent' })
    nsp.__handlers.get('connection')?.(socket)

    expect(server.getClientIds()).toEqual(['local-global-agent'])

    const response = await server.httpRequest({
      id: 'req-1',
      method: 'GET',
      path: '/api/auth/users',
    }, { clientId: 'local-global-agent' })

    expect(socket.emit).toHaveBeenCalledWith(
      'http.request',
      { id: 'req-1', method: 'GET', path: '/api/auth/users' },
      expect.any(Function),
    )
    expect(response).toEqual({ id: 'req-1', status: 200, body: '{"ok":true}' })
  })

  it('accepts frontend JWT clients and injects their token and profile into forwarded requests', async () => {
    authMocks.authenticateUserToken.mockResolvedValue({ id: 7, username: 'ada', role: 'user' })
    authMocks.userCanAccessProfile.mockReturnValue(true)
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any)
    server.init()

    const agentSocket = createMockSocket('agent-socket', { token: server.getAuthToken(), instanceId: 'local-global-agent' })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](agentSocket, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(agentSocket)

    const frontendSocket = createMockSocket('frontend-socket', { token: 'frontend-jwt', profile: 'research' })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](frontendSocket, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(frontendSocket)

    const httpAck = vi.fn()
    frontendSocket.__handlers.get('http.request')?.({
      id: 'req-frontend',
      method: 'GET',
      path: '/api/auth/users',
      clientId: 'local-global-agent',
    }, httpAck)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(agentSocket.emit).toHaveBeenCalledWith(
      'http.request',
      {
        id: 'req-frontend',
        method: 'GET',
        path: '/api/auth/users',
        clientId: 'local-global-agent',
        headers: {
          authorization: 'Bearer frontend-jwt',
          'x-hermes-profile': 'research',
        },
      },
      expect.any(Function),
    )
    expect(httpAck).toHaveBeenCalledWith({ id: 'req-frontend', status: 200, body: '{"ok":true}' })

    const openAck = vi.fn()
    frontendSocket.__handlers.get('socket.open')?.({
      id: 'chat-1',
      namespace: '/chat-run',
      clientId: 'local-global-agent',
    }, openAck)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(agentSocket.emit).toHaveBeenCalledWith(
      'socket.open',
      {
        id: 'chat-1',
        namespace: '/chat-run',
        clientId: 'local-global-agent',
        auth: { token: 'frontend-jwt' },
        query: { profile: 'research' },
      },
      expect.any(Function),
    )
  })

  it('accepts JWT agent clients and handles inbound HTTP and chat-run socket relay requests locally', async () => {
    authMocks.authenticateUserToken.mockResolvedValue({ id: 7, username: 'ada', role: 'user' })
    authMocks.userCanAccessProfile.mockReturnValue(true)
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { 'content-type': 'application/json', 'x-result': 'accepted' },
    }))
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any, {
      localBaseUrl: 'http://127.0.0.1:8648',
      fetchImpl: fetchImpl as any,
    })
    server.init()

    const agentSocket = createMockSocket('jwt-agent-socket', {
      token: 'user-jwt',
      role: 'hermes-studio',
      instanceId: 'device-1',
      profile: 'research',
    })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](agentSocket, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(agentSocket)

    expect(server.getClientIds()).toEqual(['device-1'])

    const httpAck = vi.fn()
    agentSocket.__handlers.get('http.request')?.({
      id: 'req-1',
      method: 'POST',
      path: '/api/studio/sessions',
      headers: {
        authorization: 'Bearer attacker',
        'content-type': 'application/json',
      },
      body: { title: 'hello' },
    }, httpAck)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8648/api/studio/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'hello' }),
    }))
    expect(Array.from((fetchImpl.mock.calls[0][1].headers as Headers).entries())).toEqual([
      ['authorization', 'Bearer user-jwt'],
      ['content-type', 'application/json'],
      ['x-hermes-profile', 'research'],
    ])
    expect(httpAck).toHaveBeenCalledWith(expect.objectContaining({
      id: 'req-1',
      status: 202,
      body: '{"ok":true}',
    }))

    const openAck = vi.fn()
    agentSocket.__handlers.get('socket.open')?.({
      id: 'chat-1',
      namespace: '/chat-run',
    }, openAck)

    expect(clientSocketMocks.clientIo).toHaveBeenCalledWith('http://127.0.0.1:8648/chat-run', expect.objectContaining({
      auth: { token: 'user-jwt' },
      query: { profile: 'research' },
      transports: ['websocket', 'polling'],
    }))
    expect(openAck).toHaveBeenCalledWith({ id: 'chat-1', ok: true, namespace: '/chat-run', stream: true })

    const localSocket = clientSocketMocks.localSockets[0]
    const eventAck = vi.fn()
    agentSocket.__handlers.get('socket.event')?.({
      id: 'chat-1',
      event: 'run',
      payload: { session_id: 's1', input: 'hi' },
    }, eventAck)

    expect(localSocket.emit).toHaveBeenCalledWith('run', {
      session_id: 's1',
      input: 'hi',
      profile: 'research',
    })
    expect(eventAck).toHaveBeenCalledWith({ id: 'chat-1', ok: true, namespace: '/chat-run', event: 'run', stream: true })

    localSocket.__handlers.get('message.delta')?.({ session_id: 's1', delta: 'hello' })
    expect(agentSocket.emit).toHaveBeenCalledWith('socket.event', {
      id: 'chat-1',
      namespace: '/chat-run',
      event: 'message.delta',
      payload: { session_id: 's1', delta: 'hello' },
    })
  })

  it('replaces the previous agent socket for the same instance id', async () => {
    authMocks.authenticateUserToken.mockResolvedValue({ id: 7, username: 'ada', role: 'user' })
    authMocks.userCanAccessProfile.mockReturnValue(true)
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any, { localBaseUrl: 'http://127.0.0.1:8648' })
    server.init()

    const first = createMockSocket('agent-old', {
      token: 'user-jwt',
      role: 'hermes-studio',
      instanceId: 'device-1',
      profile: 'research',
    })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](first, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(first)

    first.__handlers.get('socket.open')?.({ id: 'chat-1', namespace: '/chat-run' }, vi.fn())
    expect(clientSocketMocks.localSockets).toHaveLength(1)

    const second = createMockSocket('agent-new', {
      token: 'user-jwt',
      role: 'hermes-studio',
      instanceId: 'device-1',
      profile: 'research',
    })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](second, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(second)

    expect(first.disconnect).toHaveBeenCalledWith(true)
    expect(clientSocketMocks.localSockets[0].disconnect).toHaveBeenCalled()
    expect(server.getClientIds()).toEqual(['device-1'])
  })

  it('does not forward reserved Socket.IO lifecycle events to frontend clients', async () => {
    authMocks.authenticateUserToken.mockResolvedValue({ id: 7, username: 'ada', role: 'user' })
    authMocks.userCanAccessProfile.mockReturnValue(true)
    const nsp = createMockNamespace()
    const io = { of: vi.fn(() => nsp) }
    const { GlobalAgentServer } = await import('../../packages/server/src/modules/studio/sockets/global-agent')

    const server = new GlobalAgentServer(io as any)
    server.init()

    const agentSocket = createMockSocket('agent-socket', { token: server.getAuthToken(), instanceId: 'local-global-agent' })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](agentSocket, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(agentSocket)

    const frontendSocket = createMockSocket('frontend-socket', { token: 'frontend-jwt', profile: 'research' })
    await new Promise<void>((resolve, reject) => {
      nsp.__middleware[0](frontendSocket, (err?: Error) => err ? reject(err) : resolve())
    })
    nsp.__handlers.get('connection')?.(frontendSocket)

    const bridgeId = 'frontend:frontend-socket:chat-run'
    const openAck = vi.fn()
    frontendSocket.__handlers.get('socket.open')?.({
      id: bridgeId,
      namespace: '/chat-run',
      clientId: 'local-global-agent',
    }, openAck)
    await new Promise(resolve => setTimeout(resolve, 0))
    frontendSocket.emit.mockClear()

    agentSocket.__handlers.get('socket.event')?.({
      id: bridgeId,
      namespace: '/chat-run',
      event: 'connect',
      payload: { socketId: 'local-chat-run' },
    })
    expect(frontendSocket.emit).not.toHaveBeenCalledWith('connect', expect.anything())

    agentSocket.__handlers.get('socket.event')?.({
      id: bridgeId,
      namespace: '/chat-run',
      event: 'message.delta',
      payload: { session_id: 's1', delta: 'hi' },
    })
    expect(frontendSocket.emit).toHaveBeenCalledWith('message.delta', { session_id: 's1', delta: 'hi' })

    agentSocket.__handlers.get('socket.event')?.({
      id: bridgeId,
      namespace: '/chat-run',
      event: 'run.queue_insertion.updated',
      payload: {
        session_id: 's1', queue_id: 'q1', phase: 'waiting_for_tool_batch', guarantee: 'strict',
      },
    })
    expect(frontendSocket.emit).toHaveBeenCalledWith('run.queue_insertion.updated', {
      session_id: 's1', queue_id: 'q1', phase: 'waiting_for_tool_batch', guarantee: 'strict',
    })
  })
})
