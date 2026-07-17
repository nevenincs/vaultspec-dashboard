// E2E smoke configuration (W03.P12.S50): runs against a LIVE
// `vaultspec serve` origin — single origin serving the SPA shell (with
// the DF-6 token meta tag), the API, and SSE. Start the engine first;
// override the origin with VAULTSPEC_SERVE_ORIGIN.

import { defineConfig } from "@playwright/test";

import { DEV_PORTS } from "./dev-ports";

export default defineConfig({
  testDir: "./e2e",
  // The adverse pass and the two locale-swap/crash-injector localization specs
  // run against the Vite dev server (dev affordances), not this live-origin
  // smoke config; they have their own playwright.adverse.config.ts /
  // playwright.localization.config.ts.
  testIgnore: /adverse\.spec\.ts|localization-(layout|errors)\.spec\.ts/,
  timeout: 30_000,
  use: {
    baseURL:
      process.env.VAULTSPEC_SERVE_ORIGIN ?? `http://127.0.0.1:${DEV_PORTS.engine}`,
    // System Chrome: no separate browser download for the local smoke.
    channel: "chrome",
    headless: true,
  },
  reporter: [["list"]],
});
