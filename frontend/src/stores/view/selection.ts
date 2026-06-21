// Selection action seam. Node selection is canonical dashboard-state; event and
// edge selections remain local metadata until the backend schema carries those
// non-node entity kinds.

import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SceneController } from "../../scene/sceneController";
import { normalizeNodeId } from "../nodeIds";
import {
  normalizeDashboardSelectedIds,
  patchDashboardState,
  selectionPatch,
} from "../server/dashboardState";
import { featureTagFromNodeId } from "../server/liveAdapters";
import { useDashboardSelectedNodeId } from "../server/queries";
import { normalizeStoreScope } from "../server/scopeIdentity";
import type { Selection } from "./viewStore";
import { OPENED_IDS_CAP, useViewStore } from "./viewStore";

export type { Selection };

export type ResolvedSelection = Selection | { kind: "node"; id: string };

/** Dwell before the hover card blooms (ms): a glancing pass shows nothing. */
export const HOVER_CARD_DWELL_MS = 150;

function clearLocalSelectionMetadata(): void {
  if (useViewStore.getState().selection !== null) {
    useViewStore.getState().selectEntity(null);
  }
}

export function resolveSelection(
  selectedNodeId: string | null,
  localSelection: Selection,
): ResolvedSelection {
  if (localSelection?.kind === "edge" || localSelection?.kind === "event") {
    return localSelection;
  }
  return selectedNodeId !== null ? { kind: "node", id: selectedNodeId } : null;
}

export function useLocalSelectionMetadata(): Selection {
  return useViewStore((state) => state.selection);
}

export function useResolvedSelection(selectedNodeId: string | null): ResolvedSelection {
  const localSelection = useLocalSelectionMetadata();
  return useMemo(
    () => resolveSelection(selectedNodeId, localSelection),
    [selectedNodeId, localSelection],
  );
}

/**
 * Read the transient hovered node id (graph-perf 2026-06-18): VIEW-LOCAL, never
 * the wire. Hover is not real cross-surface state — it lives in the view store and
 * is shared client-side across the scene, timeline, and hover-card host without any
 * server round-trip. The scene applies the node emphasis directly on the GPU; this
 * carries only the id the DOM hover card mounts for.
 */
export function useHoveredNodeId(): string | null {
  return useViewStore((state) => state.hoveredId);
}

/** Set the transient hovered node id (view-local). The scene's own GPU hover-detect
 *  and the timeline call this instead of any dashboard-state mutation. */
export function setHoveredNodeId(id: unknown): void {
  useViewStore.getState().setHovered(id);
}

/** Read the hover id that survived the hover-card dwell gate. */
export function useDwelledHoverNodeId(hoveredId: string | null): string | null {
  const dwelledId = useViewStore((state) => state.dwelledHoverId);
  useEffect(() => {
    if (hoveredId === null) {
      setDwelledHoverNodeId(null);
      return;
    }
    const timer = setTimeout(
      () => setDwelledHoverNodeId(hoveredId),
      HOVER_CARD_DWELL_MS,
    );
    return () => clearTimeout(timer);
  }, [hoveredId]);
  return dwelledId;
}

/** Set the hover id that survived the dwell gate. */
export function setDwelledHoverNodeId(id: unknown): void {
  useViewStore.getState().setDwelledHover(id);
}

export const normalizeSelectionScope = normalizeStoreScope;

export const SELECTION_METADATA_ID_MAX_CHARS = 512;

export function normalizeSelectionMetadataId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized.length > 0 && normalized.length <= SELECTION_METADATA_ID_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeSelectionTruncatedNodeCount(
  value: unknown,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

/** Resolve the inspector selection from canonical dashboard-state plus local metadata. */
export function useDashboardResolvedSelection(scope: unknown): ResolvedSelection {
  const selectedNodeId = useDashboardSelectedNodeId(normalizeSelectionScope(scope));
  return useResolvedSelection(selectedNodeId);
}

/** Select one or more graph nodes from any non-scene region. */
export function selectNodes(
  ids: readonly unknown[],
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  clearLocalSelectionMetadata();
  return patchDashboardState(normalizeSelectionScope(scope), selectionPatch(ids)).then(
    (state) => state !== null,
  );
}

/** Select a node from any non-scene region (browser row, search hit, palette). */
export function selectNode(
  id: unknown,
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  if (id === null) return selectNodes([], scope);
  const nodeId = normalizeNodeId(id);
  return nodeId === null ? Promise.resolve(false) : selectNodes([nodeId], scope);
}

/** Select the first carried node from an event/menu node list, if present. */
export function selectFirstNode(
  ids: readonly unknown[],
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  return selectNode(ids[0] ?? null, scope);
}

/** Hook form for components that need a stable node-selection callback. */
export function useDashboardNodeSelection(scope: unknown) {
  const normalizedScope = normalizeSelectionScope(scope);
  return useCallback(
    (id: unknown) => selectNode(id, normalizedScope),
    [normalizedScope],
  );
}

export function normalizeOpenedNodeIslandIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const id = normalizeNodeId(ids[i]);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.unshift(id);
    if (out.length >= OPENED_IDS_CAP) break;
  }
  return out;
}

