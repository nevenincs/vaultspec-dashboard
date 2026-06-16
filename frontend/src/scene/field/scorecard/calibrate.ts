// One-shot multi-seed threshold calibration sweep (graph-viz-scorecard ADR,
// W01.P04.S21).
//
// This is the CALIBRATION half of the ADR's "calibration vs gate split" (ADR
// section 4): a SEPARATE one-shot, multi-seed pass that measures the CURRENT
// shipping layouts across many seeds AND a difficulty sweep (SBM p/q, LFR mu, blob
// cluster_std, tree fan-out), collects each metric's distribution, and emits a
// calibrated threshold = (worst observed current-good value) minus a fixed margin.
// The result is the committed `thresholds.ts` baseline.
//
// THE GATE NEVER CALLS THIS. This module is a one-shot tool: a function
// (`calibrateAll`) plus a runnable entry (`formatCalibration` / the
// `import.meta.main`-style `main`), run by hand to (re)derive the committed
// constants. The ADR is explicit that letting the gate auto-recalibrate means it
// could never catch a regression ("Pitfalls to avoid"); so calibration is a
// deliberate, reviewed, committed act, not a runtime behaviour. The committed
// thresholds are the floor every shipping layout passes WITH margin, by
// construction (current-good-minus-margin).
//
// Determinism + bounding: every fixture is built on the seeded mulberry32 PRNG and
// every metric reuses the bounded scorers (fixed-seed pair sampling, fixed-k
// corners, k-means iteration cap), so two runs of the sweep are byte-identical and
// no accumulator is unbounded. The force layout is settled with the SAME
// deterministic manual-scheduler lifecycle the force gate uses.

import { FieldLayout, type FrameScheduler, type LayoutEdgeRef } from "../forceLayout";
import { communityLayout, detectCommunities } from "../communityLayout";
import { hierarchicalLayout } from "../hierarchicalLayout";
import { lineageLayout } from "../lineageLayout";
import { radialLayout } from "../radialLayout";
import { semanticProjection } from "../semanticLayout";
import type { NodePosition } from "../../positionCache";
import type { SceneEdgeData, SceneNodeData } from "../../sceneController";
import { generateBlobs } from "./generators/blobs";
import { generateLayeredDag, generateLayeredTree } from "./generators/layered";
import { generateLfr } from "./generators/lfr";
import { generateSbm } from "./generators/sbm";
import type { GraphFixture } from "./generators/fixture";
import {
  adjustedMutualInformation,
  adjustedRandIndex,
  scoreClusterLayout,
} from "./metrics/clusterMetrics";
import { scoreForceLayout } from "./metrics/forceMetrics";
import { scoreRadialLayout } from "./metrics/radialMetrics";
import { scoreSemanticLayout } from "./metrics/semanticMetrics";
import { type Position, clamp01 } from "./metrics/shared";
import { scoreSugiyamaLayout } from "./metrics/sugiyamaMetrics";
import { makePrng } from "./prng";

// ---------------------------------------------------------------------------
// Calibration configuration.
// ---------------------------------------------------------------------------

/**
 * The fixed margin subtracted from each metric's WORST observed current-good value
 * to form its committed floor (ADR section 4: "current-good minus a fixed margin").
 * A regression below `worst - MARGIN` flips the gate red; a margin this size keeps
 * the gate from flapping on the small seed-to-seed variance the sweep measures while
 * still catching a real degradation. The committed thresholds reproduce from the
 * sweep to within this margin by definition.
 */
export const CALIBRATION_MARGIN = 0.05;

/**
 * The seeds every layout is calibrated across. A fixed multi-seed set (not a single
 * fixture seed) is the whole point of calibration: it measures the seed-to-seed
 * spread so the floor is the WORST good case, not one lucky draw. Deterministic and
 * committed so the sweep reproduces.
 */
export const CALIBRATION_SEEDS: readonly number[] = [
  101, 102, 103, 104, 105, 106, 107, 108,
];

