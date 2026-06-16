// Lineage (Sugiyama) layout scorecard gate (graph-viz-scorecard ADR, W01.P03.S16).
//
// Wraps the REAL `lineageLayout` module over the planted-layer DAG fixture
// (`generateLayeredDag`) and scores the drawn positions against the fixture's true
// `layerOf` with the real `scoreSugiyamaLayout` metric module. The DAG edges are
// tagged with a `generated-by` derivation label so the real lineage spine layering
// fires (lineage lays only derivation-labelled edges). The sibling `hierarchyGate`
// wraps the general hierarchical layout over the same fixture family. The layout is
// a deterministic pure function (no settle loop); the only bounded accumulator is
// the metric module's per-layer crossing count, capped by the node-bounded fixture.

import { lineageLayout } from "./lineageLayout";
import { DAG_FIXTURE_PARAMS, toPositions } from "./hierarchyGate";
import { generateLayeredDag } from "./scorecard/generators/layered";
import { scoreSugiyamaLayout } from "./scorecard/metrics/sugiyamaMetrics";
import {
  type ScorecardVector,
  buildScorecard,
  evaluate,
} from "./scorecard/scorecard";
import { LINEAGE_THRESHOLDS } from "./scorecard/thresholds";
import type { SceneEdgeData } from "../sceneController";

/** The fixed seed the lineage gate's DAG fixture is generated from. */
export const LINEAGE_GATE_SEED = 2;

/**
 * Run the REAL lineage layout over the planted-layer DAG and score it against the
 * true layering. The DAG edges are tagged `generated-by` so the lineage spine
 * layering (which lays only derivation-labelled edges) fires over the whole fixture.
 */
export function runLineageGate(): ScorecardVector {
  const fx = generateLayeredDag({ ...DAG_FIXTURE_PARAMS, seed: LINEAGE_GATE_SEED });
  const edges: SceneEdgeData[] = fx.edges.map((e) => ({
    ...e,
    derivation: "generated-by",
  }));
  const result = lineageLayout(fx.nodes, edges);
  const positions = toPositions(result.positions);
  const metrics = scoreSugiyamaLayout(positions, fx.layerOf, edges);
  const results = evaluate(
    metrics as unknown as Record<string, number>,
    LINEAGE_THRESHOLDS,
  );
  return buildScorecard("lineage", results, LINEAGE_GATE_SEED);
}
