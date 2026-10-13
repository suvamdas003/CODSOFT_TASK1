import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app seeded with the demo data
 * (`npm run db:seed`). By default Playwright starts `npm run start` (run
 * `npm run build` first) or reuses a server already listening on port 3000.
 *
 * Browser: the bundled Chromium (`npx playwright install chromium`), or an installed
 * browser via PW_CHANNEL=msedge | chrome.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], channel } },
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel },
    },
  ],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    // Only for the server Playwright starts itself: allow repeated local test runs
    // without waiting for the 5-per-minute production sign-in limit to reset.
    env: { AUTH_SIGNIN_RATE_LIMIT_MAX: process.env.E2E_SIGNIN_RATE_LIMIT ?? "30" },
  },
});