/**
 * Hard tick ceiling for the deterministic force settle (bounded-by-default),
 * mirroring the force gate's backstop: the driver settles via its own
 * settle-then-freeze well under this, and the ceiling stops a non-converging run.
 */
export const CALIBRATION_FORCE_TICK_CEILING = 4000;

/** SBM difficulty sweep: the p/q (intra/inter) contrast. Easier (high contrast)
 *  first, hardest (low contrast) last. Each entry is a fixture difficulty level. */
const SBM_DIFFICULTY: readonly { pIntra: number; pInter: number }[] = [
  { pIntra: 0.4, pInter: 0.01 },
  { pIntra: 0.35, pInter: 0.02 },
  { pIntra: 0.3, pInter: 0.04 },
];

/** LFR difficulty sweep: the mixing parameter mu (fraction of edges leaving the
 *  community). Low mu is easy, high mu is hard. */
const LFR_MU: readonly number[] = [0.1, 0.15, 0.2];

/** Blob difficulty sweep: cluster_std (cloud spread). Small = well-separated, large
 *  = overlapping. The semantic projection's hardest case is the widest std. */
const BLOB_STD: readonly number[] = [0.5, 0.7, 0.9];

// ---------------------------------------------------------------------------
// Result shapes.
// ---------------------------------------------------------------------------

/** A calibrated threshold record per metric (metric name -> floor in [0,1]). The
 *  thresholds module adopts exactly this shape. */
export type CalibratedThresholds = Record<string, number>;

/** Per-metric calibration statistics across the whole sweep: the observed min/mean/
 *  max current-good value and the derived floor (`min - MARGIN`, clamped to >= 0). */
export interface MetricCalibration {
  name: string;
  min: number;
  mean: number;
  max: number;
  /** The committed floor: `clamp01(min - CALIBRATION_MARGIN)`. */
  floor: number;
  /** How many (seed x difficulty) observations the stats were taken over. */
  samples: number;
}

/** One layout's calibration: its name and the per-metric calibrations, plus the
 *  threshold record the gate adopts. */
export interface LayoutCalibration {
  layout: string;
  metrics: MetricCalibration[];
  thresholds: CalibratedThresholds;
}

/** The full calibration output: one entry per calibrated layout, in a stable order,
 *  stamped with the margin and seed set used. Two runs produce byte-identical
 *  output (the determinism the smoke test asserts). */
export interface CalibrationOutput {
  margin: number;
  seeds: readonly number[];
  layouts: LayoutCalibration[];
}

// ---------------------------------------------------------------------------
// Deterministic force settle (mirrors forceGate's manual scheduler).
// ---------------------------------------------------------------------------

/**
 * A synchronous frame scheduler holding the single pending callback, run on
 * `pump()`. Identical in shape to the force gate's so the calibration settle is the
 * SAME deterministic lifecycle the gate measures (no requestAnimationFrame, no
 * wall-clock).
 */
function manualScheduler(): { scheduler: FrameScheduler; pump: () => boolean } {
  let pending: (() => void) | null = null;
  let counter = 1;
  const scheduler: FrameScheduler = {
    schedule(cb) {
      pending = cb;
      return counter++;
    },
    cancel() {
      pending = null;
    },
  };
  const pump = (): boolean => {
    const cb = pending;
    pending = null;
    if (!cb) return false;
    cb();
    return true;
  };
  return { scheduler, pump };
}

/** Settle the REAL force layout over a fixture deterministically and return the
 *  drawn positions, mirroring the force gate's lifecycle exactly. */
