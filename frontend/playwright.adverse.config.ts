// Adverse-condition E2E (dashboard-platform P05.S13): unlike the live-origin
// smoke (playwright.config.ts), this runs against the Vite DEV server with the
// mock engine. The dev affordances the adverse pass drives - the crash injector
// and the degradation debug switch - only exist when `import.meta.env.DEV` is
// true, so a production `vaultspec serve` build cannot host this spec. Uses
// Playwright's bundled chromium (no system-Chrome channel dependency).

import { defineConfig } from "@playwright/test";

const PORT = 5174;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /adverse\.spec\.ts/,
  timeout: 60_000,
  use: {
    baseURL: ORIGIN,
    headless: true,
  },
  webServer: {
    // Bind IPv4 explicitly: Playwright polls 127.0.0.1, but Vite's default
    // "localhost" can resolve to ::1 and never satisfy the readiness probe.
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: ORIGIN,
    timeout: 120_000,
    reuseExistingServer: true,
    env: { VITE_MOCK_ENGINE: "1" },
  },
  reporter: [["list"]],
});
