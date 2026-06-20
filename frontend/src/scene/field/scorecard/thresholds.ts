// CALIBRATED per-layout per-metric thresholds for the scorecard gates
// (graph-viz-scorecard ADR, W01.P04.S22).
//
// COMMITTED CALIBRATION OUTPUT - NOT auto-recalibrated by the gate. These constants
// are the multi-seed difficulty-swept calibration baseline committed here. Each floor is
// the WORST (minimum) value the CURRENT shipping layout reached for that metric
// across the calibration seed set (101..108) and the difficulty sweep (SBM p/q, LFR
// mu, blob cluster_std), minus a fixed CALIBRATION_MARGIN (0.05), clamped to >= 0 -
// i.e. current-good-minus-margin, exactly the ADR section-4 calibration-vs-gate
// split. Because the floor is the swept worst case minus a margin, every shipping
// layout passes its gate WITH margin by construction.
//
// THE GATE NEVER RE-RUNS THE CALIBRATION (ADR "Pitfalls to avoid": a gate that
// auto-recalibrates could never catch a regression). Re-deriving these constants is a
// deliberate, reviewed act: rerun the layout-family calibration workflow, update
// the literals below, and bump METRIC_VERSION (in `scorecard.ts`) if any metric
// DEFINITION changed (the thresholds are matched to a metric version).
//
// Per the ADR's gating law (section 3) the gate compares each metric to ITS OWN
// threshold and ANDs the per-metric passes; there is no aggregate threshold here.
//
// Calibration sweep summary (worst observed -> committed floor = worst - 0.05):
//   lineage/dag      crossings 1.000->0.95  bendProxy 0.619->0.57
//                    monotonicity 0.524->0.47  edgeLength 0.724->0.67
//                    layerAssignment 0.280->0.23
//   hierarchy/dag    crossings 0.711->0.66  bendProxy 0.619->0.57
//                    monotonicity 1.000->0.95  edgeLength 0.724->0.67
//                    layerAssignment 1.000->0.95
//   radial/tree      subtreeDisjointness 0.833->0.78  uniformity 0.581->0.53
//                    depthRadius 0.702->0.65  nodeOverlap 1.000->0.95
//                    crossings 0.999->0.95
//   cluster/sbm      ari 0.148->0.10  ami 0.202->0.15  compactness 0.194->0.14
//                    silhouette 0.579->0.53  modularity 0.420->0.37
//                    detectAri 0.705->0.65  detectAmi 0.636->0.59
//   cluster/lfr      ari 0.170->0.12  ami 0.274->0.22  compactness 0.271->0.22
//                    silhouette 0.466->0.42  modularity 0.551->0.50
//                    detectAri 0.442->0.39  detectAmi 0.510->0.46

/** A per-metric threshold record: metric name -> floor in [0,1]. */
export type ThresholdSet = Readonly<Record<string, number>>;

/** Force / Free layout thresholds (scored over the SBM blob fixture). */
export const FORCE_THRESHOLDS: ThresholdSet = {
  stress: 0.82,
  neighborhoodPreservation: 0.14,
  nodeResolution: 0.08,
  edgeLengthUniformity: 0.49,
  crossings: 0.88,
  crossingAngle: 0.69,
};

/** Lineage (Sugiyama) thresholds, scored over the layered-DAG fixture against the
 *  planted layering. The lineage layout's off-spine grid quantization disagrees with
 *  the band-rank layerAssignment scorer on a multi-source DAG, so that floor stays
 *  the lowest of the family - but it is now the calibrated worst-case-minus-margin,
 *  not a hand-set guess. */
export const LINEAGE_THRESHOLDS: ThresholdSet = {
  crossings: 0.95,
  bendProxy: 0.57,
  monotonicity: 0.47,
  edgeLength: 0.67,
  layerAssignment: 0.23,
};

/** Hierarchy (Sugiyama) thresholds, scored over the layered-DAG fixture. */
export const HIERARCHY_THRESHOLDS: ThresholdSet = {
  crossings: 0.66,
  bendProxy: 0.57,
  monotonicity: 0.95,
  edgeLength: 0.67,
  layerAssignment: 0.95,
};

/** Radial / tree thresholds, scored over the layered-tree fixture. */
export const RADIAL_THRESHOLDS: ThresholdSet = {
  subtreeDisjointness: 0.78,
  uniformity: 0.53,
  depthRadius: 0.65,
  nodeOverlap: 0.95,
  crossings: 0.95,
};

/** Cluster / Louvain thresholds over the SBM planted partition. The geometric
 *  k-means recovery (ARI/AMI) and compactness floors are the calibration's worst-case
 *  over the difficulty sweep: the deterministic community SEED packs members tightly
 *  but the planted blocks overlap geometrically, so the geometric-recovery floors are
 *  necessarily low. detectAri/detectAmi fence the Louvain hand-roll directly
 *  (W02.P07.S34). */
export const CLUSTER_SBM_THRESHOLDS: ThresholdSet = {
  ari: 0.1,
  ami: 0.15,
  compactness: 0.14,
  silhouette: 0.53,
  modularity: 0.37,
  detectAri: 0.65,
  detectAmi: 0.59,
};

/** Cluster / Louvain thresholds over the LFR planted partition. */
export const CLUSTER_LFR_THRESHOLDS: ThresholdSet = {
  ari: 0.12,
  ami: 0.22,
  compactness: 0.22,
  silhouette: 0.42,
  modularity: 0.5,
  detectAri: 0.39,
  detectAmi: 0.46,
};
