import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi } from './fixtures'

test('only the latest Studio announcement is shown, including after reload and foreground checks', async ({ page }) => {
  await authenticate(page)
  const api = await mockHermesApi(page)
  await page.route('**/api/studio/notifications/bark', route => route.fulfill({ json: {
    serverUrl: 'https://api.day.app', group: 'AgentHub', sound: '', studioUrl: '', allowPrivateNetwork: false,
    hasKey: false, configured: false, pushReady: false, lastResult: null,
  } }))
  const latest = { id: 3, updateTime: 100, title: 'Latest Studio news', content: 'A new Studio release is ready.\nEnjoy!', type: 'info', dismissible: true, actionUrl: null }
  let requests = 0
  await page.route('**/api/studio/announcements?*', async route => {
    requests++
    await route.fulfill({ json: { ok: true, platform: 'desktop', list: [latest, { ...latest, id: 2, title: 'Older Studio news' }] } })
  })
  await page.goto('/#/hermes/connections')
  const dialog = page.getByTestId('studio-announcement')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(latest.title)
  await expect(page.getByText('Older Studio news', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Got it', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect.poll(() => requests).toBeGreaterThanOrEqual(2)
  await expect(dialog).toHaveCount(0)
  latest.updateTime = 200
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Got it', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(api.unexpectedRequests).toEqual([])
})

test('announcement errors do not block the Studio shell', async ({ page }) => {
  await authenticate(page)
  await mockHermesApi(page)
  await page.route('**/api/studio/notifications/bark', route => route.fulfill({ json: {
    serverUrl: 'https://api.day.app', group: 'AgentHub', sound: '', studioUrl: '', allowPrivateNetwork: false,
    hasKey: false, configured: false, pushReady: false, lastResult: null,
  } }))
  await page.route('**/api/studio/announcements?*', route => route.fulfill({ status: 502, json: { ok: false } }))
  await page.goto('/#/hermes/connections')
  await expect(page.getByTestId('bark-panel')).toBeVisible()
  await expect(page.getByTestId('studio-announcement')).toHaveCount(0)
})
