// Graph-affordance reconciliation seam. The graph model is canonical; view-local
// subscriptions such as event rings, opened islands, working-set expansions, and
// pinned discovery edges must be pruned through one stores/view boundary whenever
// the held graph model changes.

import { useEffect, useMemo } from "react";

import type { EngineNode } from "../server/engine";
import { normalizeNodeIds } from "../nodeIds";
import { useViewStore } from "./viewStore";

export function reconcileGraphAffordances(nodeIds: readonly unknown[]): void {
  useViewStore
    .getState()
    .pruneNodeAffordances(normalizeNodeIds(nodeIds, nodeIds.length));
}

export interface GraphAffordanceModel {
  nodes: readonly Pick<EngineNode, "id">[];
}

export function graphAffordanceNodeIds(
  graph: GraphAffordanceModel | null,
): string[] | null {
  if (!graph || !Array.isArray(graph.nodes)) return null;
  return normalizeNodeIds(
    graph.nodes.map((node) => node?.id),
    graph.nodes.length,
  );
}

export function useGraphAffordanceReconciliation(
  graph: GraphAffordanceModel | null,
): void {
  const nodeIds = useMemo(() => graphAffordanceNodeIds(graph), [graph]);
  useEffect(() => {
    if (!nodeIds) return;
    reconcileGraphAffordances(nodeIds);
  }, [nodeIds]);
}