function settleForce(fx: GraphFixture, seed: number): Map<string, Position> {
  const { scheduler, pump } = manualScheduler();
  const layout = new FieldLayout(scheduler);

  const seedPrng = makePrng(seed);
  const warm = new Map<string, NodePosition>();
  for (const n of fx.nodes) {
    warm.set(n.id, {
      x: (seedPrng.next() * 2 - 1) * 400,
      y: (seedPrng.next() * 2 - 1) * 400,
    });
  }
  const edgeRefs: LayoutEdgeRef[] = fx.edges.map((e) => ({
    id: e.id,
    src: e.src,
    dst: e.dst,
  }));

  let settled = false;
  const off = layout.onSettle(() => {
    settled = true;
  });
  layout.init(
    fx.nodes.map((n) => n.id),
    edgeRefs,
    warm,
    null,
  );
  layout.start();

  let ticks = 0;
  while (!settled && ticks < CALIBRATION_FORCE_TICK_CEILING) {
    if (!pump()) break;
    ticks += 1;
  }

  const positions = new Map<string, Position>();
  for (const [id, p] of layout.positions) positions.set(id, { x: p.x, y: p.y });
  off();
  layout.destroy();
  return positions;
}

// ---------------------------------------------------------------------------
// Per-layout metric runs (seed + difficulty -> metric record). Each MIRRORS the
// corresponding *Gate.ts wiring so the calibrated floor measures exactly what the
// gate scores; they differ only by being parameterized over seed and difficulty.
// ---------------------------------------------------------------------------

const FORCE_FIXTURE_SIZES = [20, 20, 20] as const;

function runForceMetrics(
  seed: number,
  difficulty: { pIntra: number; pInter: number },
): Record<string, number> {
  const fx = generateSbm({
    sizes: FORCE_FIXTURE_SIZES,
    pIntra: difficulty.pIntra,
    pInter: difficulty.pInter,
    seed,
  });
  const positions = settleForce(fx, seed);
  return scoreForceLayout(
    positions,
    fx.nodes,
    fx.edges,
    makePrng(seed),
  ) as unknown as Record<string, number>;
}

const DAG_FIXTURE_PARAMS = {
  layers: 5,
  nodesPerLayer: 5,
  edgeProb: 0.25,
  maxSpan: 2,
} as const;

function toPositions(
  m: ReadonlyMap<string, { x: number; y: number }>,
): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const [id, p] of m) out.set(id, { x: p.x, y: p.y });
  return out;
}

function runLineageMetrics(seed: number): Record<string, number> {
  const fx = generateLayeredDag({ ...DAG_FIXTURE_PARAMS, seed });
  const edges: SceneEdgeData[] = fx.edges.map((e) => ({
    ...e,
    derivation: "generated-by",
  }));
  const result = lineageLayout(fx.nodes, edges);
  const positions = toPositions(result.positions);
  return scoreSugiyamaLayout(positions, fx.layerOf, edges) as unknown as Record<
    string,
    number
  >;
}

function runHierarchyMetrics(seed: number): Record<string, number> {
  const fx = generateLayeredDag({ ...DAG_FIXTURE_PARAMS, seed });
  const positions = toPositions(hierarchicalLayout(fx.nodes, fx.edges));
  return scoreSugiyamaLayout(positions, fx.layerOf, fx.edges) as unknown as Record<
    string,
    number
  >;
}

const TREE_FIXTURE_PARAMS = { depth: 4, minFanout: 2, maxFanout: 3 } as const;

function runRadialMetrics(seed: number): Record<string, number> {
  const fx = generateLayeredTree({ ...TREE_FIXTURE_PARAMS, seed });
  const positions = toPositions(radialLayout(fx.nodes, fx.edges));
  return scoreRadialLayout(
    positions,
    fx.layerOf,
    fx.root,
    fx.edges,
  ) as unknown as Record<string, number>;
}

/** Score one cluster fixture exactly as the cluster gate does: the drawn placement
 *  plus the `detectCommunities` partition-recovery ARI/AMI. */
