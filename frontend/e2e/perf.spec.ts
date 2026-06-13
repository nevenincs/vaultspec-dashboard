// CI perf gate (W01.P01.S02, ADR D1/D3): navigates to the renderer spike
// under headless Chromium (WebGL software path via SwiftShader), waits for
// the frame-time harness to report done, and asserts the ADR D1 p95
// budgets across all three measurement phases. Run via:
//
//   npx playwright test --config playwright.perf.config.ts
//
// Spike source: `spike/main.ts`. Results shape: `window.__SPIKE_RESULTS__`.
//
// Budgets (ADR D1 — "p95 with headroom, not a tight mean"):
//   settled-static  p95 < 16.7 ms  — 60fps steady-state (primary gate)
//   settled-rebuild p95 < 33 ms    — 30fps; all-position upload per frame
//   layout-running  p95 < 50 ms    — CI headroom; FA2 worker active

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Spike result types (mirrors spike/main.ts SpikeResults)
// ---------------------------------------------------------------------------

interface SpikePhase {
  avgFps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  frames: number;
}

interface SpikeResults {
  params: { nodes: number; edges: number; islands: number; measureS: number };
  renderer: string;
  gpu: string;
  phases: Record<string, SpikePhase>;
  done: boolean;
}

declare global {
  interface Window {
    __SPIKE_RESULTS__?: SpikeResults;
  }
}

// ---------------------------------------------------------------------------
// ADR D1 budgets
// ---------------------------------------------------------------------------

/** 60 fps steady-state — the primary CI gate (ADR D1). */
const STATIC_BUDGET_MS = 16.7;
/** 30 fps minimum — all-position upload per frame. */
const REBUILD_BUDGET_MS = 33;
/** CI headroom — FA2 worker active, software-render path. */
const RUNNING_BUDGET_MS = 50;

// ---------------------------------------------------------------------------
// Shared navigation + wait helper
// ---------------------------------------------------------------------------

/** Spike URL: 1000 nodes / 5000 edges, 5 s per phase (15 s total + boot). */
const SPIKE_URL =
  "/spike.html?nodes=1000&edges=5000&islands=5&measure=5";

/** Maximum wait for `done: true` after navigation. */
const DONE_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Single test — all three phases asserted in one browser session so the
// spike only runs once (one Vite boot + ~15 s of measurement).
// ---------------------------------------------------------------------------

test("spike frame-time phases all meet ADR D1 p95 budgets", async ({ page }) => {
  await page.goto(SPIKE_URL);

  // Wait for all three phases to finish; each is `measureS` seconds and
  // FA2 boot adds variable time. The harness sets `done: true` after the
  // last phase resolves.
  await page.waitForFunction(
    () => window.__SPIKE_RESULTS__?.done === true,
    undefined,
    { timeout: DONE_TIMEOUT_MS },
  );

  const results: SpikeResults = await page.evaluate(
    () => window.__SPIKE_RESULTS__ as SpikeResults,
  );

  expect(results.done, "spike harness must be marked done").toBe(true);

  // ---- settled-static: the primary gate (steady render, no uploads) -------
  const staticPhase = results.phases["settled-static"];
  expect(staticPhase, "settled-static phase must be measured").toBeDefined();
  expect(
    staticPhase.p95Ms,
    `settled-static p95 ${staticPhase.p95Ms.toFixed(2)} ms exceeds` +
      ` ${STATIC_BUDGET_MS} ms (60 fps) — ADR D1 primary gate`,
  ).toBeLessThan(STATIC_BUDGET_MS);

  // ---- settled-rebuild: all positions re-uploaded per frame ---------------
  const rebuildPhase = results.phases["settled-rebuild"];
  expect(rebuildPhase, "settled-rebuild phase must be measured").toBeDefined();
  expect(
    rebuildPhase.p95Ms,
    `settled-rebuild p95 ${rebuildPhase.p95Ms.toFixed(2)} ms exceeds` +
      ` ${REBUILD_BUDGET_MS} ms (30 fps)`,
  ).toBeLessThan(REBUILD_BUDGET_MS);

  // ---- layout-running: FA2 worker active, positions change per frame ------
  const runningPhase = results.phases["layout-running"];
  expect(runningPhase, "layout-running phase must be measured").toBeDefined();
  expect(
    runningPhase.p95Ms,
    `layout-running p95 ${runningPhase.p95Ms.toFixed(2)} ms exceeds` +
      ` ${RUNNING_BUDGET_MS} ms (CI-headroom budget)`,
  ).toBeLessThan(RUNNING_BUDGET_MS);
});
