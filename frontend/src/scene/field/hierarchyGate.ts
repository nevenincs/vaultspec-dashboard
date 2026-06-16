// Hierarchy (Sugiyama) layout scorecard gate (graph-viz-scorecard ADR,
// W01.P03.S16).
//
// Wraps the REAL `hierarchicalLayout` module over the planted-layer DAG fixture
// (`generateLayeredDag`) and scores the drawn positions against the fixture's true
// `layerOf` with the real `scoreSugiyamaLayout` metric module. Hierarchical lays
// the structural backbone directly (no derivation label needed), so the fixture's
// backbone edges are fed unchanged. The shared DAG fixture parameters and the
// position-map adapter live here and are reused by the sibling `lineageGate`. The
// layout is a deterministic pure function (no settle loop); the only bounded
// accumulator is the metric module's per-layer crossing count, capped by the
// node-bounded fixture.

import { hierarchicalLayout } from "./hierarchicalLayout";
import { generateLayeredDag } from "./scorecard/generators/layered";
import { scoreSugiyamaLayout } from "./scorecard/metrics/sugiyamaMetrics";
import type { Position } from "./scorecard/metrics/shared";
import { type ScorecardVector, buildScorecard, evaluate } from "./scorecard/scorecard";
import { HIERARCHY_THRESHOLDS } from "./scorecard/thresholds";

/** The fixed seed the hierarchy gate's DAG fixture is generated from. */
export const HIERARCHY_GATE_SEED = 3;

/**
 * The planted-layer DAG fixture parameters shared by the lineage and hierarchy
 * gates: five ordered layers of five nodes, moderate density, edges spanning up to
 * two layers (so the dummy/bend and monotonicity metrics have signal). The two
 * gates differ only by seed.
 */
export const DAG_FIXTURE_PARAMS = {
  layers: 5,
  nodesPerLayer: 5,
  edgeProb: 0.25,
  maxSpan: 2,
} as const;

/** Copy a layout's position Map into the metric module's `Position` Map shape. */
export function toPositions(
  m: ReadonlyMap<string, { x: number; y: number }>,
): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const [id, p] of m) out.set(id, { x: p.x, y: p.y });
  return out;
}

/**
 * Run the REAL hierarchical layout over the planted-layer DAG and score it against
 * the true layering. Hierarchical lays the structural backbone directly, so the
 * fixture's backbone edges are fed unchanged.
 */
export function runHierarchyGate(): ScorecardVector {
  const fx = generateLayeredDag({
    ...DAG_FIXTURE_PARAMS,
    seed: HIERARCHY_GATE_SEED,
  });
  const positions = toPositions(hierarchicalLayout(fx.nodes, fx.edges));
  const metrics = scoreSugiyamaLayout(positions, fx.layerOf, fx.edges);
  const results = evaluate(
    metrics as unknown as Record<string, number>,
    HIERARCHY_THRESHOLDS,
  );
  return buildScorecard("hierarchy", results, HIERARCHY_GATE_SEED);
}