function scoreClusterFixture(fx: GraphFixture, seed: number): Record<string, number> {
  const positions = toPositions(communityLayout(fx.nodes, fx.edges));
  const placement = scoreClusterLayout(
    positions,
    fx.partition,
    fx.edges,
    makePrng(seed),
  );
  const detected = detectCommunities(fx.nodes, fx.edges);
  const ids = fx.nodes.map((n) => n.id);
  const detLabelOf = new Map<string, number>();
  let next = 0;
  const labelIndex = new Map<string, number>();
  for (const id of ids) {
    const c = detected.membership.get(id) ?? id;
    if (!labelIndex.has(c)) labelIndex.set(c, next++);
    detLabelOf.set(id, labelIndex.get(c)!);
  }
  const truth = ids.map((id) => fx.partition.get(id) ?? -1);
  const pred = ids.map((id) => detLabelOf.get(id) ?? -1);
  return {
    ...(placement as unknown as Record<string, number>),
    detectAri: clamp01(adjustedRandIndex(truth, pred)),
    detectAmi: clamp01(adjustedMutualInformation(truth, pred)),
  };
}

function runClusterSbmMetrics(
  seed: number,
  difficulty: { pIntra: number; pInter: number },
): Record<string, number> {
  const fx = generateSbm({
    sizes: [20, 20, 20],
    pIntra: difficulty.pIntra,
    pInter: difficulty.pInter,
    seed,
  });
  return scoreClusterFixture(fx, seed);
}

function runClusterLfrMetrics(seed: number, mu: number): Record<string, number> {
  const fx = generateLfr({
    n: 80,
    mu,
    degExp: 2.5,
    minDegree: 3,
    maxDegree: 12,
    commExp: 1.5,
    minCommunity: 8,
    maxCommunity: 20,
    seed,
  });
  return scoreClusterFixture(fx, seed);
}

const SEMANTIC_FIXTURE_PARAMS = {
  count: 90,
  dims: 16,
  clusters: 4,
  centerSpread: 10,
} as const;

function runSemanticMetrics(seed: number, clusterStd: number): Record<string, number> {
  const fx = generateBlobs({ ...SEMANTIC_FIXTURE_PARAMS, clusterStd, seed });
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
  // Drop the reported-only diagnostic `qnxK` so it is not calibrated as a gating
  // metric (the gate drops it too).
  const { qnxK: _qnxK, ...gating } = metrics;
  void _qnxK;
  return gating as unknown as Record<string, number>;
}

// ---------------------------------------------------------------------------
// Sweep aggregation.
// ---------------------------------------------------------------------------

/** A `(seed, difficulty)` run yielding one metric record. The sweep collects many
 *  of these per layout and reduces each metric's distribution to a floor. */
type MetricRun = () => Record<string, number>;

/** Reduce a layout's runs into per-metric calibrations and a threshold record. The
 *  floor is the WORST (min) observed value minus the margin, clamped to [0,1]: a
 *  layout passes with margin on every calibrated seed/difficulty by construction. */
function calibrateLayout(
  layout: string,
  runs: readonly MetricRun[],
): LayoutCalibration {
  // metric name -> observed values across all runs.
  const observed = new Map<string, number[]>();
  // Preserve first-seen metric order for a stable output.
  const order: string[] = [];
  for (const run of runs) {
    const record = run();
    for (const [name, raw] of Object.entries(record)) {
      const value = Number.isFinite(raw) ? raw : 0;
      let arr = observed.get(name);
      if (!arr) {
        arr = [];
        observed.set(name, arr);
        order.push(name);
      }
      arr.push(value);
    }
  }

  const metrics: MetricCalibration[] = [];
  const thresholds: CalibratedThresholds = {};
  for (const name of order) {
    const values = observed.get(name)!;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const mean = values.length > 0 ? sum / values.length : 0;
    const floor = clamp01(min - CALIBRATION_MARGIN);
    metrics.push({ name, min, mean, max, floor, samples: values.length });
    thresholds[name] = floor;
  }
  return { layout, metrics, thresholds };
}

/** Build the full `(seed x difficulty)` run list for a layout from a per-pair run
 *  factory and the layout's difficulty sweep. */
