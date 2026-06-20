// Canvas-local category-visibility mask (graph legend toggles).
//
// The category legend's coloured dots are canvas FILTER TOGGLES: hiding a
// category drops that category's nodes from the graph canvas ONLY. This is a
// scene-rendering visibility layer, LAYERED OVER the canonical filter result —
// it NEVER writes dashboardState.filters (filtering-has-one-canonical-surface:
// the left rail stays the sole facet-filter author), so the tree, timeline, and
// every other consumer are untouched.
//
// Kept in its own module (not in `filters.ts`) so the legend feature stays
// decoupled from the canonical-filter projection surface.

import { nodeCategory } from "../../scene/field/categoryColor";
import type { EngineEdge, EngineNode } from "../server/engine";
import type { VisibilityMembership } from "./filters";

/**
 * Apply the hidden-category mask to an already-computed visibility membership.
 * Drops every still-visible node whose category token is in `hiddenCategories`
 * and every edge that thereby loses an endpoint, recomputing the hidden counts.
 * The category token resolves through the SAME `nodeCategory` mapping the canvas
 * node-fill and the legend swatch use, so the three always agree on which nodes
 * a swatch governs.
 *
 * The mask can only NARROW the membership, never widen it — a node the canonical
 * filter already hid is never re-added. Returns the input unchanged when nothing
 * is hidden (the common case).
 */
export function applyHiddenCategories(
  membership: VisibilityMembership,
  nodes: readonly EngineNode[],
  edges: readonly EngineEdge[],
  hiddenCategories: ReadonlySet<string>,
): VisibilityMembership {
  if (hiddenCategories.size === 0) return membership;
  const visibleNodeIds = new Set<string>();
  for (const node of nodes) {
    if (!membership.visibleNodeIds.has(node.id)) continue;
    if (hiddenCategories.has(nodeCategory(node.doc_type ?? node.kind))) continue;
    visibleNodeIds.add(node.id);
  }
  const visibleEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (!membership.visibleEdgeIds.has(edge.id)) continue;
    if (!visibleNodeIds.has(edge.src) || !visibleNodeIds.has(edge.dst)) continue;
    visibleEdgeIds.add(edge.id);
  }
  return {
    visibleNodeIds,
    visibleEdgeIds,
    hiddenNodeCount: nodes.length - visibleNodeIds.size,
    hiddenEdgeCount: edges.length - visibleEdgeIds.size,
  };
}
