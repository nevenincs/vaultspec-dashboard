import { beforeEach, describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import { DEFAULT_CHOICES } from "./filters";
import {
  BUILTIN_LENSES,
  getLensChoices,
  loadLenses,
  removeSavedLens,
  saveCurrentLens,
  saveLenses,
  SAVED_LENSES_CAP,
  useLensStore,
} from "./lenses";

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
      { name: "broken links", choices: structuredClone(DEFAULT_CHOICES) },
      { name: "mine", choices: BUILTIN_LENSES[0].choices },
    ]);
    expect(loadLenses(store, "ws", "scope-a").map((l) => l.name)).toEqual(["mine"]);
    // No cross-scope or cross-workspace bleed.
    expect(loadLenses(store, "ws", "scope-b")).toEqual([]);
    expect(loadLenses(store, "other", "scope-a")).toEqual([]);
  });

  it("normalizes persistence workspace and scope identity", () => {
    const store = new MemoryStore();
    saveLenses(store, " ws ", " scope-a ", [
      { name: "mine", choices: structuredClone(DEFAULT_CHOICES) },
    ]);
    saveLenses(store, null, undefined, [
      { name: "fallback", choices: structuredClone(DEFAULT_CHOICES) },
    ]);

    expect(loadLenses(store, "ws", "scope-a").map((lens) => lens.name)).toEqual([
      "mine",
    ]);
    expect(loadLenses(store, "default", "default").map((lens) => lens.name)).toEqual([
      "fallback",
    ]);
  });

  it("reads corrupt blobs as none", () => {
    const store = new MemoryStore();
    store.map.set("vaultspec-dashboard:lenses:ws:s", "[broken");
    expect(loadLenses(store, "ws", "s")).toEqual([]);
  });

  it("normalizes persisted lens names and choices before exposing them", () => {
    const store = new MemoryStore();
    store.map.set(
      "vaultspec-dashboard:lenses:ws:scope-a",
      JSON.stringify([
        { name: " broken   links ", choices: structuredClone(DEFAULT_CHOICES) },
        {
          name: " weekly   review ",
          choices: {
            tiers: { semantic: false },
            minConfidence: { temporal: 2 },
            featureTags: ["state", 7],
            structuralStates: ["broken", "bad"],
            textMatch: 12,
            dateRange: { to: "2026-06-30" },
          },
        },
        { name: "bad", choices: "not choices" },
      ]),
    );

    expect(loadLenses(store, "ws", "scope-a")).toEqual([
      {
        name: "weekly review",
        choices: {
          ...structuredClone(DEFAULT_CHOICES),
          tiers: { ...DEFAULT_CHOICES.tiers, semantic: false },
          minConfidence: { temporal: 1 },
          featureTags: ["state"],
          structuralStates: ["broken"],
          dateRange: { to: "2026-06-30" },
        },
      },
    ]);
  });

  it("caps persisted saved lenses to the most recent unique names", () => {
    const store = new MemoryStore();
    const lenses = Array.from({ length: SAVED_LENSES_CAP + 6 }, (_, i) => ({
      name: `lens-${i}`,
      choices: structuredClone(DEFAULT_CHOICES),
    }));

    saveLenses(store, "ws", "scope-a", [
      ...BUILTIN_LENSES,
      ...lenses,
      { name: "lens-45", choices: structuredClone(DEFAULT_CHOICES) },
    ]);

    const loaded = loadLenses(store, "ws", "scope-a").map((lens) => lens.name);
    expect(loaded).toHaveLength(SAVED_LENSES_CAP);
    expect(loaded).not.toContain("lens-0");
    expect(loaded).not.toContain("broken links");
    expect(loaded.at(-1)).toBe("lens-45");
    expect(loaded.filter((name) => name === "lens-45")).toHaveLength(1);
  });
});

