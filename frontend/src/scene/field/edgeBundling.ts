// Hierarchical edge bundling (graph-representation ADR, W02.P07).
//
// The dense temporal/semantic context tiers are routed along the feature/lineage
// containment hierarchy and BUNDLED (Holten 2006) so cross-cluster links read as
// clean arcs rather than a hairball of straight lines. Bundling trades edge
// traceability for pattern legibility — so it is UN-BUNDLED on hover (the ego
// highlight straightens the lifted edges back to readable straight lines).
//
// This module computes the bundled control point for an edge given its endpoints
// and the centroids of the two clusters (features) it spans. The actual mesh draw
// consumes the control point; the geometry is pure here so it is testable without
// a GPU. Scene-layer module, framework-free.

export interface Point {
  x: number;
  y: number;
}

/**
 * Bundling strength beta in [0,1]: 0 = straight line (un-bundled), 1 = fully
 * routed through the cluster centroids. The ADR's default bundling for context
 * tiers; hover sets it toward 0 for lifted edges.
 */
export const BUNDLE_BETA = 0.85;
/** Un-bundled strength used for hovered (lifted) edges — straightened back. */
export const UNBUNDLE_BETA = 0.0;

/**
 * The control point for a quadratic bundle of an edge `from`->`to` whose endpoints
 * belong to clusters with centroids `srcCentroid`/`dstCentroid`. The control point
 * is the midpoint of the cluster-centroid segment, blended toward the straight
 * edge midpoint by `(1 - beta)`. beta=1 routes through the centroids (bundled);
 * beta=0 returns the straight midpoint (un-bundled).
 *
 * Pure and deterministic.
 */
export function bundleControlPoint(
  from: Point,
  to: Point,
  srcCentroid: Point,
  dstCentroid: Point,
  beta = BUNDLE_BETA,
): Point {
  const b = Math.max(0, Math.min(1, beta));
  const straightMid: Point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const centroidMid: Point = {
    x: (srcCentroid.x + dstCentroid.x) / 2,
    y: (srcCentroid.y + dstCentroid.y) / 2,
  };
  return {
    x: b * centroidMid.x + (1 - b) * straightMid.x,
    y: b * centroidMid.y + (1 - b) * straightMid.y,
  };
}

/**
 * Sample a quadratic Bezier from `from` to `to` through `control` at `steps`
 * points (inclusive of both ends). Used to draw the bundled arc; with a control
 * point on the straight midpoint (beta=0) it degenerates to a straight line.
 */
export function sampleBundle(
  from: Point,
  to: Point,
  control: Point,
  steps = 12,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    out.push({
      x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
    });
  }
  return out;
}

/** Compute the centroid of a set of points (a cluster's center of gravity). */
export function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * The bundling strength for an edge given whether it is currently lifted (hovered
 * ego). Lifted edges un-bundle (straighten); the rest stay bundled. This is the
 * un-bundle-on-hover rule expressed as a pure beta selector.
 */
export function betaForEdge(lifted: boolean): number {
  return lifted ? UNBUNDLE_BETA : BUNDLE_BETA;
}
