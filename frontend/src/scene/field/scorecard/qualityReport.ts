// The committed QUALITY REPORT: the quantified, visible goal-met artifact
// (graph-viz-scorecard ADR, graph-viz-quality plan W06.P17.S71).
//
// This module renders the standing scorecard harness into ONE stable text report
// that scores each of the six layout families (force, semantic, lineage, hierarchy,
// radial, clusters over SBM and LFR) against its per-metric calibrated thresholds.
// It is the campaign's Definition-of-Done evidence: a single human-readable document
// that says, under a named METRIC_VERSION, which layouts pass every per-metric floor
// and by how much.
//
// It is PURE and DETERMINISTIC by construction: it calls `runAllGates()` (each gate
// fixes its own ground-truth fixture, layout settle, and metric sampling by seed) and
// renders the resulting `ScorecardVector[]` through `formatScorecard`, wrapping that
// table in a stable report frame (title, METRIC_VERSION banner, the per-layout
// per-metric table the formatter already renders, and a final SUMMARY line). Two
// calls produce byte-identical output, so the report can be committed as a fixture
// and asserted to regenerate exactly (W06.P17.S72).
//
// It MASKS NOTHING: the per-layout PASS/FAIL and per-metric value/threshold/margin
// come straight from the gates' real layout runs. If a layout were below a floor it
// would render FAIL here and the SUMMARY would report the shortfall — a real finding,
// never hidden. W04.P10 confirmed all seven gate runs pass, so the committed report
// reads ALL PASS.
//
// Bounded-by-default: `runAllGates` iterates a fixed, finite gate list once and every
// gate is itself bounded (node ceiling, fixed-seed pair sampling, capped settle loop),
// so this report adds no unbounded accumulator and no nondeterminism.

import { METRIC_VERSION } from "./scorecard";
import { formatScorecard, runAllGates } from "./runAll";
import type { ScorecardVector } from "./scorecard";

/**
 * The report's stable title banner, rendered above the scorecard table. The
 * METRIC_VERSION is part of the report so a committed report can be matched to the
 * metric definitions that produced it (a metric-definition change bumps the version
 * as a contract event).
 */
const REPORT_TITLE = "GRAPH-VIZ QUALITY REPORT";

/**
 * Generate the committed quality report as a stable text document.
 *
 * Calls `runAllGates()` to score every layout family over its deterministic seeded
 * fixture, then renders the per-layout per-metric table via `formatScorecard` inside
 * a stable frame: a title, a METRIC_VERSION banner, the layout count, the scorecard
 * table itself (each layout's PASS/FAIL, seed, and per-metric value/threshold/margin),
 * and a final SUMMARY line "N/N layouts passed all per-metric thresholds".
 *
 * Pure and byte-reproducible: no clock, no wire, no `Math.random` — two calls return
 * identical strings. This is the quantified, visible goal-met artifact (W06.P17.S71).
 */
export function generateQualityReport(): string {
  const vectors: ScorecardVector[] = runAllGates();

  const passed = vectors.filter((v) => v.passed).length;
  const total = vectors.length;

  const lines: string[] = [];
  lines.push(REPORT_TITLE);
  lines.push("=".repeat(REPORT_TITLE.length));
  lines.push("");
  lines.push(`metricVersion: ${METRIC_VERSION}`);
  lines.push(`layout families scored: ${total}`);
  lines.push("");
  // The per-layout per-metric table (PASS/FAIL, seed, value/threshold/margin) the
  // run-all formatter already renders. It carries its own trailing per-table SUMMARY.
  lines.push(formatScorecard(vectors));
  lines.push("");
  // The report's own headline conclusion, phrased exactly as the goal-met line.
  lines.push(
    `QUALITY REPORT SUMMARY: ${passed}/${total} layouts passed all per-metric thresholds.`,
  );

  return lines.join("\n");
}

/**
 * The generated quality report string, materialized once at module load. This is the
 * committed-artifact form callers import to display or assert the goal-met evidence
 * without re-running the gates themselves. It is identical to `generateQualityReport()`
 * because the generation is pure and deterministic.
 */
export const QUALITY_REPORT: string = generateQualityReport();
