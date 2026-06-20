// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  canSyncFilterSidebarVisualStateScope,
  closeFilterSidebar,
  clearFilterSidebarTopicSearch,
  deriveFilterSidebarFacetListView,
  deriveFilterSidebarMenuSections,
  deriveFilterSidebarVisualStateKey,
  expandFilterSidebarList,
  FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS,
  FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS,
  FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES,
  FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS,
  filterSidebarDocTypeLabel,
  filterSidebarTopicOptions,
  filterSidebarHealthDot,
  filterSidebarHealthLabel,
  filterSidebarStatusDot,
  normalizeFilterSidebarExpandedLists,
  normalizeFilterSidebarListKey,
  normalizeFilterSidebarFacetLimit,
  normalizeFilterSidebarFacetValues,
  normalizeFilterSidebarOpen,
  normalizeFilterSidebarSectionKey,
  normalizeFilterSidebarSections,
  normalizeFilterSidebarScope,
  normalizeFilterSidebarTopicSearch,
  normalizeFilterSidebarVocabularyPart,
  normalizeFilterSidebarVisualStateKey,
  setFilterSidebarSectionOpen,
  setFilterSidebarOpen,
  setFilterSidebarTopicSearch,
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
    expect(normalizeFilterSidebarSectionKey("topic")).toBe("topic");
    expect(normalizeFilterSidebarSectionKey("unknown")).toBeNull();
    expect(normalizeFilterSidebarListKey("feature-tags")).toBe("feature-tags");
    expect(normalizeFilterSidebarListKey(null)).toBeNull();
    expect(
      normalizeFilterSidebarSections({
        topic: true,
        edited: false,
        rogue: true,
        health: "open",
      }),
    ).toEqual({ topic: true, edited: false });
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
    expect(normalizeFilterSidebarFacetLimit(2.8)).toBe(2);
    expect(normalizeFilterSidebarFacetLimit(0)).toBeUndefined();
    expect(normalizeFilterSidebarFacetLimit("2")).toBeUndefined();

    setFilterSidebarOpen(true);
    setFilterSidebarOpen("false");
    expect(useFilterSidebarStore.getState().open).toBe(true);

    useFilterSidebarStore.getState().syncVisualStateKey("scope-a");
    useFilterSidebarStore.getState().setSectionOpen("topic", true);
    useFilterSidebarStore.getState().expandList("feature-tags");
    useFilterSidebarStore.getState().syncVisualStateKey(null);
    useFilterSidebarStore
      .getState()
      .syncVisualStateKey(
        "x".repeat(FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS + 1),
      );
    expect(useFilterSidebarStore.getState()).toMatchObject({
      visualStateKey: "scope-a",
      sections: { topic: true },
      expandedLists: { "feature-tags": true },
    });

    setFilterSidebarSectionOpen("unknown", true);
    setFilterSidebarSectionOpen("kind", "open");
    expandFilterSidebarList("unknown");
    expect(useFilterSidebarStore.getState()).toMatchObject({
      sections: { topic: true },
      expandedLists: { "feature-tags": true },
    });
  });

  it("repairs malformed visual maps before merging store updates", () => {
    useFilterSidebarStore.setState({
      open: "yes",
      topicSearch: "  design  ",
      sections: {
        topic: true,
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
      sections: { topic: true, kind: false },
      expandedLists: { "doc-types": true, "feature-tags": true },
    });
  });

  it("resets to the fresh-scope closed baseline", () => {
    useFilterSidebarStore.getState().setOpen(true);
    useFilterSidebarStore.getState().setSectionOpen("topic", true);
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
    store.setSectionOpen("topic", true);
    store.expandList("feature-tags");
    store.setTopicSearch("design");
    expect(useFilterSidebarStore.getState().sections.topic).toBe(true);
    expect(useFilterSidebarStore.getState().expandedLists["feature-tags"]).toBe(true);
    expect(useFilterSidebarStore.getState().topicSearch).toBe("design");

    store.syncVisualStateKey("scope-a:new");

    expect(useFilterSidebarStore.getState().visualStateKey).toBe("scope-a:new");
    expect(useFilterSidebarStore.getState().topicSearch).toBe("");
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
    store.setTopicSearch("design");
    store.setSectionOpen("topic", true);
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
      topicSearch: "design",
      sections: { topic: true },
      expandedLists: { "feature-tags": true },
    });
  });

  it("keeps explicit null scope writable for no-scope visual-state sync", () => {
    const store = useFilterSidebarStore.getState();
    store.syncVisualStateKey("scope-a:old");
    store.setTopicSearch("design");
    store.setSectionOpen("topic", true);

    const { result } = renderHook(() =>
      useFilterSidebarVisualState(null, ["adr"], ["core"], ["accepted"], ["dangling"]),
    );

    expect(useFilterSidebarStore.getState()).toMatchObject({
      visualStateKey: result.current,
      topicSearch: "",
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
      deriveFilterSidebarVisualStateKey(
        "scope-a",
        "adr",
        null,
        undefined,
        { health: ["dangling"] },
      ),
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
      `tag:${String(FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES - 1).padStart(
        4,
        "0",
      )}`,
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

  it("normalizes served facet values into filter menu presentation", () => {
    expect(filterSidebarDocTypeLabel("adr")).toBe("Decisions");
    expect(filterSidebarDocTypeLabel("custom")).toBe("Custom");
    expect(filterSidebarStatusDot("accepted")).toBe("complete");
    expect(filterSidebarStatusDot("in-progress")).toBe("active");
    expect(filterSidebarStatusDot("unknown")).toBe("provisional");
    expect(filterSidebarHealthLabel("dangling")).toBe("dangling links");
    expect(filterSidebarHealthLabel("custom")).toBe("custom");
    expect(filterSidebarHealthDot("invalid")).toBe("danger");
    expect(filterSidebarHealthDot("custom")).toBe("stale");
  });

  it("filters topic options from the shared sidebar topic-search projection", () => {
    expect(
      filterSidebarTopicOptions(["delta-sync", "design-system", "timeline"], "DESIGN"),
    ).toEqual(["design-system"]);
    expect(filterSidebarTopicOptions(["delta-sync", "timeline"], "   ")).toEqual([
      "delta-sync",
      "timeline",
    ]);
    expect(
      filterSidebarTopicOptions(
        [" design-system ", "timeline", "design-system", null],
        "design",
      ),
    ).toEqual(["design-system"]);
    expect(filterSidebarTopicOptions("design-system", "design")).toEqual([]);
  });

  it("normalizes topic search before visual state or projection consumption", () => {
    expect(normalizeFilterSidebarTopicSearch(null)).toBe("");
    expect(normalizeFilterSidebarTopicSearch(" design ")).toBe("design");
    expect(
      normalizeFilterSidebarTopicSearch(
        "x".repeat(FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS + 1),
      ),
    ).toHaveLength(FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS);

    setFilterSidebarTopicSearch("  design  ");
    expect(useFilterSidebarStore.getState().topicSearch).toBe("design");

    setFilterSidebarTopicSearch("state".repeat(FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS));

    expect(useFilterSidebarStore.getState().topicSearch).toHaveLength(
      FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS,
    );
  });

  it("derives filter menu sections from dashboard-state and served vocabulary", () => {
    const toggles: Array<[unknown, unknown]> = [];
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
          topicSectionLabel: "Topic",
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
      topicSearch: "design",
      onTopicSearchChange: () => undefined,
      onToggleFacet: (facet, value) => toggles.push([facet, value]),
    });

    expect(sections.map((section) => section.key)).toEqual([
      "kind",
      "topic",
      "status",
      "health",
    ]);
    expect(sections[0]).toMatchObject({
      type: "checkbox",
      key: "kind",
      selected: ["adr"],
      options: [{ value: "adr", label: "Decisions" }],
    });
    expect(sections[1]).toMatchObject({
      type: "checkbox",
      key: "topic",
      selected: ["state"],
      options: [{ value: "design-system", label: "design-system" }],
    });
    expect(sections[2]).toMatchObject({
      key: "status",
      options: [{ value: "accepted", dot: "complete" }],
    });
    expect(sections[3]).toMatchObject({
      key: "health",
      options: [{ value: "dangling", label: "dangling links", dot: "broken" }],
    });

    if (sections[0]?.type === "checkbox") sections[0].onToggle("adr");

    expect(toggles).toEqual([["doc_types", "adr"]]);
  });

  it("normalizes malformed facet rows before menu projection", () => {
    const toggles: Array<[unknown, unknown]> = [];
    const sections = deriveFilterSidebarMenuSections({
      vocabulary: {
        vocabulary: undefined,
        loading: false,
        facetsLoading: false,
        docTypes: [" adr ", "adr", "", null] as unknown as string[],
        featureTags: [" state ", { value: "bad" }, "design"] as unknown as string[],
        statuses: [" accepted ", "accepted"] as unknown as string[],
        health: [" dangling ", 42] as unknown as string[],
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
          topicSectionLabel: "Topic",
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
      topicSearch: "state",
      onTopicSearchChange: () => undefined,
      onToggleFacet: (facet, value) => toggles.push([facet, value]),
    });

    expect(sections[0]).toMatchObject({
      selected: ["adr"],
      options: [{ value: "adr", label: "Decisions" }],
    });
    expect(sections[1]).toMatchObject({
      selected: ["state"],
      options: [{ value: "state", label: "state" }],
    });
    expect(sections[2]).toMatchObject({
      selected: ["accepted"],
      options: [{ value: "accepted", dot: "complete" }],
    });
    expect(sections[3]).toMatchObject({
      selected: ["dangling"],
      options: [{ value: "dangling", label: "dangling links", dot: "broken" }],
    });

    if (sections[0]?.type === "checkbox") {
      sections[0].onToggle(" adr ");
      sections[0].onToggle({ value: "adr" } as unknown as string);
    }
    if (sections[1]?.type === "checkbox") {
      sections[1].search?.onChange(" state ");
    }
    expect(toggles).toEqual([["doc_types", "adr"]]);
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

    setFilterSidebarTopicSearch("state");
    expect(useFilterSidebarStore.getState().topicSearch).toBe("state");

    setFilterSidebarTopicSearch(null);
    expect(useFilterSidebarStore.getState().topicSearch).toBe("");

    clearFilterSidebarTopicSearch();
    expect(useFilterSidebarStore.getState().topicSearch).toBe("");
  });

  it("derives facet list loading, empty, and overflow presentation", () => {
    expect(deriveFilterSidebarFacetListView([], [], 12, false, true)).toEqual({
      shown: [],
      rows: [],
      overflow: 0,
      overflowLabel: null,
      emptyMessage: "loading...",
      ariaBusy: true,
    });

    expect(deriveFilterSidebarFacetListView([], [], 12, false, false)).toEqual({
      shown: [],
      rows: [],
      overflow: 0,
      overflowLabel: null,
      emptyMessage: "none in corpus",
      ariaBusy: undefined,
    });

    expect(
      deriveFilterSidebarFacetListView(["a", "b", "c"], ["b"], 2, false, false),
    ).toEqual({
      shown: ["a", "b"],
      rows: [
        {
          value: "a",
          checked: false,
          inputClassName: "accent-accent",
          labelClassName:
            "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
          valueClassName: "text-ink-muted",
        },
        {
          value: "b",
          checked: true,
          inputClassName: "accent-accent",
          labelClassName:
            "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
          valueClassName: "text-ink",
        },
      ],
      overflow: 1,
      overflowLabel: "+1 more",
      emptyMessage: null,
      ariaBusy: undefined,
    });

    expect(
      deriveFilterSidebarFacetListView(["a", "b", "c"], ["c"], 2, true, false),
    ).toMatchObject({
      shown: ["a", "b", "c"],
      rows: [
        { value: "a", checked: false, valueClassName: "text-ink-muted" },
        { value: "b", checked: false, valueClassName: "text-ink-muted" },
        { value: "c", checked: true, valueClassName: "text-ink" },
      ],
      overflow: 1,
      overflowLabel: null,
    });

    expect(
      deriveFilterSidebarFacetListView(
        [" a ", "b", "a", "", null],
        [" a "],
        2.8,
        "yes",
        "loading",
      ),
    ).toMatchObject({
      shown: ["a", "b"],
      rows: [
        { value: "a", checked: true, valueClassName: "text-ink" },
        { value: "b", checked: false, valueClassName: "text-ink-muted" },
      ],
      overflow: 0,
      overflowLabel: null,
      ariaBusy: undefined,
    });
  });
});
