// E2E smoke configuration (W03.P12.S50): runs against a LIVE
// `vaultspec serve` origin — single origin serving the SPA shell (with
// the DF-6 token meta tag), the API, and SSE. Start the engine first;
// override the origin with VAULTSPEC_SERVE_ORIGIN.

import { defineConfig } from "@playwright/test";

import { DEV_PORTS } from "./dev-ports";

export default defineConfig({
  testDir: "./e2e",
  // The adverse pass and the locale-swap localization spec run against the
  // Vite dev server (dev affordances), not this live-origin smoke config;
  // they have their own playwright.adverse.config.ts /
  // playwright.localization.config.ts. localization-errors.spec.ts runs
  // under BOTH this config and playwright.localization.config.ts (it proves
  // raw diagnostics never render in ANY build mode — production AND dev).
  testIgnore: /adverse\.spec\.ts|localization-layout\.spec\.ts/,
  timeout: 30_000,
  // The single live `vaultspec serve` origin holds SERVER-SIDE view state
  // (left-rail visibility, tree fold expansion) that is not test-isolated
  // across files — parallel workers race to expand/collapse the same tree
  // and flake against each other's state. One worker keeps every spec's
  // corpus-tree interaction deterministic.
  workers: 1,
  use: {
    baseURL:
      process.env.VAULTSPEC_SERVE_ORIGIN ?? `http://127.0.0.1:${DEV_PORTS.engine}`,
    // System Chrome: no separate browser download for the local smoke.
    channel: "chrome",
    headless: true,
  },
  reporter: [["list"]],
});
