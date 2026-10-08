// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options = {}
    loadAddon() {}
    onData() {}
    write() {}
    open() {}
    dispose() {}
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/api/client', () => ({
  getApiKey: () => 'token',
  getBaseUrlValue: () => '',
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('naive-ui', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('naive-ui')),
  useMessage: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
}))

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send() {}

  close() {
    this.readyState = 3
    this.onclose?.()
  }
}

import TerminalView from '@/views/hermes/TerminalView.vue'

describe('TerminalView reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reconnects after an unexpected close while mounted', () => {
    const wrapper = mount(TerminalView, { global: { stubs: { PageHeader: true } } })
    expect(FakeWebSocket.instances).toHaveLength(1)

    FakeWebSocket.instances[0].close()
    vi.advanceTimersByTime(3000)

    expect(FakeWebSocket.instances).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not reconnect after the page is left', () => {
    const wrapper = mount(TerminalView, { global: { stubs: { PageHeader: true } } })
    const socket = FakeWebSocket.instances[0]

    wrapper.unmount()
    expect(socket.readyState).toBe(3)
    vi.advanceTimersByTime(10_000)

    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('cancels a pending reconnect when the page is left', () => {
    const wrapper = mount(TerminalView, { global: { stubs: { PageHeader: true } } })

    FakeWebSocket.instances[0].close()
    wrapper.unmount()
    vi.advanceTimersByTime(10_000)

    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
