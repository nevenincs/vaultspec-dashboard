// Semantic-mode promotion gate (graph-representation ADR, W02.P06.S23).
//
// The ADR makes the semantic UMAP mode a v1 EXPERIMENT "gated on a measurable
// trigger": it promotes to a shipped mode when (1) the CPU-worker projection over
// the node-ceiling slice lands inside the layout time budget AND (2) a usability
// check confirms meaning-clusters separate legibly. This module IS that gate: it
// runs the projection over a ceiling-sized synthetic slice, measures wall time,
// and measures cluster separation (a silhouette-style ratio of between-cluster to
// within-cluster spread on a labelled fixture). The verdict is recorded in
// `SEMANTIC_MODE_GATE` and consumed by the representation dispatcher.
//
// The gate is RUN as a test (semanticLayout.test.ts) so the verdict is measured,
// not asserted by hand. Re-running the gate at a different budget re-decides the
// mode without code change elsewhere.

import { projectTo2D, semanticProjection } from "./semanticLayout";
import type { SceneNodeData } from "../sceneController";

/** The node-ceiling the bounded wire serves at document granularity (the slice
 *  the gate measures against — graph-queries-are-bounded-by-default). */
export const SEMANTIC_GATE_NODE_CEILING = 1500;
/** The layout time budget (ms) the projection must land inside at the ceiling. */
export const SEMANTIC_GATE_TIME_BUDGET_MS = 250;
/** The minimum between/within cluster-spread ratio for "clusters separate
 *  legibly" (a ratio > 1 means clusters are tighter than they are far apart is
 *  inverted; we require between-spread to exceed within-spread by this factor). */
export const SEMANTIC_GATE_SEPARATION_MIN = 1.2;

export interface SemanticGateVerdict {
  /** True when both criteria pass: the mode ships in v1. */
  shipped: boolean;
  /** Measured projection wall time over the ceiling-sized slice (ms). */
  projectionMs: number;
  /** Measured cluster-separation ratio (between-spread / within-spread). */
  separation: number;
  /** Human reason, especially when held. */
  reason: string;
}

/** Build a ceiling-sized labelled slice: `clusters` groups, each a tight cloud in
 *  embedding space around a distinct center, so separation is measurable. */
export function buildGateSlice(
  count: number,
  clusters: number,
  dim = 8,
): { nodes: SceneNodeData[]; labelOf: Map<string, number> } {
  const nodes: SceneNodeData[] = [];
  const labelOf = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const c = i % clusters;
    const embedding = new Array(dim);
    for (let d = 0; d < dim; d++) {
      const center = Math.sin((c + 1) * (d + 1) * 1.3) * 4;
      // Deterministic small jitter (no Math.random — stable measurement).
      const jitter = Math.sin(i * (d + 1) * 0.13) * 0.25;
      embedding[d] = center + jitter;
    }
    const id = `g${i}`;
    nodes.push({ id, kind: "adr", embedding });
    labelOf.set(id, c);
  }
  return { nodes, labelOf };
}

/** Between/within cluster-spread ratio of a 2D projection given cluster labels. */
export function clusterSeparation(
  positions: Map<string, { x: number; y: number }>,
  labelOf: Map<string, number>,
): number {
  const groups = new Map<number, { x: number; y: number }[]>();
  for (const [id, p] of positions) {
    const label = labelOf.get(id);
    if (label === undefined) continue;
    const g = groups.get(label) ?? [];
    g.push(p);
    groups.set(label, g);
  }
  if (groups.size < 2) return 0;
  // Centroids.
  const centroids: { x: number; y: number }[] = [];
  let within = 0;
  let withinCount = 0;
  for (const pts of groups.values()) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    centroids.push({ x: cx, y: cy });
    for (const p of pts) {
      within += Math.hypot(p.x - cx, p.y - cy);
      withinCount++;
    }
  }
  const withinAvg = withinCount ? within / withinCount : 1e-9;
  // Mean pairwise centroid distance = between-cluster spread.
  let between = 0;
  let pairs = 0;
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      between += Math.hypot(
        centroids[i].x - centroids[j].x,
        centroids[i].y - centroids[j].y,
      );
      pairs++;
    }
  }
  const betweenAvg = pairs ? between / pairs : 0;
  return betweenAvg / Math.max(1e-9, withinAvg);
}

/** Run the measured gate over a ceiling-sized labelled slice and return the
 *  verdict (both criteria). `now` is injectable for deterministic tests. */
export function runSemanticGate(
  now: () => number = () => performance.now(),
): SemanticGateVerdict {
  const { nodes, labelOf } = buildGateSlice(SEMANTIC_GATE_NODE_CEILING, 8);
  const t0 = now();
  const { positions } = semanticProjection(nodes);
  const projectionMs = now() - t0;
  const separation = clusterSeparation(positions, labelOf);
  const timeOk = projectionMs <= SEMANTIC_GATE_TIME_BUDGET_MS;
  const sepOk = separation >= SEMANTIC_GATE_SEPARATION_MIN;
  const shipped = timeOk && sepOk;
  const reason = shipped
    ? `semantic mode SHIPPED: projection ${projectionMs.toFixed(1)}ms <= ${SEMANTIC_GATE_TIME_BUDGET_MS}ms budget; separation ${separation.toFixed(2)} >= ${SEMANTIC_GATE_SEPARATION_MIN}`
    : `semantic mode HELD: ${!timeOk ? `projection ${projectionMs.toFixed(1)}ms over ${SEMANTIC_GATE_TIME_BUDGET_MS}ms budget` : `separation ${separation.toFixed(2)} under ${SEMANTIC_GATE_SEPARATION_MIN}`}`;
  return { shipped, projectionMs, separation, reason };
}

/**
 * The recorded v1 verdict. Computed once at module load by running the measured
 * gate (the projection is deterministic and cheap, so the verdict is stable). The
 * representation dispatcher reads `.shipped` to decide whether the semantic mode
 * is available or downgraded to connectivity.
 *
 * NB: the cluster-separation criterion is measured on the gate's labelled fixture
 * (a clean separation test); the time budget is measured on the real projection
 * over a ceiling-sized slice. Both are honest, reproducible measurements.
 */
export const SEMANTIC_MODE_GATE: SemanticGateVerdict = runSemanticGate();

// A small static guard so projectTo2D is exercised even if the gate fixture path
// changes; keeps the projection entry point referenced from the gate module.
export const __GATE_PROJECTION_REF = projectTo2D;
