import { beforeEach, describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import { useFilterStore } from "./filters";
import { BUILTIN_LENSES, loadLenses, saveLenses, useLensStore } from "./lenses";

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

describe("lens persistence (keyed by workspace+scope, finding 018)", () => {
  it("round-trips saved lenses per scope and never persists builtins", () => {
    const store = new MemoryStore();
    saveLenses(store, "ws", "scope-a", [
      ...BUILTIN_LENSES,
      { name: "mine", choices: BUILTIN_LENSES[0].choices },
    ]);
    expect(loadLenses(store, "ws", "scope-a").map((l) => l.name)).toEqual(["mine"]);
    // No cross-scope or cross-workspace bleed.
    expect(loadLenses(store, "ws", "scope-b")).toEqual([]);
    expect(loadLenses(store, "other", "scope-a")).toEqual([]);
  });

  it("reads corrupt blobs as none", () => {
    const store = new MemoryStore();
    store.map.set("vaultspec-dashboard:lenses:ws:s", "[broken");
    expect(loadLenses(store, "ws", "s")).toEqual([]);
  });
});

describe("lens store", () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
    useLensStore.setState({ saved: [] });
  });

  it("snapshots current choices, applies them back, and removes", () => {
    useFilterStore.getState().setTier("semantic", false);
    useFilterStore.getState().setTextMatch("auth");
    useLensStore.getState().saveCurrent("last sprint");

    useFilterStore.getState().reset();
    expect(useFilterStore.getState().textMatch).toBe("");

    expect(useLensStore.getState().apply("last sprint")).toBe(true);
    expect(useFilterStore.getState().textMatch).toBe("auth");
    expect(useFilterStore.getState().tiers.semantic).toBe(false);

    useLensStore.getState().remove("last sprint");
    expect(useLensStore.getState().apply("last sprint")).toBe(false);
  });

  it("exposes builtins plus saved to the palette", () => {
    useLensStore.getState().saveCurrent("mine");
    const names = useLensStore
      .getState()
      .all()
      .map((l) => l.name);
    expect(names).toContain("broken links");
    expect(names).toContain("high-confidence only");
    expect(names).toContain("mine");
  });

  it("applies the show-broken builtin as THE isolated broken view (019)", () => {
    expect(useLensStore.getState().apply("broken links")).toBe(true);
    const filters = useFilterStore.getState();
    expect(filters.structuralStates).toEqual(["broken"]);
    expect(filters.tiers).toEqual({
      declared: false,
      structural: true,
      temporal: false,
      semantic: false,
    });
  });

  it("re-keys per scope and isolates saved lenses (018)", () => {
    useLensStore.setState({ workspace: "default", scope: "scope-a", saved: [] });
    useLensStore.getState().saveCurrent("scoped lens");
    expect(useLensStore.getState().saved.map((l) => l.name)).toEqual(["scoped lens"]);
    useLensStore.getState().setScopeKey("default", "scope-b");
    expect(useLensStore.getState().saved).toEqual([]);
    expect(useLensStore.getState().scope).toBe("scope-b");
  });
});