function sweep<D>(
  difficulties: readonly D[],
  run: (seed: number, difficulty: D) => Record<string, number>,
): MetricRun[] {
  const runs: MetricRun[] = [];
  for (const seed of CALIBRATION_SEEDS) {
    for (const difficulty of difficulties) {
      runs.push(() => run(seed, difficulty));
    }
  }
  return runs;
}

/** Build a seed-only run list (for layouts whose fixture has no difficulty knob: the
 *  layered DAG/tree topology is the structure, the seed is the variation). */
function seedSweep(run: (seed: number) => Record<string, number>): MetricRun[] {
  return CALIBRATION_SEEDS.map((seed) => () => run(seed));
}

/**
 * Run the full multi-seed difficulty-swept calibration over every shipping layout
 * and emit the calibrated thresholds. Deterministic and bounded: byte-identical
 * across runs, every fixture seeded, every metric scorer call-site-bounded. THE GATE
 * NEVER CALLS THIS — it is the one-shot tool that produces the committed
 * `thresholds.ts` constants.
 */
export function calibrateAll(): CalibrationOutput {
  const layouts: LayoutCalibration[] = [
    calibrateLayout("force", sweep(SBM_DIFFICULTY, runForceMetrics)),
    calibrateLayout("lineage", seedSweep(runLineageMetrics)),
    calibrateLayout("hierarchy", seedSweep(runHierarchyMetrics)),
    calibrateLayout("radial", seedSweep(runRadialMetrics)),
    calibrateLayout("cluster-sbm", sweep(SBM_DIFFICULTY, runClusterSbmMetrics)),
    calibrateLayout("cluster-lfr", sweep(LFR_MU, runClusterLfrMetrics)),
    calibrateLayout("semantic", sweep(BLOB_STD, runSemanticMetrics)),
  ];
  return { margin: CALIBRATION_MARGIN, seeds: CALIBRATION_SEEDS, layouts };
}

// ---------------------------------------------------------------------------
// Runnable entry: format the calibration as committable TS constants + a stats
// table. Run by hand (e.g. `npx vitest run` of the calibrate smoke test prints it,
// or a small driver imports and logs `formatCalibration(calibrateAll())`).
// ---------------------------------------------------------------------------

/** Map a calibration layout name to its `thresholds.ts` export identifier. */
const THRESHOLD_EXPORT: Record<string, string> = {
  force: "FORCE_THRESHOLDS",
  lineage: "LINEAGE_THRESHOLDS",
  hierarchy: "HIERARCHY_THRESHOLDS",
  radial: "RADIAL_THRESHOLDS",
  "cluster-sbm": "CLUSTER_SBM_THRESHOLDS",
  "cluster-lfr": "CLUSTER_LFR_THRESHOLDS",
  semantic: "SEMANTIC_THRESHOLDS",
};

/** Format the calibration output as a human-readable report: per-layout per-metric
 *  observed min/mean/max and the derived floor, plus the committable threshold
 *  literal. This is what the operator reads to update `thresholds.ts` by hand. */
export function formatCalibration(out: CalibrationOutput): string {
  const lines: string[] = [];
  lines.push(
    `# Scorecard calibration (margin ${out.margin}, seeds ${out.seeds.join(", ")})`,
  );
  for (const layout of out.layouts) {
    lines.push("");
    lines.push(
      `## ${layout.layout} (export ${THRESHOLD_EXPORT[layout.layout] ?? "?"})`,
    );
    for (const m of layout.metrics) {
      lines.push(
        `  ${m.name.padEnd(26)} min=${m.min.toFixed(3)} mean=${m.mean.toFixed(3)} ` +
          `max=${m.max.toFixed(3)} -> floor=${m.floor.toFixed(3)} (n=${m.samples})`,
      );
    }
    const literal = layout.metrics
      .map((m) => `  ${m.name}: ${m.floor.toFixed(2)},`)
      .join("\n");
    lines.push(`  ${THRESHOLD_EXPORT[layout.layout] ?? layout.layout} = {`);
    lines.push(literal);
    lines.push("  };");
  }
  return lines.join("\n");
}
