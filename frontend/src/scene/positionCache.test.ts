import { describe, expect, it } from "vitest";

import { SCOPED_STORAGE_KEY_PART_MAX_CHARS } from "../platform/storage/scopedKeys";
import type { KeyValueStore } from "./positionCache";
import {
  normalizePositionCacheKeyPart,
  PositionCache,
} from "./positionCache";

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
  it("stores active position blobs under encoded workspace and scope keys", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    cache.save("Y:/repo/.git", "Y:/repo", new Map([["n1", pos(1, 2)]]), 1);

    expect(
      store.map.has(
        "vaultspec-dashboard:positions:workspace:Y%3A%2Frepo%2F.git:scope:Y%3A%2Frepo",
      ),
    ).toBe(true);
    expect(store.map.has("vaultspec-dashboard:positions:Y:/repo/.git:Y:/repo")).toBe(
      false,
    );
  });

  it("normalizes workspace and scope key parts before load, save, and clear", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);

    expect(normalizePositionCacheKeyPart(" ws ")).toBe("ws");
    expect(normalizePositionCacheKeyPart("   ")).toBe("default");
    expect(normalizePositionCacheKeyPart(null)).toBe("default");
    expect(
      normalizePositionCacheKeyPart(
        "x".repeat(SCOPED_STORAGE_KEY_PART_MAX_CHARS + 1),
      ),
    ).toBe("default");

    cache.save(" ws ", " scope-a ", new Map([["n1", pos(1, 2)]]), 1);
    expect(cache.load("ws", "scope-a").get("n1")).toEqual({ x: 1, y: 2 });

    cache.save(
      "x".repeat(SCOPED_STORAGE_KEY_PART_MAX_CHARS + 1),
      "scope-a",
      new Map([["n-over", pos(5, 6)]]),
      3,
    );
    expect(cache.load("default", "scope-a").get("n-over")).toEqual({ x: 5, y: 6 });

    cache.save(null, undefined, new Map([["n2", pos(3, 4)]]), 2);
    expect(cache.load("default", "default").get("n2")).toEqual({ x: 3, y: 4 });

    cache.clear(" ws ", " scope-a ");
    expect(cache.load("ws", "scope-a").size).toBe(0);
  });

  it("encodes key parts so workspace and scope separator collisions are impossible", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    cache.save("a:b", "c", new Map([["n1", pos(1, 1)]]), 1);
    cache.save("a", "b:c", new Map([["n2", pos(2, 2)]]), 2);

    expect(cache.load("a:b", "c").get("n1")).toEqual({ x: 1, y: 1 });
    expect(cache.load("a:b", "c").has("n2")).toBe(false);
    expect(cache.load("a", "b:c").get("n2")).toEqual({ x: 2, y: 2 });
    expect(cache.load("a", "b:c").has("n1")).toBe(false);
  });

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

  it("loads legacy raw keys so existing saved positions survive the key hardening", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    store.map.set(
      "vaultspec-dashboard:positions:Y:/repo/.git:Y:/repo",
      JSON.stringify({
        v: 1,
        updatedAt: 1,
        positions: { n1: [3, 4] },
      }),
    );

    expect(cache.load("Y:/repo/.git", "Y:/repo").get("n1")).toEqual({ x: 3, y: 4 });
  });

  it("clears corrupt legacy blobs when falling back from an encoded miss", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    const legacy = "vaultspec-dashboard:positions:Y:/repo/.git:Y:/repo";
    store.map.set(legacy, "{not json");

    expect(cache.load("Y:/repo/.git", "Y:/repo").size).toBe(0);
    expect(store.map.has(legacy)).toBe(false);
  });

  it("clears a single scope on demand", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    cache.save("ws", "a", new Map([["n1", pos(0, 0)]]), 1);
    cache.save("ws", "b", new Map([["n1", pos(0, 0)]]), 2);
    store.map.set(
      "vaultspec-dashboard:positions:ws:a",
      JSON.stringify({ legacy: true }),
    );
    cache.clear("ws", "a");
    expect(cache.load("ws", "a").size).toBe(0);
    expect(cache.load("ws", "b").size).toBe(1);
    expect(store.map.has("vaultspec-dashboard:positions:ws:a")).toBe(false);
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

  it("loads legacy raw index keys so existing eviction order survives key hardening", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    for (let i = 0; i < 12; i++) {
      store.map.set(
        `vaultspec-dashboard:positions:Y:/repo/.git:scope-${i}`,
        JSON.stringify({ v: 1, updatedAt: i, positions: { n1: [i, i] } }),
      );
    }
    store.map.set(
      "vaultspec-dashboard:positions:Y:/repo/.git::index",
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`scope-${i}`, i])),
      ),
    );

    expect(cache.scopes("Y:/repo/.git")[0]).toBe("scope-0");
    cache.save("Y:/repo/.git", "scope-new", new Map([["n2", pos(9, 9)]]), 13);

    expect(cache.load("Y:/repo/.git", "scope-0").size).toBe(0);
    expect(store.map.has("vaultspec-dashboard:positions:Y:/repo/.git:scope-0")).toBe(
      false,
    );
    expect(cache.load("Y:/repo/.git", "scope-new").get("n2")).toEqual({
      x: 9,
      y: 9,
    });
  });

  it("loads legacy encoded index keys from the pre role-tagged key shape", () => {
    const store = new MemoryStore();
    const cache = new PositionCache(store);
    for (let i = 0; i < 12; i++) {
      store.map.set(
        `vaultspec-dashboard:positions:Y%3A%2Frepo%2F.git:scope-${i}`,
        JSON.stringify({ v: 1, updatedAt: i, positions: { n1: [i, i] } }),
      );
    }
    store.map.set(
      "vaultspec-dashboard:positions:Y%3A%2Frepo%2F.git::index",
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`scope-${i}`, i])),
      ),
    );

    expect(cache.scopes("Y:/repo/.git")[0]).toBe("scope-0");
    cache.save("Y:/repo/.git", "scope-new", new Map([["n2", pos(9, 9)]]), 13);

    expect(cache.load("Y:/repo/.git", "scope-0").size).toBe(0);
    expect(
      store.map.has("vaultspec-dashboard:positions:Y%3A%2Frepo%2F.git:scope-0"),
    ).toBe(false);
    expect(cache.load("Y:/repo/.git", "scope-new").get("n2")).toEqual({
      x: 9,
      y: 9,
    });
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
