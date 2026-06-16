// Radial / tree layout scorecard gate (graph-viz-scorecard ADR, W01.P03.S17).
//
// Wraps the REAL `radialLayout` module over the planted layered-TREE fixture
// (`generateLayeredTree`) and scores the tidy-tree invariants (subtree
// disjointness, ring/wedge uniformity, depth-to-radius monotonicity, node overlap,
// near-zero crossings) against the fixture's true depth (`layerOf`) and `root` with
// the real `scoreRadialLayout` metric module. The layout is a deterministic pure
// function (no settle loop); the only bounded accumulators are the metric module's
// own grid-bucketed overlap check and crossing scan, capped by the node-bounded
// fixture.

import { radialLayout } from "./radialLayout";
import { toPositions } from "./hierarchyGate";
import { generateLayeredTree } from "./scorecard/generators/layered";
import { scoreRadialLayout } from "./scorecard/metrics/radialMetrics";
import {
  type ScorecardVector,
  buildScorecard,
  evaluate,
} from "./scorecard/scorecard";
import { RADIAL_THRESHOLDS } from "./scorecard/thresholds";

/** The fixed seed the radial gate's layered-tree fixture is generated from. */
export const RADIAL_GATE_SEED = 4;

/** The planted layered-tree fixture parameters: depth 4, fan-out 2..3, so the tree
 *  has multiple rings and sibling subtrees for the wedge/disjointness metrics. */
const TREE = {
  depth: 4,
  minFanout: 2,
  maxFanout: 3,
} as const;

/**
 * Run the REAL radial layout over the planted layered tree and score its tidy-tree
 * invariants against the fixture's true depth and root. Pure and byte-reproducible:
 * the seed fixes the fixture and the layout is deterministic.
 */
export function runRadialGate(): ScorecardVector {
  const fx = generateLayeredTree({ ...TREE, seed: RADIAL_GATE_SEED });
  const positions = toPositions(radialLayout(fx.nodes, fx.edges));
  const metrics = scoreRadialLayout(positions, fx.layerOf, fx.root, fx.edges);
  const results = evaluate(
    metrics as unknown as Record<string, number>,
    RADIAL_THRESHOLDS,
  );
  return buildScorecard("radial", results, RADIAL_GATE_SEED);
}
