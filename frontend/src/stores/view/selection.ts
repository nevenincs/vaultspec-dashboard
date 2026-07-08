// Selection action seam. Node selection is canonical dashboard-state; event and
// edge selections remain local metadata until the backend schema carries those
// non-node entity kinds.

import { useCallback, useEffect, useMemo } from "react";
import type { SceneController } from "../../scene/sceneController";
import { normalizeNodeId } from "../nodeIds";
import {
  normalizeDashboardSelectedIds,
  patchDashboardState,
  selectionPatch,
} from "../server/dashboardState";
import {
  featureNodeIdFromTag,
  featureTagFromNodeId,
  normalizeFeatureTag,
} from "../server/liveAdapters";
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
  // Select the RAW stable slice; derive in useMemo (stable-selectors) — never
  // inside the selector, even under useShallow.
  const openedIds = useViewStore((state) => state.openedIds);
  return useMemo(() => normalizeOpenedNodeIslandIds(openedIds), [openedIds]);
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

// The on-canvas island OPEN path (`openNodeIsland` / `openGraphNodeFromScene`) is
// RETIRED (unified-selection D1): opening a node now opens a #15 dock tab through the
// canonical `activateEntity` seam, which every surface routes through. The island
// CLOSE seam below stays for any residually-open island chrome.

/** Close a node island through the named island intent seam. */
export function closeNodeIsland(id: unknown): void {
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return;
  useViewStore.getState().closeNode(nodeId);
}

/**
 * Keyboard graph-walk open (Enter): open the document as a #15 PROVISIONAL dock tab,
 * select through dashboard-state, and instantly re-center the camera. Converged onto
 * the dock tab (unified-selection D1) — it no longer opens the retired on-canvas island,
 * so the name reflects that the walk OPENS A TAB, not an island.
 * A `doc:`/`code:` node opens its tab; a synthesized `feature:` node has no document, so
 * it selects + re-centers only. The app layer calls this seam instead of pairing a raw
 * tab write with a separate selection/focus write.
 *
 * It deliberately does NOT compose the generic `previewDocTab` seam: the walk gates the
 * tab-open AND the camera re-center on an ACCEPTED dashboard selection, so a node the
 * backend rejects (e.g. an unresolved scope) neither opens a tab nor yanks the camera —
 * whereas `previewDocTab` opens the tab unconditionally. That open-on-accepted-selection
 * gate is the reason this stays a distinct seam rather than routing through activateEntity.
 */
export async function openTabFromWalk(
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
    const surface = nodeId.startsWith("code:")
      ? "code"
      : nodeId.startsWith("doc:")
        ? "markdown"
        : null;
    if (surface) useViewStore.getState().openDoc(nodeId, surface, false);
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
  // A SELECTED FEATURE (feature-selection-global-state) draws NO node ring; it spotlights
  // its member CLUSTER through the durable `set-feature-spotlight` seam (the scene re-derives
  // the cohort across data reloads). The camera frame is ONE-SHOT and follow-gated — a rail
  // feature-select frames the cluster only when follow mode is on; an on-canvas feature click
  // (scene-originated) never yanks the camera.
  const featureTag = featureTagFromNodeId(selectedNodeId);
  if (featureTag !== null) {
    const originated = sceneOriginatedRef.current;
    sceneOriginatedRef.current = false;
    scene.command({ kind: "set-selected", ids: new Set() });
    scene.command({
      kind: "set-feature-spotlight",
      tag: featureTag,
      frame: !originated && followModeEnabled(),
    });
    return;
  }
  // A non-feature (document/code node) or cleared selection: drop any feature spotlight and
  // fall back to the canonical singleton ring + focus.
  scene.command({ kind: "set-feature-spotlight", tag: null });
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

// --- follow mode (follow-mode-selection-sync) ----------------------------------
//
// Bidirectional rail<->graph SELECTION tethering (an EXTENSION of the existing
// G2.b document-level join to FEATURES, gated behind a view-local toggle). SELECTION
// ONLY — never the filter plane. This module owns the shared seam: the follow-mode
// read, the rail-feature->graph compose (`selectFeatureAndFrame`), and the
// graph-node->rail reverse helper (`followFeatureKeyForNode`). The rail wires its
// expand/select to these; the scene implements the `frame-nodes` command.

/** Read follow mode (view-local, default ON). Primitive → stable-selector safe. */
export function useFollowMode(): boolean {
  return useViewStore((state) => state.followMode);
}

/** Non-hook follow-mode read for the imperative seams + action handlers. */
export function followModeEnabled(): boolean {
  return useViewStore.getState().followMode;
}

/** Flip follow mode (view-local). Fired by the shared toggle action. */
export function toggleFollowMode(): void {
  useViewStore.getState().toggleFollowMode();
}

/** Set follow mode explicitly (view-local). */
export function setFollowMode(on: boolean): void {
  useViewStore.getState().setFollowMode(on);
}

/**
 * Select a FEATURE as the canonical singleton selection (feature-selection-global-state).
 * Writes `selected_ids = [feature:<tag>]` through the ONE selection seam — so the selected
 * feature is backend-persisted, TanStack-cached, and subscribed by EVERY surface: the rail
 * row highlight, the durable graph cluster spotlight (`projectDashboardSelectionToScene`
 * routes a `feature:` id to `set-feature-spotlight`), and the inspector. It SURVIVES data
 * refreshes / SSE deltas by construction (the spotlight is re-derived from canonical state),
 * replacing the prior scene-only one-shot meta-highlight that was wiped on every reload.
 *
 * This reverses the #16 scene-only decision now that the canonical write is correct: a LONE
 * `feature:<tag>` does NOT 400 — the engine's `validate_node_id` accepts it whenever the tag
 * exists in the current graph (engine `state.rs`). #16's 400s came from ALSO writing the
 * out-of-slice MEMBER ids into `selected_ids`; this writes only the single feature id, so the
 * guard passes and the filter plane is untouched. The tag is normalized (de-hashed) so a
 * `#feature-raw` and a `feature-raw` select the SAME feature. No-op for a blank tag.
 */
export function selectFeature(
  featureTag: unknown,
  scope: unknown = useViewStore.getState().scope,
): Promise<boolean> {
  const tag = normalizeFeatureTag(featureTag);
  if (tag === null) return Promise.resolve(false);
  return selectNode(featureNodeIdFromTag(tag), scope);
}

/**
 * Graph node -> rail half of follow mode: the canonical FEATURE TAG the rail should
 * EXPAND + select for a freshly-selected graph node. A `feature:<tag>` node maps to
 * its own tag; a `doc:` node maps to its FIRST feature tag (the rail groups a
 * document under its primary feature). The rail owns the actual expand/setActiveKey
 * with its own key format; this hands it the canonical tag to resolve. Returns null
 * when follow mode is OFF, the id is null, or no feature is known — the rail then
 * leaves its expansion untouched. SELECTION/navigation only.
 */
export function followFeatureKeyForNode(
  id: unknown,
  featureTags?: readonly unknown[],
): string | null {
  if (!followModeEnabled()) return null;
  const nodeId = normalizeNodeId(id);
  if (nodeId === null) return null;
  const fromId = featureTagFromNodeId(nodeId);
  if (fromId !== null) return fromId;
  const first = (featureTags ?? []).find(
    (tag) => typeof tag === "string" && tag.length > 0,
  );
  return typeof first === "string" ? first : null;
}
