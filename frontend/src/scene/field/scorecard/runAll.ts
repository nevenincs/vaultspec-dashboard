// Scorecard run-all entry and text formatter (graph-viz-scorecard ADR,
// W04.P10.S44/S45/S46).
//
// A single entry point that runs EVERY layout's gate over its deterministic
// seeded fixture, collecting each `ScorecardVector` into one combined result
// keyed by layout, plus a `formatScorecard` helper that renders the per-layout
// per-metric pass/fail table as text. This combined run is the baseline capture
// for W04.P10 and the basis of the W06 quality report.
//
// SCOPE OF THIS PHASE (W04.P10): the plan splits the run across deterministic
// representation families (semantic, lineage + hierarchy, radial + cluster) over BOTH the live corpus
// slice and the seeded fixtures. The LIVE-corpus part requires a running engine
// (serve + rag + Qdrant) and so is deferred to W06, where the live stack is stood
// up and verified. For THIS phase the run scores over the deterministic FIXTURES
// the gates already own (each gate generates its own fixed-seed ground-truth and
// runs the REAL layout). The live-slice variant is left as a clearly-commented
// seam below (`runAllGatesOverSlice`) so W06 can score a provided live slice
// without restructuring this module.
//
// Bounded + deterministic by construction: every gate is itself bounded (node
// ceiling, fixed-seed pair sampling, capped settle loop) and deterministic (seeded
// mulberry32 PRNG, manual frame scheduler), so this aggregator adds no unbounded
// accumulator and no nondeterminism — it iterates a fixed, finite gate list once.

import { runHierarchyGate } from "../hierarchyGate";
import { runLineageGate } from "../lineageGate";
import { runRadialGate } from "../radialGate";
import { runClusterLfrGate, runClusterSbmGate } from "../clusterGate";
import { runSemanticScorecardGate } from "../semanticGate";
import { runSemanticGateOnRealData } from "../semanticGate";
import type { ScorecardVector } from "./scorecard";
import type { SceneEdgeData, SceneNodeData } from "../../sceneController";

/**
 * One gate's identity for the run-all list: the stable layout key the gate's
 * vector carries and the zero-arg function that runs the REAL layout over its
 * fixed-seed fixture and emits the `ScorecardVector`. The list is fixed and
 * finite (bounded-by-default); the run iterates it once.
 */
interface GateEntry {
  /** The layout key the gate's emitted vector carries (`vector.layout`). */
  layout: string;
  /** Run the REAL layout over its deterministic fixture and emit the vector. */
  run: () => ScorecardVector;
}

/**
 * The canonical run-all gate list, in report order: semantic, lineage,
 * hierarchy, radial, then the two cluster fixtures (SBM and LFR). This mirrors the
 * remaining deterministic layout gates. Cosmos live simulation is tuned directly
 * in the renderer and no longer runs through this deterministic seed scorecard.
 */
export const RUN_ALL_GATES: readonly GateEntry[] = [
  { layout: "semantic", run: runSemanticScorecardGate },
  { layout: "lineage", run: runLineageGate },
  { layout: "hierarchy", run: runHierarchyGate },
  { layout: "radial", run: runRadialGate },
  { layout: "cluster-sbm", run: runClusterSbmGate },
  { layout: "cluster-lfr", run: runClusterLfrGate },
] as const;

/**
 * Run EVERY gate over its deterministic seeded fixture and collect the per-layout
 * `ScorecardVector`s into one array, in `RUN_ALL_GATES` order. Pure and
 * byte-reproducible: each gate fixes its own fixture, layout settle, and metric
 * sampling by seed, so two calls produce identical vectors. This is the baseline
 * capture for W04.P10 and the per-layout scoring the W06 quality report renders.
 */
export function runAllGates(): ScorecardVector[] {
  return RUN_ALL_GATES.map((g) => g.run());
}

/**
 * The same run-all collapsed to a record keyed by layout, for callers that want to
 * look a layout up by name rather than iterate. The keys are the gate `layout`
 * values (`semantic`, `lineage`, `hierarchy`, `radial`, `cluster-sbm`,
 * `cluster-lfr`); insertion order follows `RUN_ALL_GATES`.
 */
export function runAllGatesKeyed(): Record<string, ScorecardVector> {
  const out: Record<string, ScorecardVector> = {};
  for (const v of runAllGates()) out[v.layout] = v;
  return out;
}

