// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { assertBounded, syntheticGraphDeltas } from "../../testing/adverse";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { EngineError, engineClient } from "./engine";
import type {
  ChangedFile,
  DiscoverResponse,
  EngineStatus,
  EngineEdge,
  DashboardState,
  FiltersVocabulary,
  GitFileDiff,
  GraphFilter,
  GraphSlice,
  HistoryResponse,
  LineageSlice,
  NodeDetail,
  PipelineArtifact,
  PlanInterior,
  SettingsSchema,
  SettingsState,
  TiersBlock,
  WorkspacesState,
} from "./engine";
import { adaptLineageSlice, adaptStatus, unwrapEnvelope } from "./liveAdapters";
import type { ContentView, StreamChunk } from "./queries";
import {
  SCOPED_ENGINE_QUERY_SUBTREES,
  GRAPH_GENERATION_QUERY_SUBTREES,
  STREAM_RETENTION,
  deriveChangedFilesView,
  deriveCodeViewerView,
  deriveChangesOverviewView,
  deriveCoreStatusView,
  deriveDashboardDateRangeView,
  deriveDashboardFilterSidebarView,
  deriveDashboardFilterSummaryView,
  deriveDashboardGraphControlsView,
  deriveDashboardGraphDefaultsInitializationView,
  deriveDashboardLayoutSelectorView,
  deriveDashboardLensSelectorView,
  deriveDashboardPlayheadView,
  deriveDashboardRangeSelectView,
  deriveDashboardShellChromeView,
  deriveDashboardStageSceneView,
  deriveDashboardTierDialView,
  deriveDashboardTimelineModeView,
  deriveDiscoverView,
  deriveFileTreeLevelView,
  deriveFileTreeRootSurfaceState,
  deriveFiltersVocabularyView,
  deriveFrontmatterHeaderView,
  deriveGitStatusView,
  deriveGraphSliceAvailability,
  deriveHistoryView,
  deriveInspectorNeighborTierView,
  deriveMarkdownHeaderView,
  deriveMarkdownReaderView,
  deriveNodeDetailView,
  derivePipelineStatusView,
  derivePlanInteriorView,
  deriveSalienceSliceView,
  deriveSettingsDialogView,
  deriveSettingsEffectsView,
  deriveThemeSettingView,
  deriveTimelineLineageView,
  deriveVaultTreeAvailability,
  deriveVaultTreeSurfaceState,
  deriveWorkspaceTitleView,
  deriveWorkspaceMapAvailability,
  deriveWorkspaceMapSurfaceState,
  engineKeys,
  dashboardEditedWindowRange,
  invalidateAfterVaultMutation,
  invalidateGraphGenerationReads,
  invalidateGitRecoveryReads,
  isAddressableNode,
  latestBackendSignalSignature,
  parseSseFrames,
  refreshAfterAcceptedScopeSwitch,
  refreshAfterAcceptedWorkspaceSwitch,
  sseChunks,
  stableKey,
  streamReducer,
  tierAvailabilityReason,
  useGraphSlice,
  useGraphSliceAvailability,
  useGitFileDiff,
  useGitHistoricalFileDiff,
  useLinkResolution,
} from "./queries";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

function seedQuery(client: QueryClient, queryKey: readonly unknown[]): void {
  client.setQueryData(queryKey, { seeded: true });
}

function isInvalidated(client: QueryClient, queryKey: readonly unknown[]): boolean {
  return (
    client.getQueryCache().find({ queryKey, exact: true })?.state.isInvalidated ?? false
  );
}

function hasQuery(client: QueryClient, queryKey: readonly unknown[]): boolean {
  return client.getQueryCache().find({ queryKey, exact: true }) !== undefined;
}

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("isAddressableNode (feature-node 404 guard)", () => {
  it("excludes synthesized feature aggregates and null, includes real graph nodes", () => {
    // The default constellation view selects/hovers/expands FEATURE nodes, whose
    // ids the engine 404s on /nodes/{id}, /evidence, /neighbors (they are not
    // stored graph nodes). The node-detail hooks gate on this so the default view
    // never fires those doomed requests (no 404 storm, no false `degraded`).
    expect(isAddressableNode("feature:dashboard-optimization")).toBe(false);
    expect(isAddressableNode("feature:dashboard-rag-manager")).toBe(false);
    expect(isAddressableNode(null)).toBe(false);
    // Real, resolvable graph nodes stay addressable.
    expect(isAddressableNode("doc:2026-06-16-graph-viz-quality-research")).toBe(true);
    expect(isAddressableNode("doc:anything")).toBe(true);
  });
});

describe("deriveNodeDetailView (node-detail surface state)", () => {
  const detail: NodeDetail = {
    node: { id: "doc:ready", kind: "plan", title: "Ready" },
    tiers: {
      declared: { available: true },
      structural: { available: true },
      temporal: { available: true },
      semantic: { available: true },
    },
  };

  it("returns idle when the node detail read is disabled", () => {
    expect(deriveNodeDetailView(undefined, false, false, false)).toEqual({
      state: "idle",
      detail: null,
      node: null,
    });
  });

  it("returns loading while an enabled read is pending", () => {
    expect(deriveNodeDetailView(undefined, true, false, true)).toEqual({
      state: "loading",
      detail: null,
      node: null,
    });
  });

  it("returns unavailable for transport errors or malformed node payloads", () => {
    expect(deriveNodeDetailView(undefined, false, true, true)).toEqual({
      state: "unavailable",
      detail: null,
      node: null,
    });
    expect(
      deriveNodeDetailView({ tiers: detail.tiers } as NodeDetail, false, false, true),
    ).toEqual({
      state: "unavailable",
      detail: null,
      node: null,
    });
  });

  it("returns ready with the resolved node detail", () => {
    expect(deriveNodeDetailView(detail, false, false, true)).toEqual({
      state: "ready",
      detail,
      node: detail.node,
    });
  });
});

describe("deriveInspectorNeighborTierView (right-rail inspector edges)", () => {
  const edge = (
    id: string,
    tier: EngineEdge["tier"],
    meta?: EngineEdge["meta"],
  ): EngineEdge => ({
    id,
    src: "doc:a",
    dst: `doc:${id}`,
    relation: "relates",
    tier,
    confidence: 0.8,
    ...(meta ? { meta } : {}),
  });

  it("groups neighbor edges by canonical tier order and excludes meta-edges", () => {
    const view = deriveInspectorNeighborTierView([
      edge("semantic-1", "semantic"),
      edge("declared-1", "declared"),
      edge("structural-meta", "structural", {
        count: 2,
        breakdown_by_tier: { structural: 2 },
      }),
      edge("temporal-1", "temporal"),
    ]);

    expect(view.tierKeys).toEqual(["declared", "temporal", "semantic"]);
    expect([...view.tiers.keys()]).toEqual(view.tierKeys);
    expect(view.tiers.get("declared")?.map((item) => item.id)).toEqual(["declared-1"]);
    expect(view.tiers.get("semantic")?.map((item) => item.id)).toEqual(["semantic-1"]);
    expect(view.tiers.has("structural")).toBe(false);
  });

  it("returns an empty stable surface when no neighbor slice has served", () => {
    const view = deriveInspectorNeighborTierView(undefined);

    expect(view.tierKeys).toEqual([]);
    expect([...view.tiers.entries()]).toEqual([]);
  });
});

describe("stableKey", () => {
  it("is order-insensitive for object keys and drops undefined", () => {
    expect(stableKey({ b: 1, a: 2 })).toBe(stableKey({ a: 2, b: 1 }));
    expect(stableKey({ a: 1, gone: undefined })).toBe(stableKey({ a: 1 }));
    expect(stableKey(undefined)).toBe("");
  });
});

describe("deriveWorkspaceTitleView (left-rail project title)", () => {
  const registry: WorkspacesState = {
    active_workspace: "workspace:b",
    workspaces: [
      {
        id: "workspace:a",
        label: "Alpha",
        path: "/repo/a",
        is_launch: true,
        reachable: true,
        unreachable_reason: null,
      },
      {
        id: "workspace:b",
        label: "Beta",
        path: "/repo/b",
        is_launch: false,
        reachable: true,
        unreachable_reason: null,
      },
    ],
    tiers: {
      structural: { available: true },
    },
  };

  it("returns the active workspace title when the registry is loaded", () => {
    expect(deriveWorkspaceTitleView(registry, false)).toMatchObject({
      state: "ready",
      label: "Beta",
      path: "/repo/b",
      current: registry.workspaces[1],
    });
  });

  it("falls back to the first root when the active workspace is absent", () => {
    expect(
      deriveWorkspaceTitleView({ ...registry, active_workspace: "missing" }, false),
    ).toMatchObject({
      state: "ready",
      label: "Alpha",
      path: "/repo/a",
      current: registry.workspaces[0],
    });
  });

  it("returns the neutral project label while loading or empty", () => {
    expect(deriveWorkspaceTitleView(undefined, true)).toEqual({
      state: "loading",
      label: "Project",
      path: undefined,
      current: null,
    });
    expect(deriveWorkspaceTitleView({ ...registry, workspaces: [] }, false)).toEqual({
      state: "ready",
      label: "Project",
      path: undefined,
      current: null,
    });
  });
});

