// Scorecard vector type, per-metric pass/fail record, and the METRIC_VERSION
// contract constant (graph-viz-scorecard ADR, W01.P03.S14).
//
// The ADR is explicit (section 3, "Scorecard output, not a single number"): each
// gate emits a VECTOR of named metric values plus their thresholds, margins,
// pass/fail, seed, and a METRIC_VERSION. A per-family weighted aggregate may be
// *reported* for at-a-glance reading, but CI gates on the individual metric
// thresholds, NEVER on the aggregate — the literature is explicit that a flat
// average hides real metric trade-offs (SGD^2 criteria conflict).
//
// This module owns the shared shapes (`MetricResult`, `ScorecardVector`), the
// `evaluate` helper that turns named [0,1] metric values plus per-metric
// thresholds into pass/fail `MetricResult`s, and the version constant. Every
// `*Gate.ts` composes from here so the pass/fail law lives in ONE place: a
// ScorecardVector's `passed` is the AND of `metrics[*].pass`, never a mean or a
// weighted aggregate — that is the gate's truthfulness mechanism.

/**
 * The bumped-on-change contract version of the metric definitions
 * (graph-viz-scorecard ADR, section 4 / "Pitfalls to avoid": scoring drift from
 * an unversioned metric definition). A change to ANY metric's computation or to a
 * gate's metric set is a contract event that bumps this constant, so a committed
 * threshold baseline and a regenerated quality report can be matched to the metric
 * definitions that produced them. Pinned by a regression test (S20).
 */
export const METRIC_VERSION = 1;

/**
 * One metric's evaluation against its calibrated threshold. `value` is the [0,1]
 * quality the metric reported (1 = best); `threshold` is the floor it must meet or
 * exceed to pass; `margin` is `value - threshold` (positive = passing headroom,
 * negative = the shortfall); `pass` is `value >= threshold`. The per-metric pass is
 * the ONLY gate signal — `ScorecardVector.passed` is their AND.
 */
export interface MetricResult {
  /** The metric's stable name (the key in the metric module's output record). */
  name: string;
  /** The [0,1] quality the metric reported (1 = best). */
  value: number;
  /** The calibrated floor the value must meet or exceed to pass. */
  threshold: number;
  /** value - threshold: positive = passing headroom, negative = the shortfall. */
  margin: number;
  /** value >= threshold. The per-metric gate signal. */
  pass: boolean;
}

/**
 * A single gate's scorecard vector (graph-viz-scorecard ADR section 3): the layout
 * name, the per-metric results, the seed the deterministic fixture was generated
 * from, the METRIC_VERSION the metrics were computed under, and `passed` — the AND
 * of every metric's `pass`. `passed` is NEVER a mean, a weighted aggregate, or a
 * threshold on an aggregate score: one metric below its threshold fails the whole
 * vector even if every other metric is perfect, because a flat average hides the
 * real trade-off. A report-only aggregate, if ever wanted, is computed elsewhere
 * for at-a-glance reading and never feeds `passed`.
 */
export interface ScorecardVector {
  /** The layout family/mode this vector scores (e.g. "semantic", "lineage"). */
  layout: string;
  /** The per-metric pass/fail results. */
  metrics: MetricResult[];
  /** The PRNG seed the deterministic ground-truth fixture was generated from. */
  seed: number;
  /** The METRIC_VERSION the metrics were computed under. */
  metricVersion: number;
  /** The AND of every `metrics[*].pass`. Empty metrics -> true (vacuous). */
  passed: boolean;
}

/**
 * Turn a record of named [0,1] metric values plus a record of per-metric
 * thresholds into the per-metric `MetricResult` list. A metric named in `values`
 * with no entry in `thresholds` is gated against a threshold of 0 (it cannot fail —
 * an unthresholded metric is reported, not gated) so a new metric never silently
 * makes a gate red before it is calibrated; the calibration step (W01.P04) is what
 * raises it off the floor. The result order follows the insertion order of
 * `values` so a vector is stable across runs.
 */
export function evaluate(
  values: Readonly<Record<string, number>>,
  thresholds: Readonly<Record<string, number>>,
): MetricResult[] {
  const out: MetricResult[] = [];
  for (const [name, raw] of Object.entries(values)) {
    // A non-finite metric value is a degenerate computation: treat it as 0 (a
    // failed, not a perfect, drawing) so a NaN can never pass a gate.
    const value = Number.isFinite(raw) ? raw : 0;
    const threshold = thresholds[name] ?? 0;
    const margin = value - threshold;
    out.push({ name, value, threshold, margin, pass: value >= threshold });
  }
  return out;
}

/**
 * Build a `ScorecardVector` from a layout name, evaluated metric results, and the
 * fixture seed. `passed` is the AND of every metric's `pass` (an empty metric list
 * is vacuously true). This is the ONE place `passed` is derived, so no gate can
 * accidentally gate on an aggregate.
 */
export function buildScorecard(
  layout: string,
  metrics: MetricResult[],
  seed: number,
): ScorecardVector {
  const passed = metrics.every((m) => m.pass);
  return { layout, metrics, seed, metricVersion: METRIC_VERSION, passed };
}
