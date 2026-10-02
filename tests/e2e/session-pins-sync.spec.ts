import { expect, test, type Page } from '@playwright/test'
import { authenticate, mockChatSocket, mockHermesApi, TEST_ACCESS_KEY } from './fixtures'

function makeSessions() {
  const session = {
    id: 'shared-session', title: 'Shared conversation', profile: 'research',
    source: 'cli', model: 'test-model', provider: 'test-provider',
    started_at: 1800000000, last_active: 1800000100, ended_at: null, message_count: 1,
    is_pinned: false,
  }
  return { session, recent: { ...session, id: 'recent-session', title: 'Recent conversation', last_active: 1700000000, is_pinned: false } }
}

const pinnedHeader = (device: Page) => device.locator('.session-group-header').filter({ hasText: 'Pinned' })

test('uses the session database flag for pins across devices', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ baseURL })
  const otherPage = await otherContext.newPage()
  const { session, recent } = makeSessions()
  async function prepare(device: Page) {
    await device.addInitScript(() => {
      ;(window as any).__PW_CHAT_SOCKET_RESUMES__ = {
        'shared-session': { session_id: 'shared-session', messages: [], isWorking: false },
      }
    })
    await authenticate(device, TEST_ACCESS_KEY, 'research')
    const api = await mockHermesApi(device, { sessions: [session, recent] })
    await mockChatSocket(device)
    await device.route('**/api/studio/sessions/shared-session/pin', async route => {
      session.is_pinned = route.request().postDataJSON().is_pinned
      await route.fulfill({ json: { ok: true, is_pinned: session.is_pinned } })
    })
    await device.goto('/#/hermes/chat')
    await expect(device.locator('.session-item').first()).toBeVisible()
    return api
  }
  try {
    const api = await prepare(page)
    await expect(pinnedHeader(page)).toHaveCount(0)
    await page.locator('.session-item').first().click({ button: 'right' })
    await page.locator('.n-dropdown-option:visible').filter({ hasText: /^Pin$/ }).click()
    await expect(pinnedHeader(page)).toBeVisible()
    expect(session.is_pinned).toBe(true)
    await expect(page.locator('.session-group-header').first()).toContainText('Pinned')
    await expect(page.locator('.session-group-header').nth(1)).toContainText('Recent')

    await prepare(otherPage)
    await expect(pinnedHeader(otherPage)).toBeVisible()
    await expect(otherPage.locator('.session-group-header').first()).toContainText('Pinned')
    await otherPage.locator('.session-item').first().click({ button: 'right' })
    await otherPage.locator('.n-dropdown-option:visible').filter({ hasText: /^Unpin$/ }).click()
    await expect(pinnedHeader(otherPage)).toHaveCount(0)
    expect(session.is_pinned).toBe(false)
    await page.reload()
    await expect(pinnedHeader(page)).toHaveCount(0)
    expect(api.unexpectedRequests).toEqual([])
  } finally {
    await otherContext.close()
  }
})

// TATin Studio moves pins that pre-0.7.23 browsers kept in localStorage to the server once,
// whichever profile they were saved under.
test('moves old browser pins to the server once', async ({ page }) => {
  const { session, recent } = makeSessions()
  const pinRequests: boolean[] = []
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('legacy-pins-seeded')) {
      sessionStorage.setItem('legacy-pins-seeded', '1')
      localStorage.setItem('hermes_session_pins_v1_default', '["shared-session"]')
    }
    ;(window as any).__PW_CHAT_SOCKET_RESUMES__ = {
      'shared-session': { session_id: 'shared-session', messages: [], isWorking: false },
    }
  })
  await authenticate(page, TEST_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page, { sessions: [session, recent] })
  await mockChatSocket(page)
  await page.route('**/api/studio/sessions/shared-session/pin', async route => {
    session.is_pinned = route.request().postDataJSON().is_pinned
    pinRequests.push(session.is_pinned)
    await route.fulfill({ json: { ok: true, is_pinned: session.is_pinned } })
  })

  await page.goto('/#/hermes/chat')
  await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })
  await expect(pinnedHeader(page)).toBeVisible()
  await expect(page.locator('.session-group-header').first()).toContainText('Pinned')
  expect(pinRequests).toEqual([true])
  expect(await page.evaluate(() => localStorage.getItem('hermes_session_pins_v1_default'))).toBeNull()

  await page.reload()
  await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })
  await expect(pinnedHeader(page)).toBeVisible()
  expect(pinRequests).toEqual([true])
  expect(api.unexpectedRequests).toEqual([])
})
