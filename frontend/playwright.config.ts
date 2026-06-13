// E2E smoke configuration (W03.P12.S50): runs against a LIVE
// `vaultspec serve` origin — single origin serving the SPA shell (with
// the DF-6 token meta tag), the API, and SSE. Start the engine first;
// override the origin with VAULTSPEC_SERVE_ORIGIN.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The adverse pass runs against the Vite dev server (dev affordances), not
  // this live-origin smoke config; it has its own playwright.adverse.config.ts.
  testIgnore: /adverse\.spec\.ts/,
  timeout: 30_000,
  use: {
    baseURL: process.env.VAULTSPEC_SERVE_ORIGIN ?? "http://127.0.0.1:8767",
    // System Chrome: no separate browser download for the local smoke.
    channel: "chrome",
    headless: true,
  },
  reporter: [["list"]],
});
