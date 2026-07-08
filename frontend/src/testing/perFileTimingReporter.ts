// Per-file wall-clock vitest reporter (TIH campaign, P05 instrumentation).
//
// Records each test module's execution wall-clock plus vitest's own timing
// breakdown, and prints a slowest-first summary at the end of the run. It is the
// BASELINE measurement tool: capture a "before" profile against the current
// suite, then an "after" profile at campaign close, and diff them.
//
// OPT-IN, ZERO-IMPACT DEFAULT: this reporter is only wired into the run when
// `VAULTSPEC_TEST_TIMING=1` is set (see vite.config.ts). A normal run and the
// lint/test gate never load it, so it cannot affect timing or output otherwise.
//
// Usage:
//   VAULTSPEC_TEST_TIMING=1 npm --prefix frontend test
//   VAULTSPEC_TEST_TIMING=1 VAULTSPEC_TEST_TIMING_OUT=timing.before.json \
//     npm --prefix frontend test        # also writes a machine-readable profile
//
// Layer note: pure measurement. It reads the reporter API only — it runs no
// product code, mutates nothing, and touches neither test files nor the live-
// engine global setup.

import { writeFileSync } from "node:fs";

import type { Reporter, TestModule, TestRunEndReason } from "vitest/node";
import type { SerializedError } from "vitest/node";

interface FileTiming {
  /** Project-relative module id (e.g. `src/foo/bar.test.ts`). */
  id: string;
  /** Observed wall-clock from module start to end (ms), the headline figure. */
  wallMs: number;
  /** Vitest's breakdown (ms): the actionable split of where the time went. */
  collectMs: number;
  setupMs: number;
  testsMs: number;
  environmentMs: number;
  prepareMs: number;
  /** Final module state ("passed" / "failed" / …) for context. */
  state: string;
}

function round(ms: number): number {
  return Math.round(ms);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

export default class PerFileTimingReporter implements Reporter {
  private readonly startedAt = new Map<string, number>();
  private readonly timings: FileTiming[] = [];

  onTestModuleStart(testModule: TestModule): void {
    this.startedAt.set(testModule.moduleId, performance.now());
  }

  onTestModuleEnd(testModule: TestModule): void {
    const start = this.startedAt.get(testModule.moduleId);
    this.startedAt.delete(testModule.moduleId);
    const d = testModule.diagnostic();
    // Prefer the observed wall (start→end); fall back to vitest's summed
    // durations if a start was never recorded (e.g. a collection-only failure).
    const wallMs =
      start !== undefined
        ? performance.now() - start
        : d.environmentSetupDuration +
          d.prepareDuration +
          d.collectDuration +
          d.setupDuration +
          d.duration;
    this.timings.push({
      id: testModule.relativeModuleId || testModule.moduleId,
      wallMs,
      collectMs: d.collectDuration,
      setupMs: d.setupDuration,
      testsMs: d.duration,
      environmentMs: d.environmentSetupDuration,
      prepareMs: d.prepareDuration,
      state: testModule.state(),
    });
  }

  onTestRunEnd(
    _testModules: ReadonlyArray<TestModule>,
    _errors: ReadonlyArray<SerializedError>,
    _reason: TestRunEndReason,
  ): void {
    if (this.timings.length === 0) return;
    const bySlowest = [...this.timings].sort((a, b) => b.wallMs - a.wallMs);
    const totalWallMs = this.timings.reduce((sum, t) => sum + t.wallMs, 0);

    const lines: string[] = [];
    lines.push("");
    lines.push(
      `per-file timing (VAULTSPEC_TEST_TIMING) — ${this.timings.length} files, ` +
        `${round(totalWallMs)}ms total wall, slowest first:`,
    );
    lines.push(
      `  ${pad("wall", 8)}  ${pad("collect", 8)}  ${pad("setup", 7)}  ` +
        `${pad("tests", 7)}  file`,
    );
    for (const t of bySlowest) {
      const flag = t.state !== "passed" ? ` [${t.state}]` : "";
      lines.push(
        `  ${pad(`${round(t.wallMs)}ms`, 8)}  ${pad(`${round(t.collectMs)}ms`, 8)}  ` +
          `${pad(`${round(t.setupMs)}ms`, 7)}  ${pad(`${round(t.testsMs)}ms`, 7)}  ` +
          `${t.id}${flag}`,
      );
    }
    lines.push("");

    console.log(lines.join("\n"));

    const outPath = process.env.VAULTSPEC_TEST_TIMING_OUT;
    if (outPath) {
      const profile = {
        generatedAt: new Date().toISOString(),
        fileCount: this.timings.length,
        totalWallMs: round(totalWallMs),
        files: bySlowest.map((t) => ({
          id: t.id,
          wallMs: round(t.wallMs),
          collectMs: round(t.collectMs),
          setupMs: round(t.setupMs),
          testsMs: round(t.testsMs),
          environmentMs: round(t.environmentMs),
          prepareMs: round(t.prepareMs),
          state: t.state,
        })),
      };
      writeFileSync(outPath, JSON.stringify(profile, null, 2) + "\n");

      console.log(`per-file timing profile written to ${outPath}`);
    }
  }
}
