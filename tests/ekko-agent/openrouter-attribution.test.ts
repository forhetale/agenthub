import { describe, expect, it, vi } from 'vitest'
import { createModelClient } from '../../packages/ekko-agent/src/index'

describe('OpenRouter app attribution', () => {
  it.each([
    ['openrouter', 'https://openrouter.ai/api/v1'],
    ['custom:openrouter', 'https://proxy.example/v1'],
  ])('sends no app attribution for %s at %s on regular and streaming requests', async (id, baseUrl) => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (JSON.parse(String(init?.body)).stream) return new Response('data: [DONE]\n\n')
      return Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] })
    })
    const client = createModelClient({ id, baseUrl, type: 'openai-compatible', apiKey: 'test-key', defaultModel: 'test-model' }, { fetch: fetchMock })
    const request = { messages: [{ role: 'user' as const, content: 'Hello' }] }
    await client.create(request)
    for await (const _event of client.stream(request)) { /* drain stream */ }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('X-OpenRouter-Title')).toBeNull()
      expect(headers.get('HTTP-Referer')).toBeNull()
      expect(headers.get('X-OpenRouter-Categories')).toBeNull()
      expect(headers.get('authorization')).toBe('Bearer test-key')
    }
  })

  it('keeps attribution headers a provider configures itself', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }))
    const client = createModelClient({
      id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', type: 'openai-compatible', apiKey: 'test-key', defaultModel: 'test-model',
      headers: { 'X-OpenRouter-Title': 'Custom App', 'HTTP-Referer': 'https://example.com' },
    }, { fetch: fetchMock })
    await client.create({ messages: [{ role: 'user', content: 'Hello' }] })
    const headers = new Headers((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1]?.headers)
    expect(headers.get('X-OpenRouter-Title')).toBe('Custom App')
    expect(headers.get('HTTP-Referer')).toBe('https://example.com')
  })
})
