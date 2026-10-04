import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi } from './fixtures'

test('Bark configuration, masked key, saved-config test, clear, and reload', async ({ page }) => {
  await authenticate(page)
  await mockHermesApi(page)
  let state = { serverUrl: 'https://api.day.app', group: 'AgentHub', sound: '', studioUrl: '', allowPrivateNetwork: false, hasKey: false, configured: false, pushReady: false, lastResult: null as any }
  let savedKey = ''; let testCount = 0
  await page.route('**/api/studio/notifications/bark**', async route => {
    const req = route.request()
    if (req.url().endsWith('/test')) {
      testCount++; state.lastResult = { ok: true, code: 'accepted', at: '2026-09-14T10:00:00Z' }
      return route.fulfill({ json: { ok: true, code: 'accepted' } })
    }
    if (req.method() === 'PUT') {
      const { deviceKey, ...body } = req.postDataJSON(); savedKey = deviceKey || savedKey
      state = { ...state, ...body, hasKey: true, configured: true, pushReady: true }
    } else if (req.method() === 'DELETE') {
      savedKey = ''; state = { ...state, hasKey: false, configured: false, pushReady: false, lastResult: null }
    }
    await route.fulfill({ json: state })
  })
  await page.goto('/#/hermes/connections')
  const panel = page.getByTestId('bark-panel')
  await expect(panel).toBeVisible()
  await expect(page).toHaveTitle(/AgentHub/)
  await expect(panel.getByRole('button', { name: 'Send test', exact: true })).toBeDisabled()
  await panel.getByPlaceholder('https://api.day.app/DEVICE_KEY — proxy prefixes: enter fields manually').fill('https://api.day.app/TEST_ONLY_KEY/hello/world')
  await panel.getByRole('button', { name: 'Parse URL', exact: true }).click()
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByText('Configured', { exact: true })).toBeVisible()
  expect(savedKey).toBe('TEST_ONLY_KEY')
  await expect(panel.getByPlaceholder('Key saved. Leave blank to keep it.')).toHaveValue('')
  await panel.getByRole('button', { name: 'Send test', exact: true }).click()
  await expect(panel.getByText(/Last send result/)).toBeVisible()
  expect(testCount).toBe(1)
  await page.reload(); await expect(panel.getByText('Configured', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Clear configuration', exact: true }).click()
  await page.getByRole('button', { name: 'Clear configuration', exact: true }).last().click()
  await expect(panel.getByText('Not configured', { exact: true })).toBeVisible()
  expect(savedKey).toBe('')
})

test('message push contains only the Bark panel', async ({ page }) => {
  await authenticate(page)
  await mockHermesApi(page)
  await page.goto('/#/hermes/connections')
  await expect(page.getByTestId('bark-panel')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'App', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Devices', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Scan to add', exact: true })).toHaveCount(0)

  // Legacy links land on the Bark panel as well.
  await page.goto('/#/hermes/connections?tab=app')
  await expect(page.getByTestId('bark-panel')).toBeVisible()
})

test('Chinese navigation opens message push and fits a phone viewport', async ({ page }, testInfo) => {
  await authenticate(page)
  await page.addInitScript(() => localStorage.setItem('hermes_locale', 'zh'))
  await mockHermesApi(page)
  await page.route('**/api/studio/notifications/bark', route => route.fulfill({ json: {
    serverUrl: 'https://api.day.app', group: 'AgentHub', sound: '', studioUrl: '', allowPrivateNetwork: false,
    hasKey: false, configured: false, pushReady: false, lastResult: null,
  } }))
  await page.goto('/#/hermes/chat')
  await page.getByRole('link', { name: '消息推送', exact: true }).click()
  await expect(page.getByTestId('bark-panel')).toBeVisible()
  await expect(page.getByRole('heading', { name: '消息推送', exact: true })).toBeVisible()
  await expect(page.getByTestId('bark-panel').getByRole('button', { name: '保存配置', exact: true })).toBeEnabled()
  await page.screenshot({ path: process.env.TATIN_SCREENSHOT || testInfo.outputPath('bark-zh.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('bark-panel')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
