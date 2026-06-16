// PROVISIONAL per-layout per-metric thresholds for the scorecard gates
// (graph-viz-scorecard ADR, W01.P03 S22-precursor).
//
// PROVISIONAL - W01.P04 calibration replaces these with a committed multi-seed
// current-good-minus-margin sweep. These constants are NOT the calibrated baseline:
// they were derived by running each REAL layout over its deterministic ground-truth
// fixture ONCE (the same fixtures the *Gate.ts modules use, at the same seeds) and
// setting each metric's threshold to a conservative floor = observed score minus a
// margin, clamped to >= 0. The single-seed observation is exactly the blind spot the
// calibration script (W01.P04.S21) closes by sweeping difficulty across many seeds
// and committing current-good-minus-margin; until then these floors keep each gate
// green on its own fixture without falsely passing a badly-degraded layout.
//
// Per the ADR's gating law (section 3) the gate compares each metric to ITS OWN
// threshold and ANDs the per-metric passes; there is no aggregate threshold here.
//
// Observed scores the floors are derived from (single fixed-seed run, recorded for
// the W01.P04 calibration to supersede):
//   force/sbm        stress 0.890  neighborhoodPreservation 0.340  nodeResolution 0.188
//                    edgeLengthUniformity 0.546  crossings 0.959  crossingAngle 0.764
//   lineage/dag      crossings 1.000  bendProxy 0.672  monotonicity 0.638
//                    edgeLength 0.753  layerAssignment 0.280
//   hierarchy/dag    crossings 0.808  bendProxy 0.815  monotonicity 1.000
//                    edgeLength 0.844  layerAssignment 1.000
//   radial/tree      subtreeDisjointness 0.893  uniformity 0.677  depthRadius 0.755
//                    nodeOverlap 1.000  crossings 1.000
//   cluster/sbm      ari 0.440  ami 0.468  compactness 0.265  silhouette 0.621
//                    modularity 0.604
//   cluster/lfr      ari 0.410  ami 0.605  compactness 0.628  silhouette 0.572
//                    modularity 0.733
//   semantic/blobs   trustworthiness 0.973  continuity 0.975  qnx 0.947
//                    neighborhoodHit 1.000  silhouette 0.974  nearestCentroid 1.000

/** A per-metric threshold record: metric name -> floor in [0,1]. */
export type ThresholdSet = Readonly<Record<string, number>>;

/** Force / Free layout thresholds (scored over the SBM blob fixture). */
export const FORCE_THRESHOLDS: ThresholdSet = {
  stress: 0.75,
  neighborhoodPreservation: 0.2,
  nodeResolution: 0.08,
  edgeLengthUniformity: 0.4,
  crossings: 0.85,
  crossingAngle: 0.6,
};

/** Lineage (Sugiyama) thresholds, scored over the layered-DAG fixture against the
 *  planted layering. The lineage layout's off-spine grid quantization disagrees
 *  with the band-rank layerAssignment scorer on a multi-source DAG, so that floor
 *  is conservative; W01.P04 calibration will refine it. */
export const LINEAGE_THRESHOLDS: ThresholdSet = {
  crossings: 0.85,
  bendProxy: 0.5,
  monotonicity: 0.5,
  edgeLength: 0.6,
  layerAssignment: 0.15,
};

/** Hierarchy (Sugiyama) thresholds, scored over the layered-DAG fixture. */
export const HIERARCHY_THRESHOLDS: ThresholdSet = {
  crossings: 0.65,
  bendProxy: 0.65,
  monotonicity: 0.85,
  edgeLength: 0.7,
  layerAssignment: 0.85,
};

/** Radial / tree thresholds, scored over the layered-tree fixture. */
export const RADIAL_THRESHOLDS: ThresholdSet = {
  subtreeDisjointness: 0.75,
  uniformity: 0.5,
  depthRadius: 0.6,
  nodeOverlap: 0.85,
  crossings: 0.85,
};

/** Cluster / Louvain thresholds over the SBM planted partition. The geometric
 *  k-means recovery (ARI/AMI) and compactness floors are conservative because the
 *  deterministic two-level community SEED (not a settled force pack) packs members
 *  tightly per community but the planted blocks overlap geometrically. */
export const CLUSTER_SBM_THRESHOLDS: ThresholdSet = {
  ari: 0.3,
  ami: 0.3,
  compactness: 0.15,
  silhouette: 0.5,
  modularity: 0.5,
  // detectCommunities recovers the planted SBM partition exactly (ARI=AMI=1.0);
  // a high floor fences the Louvain hand-roll directly (W02.P07.S34).
  detectAri: 0.85,
  detectAmi: 0.85,
};

/** Cluster / Louvain thresholds over the LFR planted partition. */
export const CLUSTER_LFR_THRESHOLDS: ThresholdSet = {
  ari: 0.25,
  ami: 0.45,
  compactness: 0.5,
  silhouette: 0.45,
  modularity: 0.6,
  // detectCommunities recovers the planted LFR partition exactly (ARI=AMI=1.0).
  detectAri: 0.85,
  detectAmi: 0.85,
};

/** Semantic / Meaning thresholds over the make_blobs mixture, projected by the
 *  real PCA projection. */
export const SEMANTIC_THRESHOLDS: ThresholdSet = {
  trustworthiness: 0.85,
  continuity: 0.85,
  qnx: 0.8,
  neighborhoodHit: 0.85,
  silhouette: 0.85,
  nearestCentroid: 0.9,
};
