// Cluster / Louvain layout scorecard gate (graph-viz-scorecard ADR, W01.P03.S18).
//
// Wraps the REAL `communityLayout` (placement) and `detectCommunities` (the
// hand-rolled Louvain partition) over the SBM and LFR planted-partition fixtures.
// Two things are scored against the planted ground truth:
//   1. the DRAWN placement, via the real `scoreClusterLayout` metric module
//      (geometric k-means ARI/AMI, compactness, silhouette, modularity); and
//   2. the `detectCommunities` PARTITION RECOVERY directly — the chance-corrected
//      ARI/AMI of the detected membership vs the planted partition — surfaced as
//      `detectAri` / `detectAmi` metrics so the gate also fences the algorithm that
//      W02.P07.S34 affirms stays client-side, not only the drawing.
// Two vectors are emitted, one per fixture (SBM and LFR). The deterministic k-means
// is seeded from the gate PRNG; the metric module bounds its own O(N^2) terms.

import { detectCommunities, communityLayout } from "./communityLayout";
import { toPositions } from "./hierarchyGate";
import { generateLfr } from "./scorecard/generators/lfr";
import { generateSbm } from "./scorecard/generators/sbm";
import type { GraphFixture } from "./scorecard/generators/fixture";
import {
  adjustedMutualInformation,
  adjustedRandIndex,
  scoreClusterLayout,
} from "./scorecard/metrics/clusterMetrics";
import { clamp01 } from "./scorecard/metrics/shared";
import { makePrng } from "./scorecard/prng";
import { type ScorecardVector, buildScorecard, evaluate } from "./scorecard/scorecard";
import {
  CLUSTER_LFR_THRESHOLDS,
  CLUSTER_SBM_THRESHOLDS,
  type ThresholdSet,
} from "./scorecard/thresholds";

/** The fixed seeds the cluster gate's SBM and LFR fixtures are generated from. */
export const CLUSTER_SBM_GATE_SEED = 5;
export const CLUSTER_LFR_GATE_SEED = 6;

/** Score one planted-partition fixture: lay it out, detect communities, and emit a
 *  vector scoring BOTH the drawn placement and the detected partition recovery. */
function scoreFixture(
  layout: string,
  fx: GraphFixture,
  thresholds: ThresholdSet,
  seed: number,
): ScorecardVector {
  // 1. Drawn placement scored against the planted partition.
  const positions = toPositions(communityLayout(fx.nodes, fx.edges));
  const placement = scoreClusterLayout(
    positions,
    fx.partition,
    fx.edges,
    makePrng(seed),
  );

  // 2. detectCommunities partition recovery vs the planted partition, scored
  //    DIRECTLY by the chance-corrected ARI/AMI (the algorithm W02.P07.S34 affirms
  //    is scored client-side). Align the detected membership and the planted
  //    partition into index-aligned label arrays over the same node order.
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
  const detectAri = clamp01(adjustedRandIndex(truth, pred));
  const detectAmi = clamp01(adjustedMutualInformation(truth, pred));

  const values: Record<string, number> = {
    ...(placement as unknown as Record<string, number>),
    detectAri,
    detectAmi,
  };
  const results = evaluate(values, thresholds);
  return buildScorecard(layout, results, seed);
}

/** Run the cluster gate over the SBM planted-partition fixture. */
export function runClusterSbmGate(): ScorecardVector {
  const fx = generateSbm({
    sizes: [20, 20, 20],
    pIntra: 0.35,
    pInter: 0.01,
    seed: CLUSTER_SBM_GATE_SEED,
  });
  return scoreFixture("cluster-sbm", fx, CLUSTER_SBM_THRESHOLDS, CLUSTER_SBM_GATE_SEED);
}

/** Run the cluster gate over the LFR planted-partition fixture. */
export function runClusterLfrGate(): ScorecardVector {
  const fx = generateLfr({
    n: 80,
    mu: 0.15,
    degExp: 2.5,
    minDegree: 3,
    maxDegree: 12,
    commExp: 1.5,
    minCommunity: 8,
    maxCommunity: 20,
    seed: CLUSTER_LFR_GATE_SEED,
  });
  return scoreFixture("cluster-lfr", fx, CLUSTER_LFR_THRESHOLDS, CLUSTER_LFR_GATE_SEED);
}
