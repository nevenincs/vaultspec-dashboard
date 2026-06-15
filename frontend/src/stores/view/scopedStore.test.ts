import { describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import { createScopedStore } from "./scopedStore";

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
    expect(s.storageKey("ws", "scope-a")).toBe("test:scoped:ws:scope-a");
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
