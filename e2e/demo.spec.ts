import { expect, test } from '@playwright/test'

test('bootstrap gate reveals the demo screen after preload', async ({ page }) => {
  await page.goto('/')

  // The readiness gate keeps the app hidden under an overlay until the demo
  // screen paints its first frame. Once revealed, its heading is visible.
  await expect(page.getByRole('heading', { name: 'Web Starter Kit', level: 1 })).toBeVisible()

  // The auto-collected preloader should have found at least the demo logo.
  await expect(page.getByText(/Blocking assets collected at build time/)).toBeVisible()
})
