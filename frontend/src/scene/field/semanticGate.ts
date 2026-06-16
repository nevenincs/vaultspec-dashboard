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
import { generateBlobs } from "./scorecard/generators/blobs";
import { scoreSemanticLayout } from "./scorecard/metrics/semanticMetrics";
import type { Position } from "./scorecard/metrics/shared";
import { type ScorecardVector, buildScorecard, evaluate } from "./scorecard/scorecard";
import { SEMANTIC_THRESHOLDS } from "./scorecard/thresholds";
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

/**
 * The REAL-DATA separation floor (graph-semantic-embeddings ADR D6 re-spec): the
 * minimum cluster-separation the projection must achieve over a captured REAL
 * served `/graph/embeddings` slice (not the synthetic fixture). Real rag vectors
 * cluster less cleanly than the synthetic gate fixture, so this is a SEPARATE,
 * plan-time-calibrated floor STARTING at the synthetic `1.2` (ADR open question):
 * re-running the real-data gate at a different calibration re-decides the floor
 * without a code change elsewhere.
 */
export const SEMANTIC_GATE_REAL_SEPARATION_MIN = 1.2;

/**
 * The minimum fraction of served nodes that must carry a real embedding for the
 * real-data gate to consider the path NON-empty (ADR D6: the gate cannot report
 * shipped on a path that delivers no embeddings). A slice where almost every node
 * falls into the fallback ring is the unserved-embedding failure the original
 * synthetic-only gate masked; a small floor above zero rejects it honestly while
 * tolerating the legitimate minority of embeddingless nodes (a doc not yet in
 * Qdrant).
 */
export const SEMANTIC_GATE_DATA_PRESENCE_MIN = 0.5;

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

/**
 * The real-data gate verdict (graph-semantic-embeddings ADR D6 re-spec): the
 * separation AND a data-presence criterion measured against a captured REAL
 * served slice (run through the same `adaptGraphEmbeddings`/`sceneMapping` path
 * the app uses — the feeding is done by the consumer test per
 * mock-mirrors-live-wire-shape, so this scene module stays stores-free and
 * operates on the already-mapped `SceneNodeData[]`). The synthetic
 * `buildGateSlice`/`runSemanticGate` is retained ONLY for the projection-time
 * budget; this is what proves the mode does not ship on an empty path.
 */