describe("deriveFiltersVocabularyView (filter UI vocabulary)", () => {
  const vocabulary: FiltersVocabulary = {
    relations: ["links"],
    tiers: ["declared"],
    doc_types: ["adr", "plan"],
    feature_tags: ["state", "search"],
    kinds: ["document"],
    date_bounds: { from: "2026-06-01", to: "2026-06-30" },
  };

  it("prepares facet lists and corpus bounds from the loaded vocabulary", () => {
    expect(deriveFiltersVocabularyView(vocabulary, false, false)).toEqual({
      vocabulary,
      loading: false,
      facetsLoading: false,
      docTypes: ["adr", "plan"],
      featureTags: ["state", "search"],
      dateBounds: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("keeps empty lists while the enabled query is loading", () => {
    expect(deriveFiltersVocabularyView(undefined, true, false)).toEqual({
      vocabulary: undefined,
      loading: true,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
      dateBounds: undefined,
    });
  });

  it("lets facet controls treat missing scope as loading rather than empty corpus", () => {
    expect(deriveFiltersVocabularyView(undefined, false, true)).toMatchObject({
      loading: false,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
    });
  });
});

describe("deriveDashboardDateRangeView (dashboard date display)", () => {
  const fallback = {
    fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
    toMs: Date.parse("2026-06-30T00:00:00.000Z"),
  };

  it("uses the canonical dashboard date range when both ends are present", () => {
    expect(
      deriveDashboardDateRangeView({ from: "2026-06-10", to: "2026-06-18" }, fallback),
    ).toEqual({
      fromMs: Date.parse("2026-06-10"),
      toMs: Date.parse("2026-06-18"),
      source: "dashboard",
    });
  });

  it("falls back to the visible window when dashboard date intent is incomplete", () => {
    expect(deriveDashboardDateRangeView({ from: "2026-06-10" }, fallback)).toEqual({
      ...fallback,
      source: "fallback",
    });
    expect(deriveDashboardDateRangeView(undefined, fallback)).toEqual({
      ...fallback,
      source: "fallback",
    });
  });
});

describe("deriveDashboardFilterSummaryView (stage filter toolbar)", () => {
  it("counts active dashboard filter intent for the toolbar badge", () => {
    expect(
      deriveDashboardFilterSummaryView({
        filters: {
          doc_types: ["adr", "plan"],
          feature_tags: ["state"],
          relations: ["references"],
          structural_state: ["broken"],
          text: "centralize",
        },
        date_range: {},
      }),
    ).toEqual({
      activeFilterCount: 6,
      dateRangeLabel: null,
    });
  });

  it("formats the timeline date chip without adding it to the facet badge count", () => {
    expect(
      deriveDashboardFilterSummaryView({
        filters: {},
        date_range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-18" },
      }),
    ).toEqual({
      activeFilterCount: 0,
      dateRangeLabel: "2026-06-01 → 2026-06-18",
    });
  });

  it("keeps the empty summary stable before dashboard state loads", () => {
    expect(deriveDashboardFilterSummaryView(undefined)).toEqual({
      activeFilterCount: 0,
      dateRangeLabel: null,
    });
  });
});

describe("deriveDashboardFilterSidebarView (stage filter sidebar)", () => {
  const now = Date.parse("2026-06-18T12:00:00.000Z");

  it("projects canonical dashboard filters into selected facets and active badges", () => {
    const view = deriveDashboardFilterSidebarView(
      {
        filters: {
          doc_types: ["adr"],
          feature_tags: ["state", "filters"],
          text: "centralize",
        },
        date_range: dashboardEditedWindowRange("7d", now),
      },
      now,
    );

    expect(view.docTypes).toEqual(["adr"]);
    expect(view.featureTags).toEqual(["state", "filters"]);
    expect(view.editedWindow).toBe("7d");
    expect(view.dateActive).toBe(true);
    expect(view.anyActive).toBe(true);
  });

  it("treats top-level dashboard date range as active filter intent", () => {
    expect(deriveDashboardFilterSidebarView(undefined, now)).toMatchObject({
      docTypes: [],
      featureTags: [],
      editedWindow: "any",
      dateActive: false,
      anyActive: false,
    });
    expect(
      deriveDashboardFilterSidebarView(
        { filters: {}, date_range: { from: "2026-06-01", to: "2026-06-30" } },
        now,
      ),
    ).toMatchObject({
      editedWindow: "any",
      dateActive: true,
      anyActive: true,
    });
  });
});

describe("deriveDashboardTierDialView (stage tier dial)", () => {
  it("projects canonical tier filters, confidence floors, time-travel, and semantic degradation", () => {
    const availability = deriveGraphSliceAvailability(
      {
        declared: { available: true },
        structural: { available: true },
        temporal: { available: true },
        semantic: { available: false, reason: "rag offline" },
      },
      false,
    );

    const view = deriveDashboardTierDialView(
      {
        filters: {
          tiers: { declared: true, structural: false, semantic: true },
          min_confidence: { semantic: 0.65 },
        },
        timeline_mode: { kind: "time-travel", at: 42 },
      },
      availability,
    );

    expect(view.tiers).toEqual({
      declared: true,
      structural: false,
      temporal: true,
      semantic: true,
    });
    expect(view.minConfidence).toEqual({ semantic: 0.65 });
    expect(view.timeline.timeTravel).toBe(true);
    expect(view.semanticDegraded).toBe(true);
    expect(view.availability.reasons.semantic).toBe("rag offline");
  });

  it("falls back to all tiers on before dashboard state loads", () => {
    const view = deriveDashboardTierDialView(
      undefined,
      deriveGraphSliceAvailability(undefined, true),
    );

    expect(view.tiers).toEqual({
      declared: true,
      structural: true,
      temporal: true,
      semantic: true,
    });
    expect(view.minConfidence).toEqual({});
    expect(view.timeline.timeTravel).toBe(false);
    expect(view.availability.loading).toBe(true);
  });
});

describe("deriveDashboardTimelineModeView (timeline-mode consumers)", () => {
  it("treats missing and live timeline mode as live operation state", () => {
    expect(deriveDashboardTimelineModeView(undefined)).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
    expect(deriveDashboardTimelineModeView({ kind: "live" })).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
  });

  it("derives historical asOf and operation disablement from one mode reading", () => {
    expect(deriveDashboardTimelineModeView({ kind: "time-travel", at: 42 })).toEqual({
      mode: { kind: "time-travel", at: 42 },
      timeTravel: true,
      opsDisabled: true,
      asOf: 42,
    });
  });
});

describe("deriveCodeViewerView (viewer code chrome)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: "src/auth/mod.rs",
    blobHash: "abc",
    languageHint: "rust",
    text: "line one\nline two\n",
    truncated: null,
    available: true,
    ...patch,
  });

  it("projects ready code content into tokenizer text, raw lines, and header fields", () => {
    expect(deriveCodeViewerView(content({}))).toEqual({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      text: "line one\nline two\n",
      rawLines: ["line one", "line two"],
      path: "src/auth/mod.rs",
      languageHint: "rust",
      truncated: null,
    });
  });

  it("projects designed loading, error, degraded, and empty states", () => {
    expect(
      deriveCodeViewerView(content({ loading: true, available: false, text: "" })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading file...",
      stateTone: "faint",
      text: "",
      rawLines: [],
    });
    expect(
      deriveCodeViewerView(content({ errored: true, available: false, text: "" })),
    ).toMatchObject({
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone: "broken",
    });
    expect(
      deriveCodeViewerView(
        content({
          degraded: true,
          reasons: { structural: "worktree not listable" },
          available: false,
          text: "",
        }),
      ),
    ).toMatchObject({
      state: "degraded",
      stateMessage: "File unavailable: worktree not listable.",
      stateTone: "muted",
    });
    expect(deriveCodeViewerView(content({ available: false, text: "" }))).toMatchObject(
      {
        state: "empty",
        stateMessage: "This file is empty.",
        stateTone: "faint",
      },
    );
  });

  it("carries the honest truncation block only with ready content", () => {
    const truncated = {
      total_bytes: 2_000_000,
      returned_bytes: 1_048_576,
      reason: "content byte ceiling",
    };

    expect(deriveCodeViewerView(content({ truncated })).truncated).toEqual(truncated);
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncated,
    ).toBeNull();
  });
});

describe("deriveMarkdownHeaderView (viewer document chrome)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/plan/2026-06-18-centralize-state-plan.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: "---\ndate: 2026-06-17\nmodified: 2026-06-18\n---\n# Title\n",
    truncated: null,
    available: true,
    ...patch,
  });

  it("projects header title, path trail, doc type chip, and metadata from content", () => {
    expect(
      deriveMarkdownHeaderView("doc:2026-06-18-centralize-state-plan", content({})),
    ).toEqual({
      title: "centralize state plan",
      trail: [{ label: ".vault" }, { label: "plan" }],
      category: "plan",
      categoryLabel: "plan",
      meta: [
        { label: "created", value: "2026-06-17" },
        { label: "modified", value: "2026-06-18" },
      ],
    });
  });

  it("falls back to the canonical stem suffix when the served path is absent", () => {
    expect(
      deriveMarkdownHeaderView(
        "doc:2026-06-18-boundary-audit",
        content({ path: undefined, text: "" }),
      ),
    ).toEqual({
      title: "boundary audit",
      category: "audit",
      categoryLabel: "audit",
      meta: undefined,
      trail: undefined,
    });
  });
});

