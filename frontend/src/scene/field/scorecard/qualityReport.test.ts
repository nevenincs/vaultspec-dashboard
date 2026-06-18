// The committed QUALITY REPORT regenerates deterministically, scores all layout
// families, and every layout PASSes under the calibrated thresholds + METRIC_VERSION
// (graph-viz-scorecard ADR, graph-viz-quality plan W06.P17.S72).
//
// This suite is the W06 Definition-of-Done assertion for the visible goal-met
// artifact. It proves:
//   - the report regenerates DETERMINISTICALLY (two calls are byte-identical, and the
//     materialized `QUALITY_REPORT` equals a fresh `generateQualityReport()`);
//   - it reports the deterministic layout families (semantic, lineage, hierarchy,
//     radial, clusters over SBM and LFR);
//   - EVERY layout is PASS under the current calibrated thresholds + METRIC_VERSION
//     (a real finding if any were not — the report is read, never masked);
//   - METRIC_VERSION is pinned (a metric-definition change is a deliberate contract
//     event that must update this test and the committed fixture together);
//   - the freshly generated report matches the COMMITTED fixture byte-for-byte, so the
//     committed artifact is the report and it regenerates exactly.
//
// Regenerating the committed fixture (the deliberate, reviewed act after a metric or
// threshold change that bumps METRIC_VERSION): run this file with
// `VAULTSPEC_WRITE_QUALITY_REPORT=1`, which rewrites
// `__fixtures__/quality-report.txt` from the fresh report, then re-run normally to
// confirm it matches. The fixture is NEVER hand-edited.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { METRIC_VERSION } from "./scorecard";
import { runAllGates } from "./runAll";
import { QUALITY_REPORT, generateQualityReport } from "./qualityReport";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "__fixtures__", "quality-report.txt");

// The deterministic layout families. Pinned here so the report cannot silently drop
// a family.
const EXPECTED_LAYOUTS = [
  "semantic",
  "lineage",
  "hierarchy",
  "radial",
  "cluster-sbm",
  "cluster-lfr",
] as const;

// One-shot fixture writer: when VAULTSPEC_WRITE_QUALITY_REPORT is set, rewrite the
// committed fixture from a fresh report. This runs as a side effect at module load so
// the regeneration is a single explicit command, never an accidental hand-edit.
if (process.env.VAULTSPEC_WRITE_QUALITY_REPORT) {
  writeFileSync(FIXTURE_PATH, generateQualityReport(), "utf8");
}

describe("quality report: deterministic regeneration", () => {
  it("two generations are byte-identical", () => {
    expect(generateQualityReport()).toBe(generateQualityReport());
  });

  it("the materialized QUALITY_REPORT equals a fresh generation", () => {
    expect(QUALITY_REPORT).toBe(generateQualityReport());
  });
});

describe("quality report: all layout families scored", () => {
  it("names every expected layout family in the report", () => {
    const report = generateQualityReport();
    for (const layout of EXPECTED_LAYOUTS) {
      expect(report).toContain(layout);
    }
  });

  it("scores exactly the seven gate runs the run-all emits", () => {
    const vectors = runAllGates();
    expect(vectors.map((v) => v.layout)).toEqual([...EXPECTED_LAYOUTS]);
  });
});

describe("quality report: every layout PASSes under the calibrated thresholds", () => {
  it("reports a PASS verdict for every layout and no FAIL", () => {
    const vectors = runAllGates();
    const report = generateQualityReport();

    // Name every failing metric so a real quality regression reports exactly which
    // floor it breached — the report is a finding, never masked.
    const failures: string[] = [];
    for (const v of vectors) {
      for (const m of v.metrics) {
        if (!m.pass) {
          failures.push(
            `${v.layout}.${m.name}: ${m.value.toFixed(3)} < ${m.threshold.toFixed(3)} (margin ${m.margin.toFixed(3)})`,
          );
        }
      }
    }
    expect(failures, `layout(s) below threshold:\n${failures.join("\n")}`).toEqual([]);

    expect(vectors.every((v) => v.passed)).toBe(true);
    // The rendered report agrees: no FAIL verdict marker leaks into the all-green doc.
    expect(report).not.toContain("[FAIL]");
    expect(report).not.toContain("FAILURES PRESENT");
  });

  it("the SUMMARY line reports all layouts passed", () => {
    const vectors = runAllGates();
    const report = generateQualityReport();
    const total = vectors.length;
    expect(report).toContain(
      `QUALITY REPORT SUMMARY: ${total}/${total} layouts passed all per-metric thresholds.`,
    );
  });
});

describe("quality report: METRIC_VERSION contract", () => {
  it("pins METRIC_VERSION (a definition change is a deliberate contract event)", () => {
    expect(METRIC_VERSION).toBe(1);
  });

  it("stamps the pinned METRIC_VERSION into the report banner", () => {
    expect(generateQualityReport()).toContain(`metricVersion: ${METRIC_VERSION}`);
  });
});

describe("quality report: committed fixture", () => {
  it("matches the committed fixture byte-for-byte (regenerates deterministically)", () => {
    const committed = readFileSync(FIXTURE_PATH, "utf8");
    expect(generateQualityReport()).toBe(committed);
  });
});