export function useOpenedNodeIslands(): readonly string[] {
  return useViewStore(
    useShallow((state) => normalizeOpenedNodeIslandIds(state.openedIds)),
  );
}

export function isNodeIslandOpen(id: unknown): boolean {
  const nodeId = normalizeNodeId(id);
  return (
    nodeId !== null &&
    normalizeOpenedNodeIslandIds(useViewStore.getState().openedIds).includes(nodeId)
  );
}

type SceneOriginMarker = (originated?: boolean) => void;
type SceneOriginRef = { current: boolean };

function markSceneOriginated(mark?: SceneOriginMarker, originated = true): void {
  mark?.(originated);
}

/** The stage's own event path: select without bouncing focus back. */
export function selectFromScene(
  id: unknown,
  scope: unknown = useViewStore.getState().scope,
  mark?: SceneOriginMarker,
): Promise<boolean> {
  markSceneOriginated(mark);
  return selectNode(id, scope)
    .then((accepted) => {
      if (!accepted) markSceneOriginated(mark, false);
      return accepted;
    })
    .catch((error: unknown) => {
      markSceneOriginated(mark, false);
      throw error;
    });
}

/** Open a node island and select the same node through the canonical dashboard seam. */
export async function openNodeIsland(
  id: unknown,
  scope: unknown = useViewStore.getState().scope,
  mark?: SceneOriginMarker,
): Promise<boolean> {
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return false;
  const accepted = mark
    ? await selectFromScene(nodeId, scope, mark)
    : await selectNode(nodeId, scope);
  if (!accepted) return false;
  useViewStore.getState().openNode(nodeId);
  return true;
}

interface FeatureDescentIntent {
  descendFeatureTag: (featureTag: unknown) => Promise<unknown>;
}

/**
 * Open a graph node from the scene event stream. Synthesized feature nodes do not
 * own an island; opening one descends the dashboard slice to that feature tag.
 */
export async function openGraphNodeFromScene(
  id: unknown,
  scope: unknown,
  featureDescentIntent: FeatureDescentIntent,
  mark?: SceneOriginMarker,
): Promise<boolean> {
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return false;
  const normalizedScope = normalizeSelectionScope(scope);
  const featureTag = featureTagFromNodeId(nodeId);
  if (featureTag !== null) {
    if (normalizedScope === null) return false;
    await featureDescentIntent.descendFeatureTag(featureTag);
    return true;
  }
  return openNodeIsland(nodeId, normalizedScope, mark);
}

/** Close a node island through the named island intent seam. */
export function closeNodeIsland(id: unknown): void {
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return;
  useViewStore.getState().closeNode(nodeId);
}

/**
 * Keyboard graph-walk open: open the DOM island, select through dashboard-state,
 * and instantly re-center the camera. The app layer calls this seam instead of
 * pairing a raw `openNode` write with a separate selection/focus write.
 */
export async function openNodeIslandFromWalk(
  scene: SceneController,
  id: unknown,
  scope: unknown = useViewStore.getState().scope,
  mark?: SceneOriginMarker,
): Promise<boolean> {
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return false;
  markSceneOriginated(mark);
  try {
    const accepted = await selectNode(nodeId, scope);
    if (!accepted) {
      markSceneOriginated(mark, false);
      return false;
    }
    useViewStore.getState().openNode(nodeId);
    scene.command({ kind: "focus-node", id: nodeId, animate: false });
    return true;
  } catch (error) {
    markSceneOriginated(mark, false);
    throw error;
  }
}

/**
 * Keyboard graph-walk focus: select the walked node AND instantly re-center the
 * camera on it. The selection is marked scene-originated so the store→scene
 * binding does NOT also issue an animated focus (double-follow); this path owns
 * the camera move and issues it as `focus-node {animate:false}` so the walked
 * node is re-centered INSTANTLY (base motion law: keyboard actions never
 * animate) and never strays off-screen. Clearing (id === null) just deselects.
 */
