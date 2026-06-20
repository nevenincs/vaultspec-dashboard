// Node pinning (W02.P06.S27, ADR G5.d): pinned nodes are layout-fixed and
// always-labelled on the field, and pins persist client-side per
// workspace + scope — the engine holds no preference store. The seam's
// `pin` event toggles; the `set-pinned` command carries the membership to
// the renderer (locked at S04).

import { create } from "zustand";

import type { KeyValueStore } from "../../scene/positionCache";
import type { SceneController } from "../../scene/sceneController";
import { normalizeNodeId, normalizeNodeIds } from "../nodeIds";
import { createScopedStore, normalizeScopedStoreKeyPart } from "./scopedStore";

// Pins are a `string[]` of node ids; the scope-keyed persistence scaffold
// (key composition, corrupt-blob recovery, best-effort save, localStorage
// guard) is owned by `createScopedStore` and configured here for that shape.
export const PINNED_IDS_CAP = 256;

export function normalizePinnedNodeIds(ids: readonly unknown[]): string[] {
  return normalizeNodeIds([...ids].reverse(), PINNED_IDS_CAP).reverse();
}

const pinsStore = createScopedStore<string[]>({
  prefix: "vaultspec-dashboard:pins",
  parse: (raw) => (Array.isArray(raw) ? normalizePinnedNodeIds(raw) : []),
  serialize: (ids) => normalizePinnedNodeIds(ids),
});

/** Load persisted pins for a scope (corrupt blobs read as none). */
export function loadPins(
  store: KeyValueStore,
  workspace: unknown,
  scope: unknown,
): string[] {
  return pinsStore.load(store, workspace, scope);
}

export function savePins(
  store: KeyValueStore,
  workspace: unknown,
  scope: unknown,
  ids: readonly string[],
): void {
  pinsStore.save(store, workspace, scope, normalizePinnedNodeIds(ids));
}

interface PinState {
  pinnedIds: string[];
  workspace: string;
  scope: string;
  /** Swap the persistence scope and load its pins (worktree switch). */
  setScopeKey: (workspace: unknown, scope: unknown) => void;
  togglePin: (id: unknown) => void;
  isPinned: (id: unknown) => boolean;
}

export const usePinStore = create<PinState>((set, get) => ({
  pinnedIds: [],
  workspace: "default",
  scope: "default",
  setScopeKey: (workspace, scope) => {
    const nextWorkspace = normalizeScopedStoreKeyPart(workspace);
    const nextScope = normalizeScopedStoreKeyPart(scope);
    const store = pinsStore.backingStore();
    set({
      workspace: nextWorkspace,
      scope: nextScope,
      pinnedIds: store ? loadPins(store, nextWorkspace, nextScope) : [],
    });
  },
  togglePin: (id) => {
    const nodeId = normalizeNodeId(id);
    if (nodeId === null) return;
    const { pinnedIds, workspace, scope } = get();
    const current = normalizePinnedNodeIds(pinnedIds);
    const next = current.includes(nodeId)
      ? current.filter((p) => p !== nodeId)
      : normalizePinnedNodeIds([...current, nodeId]);
    set({ pinnedIds: next });
    const store = pinsStore.backingStore();
    if (store) savePins(store, workspace, scope, next);
  },
  isPinned: (id) => {
    const nodeId = normalizeNodeId(id);
    return nodeId !== null && normalizePinnedNodeIds(get().pinnedIds).includes(nodeId);
  },
}));

/** Toggle pinned-node intent through the named store seam. */
export function togglePinnedNode(id: unknown): void {
  usePinStore.getState().togglePin(id);
}

/** Read pinned-node membership without exposing the store mutator surface. */
export function isPinnedNode(id: unknown): boolean {
  return usePinStore.getState().isPinned(id);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Bind pins outward: seam `pin` events toggle, membership changes flow
 * back as `set-pinned` commands. Returns an unsubscribe.
 */
export function bindPinsToScene(scene: SceneController): () => void {
  const offEvents = scene.on((event) => {
    if (event.kind === "pin") togglePinnedNode(event.id);
  });
  let last = normalizePinnedNodeIds(usePinStore.getState().pinnedIds);
  const offStore = usePinStore.subscribe((state) => {
    const next = normalizePinnedNodeIds(state.pinnedIds);
    if (sameIds(next, last)) return;
    last = next;
    scene.command({ kind: "set-pinned", ids: new Set(next) });
  });
  // Apply the current membership immediately (e.g. after a scope load).
  scene.command({ kind: "set-pinned", ids: new Set(last) });
  return () => {
    offEvents();
    offStore();
  };
}