describe("lens store", () => {
  beforeEach(() => {
    useLensStore.setState({ saved: [] });
  });

  it("snapshots supplied canonical choices, resolves them, and removes", () => {
    useLensStore.getState().saveCurrent("last sprint", {
      ...structuredClone(DEFAULT_CHOICES),
      tiers: { ...DEFAULT_CHOICES.tiers, semantic: false },
      textMatch: "auth",
    });

    const choices = useLensStore.getState().choicesFor("last sprint");
    expect(choices?.textMatch).toBe("auth");
    expect(choices?.tiers.semantic).toBe(false);

    useLensStore.getState().remove("last sprint");
    expect(useLensStore.getState().choicesFor("last sprint")).toBeNull();
  });

  it("normalizes lens names on save, lookup, and remove", () => {
    useLensStore
      .getState()
      .saveCurrent("  weekly   review  ", structuredClone(DEFAULT_CHOICES));
    useLensStore.getState().saveCurrent("   ", structuredClone(DEFAULT_CHOICES));

    expect(useLensStore.getState().saved.map((lens) => lens.name)).toEqual([
      "weekly review",
    ]);
    expect(useLensStore.getState().choicesFor("weekly review")).not.toBeNull();
    expect(useLensStore.getState().choicesFor(" weekly   review ")).not.toBeNull();

    useLensStore.getState().remove(" weekly   review ");
    expect(useLensStore.getState().saved).toEqual([]);
  });

  it("exposes builtins plus saved to the palette", () => {
    useLensStore.getState().saveCurrent("mine", structuredClone(DEFAULT_CHOICES));
    const names = useLensStore
      .getState()
      .all()
      .map((l) => l.name);
    expect(names).toContain("broken links");
    expect(names).toContain("high-confidence only");
    expect(names).toContain("mine");
  });

  it("resolves the show-broken builtin as THE isolated broken view (019)", () => {
    const filters = useLensStore.getState().choicesFor("broken links");
    expect(filters?.structuralStates).toEqual(["broken"]);
    expect(filters?.tiers).toEqual({
      declared: false,
      structural: true,
      temporal: false,
      semantic: false,
    });
  });

  it("reserves builtin names so saved lenses cannot shadow palette commands", () => {
    useLensStore.getState().saveCurrent("broken links", {
      ...structuredClone(DEFAULT_CHOICES),
      textMatch: "shadow",
    });

    expect(useLensStore.getState().saved).toEqual([]);
    expect(
      useLensStore
        .getState()
        .all()
        .map((lens) => lens.name),
    ).toEqual(["broken links", "high-confidence only"]);
    expect(
      useLensStore.getState().choicesFor("broken links")?.structuralStates,
    ).toEqual(["broken"]);
  });

  it("re-keys per scope and isolates saved lenses (018)", () => {
    useLensStore.setState({ workspace: "default", scope: "scope-a", saved: [] });
    useLensStore
      .getState()
      .saveCurrent("scoped lens", structuredClone(DEFAULT_CHOICES));
    expect(useLensStore.getState().saved.map((l) => l.name)).toEqual(["scoped lens"]);
    useLensStore.getState().setScopeKey("default", "scope-b");
    expect(useLensStore.getState().saved).toEqual([]);
    expect(useLensStore.getState().scope).toBe("scope-b");
  });

  it("normalizes the active scoped key on store re-key", () => {
    useLensStore.getState().setScopeKey(" ws ", " scope-a ");

    expect(useLensStore.getState()).toMatchObject({
      workspace: "ws",
      scope: "scope-a",
      saved: [],
    });
  });

  it("caps saved lenses created through the store", () => {
    for (let i = 0; i < SAVED_LENSES_CAP + 5; i += 1) {
      useLensStore
        .getState()
        .saveCurrent(`lens-${i}`, structuredClone(DEFAULT_CHOICES));
    }

    expect(useLensStore.getState().saved).toHaveLength(SAVED_LENSES_CAP);
    expect(useLensStore.getState().choicesFor("lens-0")).toBeNull();
    expect(
      useLensStore.getState().choicesFor(`lens-${SAVED_LENSES_CAP + 4}`),
    ).not.toBeNull();
  });

  it("exposes named lens helpers for app-layer consumers", () => {
    saveCurrentLens("palette helper", {
      ...structuredClone(DEFAULT_CHOICES),
      textMatch: "palette",
    });

    expect(getLensChoices("palette helper")?.textMatch).toBe("palette");

    removeSavedLens("palette helper");
    expect(getLensChoices("palette helper")).toBeNull();
  });
});
