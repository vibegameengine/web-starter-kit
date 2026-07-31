import { defineConfig, devices } from '@playwright/test'

/**
 * The dev server's port, overridable with `E2E_PORT`.
 *
 * It matters because `reuseExistingServer` will happily adopt WHATEVER is already
 * listening on this port — and on a machine running another vite project on the
 * default 5173, that is a different app entirely. The suite then passes or fails
 * against something it never built. Pin the port when the default is taken:
 *
 *   E2E_PORT=5180 npm run e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 5173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
})
