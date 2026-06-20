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
  return useMemo(() => {
    if (graph === null) return null;
    return visibilitySceneCommand(
      computeVisibility(graph.nodes, graph.edges, filterChoices),
    );
  }, [filterChoices, graph]);
}
