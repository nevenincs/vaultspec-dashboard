// Agent integration E2E: this lane owns its real engine + A2A processes through
// e2e/agent/harness.ts.  It is deliberately separate from ordinary live-origin
// smoke so an absent source checkout is reported as a skipped substrate, never
// as an empty or passing run.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e",
  testMatch: /agent\/.*\.spec\.ts$/,
  workers: 1,
  timeout: 120_000,
  use: {
    channel: "chrome",
    headless: true,
  },
  outputDir: "../test-results/agent",
  reporter: [["list"]],
});
