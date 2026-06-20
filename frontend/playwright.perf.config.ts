// Perf-gate E2E: runs the live graph lab under headless Chromium with the
// SwiftShader software WebGL path, navigates to graph.html, drives the real
// SceneController/ThreeField surface, and asserts frame-cadence plus interaction
// latency budgets. Uses a distinct Vite port so it can run concurrently with the
// adverse pass (port 5174).

import { defineConfig } from "@playwright/test";

const PORT = 5176;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /perf\.spec\.ts/,
  // Graph lab: default 11-node sample + synthetic 1000 node / 5000 edge slice.
  // Allow up to 3 minutes for slow CI hardware.
  timeout: 180_000,
  use: {
    baseURL: ORIGIN,
    headless: true,
    // SwiftShader: Chromium's software WebGL renderer, available in headless CI.
    launchOptions: {
      args: ["--use-gl=swiftshader"],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
    env: {
      VITE_GRAPH_LAB_DETACHED: "1",
    },
    url: ORIGIN,
    timeout: 120_000,
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
