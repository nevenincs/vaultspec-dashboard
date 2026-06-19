// Client-side position cache and warm-start persistence (W01.P02.S08, ADR
// G5.d and G3.e).
//
// Node positions for a given scope are cached per workspace so reopening
// the app restores the remembered map — mental-map preservation is the
// product's dominant-task optimization. All view persistence is
// client-side: the engine is read-and-infer and holds no preference/layout
// store; nothing here is a contract surface.
//
// Positions are keyed by the contract's stable node ids, so a cached map
// survives re-querying, filtering, and time travel. Scene-layer module:
// framework-free by design. Storage is injectable (localStorage in the
// browser, a Map-backed stub in tests).

export interface NodePosition {
  x: number;
  y: number;
}

/** The subset of the Web Storage API the cache needs — injectable. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CacheBlob {
  /** Bumped on incompatible layout changes; mismatches are discarded. */
  v: 1;
  updatedAt: number;
  positions: Record<string, [number, number]>;
}

const PREFIX = "vaultspec-dashboard:positions";
/** Most scopes a workspace keeps warm; least-recently-updated evict first. */
const MAX_SCOPES = 12;

const keyPart = (value: string): string => encodeURIComponent(value);

const legacyScopeKey = (workspace: string, scope: string): string =>
  `${PREFIX}:${workspace}:${scope}`;
const scopeKey = (workspace: string, scope: string): string =>
  `${PREFIX}:${keyPart(workspace)}:${keyPart(scope)}`;
const legacyIndexKey = (workspace: string): string => `${PREFIX}:${workspace}::index`;
const indexKey = (workspace: string): string =>
  `${PREFIX}:${keyPart(workspace)}::index`;

export class PositionCache {
  private store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  /** Restore the remembered positions for a workspace + scope, if any. */
  load(workspace: string, scope: string): Map<string, NodePosition> {
    const key = scopeKey(workspace, scope);
    const legacyKey = legacyScopeKey(workspace, scope);
    const primaryRaw = this.store.getItem(key);
    const usingLegacy = primaryRaw === null && legacyKey !== key;
    const raw = primaryRaw ?? (usingLegacy ? this.store.getItem(legacyKey) : null);
    const out = new Map<string, NodePosition>();
    if (!raw) return out;
    try {
      const blob = JSON.parse(raw) as CacheBlob;
      if (blob.v !== 1) return out;
      for (const [id, [x, y]] of Object.entries(blob.positions)) {
        if (Number.isFinite(x) && Number.isFinite(y)) out.set(id, { x, y });
      }
    } catch {
      // Corrupt blob: a cache miss, never an error surface.
      this.store.removeItem(usingLegacy ? legacyKey : key);
    }
    return out;
  }

  /**
   * Persist positions for a workspace + scope. Coordinates are rounded to
   * 0.1 scene units (warm-start seeds don't need sub-pixel fidelity and the
   * blob shrinks ~2x). On quota pressure, least-recently-updated scopes
   * evict until the write fits; persistence is best-effort by design.
   */
  save(
    workspace: string,
    scope: string,
    positions: ReadonlyMap<string, NodePosition>,
    now: number,
  ): void {
    const blob: CacheBlob = { v: 1, updatedAt: now, positions: {} };
    for (const [id, p] of positions) {
      blob.positions[id] = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
    }
    const key = scopeKey(workspace, scope);
    const value = JSON.stringify(blob);
    for (let attempt = 0; attempt <= MAX_SCOPES; attempt++) {
      try {
        this.store.setItem(key, value);
        this.evictBeyondLimit(workspace, scope);
        return;
      } catch {
        if (!this.evictOldest(workspace, key)) return;
      }
    }
  }

  /** Drop one scope's cache (e.g. on a corrupt or stale layout). */
  clear(workspace: string, scope: string): void {
    this.removeScopeBlob(workspace, scope);
    this.index(workspace).delete(scope);
    this.writeIndex(workspace);
  }

  /** All scopes currently cached for a workspace, oldest first. */
  scopes(workspace: string): readonly string[] {
    return [...this.index(workspace).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([scope]) => scope);
  }

  // --- scope index (per workspace, for LRU eviction) -------------------------

  private indexCache = new Map<string, Map<string, number>>();

  private index(workspace: string): Map<string, number> {
    let idx = this.indexCache.get(workspace);
    if (idx) return idx;
    idx = new Map();
    const key = indexKey(workspace);
    const legacyKey = legacyIndexKey(workspace);
    const primaryRaw = this.store.getItem(key);
    const usingLegacy = primaryRaw === null && legacyKey !== key;
    const raw = primaryRaw ?? (usingLegacy ? this.store.getItem(legacyKey) : null);
    if (raw) {
      try {
        for (const [scope, at] of Object.entries(
          JSON.parse(raw) as Record<string, number>,
        )) {
          idx.set(scope, at);
        }
      } catch {
        // Corrupt index: rebuilt as scopes save.
      }
    }
    this.indexCache.set(workspace, idx);
    return idx;
  }

  private writeIndex(workspace: string): void {
    try {
      this.store.setItem(
        indexKey(workspace),
        JSON.stringify(Object.fromEntries(this.index(workspace))),
      );
    } catch {
      // Index is an optimization; losing it only weakens eviction order.
    }
  }

  private evictBeyondLimit(workspace: string, justSaved: string): void {
    const idx = this.index(workspace);
    idx.set(justSaved, Math.max(...[0, ...idx.values()]) + 1);
    while (idx.size > MAX_SCOPES) {
      const oldest = [...idx.entries()].sort((a, b) => a[1] - b[1])[0][0];
      this.removeScopeBlob(workspace, oldest);
      idx.delete(oldest);
    }
    this.writeIndex(workspace);
  }

  private evictOldest(workspace: string, excludeKey: string): boolean {
    const idx = this.index(workspace);
    for (const [scope] of [...idx.entries()].sort((a, b) => a[1] - b[1])) {
      if (scopeKey(workspace, scope) === excludeKey) continue;
      this.removeScopeBlob(workspace, scope);
      idx.delete(scope);
      this.writeIndex(workspace);
      return true;
    }
    return false;
  }

  private removeScopeBlob(workspace: string, scope: string): void {
    this.store.removeItem(scopeKey(workspace, scope));
    const legacyKey = legacyScopeKey(workspace, scope);
    if (legacyKey !== scopeKey(workspace, scope)) {
      this.store.removeItem(legacyKey);
    }
  }
}

/** The browser-default cache over `localStorage`; null outside a browser. */
export function defaultPositionCache(): PositionCache | null {
  if (typeof localStorage === "undefined") return null;
  return new PositionCache(localStorage);
}