describe("deriveMarkdownReaderView (viewer markdown body)", () => {
  const content = (patch: Partial<ContentView>): ContentView => ({
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/adr/2026-06-18-reader-adr.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: "",
    truncated: null,
    available: true,
    ...patch,
  });

  it("splits structured frontmatter from the rendered markdown body", () => {
    const view = deriveMarkdownReaderView(
      content({
        text: [
          "---",
          "tags:",
          "  - '#adr'",
          "date: '2026-06-17'",
          "status: accepted",
          "related:",
          "  - '[[2026-06-18-reader-plan]]'",
          "---",
          "",
          "# Body heading",
        ].join("\n"),
      }),
    );

    expect(view).toMatchObject({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      truncated: null,
    });
    expect(view.frontmatter).toEqual({
      tags: [{ label: "#adr", category: "adr" }],
      dates: [{ label: "created", value: "2026-06-17" }],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
    expect(view.body).toBe("\n# Body heading");
    expect(view.status).toBe("accepted");
  });

  it("leaves general markdown untouched when no frontmatter fence is present", () => {
    expect(deriveMarkdownReaderView(content({ text: "# Plain markdown" }))).toEqual({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      frontmatter: null,
      status: null,
      body: "# Plain markdown",
      truncated: null,
    });
  });

  it("projects loading, error, degraded, empty, and truncated states", () => {
    expect(
      deriveMarkdownReaderView(content({ loading: true, available: false })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading document…",
      stateTone: "faint",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(
        content({ errored: true, available: false, text: "ignored" }),
      ),
    ).toMatchObject({
      state: "errored",
      stateMessage: "The document could not be loaded.",
      stateTone: "broken",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(
        content({
          degraded: true,
          available: false,
          reasons: { structural: "worktree not listable" },
          text: "ignored",
        }),
      ),
    ).toMatchObject({
      state: "degraded",
      stateMessage: "Document unavailable: worktree not listable.",
      stateTone: "muted",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(content({ available: false, text: "" })),
    ).toMatchObject({
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone: "faint",
      body: "",
    });

    const truncated = {
      total_bytes: 2_000_000,
      returned_bytes: 1_048_576,
      reason: "content byte ceiling",
    };
    expect(
      deriveMarkdownReaderView(content({ text: "# Body", truncated })).truncated,
    ).toEqual(truncated);
  });
});

describe("deriveFrontmatterHeaderView (reader frontmatter chrome)", () => {
  it("projects tags, dates, and related links into render rows", () => {
    expect(
      deriveFrontmatterHeaderView({
        tags: ["adr", "review-rail"],
        date: "2026-06-17",
        modified: "2026-06-18",
        related: ["2026-06-18-reader-plan"],
      }),
    ).toEqual({
      tags: [{ label: "#adr", category: "adr" }, { label: "#review-rail" }],
      dates: [
        { label: "created", value: "2026-06-17" },
        { label: "modified", value: "2026-06-18" },
      ],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
  });

  it("collapses absent or empty frontmatter to no header chrome", () => {
    expect(deriveFrontmatterHeaderView(null)).toBeNull();
    expect(deriveFrontmatterHeaderView({ tags: [], related: [] })).toBeNull();
  });
});

describe("deriveDashboardGraphControlsView (stage graph controls)", () => {
  it("projects graph bounds and live Network freeze availability from dashboard-state", () => {
    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "rect", size: 1800 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
      }),
    ).toEqual({
      graphBounds: { shape: "rect", size: 1800 },
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
      representationMode: "connectivity",
      freezeAvailable: true,
    });
  });

  it("falls back to free bounds and disables freeze outside live Network", () => {
    expect(deriveDashboardGraphControlsView(undefined)).toMatchObject({
      graphBounds: { shape: "free", size: 0 },
      representationMode: "connectivity",
      freezeAvailable: true,
    });

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "circle", size: 1200 },
        representation_mode: "lineage",
        timeline_mode: { kind: "live" },
      }).freezeAvailable,
    ).toBe(false);

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "circle", size: 1200 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "time-travel", at: 42 },
      }).freezeAvailable,
    ).toBe(false);
  });
});

describe("deriveDashboardStageSceneView (Stage scene owner)", () => {
  const state: DashboardState = {
    scope: "scope-a",
    selected_ids: ["node:a", "node:b"],
    hovered_id: null,
    filters: { doc_types: ["adr"], tiers: { semantic: false } },
    date_range: { from: "2026-06-01", to: "2026-06-18" },
    timeline_mode: { kind: "time-travel", at: 42 },
    graph_granularity: "document",
    salience_lens: "design",
    salience_focus: "node:a",
    representation_mode: "lineage",
    panel_state: {
      left_collapsed: false,
      right_collapsed: false,
      right_tab: "status",
    },
    graph_bounds: { shape: "rect", size: 1200 },
    tiers: {},
  };

  it("projects the scene read model from the canonical dashboard state", () => {
    expect(deriveDashboardStageSceneView(state)).toEqual({
      selectedIds: ["node:a", "node:b"],
      selectedNodeId: "node:a",
      graphQuery: {
        scope: "scope-a",
        filter: {
          doc_types: ["adr"],
          tiers: { semantic: false },
          date_range: { from: "2026-06-01", to: "2026-06-18" },
        },
        asOf: 42,
        granularity: "document",
        lens: "design",
        focus: "node:a",
      },
      granularity: "document",
      activeRepresentationMode: "lineage",
      graphBounds: { shape: "rect", size: 1200 },
      timeline: {
        mode: { kind: "time-travel", at: 42 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 42,
      },
      liveTimeline: false,
    });
  });

  it("falls back without issuing a graph query before dashboard state loads", () => {
    expect(deriveDashboardStageSceneView(undefined)).toEqual({
      selectedIds: [],
      selectedNodeId: null,
      graphQuery: null,
      granularity: "feature",
      activeRepresentationMode: "connectivity",
      graphBounds: undefined,
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
      liveTimeline: true,
    });
  });
});

describe("deriveDashboardLayoutSelectorView (stage layout picker)", () => {
  it("projects live representation mode as the active spatial segment", () => {
    expect(
      deriveDashboardLayoutSelectorView({
        date_range: { from: "2026-06-01", to: "2026-06-18" },
        representation_mode: "radial",
        timeline_mode: { kind: "live" },
      }),
    ).toEqual({
      dateRange: { from: "2026-06-01", to: "2026-06-18" },
      representationMode: "radial",
      spatialActive: "radial",
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
    });
  });

  it("lets time-travel own the active segment without losing held layout", () => {
    expect(
      deriveDashboardLayoutSelectorView({
        date_range: {},
        representation_mode: "connectivity",
        timeline_mode: { kind: "time-travel", at: 42 },
      }),
    ).toEqual({
      dateRange: {},
      representationMode: "connectivity",
      spatialActive: null,
      timeline: {
        mode: { kind: "time-travel", at: 42 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 42,
      },
    });
  });

  it("falls back before dashboard state loads", () => {
    expect(deriveDashboardLayoutSelectorView(undefined)).toMatchObject({
      dateRange: {},
      representationMode: "connectivity",
      spatialActive: "connectivity",
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
    });
  });
});

describe("deriveDashboardLensSelectorView (stage lens picker)", () => {
  it("projects the active salience lens with the dashboard default fallback", () => {
    expect(deriveDashboardLensSelectorView({ salience_lens: "design" })).toEqual({
      lens: "design",
    });
    expect(deriveDashboardLensSelectorView(undefined)).toEqual({
      lens: "status",
    });
  });
});

describe("deriveDashboardRangeSelectView (timeline range selector)", () => {
  it("clones the committed dashboard date range for the range band", () => {
    const source = { date_range: { from: "2026-06-01", to: "2026-06-18" } };
    const view = deriveDashboardRangeSelectView(source);

    expect(view).toEqual({
      dateRange: { from: "2026-06-01", to: "2026-06-18" },
    });
    expect(view.dateRange).not.toBe(source.date_range);
  });

  it("falls back to an empty committed range before dashboard state loads", () => {
    expect(deriveDashboardRangeSelectView(undefined)).toEqual({
      dateRange: {},
    });
  });
});

describe("deriveDashboardGraphDefaultsInitializationView (settings effects)", () => {
  it("marks a loaded fresh dashboard-state scope as eligible for graph defaults", () => {
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "feature",
        filters: {},
      }),
    ).toEqual({ loaded: true, fresh: true });
  });

  it("rejects unloaded or user-owned dashboard graph/filter intent", () => {
    expect(deriveDashboardGraphDefaultsInitializationView(undefined)).toEqual({
      loaded: false,
      fresh: false,
    });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "document",
        filters: {},
      }),
    ).toEqual({ loaded: true, fresh: false });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "feature",
        filters: { text: "user-owned" },
      }),
    ).toEqual({ loaded: true, fresh: false });
  });
});

describe("deriveDashboardPlayheadView (timeline playhead)", () => {
  it("projects live and historical dashboard timeline modes to playhead state", () => {
    expect(deriveDashboardPlayheadView({ timeline_mode: { kind: "live" } })).toEqual({
      loaded: true,
      playhead: "live",
    });
    expect(
      deriveDashboardPlayheadView({ timeline_mode: { kind: "time-travel", at: 42 } }),
    ).toEqual({
      loaded: true,
      playhead: 42,
    });
  });

  it("marks an unloaded dashboard read without forcing a local playhead reset", () => {
    expect(deriveDashboardPlayheadView(undefined)).toEqual({
      loaded: false,
      playhead: "live",
    });
  });
});

describe("deriveDashboardShellChromeView (AppShell chrome)", () => {
  it("falls back to expanded panels and live mode before dashboard state loads", () => {
    expect(deriveDashboardShellChromeView(undefined)).toEqual({
      panelState: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
    });
  });

  it("projects panel collapse/tab state and interpreted time-travel mode", () => {
    expect(
      deriveDashboardShellChromeView({
        panel_state: {
          left_collapsed: true,
          right_collapsed: true,
          right_tab: "changes",
        },
        timeline_mode: { kind: "time-travel", at: 123 },
      }),
    ).toEqual({
      panelState: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "changes",
      },
      timeline: {
        mode: { kind: "time-travel", at: 123 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 123,
      },
    });
  });
});

describe("deriveSettingsDialogView (schema-driven settings dialog)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance"],
    settings: [
      {
        key: "theme",
        value_type: { type: "enum", members: ["system", "dark"] },
        default: "system",
        scope_eligible: false,
        control: "segmented",
        label: "Theme",
        description: "Dashboard color mode",
        group: "Appearance",
        order: 1,
      },
    ],
    tiers: { structural: { available: true } },
  };
  const settings: SettingsState = {
    global: { theme: "dark" },
    scoped: {},
    tiers: { structural: { available: true } },
  };

  it("resolves effective schema groups and loading state in the stores layer", () => {
    const view = deriveSettingsDialogView(schema, settings, null, false);

    expect(view.schemaLoading).toBe(false);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ name: "Appearance" });
    expect(view.groups[0]!.settings[0]).toMatchObject({
      value: "dark",
      provenance: "global",
    });
  });

  it("keeps the dialog empty while the schema is not served yet", () => {
    expect(deriveSettingsDialogView(undefined, undefined, null, true)).toEqual({
      schemaLoading: true,
      groups: [],
    });
  });
});

describe("deriveThemeSettingView (platform theme bridge)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance"],
    settings: [
      {
        key: "theme",
        value_type: { type: "enum", members: ["system", "light", "dark"] },
        default: "system",
        scope_eligible: false,
        control: "segmented",
        label: "Theme",
        description: "Dashboard color mode",
        group: "Appearance",
        order: 1,
      },
    ],
    tiers: {},
  };

  it("resolves the authoritative theme and allowed members in the stores layer", () => {
    expect(
      deriveThemeSettingView(schema, {
        global: { theme: "dark" },
        scoped: {},
        tiers: {},
      }),
    ).toEqual({
      serverTheme: "dark",
      themeMembers: ["system", "light", "dark"],
    });
  });
});