export interface SemanticRealDataVerdict {
  /** True when BOTH the data-presence floor and the real-data separation floor
   *  pass: the mode is real (not the unserved-embedding fallback ring). */
  shipped: boolean;
  /** Fraction of nodes carrying a real embedding (1 - fallback fraction). */
  presence: number;
  /** Measured cluster-separation over the real served vectors. */
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
 * The fraction of a served slice carrying a REAL embedding (the data-presence
 * measurement, ADR D6). `fallbackIds` are the nodes the projection placed in the
 * holding ring because they lack an embedding; presence is one minus their
 * fraction. An all-fallback slice (the unserved-embedding failure the synthetic
 * gate masked) has presence 0; a fully-embedded slice has presence 1.
 */
export function dataPresence(totalNodes: number, fallbackCount: number): number {
  if (totalNodes <= 0) return 0;
  return Math.max(0, (totalNodes - fallbackCount) / totalNodes);
}

/**
 * Run the REAL-DATA gate over a captured served slice (ADR D6 re-spec): the nodes
 * are the app's `SceneNodeData`, already carrying their real embeddings via the
 * same `adaptGraphEmbeddings`/`sceneMapping` path the app uses (the consumer test
 * feeds a captured live sample through that path, then calls this). It measures
 * BOTH the data-presence fraction and the cluster separation over the REAL
 * vectors, and ships only when BOTH clear their floors — so the gate cannot
 * report shipped on a path that delivers no embeddings (the synthetic-only blind
 * spot D6 closes). `labelOf` assigns each node a cluster label (e.g. its feature)
 * so separation is measurable; nodes without a label are ignored for separation.
 */
export function runSemanticGateOnRealData(
  nodes: readonly SceneNodeData[],
  labelOf: Map<string, number>,
): SemanticRealDataVerdict {
  const { positions, fallbackIds } = semanticProjection(nodes);
  const presence = dataPresence(nodes.length, fallbackIds.length);
  const separation = clusterSeparation(positions, labelOf);
  const presenceOk = presence >= SEMANTIC_GATE_DATA_PRESENCE_MIN;
  const sepOk = separation >= SEMANTIC_GATE_REAL_SEPARATION_MIN;
  const shipped = presenceOk && sepOk;
  const reason = shipped
    ? `semantic mode REAL-DATA SHIPPED: presence ${(presence * 100).toFixed(0)}% >= ${(SEMANTIC_GATE_DATA_PRESENCE_MIN * 100).toFixed(0)}%; separation ${separation.toFixed(2)} >= ${SEMANTIC_GATE_REAL_SEPARATION_MIN}`
    : `semantic mode REAL-DATA HELD: ${!presenceOk ? `presence ${(presence * 100).toFixed(0)}% under ${(SEMANTIC_GATE_DATA_PRESENCE_MIN * 100).toFixed(0)}% (empty/fallback path)` : `separation ${separation.toFixed(2)} under ${SEMANTIC_GATE_REAL_SEPARATION_MIN}`}`;
  return { shipped, presence, separation, reason };
}

/**
 * The recorded v1 verdict. Computed once at module load by running the measured
 * gate (the projection is deterministic and cheap, so the verdict is stable). The
 * representation dispatcher reads `.shipped` to decide whether the semantic mode
 * is available or downgraded to connectivity.
 *
 * Re-spec (graph-semantic-embeddings ADR D6): the synthetic `buildGateSlice`
 * fixture is now retained ONLY for the projection-TIME budget here. The
 * data-presence + real-data separation criteria — proving the mode does not ship
 * on an EMPTY (unserved-embedding) path — run against a captured REAL served
 * slice via `runSemanticGateOnRealData`, fed through the real
 * `adaptGraphEmbeddings`/`sceneMapping` path by the consumer test
 * (`liveAdapters.test.ts`, mock-mirrors-live-wire-shape). This module-level
 * verdict keeps the synthetic projection-budget + separation measurement (the
 * dispatcher's availability decision); the real-data gate is the honesty check
 * the original synthetic-only gate was missing.
 */
export const SEMANTIC_MODE_GATE: SemanticGateVerdict = runSemanticGate();

// A small static guard so projectTo2D is exercised even if the gate fixture path
// changes; keeps the projection entry point referenced from the gate module.
export const __GATE_PROJECTION_REF = projectTo2D;

// ---------------------------------------------------------------------------
// Formalized scorecard composite (graph-viz-scorecard ADR, W01.P03.S19).
//
// The ADR's section 2 ("the existing gate is already a named metric") formalizes
// the legacy single-ratio separation gate into the literature-backed semantic
// metric set: trustworthiness, continuity, Q_NX, neighbourhood-hit, silhouette,
// and nearest-centroid. This gate emits that composite as a `ScorecardVector`,
// gated on the per-metric thresholds and never on an aggregate — the same
// scorecard contract every other layout's gate honours. It runs the REAL semantic
// projection (`semanticProjection` -> `projectTo2D`) over a fixed-seed make_blobs
// mixture and scores the projected 2D positions against the planted high-dim
// vectors and labels with the real `scoreSemanticLayout` metric module.
//
// This is ADDITIVE: the existing `runSemanticGate`, `runSemanticGateOnRealData`,
// `SEMANTIC_MODE_GATE`, and the projection-time/separation verdicts above are kept
// intact for their current callers (the representation dispatcher reads
// `SEMANTIC_MODE_GATE.shipped`; `liveAdapters.test.ts` feeds the real-data gate).
// The composite is the formalized quality vector the scorecard harness consumes.
// ---------------------------------------------------------------------------

/** The fixed seed the semantic gate's make_blobs fixture is generated from. */
export const SEMANTIC_GATE_SCORECARD_SEED = 7;

/** The make_blobs fixture parameters: four Gaussian clusters in 16-D, a moderate
 *  cluster_std so the projection has real structure to preserve (the difficulty
 *  knob the W01.P04 calibration sweeps). */
const SCORECARD_FIXTURE = {
  count: 90,
  dims: 16,
  clusters: 4,
  clusterStd: 0.6,
  seed: SEMANTIC_GATE_SCORECARD_SEED,
  centerSpread: 10,
} as const;

/**
 * Run the formalized semantic scorecard composite over the fixed-seed make_blobs
 * mixture: build the fixture, project it with the REAL `semanticProjection`, score
 * the projection against the planted vectors and labels with the real
 * `scoreSemanticLayout`, and emit the `ScorecardVector` gated on the per-metric
 * thresholds. Pure and byte-reproducible: the seed fixes the fixture and the
 * projection is deterministic.
 */
export function runSemanticScorecardGate(): ScorecardVector {
  const fx = generateBlobs(SCORECARD_FIXTURE);
  const nodes: SceneNodeData[] = fx.vectors.map((v, i) => ({
    id: `sem-${i}`,
    kind: "adr",
    embedding: v,
  }));
  const { positions } = semanticProjection(nodes);
  const orderedPositions: Position[] = nodes.map(
    (n) => positions.get(n.id) ?? { x: 0, y: 0 },
  );
  const metrics = scoreSemanticLayout(fx.vectors, orderedPositions, fx.labels);
  // Drop the reported-only diagnostic `qnxK` (the chosen K, not a [0,1] quality)
  // so it is not evaluated as a gating metric.
  const { qnxK: _qnxK, ...gating } = metrics;
  void _qnxK;
  const results = evaluate(
    gating as unknown as Record<string, number>,
    SEMANTIC_THRESHOLDS,
  );
  return buildScorecard("semantic", results, SEMANTIC_GATE_SCORECARD_SEED);
}
