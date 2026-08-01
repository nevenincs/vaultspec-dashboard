// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  canSyncFilterSidebarVisualStateScope,
  closeFilterSidebar,
  clearFilterSidebarFeatureSearch,
  deriveFilterSidebarMenuSections,
  deriveFilterSidebarVisualStateKey,
  expandFilterSidebarList,
  filterSidebarCheckedValues,
  nextFilterSidebarFacetValues,
  FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS,
  FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS,
  FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES,
  FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS,
  normalizeFilterSidebarExpandedLists,
  normalizeFilterSidebarListKey,
  normalizeFilterSidebarFacetValues,
  normalizeFilterSidebarOpen,
  normalizeFilterSidebarSectionKey,
  normalizeFilterSidebarSections,
  normalizeFilterSidebarScope,
  normalizeFilterSidebarFeatureSearch,
  normalizeFilterSidebarVocabularyPart,
  normalizeFilterSidebarVisualStateKey,
  setFilterSidebarSectionOpen,
  setFilterSidebarOpen,
  setFilterSidebarFeatureSearch,
  toggleFilterSidebar,
  useFilterSidebarVisualState,
  useFilterSidebarStore,
} from "./filterSidebar";

describe("filter sidebar view store", () => {
  beforeEach(() => useFilterSidebarStore.getState().resetForScope());
  afterEach(() => cleanup());

  it("stores the stage filter panel visibility", () => {
    const store = useFilterSidebarStore.getState();

    store.setOpen(true);
    expect(useFilterSidebarStore.getState().open).toBe(true);

    useFilterSidebarStore.getState().toggle();
    expect(useFilterSidebarStore.getState().open).toBe(false);

    useFilterSidebarStore.getState().toggle();
    useFilterSidebarStore.getState().close();
    expect(useFilterSidebarStore.getState().open).toBe(false);
  });

  it("normalizes visual chrome inputs at the filter-sidebar store boundary", () => {
    expect(normalizeFilterSidebarOpen(true)).toBe(true);
    expect(normalizeFilterSidebarOpen("true")).toBeNull();
    expect(normalizeFilterSidebarVisualStateKey("scope-a")).toBe("scope-a");
    expect(normalizeFilterSidebarVisualStateKey("")).toBeNull();
    expect(
      normalizeFilterSidebarVisualStateKey(
        "x".repeat(FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(normalizeFilterSidebarScope(" scope-a ")).toBe("scope-a");
    expect(normalizeFilterSidebarScope("   ")).toBeNull();
    expect(normalizeFilterSidebarScope({ scope: "scope-a" })).toBeNull();
    expect(canSyncFilterSidebarVisualStateScope(" scope-a ")).toBe(true);
    expect(canSyncFilterSidebarVisualStateScope(null)).toBe(true);
    expect(canSyncFilterSidebarVisualStateScope({ scope: "scope-a" })).toBe(false);
    expect(canSyncFilterSidebarVisualStateScope("   ")).toBe(false);
    expect(normalizeFilterSidebarSectionKey("feature")).toBe("feature");
    expect(normalizeFilterSidebarSectionKey("unknown")).toBeNull();
    expect(normalizeFilterSidebarListKey("feature-tags")).toBe("feature-tags");
    expect(normalizeFilterSidebarListKey(null)).toBeNull();
    expect(
      normalizeFilterSidebarSections({
        feature: true,
        edited: false,
        rogue: true,
        health: "open",
      }),
    ).toEqual({ feature: true, edited: false });
    expect(normalizeFilterSidebarSections(null)).toEqual({});
    expect(
      normalizeFilterSidebarExpandedLists({
        "doc-types": true,
        "feature-tags": false,
        rogue: true,
      }),
    ).toEqual({ "doc-types": true, "feature-tags": false });
    expect(normalizeFilterSidebarExpandedLists(null)).toEqual({});
    expect(
      normalizeFilterSidebarVocabularyPart([
        " plan ",
        "",
        "adr",
        "plan",
        null,
        { value: "feature" },
      ]),
    ).toEqual(["adr", "plan"]);
    expect(
      normalizeFilterSidebarVocabularyPart([
        "adr",
        "x".repeat(FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS + 1),
      ]),
    ).toEqual(["adr"]);
    expect(
      normalizeFilterSidebarVocabularyPart(
        Array.from(
          { length: FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES + 2 },
          (_, index) => `tag:${String(index).padStart(4, "0")}`,
        ),
      ),
    ).toHaveLength(FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES);
    expect(normalizeFilterSidebarVocabularyPart("adr")).toEqual([]);
    expect(
      normalizeFilterSidebarFacetValues([
        " plan ",
        "adr",
        "plan",
        "",
        null,
        "x".repeat(FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS + 1),
      ]),
    ).toEqual(["plan", "adr"]);
    expect(
      normalizeFilterSidebarFacetValues(
        Array.from(
          { length: FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES + 2 },
          (_, index) => `tag:${index}`,
        ),
      ),
    ).toHaveLength(FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES);
    expect(normalizeFilterSidebarFacetValues("adr")).toEqual([]);

    setFilterSidebarOpen(true);
    setFilterSidebarOpen("false");
    expect(useFilterSidebarStore.getState().open).toBe(true);

    useFilterSidebarStore.getState().syncVisualStateKey("scope-a");
    useFilterSidebarStore.getState().setSectionOpen("feature", true);
    useFilterSidebarStore.getState().expandList("feature-tags");
    useFilterSidebarStore.getState().syncVisualStateKey(null);
    useFilterSidebarStore
      .getState()
      .syncVisualStateKey("x".repeat(FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS + 1));
    expect(useFilterSidebarStore.getState()).toMatchObject({
      visualStateKey: "scope-a",
      sections: { feature: true },
      expandedLists: { "feature-tags": true },
    });

    setFilterSidebarSectionOpen("unknown", true);
    setFilterSidebarSectionOpen("kind", "open");
    expandFilterSidebarList("unknown");
    expect(useFilterSidebarStore.getState()).toMatchObject({
      sections: { feature: true },
      expandedLists: { "feature-tags": true },
    });
  });

  it("repairs malformed visual maps before merging store updates", () => {
    useFilterSidebarStore.setState({
      open: "yes",
      featureSearch: "  design  ",
      sections: {
        feature: true,
        rogue: true,
        health: "open",
      },
      expandedLists: {
        "doc-types": true,
        rogue: true,
        "feature-tags": "open",
      },
    } as unknown as Partial<ReturnType<typeof useFilterSidebarStore.getState>>);

    toggleFilterSidebar();
    expect(useFilterSidebarStore.getState().open).toBe(true);

    setFilterSidebarSectionOpen("kind", false);
    expandFilterSidebarList("feature-tags");

    expect(useFilterSidebarStore.getState()).toMatchObject({
      open: true,
      sections: { feature: true, kind: false },
      expandedLists: { "doc-types": true, "feature-tags": true },
    });
  });

  it("resets to the fresh-scope closed baseline", () => {
    useFilterSidebarStore.getState().setOpen(true);
    useFilterSidebarStore.getState().setSectionOpen("feature", true);
    useFilterSidebarStore.getState().expandList("feature-tags");
    useFilterSidebarStore.getState().syncVisualStateKey("scope-a");

    useFilterSidebarStore.getState().resetForScope();

    expect(useFilterSidebarStore.getState().open).toBe(false);
    expect(useFilterSidebarStore.getState().sections).toEqual({});
    expect(useFilterSidebarStore.getState().expandedLists).toEqual({});
    expect(useFilterSidebarStore.getState().visualStateKey).toBeNull();
  });

  it("resets visual disclosure state when the scoped vocabulary identity changes", () => {
    const store = useFilterSidebarStore.getState();

    store.syncVisualStateKey("scope-a:old");
    store.setSectionOpen("feature", true);
    store.expandList("feature-tags");
    store.setFeatureSearch("design");
    expect(useFilterSidebarStore.getState().sections.feature).toBe(true);
    expect(useFilterSidebarStore.getState().expandedLists["feature-tags"]).toBe(true);
    expect(useFilterSidebarStore.getState().featureSearch).toBe("design");

    store.syncVisualStateKey("scope-a:new");

    expect(useFilterSidebarStore.getState().visualStateKey).toBe("scope-a:new");
    expect(useFilterSidebarStore.getState().featureSearch).toBe("");
    expect(useFilterSidebarStore.getState().sections).toEqual({});
    expect(useFilterSidebarStore.getState().expandedLists).toEqual({});
  });

  it("derives the scoped vocabulary identity for visual disclosure resets", () => {
    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        ["adr", "plan"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    ).toBe('["scope-a",["adr","plan"],["core"],["accepted"],["dangling"]]');
  });

  it("normalizes runtime scope before deriving visual vocabulary identity", () => {
    const canonical = deriveFilterSidebarVisualStateKey(
      "scope-a",
      ["adr"],
      ["core"],
      ["accepted"],
      ["dangling"],
    );

    expect(
      deriveFilterSidebarVisualStateKey(
        " scope-a ",
        ["adr"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    ).toBe(canonical);
    expect(
      deriveFilterSidebarVisualStateKey(
        { scope: "scope-a" },
        ["adr"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    ).not.toBe(canonical);
  });

  it("keeps malformed runtime scope inert at the visual-state sync seam", () => {
    const store = useFilterSidebarStore.getState();
    store.syncVisualStateKey("scope-a:old");
    store.setFeatureSearch("design");
    store.setSectionOpen("feature", true);
    store.expandList("feature-tags");

    renderHook(() =>
      useFilterSidebarVisualState(
        { scope: "scope-a" },
        ["adr"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    );

    expect(useFilterSidebarStore.getState()).toMatchObject({
      visualStateKey: "scope-a:old",
      featureSearch: "design",
      sections: { feature: true },
      expandedLists: { "feature-tags": true },
    });
  });

  it("keeps explicit null scope writable for no-scope visual-state sync", () => {
    const store = useFilterSidebarStore.getState();
    store.syncVisualStateKey("scope-a:old");
    store.setFeatureSearch("design");
    store.setSectionOpen("feature", true);

    const { result } = renderHook(() =>
      useFilterSidebarVisualState(null, ["adr"], ["core"], ["accepted"], ["dangling"]),
    );

    expect(useFilterSidebarStore.getState()).toMatchObject({
      visualStateKey: result.current,
      featureSearch: "",
      sections: {},
      expandedLists: {},
    });
  });

  it("keeps visual vocabulary identity stable across order and duplicate noise", () => {
    const canonical = deriveFilterSidebarVisualStateKey(
      "scope-a",
      ["adr", "plan"],
      ["core", "state"],
      ["accepted", "in-progress"],
      ["dangling", "orphaned"],
    );

    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        ["plan", "adr", "adr"],
        ["state", "core", "state"],
        ["in-progress", "accepted", "accepted"],
        ["orphaned", "dangling", "dangling"],
      ),
    ).toBe(canonical);
  });

  it("normalizes malformed visual vocabulary before deriving identity", () => {
    const canonical = deriveFilterSidebarVisualStateKey(
      "scope-a",
      ["adr", "plan"],
      ["core", "state"],
      ["accepted"],
      ["dangling"],
    );

    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        [" plan ", "", null, "adr", "plan"],
        ["state", { tag: "core" }, " core "],
        [" accepted ", undefined],
        ["dangling", 42],
      ),
    ).toBe(canonical);
    expect(
      deriveFilterSidebarVisualStateKey("scope-a", "adr", null, undefined, {
        health: ["dangling"],
      }),
    ).toBe('["scope-a",[],[],[],[]]');
  });

  it("bounds visual vocabulary identity parts before serialization", () => {
    const overlong = "x".repeat(FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS + 1);
    const key = deriveFilterSidebarVisualStateKey(
      "scope-a",
      [],
      [
        overlong,
        ...Array.from(
          { length: FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES + 3 },
          (_, index) => `tag:${String(index).padStart(4, "0")}`,
        ),
      ],
      [],
      [],
    );
    const [, , featureTags] = JSON.parse(key) as [
      string,
      string[],
      string[],
      string[],
      string[],
    ];

    expect(featureTags).toHaveLength(FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES);
    expect(featureTags).not.toContain(overlong);
    expect(featureTags.at(-1)).toBe(
      `tag:${String(FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES - 1).padStart(4, "0")}`,
    );
  });

  it("changes visual vocabulary identity when membership or scope changes", () => {
    const canonical = deriveFilterSidebarVisualStateKey(
      "scope-a",
      ["adr", "plan"],
      ["core"],
      ["accepted"],
      ["dangling"],
    );

    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        ["adr", "plan", "research"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    ).not.toBe(canonical);
    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        ["adr", "plan"],
        ["core"],
        ["accepted", "in-progress"],
        ["dangling"],
      ),
    ).not.toBe(canonical);
    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        ["adr", "plan"],
        ["core"],
        ["accepted"],
        ["dangling", "orphaned"],
      ),
    ).not.toBe(canonical);
    expect(
      deriveFilterSidebarVisualStateKey(
        "scope-b",
        ["adr", "plan"],
        ["core"],
        ["accepted"],
        ["dangling"],
      ),
    ).not.toBe(canonical);
  });

  it("normalizes feature search before visual state or projection consumption", () => {
    expect(normalizeFilterSidebarFeatureSearch(null)).toBe("");
    expect(normalizeFilterSidebarFeatureSearch(" design ")).toBe("design");
    expect(
      normalizeFilterSidebarFeatureSearch(
        "x".repeat(FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS + 1),
      ),
    ).toHaveLength(FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS);

    setFilterSidebarFeatureSearch("  design  ");
    expect(useFilterSidebarStore.getState().featureSearch).toBe("design");

    setFilterSidebarFeatureSearch(
      "state".repeat(FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS),
    );

    expect(useFilterSidebarStore.getState().featureSearch).toHaveLength(
      FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS,
    );
  });

  it("derives filter menu sections from dashboard-state and served vocabulary", () => {
    const toggles: Array<[unknown, unknown]> = [];
    const sets: Array<[unknown, unknown]> = [];
    const presets: string[] = [];
    const ranges: Array<[string, string]> = [];
    const sections = deriveFilterSidebarMenuSections({
      vocabulary: {
        vocabulary: undefined,
        loading: false,
        facetsLoading: false,
        docTypes: ["adr"],
        featureTags: ["state", "design-system"],
        statuses: ["accepted"],
        health: ["dangling"],
        dateBounds: undefined,
      },
      filterView: {
        filters: {},
        dateRange: {},
        docTypes: ["adr"],
        featureTags: ["state"],
        statuses: [],
        health: ["dangling"],
        editedWindow: "any",
        editedWindowRows: [
          {
            key: "any",
            label: "Any time",
            active: true,
            inputClassName: "accent-accent",
            labelClassName: "",
            valueClassName: "text-ink",
          },
          {
            key: "7d",
            label: "Last 7 days",
            active: false,
            inputClassName: "accent-accent",
            labelClassName: "",
            valueClassName: "text-ink-muted",
          },
        ],
        dateActive: false,
        anyActive: true,
        presentation: {
          panelAriaLabel: "filter panel",
          panelClassName: "",
          headerClassName: "",
          titleClassName: "",
          headerActionsClassName: "",
          titleLabel: "Filter documents",
          clearAllClassName: "",
          clearAllLabel: "Clear all",
          clearAllAriaLabel: "clear all filters",
          closeButtonClassName: "",
          closeAriaLabel: "close filter panel",
          sectionClassName: "",
          sectionButtonClassName: "",
          sectionMetaClassName: "",
          sectionBadgeClassName: "",
          sectionIconClassName: "",
          sectionBodyClassName: "",
          kindSectionLabel: "Kind",
          featureSectionLabel: "Feature",
          editedSectionLabel: "Edited",
          editedWindowAriaLabel: "edited window",
          facetEmptyClassName: "",
          facetListClassName: "",
          facetOverflowButtonClassName: "",
          footerClassName: "",
          footerTextClassName: "",
          editedWindows: [
            { key: "any", label: "Any time" },
            { key: "7d", label: "Last 7 days" },
          ],
        },
      },
      onToggleFacet: (facet, value) => toggles.push([facet, value]),
      onSetFacetValues: (facet, values) => sets.push([facet, values]),
      date: {
        preset: "any",
        from: "2026-01-01",
        to: "2026-08-01",
        min: "2026-01-01",
        max: "2026-08-01",
        customOpen: false,
        onSelectPreset: (preset) => presets.push(preset),
        onSetRange: (from, to) => ranges.push([from, to]),
      },
    });

    // Category filtering lives on the graph legend, so the advanced flyout hosts the
    // ACTIVE feature narrowing, the doc-type-scoped STATUS groups, HEALTH, and the
    // temporal window bound to the timeline's one canonical date range.
    expect(sections.map((section) => section.key)).toEqual([
      "feature",
      "status",
      "health",
      "edited",
    ]);
    // The FEATURE section lists only what is ACTIVELY narrowing — never the roster
    // ("design-system" is served but not filtered, so it is absent).
    expect(sections[0]).toMatchObject({
      type: "checkbox",
      key: "feature",
      selected: ["state"],
      options: [{ value: "state", label: { kind: "authored", value: "state" } }],
      emptyLabel: { key: "graph:filters.states.noFeatureFilter" },
    });
    // ALL-ON: an unnarrowed facet renders every value TICKED, so "unticked" always
    // means hidden (owner review [msach8nx]).
    expect(sections[1]).toMatchObject({
      type: "checkbox",
      key: "status",
      selected: ["accepted"],
      options: [
        {
          value: "accepted",
          label: {
            kind: "message",
            descriptor: { key: "graph:filters.statuses.accepted" },
          },
          dot: "complete",
        },
      ],
    });
    expect(sections[2]).toMatchObject({
      key: "health",
      options: [
        {
          value: "dangling",
          label: {
            kind: "message",
            descriptor: { key: "graph:filters.health.dangling" },
          },
          dot: "broken",
        },
      ],
    });
    // The temporal section offers the named windows plus the Custom reflection, and
    // hides the two explicit inputs until Custom is the active window.
    expect(sections[3]).toMatchObject({
      type: "date",
      key: "edited",
      value: "any",
      custom: null,
    });
    if (sections[3]?.type === "date") {
      expect(sections[3].options.map((option) => option.value)).toEqual([
        "any",
        "7d",
        "30d",
        "year",
        "custom",
      ]);
      sections[3].onSelect("30d");
    }
    expect(presets).toEqual(["30d"]);

    // Unticking the ONLY ticked feature removes it through the plain toggle seam —
    // the feature section shows what is active, so displayed === selected.
    if (sections[0]?.type === "checkbox") sections[0].onToggle("state");
    expect(toggles).toEqual([["feature_tags", "state"]]);

    // Unticking a value from the all-on STATUS facet commits every REMAINING value
    // in ONE write, never a value-at-a-time walk.
    if (sections[1]?.type === "checkbox") sections[1].onToggle("accepted");
    expect(sets).toEqual([["statuses", []]]);
    expect(ranges).toEqual([]);
  });

  it("keeps the temporal section reflecting a hand-dragged timeline range as Custom", () => {
    const ranges: Array<[string, string]> = [];
    const sections = deriveFilterSidebarMenuSections({
      vocabulary: {
        vocabulary: undefined,
        loading: false,
        facetsLoading: false,
        docTypes: [],
        featureTags: [],
        statuses: [],
        health: [],
        dateBounds: undefined,
      },
      filterView: { filters: {}, dateRange: {}, featureTags: [] },
      onToggleFacet: () => undefined,
      onSetFacetValues: () => undefined,
      date: {
        preset: "custom",
        from: "2026-03-04",
        to: "2026-05-06",
        min: "2026-01-01",
        max: "2026-08-01",
        customOpen: false,
        onSelectPreset: () => undefined,
        onSetRange: (from, to) => ranges.push([from, to]),
      },
    });
    const edited = sections.find((section) => section.key === "edited");
    expect(edited?.type).toBe("date");
    if (edited?.type !== "date" || edited.custom === null) {
      throw new Error("The custom range must be disclosed for a custom window.");
    }
    expect(edited.custom).toMatchObject({
      from: "2026-03-04",
      to: "2026-05-06",
      min: "2026-01-01",
      max: "2026-08-01",
      fromLabel: { key: "graph:filters.edited.from" },
      toLabel: { key: "graph:filters.edited.to" },
    });
    edited.custom.onChange("2026-03-05", "2026-05-06");
    expect(ranges).toEqual([["2026-03-05", "2026-05-06"]]);
  });

  it("omits the temporal section where the corpus serves no date span", () => {
    const sections = deriveFilterSidebarMenuSections({
      vocabulary: {
        vocabulary: undefined,
        loading: false,
        facetsLoading: false,
        docTypes: [],
        featureTags: [],
        statuses: [],
        health: [],
        dateBounds: undefined,
      },
      filterView: { filters: {}, dateRange: {}, featureTags: [] },
      onToggleFacet: () => undefined,
      onSetFacetValues: () => undefined,
    });
    expect(sections.map((section) => section.key)).toEqual(["feature"]);
    // The honest none-state: no feature is narrowing, and the section says so
    // rather than rendering the whole roster.
    expect(sections[0]).toMatchObject({
      selected: [],
      options: [],
      emptyLabel: { key: "graph:filters.states.noFeatureFilter" },
    });
  });

  it("collapses both all-on edges of the checkbox model to the cleared facet", () => {
    const vocabulary = ["accepted", "proposed", "rejected"];
    // Unticking one value from the unnarrowed facet commits the rest.
    expect(nextFilterSidebarFacetValues(vocabulary, [], "rejected")).toEqual([
      "accepted",
      "proposed",
    ]);
    // Re-ticking the last missing value is "not narrowed" again.
    expect(
      nextFilterSidebarFacetValues(vocabulary, ["accepted", "proposed"], "rejected"),
    ).toEqual([]);
    // "Show nothing" has no representation in an inclusion grammar, so unticking the
    // last remaining value re-ticks the set instead of emptying the corpus.
    expect(nextFilterSidebarFacetValues(vocabulary, ["accepted"], "accepted")).toEqual(
      [],
    );
    expect(filterSidebarCheckedValues(vocabulary, [])).toEqual(vocabulary);
    expect(filterSidebarCheckedValues(vocabulary, ["proposed"])).toEqual(["proposed"]);
  });

  it("normalizes malformed facet rows before menu projection", () => {
    const toggles: Array<[unknown, unknown]> = [];
    const sets: Array<[unknown, unknown]> = [];
    const sections = deriveFilterSidebarMenuSections({
      vocabulary: {
        vocabulary: undefined,
        loading: false,
        facetsLoading: false,
        docTypes: [" adr ", "adr", "", null] as unknown as string[],
        featureTags: [" state ", { value: "bad" }, "design"] as unknown as string[],
        statuses: [
          " accepted ",
          "accepted",
          "private_status_token",
        ] as unknown as string[],
        health: [" dangling ", "../../private/path", 42] as unknown as string[],
        dateBounds: undefined,
      },
      filterView: {
        filters: {},
        dateRange: {},
        docTypes: [" adr "] as unknown as string[],
        featureTags: [" state "] as unknown as string[],
        statuses: [" accepted "] as unknown as string[],
        health: [" dangling "] as unknown as string[],
        editedWindow: "any",
        editedWindowRows: [],
        dateActive: false,
        anyActive: true,
        presentation: {
          panelAriaLabel: "filter panel",
          panelClassName: "",
          headerClassName: "",
          titleClassName: "",
          headerActionsClassName: "",
          titleLabel: "Filter documents",
          clearAllClassName: "",
          clearAllLabel: "Clear all",
          clearAllAriaLabel: "clear all filters",
          closeButtonClassName: "",
          closeAriaLabel: "close filter panel",
          sectionClassName: "",
          sectionButtonClassName: "",
          sectionMetaClassName: "",
          sectionBadgeClassName: "",
          sectionIconClassName: "",
          sectionBodyClassName: "",
          kindSectionLabel: "Kind",
          featureSectionLabel: "Feature",
          editedSectionLabel: "Edited",
          editedWindowAriaLabel: "edited window",
          facetEmptyClassName: "",
          facetListClassName: "",
          facetOverflowButtonClassName: "",
          footerClassName: "",
          footerTextClassName: "",
          editedWindows: [],
        },
      },
      onToggleFacet: (facet, value) => toggles.push([facet, value]),
      onSetFacetValues: (facet, values) => sets.push([facet, values]),
    });

    // Advanced flyout sections: the active FEATURE narrowing, then STATUS / HEALTH
    // (category → legend). No temporal section without a served date span.
    expect(sections.map((section) => section.key)).toEqual([
      "feature",
      "status",
      "health",
    ]);
    expect(sections[1]).toMatchObject({
      key: "status",
      selected: ["accepted"],
      options: [
        {
          value: "accepted",
          label: {
            kind: "message",
            descriptor: { key: "graph:filters.statuses.accepted" },
          },
          dot: "complete",
        },
      ],
    });
    expect(sections[2]).toMatchObject({
      key: "health",
      selected: ["dangling"],
      options: [
        {
          value: "dangling",
          label: {
            kind: "message",
            descriptor: { key: "graph:filters.health.dangling" },
          },
          dot: "broken",
        },
      ],
    });

    if (sections[1]?.type === "checkbox") {
      sections[1].onToggle(" accepted ");
      sections[1].onToggle({ value: "accepted" } as unknown as string);
    }
    // A malformed value never reaches the wire; the well-formed one commits the
    // remaining inclusion list (here: none, so the facet clears).
    expect(sets).toEqual([["statuses", []]]);
    expect(toggles).toEqual([]);
  });

  it("exposes named chrome intent helpers for app-layer consumers", () => {
    setFilterSidebarOpen(true);
    expect(useFilterSidebarStore.getState().open).toBe(true);

    toggleFilterSidebar();
    expect(useFilterSidebarStore.getState().open).toBe(false);

    toggleFilterSidebar();
    closeFilterSidebar();
    expect(useFilterSidebarStore.getState().open).toBe(false);

    setFilterSidebarSectionOpen("kind", false);
    expect(useFilterSidebarStore.getState().sections.kind).toBe(false);

    expandFilterSidebarList("feature-tags");
    expect(useFilterSidebarStore.getState().expandedLists["feature-tags"]).toBe(true);

    setFilterSidebarFeatureSearch("state");
    expect(useFilterSidebarStore.getState().featureSearch).toBe("state");

    setFilterSidebarFeatureSearch(null);
    expect(useFilterSidebarStore.getState().featureSearch).toBe("");

    clearFilterSidebarFeatureSearch();
    expect(useFilterSidebarStore.getState().featureSearch).toBe("");
  });
});