describe("deriveSettingsEffectsView (settings side effects)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance", "Graph"],
    settings: [
      {
        key: "reduce_motion",
        value_type: { type: "bool" },
        default: "false",
        scope_eligible: false,
        control: "switch",
        label: "Reduce motion",
        description: "Reduce animated transitions",
        group: "Appearance",
        order: 1,
      },
      {
        key: "default_granularity",
        value_type: { type: "enum", members: ["feature", "document"] },
        default: "document",
        scope_eligible: true,
        control: "segmented",
        label: "Default granularity",
        description: "The graph detail level on load",
        group: "Graph",
        order: 1,
      },
      {
        key: "confidence_floor",
        value_type: { type: "integer", min: 0, max: 100 },
        default: "0",
        scope_eligible: false,
        control: "slider",
        label: "Confidence floor",
        description: "Minimum inferred edge confidence",
        group: "Graph",
        order: 2,
      },
      {
        key: "label_filter",
        value_type: { type: "string", max_len: 120 },
        default: "",
        scope_eligible: false,
        control: "text",
        label: "Label filter",
        description: "Initial graph text filter",
        group: "Graph",
        order: 3,
      },
    ],
    tiers: {},
  };

  it("resolves document effects and graph defaults in the stores layer", () => {
    expect(
      deriveSettingsEffectsView(
        schema,
        {
          global: {
            reduce_motion: "true",
            confidence_floor: "60",
            label_filter: "adr",
          },
          scoped: { "scope-a": { default_granularity: "feature" } },
          tiers: {},
        },
        "scope-a",
      ),
    ).toEqual({
      reduceMotion: true,
      graphDefaults: {
        defaultGranularity: "feature",
        confidenceFloor: 60,
        labelFilter: "adr",
      },
    });
  });
});

describe("deriveVaultTreeAvailability (sidebar degradation, contract §2)", () => {
  const allUp: TiersBlock = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports no degradation when every canonical tier is available", () => {
    const a = deriveVaultTreeAvailability(allUp);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
    expect(a.reasons).toEqual({});
  });

  it("treats a tier marked unavailable as degraded and carries its reason", () => {
    const a = deriveVaultTreeAvailability({
      ...allUp,
      semantic: { available: false, reason: "rag service down" },
    });
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["semantic"]);
    expect(a.reasons.semantic).toBe("rag service down");
  });

  it("treats a tier ABSENT from the block as degraded (absence ≠ availability)", () => {
    // Contract §2: an absent tier is a designed degraded state, never read as
    // available. A reason-less degradation carries no reason string.
    const partial: TiersBlock = {
      declared: { available: true },
      structural: { available: true },
    };
    const a = deriveVaultTreeAvailability(partial);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["temporal", "semantic"]);
    expect(a.reasons).toEqual({});
  });

  it("returns the no-degradation default for a wholly absent block (transport fault)", () => {
    // A missing block is the query's ERROR state (rendered distinctly by the
    // sidebar), not every-tier-degraded — so the degraded banner does not also
    // fire on a bare transport failure.
    const a = deriveVaultTreeAvailability(undefined);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
  });

  it("selects the first available degraded-tier reason in stores", () => {
    expect(
      tierAvailabilityReason({
        degradedTiers: ["temporal", "semantic"],
        reasons: { semantic: "rag offline" },
      }),
    ).toBe("rag offline");
    expect(
      tierAvailabilityReason({
        degradedTiers: ["structural"],
        reasons: {},
      }),
    ).toBe("");
  });
});

describe("left-rail root surface states", () => {
  const noDegradation = { degraded: false, degradedTiers: [], reasons: {} };
  const structuralDown = deriveWorkspaceMapAvailability({
    structural: { available: false, reason: "worktree missing" },
  });

  it("keeps workspace-map loading/error classification in stores", () => {
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: true, isError: false },
        noDegradation,
      ),
    ).toBe("loading");
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: false, isError: true },
        noDegradation,
      ),
    ).toBe("error");
    expect(
      deriveWorkspaceMapSurfaceState(
        { isPending: false, isError: true },
        structuralDown,
      ),
    ).toBe("ready");
  });

  it("keeps vault-tree transport failure distinct from tiered degradation", () => {
    expect(
      deriveVaultTreeSurfaceState({ isPending: true, isError: false }, noDegradation),
    ).toBe("loading");
    expect(
      deriveVaultTreeSurfaceState({ isPending: false, isError: true }, noDegradation),
    ).toBe("error");
    expect(
      deriveVaultTreeSurfaceState({ isPending: false, isError: true }, structuralDown),
    ).toBe("ready");
  });

  it("treats file-tree structural degradation as the terminal code-mode state", () => {
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: true, isError: false },
        noDegradation,
      ),
    ).toBe("loading");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: true },
        noDegradation,
      ),
    ).toBe("error");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: true },
        structuralDown,
      ),
    ).toBe("degraded");
    expect(
      deriveFileTreeRootSurfaceState(
        { isPending: false, isError: false },
        structuralDown,
      ),
    ).toBe("degraded");
  });

  it("projects one file-tree directory level into stable chrome inputs", () => {
    const retry = () => undefined;
    expect(deriveFileTreeLevelView(undefined, true, false, retry)).toEqual({
      state: "loading",
      entries: [],
      truncated: null,
      retry,
    });
    expect(deriveFileTreeLevelView(undefined, false, true, retry)).toEqual({
      state: "error",
      entries: [],
      truncated: null,
      retry,
    });
    expect(
      deriveFileTreeLevelView(
        { path: "", entries: [], truncated: null, tiers: {} },
        false,
        false,
        retry,
      ),
    ).toEqual({
      state: "empty",
      entries: [],
      truncated: null,
      retry,
    });
    const entry = {
      path: "src/main.ts",
      kind: "file" as const,
      has_children: false,
      node_id: "code:src/main.ts",
    };
    const truncated = {
      total_children: 20,
      returned_children: 10,
      reason: "child ceiling",
    };
    expect(
      deriveFileTreeLevelView(
        { path: "src", entries: [entry], truncated, tiers: {} },
        false,
        false,
        retry,
      ),
    ).toEqual({
      state: "ready",
      entries: [entry],
      truncated,
      retry,
    });
  });
});

describe("deriveGraphSliceAvailability (nav-controls descent, contract §2)", () => {
  const allUp: TiersBlock = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports no degradation and carries the loading flag through verbatim", () => {
    const idle = deriveGraphSliceAvailability(allUp, false);
    expect(idle.loading).toBe(false);
    expect(idle.degraded).toBe(false);
    expect(idle.degradedTiers).toEqual([]);
    const busy = deriveGraphSliceAvailability(allUp, true);
    expect(busy.loading).toBe(true);
    expect(busy.degraded).toBe(false);
  });

  it("treats a tier marked unavailable as degraded and carries its reason", () => {
    const a = deriveGraphSliceAvailability(
      { ...allUp, semantic: { available: false, reason: "rag service down" } },
      false,
    );
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["semantic"]);
    expect(a.reasons.semantic).toBe("rag service down");
  });

  it("treats a tier ABSENT from the block as degraded (absence ≠ availability)", () => {
    const partial: TiersBlock = {
      declared: { available: true },
      structural: { available: true },
    };
    const a = deriveGraphSliceAvailability(partial, false);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["temporal", "semantic"]);
    expect(a.reasons).toEqual({});
  });

  it("returns the no-degradation default for a wholly absent block, preserving loading", () => {
    // A missing block is the query's ERROR/idle state, not every-tier-degraded;
    // the loading flag still flows through so the descent can show a busy cue
    // while the first slice is in flight (no served block yet).
    const a = deriveGraphSliceAvailability(undefined, true);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
    expect(a.loading).toBe(true);
  });

  it("does not issue duplicate graph requests when availability reads filter and lens changes", async () => {
    const scope = await liveScope();
    const graphRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/query")) {
        graphRequests.push(input);
      }
      return liveTransport(input, init);
    });

    function useGraphWithAvailability(params: {
      filter?: GraphFilter;
      lens: "status" | "design";
    }) {
      const slice = useGraphSlice(
        scope,
        params.filter,
        undefined,
        "document",
        params.lens,
        null,
      );
      const availability = useGraphSliceAvailability(slice, true);
      return { slice, availability };
    }

    const client = testQueryClient();
    const { result, rerender } = renderHook(useGraphWithAvailability, {
      wrapper: wrapper(client),
      initialProps: { lens: "status" },
    });

    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true));
    expect(result.current.availability.loading).toBe(false);
    expect(graphRequests).toHaveLength(1);

    rerender({ lens: "status", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(2));
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true));

    rerender({ lens: "design", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(3));
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true));
  });
});

describe("useLinkResolution closed-editor boundary", () => {
  it("does not subscribe to the graph when no document is open", async () => {
    const scope = await liveScope();
    const graphRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/query")) graphRequests.push(input);
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result, unmount } = renderHook(() => useLinkResolution(null, scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(graphRequests).toEqual([]);
    unmount();
  });
});

describe("useGitFileDiff git availability boundary", () => {
  const cachedDiff: GitFileDiff = {
    path: "src/app.ts",
    status: "M",
    hunks: [{ header: "@@ -1 +1 @@", lines: [] }],
  };

  it("does not issue a diff read when status carries no git payload", async () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    const diffRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/diff")) diffRequests.push(input);
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () => useGitFileDiff("scope-without-git", "src/app.ts", "M"),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(diffRequests).toEqual([]);
    unmount();
  });

  it("does not expose cached working-tree diff data when git becomes unavailable", () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    client.setQueryData(engineKeys.gitDiff("scope-without-git", "src/app.ts"), {
      ...cachedDiff,
    });

    const { result, unmount } = renderHook(
      () => useGitFileDiff("scope-without-git", "src/app.ts", "M"),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    unmount();
  });

  it("does not issue a historical diff read when status carries no git payload", async () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    const diffRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/histdiff")) diffRequests.push(input);
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () =>
        useGitHistoricalFileDiff(
          "scope-without-git",
          "src/app.ts",
          "HEAD~1",
          "HEAD",
          "M",
        ),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(diffRequests).toEqual([]);
    unmount();
  });

  it("does not expose cached historical diff data when git becomes unavailable", () => {
    const client = testQueryClient();
    const status: EngineStatus = {
      ok: true,
      nodes: 0,
      edges: 0,
      degradations: [],
      tiers: {
        structural: { available: true },
      },
    };
    client.setQueryData(engineKeys.status(), status);
    client.setQueryData(
      engineKeys.gitHistoricalDiff("scope-without-git", "src/app.ts", "HEAD~1", "HEAD"),
      { ...cachedDiff },
    );

    const { result, unmount } = renderHook(
      () =>
        useGitHistoricalFileDiff(
          "scope-without-git",
          "src/app.ts",
          "HEAD~1",
          "HEAD",
          "M",
        ),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      loading: false,
      errored: false,
      diff: undefined,
    });
    unmount();
  });
});