// ---------------------------------------------------------------------------
// LIVE-SLICE SEAM (W06).
//
// `runAllGatesOverSlice` is the seam for the live-corpus half of the plan's
// W04.P10 Steps (S44/S45/S46 each name "the live corpus slice"). It is a STUB in
// this phase: scoring the deployed layouts over a REAL served slice requires a
// running engine (serve + rag + Qdrant) to supply `/graph/query` nodes/edges and
// `/graph/embeddings` vectors, which W06's live-stack verification stands up. The
// seam is shaped now so W06 can pass a captured/live slice through the SAME
// scorecard contract without restructuring this module: it scores whichever gates
// can run over a provided slice (semantic over the embeddings, plus — when W06
// wires them — the geometric gates over the laid-out live positions) and returns
// the same `ScorecardVector[]` shape `runAllGates` returns.
//
// Until W06 wires the live layouts, the only gate that can score a provided slice
// without a layout-coordinate source is the semantic real-data gate, which already
// projects the slice's embeddings and measures presence/separation. That verdict
// is NOT yet folded into a `ScorecardVector` here (it is a `SemanticRealDataVerdict`
// shape, consumed by `liveAdapters.test.ts`); W06 is where the live-slice vectors
// are formalized. For now the seam returns an empty vector list and is exercised
// only for its type/shape, never as a CI fixture assertion.
// ---------------------------------------------------------------------------

/**
 * Score the deployed layouts over a PROVIDED live slice (W06 seam — stubbed in
 * W04.P10). `nodes`/`edges` are the app's already-adapted `SceneNodeData[]` /
 * `SceneEdgeData[]` (fed through the same `adaptGraphSlice` / `sceneMapping` path
 * the app uses, per mock-mirrors-live-wire-shape); `embeddings` is an optional
 * node_id-keyed real-embedding map for the semantic gate (the node_id join D1
 * contract). When omitted, the semantic real-data scoring is skipped.
 *
 * This phase (W04.P10) scores over the deterministic FIXTURES via `runAllGates`;
 * the live-slice scoring is W06's responsibility once the live stack is stood up.
 * The function is intentionally a no-op-shaped stub here so the live variant can be
 * filled in W06 without changing this module's surface: it returns an empty vector
 * list (no live layout coordinates are available to score in this phase) while
 * accepting the live-slice arguments the W06 caller will pass.
 */
export function runAllGatesOverSlice(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
  embeddings?: ReadonlyMap<string, readonly number[]>,
): ScorecardVector[] {
  // W06 seam: wire the live layouts and fold their scored positions into vectors
  // here. Until then, exercise the real-data semantic verdict over the provided
  // slice (when embeddings are present) purely so the seam is type-honest and the
  // embedding join is referenced, but do NOT emit a CI-gating vector — the live
  // baseline is W06's committed artifact, not this phase's.
  void edges;
  if (embeddings && embeddings.size > 0) {
    const labelOf = new Map<string, number>();
    let next = 0;
    const labelIndex = new Map<string, number>();
    for (const n of nodes) {
      const key = n.featureTags?.[0] ?? n.kind;
      if (!labelIndex.has(key)) labelIndex.set(key, next++);
      labelOf.set(n.id, labelIndex.get(key)!);
    }
    // Measured but not yet folded into a ScorecardVector (W06 formalizes the
    // live-slice vector shape); referencing it keeps the seam honest.
    void runSemanticGateOnRealData(nodes, labelOf);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Text rendering of the combined scorecard (the basis of the W06 quality report).
// ---------------------------------------------------------------------------

/** Render a [0,1] quality to a fixed 3-decimal string for stable column widths. */
function fmtValue(v: number): string {
  return v.toFixed(3);
}

/** Render a signed margin to a fixed 3-decimal string with an explicit sign so a
 *  shortfall reads unambiguously in the table. */
function fmtMargin(v: number): string {
  const s = v.toFixed(3);
  return v >= 0 ? `+${s}` : s;
}

/** Right-pad a cell to a fixed width for monospace column alignment. */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Render the combined scorecard (every layout's per-metric pass/fail) as a plain
 * text table. Each layout gets a header line with its overall PASS/FAIL and seed,
 * then one row per metric showing value, threshold, margin, and a PASS/FAIL mark.
 * A trailing summary line reports how many of the layouts passed. This is the
 * human-readable basis of the W06 quality report; it is pure (no clock, no wire)
 * and deterministic given a deterministic vector list.
 */
export function formatScorecard(vectors: readonly ScorecardVector[]): string {
  const lines: string[] = [];
  lines.push("LAYOUT-QUALITY SCORECARD");
  lines.push("========================");
  lines.push("");

  for (const v of vectors) {
    const verdict = v.passed ? "PASS" : "FAIL";
    lines.push(
      `${v.layout}  [${verdict}]  (seed=${v.seed}, metricVersion=${v.metricVersion})`,
    );
    lines.push(
      `  ${pad("metric", 26)}${pad("value", 9)}${pad("threshold", 11)}${pad("margin", 9)}result`,
    );
    for (const m of v.metrics) {
      const mark = m.pass ? "PASS" : "FAIL";
      lines.push(
        `  ${pad(m.name, 26)}${pad(fmtValue(m.value), 9)}${pad(fmtValue(m.threshold), 11)}${pad(fmtMargin(m.margin), 9)}${mark}`,
      );
    }
    lines.push("");
  }

  const passed = vectors.filter((v) => v.passed).length;
  const total = vectors.length;
  const allPass = passed === total;
  lines.push(
    `SUMMARY: ${passed}/${total} layouts passed all per-metric thresholds${
      allPass ? " — ALL PASS" : " — FAILURES PRESENT"
    }`,
  );

  return lines.join("\n");
}
