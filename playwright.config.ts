import { defineConfig, devices } from "@playwright/test"

/**
 * PayPal sandbox E2E: set in shell or `.env` (loaded by Vite for the dev server):
 * - `VITE_PAYPAL_CLIENT_ID` (required)
 * - `PAYPAL_SANDBOX_BUYER_EMAIL` / `PAYPAL_SANDBOX_BUYER_PASSWORD` (required for full flow)
 *
 * Dev server uses `VITE_PAYPAL_E2E_DIAG=1` so the app emits `[E2E]` lifecycle logs and skips `activate-vip` on `/checkout`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "VITE_PAYPAL_E2E_DIAG=1 npm run dev -- --port 3000 --strictPort",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_PAYPAL_E2E_DIAG: "1",
    },
  },
})
