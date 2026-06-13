// Perf-gate E2E (W01.P01.S02, ADR D1/D3): runs the renderer spike under
// headless Chromium with the SwiftShader software WebGL path, navigates
// to spike.html, waits for the frame-time harness to complete, and
// asserts the ADR D1 p95 budgets. Uses the Vite dev server at a distinct
// port so it can run concurrently with the adverse pass (port 5174).

import { defineConfig } from "@playwright/test";

const PORT = 5176;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /perf\.spec\.ts/,
  // Spike: 1000 nodes / 5000 edges, 5s × 3 phases + FA2 boot ≈ 30–60s.
  // Allow up to 3 minutes for slow CI hardware.
  timeout: 180_000,
  use: {
    baseURL: ORIGIN,
    headless: true,
    // SwiftShader: Chromium's software WebGL renderer, available in
    // headless CI. The spike requests "webgl" preference; SwiftShader
    // satisfies it without a GPU.
    launchOptions: {
      args: ["--use-gl=swiftshader"],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: ORIGIN,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
