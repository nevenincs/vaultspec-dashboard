// make_blobs-style high-dimensional Gaussian-mixture generator (graph-viz-
// scorecard ADR, W01.P01.S05).
//
// The semantic metrics (trustworthiness, continuity, silhouette, nearest-centroid)
// score a 2D projection of high-dimensional vectors against KNOWN labels. This
// generator is the fixture source: `clusters` isotropic Gaussian clouds in `dims`-
// dimensional space, each centered on a distinct point, with `count` points split
// across them and every point carrying its planted cluster label. It generalizes
// the `buildGateSlice` deterministic-cloud pattern in `semanticGate.ts` onto the
// seeded PRNG — `buildGateSlice` used `Math.sin` jitter and trig-derived centers;
// this uses the PRNG's Box-Muller `gaussian` for honest isotropic noise and PRNG-
// drawn cluster centers, so the clouds are statistically real Gaussian mixtures,
// not a sinusoidal lattice.
//
// `clusterStd` is the difficulty knob: small std = well-separated clouds (easy),
// large std = overlapping clouds (hard) — exactly the sweep the calibration script
// (W01.P04) drives.
//
// Determinism (ADR): centers and per-coordinate noise are drawn from the seeded
// mulberry32 PRNG via Box-Muller — no `Math.random`, no `Math.sin` jitter. Same
// params/seed reproduce the vectors byte-for-byte.

import { makePrng } from "../prng";
import type { BlobFixture } from "./fixture";

export interface BlobParams {
  /** Total number of points across all clusters. */
  count: number;
  /** Dimensionality of each vector. */
  dims: number;
  /** Number of Gaussian clusters. */
  clusters: number;
  /** Standard deviation of each cluster's isotropic Gaussian (difficulty knob). */
  clusterStd: number;
  /** PRNG seed. */
  seed: number;
  /** Half-width of the box cluster centers are drawn from (default 10). Larger
   *  spread relative to `clusterStd` makes the mixture easier to separate. */
  centerSpread?: number;
}

/**
 * Generate a high-dimensional Gaussian mixture with known labels. Returns one
 * vector per point and its planted cluster label. Points are assigned to clusters
 * round-robin (`i % clusters`) so cluster occupancy is deterministic and balanced;
 * each cluster's center is drawn once from a uniform box, then every point is its
 * center plus isotropic Gaussian noise of scale `clusterStd`.
 */
export function generateBlobs(params: BlobParams): BlobFixture {
  const { count, dims, clusters, clusterStd, seed, centerSpread = 10 } = params;
  if (clusters <= 0 || dims <= 0 || count <= 0) {
    return { vectors: [], labels: [] };
  }
  const prng = makePrng(seed);

  // Draw a distinct center per cluster (uniform in [-centerSpread, centerSpread]).
  const centers: number[][] = [];
  for (let c = 0; c < clusters; c++) {
    const center = new Array<number>(dims);
    for (let d = 0; d < dims; d++) {
      center[d] = (prng.next() * 2 - 1) * centerSpread;
    }
    centers.push(center);
  }

  const vectors: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < count; i++) {
    const label = i % clusters;
    const center = centers[label];
    const vec = new Array<number>(dims);
    for (let d = 0; d < dims; d++) {
      vec[d] = center[d] + prng.gaussian(0, clusterStd);
    }
    vectors.push(vec);
    labels.push(label);
  }

  return { vectors, labels };
}
