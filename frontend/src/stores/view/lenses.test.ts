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

describe("lens persistence", () => {
  it("round-trips saved lenses and never persists builtins", () => {
    const store = new MemoryStore();
    saveLenses(store, [
      ...BUILTIN_LENSES,
      { name: "mine", choices: BUILTIN_LENSES[0].choices },
    ]);
    const loaded = loadLenses(store);
    expect(loaded.map((l) => l.name)).toEqual(["mine"]);
  });

  it("reads corrupt blobs as none", () => {
    const store = new MemoryStore();
    store.map.set("vaultspec-dashboard:lenses:default", "[broken");
    expect(loadLenses(store)).toEqual([]);
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

  it("applies the show-broken builtin (the B-row lens)", () => {
    expect(useLensStore.getState().apply("broken links")).toBe(true);
    expect(useFilterStore.getState().structuralStates).toEqual(["broken"]);
  });
});
