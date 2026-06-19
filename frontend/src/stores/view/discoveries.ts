// Session discovery intent seam. Discovery candidates are view-local,
// session-only graph affordances; app surfaces should pin/unpin/read/select them
// through this named boundary instead of reaching into the broad view store or
// generic selection mutator surface.

import { useCallback, useMemo } from "react";
import { create } from "zustand";
import type { EngineEdge } from "../server/engine";
import { normalizeNodeId } from "../nodeIds";
import { nodeIdDisplayLabel } from "./nodeLabels";
import { selectNode } from "./selection";
import { PINNED_DISCOVERIES_CAP, useViewStore } from "./viewStore";

interface DiscoveryPanelState {
  openFor: string | null;
  open: (nodeId: unknown) => void;
  close: () => void;
  reset: () => void;
}

export const useDiscoveryPanelStore = create<DiscoveryPanelState>((set) => ({
  openFor: null,
  open: (nodeId) => set({ openFor: normalizeNodeId(nodeId) }),
  close: () => set({ openFor: null }),
  reset: () => set({ openFor: null }),
}));

export function useDiscoveryPanelOpenFor(): string | null {
  return useDiscoveryPanelStore((state) => normalizeNodeId(state.openFor));
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

const DISCOVERY_EDGE_TIERS = new Set<EngineEdge["tier"]>([
  "declared",
  "structural",
  "temporal",
  "semantic",
]);

function normalizeDiscoveryEdgeId(id: unknown): string | null {
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

function normalizeDiscoveryConfidence(confidence: unknown): number {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

function normalizeDiscoveryEdge(edge: unknown): EngineEdge | null {
  if (!edge || typeof edge !== "object") return null;
  const candidate = edge as Partial<EngineEdge>;
  const id = normalizeDiscoveryEdgeId(candidate.id);
  const src = normalizeNodeId(candidate.src);
  const dst = normalizeNodeId(candidate.dst);
  if (
    id === null ||
    src === null ||
    dst === null ||
    typeof candidate.relation !== "string" ||
    !DISCOVERY_EDGE_TIERS.has(candidate.tier as EngineEdge["tier"])
  ) {
    return null;
  }
  return {
    ...candidate,
    id,
    src,
    dst,
    relation: candidate.relation,
    tier: candidate.tier as EngineEdge["tier"],
    confidence: normalizeDiscoveryConfidence(candidate.confidence),
  };
}

export function normalizeDiscoveryEdges(
  edges: readonly unknown[],
  limit = PINNED_DISCOVERIES_CAP,
): EngineEdge[] {
  const normalized: EngineEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (normalized.length >= limit) break;
    const normalizedEdge = normalizeDiscoveryEdge(edge);
    if (normalizedEdge === null || seen.has(normalizedEdge.id)) continue;
    seen.add(normalizedEdge.id);
    normalized.push(normalizedEdge);
  }
  return normalized;
}

export function normalizePinnedDiscoveries(edges: readonly unknown[]): EngineEdge[] {
  return normalizeDiscoveryEdges(
    [...edges].reverse(),
    PINNED_DISCOVERIES_CAP,
  ).reverse();
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
  scope: string | null = useViewStore.getState().scope,
): Promise<boolean> {
  const id = normalizeNodeId(nodeId);
  return id === null ? Promise.resolve(false) : selectNode(id, scope);
}

export function useDiscoveryCandidateSelection(scope: string | null) {
  return useCallback(
    (nodeId: unknown) => selectDiscoveryCandidate(nodeId, scope),
    [scope],
  );
}
