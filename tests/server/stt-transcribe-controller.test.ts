import { Readable } from 'stream'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.mock('../../packages/server/src/modules/studio/services/voice/config-sync', () => ({
  syncVoiceConfigToHermesProfile: vi.fn(async () => ({ stt: 'synced', tts: 'unchanged' })),
}))

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    async json() {
      return body
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}

function textResponse(body: string, init: { status?: number; statusText?: string } = {}) {
  return {
    ok: (init.status ?? 500) >= 200 && (init.status ?? 500) < 300,
    status: init.status ?? 500,
    statusText: init.statusText ?? 'Error',
    async json() {
      return { error: body }
    },
    async text() {
      return body
    },
  }
}

function multipartBody(
  boundary: string,
  parts: Array<{
    name: string
    value: string | Buffer
    filename?: string
    filenameStar?: string
    contentType?: string
  }>,
): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    const filename = part.filename ? `; filename="${part.filename}"` : ''
    const filenameStar = part.filenameStar ? `; filename*=UTF-8''${part.filenameStar}` : ''
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"${filename}${filenameStar}\r\n`))
    if (part.contentType) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`))
    }
    chunks.push(Buffer.from('\r\n'))
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value))
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks)
}

function getHeader(headers: RequestInit['headers'] | undefined, name: string): string | undefined {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase())
    return match?.[1]
  }

  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return typeof match?.[1] === 'string' ? match[1] : undefined
}

describe('stt transcribe controller', () => {
  let db: any = null
  let tempDir: string | null = null

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const { DatabaseSync } = await import('node:sqlite')
    db = new DatabaseSync(':memory:')
    vi.doMock('../../packages/server/src/modules/studio/infrastructure/database/index', () => ({
      getDb: () => db,
      getStoragePath: () => ':memory:',
    }))
  })

  afterEach(async () => {
    db?.close()
    db = null
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
    vi.doUnmock('../../packages/server/src/modules/studio/infrastructure/database/index')
    vi.doUnmock('../../packages/server/src/modules/studio/public/config')
    vi.doUnmock('../../packages/server/src/modules/studio/services/voice/stt/audio-convert')
    vi.doUnmock('../../packages/server/src/modules/studio/services/voice/stt')
    vi.resetModules()
  })

  async function initControllerAndStore() {
    const schemas = await import('../../packages/server/src/modules/studio/infrastructure/database/schemas')
    schemas.initAllHermesTables()
    return {
      ctrl: await import('../../packages/server/src/modules/studio/controllers/stt'),
      store: await import('../../packages/server/src/modules/studio/repositories/stt-settings-store'),
    }
  }

  function makeMultipartCtx(
    user: any | null,
    parts: Array<{ name: string; value: string | Buffer; filename?: string; filenameStar?: string; contentType?: string }>,
  ) {
    const boundary = 'stt-boundary'
    return {
      state: user ? { user } : {},
      request: {},
      req: Readable.from([multipartBody(boundary, parts)]),
      params: {},
      status: 200,
      body: null,
      set: vi.fn(),
      get: vi.fn((header: string) => header.toLowerCase() === 'content-type' ? `multipart/form-data; boundary=${boundary}` : ''),
    } as any
  }

  function makeJsonCtx(user: any | null, provider: string, body: unknown) {
    const headers: Record<string, string> = {}
    return {
      state: user ? { user } : {},
      request: { body },
      req: Readable.from([]),
      query: {},
      params: { provider },
      status: 200,
      body: null,
      set: vi.fn((name: string, value: string) => { headers[name] = value }),
      get: vi.fn(() => ''),
      headers,
    } as any
  }

  function makeRawAudioCtx(user: any | null, audio: Buffer, headers: Record<string, string> = {}) {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    )
    return {
      state: user ? { user } : {},
      request: {},
      req: Readable.from([audio]),
      query: {},
      params: {},
      status: 200,
      body: null,
      set: vi.fn(),
      get: vi.fn((header: string) => normalizedHeaders[header.toLowerCase()] || ''),
    } as any
  }

  it('transcribes multipart audio using the stored secret and ignores client-supplied api keys', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: 'transcribed text' }))
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'openai', {
      settings: {
        model: 'gpt-4o-transcribe',
        language: 'en',
      },
      secrets: {
        apiKey: 'server-secret',
      },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'openai' },
        { name: 'apiKey', value: 'attacker-secret' },
        { name: 'secrets', value: '{"apiKey":"body-secret"}' },
        { name: 'audio', value: Buffer.from('audio-data'), filename: 'speech.webm', contentType: 'audio/webm' },
      ],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({
      text: 'transcribed text',
      provider: 'openai',
      model: 'gpt-4o-transcribe',
      language: 'en',
    })
    expect(ctx.body.durationMs).toEqual(expect.any(Number))
    expect(JSON.stringify(ctx.body)).not.toContain('server-secret')
    expect(JSON.stringify(ctx.body)).not.toContain('attacker-secret')
    expect(JSON.stringify(ctx.body)).not.toContain('body-secret')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0] as [string | URL, RequestInit]
    expect(getHeader(init.headers, 'Authorization')).toBe('Bearer server-secret')
    expect(getHeader(init.headers, 'Authorization')).not.toContain('attacker-secret')
    expect(init.body).toBeInstanceOf(FormData)

    const form = init.body as FormData
    expect(form.get('model')).toBe('gpt-4o-transcribe')
    expect(form.get('language')).toBe('en')
  })

  it('masks stored api keys when listing STT settings', async () => {
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'openai', {
      settings: {
        model: 'gpt-4o-transcribe',
      },
      secrets: {
        apiKey: 'server-secret',
      },
    })

    const ctx = makeJsonCtx({ id: 7, username: 'han', role: 'admin' }, 'openai', undefined)
    await ctrl.listSettings(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({
      settings: [
        expect.objectContaining({
          provider: 'openai',
          secrets: { apiKey: '[stored]' },
        }),
      ],
      activeProvider: null,
    })
    expect(JSON.stringify(ctx.body)).not.toContain('server-secret')
  })

  it('reports profile STT as unconfigured when no active provider is saved', async () => {
    const { ctrl } = await initControllerAndStore()
    const ctx = makeJsonCtx({ id: 7, username: 'han', role: 'admin' }, '', undefined)
    ctx.query = { profile: 'default' }

    await ctrl.profileStatus(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body).toEqual({
      profile: 'default',
      configured: false,
      activeProvider: null,
      reason: 'active_stt_provider_missing',
    })
  })

  it('returns 400 when multipart audio is missing', async () => {
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'openai', {
      settings: { model: 'gpt-4o-transcribe' },
      secrets: { apiKey: 'server-secret' },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [{ name: 'provider', value: 'openai' }],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'audio is required' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed multipart filename* without throwing', async () => {
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'openai', {
      settings: { model: 'gpt-4o-transcribe' },
      secrets: { apiKey: 'server-secret' },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'openai' },
        {
          name: 'audio',
          value: Buffer.from('audio-data'),
          filenameStar: 'bad%ZZname.webm',
          contentType: 'audio/webm',
        },
      ],
    )

    await expect(ctrl.transcribe(ctx)).resolves.toBeUndefined()

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'Malformed multipart filename' })
    expect(JSON.stringify(ctx.body)).not.toContain('URIError')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 when no saved STT settings exist for the requested provider', async () => {
    const { ctrl } = await initControllerAndStore()
    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'openai' },
        { name: 'audio', value: Buffer.from('audio-data'), filename: 'speech.webm', contentType: 'audio/webm' },
      ],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'STT settings are required for provider openai' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 for saved custom provider settings missing baseUrl', async () => {
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'custom', {
      settings: {
        model: 'whisper-1',
      },
      secrets: {
        apiKey: 'server-secret',
      },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'custom' },
        { name: 'audio', value: Buffer.from('audio-data'), filename: 'speech.webm', contentType: 'audio/webm' },
      ],
    )

    await expect(ctrl.transcribe(ctx)).resolves.toBeUndefined()

    expect(ctx.status).toBe(400)
    expect(ctx.body).toEqual({ error: 'Custom STT baseUrl is required' })
    expect(JSON.stringify(ctx.body)).not.toContain('server-secret')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('ignores client-supplied custom baseUrl, apiKey, and headers during transcription', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ text: 'custom transcript' }))
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'custom', {
      settings: {
        baseUrl: 'https://example.com/v1',
        model: 'whisper-1',
        language: 'fr',
      },
      secrets: {
        apiKey: 'server-secret',
      },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'custom' },
        { name: 'baseUrl', value: 'http://127.0.0.1:8000/v1/audio/transcriptions' },
        { name: 'apiKey', value: 'attacker-secret' },
        { name: 'headers', value: '{"Authorization":"Bearer attacker-secret"}' },
        { name: 'settings', value: '{"baseUrl":"http://169.254.169.254/latest/meta-data"}' },
        { name: 'audio', value: Buffer.from('audio-data'), filename: 'speech.webm', contentType: 'audio/webm' },
      ],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({
      text: 'custom transcript',
      provider: 'custom',
      model: 'whisper-1',
      language: 'fr',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0] as [string | URL, RequestInit]
    expect(String(url)).toBe('https://example.com/v1/audio/transcriptions')
    expect(getHeader(init.headers, 'Authorization')).toBe('Bearer server-secret')
    expect(getHeader(init.headers, 'Authorization')).not.toContain('attacker-secret')
  })

  it('transcribes multipart audio with saved Doubao STT settings', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ...jsonResponse({}),
        headers: new Headers({ 'X-Api-Status-Code': '20000000' }),
      })
      .mockResolvedValueOnce({
        ...jsonResponse({ result: { text: '豆包识别文本' } }),
        headers: new Headers({ 'X-Api-Status-Code': '20000000' }),
      })
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'doubao', {
      settings: {
        baseUrl: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel',
        model: 'volc.seedasr.auc',
      },
      secrets: {
        apiKey: 'server-secret',
      },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'doubao' },
        { name: 'apiKey', value: 'attacker-secret' },
        { name: 'audio', value: Buffer.from('wav-audio'), filename: 'speech.wav', contentType: 'audio/wav' },
      ],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({
      text: '豆包识别文本',
      provider: 'doubao',
      model: 'volc.seedasr.auc',
    })
    expect(JSON.stringify(ctx.body)).not.toContain('server-secret')
    expect(JSON.stringify(ctx.body)).not.toContain('attacker-secret')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [url, init] = mockFetch.mock.calls[0] as [string | URL, RequestInit]
    expect(String(url)).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit')
    expect(getHeader(init.headers, 'X-Api-Key')).toBe('server-secret')
    expect(getHeader(init.headers, 'X-Api-Key')).not.toContain('attacker-secret')
  })

  it('returns 502 without leaking secrets when the provider fails', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('upstream rejected bearer server-secret', { status: 401, statusText: 'Unauthorized' }))
    const { ctrl, store } = await initControllerAndStore()
    store.saveSttProviderSetting('default', 'openai', {
      settings: { model: 'gpt-4o-transcribe' },
      secrets: { apiKey: 'server-secret' },
    })

    const ctx = makeMultipartCtx(
      { id: 7, username: 'han', role: 'admin' },
      [
        { name: 'provider', value: 'openai' },
        { name: 'audio', value: Buffer.from('audio-data'), filename: 'speech.webm', contentType: 'audio/webm' },
      ],
    )

    await ctrl.transcribe(ctx)

    expect(ctx.status).toBe(502)
    expect(ctx.body).toEqual({
      error: 'STT transcription failed: OpenAI-compatible STT returned HTTP 401: upstream rejected bearer [redacted]',
    })
    expect(JSON.stringify(ctx.body)).not.toContain('server-secret')
  })
})

describe('route registration ordering', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('../../packages/server/src/bootstrap/routes')
  })

  it('mounts protected STT routes after requireAuth', async () => {
    const ttsPublicMiddleware = async () => {}
    const ttsProtectedMiddleware = async () => {}
    const sttProtectedMiddleware = async () => {}

    vi.doMock('../../packages/server/src/modules/studio/routes/tts', () => ({
      ttsRoutes: { routes: vi.fn(() => ttsPublicMiddleware) },
      ttsProtectedRoutes: { routes: vi.fn(() => ttsProtectedMiddleware) },
    }))
    vi.doMock('../../packages/server/src/modules/studio/routes/stt', () => ({
      sttProtectedRoutes: { routes: vi.fn(() => sttProtectedMiddleware) },
    }))

    const { registerRoutes } = await import('../../packages/server/src/bootstrap/routes')
    const use = vi.fn()
    const app = { use }
    const requireAuth = vi.fn(async () => {})

    registerRoutes(app as any, [requireAuth] as any)
    const mountedMiddleware = use.mock.calls.map(([middleware]) => middleware)

    expect(mountedMiddleware.indexOf(ttsPublicMiddleware)).toBeGreaterThanOrEqual(0)
    expect(mountedMiddleware.indexOf(requireAuth)).toBeGreaterThan(mountedMiddleware.indexOf(ttsPublicMiddleware))
    expect(mountedMiddleware.indexOf(sttProtectedMiddleware)).toBeGreaterThan(mountedMiddleware.indexOf(requireAuth))
    expect(mountedMiddleware.indexOf(sttProtectedMiddleware)).toBeGreaterThan(mountedMiddleware.indexOf(ttsProtectedMiddleware))
  })
})
