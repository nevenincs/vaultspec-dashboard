// Localization dev-affordance E2E (W06.P19.S105/S142): like
// playwright.adverse.config.ts, runs against the Vite DEV server so the
// dev-only affordances the specs drive - the alternate-locale injection
// lever (LocalizationProvider instance swap) and the crash injector - are
// present. Both only exist when `import.meta.env.DEV` is true, so a
// production `vaultspec serve` build cannot host these specs. Shares the
// adverse harness's port: the two configs are never run concurrently.

import { defineConfig } from "@playwright/test";

import { DEV_PORTS } from "./dev-ports";

const PORT = DEV_PORTS.adverse;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /localization-(layout|errors)\.spec\.ts$/,
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
