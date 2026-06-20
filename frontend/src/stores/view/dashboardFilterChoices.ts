import { useMemo } from "react";

import type { SceneCommand } from "../../scene/sceneController";
import type { EngineEdge, EngineNode } from "../server/engine";
import {
  deriveDashboardFilterChoicesView,
  useDashboardFilterChoices as useServerDashboardFilterChoices,
  useDashboardFilterChoicesView,
  type DashboardFilterChoicesView,
} from "../server/queries";
import { applyHiddenCategories } from "./categoryVisibilityMask";
import { computeVisibility, visibilitySceneCommand } from "./filters";
import { useHiddenCategorySet } from "./graphCategoryVisibility";

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
  // Canvas-local category-visibility mask (graph legend toggles), composed onto
  // the canonical filter result. The legend hides categories on the canvas only;
  // it never writes the canonical filter, so this lives here in the scene
  // visibility projection rather than in dashboardState.filters.
  const hiddenCategories = useHiddenCategorySet();
  return useMemo(() => {
    if (graph === null) return null;
    const membership = applyHiddenCategories(
      computeVisibility(graph.nodes, graph.edges, filterChoices),
      graph.nodes,
      graph.edges,
      hiddenCategories,
    );
    return visibilitySceneCommand(membership);
  }, [filterChoices, graph, hiddenCategories]);
}
