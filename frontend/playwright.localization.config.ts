// Localization dev-affordance E2E (W06.P19.S105/S142): like
// playwright.adverse.config.ts, runs against the Vite DEV server so the
// dev-only alternate-locale injection lever (LocalizationProvider instance
// swap) the layout spec drives is present — it only exists when
// `import.meta.env.DEV` is true, so a production `vaultspec serve` build
// cannot host that spec. localization-errors.spec.ts carries no dev-only
// dependency; it is matched here too so its diagnostic-safety proof runs
// against BOTH this dev build and the production smoke config
// (playwright.config.ts), genuinely covering "any build mode". Shares the
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
