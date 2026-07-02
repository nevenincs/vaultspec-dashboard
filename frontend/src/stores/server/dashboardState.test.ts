// @vitest-environment happy-dom
//
// Dashboard state centralization W02: tests run against the real engine spawned
// by the live test setup. Reads and writes use the typed EngineClient and the
// TanStack stores hooks, so no in-memory doubles are involved.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { normalizeDashboardDateRange } from "./dashboardDateRange";
import {
  DASHBOARD_BOUND_SHAPES,
  DASHBOARD_PANEL_TABS,
  GRAPH_GRANULARITIES,
  REPRESENTATION_MODES,
  SALIENCE_LENSES,
} from "./engine";
import type { DashboardFilters, DashboardState, EngineNode } from "./engine";
import {
  DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
  DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS,
  DEFAULT_DASHBOARD_PANEL_STATE,
  FRESH_DASHBOARD_GRAPH_GRANULARITY,
  acceptDashboardTimelineModeWrite,
  beginDashboardTimelineModeWrite,
  cloneDashboardFilters,
  dashboardDocumentStateResetPatch,
  dashboardDocumentStateSeed,
  dashboardFiltersWithMinConfidence,
  dashboardFiltersWithFacetCleared,
  dashboardFiltersWithFacetToggled,
  dashboardFiltersWithTier,
  dashboardFeatureDescentPatch,
  filtersPatch,
  dashboardGraphDefaultsPatch,
  dashboardGraphSettingsDefaultsPatch,
  dashboardGraphQueryVariables,
  dashboardLineageFilterArg,
  focusPatch,
  granularityPatch,
  graphBoundsPatch,
  dateRangePatch,
  lensPatch,
  MAX_DASHBOARD_SELECTED_IDS,
  normalizeDashboardFilterTiers,
  normalizeDashboardGraphBounds,
  normalizeDashboardFilterFacet,
  normalizeDashboardFilterFacetValue,
  normalizeDashboardFeatureTag,
  normalizeDashboardGraphGranularity,
  normalizeDashboardGraphSettingsDefaults,
  normalizeDashboardMinConfidence,
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  normalizeDashboardSelectedIds,
  normalizeDashboardConfidenceTier,
  normalizeDashboardTierEnabled,
  normalizeDashboardTierName,
  normalizeDashboardTimelineMode,
  isFreshDashboardGraphDefaultsState,
  mergeDashboardPanelState,
  normalizeDashboardPanelState,
  normalizeDashboardPanelTab,
  normalizeDashboardPanelStateUpdate,
  normalizeDashboardStateWriteScope,
  panelStatePatch,
  patchDashboardState,
  patchDashboardTimelineMode,
  representationModePatch,
  selectionPatch,
  setDashboardFeatureFilter,
  timelineModePatch,
  toggleDashboardFilterFacet,
  updateDashboardStateCache,
  useDashboardStateMutations,
} from "./dashboardState";
import { engineKeys, useDashboardState } from "./queries";
import { SEARCH_QUERY_MAX_CHARS } from "../searchQuery";
import { ENGINE_WAIT } from "../../testing/timing";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function realDocumentNode(scope: string): Promise<EngineNode> {
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live dashboard-state test fixture has no document node");
  }
  return node;
}

let cleanupScope: string | null = null;

afterEach(async () => {
  cleanup();
  if (cleanupScope) {
    await createLiveClient()
      .patchDashboardState(dashboardDocumentStateResetPatch(cleanupScope))
      .catch(() => undefined);
    cleanupScope = null;
  }
});

describe("imperative filter seam (context-menu folder verbs)", () => {
  // The happy path (engine patch + cache update) is the same already-covered
  // `patchDashboardState` + pure facet builders; here we pin the scope guard so an
  // invalid scope never reaches the engine — a no-op resolving to null.
  it("toggleDashboardFilterFacet no-ops to null for an unwritable scope", async () => {
    await expect(toggleDashboardFilterFacet(null, "doc_types", "adr")).resolves.toBe(
      null,
    );
    await expect(toggleDashboardFilterFacet("   ", "doc_types", "adr")).resolves.toBe(
      null,
    );
  });

  it("setDashboardFeatureFilter no-ops to null for an unwritable scope", async () => {
    await expect(setDashboardFeatureFilter(null, "my-feature")).resolves.toBe(null);
    await expect(setDashboardFeatureFilter("   ", "my-feature")).resolves.toBe(null);
  });
});

describe("dashboardLineageFilterArg (timeline lineage filter, unified-filter-plane D3)", () => {
  it("returns undefined when no facet is active so the lineage stays the full set", () => {
    expect(dashboardLineageFilterArg({ filters: {} })).toBeUndefined();
  });

  it("serializes the active facets to the wire JSON the lineage route accepts", () => {
    const arg = dashboardLineageFilterArg({
      filters: {
        doc_types: ["adr"],
        feature_query: { value: "state-*", mode: "glob" },
      },
    });
    expect(arg).toBeTypeOf("string");
    expect(JSON.parse(arg!)).toEqual({
      doc_types: ["adr"],
      feature_query: { value: "state-*", mode: "glob" },
    });
  });

  it("excludes the date range so the timeline stays the sole date-axis owner", () => {
    // The top-level date_range is the timeline's own window, never a lineage facet
    // (filtering-has-one-canonical-surface). cloneDashboardFilters never carries it,
    // so the serialized filter narrows by doc_types only.
    const arg = dashboardLineageFilterArg({
      filters: {
        doc_types: ["plan"],
        date_range: { from: "2026-06-01", to: "2026-06-30" },
      },
    });
    expect(JSON.parse(arg!)).toEqual({ doc_types: ["plan"] });
  });

  it("changes the serialized value when a facet changes so the lineage re-queries once", () => {
    const a = dashboardLineageFilterArg({ filters: { doc_types: ["adr"] } });
    const b = dashboardLineageFilterArg({ filters: { doc_types: ["plan"] } });
    expect(a).not.toEqual(b);
  });
});

