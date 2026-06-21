import { describe, expect, it } from "vitest";

import {
  SCOPED_STORAGE_KEY_PART_MAX_CHARS,
  normalizeScopedStorageKeyPart,
  scopedStorageKey,
} from "../../platform/storage/scopedKeys";
import type { KeyValueStore } from "../../scene/positionCache";
import {
  createScopedStore,
  normalizeScopedStoreKeyPart,
  SCOPED_STORE_VALUE_MAX_CHARS,
} from "./scopedStore";

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// A minimal string[] configuration mirroring the pins surface, exercised
// directly so the shared scaffold (key composition, corrupt-blob recovery,
// best-effort save, reload-on-scope-swap) is pinned independent of either
// consumer.
const factory = () =>
  createScopedStore<string[]>({
    prefix: "test:scoped",
    parse: (raw) =>
      Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
    serialize: (v) => v,
  });

describe("createScopedStore: scope-keyed persistence scaffold", () => {
  it("composes the prefix:workspace:scope storage key", () => {
    const s = factory();
    expect(s.storageKey("ws", "scope-a")).toBe(
      "test:scoped:workspace:ws:scope:scope-a",
    );
    expect(s.storageKey("Y:/repo/.git", "Y:/repo")).toBe(
      "test:scoped:workspace:Y%3A%2Frepo%2F.git:scope:Y%3A%2Frepo",
    );
    expect(s.storageKey("ws", "scope-a")).toBe(
      scopedStorageKey("test:scoped", "ws", "scope-a"),
    );
  });

  it("normalizes scoped key parts before composing or persisting", () => {
    const s = factory();
    const store = new MemoryStore();

    expect(normalizeScopedStoreKeyPart(" ws ")).toBe("ws");
    expect(normalizeScopedStoreKeyPart(" ws ")).toBe(
      normalizeScopedStorageKeyPart(" ws "),
    );
    expect(normalizeScopedStoreKeyPart("   ")).toBe("default");
    expect(normalizeScopedStoreKeyPart(null)).toBe("default");
    expect(
      normalizeScopedStoreKeyPart("x".repeat(SCOPED_STORAGE_KEY_PART_MAX_CHARS + 1)),
    ).toBe("default");
    expect(s.storageKey(" ws ", " scope-a ")).toBe(
      "test:scoped:workspace:ws:scope:scope-a",
    );
    expect(
      s.storageKey("x".repeat(SCOPED_STORAGE_KEY_PART_MAX_CHARS + 1), "scope-a"),
    ).toBe("test:scoped:workspace:default:scope:scope-a");
    expect(s.storageKey(null, undefined)).toBe(
      "test:scoped:workspace:default:scope:default",
    );

    s.save(store, " ws ", " scope-a ", ["trimmed"]);
    expect(s.load(store, "ws", "scope-a")).toEqual(["trimmed"]);
    s.save(store, null, undefined, ["fallback"]);
    expect(s.load(store, "default", "default")).toEqual(["fallback"]);
  });

  it("encodes key parts so workspace/scope separator collisions are impossible", () => {
    const s = factory();

    expect(s.storageKey("a:b", "c")).not.toBe(s.storageKey("a", "b:c"));
    expect(s.storageKey("workspace:a", "scope:b")).not.toBe(
      s.storageKey("a", "scope:workspace:b"),
    );
  });

  it("round-trips a value and isolates per workspace and scope", () => {
    const store = new MemoryStore();
    const s = factory();
    s.save(store, "ws", "scope-a", ["x", "y"]);
    expect(s.load(store, "ws", "scope-a")).toEqual(["x", "y"]);
    // No cross-scope or cross-workspace bleed.
    expect(s.load(store, "ws", "scope-b")).toEqual([]);
    expect(s.load(store, "other", "scope-a")).toEqual([]);
  });

  it("reads an absent blob as the empty value via parse", () => {
    const store = new MemoryStore();
    const s = factory();
    expect(s.load(store, "ws", "never-written")).toEqual([]);
  });

  it("recovers from a corrupt blob: reads empty and clears the key", () => {
    const store = new MemoryStore();
    const s = factory();
    store.map.set(s.storageKey("ws", "s"), "{not json");
    expect(s.load(store, "ws", "s")).toEqual([]);
    expect(store.map.has(s.storageKey("ws", "s"))).toBe(false);
  });

  it("bounds scoped persisted values before parse and save", () => {
    const store = new MemoryStore();
    const s = factory();
    const key = s.storageKey("ws", "s");
    store.map.set(key, "x".repeat(SCOPED_STORE_VALUE_MAX_CHARS + 1));

    expect(s.load(store, "ws", "s")).toEqual([]);
    expect(store.map.has(key)).toBe(false);

    const large = createScopedStore<string[]>({
      prefix: "test:large",
      parse: (raw) =>
        Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
      serialize: () => ["x".repeat(SCOPED_STORE_VALUE_MAX_CHARS + 1)],
    });
    large.save(store, "ws", "s", ["too-large"]);
    expect(store.map.has(large.storageKey("ws", "s"))).toBe(false);
  });

  it("loads legacy raw keys so existing saved state survives the key hardening", () => {
    const store = new MemoryStore();
    const s = factory();
    store.map.set("test:scoped:Y:/repo/.git:Y:/repo", JSON.stringify(["legacy"]));

    expect(s.load(store, "Y:/repo/.git", "Y:/repo")).toEqual(["legacy"]);
  });

  it("loads legacy encoded keys from the pre role-tagged key shape", () => {
    const store = new MemoryStore();
    const s = factory();
    store.map.set(
      "test:scoped:Y%3A%2Frepo%2F.git:Y%3A%2Frepo",
      JSON.stringify(["encoded legacy"]),
    );

    expect(s.load(store, "Y:/repo/.git", "Y:/repo")).toEqual(["encoded legacy"]);
  });

  it("clears corrupt legacy blobs when falling back from an encoded miss", () => {
    const store = new MemoryStore();
    const s = factory();
    const legacy = "test:scoped:Y:/repo/.git:Y:/repo";
    store.map.set(legacy, "{not json");

    expect(s.load(store, "Y:/repo/.git", "Y:/repo")).toEqual([]);
    expect(store.map.has(legacy)).toBe(false);
  });

  it("coerces an unrecognised (non-empty, valid-JSON) blob to empty without clearing", () => {
    const store = new MemoryStore();
    const s = factory();
    // Valid JSON, wrong shape (object, not array) -> parse() coerces to [].
    store.map.set(s.storageKey("ws", "s"), JSON.stringify({ nope: 1 }));
    expect(s.load(store, "ws", "s")).toEqual([]);
    // Parsed cleanly, so the key is NOT removed (only parse failures clear).
    expect(store.map.has(s.storageKey("ws", "s"))).toBe(true);
  });

  it("survives a throwing backing store on save (best-effort persistence)", () => {
    const s = factory();
    const exploding: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => undefined,
    };
    expect(() => s.save(exploding, "ws", "s", ["x"])).not.toThrow();
  });

  it("serialize transforms the persisted blob (e.g. dropping entries)", () => {
    const store = new MemoryStore();
    const dropOdd = createScopedStore<number[]>({
      prefix: "test:filtered",
      parse: (raw) =>
        Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : [],
      serialize: (v) => v.filter((n) => n % 2 === 0),
    });
    dropOdd.save(store, "ws", "s", [1, 2, 3, 4]);
    expect(dropOdd.load(store, "ws", "s")).toEqual([2, 4]);
  });

  it("a scope swap reloads the new scope's value (reload-on-scope-swap)", () => {
    const store = new MemoryStore();
    const s = factory();
    s.save(store, "ws", "scope-a", ["a-only"]);
    s.save(store, "ws", "scope-b", ["b-only"]);

    // Simulate the setScopeKey reload pattern: a consumer holding scope-a's
    // value re-reads under the new scope on swap, never carrying the old one.
    let active = s.load(store, "ws", "scope-a");
    expect(active).toEqual(["a-only"]);
    active = s.load(store, "ws", "scope-b");
    expect(active).toEqual(["b-only"]);
    expect(active).not.toContain("a-only");
  });
});
