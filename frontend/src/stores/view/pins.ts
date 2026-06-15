// Node pinning (W02.P06.S27, ADR G5.d): pinned nodes are layout-fixed and
// always-labelled on the field, and pins persist client-side per
// workspace + scope — the engine holds no preference store. The seam's
// `pin` event toggles; the `set-pinned` command carries the membership to
// the renderer (locked at S04).

import { create } from "zustand";

import type { KeyValueStore } from "../../scene/positionCache";
import type { SceneController } from "../../scene/sceneController";
import { createScopedStore } from "./scopedStore";

// Pins are a `string[]` of node ids; the scope-keyed persistence scaffold
// (key composition, corrupt-blob recovery, best-effort save, localStorage
// guard) is owned by `createScopedStore` and configured here for that shape.
const pinsStore = createScopedStore<string[]>({
  prefix: "vaultspec-dashboard:pins",
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
  serialize: (ids) => ids,
});

/** Load persisted pins for a scope (corrupt blobs read as none). */
export function loadPins(
  store: KeyValueStore,
  workspace: string,
  scope: string,
): string[] {
  return pinsStore.load(store, workspace, scope);
}

export function savePins(
  store: KeyValueStore,
  workspace: string,
  scope: string,
  ids: readonly string[],
): void {
  pinsStore.save(store, workspace, scope, [...ids]);
}

interface PinState {
  pinnedIds: string[];
  workspace: string;
  scope: string;
  /** Swap the persistence scope and load its pins (worktree switch). */
  setScopeKey: (workspace: string, scope: string) => void;
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
}

export const usePinStore = create<PinState>((set, get) => ({
  pinnedIds: [],
  workspace: "default",
  scope: "default",
  setScopeKey: (workspace, scope) => {
    const store = pinsStore.backingStore();
    set({
      workspace,
      scope,
      pinnedIds: store ? loadPins(store, workspace, scope) : [],
    });
  },
  togglePin: (id) => {
    const { pinnedIds, workspace, scope } = get();
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter((p) => p !== id)
      : [...pinnedIds, id];
    set({ pinnedIds: next });
    const store = pinsStore.backingStore();
    if (store) savePins(store, workspace, scope, next);
  },
  isPinned: (id) => get().pinnedIds.includes(id),
}));

/**
 * Bind pins outward: seam `pin` events toggle, membership changes flow
 * back as `set-pinned` commands. Returns an unsubscribe.
 */
export function bindPinsToScene(scene: SceneController): () => void {
  const offEvents = scene.on((event) => {
    if (event.kind === "pin") usePinStore.getState().togglePin(event.id);
  });
  let last = usePinStore.getState().pinnedIds;
  const offStore = usePinStore.subscribe((state) => {
    if (state.pinnedIds === last) return;
    last = state.pinnedIds;
    scene.command({ kind: "set-pinned", ids: new Set(state.pinnedIds) });
  });
  // Apply the current membership immediately (e.g. after a scope load).
  scene.command({ kind: "set-pinned", ids: new Set(last) });
  return () => {
    offEvents();
    offStore();
  };
}
