import { describe, expect, it } from "vitest";

import type { KeyValueStore } from "./positionCache";
import { PositionCache } from "./positionCache";

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  failNextSet = 0;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failNextSet > 0) {
      this.failNextSet -= 1;
      throw new Error("QuotaExceededError");
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const pos = (x: number, y: number) => ({ x, y });

describe("PositionCache", () => {
  it("round-trips positions keyed by workspace and scope", () => {
    const cache = new PositionCache(new MemoryStore());
    cache.save("ws", "scope-a", new Map([["n1", pos(1.234, 5.678)]]), 1);
    const restored = cache.load("ws", "scope-a");
    expect(restored.get("n1")).toEqual({ x: 1.2, y: 5.7 });
    expect(cache.load("ws", "scope-b").size).toBe(0);
    expect(cache.load("other", "scope-a").size).toBe(0);
  });

  it("treats corrupt blobs as a cache miss and clears them", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    store.map.set("vaultspec-dashboard:positions:ws:s", "{not json");
    expect(cache.load("ws", "s").size).toBe(0);
    expect(store.map.has("vaultspec-dashboard:positions:ws:s")).toBe(false);
  });

  it("clears a single scope on demand", () => {
    const cache = new PositionCache(new MemoryStore());
    cache.save("ws", "a", new Map([["n1", pos(0, 0)]]), 1);
    cache.save("ws", "b", new Map([["n1", pos(0, 0)]]), 2);
    cache.clear("ws", "a");
    expect(cache.load("ws", "a").size).toBe(0);
    expect(cache.load("ws", "b").size).toBe(1);
    expect(cache.scopes("ws")).toEqual(["b"]);
  });

  it("evicts least-recently-updated scopes beyond the limit", () => {
    const cache = new PositionCache(new MemoryStore());
    for (let i = 0; i < 14; i++) {
      cache.save("ws", `scope-${i}`, new Map([["n1", pos(i, i)]]), i);
    }
    expect(cache.scopes("ws").length).toBe(12);
    expect(cache.load("ws", "scope-0").size).toBe(0);
    expect(cache.load("ws", "scope-13").size).toBe(1);
  });

  it("evicts older scopes to make room when the store rejects a write", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    cache.save("ws", "old", new Map([["n1", pos(0, 0)]]), 1);
    cache.save("ws", "new", new Map([["n1", pos(0, 0)]]), 2);
    store.failNextSet = 1;
    cache.save("ws", "newest", new Map([["n1", pos(9, 9)]]), 3);
    expect(cache.load("ws", "old").size).toBe(0);
    expect(cache.load("ws", "newest").get("n1")).toEqual({ x: 9, y: 9 });
  });

  it("ignores non-finite coordinates on load", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    store.map.set(
      "vaultspec-dashboard:positions:ws:s",
      JSON.stringify({ v: 1, updatedAt: 0, positions: { n1: [null, 2], n2: [3, 4] } }),
    );
    const restored = cache.load("ws", "s");
    expect(restored.has("n1")).toBe(false);
    expect(restored.get("n2")).toEqual({ x: 3, y: 4 });
  });
});
