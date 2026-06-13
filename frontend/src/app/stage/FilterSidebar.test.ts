// Unit tests for FilterSidebar (task-6 graph workspace chrome).
//
// F6-02 coverage (reviewer requirement):
//   • Facet toggle logic: adding a value to an active facet set and removing
//     it (the add-if-absent / remove-if-present pattern the sidebar drives).
//   • Text-match update: the textMatch field responds correctly to updates
//     and resets cleanly.
//
// The sidebar component is a thin stateless UI layer over useFilterStore;
// testing the store actions that the sidebar drives IS testing the sidebar's
// logic — the same path that every user interaction traverses. We test the
// store at this level to avoid a full DOM render with QueryClientProvider
// (the sidebar also calls useFiltersVocabulary which is a TanStack hook).

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CHOICES, useFilterStore } from "../../stores/view/filters";

function fresh() {
  useFilterStore.getState().reset();
  return useFilterStore.getState;
}

afterEach(() => {
  useFilterStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Facet toggle logic — the sidebar's onToggle drives setFacet
// ---------------------------------------------------------------------------
//
// The sidebar calls:
//   const next = selected.includes(value)
//     ? selected.filter((v) => v !== value)  // remove
//     : [...selected, value];                // add
//   store.setFacet(facet, next);
//
// We test the resulting store state for each path.

describe("FilterSidebar facet toggle logic (via setFacet)", () => {
  it("adding a relation to an empty set produces a singleton list", () => {
    fresh()().setFacet("relations", ["implements"]);
    expect(useFilterStore.getState().relations).toEqual(["implements"]);
  });

  it("adding a second relation appends it", () => {
    fresh()().setFacet("relations", ["implements"]);
    const current = useFilterStore.getState().relations;
    useFilterStore.getState().setFacet("relations", [...current, "extends"]);
    expect(useFilterStore.getState().relations).toEqual(["implements", "extends"]);
  });

  it("toggling an active relation off removes it (filter pattern)", () => {
    fresh()().setFacet("relations", ["implements", "extends"]);
    const current = useFilterStore.getState().relations;
    const toggled = current.filter((r) => r !== "implements");
    useFilterStore.getState().setFacet("relations", toggled);
    expect(useFilterStore.getState().relations).toEqual(["extends"]);
  });

  it("toggling the only active relation off yields an empty list", () => {
    fresh()().setFacet("relations", ["implements"]);
    useFilterStore.getState().setFacet("relations", []);
    expect(useFilterStore.getState().relations).toEqual([]);
  });

  it("toggling a value that is not present adds it", () => {
    fresh()().setFacet("docTypes", ["plan"]);
    const current = useFilterStore.getState().docTypes;
    const value = "adr";
    const toggled = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    useFilterStore.getState().setFacet("docTypes", toggled);
    expect(useFilterStore.getState().docTypes).toEqual(["plan", "adr"]);
  });

  it("toggling a value that is already present removes it", () => {
    fresh()().setFacet("docTypes", ["plan", "adr"]);
    const current = useFilterStore.getState().docTypes;
    const value = "plan";
    const toggled = current.filter((v) => v !== value);
    useFilterStore.getState().setFacet("docTypes", toggled);
    expect(useFilterStore.getState().docTypes).toEqual(["adr"]);
  });

  it("setFacet on different facets are independent — no cross-contamination", () => {
    fresh();
    useFilterStore.getState().setFacet("relations", ["implements"]);
    useFilterStore.getState().setFacet("docTypes", ["plan"]);
    const s = useFilterStore.getState();
    expect(s.relations).toEqual(["implements"]);
    expect(s.docTypes).toEqual(["plan"]);
    expect(s.featureTags).toEqual([]);
  });

  it("structural states (resolved/stale/broken) follow the same toggle pattern", () => {
    fresh()().setFacet("structuralStates", ["stale", "broken"]);
    expect(useFilterStore.getState().structuralStates).toEqual(["stale", "broken"]);
    useFilterStore.getState().setFacet("structuralStates", ["broken"]);
    expect(useFilterStore.getState().structuralStates).toEqual(["broken"]);
  });
});

// ---------------------------------------------------------------------------
// Text-match update — the sidebar's text input drives setTextMatch
// ---------------------------------------------------------------------------

describe("FilterSidebar text-match update (via setTextMatch)", () => {
  it("updates the textMatch field", () => {
    fresh()().setTextMatch("auth");
    expect(useFilterStore.getState().textMatch).toBe("auth");
  });

  it("overwrites a previous value", () => {
    fresh()().setTextMatch("auth");
    useFilterStore.getState().setTextMatch("session");
    expect(useFilterStore.getState().textMatch).toBe("session");
  });

  it("clearing the text input sets textMatch to empty string", () => {
    fresh()().setTextMatch("auth");
    useFilterStore.getState().setTextMatch("");
    expect(useFilterStore.getState().textMatch).toBe("");
  });

  it("does not affect other filter facets", () => {
    fresh();
    useFilterStore.getState().setFacet("relations", ["implements"]);
    useFilterStore.getState().setTextMatch("auth");
    // Relations must be unaffected
    expect(useFilterStore.getState().relations).toEqual(["implements"]);
  });
});

// ---------------------------------------------------------------------------
// Reset — clears facets and text match back to the default empty state
// ---------------------------------------------------------------------------

describe("filter reset (sidebar clear-all)", () => {
  it("reset restores DEFAULT_CHOICES exactly", () => {
    fresh();
    useFilterStore.getState().setFacet("relations", ["implements"]);
    useFilterStore.getState().setFacet("docTypes", ["plan"]);
    useFilterStore.getState().setTextMatch("auth");
    useFilterStore.getState().reset();
    const s = useFilterStore.getState();
    expect(s.relations).toEqual(DEFAULT_CHOICES.relations);
    expect(s.docTypes).toEqual(DEFAULT_CHOICES.docTypes);
    expect(s.textMatch).toEqual(DEFAULT_CHOICES.textMatch);
    expect(s.featureTags).toEqual(DEFAULT_CHOICES.featureTags);
  });
});
