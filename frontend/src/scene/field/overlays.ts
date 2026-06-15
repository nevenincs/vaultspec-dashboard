// Feature overlays (graph-representation ADR, W03.P10).
//
// Feature membership is ORTHOGONAL to the connectivity layout, so it renders as an
// OVERLAY that does NOT move nodes (the ADR: set overlays, not a second layout):
//   - at the OVERVIEW LOD, features render as GMap-style labelled "countries" — a
//     label placed at the feature's center of gravity (this module);
//   - at DOCUMENT LOD, BubbleSets hulls outline each feature's members
//     (`bubbleSets.ts`).
//
// This module computes the country LABEL placements: one label per feature at the
// centroid of its member positions. Pure geometry; scene-layer module,
// framework-free. The renderer draws the labels; toggling visibility never
// re-lays-out.

import type { SceneNodeData } from "../sceneController";

export interface CountryLabel {
  feature: string;
  /** Centroid of the feature's member node positions (world space). */
  x: number;
  y: number;
  /** Member count — drives the label weight/size at overview. */
  memberCount: number;
}

/**
 * Compute one GMap-style country label per feature, placed at the centroid of the
 * feature's members' positions. A node belongs to a feature via its
 * `feature_tags`; the feature-convergence node itself (kind "feature") anchors the
 * label when present. Nodes with no position (not yet laid out) are skipped.
 *
 * Pure and deterministic (features ordered by name).
 */
export function countryLabels(
  nodes: readonly SceneNodeData[],
  positionOf: (id: string) => { x: number; y: number } | undefined,
): CountryLabel[] {
  const byFeature = new Map<string, { x: number; y: number; count: number }>();
  for (const node of nodes) {
    const p = positionOf(node.id);
    if (!p) continue;
    // A node's feature is its feature-convergence membership. The kind "feature"
    // node carries its own tag; document nodes carry feature_tags.
    const feature =
      node.kind === "feature"
        ? node.id.replace(/^feature:/, "")
        : node.featureTags?.[0];
    if (!feature) continue;
    const agg = byFeature.get(feature) ?? { x: 0, y: 0, count: 0 };
    agg.x += p.x;
    agg.y += p.y;
    agg.count += 1;
    byFeature.set(feature, agg);
  }
  const labels: CountryLabel[] = [];
  for (const [feature, agg] of byFeature) {
    labels.push({
      feature,
      x: agg.x / agg.count,
      y: agg.y / agg.count,
      memberCount: agg.count,
    });
  }
  labels.sort((a, b) => (a.feature < b.feature ? -1 : 1));
  return labels;
}
