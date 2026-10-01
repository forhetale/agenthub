import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi } from './fixtures'

// TATin keeps the pre-0.7.26 default: gateways auto-start until the user turns them off.
test('gateway auto-start defaults to on and preserves an explicit opt-out after reload', async ({ page }) => {
  await authenticate(page)
  const api = await mockHermesApi(page)
  let gatewayAutoStart: { enabled?: boolean } = {}
  const saved: unknown[] = []
  await page.route(/\/api\/hermes\/config(?:\?.*)?$/, async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      saved.push(body)
      gatewayAutoStart = { ...gatewayAutoStart, ...body.values }
      await route.fulfill({ json: { success: true, gatewayAutoStart } })
    } else {
      await route.fulfill({ json: { gatewayAutoStart } })
    }
  })

  await page.goto('/#/hermes/config/settings')
  const toggle = page.locator('.gateway-auto-start-settings').getByRole('switch').first()
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect.poll(() => saved).toEqual([{ section: 'gatewayAutoStart', values: { enabled: false }, restart: false }])
  await expect(toggle).not.toBeChecked()

  await page.reload()
  await expect(toggle).not.toBeChecked()
  expect(api.unexpectedRequests).toEqual([])
})
