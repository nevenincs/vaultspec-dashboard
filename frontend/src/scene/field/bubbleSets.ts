// BubbleSets feature hulls (graph-representation ADR, W03.P10).
//
// At DOCUMENT LOD a feature renders as a BubbleSets-style hull outlining its
// member nodes — the set-overlay that carries feature membership WITHOUT moving
// any node. A true BubbleSets contour is an isocontour over a potential field; we
// compute a padded convex hull (Andrew's monotone chain) around the members, which
// is the cheap, deterministic, GPU-drawable approximation that reads as a feature
// "bubble" at this scale. Pure geometry; scene-layer module, framework-free.

import type { SceneNodeData } from "../sceneController";

export interface Pt {
  x: number;
  y: number;
}

export interface FeatureHull {
  feature: string;
  /** The hull polygon (closed implicitly; the renderer connects last->first). */
  points: Pt[];
}

/** Outward padding (world units) so the hull breathes around its members. */
export const HULL_PADDING = 28;

/**
 * Compute one padded-convex-hull per feature over its members' positions. A
 * feature with fewer than 3 positioned members yields a small circle-ish polygon
 * around its centroid (a degenerate hull still reads as a bubble). Pure and
 * deterministic (features ordered by name).
 */
export function featureHulls(
  nodes: readonly SceneNodeData[],
  positionOf: (id: string) => Pt | undefined,
  padding = HULL_PADDING,
): FeatureHull[] {
  const byFeature = new Map<string, Pt[]>();
  for (const node of nodes) {
    const p = positionOf(node.id);
    if (!p) continue;
    const feature =
      node.kind === "feature"
        ? node.id.replace(/^feature:/, "")
        : node.featureTags?.[0];
    if (!feature) continue;
    const list = byFeature.get(feature) ?? [];
    list.push(p);
    byFeature.set(feature, list);
  }
  const hulls: FeatureHull[] = [];
  for (const [feature, pts] of byFeature) {
    hulls.push({ feature, points: paddedHull(pts, padding) });
  }
  hulls.sort((a, b) => (a.feature < b.feature ? -1 : 1));
  return hulls;
}

/** A padded hull: the convex hull of the points expanded outward from its
 *  centroid by `padding`. For < 3 points, a small square around the centroid. */
export function paddedHull(points: readonly Pt[], padding: number): Pt[] {
  if (points.length === 0) return [];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  if (points.length < 3) {
    // Degenerate: a padded square around the centroid so it still reads as a hull.
    const r = padding * 2;
    return [
      { x: cx - r, y: cy - r },
      { x: cx + r, y: cy - r },
      { x: cx + r, y: cy + r },
      { x: cx - r, y: cy + r },
    ];
  }
  const hull = convexHull(points);
  // Expand each hull vertex outward from the centroid by `padding`.
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}

/** Andrew's monotone chain convex hull. Returns vertices in CCW order. */
export function convexHull(input: readonly Pt[]): Pt[] {
  const points = [...input].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (points.length <= 2) return points;
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of points) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