describe("dashboard-state engine client (live engine)", () => {
  it("normalizes dashboard-state write scopes before central writes", async () => {
    expect(normalizeDashboardStateWriteScope(" scope-a ")).toBe("scope-a");
    expect(normalizeDashboardStateWriteScope("   ")).toBeNull();
    expect(normalizeDashboardStateWriteScope({ scope: "scope-a" })).toBeNull();

    await expect(
      patchDashboardState({ scope: "scope-a" }, selectionPatch(["doc:cached"])),
    ).resolves.toBeNull();
    await expect(
      patchDashboardTimelineMode({ scope: "scope-a" }, { kind: "time-travel", at: 42 }),
    ).resolves.toBeNull();
  });

  it("lets only the latest timeline-mode write update the dashboard cache", () => {
    const client = testQueryClient();
    const sessionIdentity = "session-a";
    const scope = "timeline-seq-wt";
    const key = engineKeys.dashboardState(scope, sessionIdentity);
    client.setQueryData(key, dashboardDocumentStateSeed(scope));

    const earlier = beginDashboardTimelineModeWrite(scope);
    const later = beginDashboardTimelineModeWrite(scope);

    expect(
      acceptDashboardTimelineModeWrite(
        earlier,
        {
          ...dashboardDocumentStateSeed(scope),
          timeline_mode: { kind: "time-travel", at: 1_000 },
        },
        client,
        sessionIdentity,
      ),
    ).toBe(false);
    expect(client.getQueryData<DashboardState>(key)?.timeline_mode).toEqual({
      kind: "live",
    });

    expect(
      acceptDashboardTimelineModeWrite(
        later,
        {
          ...dashboardDocumentStateSeed(scope),
          timeline_mode: { kind: "time-travel", at: 2_000 },
        },
        client,
        sessionIdentity,
      ),
    ).toBe(true);
    expect(client.getQueryData<DashboardState>(key)?.timeline_mode).toEqual({
      kind: "time-travel",
      at: 2_000,
    });
  });

  it("merges partial panel-state intent without dropping sibling fields", () => {
    expect(
      mergeDashboardPanelState(
        {
          left_collapsed: true,
          right_collapsed: false,
          right_tab: "changes",
        },
        { right_collapsed: true },
      ),
    ).toEqual({
      left_collapsed: true,
      right_collapsed: true,
      right_tab: "changes",
    });
    expect(mergeDashboardPanelState(undefined, { right_tab: "search" })).toEqual({
      ...DEFAULT_DASHBOARD_PANEL_STATE,
      right_tab: "search",
    });
  });

  it("normalizes dashboard panel state and partial panel updates", () => {
    expect(normalizeDashboardPanelState("invalid")).toEqual(
      DEFAULT_DASHBOARD_PANEL_STATE,
    );
    expect(normalizeDashboardPanelTab(" search ")).toBe("search");
    expect(normalizeDashboardPanelTab("   ")).toBeNull();
    expect(
      normalizeDashboardPanelState({
        left_collapsed: "yes" as unknown as boolean,
        right_collapsed: true,
        right_tab: " changes ",
      }),
    ).toEqual({
      left_collapsed: false,
      right_collapsed: true,
      right_tab: "changes",
    });
    expect(
      normalizeDashboardPanelStateUpdate({
        left_collapsed: true,
        right_collapsed: "no" as unknown as boolean,
        right_tab: " search ",
      }),
    ).toEqual({
      left_collapsed: true,
      right_tab: "search",
    });
    expect(normalizeDashboardPanelStateUpdate("invalid")).toEqual({});
    expect(normalizeDashboardPanelStateUpdate(["search"])).toEqual({});
    expect(
      mergeDashboardPanelState(
        {
          left_collapsed: true,
          right_collapsed: true,
          right_tab: "changes",
        },
        {
          right_collapsed: "invalid" as unknown as boolean,
          right_tab: "invalid" as "status",
        },
      ),
    ).toEqual({
      left_collapsed: true,
      right_collapsed: true,
      right_tab: "changes",
    });
  });

  it("keeps fresh graph-default detection in the stores layer", () => {
    expect(FRESH_DASHBOARD_GRAPH_GRANULARITY).toBe("feature");
    expect(DOCUMENT_DASHBOARD_GRAPH_GRANULARITY).toBe("document");
    expect(
      isFreshDashboardGraphDefaultsState({
        ...dashboardDocumentStateSeed("fresh", {
          graph_granularity: FRESH_DASHBOARD_GRAPH_GRANULARITY,
        }),
      }),
    ).toBe(true);
    expect(
      isFreshDashboardGraphDefaultsState(dashboardDocumentStateSeed("reset")),
    ).toBe(false);
    expect(
      isFreshDashboardGraphDefaultsState({
        ...dashboardDocumentStateSeed("filtered", {
          graph_granularity: FRESH_DASHBOARD_GRAPH_GRANULARITY,
          filters: { text: "user-owned" },
        }),
      }),
    ).toBe(false);
  });

  it("normalizes selected ids before dashboard-state writes", () => {
    const overCap = Array.from(
      { length: MAX_DASHBOARD_SELECTED_IDS + 4 },
      (_, index) => `doc:${index}`,
    );
    const selected = normalizeDashboardSelectedIds([
      " doc:a ",
      "",
      "doc:a",
      "doc:b",
      ...overCap,
    ]);

    expect(selected.slice(0, 3)).toEqual(["doc:a", "doc:b", "doc:0"]);
    expect(selected).toHaveLength(MAX_DASHBOARD_SELECTED_IDS);
    expect(selectionPatch([" doc:a ", "", "doc:a"])).toEqual({
      selected_ids: ["doc:a"],
    });
    expect(selectionPatch({ selected_ids: ["doc:a"] })).toEqual({
      selected_ids: [],
    });
  });

  it("normalizes visual dashboard mutation patches from runtime payloads", () => {
    expect(
      filtersPatch({
        doc_types: [" adr ", "", 42],
        text: "  centralize  ",
      }),
    ).toEqual({
      filters: { doc_types: ["adr"], text: "centralize" },
    });
    expect(dateRangePatch({ from: "2026-12-31", to: "2026-01-01" })).toEqual({
      date_range: { from: "2026-01-01", to: "2026-12-31" },
    });
    expect(focusPatch(" doc:a ")).toEqual({ salience_focus: "doc:a" });
    expect(focusPatch({ id: "doc:a" })).toEqual({ salience_focus: null });
    expect(
      panelStatePatch({
        left_collapsed: "yes",
        right_collapsed: true,
        right_tab: "missing",
      }),
    ).toEqual({
      panel_state: {
        left_collapsed: false,
        right_collapsed: true,
        right_tab: "status",
      },
    });
  });

  it("preserves the complete dashboard graph filter contract in graph query variables", () => {
    const state = dashboardDocumentStateSeed("scope-a", {
      filters: {
        tiers: { structural: false },
        min_confidence: { temporal: 0.72 },
        relations: ["references"],
        structural_state: ["broken"],
        kinds: ["document"],
        doc_types: ["adr"],
        feature_tags: ["state"],
        feature_query: { value: "state-*", mode: "glob" },
        statuses: ["draft"],
        plan_tiers: ["wave-1"],
        health: ["orphaned"],
        date_range: { from: "2025-01-01", to: "2025-01-31" },
        text: "centralize",
      },
      date_range: { from: "2026-06-01", to: "2026-06-30" },
      timeline_mode: { kind: "time-travel", at: 126 },
      graph_granularity: "feature",
      salience_lens: "design",
      salience_focus: "doc:adr",
    });

    expect(dashboardGraphQueryVariables(state)).toEqual({
      scope: "scope-a",
      filter: {
        tiers: { structural: false },
        min_confidence: { temporal: 0.72 },
        relations: ["references"],
        structural_state: ["broken"],
        kinds: ["document"],
        doc_types: ["adr"],
        feature_tags: ["state"],
        feature_query: { value: "state-*", mode: "glob" },
        statuses: ["draft"],
        plan_tiers: ["wave-1"],
        health: ["orphaned"],
        date_range: { from: "2026-06-01", to: "2026-06-30" },
        text: "centralize",
      },
      asOf: 126,
      granularity: "feature",
      lens: "design",
      focus: "doc:adr",
    });
  });

  it("forwards node and text facets to the engine filter at BOTH granularities (node-facets-filter-on-the-engine)", () => {
    // The node/edge/text-reducing facets must reach the engine query filter at every
    // granularity — they are never dropped to a client-side narrow. At feature
    // granularity the engine filters member documents BEFORE aggregating them (the
    // client never sees the members); at document granularity it truncates to the node
    // ceiling BEFORE serialization. The query filter is identical regardless of LOD.
    const filters: Partial<DashboardFilters> = {
      doc_types: ["adr"],
      statuses: ["draft"],
      plan_tiers: ["wave-1"],
      text: "centralize",
      feature_tags: ["state"],
      tiers: { structural: false },
    };
    for (const graph_granularity of ["feature", "document"] as const) {
      const state = dashboardDocumentStateSeed("scope-a", {
        filters,
        graph_granularity,
      });
      const filter = dashboardGraphQueryVariables(state).filter;
      expect(filter.doc_types).toEqual(["adr"]);
      expect(filter.statuses).toEqual(["draft"]);
      expect(filter.plan_tiers).toEqual(["wave-1"]);
      expect(filter.text).toBe("centralize");
      expect(filter.feature_tags).toEqual(["state"]);
      expect(filter.tiers).toEqual({ structural: false });
    }
  });

  it("normalizes dashboard graph filters at the canonical state seam", () => {
    const filters = cloneDashboardFilters({
      tiers: {
        declared: true,
        semantic: false,
        rogue: true,
        temporal: "yes",
      },
      min_confidence: {
        temporal: -0.4,
        semantic: 1.7,
        declared: 0.5,
        structural: Number.NaN,
      },
      relations: [" references ", "references", "", 42],
      structural_state: [" broken ", "invalid", "broken", ""],
      feature_query: { value: " state-* ", mode: " glob " },
      text: ` centralize ${"x".repeat(SEARCH_QUERY_MAX_CHARS)} `,
    } as unknown as DashboardFilters);

    expect(filters).toEqual({
      tiers: { declared: true },
      min_confidence: { temporal: 0 },
      relations: ["references"],
      structural_state: ["broken"],
      feature_query: { value: "state-*", mode: "glob" },
      text: `centralize ${"x".repeat(SEARCH_QUERY_MAX_CHARS - "centralize ".length)}`,
    });
    expect(
      cloneDashboardFilters({
        feature_query: { value: "state-*", mode: "contains" },
      } as unknown as DashboardFilters),
    ).toEqual({});
    // `semantic` is not an edge tier (the engine never mints semantic graph
    // edges, ADR D3.5), so it is dropped from the tier filter exactly like an
    // unknown key; `structural` survives as a real edge tier.
    expect(
      normalizeDashboardFilterTiers({
        structural: false,
        semantic: false,
        rogue: true,
      }),
    ).toEqual({
      structural: false,
    });
    expect(
      normalizeDashboardMinConfidence({
        temporal: 0.42,
        semantic: 0.9,
        rogue: 0.9,
      }),
    ).toEqual({ temporal: 0.42 });
    expect(
      dashboardFiltersWithTier({ tiers: { structural: false } }, "rogue", true),
    ).toEqual({ tiers: { structural: false } });
    expect(normalizeDashboardTierName(" structural ")).toBe("structural");
    expect(normalizeDashboardTierName(" semantic ")).toBeNull();
    expect(normalizeDashboardTierName("rogue")).toBeNull();
    expect(normalizeDashboardTierEnabled(false)).toBe(false);
    expect(normalizeDashboardTierEnabled("false")).toBeNull();
    expect(normalizeDashboardConfidenceTier(" temporal ")).toBe("temporal");
    expect(normalizeDashboardConfidenceTier("declared")).toBeNull();
    expect(
      dashboardFiltersWithTier({ tiers: { structural: false } }, " structural ", true),
    ).toEqual({ tiers: { structural: true } });
    // `semantic` is not an edge tier (ADR D3.5), so toggling it is a no-op: the
    // invalid tier name is rejected and the existing edge-tier filter is kept.
    expect(
      dashboardFiltersWithTier({ tiers: { structural: false } }, " semantic ", true),
    ).toEqual({ tiers: { structural: false } });
    expect(
      dashboardFiltersWithTier(
        { tiers: { structural: false } },
        " structural ",
        "true",
      ),
    ).toEqual({ tiers: { structural: false } });
    expect(
      dashboardFiltersWithMinConfidence(
        { min_confidence: { temporal: 0.5 } },
        "temporal",
        Number.NaN,
      ),
    ).toEqual({});
    expect(
      dashboardFiltersWithMinConfidence(
        { min_confidence: { temporal: 0.5 } },
        " temporal ",
        0.75,
      ),
    ).toEqual({ min_confidence: { temporal: 0.75 } });
    expect(
      dashboardFiltersWithMinConfidence(
        { min_confidence: { temporal: 0.5 } },
        "declared",
        0.75,
      ),
    ).toEqual({ min_confidence: { temporal: 0.5 } });
  });

  it("updates only the active dashboard-state session cache entry", () => {
    const qc = testQueryClient();
    const stateA: DashboardState = {
      ...dashboardDocumentStateSeed("wt-1"),
      selected_ids: ["doc:a"],
    };
    const stateB: DashboardState = {
      ...dashboardDocumentStateSeed("wt-1"),
      selected_ids: ["doc:b"],
    };
    const next: DashboardState = {
      ...stateA,
      selected_ids: ["doc:next"],
    };

    qc.setQueryData(engineKeys.dashboardState("wt-1", "session-a"), stateA);
    qc.setQueryData(engineKeys.dashboardState("wt-1", "session-b"), stateB);

    updateDashboardStateCache(next, qc, "session-a");

    expect(
      qc.getQueryData<DashboardState>(engineKeys.dashboardState("wt-1", "session-a"))
        ?.selected_ids,
    ).toEqual(["doc:next"]);
    expect(
      qc.getQueryData<DashboardState>(engineKeys.dashboardState("wt-1", "session-b"))
        ?.selected_ids,
    ).toEqual(["doc:b"]);
  });

  it("normalizes dashboard graph bounds at the patch seam", () => {
    expect(normalizeDashboardGraphBounds({ shape: " rect ", size: 24 })).toEqual({
      shape: "rect",
      size: 24,
    });
    expect(normalizeDashboardGraphBounds({ shape: "circle", size: 1234.6 })).toEqual({
      shape: "circle",
      size: 1235,
    });
    expect(normalizeDashboardGraphBounds({ shape: "free", size: 999 })).toEqual({
      shape: "free",
      size: 0,
    });
    expect(
      normalizeDashboardGraphBounds({
        shape: "hex" as "circle",
        size: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      shape: "free",
      size: 0,
    });
    expect(graphBoundsPatch({ shape: "rect", size: -5 })).toEqual({
      graph_bounds: { shape: "rect", size: 0 },
    });
    expect(normalizeDashboardGraphBounds("rect")).toEqual({ shape: "free", size: 0 });
    expect(graphBoundsPatch({ shape: "circle", size: "large" })).toEqual({
      graph_bounds: { shape: "circle", size: 0 },
    });
  });

  it("normalizes dashboard graph granularity at the patch seam", () => {
    expect(normalizeDashboardGraphGranularity("feature")).toBe("feature");
    expect(normalizeDashboardGraphGranularity("document")).toBe("document");
    expect(normalizeDashboardGraphGranularity(" feature ")).toBe("feature");
    expect(normalizeDashboardGraphGranularity("ad hoc")).toBe(
      DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    );
    expect(granularityPatch(" document ")).toEqual({ graph_granularity: "document" });
    expect(dashboardGraphDefaultsPatch({ value: "feature" })).toEqual({
      graph_granularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    });
    expect(
      normalizeDashboardGraphSettingsDefaults({
        defaultGranularity: " feature ",
        confidenceFloor: 200,
        labelFilter: "  adr  ",
      }),
    ).toEqual({
      defaultGranularity: "feature",
      confidenceFloor: 100,
      labelFilter: "adr",
    });
    expect(
      normalizeDashboardGraphSettingsDefaults({
        defaultGranularity: "radial",
        confidenceFloor: Number.POSITIVE_INFINITY,
        labelFilter: { text: "adr" },
      }),
    ).toEqual({
      defaultGranularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
      confidenceFloor: 0,
      labelFilter: "",
    });
    expect(
      dashboardGraphSettingsDefaultsPatch({
        defaultGranularity: " feature ",
        confidenceFloor: 60,
        labelFilter: "  adr  ",
      }),
    ).toEqual({
      graph_granularity: "feature",
      filters: {
        text: "adr",
        min_confidence: { temporal: 0.6 },
      },
    });
    expect(dashboardGraphSettingsDefaultsPatch({ confidenceFloor: -20 })).toEqual({
      graph_granularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    });
  });

  it("normalizes dashboard date ranges at the patch seam", () => {
    expect(normalizeDashboardDateRange("2026-06-30")).toEqual({});
    expect(normalizeDashboardDateRange(["2026-06-01", "2026-06-30"])).toEqual({});
    expect(
      normalizeDashboardDateRange({
        from: "2026-06-30",
        to: "2026-06-01",
      }),
    ).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(
      normalizeDashboardDateRange({
        from: "2026-06-01T00:00:00Z",
        to: "2026-06-30",
      }),
    ).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(
      dateRangePatch({
        from: "2026-06-30",
        to: "2026-06-01",
      }),
    ).toEqual({
      date_range: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("normalizes dashboard filter facets at the patch seam", () => {
    expect(normalizeDashboardFilterFacet(" feature_tags ")).toBe("feature_tags");
    expect(normalizeDashboardFilterFacet("relations")).toBeNull();
    expect(normalizeDashboardFilterFacetValue(" state ")).toBe("state");
    expect(
      normalizeDashboardFilterFacetValue(
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(normalizeDashboardFilterFacetValue("   ")).toBeNull();
    expect(normalizeDashboardFeatureTag(" architecture ")).toBe("architecture");
    // De-hash: a `#feature-raw` (frontmatter form) and a `feature-raw` (engine-served
    // form) MUST normalize to one identity, or the filter never matches a node's tag.
    expect(normalizeDashboardFeatureTag("#feature-raw")).toBe("feature-raw");
    expect(normalizeDashboardFeatureTag("  #feature-raw  ")).toBe("feature-raw");
    expect(normalizeDashboardFeatureTag("#")).toBeNull();
    expect(
      normalizeDashboardFeatureTag(
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(normalizeDashboardFeatureTag({ tag: "architecture" })).toBeNull();

    expect(
      dashboardFiltersWithFacetToggled(
        { feature_tags: ["state"], doc_types: ["adr"] },
        " feature_tags ",
        " state ",
      ),
    ).toEqual({ doc_types: ["adr"] });
    expect(
      dashboardFiltersWithFacetToggled(
        { doc_types: ["adr"] },
        " feature_tags ",
        " state ",
      ),
    ).toEqual({ doc_types: ["adr"], feature_tags: ["state"] });
    expect(
      dashboardFiltersWithFacetToggled(
        { doc_types: [" adr "] },
        "relations",
        "references",
      ),
    ).toEqual({ doc_types: ["adr"] });
    expect(
      dashboardFiltersWithFacetToggled(
        { doc_types: ["adr"] },
        " feature_tags ",
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).toEqual({ doc_types: ["adr"] });
    expect(
      dashboardFeatureDescentPatch({ filters: { doc_types: ["adr"] } }, " state "),
    ).toEqual({
      filters: { doc_types: ["adr"], feature_tags: ["state"] },
      graph_granularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    });
    expect(
      dashboardFeatureDescentPatch(
        { filters: { doc_types: [" adr "], feature_tags: ["old"] } },
        "   ",
      ),
    ).toEqual({ filters: { doc_types: ["adr"], feature_tags: ["old"] } });
    expect(
      dashboardFeatureDescentPatch(
        { filters: { doc_types: ["adr"], feature_tags: ["old"] } },
        "x".repeat(DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS + 1),
      ),
    ).toEqual({ filters: { doc_types: ["adr"], feature_tags: ["old"] } });

    // Scoped clear (the legend's doc_types Reset): clears ONLY the named facet,
    // leaving every other facet untouched — never the whole-record clobber.
    expect(
      dashboardFiltersWithFacetCleared(
        { doc_types: ["adr", "plan"], statuses: ["accepted"], health: ["dangling"] },
        " doc_types ",
      ),
    ).toEqual({ statuses: ["accepted"], health: ["dangling"] });
    // An unknown facet name is inert (no facet removed).
    expect(
      dashboardFiltersWithFacetCleared({ doc_types: ["adr"] }, "not_a_facet"),
    ).toEqual({ doc_types: ["adr"] });
    // Clearing an already-absent facet is a no-op clone.
    expect(
      dashboardFiltersWithFacetCleared({ statuses: ["accepted"] }, "doc_types"),
    ).toEqual({ statuses: ["accepted"] });
  });

  it("normalizes dashboard layout and lens enum values at the patch seam", () => {
    expect(normalizeDashboardRepresentationMode(" radial ")).toBe("radial");
    expect(normalizeDashboardRepresentationMode("radial")).toBe("radial");
    expect(normalizeDashboardRepresentationMode("unknown")).toBe("connectivity");
    expect(normalizeDashboardSalienceLens(" design ")).toBe("design");
    expect(normalizeDashboardSalienceLens("design")).toBe("design");
    expect(normalizeDashboardSalienceLens("unknown")).toBe("status");
    expect(representationModePatch(" radial ")).toEqual({
      representation_mode: "radial",
    });
    expect(lensPatch(" status ")).toEqual({
      salience_lens: "status",
    });
  });

  it("normalizes dashboard timeline mode at the patch seam", () => {
    expect(normalizeDashboardTimelineMode({ kind: " live ", at: 42 })).toEqual({
      kind: "live",
    });
    expect(normalizeDashboardTimelineMode({ kind: " time-travel ", at: 42.6 })).toEqual(
      {
        kind: "time-travel",
        at: 43,
      },
    );
    expect(
      normalizeDashboardTimelineMode({
        kind: "time-travel",
        at: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ kind: "live" });
    expect(timelineModePatch({ kind: "time-travel", at: 9.4 })).toEqual({
      timeline_mode: { kind: "time-travel", at: 9 },
    });
    expect(timelineModePatch({ kind: "time-travel", at: "now" })).toEqual({
      timeline_mode: { kind: "live" },
    });
    expect(
      dashboardDocumentStateSeed("scope-a", {
        timeline_mode: {
          kind: "time-travel",
          at: Number.NaN,
        } as unknown as DashboardState["timeline_mode"],
      }).timeline_mode,
    ).toEqual({ kind: "live" });
  });

  it("reads and patches the canonical dashboard state through the typed client", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    const client = createLiveClient();
    await client.patchDashboardState(dashboardDocumentStateResetPatch(scope));

    const patched = await client.patchDashboardState({
      scope,
      selected_ids: [node.id],
      hovered_id: node.id,
      filters: { doc_types: [node.doc_type ?? "plan"] },
      date_range: { from: "2026-06-01", to: "2026-06-30" },
      timeline_mode: { kind: "time-travel", at: 42 },
      graph_granularity: "feature",
      salience_lens: "design",
      salience_focus: node.id,
      representation_mode: "radial",
      panel_state: {
        left_collapsed: true,
        right_collapsed: false,
        right_tab: "changes",
      },
      graph_bounds: { shape: "rect", size: 2500 },
    });

    expect(patched.scope).toBe(scope);
    expect(patched.selected_ids).toEqual([node.id]);
    expect(patched.hovered_id).toBe(node.id);
    expect(patched.filters.doc_types).toEqual([node.doc_type ?? "plan"]);
    expect(patched.date_range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(patched.timeline_mode).toEqual({ kind: "time-travel", at: 42 });
    expect(patched.graph_granularity).toBe("feature");
    expect(patched.salience_lens).toBe("design");
    expect(patched.salience_focus).toBe(node.id);
    expect(patched.representation_mode).toBe("radial");
    expect(patched.panel_state.right_tab).toBe("changes");
    expect(patched.graph_bounds).toEqual({ shape: "rect", size: 2500 });
    expect(patched.tiers).toBeTypeOf("object");

    const reread = await client.dashboardState(scope);
    expect(reread.selected_ids).toEqual([node.id]);
    expect(reread.salience_focus).toBe(node.id);
  });

  it("keeps frontend dashboard enum declarations accepted by the live backend", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const client = createLiveClient();
    await client.patchDashboardState(dashboardDocumentStateResetPatch(scope));

    for (const graph_granularity of GRAPH_GRANULARITIES) {
      const patched = await client.patchDashboardState({ scope, graph_granularity });
      expect(patched.graph_granularity).toBe(graph_granularity);
    }

    for (const salience_lens of SALIENCE_LENSES) {
      const patched = await client.patchDashboardState({ scope, salience_lens });
      expect(patched.salience_lens).toBe(salience_lens);
    }

    for (const representation_mode of REPRESENTATION_MODES) {
      const patched = await client.patchDashboardState({ scope, representation_mode });
      expect(patched.representation_mode).toBe(representation_mode);
    }

    for (const right_tab of DASHBOARD_PANEL_TABS) {
      const patched = await client.patchDashboardState({
        scope,
        panel_state: {
          ...DEFAULT_DASHBOARD_PANEL_STATE,
          right_tab,
        },
      });
      expect(patched.panel_state.right_tab).toBe(right_tab);
    }

    for (const shape of DASHBOARD_BOUND_SHAPES) {
      const patched = await client.patchDashboardState({
        scope,
        graph_bounds: { shape, size: shape === "free" ? 0 : 128 },
      });
      expect(patched.graph_bounds.shape).toBe(shape);
    }
  });

  it("reads through the TanStack hook and mutates every shared intent helper", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        mutations: useDashboardStateMutations(scope),
      }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), ENGINE_WAIT);

    await act(async () => {
      await result.current.mutations.setSelection([node.id]);
      await result.current.mutations.setFilters({
        doc_types: [node.doc_type ?? "plan"],
      });
      await result.current.mutations.setDateRange({
        from: "2026-06-01",
        to: "2026-06-30",
      });
      await result.current.mutations.setTimelineMode({ kind: "time-travel", at: 84 });
      await result.current.mutations.setGranularity("feature");
      await result.current.mutations.setLens("design");
      await result.current.mutations.setFocus(node.id);
      await result.current.mutations.setPanelState({
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "search",
      });
      await result.current.mutations.setRepresentationMode("radial");
      await result.current.mutations.setGraphBounds({ shape: "free", size: 100 });
    });

    await waitFor(
      () =>
        expect(result.current.state.data?.graph_bounds).toEqual({
          shape: "free",
          size: 0,
        }),
      ENGINE_WAIT,
    );
    const state = result.current.state.data;
    expect(state?.selected_ids).toEqual([node.id]);
    expect(state?.filters.doc_types).toEqual([node.doc_type ?? "plan"]);
    expect(state?.date_range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(state?.timeline_mode).toEqual({ kind: "time-travel", at: 84 });
    expect(state?.graph_granularity).toBe("feature");
    expect(state?.salience_lens).toBe("design");
    expect(state?.salience_focus).toBe(node.id);
    expect(state?.panel_state).toEqual({
      left_collapsed: true,
      right_collapsed: true,
      right_tab: "search",
    });
    expect(state?.representation_mode).toBe("radial");

    let malformedVisualIntent!: DashboardState;
    await act(async () => {
      await result.current.mutations.setRepresentationMode({ mode: "radial" });
      await result.current.mutations.setGranularity("ad hoc");
      malformedVisualIntent = await result.current.mutations.setGraphBounds({
        shape: "circle",
        size: "large",
      });
    });
    expect(malformedVisualIntent.representation_mode).toBe("connectivity");
    expect(malformedVisualIntent.graph_granularity).toBe(
      DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    );
    expect(malformedVisualIntent.graph_bounds).toEqual({ shape: "circle", size: 0 });

    let malformedTimelineIntent!: DashboardState | null;
    await act(async () => {
      malformedTimelineIntent = await result.current.mutations.setTimelineMode({
        kind: "time-travel",
        at: Number.POSITIVE_INFINITY,
      });
    });
    expect(malformedTimelineIntent?.timeline_mode).toEqual({ kind: "live" });

    let malformedCentralIntent!: DashboardState;
    await act(async () => {
      await result.current.mutations.setSelection([` ${node.id} `, "", node.id, 42]);
      await result.current.mutations.setFilters({
        doc_types: [" adr ", "", 42],
        text: "  central  ",
      });
      await result.current.mutations.setDateRange({
        from: "2026-12-31",
        to: "2026-01-01",
      });
      await result.current.mutations.setLens({ value: "design" });
      await result.current.mutations.setFocus("   ");
      malformedCentralIntent = await result.current.mutations.setPanelState({
        left_collapsed: "yes",
        right_collapsed: true,
        right_tab: "missing",
      });
    });
    expect(malformedCentralIntent.selected_ids).toEqual([node.id]);
    expect(malformedCentralIntent.filters.doc_types).toEqual(["adr"]);
    expect(malformedCentralIntent.filters.text).toBe("central");
    expect(malformedCentralIntent.date_range).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(malformedCentralIntent.salience_lens).toBe("status");
    expect(malformedCentralIntent.salience_focus).toBeNull();
    expect(malformedCentralIntent.panel_state).toEqual({
      left_collapsed: false,
      right_collapsed: true,
      right_tab: "status",
    });
  });

  it("accepts trimmed scopes at the central dashboard mutation seam", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const helperState = await patchDashboardTimelineMode(` ${scope} `, {
      kind: "time-travel",
      at: 128,
    });
    expect(helperState?.timeline_mode).toEqual({ kind: "time-travel", at: 128 });

    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        mutations: useDashboardStateMutations(` ${scope} `),
      }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), ENGINE_WAIT);

    await act(async () => {
      await result.current.mutations.setTimelineMode({ kind: "live" });
    });

    await waitFor(
      () => expect(result.current.state.data?.timeline_mode).toEqual({ kind: "live" }),
      ENGINE_WAIT,
    );
  });

  it("writes compound dashboard intent through named store helpers", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        mutations: useDashboardStateMutations(scope),
      }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), ENGINE_WAIT);

    let compound!: DashboardState;
    await act(async () => {
      compound = await result.current.mutations.setFiltersAndDateRange(
        { doc_types: [node.doc_type ?? "plan"] },
        { from: "2026-02-01", to: "2026-02-28" },
      );
    });
    expect(compound.filters.doc_types).toEqual([node.doc_type ?? "plan"]);
    expect(compound.date_range).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });

    let defaults!: DashboardState;
    await act(async () => {
      defaults = await result.current.mutations.applyGraphDefaults("feature", {
        doc_types: [node.doc_type ?? "plan"],
        text: "default label",
      });
    });
    expect(defaults.graph_granularity).toBe("feature");
    expect(defaults.filters.text).toBe("default label");
    expect(defaults.filters.doc_types).toEqual([node.doc_type ?? "plan"]);

    let textFiltered!: DashboardState;
    await act(async () => {
      textFiltered = await result.current.mutations.setTextFilter("  browser text  ");
    });
    expect(textFiltered.filters.text).toBe("browser text");
    expect(textFiltered.filters.doc_types).toEqual(defaults.filters.doc_types);

    let textCleared!: DashboardState;
    await act(async () => {
      textCleared = await result.current.mutations.setTextFilter("   ");
    });
    expect(textCleared.filters.text).toBeUndefined();
    expect(textCleared.filters.doc_types).toEqual(defaults.filters.doc_types);

    let malformedText!: DashboardState;
    await act(async () => {
      malformedText = await result.current.mutations.setTextFilter({
        value: "ad hoc",
      });
    });
    expect(malformedText.filters.text).toBeUndefined();
    expect(malformedText.filters.doc_types).toEqual(defaults.filters.doc_types);

    let facetAdded!: DashboardState;
    await act(async () => {
      facetAdded = await result.current.mutations.toggleFilterFacet(
        " feature_tags ",
        " state ",
      );
    });
    expect(facetAdded.filters.feature_tags).toEqual(["state"]);
    expect(facetAdded.filters.doc_types).toEqual(defaults.filters.doc_types);

    let facetRemoved!: DashboardState;
    await act(async () => {
      facetRemoved = await result.current.mutations.toggleFilterFacet(
        "feature_tags",
        "state",
      );
    });
    expect(facetRemoved.filters.feature_tags).toBeUndefined();
    expect(facetRemoved.filters.doc_types).toEqual(defaults.filters.doc_types);

    let settingsDefaults!: DashboardState;
    await act(async () => {
      settingsDefaults = await result.current.mutations.applyGraphSettingsDefaults({
        defaultGranularity: "document",
        confidenceFloor: 60,
        labelFilter: "adr",
      });
    });
    expect(settingsDefaults.graph_granularity).toBe("document");
    expect(settingsDefaults.filters.text).toBe("adr");
    expect(settingsDefaults.filters.min_confidence?.temporal).toBeCloseTo(0.6);

    let descended!: DashboardState;
    await act(async () => {
      descended = await result.current.mutations.descendFeature(defaults, "state");
    });
    expect(descended.graph_granularity).toBe("document");
    expect(descended.filters.feature_tags).toEqual(["state"]);
  });

  it("orders partial panel-state updates so rapid shell actions do not clobber siblings", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    await createLiveClient().patchDashboardState(
      dashboardDocumentStateResetPatch(scope),
    );

    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({
        state: useDashboardState(scope),
        mutations: useDashboardStateMutations(scope),
      }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.state.isSuccess).toBe(true), ENGINE_WAIT);

    await act(async () => {
      await Promise.all([
        result.current.mutations.updatePanelState({ left_collapsed: true }),
        result.current.mutations.updatePanelState({ right_tab: "search" }),
      ]);
    });

    await waitFor(
      () =>
        expect(result.current.state.data?.panel_state).toEqual({
          left_collapsed: true,
          right_collapsed: false,
          right_tab: "search",
        }),
      ENGINE_WAIT,
    );
  });

  it("derives graph query variables from the canonical dashboard state", async () => {
    const scope = await liveScope();
    cleanupScope = scope;
    const node = await realDocumentNode(scope);
    const state = await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      filters: {
        doc_types: [node.doc_type ?? "plan"],
        date_range: { from: "2025-01-01", to: "2025-01-31" },
      },
      date_range: { from: "2026-06-01", to: "2026-06-30" },
      timeline_mode: { kind: "time-travel", at: 126 },
      graph_granularity: "feature",
      salience_lens: "design",
      salience_focus: node.id,
    });

    const variables = dashboardGraphQueryVariables(state);
    expect(variables).toMatchObject({
      scope,
      asOf: 126,
      granularity: "feature",
      lens: "design",
      focus: node.id,
    });
    expect(variables.filter.date_range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(variables.filter.doc_types).toEqual([node.doc_type ?? "plan"]);
    expect(state.filters.date_range).toBeUndefined();
  });
});