describe("deriveDiscoverView (canvas-controls discover, contract §4)", () => {
  const edge = (id: string): DiscoverResponse["candidates"][number] => ({
    id,
    src: "feature:a",
    dst: "feature:b",
    relation: "related",
    tier: "semantic",
    confidence: 0.8,
  });
  const served = (
    candidates: DiscoverResponse["candidates"],
    semanticUp = true,
  ): DiscoverResponse => ({
    candidates,
    tiers: { semantic: { available: semanticUp } },
  });

  it("is the inert closed state when the panel is not open (disabled query)", () => {
    const v = deriveDiscoverView(undefined, null, false, false);
    expect(v).toEqual({ loading: false, offline: false, candidates: [] });
  });

  it("carries the loading flag while the request is in flight, no candidates yet", () => {
    const v = deriveDiscoverView(undefined, null, true, true);
    expect(v.loading).toBe(true);
    expect(v.offline).toBe(false);
    expect(v.candidates).toEqual([]);
  });

  it("surfaces ranked candidates when rag serves them", () => {
    const v = deriveDiscoverView(served([edge("e1"), edge("e2")]), null, false, true);
    expect(v.offline).toBe(false);
    expect(v.candidates.map((c) => c.id)).toEqual(["e1", "e2"]);
  });

  it("maps a tiers-bearing 502 (rag down) to the designed offline state, not an error", () => {
    const err = new EngineError("/nodes/x/discover", 502, {
      tiers: { semantic: { available: false, reason: "rag service down" } },
    });
    const v = deriveDiscoverView(undefined, err, false, true);
    expect(v.offline).toBe(true);
    expect(v.candidates).toEqual([]);
  });

  it("maps a tiers-less transport fault on the discover route to offline (route fails only when rag is down)", () => {
    const v = deriveDiscoverView(undefined, new Error("network"), false, true);
    expect(v.offline).toBe(true);
  });

  it("treats a SUCCESS envelope marking semantic unavailable as offline", () => {
    const v = deriveDiscoverView(served([], false), null, false, true);
    expect(v.offline).toBe(true);
  });

  it("is empty-not-offline when rag is up and serves zero candidates", () => {
    const v = deriveDiscoverView(served([]), null, false, true);
    expect(v.offline).toBe(false);
    expect(v.candidates).toEqual([]);
  });
});

