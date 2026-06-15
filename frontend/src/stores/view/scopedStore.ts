// Scope-keyed client-side persistence scaffold (M2 consolidation). The
// engine holds no preference store, so view-local preferences (pins, named
// lenses, and any future per-scope surface) persist in web storage keyed by
// workspace + scope (ADR G5.d; finding lens-scope-key-018: scope-dependent
// vocabulary makes cross-scope bleed real). Every such surface shares the
// SAME scaffold — storage-key composition, corrupt-blob recovery on load,
// best-effort save, the localStorage guard, and reload-on-scope-swap — so it
// is owned here once and configured per value shape.

import type { KeyValueStore } from "../../scene/positionCache";

export interface ScopedStoreConfig<T> {
  /** Storage-key namespace, e.g. `vaultspec-dashboard:pins`. */
  prefix: string;
  /**
   * Coerce a parsed JSON blob into the value shape. Receives `unknown`
   * (whatever `JSON.parse` yielded) and returns the recovered value; an
   * unrecognised blob must coerce to the empty value, not throw.
   */
  parse: (raw: unknown) => T;
  /** Serialise the value for persistence (e.g. drop builtin lenses). */
  serialize: (value: T) => unknown;
}

export interface ScopedStore<T> {
  /** Compose the `prefix:workspace:scope` storage key. */
  storageKey: (workspace: string, scope: string) => string;
  /** Load the persisted value for a scope (corrupt blobs read as empty). */
  load: (store: KeyValueStore, workspace: string, scope: string) => T;
  /** Best-effort persist; a full store loses the value, never crashes. */
  save: (store: KeyValueStore, workspace: string, scope: string, value: T) => void;
  /** The backing localStorage, or null when storage is unavailable (node). */
  backingStore: () => KeyValueStore | null;
}

/**
 * Build the load/save/storageKey/backingStore trio for one scope-keyed
 * persistence surface. The empty value returned for an absent or corrupt
 * blob is `parse(undefined)`, so configs derive emptiness from their own
 * `parse` rather than re-declaring it.
 */
export function createScopedStore<T>(config: ScopedStoreConfig<T>): ScopedStore<T> {
  const { prefix, parse, serialize } = config;

  const storageKey = (workspace: string, scope: string) =>
    `${prefix}:${workspace}:${scope}`;

  const load = (store: KeyValueStore, workspace: string, scope: string): T => {
    const key = storageKey(workspace, scope);
    const raw = store.getItem(key);
    if (!raw) return parse(undefined);
    try {
      return parse(JSON.parse(raw) as unknown);
    } catch {
      store.removeItem(key);
      return parse(undefined);
    }
  };

  const save = (
    store: KeyValueStore,
    workspace: string,
    scope: string,
    value: T,
  ): void => {
    try {
      store.setItem(storageKey(workspace, scope), JSON.stringify(serialize(value)));
    } catch {
      // Best-effort persistence; a full store loses the value, never crashes.
    }
  };

  const backingStore = (): KeyValueStore | null =>
    typeof localStorage === "undefined" ? null : localStorage;

  return { storageKey, load, save, backingStore };
}
