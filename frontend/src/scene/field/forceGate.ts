// Force / Free layout scorecard gate (graph-viz-scorecard ADR, W01.P03.S15).
//
// Wraps the REAL d3-force layout module (`forceLayout.FieldLayout`): builds a
// fixed-seed SBM community-blob fixture, settles the real simulation
// DETERMINISTICALLY (a synchronous frame scheduler pumps the tick loop until the
// driver's own settle-then-freeze fires — the same lifecycle the app uses, driven
// by hand so the gate is byte-reproducible), scores the settled positions with the
// real `scoreForceLayout` metric module, and emits a `ScorecardVector` gated on the
// provisional per-metric thresholds. Every accumulator is bounded: the fixture is
// node-count-bounded by construction, the settle loop is capped by a hard tick
// ceiling backstopping the driver's freeze, and the metric module bounds its own
// O(N^2) terms with a fixed-seed pair sample.

import {
  FieldLayout,
  type FrameScheduler,
  type LayoutEdgeRef,
} from "./forceLayout";
import type { NodePosition } from "./positionCache";
import { generateSbm } from "./scorecard/generators/sbm";
import { scoreForceLayout } from "./scorecard/metrics/forceMetrics";
import type { Position } from "./scorecard/metrics/shared";
import { makePrng } from "./scorecard/prng";
import {
  type ScorecardVector,
  buildScorecard,
  evaluate,
} from "./scorecard/scorecard";
import { FORCE_THRESHOLDS } from "./scorecard/thresholds";

/** The fixed seed the force gate's fixture and warm-start are generated from. */
export const FORCE_GATE_SEED = 1;

/**
 * Hard tick ceiling for the deterministic settle loop (bounded-by-default). The
 * d3-force driver settles in ~120 ticks on this bounded fixture via its own
 * settle-then-freeze; this ceiling is the call-site backstop so a non-converging
 * run can never spin forever — it stops and scores whatever the field reached.
 */
export const FORCE_GATE_TICK_CEILING = 2000;

/** The SBM fixture parameters: three well-separated blocks, ~60 nodes (a bounded
 *  blob the bounded LOD slice mirrors). Tight intra / sparse inter so the planted
 *  community signal is strong and the force layout has a clean structure to draw. */
const FIXTURE = {
  sizes: [20, 20, 20],
  pIntra: 0.35,
  pInter: 0.01,
  seed: FORCE_GATE_SEED,
} as const;

/**
 * A synchronous frame scheduler: it holds the single pending callback and runs it
 * on `pump()`. Injecting this into `FieldLayout` makes the simulation tick exactly
 * when the gate pumps, so the settle is fully deterministic (no
 * requestAnimationFrame, no wall-clock) — the determinism the CI gate depends on.
 */
function manualScheduler(): {
  scheduler: FrameScheduler;
  pump: () => boolean;
} {
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

/**
 * Run the REAL force layout to a deterministic settle over the fixed-seed SBM blob,
 * score it, and emit the scorecard vector. Pure and byte-reproducible: the seed
 * fixes the fixture, the warm-start jitter, and the metric pair sample; the manual
 * scheduler fixes the settle.
 */
export function runForceGate(): ScorecardVector {
  const fx = generateSbm(FIXTURE);
  const { scheduler, pump } = manualScheduler();
  const layout = new FieldLayout(scheduler);

  // Deterministic warm-start spread (no Math.random into the driver): seed every
  // node a position from the gate PRNG so the cold settle is reproducible.
  const seedPrng = makePrng(FORCE_GATE_SEED);
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

  // Pump the driver's tick loop until it freezes (settle-then-freeze) or the hard
  // tick ceiling backstops it — bounded at the call site.
  let ticks = 0;
  while (!settled && ticks < FORCE_GATE_TICK_CEILING) {
    if (!pump()) break; // the loop stopped scheduling (already frozen)
    ticks += 1;
  }

  const positions = new Map<string, Position>();
  for (const [id, p] of layout.positions) positions.set(id, { x: p.x, y: p.y });
  off();
  layout.destroy();

  const metrics = scoreForceLayout(
    positions,
    fx.nodes,
    fx.edges,
    makePrng(FORCE_GATE_SEED),
  );
  const results = evaluate(
    metrics as unknown as Record<string, number>,
    FORCE_THRESHOLDS,
  );
  return buildScorecard("force", results, FORCE_GATE_SEED);
}