describe("engineKeys", () => {
  it("keys graph slices by the (scope, filter, as-of, granularity, lens, focus) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { semantic: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { semantic: false } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Defaults (key tail is [..., asOf, granularity, lens, focus]): as-of "live",
    // granularity "document", lens "status", focus "none" (the engine's defaults).
    expect(d[d.length - 4]).toBe("live");
    expect(d[d.length - 3]).toBe("document");
    expect(d[d.length - 2]).toBe("status");
    expect(d[d.length - 1]).toBe("none");
    // Granularity is part of the cache identity: the constellation (feature)
    // and a document slice never collide in cache.
    const feature = engineKeys.graph("wt-1", undefined, undefined, "feature");
    const document = engineKeys.graph("wt-1", undefined, undefined, "document");
    expect(feature).not.toEqual(document);
    expect(feature[feature.length - 3]).toBe("feature");
    // Lens and focus are part of the cache identity (graph-node-salience): two
    // lenses or two focuses never collide in cache.
    const statusLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "status",
    );
    const designLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "design",
    );
    expect(statusLens).not.toEqual(designLens);
    // With focus appended as the key tail, the lens sits at length-2.
    expect(designLens[designLens.length - 2]).toBe("design");
  });

  it("keys graph diffs by scope, window, and filter", () => {
    const all = engineKeys.diff("wt-1", 1_000, 2_000);
    const filtered = engineKeys.diff(
      "wt-1",
      1_000,
      2_000,
      JSON.stringify({ tiers: { semantic: false } }),
    );
    const sameNumericWindow = engineKeys.diff("wt-1", "1000", "2000");
    expect(all).not.toEqual(filtered);
    expect(all).toEqual(sameNumericWindow);
  });

  it("keys search by scope so same text cannot cross worktrees", () => {
    expect(engineKeys.search("wt-1", "alpha", "vault")).not.toEqual(
      engineKeys.search("wt-2", "alpha", "vault"),
    );
    expect(engineKeys.search("wt-1", "alpha", "vault")).not.toEqual(
      engineKeys.search("wt-1", "alpha", "code"),
    );
  });

  it("keys node-family reads by scope and node parameters", () => {
    expect(engineKeys.node("wt-1", "doc:plan")).not.toEqual(
      engineKeys.node("wt-2", "doc:plan"),
    );
    expect(engineKeys.neighbors("wt-1", "doc:plan", 1)).not.toEqual(
      engineKeys.neighbors("wt-1", "doc:plan", 2),
    );
    expect(engineKeys.evidence("wt-1", "doc:plan")).not.toEqual(
      engineKeys.evidence("wt-2", "doc:plan"),
    );
    expect(engineKeys.discover("wt-1", "doc:plan")).not.toEqual(
      engineKeys.discover("wt-2", "doc:plan"),
    );
    expect(engineKeys.planInterior("wt-1", "doc:plan")).not.toEqual(
      engineKeys.planInterior("wt-2", "doc:plan"),
    );
  });

  it("keys historical git diffs by scope, path, and both revisions", () => {
    const base = engineKeys.gitHistoricalDiff(
      "wt-1",
      ".vault/plan.md",
      "HEAD~1",
      "HEAD",
    );

    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-2", ".vault/plan.md", "HEAD~1", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/adr.md", "HEAD~1", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~2", "HEAD"),
    );
    expect(base).not.toEqual(
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "main"),
    );
  });

  it("enrolls every scoped query family in the workspace-swap scoped-cache boundary", () => {
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.discover("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
    ];
    const scopedFamilies = new Set(scopedKeys.map((key) => String(key[1])));
    expect(new Set(SCOPED_ENGINE_QUERY_SUBTREES)).toEqual(scopedFamilies);
  });

  it("enrolls every graph-generation read family in the generation-refresh boundary", () => {
    const graphGenerationKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.discover("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.history("wt-1", 20),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
    ];
    const graphGenerationFamilies = new Set(
      graphGenerationKeys.map((key) => String(key[1])),
    );

    expect(new Set(GRAPH_GENERATION_QUERY_SUBTREES)).toEqual(graphGenerationFamilies);
  });

  it("refreshes every scoped read family after an accepted active-scope switch", () => {
    const client = testQueryClient();
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.discover("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
    ];
    const globalKeys = [engineKeys.map(), engineKeys.status()];
    const sessionKeys = [engineKeys.session(), engineKeys.workspaces()];

    for (const key of [...scopedKeys, ...globalKeys, ...sessionKeys]) {
      seedQuery(client, key);
    }

    refreshAfterAcceptedScopeSwitch(client);

    for (const key of [...scopedKeys, ...globalKeys]) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of sessionKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("removes stale scoped reads after an accepted workspace switch", () => {
    const client = testQueryClient();
    const scopedKeys = [
      engineKeys.vaultTree("wt-1"),
      engineKeys.fileTree("wt-1", ".vault", undefined),
      engineKeys.filters("wt-1"),
      engineKeys.dashboardState("wt-1", "session-a"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings("wt-1", "status", null),
      engineKeys.node("wt-1", "doc:plan"),
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.neighbors("wt-1", "doc:plan", 1),
      engineKeys.evidence("wt-1", "doc:plan"),
      engineKeys.discover("wt-1", "doc:plan"),
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.stream(["graph"], 42, "wt-1"),
      engineKeys.diff("wt-1", 1_000, 2_000),
      engineKeys.lineage("wt-1", {}),
      engineKeys.pipeline("wt-1"),
      engineKeys.planInterior("wt-1", "doc:plan"),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      ["engine", "ops-rag", "service-state", "wt-1"] as const,
    ];
    const removedGlobalKeys = [engineKeys.map()];
    const refreshedGlobalKeys = [engineKeys.workspaces(), engineKeys.status()];

    for (const key of [...scopedKeys, ...removedGlobalKeys, ...refreshedGlobalKeys]) {
      seedQuery(client, key);
    }

    refreshAfterAcceptedWorkspaceSwitch(client);

    for (const key of [...scopedKeys, ...removedGlobalKeys]) {
      expect(hasQuery(client, key), JSON.stringify(key)).toBe(false);
    }
    for (const key of refreshedGlobalKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
  });

  it("invalidates every central read surface after a vault mutation", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const nodeId = "doc:plan";
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.content(scope, nodeId),
      engineKeys.vaultTree(scope),
      engineKeys.filters(scope),
      engineKeys.dashboardState(scope, "session-a"),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan.md"),
      engineKeys.node(scope, nodeId),
      engineKeys.neighbors(scope, nodeId, 1),
      engineKeys.evidence(scope, nodeId),
      engineKeys.discover(scope, nodeId),
      engineKeys.events(scope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(scope, 1_000, 2_000),
      engineKeys.lineage(scope, {}),
      engineKeys.stream(["backends"], undefined, scope),
      engineKeys.history(scope, 20),
      engineKeys.pipeline(scope),
      engineKeys.planInterior(scope, nodeId),
      engineKeys.search(scope, "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.content(otherScope, nodeId),
      engineKeys.vaultTree(otherScope),
      engineKeys.dashboardState(otherScope, "session-a"),
      engineKeys.graph(otherScope, undefined, undefined, "document", "status", null),
      engineKeys.gitChanges(otherScope),
      engineKeys.events(otherScope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(otherScope, 1_000, 2_000),
      engineKeys.lineage(otherScope, {}),
      engineKeys.stream(["backends"], undefined, otherScope),
      engineKeys.history(otherScope, 20),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, scope, nodeId);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates status, history, and per-file git projections after a git recovery signal", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitChanges("wt-2"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitDiff("wt-2", "src/app.ts"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.gitHistoricalDiff("wt-2", "src/app.ts", "abc", "def"),
      engineKeys.history("wt-1", 20),
      engineKeys.history("wt-2", 50),
    ];
    const unaffectedKeys = [
      engineKeys.map(),
      engineKeys.vaultTree("wt-1"),
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.search("wt-1", "alpha", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateGitRecoveryReads(client);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates graph-generation projections after a graph stream recovery", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const nodeId = "doc:plan";
    const affectedKeys = [
      engineKeys.vaultTree(scope),
      engineKeys.content(scope, nodeId),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.filters(scope),
      engineKeys.dashboardState(scope, "session-a"),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.node(scope, nodeId),
      engineKeys.neighbors(scope, nodeId, 1),
      engineKeys.evidence(scope, nodeId),
      engineKeys.discover(scope, nodeId),
      engineKeys.events(scope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(scope, 1_000, 2_000),
      engineKeys.lineage(scope, {}),
      engineKeys.stream(["graph"], 42, scope),
      engineKeys.history(scope, 20),
      engineKeys.pipeline(scope),
      engineKeys.planInterior(scope, nodeId),
      engineKeys.search(scope, "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan.md"),
      engineKeys.vaultTree(otherScope),
      engineKeys.filters(otherScope),
      engineKeys.dashboardState(otherScope, "session-a"),
      engineKeys.graph(otherScope, undefined, undefined, "document", "status", null),
      engineKeys.graphEmbeddings(otherScope, "status", null),
      engineKeys.stream(["graph"], 42, otherScope),
      engineKeys.search(otherScope, "alpha", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateGraphGenerationReads(client, scope);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });
});

describe("backend-signal status refresh identity", () => {
  it("uses the latest backend/git values rather than accumulator length", () => {
    const saturated = Array.from({ length: STREAM_RETENTION }, (_, i) => ({
      channel: i % 2 === 0 ? "backends" : "git",
      data: i % 2 === 0 ? { rag: "running" } : { dirty: false },
    }));
    const sameLengthDifferentValue = [
      ...saturated.slice(1),
      { channel: "git", data: { dirty: true } },
    ];

    expect(latestBackendSignalSignature(saturated)).not.toEqual(
      latestBackendSignalSignature(sameLengthDifferentValue),
    );
  });
});

describe("the lens-keyed graph query cache", () => {
  it("keys the graph query on the active lens so a lens switch is a re-query", () => {
    const statusKey = engineKeys.graph("s", undefined, undefined, "document", "status");
    const designKey = engineKeys.graph("s", undefined, undefined, "document", "design");
    expect(statusKey).not.toEqual(designKey);
    expect(statusKey).toContain("status");
    expect(designKey).toContain("design");
  });

  it("keys the graph query on the focus node so a focus change is a re-query", () => {
    const noFocus = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    const focused = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      "doc:x",
    );
    expect(noFocus).not.toEqual(focused);
    expect(focused).toContain("doc:x");
  });

  it("the omitted lens/focus keys to the status, no-focus default", () => {
    const omitted = engineKeys.graph("s");
    const explicit = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    expect(omitted).toEqual(explicit);
  });
});

describe("the salience slice view (loading + degradation from tiers)", () => {
  const okTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports loading on a focus-change re-query without flagging partial", () => {
    const view = deriveSalienceSliceView("status", undefined, null, true);
    expect(view.loading).toBe(true);
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });

  it("does not expose held salience metadata while a new slice is loading", () => {
    const held = {
      nodes: [],
      edges: [],
      tiers: {
        ...okTiers,
        semantic: { available: false, reason: "stale rag state" },
      },
      lens: "design",
      salience_partial: true,
    } as unknown as GraphSlice;

    const view = deriveSalienceSliceView("status", held, null, true);

    expect(view).toMatchObject({
      lens: "status",
      loading: true,
      partial: false,
      degradedTiers: [],
      reasons: {},
    });
  });

  it("honors the engine's explicit salience_partial flag", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: true,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("status", data, null, false);
    expect(view.partial).toBe(true);
    expect(view.lens).toBe("status");
  });

  it("derives partial from a degraded tier in the served block", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: {
        ...okTiers,
        declared: { available: false, reason: "core graph unavailable" },
      },
      lens: "design",
      salience_partial: false,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("design", data, null, false);
    expect(view.partial).toBe(true);
    expect(view.degradedTiers).toContain("declared");
    expect(view.reasons.declared).toBe("core graph unavailable");
  });

  it("lets FRESH error tiers win over a stale held-success block", () => {
    const held = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: false,
    } as unknown as GraphSlice;
    const error = new EngineError("/graph/query", 502, {
      tiers: {
        ...okTiers,
        semantic: { available: false, reason: "rag down" },
      },
    });
    const view = deriveSalienceSliceView("status", held, error, false);
    expect(view.degradedTiers).toContain("semantic");
    expect(view.reasons.semantic).toBe("rag down");
  });

  it("does NOT flag partial from a bare transport error (no tiers)", () => {
    const view = deriveSalienceSliceView(
      "status",
      undefined,
      new Error("network down"),
      false,
    );
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });
});

describe("parseSseFrames", () => {
  it("parses completed frames and keeps the remainder", () => {
    const { frames, rest } = parseSseFrames(
      'event: graph\ndata: {"seq":1}\n\nevent: git\ndata: {"head":"abc"}\n\nevent: graph\ndata: {"se',
    );
    expect(frames).toEqual([
      { channel: "graph", data: { seq: 1 } },
      { channel: "git", data: { head: "abc" } },
    ]);
    expect(rest).toContain('data: {"se');
  });

  it("passes non-JSON data through as text", () => {
    const { frames } = parseSseFrames("data: plain\n\n");
    expect(frames).toEqual([{ channel: "message", data: "plain" }]);
  });
});

describe("sseChunks stream failure handling", () => {
  it("throws StreamLostError on a non-ok stream response (ADR D2)", async () => {
    const badResponse = new Response("nope", { status: 503 });
    await expect(async () => {
      for await (const _chunk of sseChunks(badResponse)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });

  it("throws StreamLostError when the body read fails mid-stream", async () => {
    const failingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const response = new Response(failingBody, { status: 200 });
    await expect(async () => {
      for await (const _chunk of sseChunks(response)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });
});

describe("streamReducer bounded growth (P-HIGH-6)", () => {
  it("ring-caps the accumulator under a long delta storm and keeps the latest seq", () => {
    // Without the cap this accumulator would hold all 10_000 chunks for the
    // session (HIGH-6). The reducer must retain only the tail window.
    let acc: StreamChunk[] = [];
    for (const delta of syntheticGraphDeltas(10_000)) {
      acc = streamReducer(acc, { channel: "graph", data: delta });
    }
    assertBounded(acc.length, STREAM_RETENTION, "stream accumulator");
    expect(acc.length).toBe(STREAM_RETENTION);
    // The latest seq is always retained, so consumers' maxSeq stays correct.
    const seqs = acc.map((chunk) => (chunk.data as { seq: number }).seq);
    expect(Math.max(...seqs)).toBe(10_000);
  });

  it("still dedups a repeated seq within the window", () => {
    const frame: StreamChunk = { channel: "graph", data: { op: "add", seq: 7 } };
    let acc: StreamChunk[] = [];
    acc = streamReducer(acc, frame);
    acc = streamReducer(acc, frame);
    expect(acc).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deriveGitStatusView — git working-tree interpretation (git-diff-browser ADR).
// git is NOT a tier: availability tracks the PRESENCE of the git payload; `dirty`
// is the live BOOLEAN; ahead/behind are Option (absent = no upstream).
// ---------------------------------------------------------------------------

function statusWith(
  git: EngineStatus["git"],
  tiers: TiersBlock = { structural: { available: true } },
): EngineStatus {
  return { ok: true, nodes: 0, edges: 0, degradations: [], tiers, git };
}

describe("deriveGitStatusView", () => {
  it("reports available with the git payload and the dirty boolean when git is served", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", ahead: 1, dirty: true }),
      undefined,
      false,
    );
    expect(view).toMatchObject({ loading: false, degraded: false, errored: false });
    expect(view.git?.branch).toBe("main");
    expect(view.dirty).toBe(true);
  });

  it("reports a clean tree when the dirty boolean is false", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", dirty: false }),
      undefined,
      false,
    );
    expect(view.dirty).toBe(false);
    expect(view.degraded).toBe(false);
  });

  it("treats a served response with NO git payload as designed degradation, not error", () => {
    const view = deriveGitStatusView(
      statusWith(undefined, { structural: { available: true } }),
      undefined,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-bearing error envelope (backend answered) as degradation", () => {
    const err = new EngineError("/status", 502, {
      tiers: { structural: { available: false } },
    });
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-less transport fault as the errored branch", () => {
    const err = new EngineError("/status", 500);
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.errored).toBe(true);
    expect(view.degraded).toBe(false);
  });

  it("reports loading while the snapshot is in flight with no data or error", () => {
    const view = deriveGitStatusView(undefined, undefined, true);
    expect(view.loading).toBe(true);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
  });
});

describe("deriveChangedFilesView", () => {
  it("splits vault documents from source files and computes the summary once", () => {
    const files: ChangedFile[] = [
      {
        path: "src/app.ts",
        code: " M",
        letter: "M",
        group: "modified",
        vault: false,
        adds: 4,
        dels: 1,
      },
      {
        path: ".vault/plan/2026-06-18-plan.md",
        code: "A ",
        letter: "A",
        group: "added",
        vault: true,
        adds: 8,
        dels: 0,
      },
      {
        path: "assets/logo.png",
        code: " M",
        letter: "M",
        group: "modified",
        vault: false,
        adds: null,
        dels: null,
      },
    ];

    const view = deriveChangedFilesView(files, false, false);

    expect(view.codeFiles.map((file) => file.path)).toEqual([
      "src/app.ts",
      "assets/logo.png",
    ]);
    expect(view.documents.map((file) => file.path)).toEqual([
      ".vault/plan/2026-06-18-plan.md",
    ]);
    expect(view.summary).toEqual({
      files: 2,
      documents: 1,
      additions: 12,
      deletions: 1,
      total: 3,
    });
  });

  it("drops held rows while git is unavailable", () => {
    const view = deriveChangedFilesView(
      [
        {
          path: "src/stale.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
      ],
      true,
      true,
      false,
    );

    expect(view).toMatchObject({
      loading: false,
      errored: false,
      files: [],
      codeFiles: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
    });
  });
});

describe("deriveChangesOverviewView", () => {
  const retry = () => undefined;
  const availableGit = {
    loading: false,
    errored: false,
    degraded: false,
    dirty: true,
    git: { branch: "main", dirty: true },
    retry,
  };

  it("combines git availability and changed-file rows into one render surface", () => {
    const changed = deriveChangedFilesView(
      [
        {
          path: "src/app.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
        {
          path: ".vault/adr/2026-06-18-x.md",
          code: "A ",
          letter: "A",
          group: "added",
          vault: true,
          adds: 2,
          dels: 0,
        },
      ],
      false,
      false,
    );
    const view = deriveChangesOverviewView(availableGit, changed);

    expect(view.hasChanges).toBe(true);
    expect(view.loading).toBe(false);
    expect(view.clean).toBe(false);
    expect(view.files.map((file) => file.path)).toEqual(["src/app.ts"]);
    expect(view.files[0]).toMatchObject({
      path: "src/app.ts",
      basename: "app.ts",
      nodeId: "code:src/app.ts",
      group: "modified",
      adds: 4,
      dels: 1,
    });
    expect(view.documents.map((file) => file.path)).toEqual([
      ".vault/adr/2026-06-18-x.md",
    ]);
    expect(view.documents[0]).toEqual({
      path: ".vault/adr/2026-06-18-x.md",
      title: "X",
      nodeId: "doc:2026-06-18-x",
      category: "adr",
    });
    expect(view.summary.total).toBe(2);
    expect(view.retry).toBe(retry);
  });

  it("prioritizes designed empty/loading/degraded/error states only when no rows exist", () => {
    const empty = deriveChangedFilesView([], false, false);

    expect(
      deriveChangesOverviewView({ ...availableGit, loading: true }, empty),
    ).toMatchObject({ loading: true, clean: false, hasChanges: false });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, degraded: true, dirty: false },
        empty,
      ),
    ).toMatchObject({ degraded: true, clean: false, hasChanges: false });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, errored: true, dirty: false },
        empty,
      ),
    ).toMatchObject({ errored: true, clean: false, hasChanges: false });
  });

  it("does not let stale changed rows mask unavailable git", () => {
    const stale = deriveChangedFilesView(
      [
        {
          path: "src/stale.ts",
          code: " M",
          letter: "M",
          group: "modified",
          vault: false,
          adds: 4,
          dels: 1,
        },
      ],
      false,
      false,
    );

    const view = deriveChangesOverviewView(
      { ...availableGit, git: undefined, degraded: true, dirty: false },
      stale,
    );

    expect(view).toMatchObject({
      degraded: true,
      hasChanges: false,
      files: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// deriveCoreStatusView — vaultspec-core status rollup interpretation.
// App chrome consumes this view rather than interpreting status.core directly.
// ---------------------------------------------------------------------------

describe("deriveCoreStatusView", () => {
  it("reports reachable core with forwarded vault health", () => {
    const view = deriveCoreStatusView(
      {
        ok: true,
        nodes: 0,
        edges: 0,
        degradations: [],
        tiers: {},
        core: { reachable: true, vault_health: "green" },
      },
      undefined,
      false,
    );

    expect(view).toMatchObject({
      loading: false,
      errored: false,
      reachable: true,
      vaultHealth: "green",
    });
  });

  it("reports missing or unreachable core as a designed down state", () => {
    expect(
      deriveCoreStatusView(
        {
          ok: true,
          nodes: 0,
          edges: 0,
          degradations: [],
          tiers: {},
          core: { reachable: false },
        },
        undefined,
        false,
      ),
    ).toMatchObject({ errored: false, reachable: false });

    expect(
      deriveCoreStatusView(
        { ok: true, nodes: 0, edges: 0, degradations: [], tiers: {} },
        undefined,
        false,
      ),
    ).toMatchObject({ errored: false, reachable: false });
  });

  it("keeps tiers-less transport faults distinct from designed down core", () => {
    const view = deriveCoreStatusView(
      undefined,
      new EngineError("/status", 500),
      false,
    );
    expect(view).toMatchObject({
      loading: false,
      errored: true,
      reachable: false,
    });
  });
});

// ---------------------------------------------------------------------------
// deriveHistoryView (Status overview recent-commit degradation, contract §2 /
// status-overview ADR): degradation is read from the served `tiers` block (the
// `structural` tier the commit read resolves through), never guessed from a bare
// transport error — and a FRESH error envelope's tiers win over a stale block.
// ---------------------------------------------------------------------------

function historyWith(
  tiers: TiersBlock | undefined,
  commits: HistoryResponse["commits"] = [],
): HistoryResponse {
  return { commits, truncated: null, next_cursor: null, tiers: tiers ?? {} };
}

describe("deriveHistoryView", () => {
  it("reports available with the commit list when structural is served", () => {
    const now = 1_000_000_000_000;
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "abc123",
          short_hash: "abc123",
          subject: "feat: x",
          body: "",
          ts: now - 5 * 60_000,
          node_ids: ["commit:abc123", "doc:x", "code:src/x.ts"],
        },
      ]),
      undefined,
      false,
      now,
    );
    expect(view).toMatchObject({ loading: false, degraded: false, errored: false });
    expect(view.available).toBe(true);
    expect(view.commits).toHaveLength(1);
    expect(view.recentCommitRows).toEqual([
      {
        commit: view.commits[0],
        eventId: "commit:abc123",
        touchedNodeIds: ["doc:x", "code:src/x.ts"],
        selectable: true,
        ageLabel: "5m",
      },
    ]);
  });

  it("derives recent commit age labels inside the stores row projection", () => {
    const now = 1_000_000_000_000;
    const commits = [
      {
        hash: "just-now",
        short_hash: "just-now",
        subject: "fresh",
        body: "",
        ts: now - 30_000,
        node_ids: ["doc:fresh"],
      },
      {
        hash: "hours",
        short_hash: "hours",
        subject: "hourly",
        body: "",
        ts: now - 3 * 3_600_000,
        node_ids: ["doc:hourly"],
      },
      {
        hash: "days",
        short_hash: "days",
        subject: "daily",
        body: "",
        ts: now - 2 * 86_400_000,
        node_ids: ["doc:daily"],
      },
      {
        hash: "missing-time",
        short_hash: "missing",
        subject: "missing",
        body: "",
        ts: 0,
        node_ids: ["doc:missing"],
      },
    ];

    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      now,
    );

    expect(view.recentCommitRows.map((row) => row.ageLabel)).toEqual([
      "just now",
      "3h",
      "2d",
      "",
    ]);
  });

  it("limits status commit rows and excludes the commit node from selectable targets", () => {
    const commits = Array.from({ length: 14 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: "",
      ts: i,
      node_ids: [`commit:hash-${i}`, `doc:touched-${i}`],
    }));
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
    );

    expect(view.commits).toHaveLength(14);
    expect(view.recentCommitRows).toHaveLength(12);
    expect(view.recentCommitRows.map((row) => row.eventId)).toEqual(
      commits.slice(0, 12).map((commit) => `commit:${commit.hash}`),
    );
    expect(view.recentCommitRows[0].touchedNodeIds).toEqual(["doc:touched-0"]);
  });

  it("does not expose held commits while the history query is loading", () => {
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "abc",
          short_hash: "abc",
          subject: "held",
          body: "",
          ts: 1,
          node_ids: [],
        },
      ]),
      undefined,
      true,
    );

    expect(view.loading).toBe(true);
    expect(view.available).toBe(false);
    expect(view.commits).toEqual([]);
    expect(view.recentCommitRows).toEqual([]);
  });

  it("treats an absent structural tier as designed degradation (absence != available)", () => {
    const view = deriveHistoryView(historyWith({}, []), undefined, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
    expect(view.commits).toHaveLength(0);
    expect(view.recentCommitRows).toHaveLength(0);
  });

  it("surfaces a tiers-bearing error envelope (backend answered) as degradation", () => {
    const err = new EngineError("/history", 400, {
      tiers: { structural: { available: false, reason: "no readable history" } },
    });
    const view = deriveHistoryView(undefined, err, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
    expect(view.reasons.structural).toBe("no readable history");
  });

  it("surfaces a tiers-less transport fault as the errored branch, not degradation", () => {
    const err = new EngineError("/history", 500);
    const view = deriveHistoryView(undefined, err, false);
    expect(view.errored).toBe(true);
    expect(view.degraded).toBe(false);
  });

  it("lets a FRESH error envelope's tiers override a stale held-success block", () => {
    // A held success block reports structural available, but the latest request
    // failed with a structural-down envelope — the fresh error must win.
    const err = new EngineError("/history", 400, {
      tiers: { structural: { available: false } },
    });
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        { hash: "abc", short_hash: "abc", subject: "x", body: "", ts: 1, node_ids: [] },
      ]),
      err,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.commits).toHaveLength(0);
  });

  it("reports loading while in flight with no data or error", () => {
    const view = deriveHistoryView(undefined, undefined, true);
    expect(view.loading).toBe(true);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LIVE-SAMPLE PARITY: a RAW live-shaped /status
// sample (`{git:{head_ref, dirty:bool, ahead:Option, behind:Option}}`) fed
// through `adaptStatus` → `deriveGitStatusView` must yield a correct surface.
// ---------------------------------------------------------------------------

describe("git status live-sample parity through adaptStatus", () => {
  it("derives branch from head_ref, preserves the dirty boolean, and keeps ahead/behind when present", () => {
    // A verbatim live `/status` envelope shape (head_ref, index, backends, and
    // an upstream-configured git block with numeric ahead/behind).
    const liveSample = {
      ok: true,
      index: { nodes: 12, edges: 8 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/feature/x", dirty: true, ahead: 3, behind: 2 },
      backends: { core: { vault_health: "green" }, rag: { available: true } },
    };
    const status = adaptStatus(liveSample);
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
    // head_ref → branch (refs/heads/ stripped).
    expect(view.git?.branch).toBe("feature/x");
    expect(view.dirty).toBe(true);
    expect(view.git?.ahead).toBe(3);
    expect(view.git?.behind).toBe(2);
  });

  it("preserves undefined ahead/behind (no upstream) rather than coercing to zero", () => {
    // Live shape with NO upstream → ahead/behind absent from the git block.
    const liveSample = {
      ok: true,
      index: { nodes: 0, edges: 0 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/main", dirty: false },
      backends: {},
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.ahead).toBeUndefined();
    expect(status.git?.behind).toBeUndefined();
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.git?.ahead).toBeUndefined();
    expect(view.git?.behind).toBeUndefined();
    expect(view.dirty).toBe(false);
  });

  it("collapses a legacy/internal dirty string[] to the boolean truth", () => {
    // Tolerated legacy shape: a dirty list collapses to "is anything dirty".
    const liveSample = {
      ok: true,
      index: {},
      degradations: [],
      tiers: {},
      git: { head_ref: "refs/heads/main", dirty: ["a.ts", "b.ts"] },
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.dirty).toBe(true);
  });
});

describe("derivePipelineStatusView (Work surface degradation, W01.P03.S17)", () => {
  const structuralUp: TiersBlock = { structural: { available: true } };
  const structuralDown: TiersBlock = {
    structural: { available: false, reason: "vault index rebuilding" },
  };
  const artifacts: PipelineArtifact[] = [
    {
      node_id: "doc:2026-06-14-x-plan",
      stem: "2026-06-14-x-plan",
      title: "x plan",
      doc_type: "plan",
      tier: "L3",
      progress: { done: 2, total: 5 },
      phase: "execute",
    },
    {
      node_id: "doc:2026-06-14-x-adr",
      stem: "2026-06-14-x-adr",
      title: "x adr",
      doc_type: "adr",
      status: "proposed",
      phase: "adr",
    },
  ];

  it("is not degraded and carries the artifacts when the structural tier is available", () => {
    const view = derivePipelineStatusView(structuralUp, artifacts, false);
    expect(view.degraded).toBe(false);
    expect(view.degradedTiers).toEqual([]);
    expect(view.artifacts).toHaveLength(2);
    expect(view.plans.map((artifact) => artifact.node_id)).toEqual([
      "doc:2026-06-14-x-plan",
    ]);
    expect(view.adrs.map((artifact) => artifact.node_id)).toEqual([
      "doc:2026-06-14-x-adr",
    ]);
    expect(view.planIds).toEqual(["doc:2026-06-14-x-plan"]);
    expect([...view.occupiedPhases]).toEqual(["execute", "adr"]);
    expect(view.count).toBe(2);
    expect(view.liveMessage).toBe("2 in-flight items");
  });

  it("reports degraded when the structural tier is explicitly unavailable", () => {
    const view = derivePipelineStatusView(structuralDown, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
    expect(view.reasons.structural).toBe("vault index rebuilding");
    // While degraded the projection is not trusted: no stale list is rendered.
    expect(view.artifacts).toEqual([]);
    expect(view.plans).toEqual([]);
    expect(view.adrs).toEqual([]);
    expect(view.planIds).toEqual([]);
    expect(view.count).toBe(0);
    expect(view.liveMessage).toBe("pipeline status unavailable");
  });

  it("reports degraded when the structural tier is ABSENT from the served block (absence != available)", () => {
    const view = derivePipelineStatusView(
      { semantic: { available: true } },
      artifacts,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
  });

  it("does NOT guess degraded from a wholly absent tiers block (transport fault stays a query error)", () => {
    const view = derivePipelineStatusView(undefined, artifacts, false);
    expect(view.degraded).toBe(false);
    // The held artifacts pass through; the surface renders them, not a degraded notice.
    expect(view.artifacts).toHaveLength(2);
  });

  it("the FRESH error envelope tiers win over a stale held-success block (call-site order)", () => {
    // The hook reads `errTiers ?? dataTiers`: a fresh error reporting the tier
    // down outranks a previously held success that reported it up. Exercise the
    // resolved truth the hook passes the selector.
    const heldSuccess = structuralUp;
    const freshError = structuralDown;
    const resolved = freshError ?? heldSuccess;
    const view = derivePipelineStatusView(resolved, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.reasons.structural).toBe("vault index rebuilding");
  });

  it("carries the real pending flag through as loading", () => {
    const view = derivePipelineStatusView(structuralUp, [], true);
    expect(view.loading).toBe(true);
    expect(view.liveMessage).toBe("loading in-flight work");
  });
});

describe("derivePlanInteriorView (step-tree rollup + truncation, W01.P02.S11)", () => {
  it("rolls up completion bottom-up across the L3 wave/phase shape", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [
        {
          node_id: "x#W01",
          id: "W01",
          heading: "wave one",
          phases: [
            {
              node_id: "x#W01/P01",
              id: "P01",
              heading: "phase one",
              steps: [
                { node_id: "x#S01", id: "S01", done: true },
                { node_id: "x#S02", id: "S02", done: false },
                { node_id: "x#S03", id: "S03", done: true },
              ],
            },
          ],
        },
      ],
      phases: [],
      steps: [],
      truncated: null,
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.waves[0].phases[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.waves[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.rollup).toEqual({ done: 2, total: 3 });
    expect(view.truncated).toBeNull();
  });

  it("rolls up the flat L1 step shape and surfaces honest truncation", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [],
      phases: [],
      steps: [
        { node_id: "x#S01", id: "S01", done: true },
        { node_id: "x#S02", id: "S02", done: false },
      ],
      truncated: { total_nodes: 9001, returned_nodes: 2000, reason: "node ceiling" },
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.rollup).toEqual({ done: 1, total: 2 });
    expect(view.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "node ceiling",
    });
  });

  it("is the inert empty view while loading with no held interior", () => {
    const view = derivePlanInteriorView(undefined, true);
    expect(view.loading).toBe(true);
    expect(view.rollup).toEqual({ done: 0, total: 0 });
    expect(view.waves).toEqual([]);
  });
});

describe("deriveTimelineLineageView (timeline lineage read model)", () => {
  const slice: LineageSlice = {
    nodes: [
      {
        id: "doc:research",
        doc_type: "research",
        phase: "research",
        dates: { created: "2026-06-18" },
        degree: 1,
      },
    ],
    arcs: [
      {
        id: "edge:1",
        src: "doc:research",
        dst: "doc:adr",
        relation: "references",
        tier: "structural",
        confidence: 1,
      },
    ],
    tiers: {},
    truncated: null,
  };

  it("projects raw lineage query state into stable timeline inputs", () => {
    const retry = () => undefined;
    expect(deriveTimelineLineageView(slice, false, false, retry)).toEqual({
      loading: false,
      errored: false,
      nodes: slice.nodes,
      arcs: slice.arcs,
      retry,
    });
  });

  it("falls back to empty node and arc arrays before lineage data arrives", () => {
    expect(deriveTimelineLineageView(undefined, true, false)).toMatchObject({
      loading: true,
      errored: false,
      nodes: [],
      arcs: [],
    });
  });

  it("does not expose held lineage while a new lineage read is loading", () => {
    expect(deriveTimelineLineageView(slice, true, false)).toMatchObject({
      loading: true,
      errored: false,
      nodes: [],
      arcs: [],
    });
  });

  it("does not expose held lineage after a lineage read errors", () => {
    expect(deriveTimelineLineageView(slice, false, true)).toMatchObject({
      loading: false,
      errored: true,
      nodes: [],
      arcs: [],
    });
  });
});

// ---------------------------------------------------------------------------
// adaptLineageSlice + /graph/lineage consumer fidelity (dashboard-timeline
// W02.P04.S24).
//
// A sample CAPTURED from the live `/graph/lineage` wire shape (the engine
// `graph_lineage` route's `{data: {nodes, arcs, truncated}, tiers}` envelope) is
// fed through the SAME unwrap + adapter path the app uses.
// ---------------------------------------------------------------------------

describe("adaptLineageSlice + /graph/lineage consumer fidelity (W02.P04.S24)", () => {
  // A live `/graph/lineage` envelope: two dated, lane-owning document nodes in
  // range and ONE self-consistent structural arc between them. The live route
  // serves `{data: {nodes, arcs, truncated}, tiers}`; the semantic tier is
  // present-only (degraded) in the range lineage. `dates.modified` is the engine
  // `Timestamp` (epoch-ms NUMBER), and the arc carries NO `derivation` field
  // (the graceful fallback until the node-semantics field ships).
  const liveLineageTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: {
      available: false,
      reason: "present-only by design; excluded from the range lineage",
    },
  };
  const live = {
    data: {
      nodes: [
        {
          id: "doc:2026-06-10-x-research",
          doc_type: "research",
          phase: "research",
          dates: { created: "2026-06-10", modified: 1718000000000 },
          title: "x research",
          degree: 2,
        },
        {
          id: "doc:2026-06-12-x-adr",
          doc_type: "adr",
          phase: "adr",
          dates: { created: "2026-06-12" },
          title: "x adr",
          degree: 2,
        },
      ],
      arcs: [
        {
          id: "edge:abc",
          src: "doc:2026-06-12-x-adr",
          dst: "doc:2026-06-10-x-research",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      truncated: null,
    },
    tiers: liveLineageTiers,
  };

  it("unwraps + adapts the live lineage envelope through the app's client path", () => {
    const slice = adaptLineageSlice(unwrapEnvelope(live)) as LineageSlice;
    expect(slice.nodes).toHaveLength(2);
    expect(slice.nodes[0]).toMatchObject({
      id: "doc:2026-06-10-x-research",
      phase: "research",
      degree: 2,
    });
    // The numeric epoch-ms modified tick survives as a number, not a string.
    expect(slice.nodes[0].dates.modified).toBe(1718000000000);
    // The undated-modified node tolerates the absent optional.
    expect(slice.nodes[1].dates.modified).toBeUndefined();
    expect(slice.arcs).toHaveLength(1);
    expect(slice.arcs[0].derivation).toBeUndefined(); // graceful fallback
    expect(slice.tiers.semantic.available).toBe(false);
    expect(slice.truncated).toBeNull();
  });
});
