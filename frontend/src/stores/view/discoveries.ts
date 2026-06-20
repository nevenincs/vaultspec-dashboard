// Session discovery intent seam. Discovery candidates are view-local,
// session-only graph affordances; app surfaces should pin/unpin/read/select them
// through this named boundary instead of reaching into the broad view store or
// generic selection mutator surface.

import { useCallback, useMemo } from "react";
import { create } from "zustand";
import type { EngineEdge } from "../server/engine";
import { normalizeNodeId } from "../nodeIds";
import {
  normalizeDiscoveryEdge,
  normalizeDiscoveryEdgeId,
  normalizeDiscoveryEdges as normalizeDiscoveryEdgeList,
  normalizePinnedDiscoveryEdges,
} from "./discoveryEdges";
import { nodeIdDisplayLabel } from "./nodeLabels";
import { normalizeSelectionScope, selectNode } from "./selection";
import { PINNED_DISCOVERIES_CAP, useViewStore } from "./viewStore";

interface DiscoveryPanelState {
  openFor: string | null;
  open: (nodeId: unknown) => void;
  close: () => void;
  reset: () => void;
}

export function normalizeDiscoveryPanelTarget(nodeId: unknown): string | null {
  return normalizeNodeId(nodeId);
}

export const useDiscoveryPanelStore = create<DiscoveryPanelState>((set) => ({
  openFor: null,
  open: (nodeId) =>
    set((state) => {
      const openFor = normalizeDiscoveryPanelTarget(nodeId);
      return openFor === null || state.openFor === openFor ? state : { openFor };
    }),
  close: () => set({ openFor: null }),
  reset: () => set({ openFor: null }),
}));

export function useDiscoveryPanelOpenFor(): string | null {
  return useDiscoveryPanelStore((state) =>
    normalizeDiscoveryPanelTarget(state.openFor),
  );
}

export function useDiscoveryPanelOpenView(): { id: string; label: string } | null {
  const openFor = useDiscoveryPanelOpenFor();
  return openFor === null ? null : { id: openFor, label: nodeIdDisplayLabel(openFor) };
}

export function openDiscoveryPanel(nodeId: unknown): void {
  useDiscoveryPanelStore.getState().open(nodeId);
}

export function closeDiscoveryPanel(): void {
  useDiscoveryPanelStore.getState().close();
}

export function resetDiscoveryPanel(): void {
  useDiscoveryPanelStore.getState().reset();
}

export function normalizeDiscoveryEdges(
  edges: readonly unknown[],
  limit = PINNED_DISCOVERIES_CAP,
): EngineEdge[] {
  return normalizeDiscoveryEdgeList(edges, limit);
}

export function normalizePinnedDiscoveries(edges: readonly unknown[]): EngineEdge[] {
  return normalizePinnedDiscoveryEdges(edges, PINNED_DISCOVERIES_CAP);
}

export function usePinnedDiscoveries(): EngineEdge[] {
  // Select the STABLE raw array (referentially stable until pin/unpin mutates it)
  // and memoize the normalization. Normalizing INSIDE the zustand selector returned
  // a fresh array every getSnapshot call -> "getSnapshot should be cached" infinite
  // loop, which crashed the Stage (and the canvas it mounts) + every pinned-reader.
  const raw = useViewStore((s) => s.pinnedDiscoveries);
  return useMemo(() => normalizePinnedDiscoveries(raw), [raw]);
}

export interface DiscoveryCandidateRowView {
  candidate: EngineEdge;
  targetLabel: string;
  confidenceLabel: string;
  pinned: boolean;
}

export function discoveryCandidateRows(
  candidates: readonly EngineEdge[],
  pinned: readonly EngineEdge[],
): DiscoveryCandidateRowView[] {
  const pinnedIds = new Set(normalizePinnedDiscoveries(pinned).map((edge) => edge.id));
  return normalizeDiscoveryEdges(candidates, candidates.length).map((candidate) => ({
    candidate,
    targetLabel: nodeIdDisplayLabel(candidate.dst),
    confidenceLabel: `${Math.round(candidate.confidence * 100)}%`,
    pinned: pinnedIds.has(candidate.id),
  }));
}

export function useDiscoveryCandidateRows(
  candidates: readonly EngineEdge[],
): DiscoveryCandidateRowView[] {
  return discoveryCandidateRows(candidates, usePinnedDiscoveries());
}

export function pinDiscoveryCandidate(edge: EngineEdge): void {
  const normalizedEdge = normalizeDiscoveryEdge(edge);
  if (normalizedEdge !== null) useViewStore.getState().pinDiscovery(normalizedEdge);
}

export function unpinDiscoveryCandidate(edgeId: unknown): void {
  const id = normalizeDiscoveryEdgeId(edgeId);
  if (id !== null) useViewStore.getState().unpinDiscovery(id);
}

export function selectDiscoveryCandidate(
  nodeId: unknown,
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  const id = normalizeNodeId(nodeId);
  const normalizedScope = normalizeSelectionScope(scope);
  return id === null ? Promise.resolve(false) : selectNode(id, normalizedScope);
}

export function useDiscoveryCandidateSelection(scope: unknown) {
  const normalizedScope = normalizeSelectionScope(scope);
  return useCallback(
    (nodeId: unknown) => selectDiscoveryCandidate(nodeId, normalizedScope),
    [normalizedScope],
  );
}