export async function focusFromWalk(
  scene: SceneController,
  id: unknown,
  scope: unknown = useViewStore.getState().scope,
  mark?: SceneOriginMarker,
): Promise<boolean> {
  const nodeId = normalizeNodeId(id);
  if (id !== null && nodeId === null) return false;
  const normalizedScope = normalizeSelectionScope(scope);
  markSceneOriginated(mark);
  // The keyboard-walk camera re-center (HIGH-2) is a pure scene move: it must
  // fire on the walked node regardless of whether the selection write can
  // proceed, so the node re-centers INSTANTLY even before scope resolves.
  if (nodeId !== null) {
    scene.command({ kind: "focus-node", id: nodeId, animate: false });
  }
  if (nodeId !== null && normalizedScope === null) {
    markSceneOriginated(mark, false);
    return false;
  }
  try {
    const accepted = await selectNode(nodeId, normalizedScope);
    if (!accepted) {
      markSceneOriginated(mark, false);
      return false;
    }
    return true;
  } catch (error) {
    markSceneOriginated(mark, false);
    throw error;
  }
}

/** Select a timeline event; its node ids drive the stage cross-highlight. */
export function selectEvent(
  id: unknown,
  nodeIds: readonly unknown[],
  truncatedNodeIds?: unknown,
): void {
  const eventId = normalizeSelectionMetadataId(id);
  if (eventId === null) return;
  const normalizedTruncatedNodeIds =
    normalizeSelectionTruncatedNodeCount(truncatedNodeIds);
  useViewStore.getState().selectEntity({
    kind: "event",
    id: eventId,
    nodeIds: normalizeDashboardSelectedIds(nodeIds),
    ...(normalizedTruncatedNodeIds === undefined
      ? {}
      : { truncatedNodeIds: normalizedTruncatedNodeIds }),
  });
}

/**
 * Select a history/timeline event and the graph nodes it carries through one
 * store-owned action. Node selection remains canonical dashboard-state; event
 * metadata remains local until the backend schema carries non-node entities.
 */
export function selectEventNodes(
  id: unknown,
  nodeIds: readonly unknown[],
  scope: unknown = useViewStore.getState().scope,
  truncatedNodeIds?: unknown,
): Promise<boolean> {
  const eventId = normalizeSelectionMetadataId(id);
  if (eventId === null) return Promise.resolve(false);
  const selectedNodeIds = normalizeDashboardSelectedIds(nodeIds);
  return selectNodes(selectedNodeIds, scope).then((selected) => {
    if (!selected) return false;
    selectEvent(eventId, selectedNodeIds, truncatedNodeIds);
    return true;
  });
}

/** Select an edge (inspector's per-tier edge list). */
export function selectEdge(id: unknown): void {
  const edgeId = normalizeSelectionMetadataId(id);
  if (edgeId === null) return;
  useViewStore.getState().selectEntity({ kind: "edge", id: edgeId });
}

/**
 * Project canonical dashboard node selection into the scene seam. Dashboard-state
 * owns node selection; the scene receives only the selected ring mirror plus the
 * cross-region focus command. Stage-originated selections skip the focus bounce
 * because the user already clicked that canvas location.
 */
export function projectDashboardSelectionToScene(
  scene: SceneController,
  selectedIds: readonly unknown[],
  selectedNodeId: string | null,
  sceneOriginatedRef: SceneOriginRef,
): void {
  scene.command({
    kind: "set-selected",
    ids: new Set(normalizeDashboardSelectedIds(selectedIds)),
  });
  if (sceneOriginatedRef.current) {
    sceneOriginatedRef.current = false;
    return;
  }
  if (selectedNodeId) {
    scene.command({ kind: "focus-node", id: selectedNodeId });
  }
}

/**
 * Emit a transient cross-highlight through the selection scene seam. Producers
 * such as the timeline may own the bounded node-id join, but the scene pulse
 * command stays centralized with the rest of selection projection.
 */
export function pulseSelectionNodes(
  scene: SceneController,
  ids: readonly unknown[],
): void {
  const selectedIds = normalizeDashboardSelectedIds(ids);
  if (selectedIds.length === 0) return;
  scene.command({ kind: "pulse", ids: new Set(selectedIds) });
}

/**
 * Select a canonical dashboard node and emit a bounded visual pulse through the
 * same selection seam. Producers still own the domain-specific join set; this
 * owns the state write + scene pulse composition.
 */
export function selectNodeAndPulse(
  scene: SceneController,
  nodeId: unknown,
  pulseIds: readonly unknown[],
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  return selectNode(nodeId, scope).then((selected) => {
    if (selected) pulseSelectionNodes(scene, pulseIds);
    return selected;
  });
}
