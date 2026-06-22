import { useMemo } from "react";

import type { SceneCommand } from "../../scene/sceneController";
import type { EngineEdge, EngineNode } from "../server/engine";
import {
  deriveDashboardFilterChoicesView,
  useDashboardFilterChoices as useServerDashboardFilterChoices,
  useDashboardFilterChoicesView,
  type DashboardFilterChoicesView,
} from "../server/queries";
import { computeVisibility, visibilitySceneCommand } from "./filters";

export {
  deriveDashboardFilterChoicesView,
  useDashboardFilterChoicesView,
  type DashboardFilterChoicesView,
};

export const useDashboardFilterChoices = useServerDashboardFilterChoices;

export interface VisibilityGraphSlice {
  nodes: readonly EngineNode[];
  edges: readonly EngineEdge[];
}

/**
 * Stores-owned dashboard-filter -> scene-visibility projection. Stage owns only
 * dispatching the returned command while live; the membership math and dashboard
 * filter subscription stay behind this seam.
 */
export function useDashboardVisibilityCommand(
  scope: unknown,
  graph: VisibilityGraphSlice | null,
): SceneCommand | null {
  const filterChoices = useServerDashboardFilterChoices(scope);
  // The scene visibility membership is the canonical filter result, full stop
  // (unified-filter-plane D2). The category legend now writes the canonical
  // `doc_types` facet, so category narrowing flows through `filterChoices` like
  // every other facet — there is no separate canvas-local visibility mask to
  // compose. `computeVisibility` applies the canonical filter to the served slice
  // (including client-added nodes the server query never saw — ego expansions,
  // pins), and the scene fades the rest.
  return useMemo(() => {
    if (graph === null) return null;
    const membership = computeVisibility(graph.nodes, graph.edges, filterChoices);
    return visibilitySceneCommand(membership);
  }, [filterChoices, graph]);
}
