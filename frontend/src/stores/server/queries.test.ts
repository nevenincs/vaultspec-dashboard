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
  EngineStatus,
  EngineEdge,
  DashboardState,
  FiltersVocabulary,
  GitFileDiff,
  GraphFilter,
  GraphSlice,
  HistoryResponse,
  LineageSlice,
  MapWorktree,
  NodeDetail,
  PipelineArtifact,
  PlanInterior,
  PRsResponse,
  IssuesResponse,
  SessionState,
  SettingsSchema,
  SettingsState,
  TiersBlock,
  VaultTreeEntry,
} from "./engine";
import { adaptLineageSlice, adaptStatus, unwrapEnvelope } from "./liveAdapters";
import type { ContentView, StreamChunk } from "./queries";
import {
  SCOPED_ENGINE_QUERY_SUBTREES,
  DEFAULT_HISTORY_LIMIT,
  GRAPH_GENERATION_QUERY_SUBTREES,
  MAX_HISTORY_LIMIT,
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
  dashboardGraphDefaultsInitializationIdentity,
  deriveDashboardPlayheadView,
  deriveDashboardRangeSelectView,
  deriveDashboardShellChromeView,
  deriveDashboardStageSceneView,
  deriveDashboardTimelineModeView,
  fileTreeChildStatusStyle,
  deriveFileTreeLevelView,
  deriveFileTreeRootSurfaceState,
  deriveFiltersVocabularyView,
  deriveFrontmatterHeaderView,
  deriveGitStatusView,
  deriveGraphSliceAvailability,
  deriveHistoryView,
  deriveIssuesView,
  deriveInspectorNeighborTierView,
  deriveLocationAnchor,
  deriveMarkdownHeaderView,
  deriveMarkdownReaderView,
  deriveNodeDetailView,
  derivePipelineStatusView,
  derivePlanInteriorView,
  derivePlanSummaryView,
  derivePRsView,
  deriveSalienceSliceView,
  deriveSettingsDialogView,
  deriveSettingsEffectsView,
  deriveStatusTabSectionsView,
  deriveThemeSettingView,
  deriveTimelineLineageView,
  deriveTimelineSurfaceChromeView,
  deriveVaultTreeBrowserView,
  deriveVaultTreeAvailability,
  deriveVaultTreeSurfaceState,
  deriveWorkspaceMapAvailability,
  deriveWorkspaceMapPickerPresentationView,
  deriveWorkspaceMapSurfaceState,
  deriveWorktreePickerProjectRows,
  deriveWorktreePickerRecentRows,
  workspaceRootName,
  canReadGitFileDiff,
  canReadGitHistoricalFileDiff,
  GIT_QUERY_KEY_PART_MAX_CHARS,
  orderWorkspaceMapWorktrees,
  engineKeys,
  dashboardEditedWindowRange,
  invalidateAfterVaultMutation,
  invalidateGraphGenerationReads,
  invalidateGitRecoveryReads,
  invalidateScopedSemanticReads,
  isAddressableNode,
  latestBackendSignalSignature,
  normalizeEngineStreamChannel,
  normalizeEngineStreamChannels,
  normalizeEngineStreamIdentity,
  normalizeEngineStreamScope,
  normalizeEngineStreamSince,
  normalizeBackendSignalChannel,
  normalizeHistoryCommitForView,
  normalizeHistoryCommitsForView,
  normalizeHistoryLimit,
  normalizeGitDiffRequest,
  normalizeGitQueryKeyPart,
  normalizeEngineEventsRequestIdentity,
  normalizeDashboardStateRequestIdentity,
  normalizeFileTreeRequestIdentity,
  normalizeFiltersVocabularyRequestIdentity,
  normalizeGraphEmbeddingsRequestIdentity,
  normalizeGraphDiffRequestIdentity,
  normalizeGraphSliceRequestIdentity,
  normalizeHistoryRequestIdentity,
  normalizeNodeNeighborDepth,
  normalizeNodeScopedRequestIdentity,
  normalizePipelineStatusRequestIdentity,
  normalizePlanInteriorRequestIdentity,
  normalizePullRequestsRequestIdentity,
  normalizeIssuesRequestIdentity,
  normalizeSearchRequestIdentity,
  normalizeCreateDocArgs,
  normalizeSettingUpdate,
  normalizeTimelineLineageRequestIdentity,
  normalizeRenameDocArgs,
  normalizeSaveBodyArgs,
  normalizeSetFrontmatterArgs,
  normalizeVaultTreeRequestIdentity,
  parseSseFrames,
  refreshAfterAcceptedScopeSwitch,
  refreshAfterAcceptedWorkspaceSwitch,
  sseChunks,
  stableKey,
  streamReducer,
  tierAvailabilityReason,
  useDashboardState,
  useDashboardFilterChoicesView,
  useDashboardFilterSidebarView,
  useDashboardGraphControlsView,
  useDashboardStageSceneView,
  useDashboardTimelineModeView,
  useDashboardShellChromeView,
  useChangedFiles,
  useChangesOverview,
  useContentView,
  useEngineEvents,
  useEngineSearch,
  useFileTree,
  useFiltersVocabulary,
  useFiltersVocabularyView,
  useGraphDiff,
  useGraphEmbeddings,
  useGraphSlice,
  useGraphSliceAvailability,
  useGitFileDiff,
  useGitHistoricalFileDiff,
  useHistoryView,
  useIssuesView,
  useLinkResolution,
  useNodeContent,
  useNodeDetail,
  useNodeEvidence,
  useNodeHistory,
  useNodeNeighborsBulk,
  useNodeNeighbors,
  usePipelineStatus,
  usePlanInterior,
  usePRsView,
  useReadTime,
  useSalienceSliceView,
  useTimelineLineage,
  useTimelineLineageView,
  useVaultTree,
  useVaultTreeSurface,
  dashboardStateSessionIdentity,
} from "./queries";
import { ENGINE_WAIT } from "../../testing/timing";

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

function sessionState(scope: string): SessionState {
  return {
    workspace: "workspace-a",
    active_workspace: "workspace-a",
    active_scope: scope,
    scope_context: { folder: null, feature_tags: [] },
    recents: [],
    tiers: {},
  };
}

function dashboardState(scope: string): DashboardState {
  return {
    scope,
    selected_ids: ["doc:cached"],
    hovered_id: null,
    filters: { text: "cached" },
    date_range: { from: "2026-06-01", to: "2026-06-30" },
    timeline_mode: { kind: "time-travel", at: 42 },
    graph_granularity: "document",
    salience_lens: "design",
    salience_focus: "doc:cached",
    representation_mode: "lineage",
    panel_state: {
      left_collapsed: true,
      right_collapsed: true,
      right_tab: "changes",
    },
    graph_bounds: { shape: "rect", size: 1200 },
    tiers: {},
  };
}

function graphSlice(): GraphSlice {
  return {
    nodes: [],
    edges: [],
    tiers: {},
  };
}

function lineageSlice(): LineageSlice {
  return {
    nodes: [],
    arcs: [],
    tiers: {},
    truncated: null,
  };
}

function planInterior(): PlanInterior {
  return {
    plan_node_id: "doc:plan",
    waves: [],
    phases: [],
    steps: [
      {
        node_id: "doc:plan#step-1",
        id: "step-1",
        action: "Trace state boundary",
        done: false,
      },
    ],
    summary: {
      wave_count: 0,
      phase_count: 0,
      step_count: 1,
      done_count: 0,
      plan_state: "not-started",
    },
    truncated: null,
  };
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

describe("node-scoped query cache boundaries", () => {
  const detail: NodeDetail = {
    node: { id: "doc:ready", kind: "plan", title: "Ready" },
    tiers: {},
  };

  it("normalizes node-scoped query identity before keying node-family reads", () => {
    expect(normalizeNodeScopedRequestIdentity(" scope-a ", " doc:ready ", 2.8)).toEqual(
      {
        scope: "scope-a",
        nodeId: "doc:ready",
        depth: 2,
      },
    );
    expect(
      normalizeNodeScopedRequestIdentity({ scope: "scope-a" }, { id: "doc:ready" }, 0),
    ).toEqual({
      scope: null,
      nodeId: null,
      depth: 1,
    });
    expect(normalizeNodeNeighborDepth(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("does not expose cached node detail when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.node("", "doc:ready"), detail);
    client.setQueryData(engineKeys.node("scope-a", "feature:state"), detail);
    client.setQueryData(engineKeys.node("scope-a", "doc:ready"), detail);

    const noScope = renderHook(() => useNodeDetail("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeDetail("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useNodeDetail("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached node neighbors when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.neighbors("", "doc:ready", 1), graphSlice());
    client.setQueryData(
      engineKeys.neighbors("scope-a", "feature:state", 1),
      graphSlice(),
    );
    client.setQueryData(engineKeys.neighbors("scope-a", "doc:ready", 1), graphSlice());

    const noScope = renderHook(() => useNodeNeighbors("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeNeighbors("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useNodeNeighbors({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedNode.result.current.data).toBeUndefined();
  });

  it("does not expose cached bulk node neighbors when entries are disabled", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.neighbors("", "doc:ready", 1), graphSlice());
    client.setQueryData(
      engineKeys.neighbors("scope-a", "feature:state", 1),
      graphSlice(),
    );
    client.setQueryData(engineKeys.neighbors("scope-a", "doc:ready", 1), graphSlice());

    const noScope = renderHook(() => useNodeNeighborsBulk(["doc:ready"], null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(
      () => useNodeNeighborsBulk(["feature:state"], "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedNode = renderHook(
      () => useNodeNeighborsBulk([{ id: "doc:ready" }], "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current[0]?.data).toBeUndefined();
    expect(featureNode.result.current[0]?.data).toBeUndefined();
    expect(malformedNode.result.current[0]?.data).toBeUndefined();
  });

  it("does not expose cached node evidence when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.evidence("", "doc:ready"), { commits: [] });
    client.setQueryData(engineKeys.evidence("scope-a", "feature:state"), {
      commits: [],
    });
    client.setQueryData(engineKeys.evidence("scope-a", "doc:ready"), { commits: [] });

    const noScope = renderHook(() => useNodeEvidence("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeEvidence("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useNodeEvidence("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached node content when no node, no scope, or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("", "doc:ready"), { text: "cached" });
    client.setQueryData(engineKeys.content("scope-a", ""), { text: "cached" });
    client.setQueryData(engineKeys.content("scope-a", "feature:state"), {
      text: "cached",
    });
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      text: "cached",
    });

    const noScope = renderHook(() => useNodeContent("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const noNode = renderHook(() => useNodeContent(null, "scope-a"), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeContent("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useNodeContent({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(noNode.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedNode.result.current.data).toBeUndefined();
  });

  it("normalizes content-view identity before deriving viewer loading state", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      path: ".vault/plan/ready.md",
      blob_hash: "hash-ready",
      language_hint: "markdown",
      text: "cached reader text",
      truncated: null,
      tiers: { structural: { available: true } },
    });

    const trimmed = renderHook(() => useContentView(" doc:ready ", " scope-a "), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useContentView({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedScope = renderHook(
      () => useContentView("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(trimmed.result.current).toMatchObject({
      loading: false,
      available: true,
      path: ".vault/plan/ready.md",
      text: "cached reader text",
    });
    expect(malformedNode.result.current).toMatchObject({
      loading: false,
      available: false,
      text: "",
    });
    expect(malformedScope.result.current).toMatchObject({
      loading: false,
      available: false,
      text: "",
    });
  });

  it("derives read time through the normalized content-view seam", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      text: "one two three",
      truncated: null,
      tiers: { structural: { available: true } },
    });

    const trimmed = renderHook(() => useReadTime(" doc:ready ", " scope-a "), {
      wrapper: wrapper(client),
    });
    const malformed = renderHook(() => useReadTime({ id: "doc:ready" }, "scope-a"), {
      wrapper: wrapper(client),
    });

    expect(trimmed.result.current).toEqual({
      minutes: 1,
      atLeast: false,
      words: 3,
    });
    expect(malformed.result.current).toEqual({
      minutes: 0,
      atLeast: false,
      words: 0,
    });
  });
});

describe("remaining scoped query cache boundaries", () => {
  it("does not expose cached history data when no scope is selected", () => {
    const client = testQueryClient();
    const history: HistoryResponse = {
      commits: [
        {
          hash: "abc123",
          short_hash: "abc123",
          subject: "cached commit",
          body: "",
          ts: Date.parse("2026-06-19T00:00:00Z"),
          node_ids: ["commit:abc123", "doc:cached"],
        },
      ],
      truncated: null,
      next_cursor: null,
      tiers: { structural: { available: true } },
    };
    client.setQueryData(engineKeys.history("", DEFAULT_HISTORY_LIMIT), history);
    client.setQueryData(engineKeys.history("scope-a", DEFAULT_HISTORY_LIMIT), history);

    expect(normalizeHistoryRequestIdentity(" scope-a ", 24.7)).toEqual({
      scope: "scope-a",
      limit: 24,
    });
    expect(normalizeHistoryRequestIdentity({ scope: "scope-a" }, "50")).toEqual({
      scope: null,
      limit: DEFAULT_HISTORY_LIMIT,
    });

    const raw = renderHook(() => useNodeHistory(null), {
      wrapper: wrapper(client),
    });
    const view = renderHook(() => useHistoryView(null), {
      wrapper: wrapper(client),
    });
    const malformedRaw = renderHook(
      () => useNodeHistory({ scope: "scope-a" }, DEFAULT_HISTORY_LIMIT),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedView = renderHook(
      () => useHistoryView({ scope: "scope-a" }, DEFAULT_HISTORY_LIMIT),
      {
        wrapper: wrapper(client),
      },
    );

    expect(raw.result.current.data).toBeUndefined();
    expect(view.result.current.showList).toBe(false);
    expect(view.result.current.commits).toEqual([]);
    expect(malformedRaw.result.current.data).toBeUndefined();
    expect(malformedView.result.current.showList).toBe(false);
    expect(malformedView.result.current.commits).toEqual([]);
  });

  it("does not expose cached PR or issue data when no scope is selected", () => {
    const client = testQueryClient();
    const prs: PRsResponse = {
      prs: [],
      available: true,
      reason: null,
      tiers: {},
    };
    const issues: IssuesResponse = {
      issues: [],
      available: true,
      reason: null,
      tiers: {},
    };
    client.setQueryData(engineKeys.prs("", "open"), prs);
    client.setQueryData(engineKeys.issues("", "open"), issues);
    client.setQueryData(engineKeys.prs("scope-a", "open"), prs);
    client.setQueryData(engineKeys.issues("scope-a", "open"), issues);

    expect(normalizePullRequestsRequestIdentity(" scope-a ", "merged")).toEqual({
      scope: "scope-a",
      state: "merged",
    });
    expect(normalizePullRequestsRequestIdentity({ scope: "scope-a" }, "draft")).toEqual(
      {
        scope: null,
        state: "open",
      },
    );
    expect(normalizeIssuesRequestIdentity(" scope-a ", "closed")).toEqual({
      scope: "scope-a",
      state: "closed",
    });
    expect(normalizeIssuesRequestIdentity({ scope: "scope-a" }, "merged")).toEqual({
      scope: null,
      state: "open",
    });

    const prView = renderHook(() => usePRsView(null), {
      wrapper: wrapper(client),
    });
    const issueView = renderHook(() => useIssuesView(null), {
      wrapper: wrapper(client),
    });
    const malformedPrView = renderHook(() => usePRsView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    const malformedIssueView = renderHook(() => useIssuesView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(prView.result.current.available).toBe(false);
    expect(prView.result.current.showList).toBe(false);
    expect(issueView.result.current.available).toBe(false);
    expect(issueView.result.current.showList).toBe(false);
    expect(malformedPrView.result.current.available).toBe(false);
    expect(malformedPrView.result.current.showList).toBe(false);
    expect(malformedIssueView.result.current.available).toBe(false);
    expect(malformedIssueView.result.current.showList).toBe(false);
  });

  it("does not expose cached event data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.events("", {}), {
      events: [
        {
          id: "evt:cached",
          ts: "2026-06-19",
          kind: "commit",
          ref: "abc",
          node_ids: [],
        },
      ],
      tiers: {},
    });
    client.setQueryData(
      engineKeys.events("scope-a", { from: "2026-06-01", to: "2026-06-30" }, "day"),
      {
        events: [
          {
            id: "evt:cached",
            ts: "2026-06-19",
            kind: "commit",
            ref: "abc",
            node_ids: [],
          },
        ],
        tiers: {},
      },
    );

    expect(
      normalizeEngineEventsRequestIdentity(
        " scope-a ",
        { from: " 2026-06-01 ", to: " 2026-06-30 " },
        " day ",
      ),
    ).toEqual({
      scope: "scope-a",
      range: { from: "2026-06-01", to: "2026-06-30" },
      bucket: "day",
    });
    expect(
      normalizeEngineEventsRequestIdentity(
        { scope: "scope-a" },
        { from: 1, to: { value: "2026-06-30" } },
        { bucket: "day" },
      ),
    ).toEqual({
      scope: null,
      range: { from: undefined, to: undefined },
      bucket: undefined,
    });

    const { result } = renderHook(() => useEngineEvents(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () =>
        useEngineEvents(
          { scope: "scope-a" },
          { from: "2026-06-01", to: "2026-06-30" },
          "day",
        ),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached graph diff data when no scope or no window is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.diff("", 1, 2), { ops: [], tiers: {} });
    client.setQueryData(engineKeys.diff("scope-a", 1, 1), { ops: [], tiers: {} });
    client.setQueryData(engineKeys.diff("scope-a", 1, 2), { ops: [], tiers: {} });

    expect(
      normalizeGraphDiffRequestIdentity(
        " scope-a ",
        " 1 ",
        2,
        ' {"feature_tags":["state"]} ',
      ),
    ).toEqual({
      scope: "scope-a",
      from: "1",
      to: 2,
      filter: '{"feature_tags":["state"]}',
    });
    expect(
      normalizeGraphDiffRequestIdentity({ scope: "scope-a" }, Number.NaN, "", {
        filter: "ignored",
      }),
    ).toEqual({
      scope: null,
      from: null,
      to: null,
      filter: undefined,
    });

    const noScope = renderHook(() => useGraphDiff(null, 1, 2), {
      wrapper: wrapper(client),
    });
    const emptyWindow = renderHook(() => useGraphDiff("scope-a", 1, 1), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(() => useGraphDiff({ scope: "scope-a" }, 1, 2), {
      wrapper: wrapper(client),
    });
    const malformedWindow = renderHook(() => useGraphDiff("scope-a", { from: 1 }, 2), {
      wrapper: wrapper(client),
    });

    expect(noScope.result.current.data).toBeUndefined();
    expect(emptyWindow.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedWindow.result.current.data).toBeUndefined();
  });

  it("does not expose cached search data when no scope or no query is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.search("", "cached", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });
    client.setQueryData(engineKeys.search("scope-a", "", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });
    client.setQueryData(engineKeys.search("scope-a", "cached", "vault"), {
      results: [{ id: "doc:cached" }],
      tiers: {},
    });

    expect(normalizeSearchRequestIdentity(" cached ", "code", " scope-a ")).toEqual({
      scope: "scope-a",
      query: "cached",
      target: "code",
    });
    expect(
      normalizeSearchRequestIdentity(
        { query: "cached" },
        { target: "code" },
        {
          scope: "scope-a",
        },
      ),
    ).toEqual({
      scope: null,
      query: "",
      target: "vault",
    });

    const noScope = renderHook(() => useEngineSearch(null, "cached"), {
      wrapper: wrapper(client),
    });
    const emptyQuery = renderHook(() => useEngineSearch("scope-a", ""), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useEngineSearch({ scope: "scope-a" }, "cached"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedQuery = renderHook(
      () => useEngineSearch("scope-a", { query: "cached" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(emptyQuery.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedQuery.result.current.data).toBeUndefined();
  });

  it("normalizes settings update payloads before the settings mutation", () => {
    expect(
      normalizeSettingUpdate({
        key: " theme ",
        value: "dark",
        scope: " scope-a ",
      }),
    ).toEqual({
      key: "theme",
      value: "dark",
      scope: "scope-a",
    });
    expect(
      normalizeSettingUpdate({
        key: "label_filter",
        value: "  semantic only  ",
        scope: "   ",
      }),
    ).toEqual({
      key: "label_filter",
      value: "  semantic only  ",
      scope: undefined,
    });
    expect(normalizeSettingUpdate({ key: "   ", value: "dark" })).toBeNull();
    expect(normalizeSettingUpdate({ key: "theme", value: 42 })).toBeNull();
    expect(normalizeSettingUpdate("theme")).toBeNull();
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
      edge("declared-1", "declared"),
      edge("structural-meta", "structural", {
        count: 2,
        breakdown_by_tier: { structural: 2 },
      }),
      edge("temporal-1", "temporal"),
    ]);

    expect(view.tierKeys).toEqual(["declared", "temporal"]);
    expect([...view.tiers.keys()]).toEqual(view.tierKeys);
    expect(view.tiers.get("declared")?.map((item) => item.id)).toEqual(["declared-1"]);
    expect(view.tiers.get("temporal")?.map((item) => item.id)).toEqual(["temporal-1"]);
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
      statuses: [],
      planStates: [],
      health: [],
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
      statuses: [],
      planStates: [],
      health: [],
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

  it("normalizes dashboard date range before parsing display ticks", () => {
    expect(
      deriveDashboardDateRangeView({ from: "2026-06-30", to: "2026-06-01" }, fallback),
    ).toEqual({
      fromMs: Date.parse("2026-06-01"),
      toMs: Date.parse("2026-06-30"),
      source: "dashboard",
    });
    expect(
      deriveDashboardDateRangeView(
        { from: "2026-06-01T00:00:00Z", to: "2026-06-30" },
        fallback,
      ),
    ).toEqual({
      fromMs: Date.parse("2026-06-01"),
      toMs: Date.parse("2026-06-30"),
      source: "dashboard",
    });
  });
});

describe("deriveDashboardFilterSummaryView (stage filter toolbar)", () => {
  it("counts active advanced-flyout facets for the Filters button badge", () => {
    expect(
      deriveDashboardFilterSummaryView({
        filters: {
          doc_types: ["adr", "plan"],
          feature_tags: ["state"],
          statuses: ["accepted"],
          health: ["dangling"],
          relations: ["references"],
          structural_state: ["broken"],
          // The feature query is the search bar's own state, not an advanced
          // facet — it must NOT be counted on the Filters button badge.
          feature_query: { value: "*centralize*", mode: "glob" },
        },
        date_range: {},
      }),
    ).toEqual({
      activeFilterCount: 7,
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
    expect(view.editedWindowRows).toEqual([
      {
        key: "any",
        label: "Any time",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
      {
        key: "7d",
        label: "Last 7 days",
        active: true,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink",
      },
      {
        key: "30d",
        label: "Last 30 days",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
      {
        key: "year",
        label: "This year",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
    ]);
    expect(view.dateActive).toBe(true);
    expect(view.anyActive).toBe(true);
    expect(view.presentation).toMatchObject({
      panelAriaLabel: "filter panel",
      panelClassName: "pointer-events-auto fixed z-50",
      headerClassName:
        "flex items-center justify-between border-b border-rule px-fg-3 py-fg-1-5",
      titleClassName: "text-body font-medium text-ink",
      headerActionsClassName: "flex items-center gap-fg-2",
      titleLabel: "Filter documents",
      clearAllClassName:
        "text-caption text-accent-text underline-offset-2 hover:underline",
      clearAllLabel: "Clear all",
      clearAllAriaLabel: "clear all filters",
      closeButtonClassName:
        "rounded-fg-xs p-fg-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink",
      closeAriaLabel: "close filter panel",
      sectionClassName: "border-b border-rule",
      sectionButtonClassName:
        "flex w-full items-center justify-between px-fg-3 py-fg-1-5 text-left text-label font-medium uppercase tracking-wider text-ink-muted hover:bg-paper-sunken",
      sectionMetaClassName: "flex items-center gap-fg-1-5",
      sectionBadgeClassName:
        "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption font-normal text-ink-muted",
      sectionIconClassName: "text-ink-faint",
      sectionBodyClassName: "pb-2",
      kindSectionLabel: "Type",
      featureSectionLabel: "Feature",
      editedSectionLabel: "Edited",
      editedWindowAriaLabel: "edited window",
      facetEmptyClassName: "px-fg-3 py-fg-1 text-label italic text-ink-faint",
      facetListClassName: "space-y-fg-0-5 px-fg-3",
      facetOverflowButtonClassName:
        "ml-fg-1 text-label text-ink-faint underline hover:text-ink-muted",
      footerClassName: "border-t border-rule px-fg-3 py-fg-1-5",
      footerTextClassName: "text-label text-state-stale",
      editedWindows: [
        { key: "any", label: "Any time" },
        { key: "7d", label: "Last 7 days" },
        { key: "30d", label: "Last 30 days" },
        { key: "year", label: "This year" },
      ],
    });
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
      stateToneClass: "text-ink-faint",
      text: "line one\nline two\n",
      rawLines: ["line one", "line two"],
      path: "src/auth/mod.rs",
      languageHint: "rust",
      truncated: null,
      readOnlyLabel: "read-only",
      truncationMessage: null,
    });
  });

  it("projects designed loading, error, degraded, and empty states", () => {
    expect(
      deriveCodeViewerView(content({ loading: true, available: false, text: "" })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading file...",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      text: "",
      rawLines: [],
      readOnlyLabel: "read-only",
      truncationMessage: null,
    });
    expect(
      deriveCodeViewerView(content({ errored: true, available: false, text: "" })),
    ).toMatchObject({
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone: "broken",
      stateToneClass: "text-state-broken",
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
      stateToneClass: "text-ink-muted",
    });
    expect(deriveCodeViewerView(content({ available: false, text: "" }))).toMatchObject(
      {
        state: "empty",
        stateMessage: "This file is empty.",
        stateTone: "faint",
        stateToneClass: "text-ink-faint",
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
    expect(deriveCodeViewerView(content({ truncated })).truncationMessage).toBe(
      "Truncated to the first 1,048,576 of 2,000,000 bytes — open the file directly for the full contents.",
    );
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncated,
    ).toBeNull();
    expect(
      deriveCodeViewerView(
        content({ loading: true, available: false, text: "", truncated }),
      ).truncationMessage,
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
    expect(view.editorial).toMatchObject({
      title: "Body heading",
      dek: null,
      body: "",
      eyebrow: { label: "Decision", category: "adr" },
      meta: ["17 June 2026", "1 min read", "accepted"],
      footerTags: [],
      related: [
        {
          stem: "2026-06-18-reader-plan",
          nodeId: "doc:2026-06-18-reader-plan",
        },
      ],
    });
  });

  it("leaves general markdown untouched when no frontmatter fence is present", () => {
    expect(deriveMarkdownReaderView(content({ text: "# Plain markdown" }))).toEqual({
      state: "ready",
      stateMessage: null,
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
      frontmatter: null,
      status: null,
      body: "# Plain markdown",
      editorial: {
        title: "Plain markdown",
        dek: null,
        body: "",
        eyebrow: null,
        meta: ["1 min read"],
        footerTags: [],
        related: [],
      },
      truncated: null,
      truncationMessage: null,
    });
  });

  it("projects reader editorial header, footer, and truncation chrome", () => {
    const view = deriveMarkdownReaderView(
      content({
        text: [
          "---",
          "tags:",
          "  - '#plan'",
          "  - '#state-boundary'",
          "date: '2026-06-19'",
          "status: draft",
          "related:",
          "  - '[[dashboard-state-plan]]'",
          "---",
          "",
          "# Reader title",
          "",
          "The dek is lifted out of the rendered markdown body.",
          "",
          "The remaining paragraph stays in the markdown article.",
        ].join("\n"),
        truncated: {
          total_bytes: 2500,
          returned_bytes: 1024,
          reason: "content byte ceiling",
        },
      }),
    );

    expect(view.editorial).toEqual({
      title: "Reader title",
      dek: "The dek is lifted out of the rendered markdown body.",
      body: "The remaining paragraph stays in the markdown article.",
      eyebrow: { label: "Plan", category: "plan" },
      meta: ["19 June 2026", "1 min read", "draft"],
      footerTags: [{ label: "#state-boundary" }],
      related: [{ stem: "dashboard-state-plan", nodeId: "doc:dashboard-state-plan" }],
    });
    expect(view.truncationMessage).toBe(
      "Truncated to the first 1,024 of 2,500 bytes — open the file directly for the full document.",
    );
  });

  it("projects loading, error, degraded, empty, and truncated states", () => {
    expect(
      deriveMarkdownReaderView(content({ loading: true, available: false })),
    ).toMatchObject({
      state: "loading",
      stateMessage: "Loading document…",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
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
      stateToneClass: "text-state-broken",
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
      stateToneClass: "text-ink-muted",
      body: "",
    });
    expect(
      deriveMarkdownReaderView(content({ available: false, text: "" })),
    ).toMatchObject({
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone: "faint",
      stateToneClass: "text-ink-faint",
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
        graph_granularity: "feature",
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
      granularity: "feature",
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
        graph_granularity: "document",
      }).freezeAvailable,
    ).toBe(false);

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "circle", size: 1200 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "time-travel", at: 42 },
        graph_granularity: "document",
      }).freezeAvailable,
    ).toBe(false);
  });

  it("normalizes malformed graph bounds before graph controls consume them", () => {
    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "rect", size: Number.NaN },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
        graph_granularity: "document",
      }).graphBounds,
    ).toEqual({ shape: "rect", size: 0 });

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "hex" as "circle", size: 1200 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
        graph_granularity: "document",
      }).graphBounds,
    ).toEqual({ shape: "free", size: 0 });
  });
});

describe("deriveDashboardStageSceneView (Stage scene owner)", () => {
  const state: DashboardState = {
    scope: "scope-a",
    selected_ids: ["node:a", "node:b"],
    hovered_id: null,
    filters: {
      doc_types: ["adr"],
      tiers: { structural: false },
      feature_query: { value: "state-*", mode: "glob" },
      statuses: ["draft"],
      plan_tiers: ["wave-1"],
      health: ["orphaned"],
      text: "centralize",
    },
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
          tiers: { structural: false },
          feature_query: { value: "state-*", mode: "glob" },
          statuses: ["draft"],
          plan_tiers: ["wave-1"],
          health: ["orphaned"],
          text: "centralize",
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

  it("normalizes graph bounds before the Stage scene-owner view consumes them", () => {
    expect(
      deriveDashboardStageSceneView({
        ...state,
        graph_bounds: { shape: "circle", size: Number.NEGATIVE_INFINITY },
      }).graphBounds,
    ).toEqual({ shape: "circle", size: 0 });

    expect(
      deriveDashboardStageSceneView({
        ...state,
        graph_bounds: { shape: "invalid" as "rect", size: 100 },
      }).graphBounds,
    ).toEqual({ shape: "free", size: 0 });
  });

  it("normalizes representation mode before the Stage scene-owner view consumes it", () => {
    expect(
      deriveDashboardStageSceneView({
        ...state,
        representation_mode: "invalid" as "connectivity",
      }).activeRepresentationMode,
    ).toBe("connectivity");
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

  it("normalizes committed dashboard date range for the range band", () => {
    expect(
      deriveDashboardRangeSelectView({
        date_range: { from: "2026-06-30", to: "2026-06-01" },
      }),
    ).toEqual({
      dateRange: { from: "2026-06-01", to: "2026-06-30" },
    });
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
      deriveDashboardGraphDefaultsInitializationView(
        {
          graph_granularity: "feature",
          filters: {},
        },
        "scope-session",
      ),
    ).toEqual({ loaded: true, fresh: true, identity: "scope-session" });
  });

  it("rejects unloaded or user-owned dashboard graph/filter intent", () => {
    expect(deriveDashboardGraphDefaultsInitializationView(undefined)).toEqual({
      loaded: false,
      fresh: false,
      identity: null,
    });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "document",
        filters: {},
      }),
    ).toEqual({ loaded: true, fresh: false, identity: null });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "feature",
        filters: { text: "user-owned" },
      }),
    ).toEqual({ loaded: true, fresh: false, identity: null });
  });

  it("keys graph-default initialization by scope plus session identity", () => {
    const sessionA = sessionState("scope-a");
    const sessionB: SessionState = {
      ...sessionA,
      active_workspace: "workspace-b",
      workspace: "workspace-b",
    };

    expect(
      dashboardGraphDefaultsInitializationIdentity("scope-a", sessionA),
    ).not.toEqual(dashboardGraphDefaultsInitializationIdentity("scope-a", sessionB));
    expect(dashboardGraphDefaultsInitializationIdentity(null, sessionA)).toBeNull();
    expect(
      dashboardGraphDefaultsInitializationIdentity("scope-a", undefined),
    ).toBeNull();
    expect(dashboardGraphDefaultsInitializationIdentity(" scope-a ", sessionA)).toEqual(
      dashboardGraphDefaultsInitializationIdentity("scope-a", sessionA),
    );
    expect(
      dashboardGraphDefaultsInitializationIdentity({ scope: "scope-a" }, sessionA),
    ).toBeNull();
  });
});

describe("useDashboardState cache boundaries", () => {
  it("normalizes dashboard-state request identity at the stores boundary", () => {
    const session = sessionState("scope-a");

    expect(normalizeDashboardStateRequestIdentity(" scope-a ", session)).toEqual({
      scope: "scope-a",
      sessionIdentity: dashboardStateSessionIdentity(session),
    });
    expect(normalizeDashboardStateRequestIdentity("", session).scope).toBeNull();
    expect(
      normalizeDashboardStateRequestIdentity({ scope: "scope-a" } as unknown, session)
        .scope,
    ).toBeNull();
  });

  it("does not expose cached dashboard intent when no scope is selected", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );

    const { result } = renderHook(() => useDashboardState(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached dashboard intent for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );

    const { result } = renderHook(() => useDashboardState({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached dashboard intent through derived selectors for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(engineKeys.dashboardState("", sessionIdentity), {
      ...dashboardState(""),
      selected_ids: ["doc:cached"],
      filters: { text: "cached-filter", feature_tags: ["cached"] },
      date_range: { from: "2026-06-01", to: "2026-06-18" },
      timeline_mode: { kind: "time-travel", at: 42 },
      graph_bounds: { shape: "circle", size: 900 },
      representation_mode: "radial",
      salience_lens: "design",
    });

    const stage = renderHook(() => useDashboardStageSceneView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    expect(stage.result.current).toMatchObject({
      selectedIds: [],
      selectedNodeId: null,
      graphQuery: null,
      granularity: "feature",
      activeRepresentationMode: "connectivity",
      graphBounds: undefined,
      liveTimeline: true,
    });

    const graphControls = renderHook(
      () => useDashboardGraphControlsView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(graphControls.result.current).toMatchObject({
      graphBounds: { shape: "free", size: 0 },
      representationMode: "connectivity",
      freezeAvailable: true,
      timeline: { timeTravel: false },
    });

    const filterChoices = renderHook(
      () => useDashboardFilterChoicesView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(filterChoices.result.current).toMatchObject({
      loaded: false,
      choices: {
        featureTags: [],
        textMatch: "",
        dateRange: {},
      },
    });

    const sidebar = renderHook(
      () => useDashboardFilterSidebarView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(sidebar.result.current).toMatchObject({
      filters: {},
      dateRange: {},
      anyActive: false,
    });

    const timeline = renderHook(
      () => useDashboardTimelineModeView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(timeline.result.current).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
  });

  it("does not expose cached dashboard intent while session identity is pending", () => {
    const client = testQueryClient();
    client.setQueryDefaults(engineKeys.session(), { enabled: false });
    client.setQueryData(
      engineKeys.dashboardState("scope-a", dashboardStateSessionIdentity(undefined)),
      dashboardState("scope-a"),
    );

    const { result } = renderHook(() => useDashboardState("scope-a"), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
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

  it("normalizes malformed panel state before AppShell chrome consumes it", () => {
    expect(
      deriveDashboardShellChromeView({
        panel_state: {
          left_collapsed: "yes" as unknown as boolean,
          right_collapsed: true,
          right_tab: "invalid" as "status",
        },
        timeline_mode: { kind: "live" },
      }),
    ).toMatchObject({
      panelState: {
        left_collapsed: false,
        right_collapsed: true,
        right_tab: "status",
      },
    });
  });

  it("normalizes runtime scope before shell chrome subscribes to dashboard state", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(engineKeys.dashboardState("", sessionIdentity), {
      ...dashboardState(""),
      panel_state: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "search",
      },
    });

    const { result } = renderHook(
      () => useDashboardShellChromeView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.panelState).toEqual({
      left_collapsed: false,
      right_collapsed: false,
      right_tab: "status",
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

    expect(view.loading).toBe(false);
    expect(view.schemaLoading).toBe(false);
    expect(view.settingsLoading).toBe(false);
    expect(view).toMatchObject({
      title: "Settings",
      description: "Preferences are saved to this workspace. Some apply per scope.",
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
      cancelLabel: "Cancel",
      doneLabel: "Done",
    });
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ name: "Appearance" });
    expect(view.groups[0]!.settings[0]).toMatchObject({
      value: "dark",
      provenance: "global",
    });
  });

  it("keeps the dialog empty while the schema is not served yet", () => {
    expect(deriveSettingsDialogView(undefined, undefined, null, true)).toMatchObject({
      loading: true,
      schemaLoading: true,
      settingsLoading: false,
      groups: [],
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
    });
  });

  it("keeps the dialog empty while persisted settings are still loading", () => {
    expect(
      deriveSettingsDialogView(schema, undefined, null, false, true),
    ).toMatchObject({
      loading: true,
      schemaLoading: false,
      settingsLoading: true,
      groups: [],
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
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
      loading: false,
      serverTheme: "dark",
      themeMembers: ["system", "light", "dark"],
    });
  });

  it("does not expose a schema-default theme while persisted settings are loading", () => {
    expect(deriveThemeSettingView(schema, undefined, false, true)).toEqual({
      loading: true,
      serverTheme: undefined,
      themeMembers: [],
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
      loading: false,
      reduceMotion: true,
      graphDefaults: {
        defaultGranularity: "feature",
        confidenceFloor: 60,
        labelFilter: "adr",
      },
    });
  });

  it("normalizes runtime settings scope before resolving scoped graph defaults", () => {
    const settings: SettingsState = {
      global: {
        default_granularity: "document",
        confidence_floor: "60",
        label_filter: "adr",
      },
      scoped: { "scope-a": { default_granularity: "feature" } },
      tiers: {},
    };

    expect(deriveSettingsEffectsView(schema, settings, " scope-a ")).toMatchObject({
      graphDefaults: {
        defaultGranularity: "feature",
        confidenceFloor: 60,
        labelFilter: "adr",
      },
    });
    expect(
      deriveSettingsEffectsView(schema, settings, { scope: "scope-a" }).graphDefaults,
    ).toMatchObject({
      defaultGranularity: "document",
      confidenceFloor: 60,
      labelFilter: "adr",
    });
  });

  it("keeps effects inert while persisted settings are still loading", () => {
    expect(
      deriveSettingsEffectsView(schema, undefined, "scope-a", false, true),
    ).toEqual({
      loading: true,
      reduceMotion: false,
      graphDefaults: null,
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

  it("degrades only on the structural tier; a down semantic/declared/temporal tier does NOT make documents unavailable", () => {
    // The vault tree LISTS DOCUMENTS — only the STRUCTURAL tier governs whether
    // they are listable. A down semantic (rag search) or declared ("building") tier
    // must not make the rail cry "documents unavailable" when every document is
    // present (structural up). This was the bug: reading all tiers fired the banner
    // whenever semantic search was off, inconsistent with the global/search surface.
    const searchDown = deriveVaultTreeAvailability({
      ...allUp,
      semantic: { available: false, reason: "rag service down" },
      declared: { available: false, reason: "declared tier building" },
    });
    expect(searchDown.degraded).toBe(false);
    expect(searchDown.degradedTiers).toEqual([]);

    // A down STRUCTURAL tier IS a real document-availability degradation.
    const structuralDown = deriveVaultTreeAvailability({
      ...allUp,
      structural: { available: false, reason: "graph rebuilding" },
    });
    expect(structuralDown.degraded).toBe(true);
    expect(structuralDown.degradedTiers).toEqual(["structural"]);
    expect(structuralDown.reasons.structural).toBe("graph rebuilding");
  });

  it("treats an ABSENT structural tier as degraded, but ignores absent semantic/temporal", () => {
    // Contract §2: absence of the document-content tier ≠ availability — documents
    // unknown ⇒ degraded. Absent semantic/temporal do not affect the document list.
    const structuralAbsent: TiersBlock = {
      declared: { available: true },
      temporal: { available: true },
      semantic: { available: true },
    };
    const a = deriveVaultTreeAvailability(structuralAbsent);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["structural"]);

    // structural present + up, semantic/temporal absent ⇒ NOT degraded.
    const onlyStructural: TiersBlock = { structural: { available: true } };
    expect(deriveVaultTreeAvailability(onlyStructural).degraded).toBe(false);
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
  const wt = (id: string, extra?: Partial<MapWorktree>): MapWorktree => ({
    id,
    path: `/repo/${id}`,
    branch: id,
    has_vault: false,
    ...extra,
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

  it("projects worktree picker ordering, labels, and pending state in stores", () => {
    const ordered = orderWorkspaceMapWorktrees([
      wt("bare-z"),
      wt("vault-b", { has_vault: true }),
      wt("vault-a", { has_vault: true, is_default: true }),
      wt("bare-a", { degraded: ["structural"] }),
    ]);
    expect(ordered.map((worktree) => worktree.id)).toEqual([
      "vault-a",
      "vault-b",
      "bare-a",
      "bare-z",
    ]);

    const view = deriveWorkspaceMapPickerPresentationView({
      map: {
        repositories: [
          {
            path: "/repo",
            branches: [],
            worktrees: ordered,
          },
        ],
        tiers: {},
      },
      activeScope: "vault-a",
      pendingId: "vault-b",
      availability: structuralDown,
    });

    expect(view.triggerLabel).toBe("vault-b");
    expect(view.triggerAriaLabel).toBe("worktree scope: vault-b, switching");
    expect(view.triggerClassName).toBe(
      "flex w-full items-center rounded-fg-xs py-fg-1 text-left transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    );
    expect(view.triggerLabelClassName).toBe(
      "min-w-0 flex-1 truncate text-left text-body-strong text-ink-muted",
    );
    expect(view.triggerIconClassName).toBe("shrink-0 text-ink-faint");
    expect(view.loadingClassName).toBe("px-fg-1 py-fg-0-5 text-label text-ink-faint");
    expect(view.errorRootClassName).toBe("space-y-fg-1 px-fg-1 py-fg-0-5");
    expect(view.errorLabelClassName).toBe("text-label text-state-broken");
    expect(view.retryButtonClassName).toBe(
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    );
    expect(view.degradedLabel).toBe(
      "the worktree map is partly unavailable right now — worktree missing. showing what loaded.",
    );
    expect(view.degradedClassName).toBe(
      "mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted",
    );
    expect(view.rows.map((row) => row.worktree.id)).toEqual([
      "vault-a",
      "vault-b",
      "bare-a",
      "bare-z",
    ]);
    expect(view.rows[0]).toMatchObject({
      selectable: true,
      isActive: true,
      rowClassName:
        "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus bg-accent-subtle font-medium text-ink",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-accent",
      branchClassName: "min-w-0 truncate",
      badgeClassName: "shrink-0 text-ink-faint",
      degradedIconClassName: "flex shrink-0 items-center text-state-stale",
      pendingLabelClassName: "ml-auto shrink-0 text-caption text-ink-faint",
      defaultLabel: "·default",
      ariaLabel: "switch to vault-a, the default, current scope",
    });
    expect(view.rows[1]).toMatchObject({
      isPending: true,
      rowClassName:
        "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus text-ink-muted hover:bg-paper-sunken hover:text-ink",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-transparent",
      pendingLabel: "switching…",
    });
    expect(view.rows[2]).toMatchObject({
      selectable: false,
      isDegraded: true,
      rowClassName:
        "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus cursor-not-allowed text-ink-faint/60",
      activeCueClassName: "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full bg-transparent",
      bareLabel: "·bare",
      degradedTitle: "structural",
      ariaLabel: "bare-a — context only, no vault corpus to switch to",
    });
  });

  it("projects worktree picker empty and single-scope states in stores", () => {
    expect(
      deriveWorkspaceMapPickerPresentationView({
        map: { repositories: [], tiers: {} },
        activeScope: null,
        pendingId: null,
        availability: noDegradation,
      }),
    ).toMatchObject({
      triggerLabel: "pick a worktree…",
      triggerAriaLabel: "choose a worktree scope",
      emptyLabel:
        "no worktrees mapped yet — point the engine at a repository to begin.",
      singleScopeLabel: null,
    });

    expect(
      deriveWorkspaceMapPickerPresentationView({
        map: {
          repositories: [
            {
              path: "/repo",
              branches: [],
              worktrees: [wt("main", { has_vault: true })],
            },
          ],
          tiers: {},
        },
        activeScope: "main",
        pendingId: null,
        availability: noDegradation,
      }),
    ).toMatchObject({
      triggerLabel: "main",
      triggerLabelClassName:
        "min-w-0 flex-1 truncate text-left text-body-strong text-ink",
      emptyLabel: null,
      emptyClassName: "px-fg-2 py-fg-1 text-label text-ink-faint",
      singleScopeLabel: "this is the only vault-bearing worktree.",
      singleScopeClassName: "px-fg-2 py-fg-0-5 text-caption text-ink-faint",
    });
  });

  const projectRoot = (id: string, label: string, path: string, reachable = true) => ({
    id,
    label,
    path,
    is_launch: id === "ws-a",
    reachable,
    unreachable_reason: reachable ? null : "path is not a readable directory",
  });

  it("builds one cross-project Recent list, current first, attributed per project", () => {
    const rows = deriveWorktreePickerRecentRows({
      recentScopes: [
        { workspace: "ws-b", scope: "/code/engine/main" },
        { workspace: "ws-a", scope: "/code/dash/feature-x" },
        { workspace: "ws-a", scope: "/code/dash/main" },
      ],
      roots: [
        projectRoot("ws-a", "dashboard", "/code/dash"),
        projectRoot("ws-b", "engine", "/code/engine"),
      ],
      activeWorkspace: "ws-a",
      activeScope: "/code/dash/main",
    });
    // The current (ws-a, /code/dash/main) is prepended and marked current; the rest
    // follow in MRU order, deduped by the (workspace, scope) pair.
    expect(rows.map((r) => `${r.projectLabel}/${r.worktreeName}`)).toEqual([
      "dashboard/main",
      "engine/main",
      "dashboard/feature-x",
    ]);
    expect(rows[0]).toMatchObject({ isActive: true, sameProject: true });
    // A cross-project entry knows it is NOT the active project (so the row shows
    // the project name) and is reached by a workspace swap, not a worktree switch.
    expect(rows[1]).toMatchObject({
      workspace: "ws-b",
      worktreeName: "main",
      projectLabel: "engine",
      sameProject: false,
      isActive: false,
    });
  });

  it("marks a recent in an unreachable project non-selectable", () => {
    const rows = deriveWorktreePickerRecentRows({
      recentScopes: [{ workspace: "ws-b", scope: "/gone/main" }],
      roots: [
        projectRoot("ws-a", "dashboard", "/code/dash"),
        projectRoot("ws-b", "engine", "/gone", false),
      ],
      activeWorkspace: "ws-a",
      activeScope: "/code/dash/main",
    });
    const crossProject = rows.find((r) => r.workspace === "ws-b");
    expect(crossProject?.selectable).toBe(false);
  });

  it("projects registered project rows with identity and active marker", () => {
    const rows = deriveWorktreePickerProjectRows(
      [
        {
          id: "ws-a",
          label: "dashboard",
          path: "/code/dashboard",
          is_launch: true,
          reachable: true,
          unreachable_reason: null,
        },
        {
          id: "ws-b",
          label: "",
          path: "/code/engine-worktrees/main",
          is_launch: false,
          reachable: false,
          unreachable_reason: "path is not a readable directory",
        },
      ],
      "ws-a",
    );
    expect(rows[0]).toMatchObject({
      id: "ws-a",
      label: "dashboard",
      isActive: true,
      selectable: true,
      title: "/code/dashboard",
    });
    // A `<repo>-worktrees/main` root derives the REPO identity ("engine"), so four
    // projects that are each `.../<repo>-worktrees/main` don't all read "main".
    // An unreachable root is non-selectable with an honest title.
    expect(rows[1]).toMatchObject({
      id: "ws-b",
      label: "engine",
      isActive: false,
      selectable: false,
      title: "/code/engine-worktrees/main — path is not a readable directory",
    });
  });

  it("derives unique project names from <repo>-worktrees/<branch> layouts", () => {
    // The engine auto-labels a root with its path basename; pass an explicit label
    // only to exercise the custom-label-wins branch.
    const name = (path: string, label?: string) =>
      workspaceRootName({ path, label: label ?? path.split("/").pop() ?? "" });
    // Four `.../<repo>-worktrees/main` roots that the engine all auto-labelled
    // "main" must read as their distinct repo identities, never four "main"s.
    expect(name("Y:/code/vaultspec-dashboard-worktrees/main")).toBe(
      "vaultspec-dashboard",
    );
    expect(name("Y:/code/aeat-worktrees/main")).toBe("aeat");
    expect(name("Y:/code/vaultspec-core-worktrees/main")).toBe("vaultspec-core");
    // A non-main branch keeps the branch suffix; a custom label still wins.
    expect(name("Y:/code/app-worktrees/feature-x")).toBe("app · feature-x");
    expect(name("Y:/code/app-worktrees/main", "My App")).toBe("My App");
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

  it("projects vault-tree browser groups and filter-empty state in the stores layer", () => {
    const entry = (
      path: string,
      docType: string,
      featureTags: string[],
    ): VaultTreeEntry => ({
      path,
      doc_type: docType,
      feature_tags: featureTags,
      dates: {},
    });
    const entries = [
      entry(".vault/plan/2026-01-08-grid-plan.md", "plan", ["grid"]),
      entry(".vault/research/2026-01-08-grid-research.md", "research", ["grid"]),
      entry(".vault/adr/2026-01-08-grid-adr.md", "adr", ["grid"]),
      entry(".vault/reference/2026-01-08-grid-reference.md", "reference", ["grid"]),
      entry(".vault/index/grid.index.md", "index", ["grid"]),
      entry(".vault/research/2026-01-08-loose-research.md", "research", []),
    ];

    const view = deriveVaultTreeBrowserView(entries, "GRID");
    expect(view.entries.map((item) => item.path)).toEqual([
      ".vault/plan/2026-01-08-grid-plan.md",
      ".vault/research/2026-01-08-grid-research.md",
      ".vault/adr/2026-01-08-grid-adr.md",
      ".vault/reference/2026-01-08-grid-reference.md",
      ".vault/index/grid.index.md",
    ]);
    expect(view.groups).toHaveLength(1);
    // index is excluded from the feature groups (terminology-standardization ADR
    // D5), so the grid feature counts its 4 displayable docs, not the index.
    expect(view.groups[0]).toMatchObject({ feature: "grid", count: 4 });
    // Doc-type sub-groups render in the canonical pipeline order (ADR D2) and never
    // include an `index` sub-group.
    expect(view.groups[0]!.docTypes.map((group) => group.docType)).toEqual([
      "research",
      "adr",
      "plan",
      "reference",
    ]);
    expect(deriveVaultTreeBrowserView(entries, "missing")).toMatchObject({
      activeFilter: "missing",
      entries: [],
      groups: [],
      filteredToNothing: true,
    });
    expect(deriveVaultTreeBrowserView(entries, "")).toMatchObject({
      activeFilter: "",
      filteredToNothing: false,
    });
    // The untagged research doc forms the trailing (untagged) group; the untagged-
    // looking index entry never creates a group of its own.
    const allGroups = deriveVaultTreeBrowserView(entries, "").groups;
    expect(allGroups.at(-1)?.feature).toBe("(untagged)");
    expect(
      allGroups.flatMap((group) => group.docTypes).map((sub) => sub.docType),
    ).not.toContain("index");
  });

  it("does not expose cached vault-tree data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.vaultTree(""), { entries: [], tiers: {} });

    const { result } = renderHook(() => useVaultTree(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("normalizes vault-tree and filters vocabulary request identity", () => {
    expect(normalizeVaultTreeRequestIdentity(" scope-a ")).toEqual({
      scope: "scope-a",
    });
    expect(normalizeVaultTreeRequestIdentity(["scope-a"] as unknown).scope).toBeNull();
    expect(normalizeFiltersVocabularyRequestIdentity(" scope-a ")).toEqual({
      scope: "scope-a",
    });
    expect(
      normalizeFiltersVocabularyRequestIdentity({ scope: "scope-a" } as unknown).scope,
    ).toBeNull();
  });

  it("does not expose cached vault-tree data for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.vaultTree(""), {
      entries: [
        {
          path: ".vault/plan/cached.md",
          kind: "file",
          doc_type: "plan",
          feature_tags: ["cached"],
        },
      ],
      tiers: {},
    });

    const tree = renderHook(() => useVaultTree({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    const surface = renderHook(() => useVaultTreeSurface({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(tree.result.current.data).toBeUndefined();
    expect(surface.result.current.tree.data).toBeUndefined();
    expect(surface.result.current.state).toBe("ready");
  });

  it("does not expose cached file-tree data when no scope or level is disabled", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.fileTree(""), {
      path: "",
      entries: [],
      truncated: null,
      tiers: {},
    });
    client.setQueryData(engineKeys.fileTree("scope-a", "src"), {
      path: "src",
      entries: [],
      truncated: null,
      tiers: {},
    });

    const noScope = renderHook(() => useFileTree(null), {
      wrapper: wrapper(client),
    });
    const disabledLevel = renderHook(() => useFileTree("scope-a", "src", false), {
      wrapper: wrapper(client),
    });

    expect(noScope.result.current.data).toBeUndefined();
    expect(disabledLevel.result.current.data).toBeUndefined();
  });

  it("normalizes file-tree request identity", () => {
    expect(normalizeFileTreeRequestIdentity(" scope-a ", "src", true)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity(" scope-a ", " src ", true)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", "   ", true)).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: true,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", undefined, true)).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: true,
    });
    expect(
      normalizeFileTreeRequestIdentity("scope-a", { path: "src" } as unknown, true),
    ).toEqual({
      scope: "scope-a",
      path: undefined,
      enabled: false,
    });
    expect(normalizeFileTreeRequestIdentity("scope-a", "src", 1 as unknown)).toEqual({
      scope: "scope-a",
      path: "src",
      enabled: false,
    });
  });

  it("does not expose cached file-tree data for malformed runtime path", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.fileTree("scope-a"), {
      path: "",
      entries: [],
      truncated: null,
      tiers: {},
    });
    client.setQueryData(engineKeys.fileTree("scope-a", "src"), {
      path: "src",
      entries: [
        {
          path: "src/app.ts",
          node_id: "code:src/app.ts",
          kind: "file",
        },
      ],
      truncated: null,
      tiers: {},
    });

    const { result } = renderHook(
      () => useFileTree("scope-a", { path: "src" } as unknown as string),
      {
        wrapper: wrapper(client),
      },
    );
    const trimmed = renderHook(() => useFileTree(" scope-a ", " src "), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
    expect(trimmed.result.current.data?.path).toBe("src");
    expect(trimmed.result.current.data?.entries[0]?.path).toBe("src/app.ts");
  });

  it("does not expose cached filters vocabulary when no valid scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.filters(""), {
      relations: [],
      tiers: [],
      doc_types: ["cached"],
      feature_tags: [],
      kinds: [],
      date_bounds: undefined,
    } satisfies FiltersVocabulary);

    const noScope = renderHook(() => useFiltersVocabulary(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useFiltersVocabulary({ scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedView = renderHook(
      () => useFiltersVocabularyView({ scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
    expect(malformedView.result.current).toMatchObject({
      vocabulary: undefined,
      facetsLoading: true,
      docTypes: [],
      featureTags: [],
    });
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
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "no source files in this scope yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    expect(deriveFileTreeLevelView(undefined, false, true, retry)).toEqual({
      state: "error",
      entries: [],
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "no source files in this scope yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
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
      rows: [],
      truncated: null,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "no source files in this scope yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: null,
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
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
      rows: [{ entry, displayName: "main.ts" }],
      truncated,
      loadingMessage: "reading the worktree…",
      errorTitle: "code tree unavailable",
      retryLabel: "try again",
      emptyMessage: "no source files in this scope yet.",
      childLoadingMessage: "…",
      childErrorMessage: "could not list this directory.",
      truncationMessage: "more here (20) — expand a subdirectory to narrow.",
      childLoadingClassName:
        "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      retry,
    });
    expect(fileTreeChildStatusStyle(2)).toEqual({ paddingLeft: "1.75rem" });
  });

  it("derives file-tree row display names in the stores level view", () => {
    const entries = [
      {
        path: "src/components/",
        kind: "dir" as const,
        has_children: true,
        node_id: "code:src/components",
      },
      {
        path: "src/components/Button.tsx",
        kind: "file" as const,
        has_children: false,
        node_id: "code:src/components/Button.tsx",
      },
    ];

    expect(
      deriveFileTreeLevelView(
        { path: "src", entries, truncated: null, tiers: {} },
        false,
        false,
      ).rows.map((row) => row.displayName),
    ).toEqual(["components", "Button.tsx"]);
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

    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);
    expect(result.current.availability.loading).toBe(false);
    expect(graphRequests).toHaveLength(1);

    rerender({ lens: "status", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(2), ENGINE_WAIT);
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);

    rerender({ lens: "design", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(3), ENGINE_WAIT);
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);
  });

  it("forwards the canonical filter to the lineage wire on the same client path (unified-filter-plane D3)", async () => {
    // The timeline narrows by the canonical filter exactly as the graph does: the
    // active facet rides the SAME client path (engineClient.lineage) the app uses,
    // so a captured live request proves the wire shape (mock-mirrors-live-wire-shape).
    // No facet active -> no `filter=` param (the full set, one cache entry); a facet
    // active -> the URL-encoded JSON filter on the wire, a new bounded query.
    const scope = await liveScope();
    const lineageRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/lineage")) lineageRequests.push(input);
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result, rerender } = renderHook(
      (filter?: string) => useTimelineLineageView(scope, {}, filter),
      { wrapper: wrapper(client), initialProps: undefined as string | undefined },
    );

    await waitFor(() => expect(result.current.loading).toBe(false), ENGINE_WAIT);
    expect(lineageRequests).toHaveLength(1);
    expect(lineageRequests[0]).not.toContain("filter=");

    rerender(JSON.stringify({ doc_types: ["plan"] }));
    await waitFor(() => expect(lineageRequests).toHaveLength(2), ENGINE_WAIT);
    expect(lineageRequests[1]).toContain("filter=");
    expect(decodeURIComponent(lineageRequests[1]!)).toContain('"doc_types":["plan"]');
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

describe("useChangedFiles git availability boundary", () => {
  const statusWithoutGit: EngineStatus = {
    ok: true,
    nodes: 0,
    edges: 0,
    degradations: [],
    tiers: {
      structural: { available: true },
    },
  };
  const statusWithGit: EngineStatus = {
    ...statusWithoutGit,
    git: { branch: "main", dirty: true },
  };
  const cachedChangedFile: ChangedFile = {
    path: "src/stale.ts",
    code: " M",
    letter: "M",
    group: "modified",
    vault: false,
    adds: 4,
    dels: 1,
  };

  it("does not issue changed-file reads or expose cached rows when git is unavailable", async () => {
    const client = testQueryClient();
    const scope = "scope-without-git";
    client.setQueryData(engineKeys.status(), statusWithoutGit);
    client.setQueryData(engineKeys.gitChanges(scope), [cachedChangedFile]);
    const gitRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/status") || input.includes("/ops/git/numstat")) {
        gitRequests.push(input);
      }
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(() => useChangedFiles(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toMatchObject({
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gitRequests).toEqual([]);
    unmount();
  });

  it("does not issue changed-file reads for malformed scopes even when git is available", async () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.status(), statusWithGit);
    client.setQueryData(engineKeys.gitChanges(""), [cachedChangedFile]);
    const gitRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/ops/git/status") || input.includes("/ops/git/numstat")) {
        gitRequests.push(input);
      }
      return liveTransport(input, init);
    });

    const { result, unmount } = renderHook(
      () => useChangedFiles({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      loading: false,
      errored: false,
      files: [],
      codeFiles: [],
      documents: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gitRequests).toEqual([]);
    unmount();
  });

  it("keeps the changes overview on the degraded empty state with cached changed rows", () => {
    const client = testQueryClient();
    const scope = "scope-without-git";
    client.setQueryData(engineKeys.status(), statusWithoutGit);
    client.setQueryData(engineKeys.gitChanges(scope), [cachedChangedFile]);

    const { result, unmount } = renderHook(() => useChangesOverview(scope), {
      wrapper: wrapper(client),
    });

    expect(result.current).toMatchObject({
      degraded: true,
      hasChanges: false,
      hasFiles: false,
      hasDocuments: false,
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
    unmount();
  });

  it("normalizes malformed changes overview scope to the no-scope state", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.status(), statusWithGit);
    client.setQueryData(engineKeys.gitChanges(""), [cachedChangedFile]);

    const { result, unmount } = renderHook(
      () => useChangesOverview({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      noScope: true,
      clean: false,
      hasChanges: false,
      files: [],
      documents: [],
    });
    unmount();
  });
});

describe("git diff selector argument normalization", () => {
  const availableGit = { git: { branch: "main", dirty: true } };

  it("uses one trimmed stores-layer identity for git diff cache and wire inputs", () => {
    expect(
      normalizeGitDiffRequest(
        "  wt-1  ",
        "  .vault/plan.md  ",
        "  HEAD~1  ",
        "  HEAD  ",
      ),
    ).toEqual({
      scope: "wt-1",
      path: ".vault/plan.md",
      from: "HEAD~1",
      to: "HEAD",
    });

    expect(
      normalizeGitDiffRequest({ scope: "wt-1" }, ["src/app.ts"], 1, Number.NaN),
    ).toEqual({
      scope: null,
      path: null,
      from: null,
      to: null,
    });
  });

  it("bounds git diff cache and wire identities before reads", () => {
    const oversized = "x".repeat(GIT_QUERY_KEY_PART_MAX_CHARS + 1);

    expect(
      normalizeGitQueryKeyPart(` ${"x".repeat(GIT_QUERY_KEY_PART_MAX_CHARS)} `),
    ).toHaveLength(GIT_QUERY_KEY_PART_MAX_CHARS);
    expect(normalizeGitQueryKeyPart(oversized)).toBe("");
    expect(normalizeGitDiffRequest("wt-1", oversized, "HEAD~1", "HEAD")).toEqual({
      scope: "wt-1",
      path: null,
      from: "HEAD~1",
      to: "HEAD",
    });
    expect(canReadGitFileDiff("wt-1", oversized, availableGit)).toBe(false);
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        oversized,
        "HEAD",
        availableGit,
      ),
    ).toBe(false);
    expect(engineKeys.gitDiff("wt-1", oversized)).toEqual([
      ...engineKeys.all,
      "git-diff",
      "wt-1",
      "",
    ]);
  });

  it("disables live and historical diff reads for blank presentation values", () => {
    expect(canReadGitFileDiff("wt-1", "   ", availableGit)).toBe(false);
    expect(canReadGitFileDiff({ scope: "wt-1" }, ".vault/plan.md", availableGit)).toBe(
      false,
    );
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        "HEAD~1",
        "  ",
        availableGit,
      ),
    ).toBe(false);
    expect(
      canReadGitHistoricalFileDiff(
        "wt-1",
        ".vault/plan.md",
        "HEAD~1",
        { rev: "HEAD" },
        availableGit,
      ),
    ).toBe(false);
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

describe("engineKeys", () => {
  it("keys graph slices by the (scope, filter, as-of, granularity, lens, focus) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { structural: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { structural: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { structural: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { structural: false } });
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
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
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
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
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

  it("normalizes graph embedding query identity before keying semantic vectors", () => {
    expect(
      normalizeGraphEmbeddingsRequestIdentity(" wt-1 ", "design", " doc:plan "),
    ).toEqual({
      scope: "wt-1",
      lens: "design",
      focus: "doc:plan",
    });
    expect(
      normalizeGraphEmbeddingsRequestIdentity({ scope: "wt-1" }, "unknown", {
        id: "doc:plan",
      }),
    ).toEqual({
      scope: null,
      lens: "status",
      focus: null,
    });
  });

  it("does not expose cached semantic embeddings for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.graphEmbeddings("wt-1", "status", null), {
      embeddings: [{ node_id: "doc:cached", vector: [0.1, 0.2] }],
      generation: 7,
      tiers: { semantic: { available: true } },
      truncated: null,
      lens: "status",
    });

    const { result } = renderHook(
      () => useGraphEmbeddings({ scope: "wt-1" }, true, "status", null),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toMatchObject({
      loading: false,
      unavailable: false,
      available: false,
      embeddingCount: 0,
      generation: 0,
    });
    expect(result.current.embeddings.size).toBe(0);
    client.clear();
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
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
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
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
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
      engineKeys.events("wt-1", {}),
      engineKeys.history("wt-1", 20),
      engineKeys.prs("wt-1", "open"),
      engineKeys.issues("wt-1", "open"),
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
      ["engine", "ops-rag", "watcher", "wt-1"] as const,
      ["engine", "ops-rag", "readiness", "wt-1"] as const,
      ["engine", "ops-rag", "projects", "wt-1"] as const,
      ["engine", "ops-rag", "jobs", "wt-1", "job-1"] as const,
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
      engineKeys.gitHistoricalDiff(scope, ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.node(scope, nodeId),
      engineKeys.neighbors(scope, nodeId, 1),
      engineKeys.evidence(scope, nodeId),
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
      engineKeys.gitHistoricalDiff(otherScope, ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.events(otherScope, { from: "2026-01-01", to: "2026-01-31" }),
      engineKeys.diff(otherScope, 1_000, 2_000),
      engineKeys.lineage(otherScope, {}),
      engineKeys.stream(["backends"], undefined, otherScope),
      engineKeys.history(otherScope, 20),
      engineKeys.search(otherScope, "alpha", "vault"),
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

  it("normalizes git query key parts before cache identity construction", () => {
    expect(normalizeGitQueryKeyPart(" wt-1 ")).toBe("wt-1");
    expect(normalizeGitQueryKeyPart(null)).toBe("");
    expect(engineKeys.gitChanges(" wt-1 ")).toEqual(engineKeys.gitChanges("wt-1"));
    expect(engineKeys.gitDiff(" wt-1 ", " .vault/plan.md ")).toEqual(
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
    );
    expect(
      engineKeys.gitHistoricalDiff(" wt-1 ", " .vault/plan.md ", " HEAD~1 ", " HEAD "),
    ).toEqual(engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"));
  });

  it("normalizes vault mutation invalidation scope and node identity", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.content("wt-1", "doc:plan"),
      engineKeys.gitChanges("wt-1"),
      engineKeys.gitDiff("wt-1", ".vault/plan.md"),
      engineKeys.gitHistoricalDiff("wt-1", ".vault/plan.md", "HEAD~1", "HEAD"),
      engineKeys.history("wt-1", 20),
    ];
    const unaffectedKeys = [
      engineKeys.content(" wt-1 ", " doc:plan "),
      engineKeys.gitChanges("wt-2"),
      engineKeys.gitDiff("wt-2", ".vault/plan.md"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, " wt-1 ", " doc:plan ");

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("invalidates scoped generation reads after a vault mutation without a node id", () => {
    const client = testQueryClient();
    const scope = "wt-create";
    const otherScope = "wt-other";
    const nodeId = "doc:new-plan";
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.content(scope, nodeId),
      engineKeys.vaultTree(scope),
      engineKeys.fileTree(scope, ".vault", undefined),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
      engineKeys.history(scope, 20),
      engineKeys.search(scope, "new", "vault"),
      engineKeys.gitChanges(scope),
      engineKeys.gitDiff(scope, ".vault/plan/new-plan.md"),
      engineKeys.gitHistoricalDiff(scope, ".vault/plan/new-plan.md", "HEAD~1", "HEAD"),
    ];
    const unaffectedKeys = [
      engineKeys.content(otherScope, nodeId),
      engineKeys.history(otherScope, 20),
      engineKeys.gitChanges(otherScope),
      engineKeys.gitDiff(otherScope, ".vault/plan/new-plan.md"),
      engineKeys.gitHistoricalDiff(
        otherScope,
        ".vault/plan/new-plan.md",
        "HEAD~1",
        "HEAD",
      ),
      engineKeys.search(otherScope, "new", "vault"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, scope);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("falls back to global search invalidation when a vault mutation has no scope", () => {
    const client = testQueryClient();
    const affectedKeys = [
      engineKeys.status(),
      engineKeys.map(),
      engineKeys.search("wt-1", "alpha", "vault"),
      engineKeys.search("wt-2", "alpha", "vault"),
    ];
    const unaffectedKeys = [
      engineKeys.graph("wt-1", undefined, undefined, "document", "status", null),
      engineKeys.gitChanges("wt-1"),
      engineKeys.vaultTree("wt-1"),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateAfterVaultMutation(client, null);

    for (const key of affectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffectedKeys) {
      expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("normalizes editor body write intent before ops dispatch", () => {
    expect(
      normalizeSaveBodyArgs({
        nodeId: " doc:2026-06-18-plan ",
        scope: " wt-1 ",
        text: 42,
        baseBlobHash: null,
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:2026-06-18-plan",
      ref: "2026-06-18-plan",
      text: "",
      baseBlobHash: "",
    });
    expect(normalizeSaveBodyArgs({ nodeId: { id: "doc:bad" } })).toMatchObject({
      scope: null,
      nodeId: null,
      ref: null,
    });
  });

  it("normalizes frontmatter write intent before ops dispatch", () => {
    expect(
      normalizeSetFrontmatterArgs({
        nodeId: " doc:alpha ",
        scope: " wt-1 ",
        date: " 2026-06-20 ",
        tags: [" #plan ", "", 42, "#state"],
        related: [" [[a]] ", null, " [[b]] "],
        baseBlobHash: " hash-a ",
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:alpha",
      ref: "alpha",
      date: "2026-06-20",
      tags: ["#plan", "#state"],
      related: ["[[a]]", "[[b]]"],
      baseBlobHash: " hash-a ",
    });
  });

  it("normalizes create and rename write intent before ops dispatch", () => {
    expect(
      normalizeCreateDocArgs({
        scope: " wt-1 ",
        docType: " plan ",
        feature: " git-state ",
        title: " Boundary Audit ",
        related: [" alpha ", "", { stem: "bad" }],
      }),
    ).toEqual({
      scope: "wt-1",
      docType: "plan",
      feature: "git-state",
      title: "Boundary Audit",
      related: ["alpha"],
    });

    expect(
      normalizeRenameDocArgs({
        scope: " wt-1 ",
        nodeId: " doc:old-plan ",
        to: " new-plan ",
        expectedBlobHash: " hash-1 ",
      }),
    ).toEqual({
      scope: "wt-1",
      nodeId: "doc:old-plan",
      ref: "old-plan",
      to: "new-plan",
      expectedBlobHash: "hash-1",
    });
    expect(normalizeRenameDocArgs(null)).toEqual({
      scope: null,
      nodeId: null,
      ref: null,
      to: "",
      expectedBlobHash: undefined,
    });
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

  it("invalidates scoped semantic consumers from one helper", () => {
    const client = testQueryClient();
    const scope = "wt-1";
    const otherScope = "wt-2";
    const affectedKeys = [
      engineKeys.search(scope, "alpha", "vault"),
      engineKeys.search(scope, "beta", "code"),
      engineKeys.graphEmbeddings(scope, "status", null),
      engineKeys.graphEmbeddings(scope, "design", "doc:focus"),
    ];
    const unaffectedKeys = [
      engineKeys.status(),
      engineKeys.search(otherScope, "alpha", "vault"),
      engineKeys.graphEmbeddings(otherScope, "status", null),
      engineKeys.graph(scope, undefined, undefined, "document", "status", null),
    ];

    for (const key of affectedKeys) seedQuery(client, key);
    for (const key of unaffectedKeys) seedQuery(client, key);

    invalidateScopedSemanticReads(client, " wt-1 ");

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
  it("normalizes engine stream identity before query keys or subscriptions", () => {
    expect(normalizeEngineStreamChannel(" graph ")).toBe("graph");
    expect(normalizeEngineStreamChannel("fs")).toBeNull();
    expect(normalizeEngineStreamChannel(null)).toBeNull();
    expect(
      normalizeEngineStreamChannels([" git ", "graph", "backends", "git", "message"]),
    ).toEqual(["backends", "git", "graph"]);
    expect(normalizeEngineStreamSince(42.9)).toBe(42);
    expect(normalizeEngineStreamSince(-1)).toBeUndefined();
    expect(normalizeEngineStreamSince(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeEngineStreamScope(" wt-1 ")).toBe("wt-1");
    expect(normalizeEngineStreamScope("   ")).toBeUndefined();
    expect(
      normalizeEngineStreamIdentity([" git ", "backends", "git"], 10.2, " wt-1 "),
    ).toEqual({
      channels: ["backends", "git"],
      since: 10,
      scope: "wt-1",
    });
  });

  it("coalesces semantically identical stream query keys", () => {
    expect(engineKeys.stream(["git", "backends"], 10.8, " wt-1 ")).toEqual(
      engineKeys.stream([" backends ", "git", "git"], 10, "wt-1"),
    );
    expect(engineKeys.stream(["graph"], undefined, " wt-1 ")).toEqual([
      ...engineKeys.all,
      "stream",
      "graph",
      "live",
      "wt-1",
    ]);
    expect(engineKeys.stream(["fs", "message"], -1, "   ")).toEqual([
      ...engineKeys.all,
      "stream",
      "",
      "live",
      "active",
    ]);
  });

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

  it("normalizes backend-signal channels before deriving the refresh signature", () => {
    expect(normalizeBackendSignalChannel(" git ")).toBe("git");
    expect(normalizeBackendSignalChannel("backends")).toBe("backends");
    expect(normalizeBackendSignalChannel("graph")).toBeNull();
    expect(normalizeBackendSignalChannel(null)).toBeNull();

    expect(
      latestBackendSignalSignature([
        { channel: "graph", data: { generation: 2 } },
        { channel: " git ", data: { dirty: true } },
        { channel: "message", data: { ignored: true } },
      ]),
    ).toBe('backends:|git:{"dirty":true}');
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

  it("normalizes graph slice query identity before keying the central graph read", () => {
    expect(
      normalizeGraphSliceRequestIdentity(
        " wt-1 ",
        {
          tiers: { structural: false },
          date_range: { from: "2026-06-01", to: "2026-06-30" },
          text: " graph ",
        },
        " HEAD ",
        "feature",
        "design",
        " doc:plan ",
      ),
    ).toEqual({
      scope: "wt-1",
      filter: {
        tiers: { structural: false },
        date_range: { from: "2026-06-01", to: "2026-06-30" },
        text: "graph",
      },
      asOf: "HEAD",
      granularity: "feature",
      lens: "design",
      focus: "doc:plan",
    });

    expect(
      normalizeGraphSliceRequestIdentity(
        { scope: "wt-1" },
        { text: { value: "ignored" }, date_range: { from: "" } },
        Number.NaN,
        "unknown",
        "unknown",
        { id: "doc:plan" },
      ),
    ).toEqual({
      scope: null,
      filter: {},
      asOf: undefined,
      granularity: "document",
      lens: "status",
      focus: null,
    });
  });

  it("does not expose cached graph data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.graph(""), graphSlice());

    const { result } = renderHook(() => useGraphSlice(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached graph data for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(
      engineKeys.graph("wt-1", {}, undefined, "document", "status", null),
      graphSlice(),
    );

    const { result } = renderHook(
      () => useGraphSlice({ scope: "wt-1" }, {}, undefined, "document", "status", null),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    client.clear();
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

  it("does not expose cached salience graph data for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );
    client.setQueryData(
      engineKeys.graph("", {}, undefined, "document", "status", null),
      {
        nodes: [],
        edges: [],
        tiers: okTiers,
        lens: "design",
        salience_partial: true,
      } satisfies GraphSlice,
    );

    const { result } = renderHook(
      () => useSalienceSliceView({ scope: "scope-a" }, { text: "cached" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      lens: "status",
      loading: false,
      partial: false,
      degradedTiers: [],
      reasons: {},
    });
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

describe("deriveLocationAnchor", () => {
  it("keeps location empty-state copy and branch resolution in stores", () => {
    const git = deriveGitStatusView(
      statusWith({ branch: "git-main", dirty: true, ahead: 2, behind: 1 }),
      undefined,
      false,
    );

    expect(deriveLocationAnchor(null, undefined, git)).toMatchObject({
      path: null,
      emptyLabel: "no scope — pick a worktree first",
      emptyClassName: "px-fg-1 text-label text-ink-faint",
      branch: "git-main",
      mainLabel: null,
      mainClassName: "shrink-0 font-medium text-ink",
      branchClassName: "min-w-0 truncate font-medium text-accent-text",
      pathClassName: "truncate font-mono text-caption text-ink-faint",
      dirty: true,
      ahead: 2,
      behind: 1,
    });

    expect(
      deriveLocationAnchor(
        " scope-a ",
        {
          repositories: [
            {
              path: "/repo",
              branches: [],
              worktrees: [
                {
                  id: "scope-a",
                  path: "/repo/main",
                  branch: "map-main",
                  has_vault: true,
                  is_default: true,
                },
              ],
            },
          ],
          tiers: {},
        },
        git,
      ),
    ).toMatchObject({
      path: "scope-a",
      emptyLabel: null,
      branch: "map-main",
      isMain: true,
      mainLabel: "main",
      dirty: true,
    });
  });

  it("normalizes malformed location scopes to the no-scope anchor state", () => {
    const git = deriveGitStatusView(
      statusWith({ branch: "git-main", dirty: true, ahead: 2, behind: 1 }),
      undefined,
      false,
    );

    expect(
      deriveLocationAnchor({ scope: "scope-a" }, { repositories: [], tiers: {} }, git),
    ).toMatchObject({
      path: null,
      emptyLabel: "no scope — pick a worktree first",
      branch: "git-main",
      isMain: false,
      dirty: true,
      ahead: 2,
      behind: 1,
    });
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

    expect(view.noScope).toBe(false);
    expect(view.hasChanges).toBe(true);
    expect(view.hasFiles).toBe(true);
    expect(view.hasDocuments).toBe(true);
    expect(view.loading).toBe(false);
    expect(view.clean).toBe(false);
    expect(view.files.map((file) => file.path)).toEqual(["src/app.ts"]);
    expect(view.files[0]).toMatchObject({
      path: "src/app.ts",
      basename: "app.ts",
      nodeId: "code:src/app.ts",
      group: "modified",
      dotColor: "var(--color-state-stale)",
      rowClassName:
        "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      dotClassName: "size-2 shrink-0 rounded-full",
      basenameClassName: "min-w-0 flex-1 truncate font-mono text-[0.71875rem] text-ink",
      adds: 4,
      dels: 1,
      addsLabel: "4 added",
      delsLabel: "1 removed",
      addsClassName: "shrink-0 text-meta text-diff-add",
      delsClassName: "shrink-0 text-meta text-diff-remove",
      openArrowClassName: "shrink-0 text-body text-ink-faint",
    });
    expect(view.documents.map((file) => file.path)).toEqual([
      ".vault/adr/2026-06-18-x.md",
    ]);
    expect(view.documents[0]).toEqual({
      path: ".vault/adr/2026-06-18-x.md",
      title: "X",
      nodeId: "doc:2026-06-18-x",
      category: "adr",
      rowClassName:
        "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      fallbackDotClassName: "size-2 shrink-0 rounded-full bg-ink-faint",
      titleClassName: "min-w-0 flex-1 truncate text-[0.78125rem] text-ink",
      openArrowClassName: "shrink-0 text-body text-ink-faint",
    });
    expect(view.summary.total).toBe(2);
    expect(view.summaryLabels).toEqual({
      files: "1 file",
      documents: "1 document",
      additions: "+6",
      deletions: "−1",
    });
    expect(view.noScopeLabel).toBe("no scope — pick a worktree first");
    expect(view.filesSectionLabel).toBe("Changed files — open diff or source");
    expect(view.filesListAriaLabel).toBe("changed files");
    expect(view.documentsSectionLabel).toBe("Changed documents — open reader");
    expect(view.documentsListAriaLabel).toBe("changed documents");
    expect(view.noScopeClassName).toBe("text-label text-ink-faint");
    expect(view.rootClassName).toBe("space-y-fg-3 text-label");
    expect(view.summaryClassName).toBe("flex flex-wrap items-center gap-fg-1-5");
    expect(view.summaryPrimaryClassName).toBe("text-label font-medium text-ink-muted");
    expect(view.summaryDividerClassName).toBe("text-ink-faint");
    expect(view.summaryAdditionsClassName).toBe("text-meta text-diff-add");
    expect(view.summaryDeletionsClassName).toBe("text-meta text-diff-remove");
    expect(view.loadingClassName).toBe(
      "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
    );
    expect(view.degradedClassName).toBe(
      "rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted",
    );
    expect(view.errorRootClassName).toBe("flex items-center gap-fg-2");
    expect(view.errorTitleClassName).toBe("flex-1 text-label text-state-broken");
    expect(view.retryButtonClassName).toBe(
      "rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    );
    expect(view.sectionLabelClassName).toBe("mb-fg-1");
    expect(view.listClassName).toBe("space-y-fg-1");
    expect(view.cleanClassName).toBe("text-label text-ink-faint");
    expect(view.retry).toBe(retry);
  });

  it("prioritizes designed empty/loading/degraded/error states only when no rows exist", () => {
    const empty = deriveChangedFilesView([], false, false);

    expect(
      deriveChangesOverviewView({ ...availableGit, loading: true }, empty),
    ).toMatchObject({
      loading: true,
      clean: false,
      hasChanges: false,
      loadingLabel: "reading changes…",
    });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, degraded: true, dirty: false },
        empty,
      ),
    ).toMatchObject({
      degraded: true,
      clean: false,
      hasChanges: false,
      degradedLabel: "repository state unavailable",
    });
    expect(
      deriveChangesOverviewView(
        { ...availableGit, git: undefined, errored: true, dirty: false },
        empty,
      ),
    ).toMatchObject({
      errored: true,
      clean: false,
      hasChanges: false,
      errorTitle: "changes unavailable",
      retryLabel: "retry",
    });
    expect(deriveChangesOverviewView(availableGit, empty)).toMatchObject({
      clean: true,
      hasFiles: false,
      hasDocuments: false,
      cleanLabel: "working tree clean — no changes to review.",
    });
  });

  it("projects the no-scope display state for the rail renderer", () => {
    const empty = deriveChangedFilesView([], false, false);

    expect(deriveChangesOverviewView(availableGit, empty, null)).toMatchObject({
      noScope: true,
      clean: false,
      hasChanges: false,
      hasFiles: false,
      hasDocuments: false,
      noScopeLabel: "no scope — pick a worktree first",
    });
  });

  it("projects changed-file dot color from the git status group", () => {
    const changed = deriveChangedFilesView(
      [
        {
          path: "src/new.ts",
          code: "A ",
          letter: "A",
          group: "added",
          vault: false,
          adds: 1,
          dels: 0,
        },
        {
          path: "src/old.ts",
          code: "D ",
          letter: "D",
          group: "deleted",
          vault: false,
          adds: 0,
          dels: 2,
        },
        {
          path: "src/moved.ts",
          code: "R ",
          letter: "R",
          group: "renamed",
          vault: false,
          adds: 0,
          dels: 0,
        },
      ],
      false,
      false,
    );

    expect(
      deriveChangesOverviewView(availableGit, changed).files.map((file) => [
        file.group,
        file.dotColor,
      ]),
    ).toEqual([
      ["added", "var(--color-diff-add)"],
      ["deleted", "var(--color-diff-remove)"],
      ["renamed", "var(--color-diff-remove)"],
    ]);
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
      hasFiles: false,
      hasDocuments: false,
      files: [],
      documents: [],
      summary: {
        files: 0,
        documents: 0,
        additions: 0,
        deletions: 0,
        total: 0,
      },
      summaryLabels: {
        files: "0 files",
        documents: "0 documents",
        additions: "+0",
        deletions: "−0",
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

describe("history selector limit normalization", () => {
  it("uses the same bounded limit before history cache keys and wire reads", () => {
    expect(normalizeHistoryLimit(Number.NaN)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(normalizeHistoryLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_HISTORY_LIMIT);
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(20.9)).toBe(20);
    expect(normalizeHistoryLimit(MAX_HISTORY_LIMIT + 50)).toBe(MAX_HISTORY_LIMIT);
  });

  it("normalizes history commit rows before stores projections consume them", () => {
    expect(
      normalizeHistoryCommitForView({
        hash: "  abc12345  ",
        short_hash: "",
        subject: "  feat: normalize history  ",
        body: 42,
        ts: Number.NaN,
        node_ids: [" commit:abc12345 ", " doc:x ", "", "doc:x", 7],
      }),
    ).toEqual({
      hash: "abc12345",
      short_hash: "abc12345",
      subject: "feat: normalize history",
      body: "",
      ts: 0,
      node_ids: ["commit:abc12345", "doc:x"],
    });
    expect(normalizeHistoryCommitForView({ short_hash: "abc" })).toBeNull();
    expect(
      normalizeHistoryCommitsForView([
        null,
        {
          hash: " kept ",
          short_hash: " k ",
          subject: "",
          body: "",
          ts: 1,
          node_ids: [],
        },
      ]),
    ).toEqual([
      { hash: "kept", short_hash: "k", subject: "", body: "", ts: 1, node_ids: [] },
    ]);
    expect(normalizeHistoryCommitsForView(null)).toEqual([]);
  });
});

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
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-muted",
      emptyClassName: "text-label text-ink-faint",
      listRootClassName: "space-y-fg-1-5",
      listClassName: "space-y-fg-1-5",
      commitBodyClassName:
        "ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted",
      showMoreButtonClassName:
        "w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    });
    expect(view.commits).toHaveLength(1);
    expect(view.recentCommitRows).toEqual([
      {
        commit: view.commits[0],
        eventId: "commit:abc123",
        touchedNodeIds: ["doc:x", "code:src/x.ts"],
        selectable: true,
        hasBody: false,
        subjectLabel: "feat: x",
        rowAriaLabel: "commit abc123: feat: x",
        messageToggleLabel: expect.any(Function),
        ageLabel: "5m",
      },
    ]);
    expect(view.recentCommitRows[0]!.messageToggleLabel(false)).toBe(
      "expand message for abc123",
    );
    expect(view.recentCommitRows[0]!.messageToggleLabel(true)).toBe(
      "collapse message for abc123",
    );
    expect(view.canShowMore).toBe(false);
  });

  it("derives recent commit subject fallback and row labels in the stores view", () => {
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, [
        {
          hash: "empty-subject",
          short_hash: "empty",
          subject: "",
          body: "",
          ts: 1,
          node_ids: ["doc:x"],
        },
      ]),
      undefined,
      false,
      1_000_000,
    );

    expect(view.recentCommitRows[0]).toMatchObject({
      subjectLabel: "(no subject)",
      rowAriaLabel: "commit empty: (no subject)",
    });
  });

  it("normalizes malformed cached history rows before deriving recent rows", () => {
    const commits = [
      {
        hash: "  abcdef12  ",
        short_hash: "",
        subject: "  subject  ",
        body: 17,
        ts: Number.POSITIVE_INFINITY,
        node_ids: [" commit:abcdef12 ", " doc:x ", "doc:x", "", { id: "doc:y" }],
      },
      {
        hash: "",
        short_hash: "drop",
        subject: "dropped",
        body: "",
        ts: 1,
        node_ids: ["doc:dropped"],
      },
    ] as unknown as HistoryResponse["commits"];

    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
    );

    expect(view.commits).toEqual([
      {
        hash: "abcdef12",
        short_hash: "abcdef12",
        subject: "subject",
        body: "",
        ts: 0,
        node_ids: ["commit:abcdef12", "doc:x"],
      },
    ]);
    expect(view.recentCommitRows).toHaveLength(1);
    expect(view.recentCommitRows[0]).toMatchObject({
      eventId: "commit:abcdef12",
      touchedNodeIds: ["doc:x"],
      selectable: true,
      hasBody: false,
      subjectLabel: "subject",
      rowAriaLabel: "commit abcdef12: subject",
      ageLabel: "",
    });
  });

  it("derives commit body expansion and bounded show-more state in the stores view", () => {
    const commits = Array.from({ length: 20 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: i === 0 ? "\n\nbody text\n" : "",
      ts: i,
      node_ids: [`commit:hash-${i}`],
    }));
    const view = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      20,
    );

    expect(view.canShowMore).toBe(true);
    expect(view.recentCommitRows[0].hasBody).toBe(true);
    expect(view.recentCommitRows[1].hasBody).toBe(false);

    const capped = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      200,
    );
    expect(capped.canShowMore).toBe(false);
  });

  it("projects recent-history visibility states in stores", () => {
    expect(deriveHistoryView(undefined, undefined, true)).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: false } }, []),
        undefined,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, []),
        undefined,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
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

  it("renders recent commit rows from the requested bounded history limit", () => {
    const commits = Array.from({ length: 45 }, (_, i) => ({
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
      20,
    );

    expect(view.commits).toHaveLength(45);
    expect(view.recentCommitRows).toHaveLength(20);
    expect(view.recentCommitRows.map((row) => row.eventId)).toEqual(
      commits.slice(0, 20).map((commit) => `commit:${commit.hash}`),
    );
    expect(view.recentCommitRows[0].touchedNodeIds).toEqual(["doc:touched-0"]);

    const expanded = deriveHistoryView(
      historyWith({ structural: { available: true } }, commits),
      undefined,
      false,
      1_000_000,
      40,
    );
    expect(expanded.recentCommitRows).toHaveLength(40);
  });

  it("bounds malformed history render limits at the projection seam", () => {
    const commits = Array.from({ length: MAX_HISTORY_LIMIT + 5 }, (_, i) => ({
      hash: `hash-${i}`,
      short_hash: `h${i}`,
      subject: `commit ${i}`,
      body: "",
      ts: i,
      node_ids: [],
    }));

    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        Number.POSITIVE_INFINITY,
      ).recentCommitRows,
    ).toHaveLength(DEFAULT_HISTORY_LIMIT);
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        -10,
      ).recentCommitRows,
    ).toHaveLength(1);
    expect(
      deriveHistoryView(
        historyWith({ structural: { available: true } }, commits),
        undefined,
        false,
        1_000_000,
        MAX_HISTORY_LIMIT + 100,
      ).recentCommitRows,
    ).toHaveLength(MAX_HISTORY_LIMIT);
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
    expect(view.loadingLabel).toBe("reading recent commits...");
    expect(view.unavailableLabel).toBe("recent history unavailable");
    expect(view.emptyLabel).toBe("no commits yet on this branch.");
    expect(view.showMoreLabel).toBe("Show more");
  });
});

describe("derivePRsView and deriveIssuesView", () => {
  const pr = (patch: Partial<PRsResponse["prs"][number]> = {}) => ({
    number: 42,
    title: "Centralize status rows",
    author: "octo",
    state: "OPEN",
    is_draft: false,
    url: "https://example.test/pr/42",
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T01:00:00Z",
    merged_at: null,
    review_decision: "",
    checks: { total: 3, passed: 3, failing: 0, pending: 0 },
    ...patch,
  });
  const issue = (patch: Partial<IssuesResponse["issues"][number]> = {}) => ({
    number: 7,
    title: "Harden state boundary",
    author: "octo",
    state: "OPEN",
    url: "https://example.test/issues/7",
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T01:00:00Z",
    labels: ["state", "ui", "extra", "hidden"],
    ...patch,
  });

  it("projects open PR row labels, checks, and state messages in stores", () => {
    const view = derivePRsView(
      { prs: [pr()], available: true, reason: null, tiers: {} },
      null,
      false,
      "open",
    );

    expect(view.loadingLabel).toBe("reading open PRs...");
    expect(view.emptyLabel).toBe("no open pull requests");
    expect(view.unavailableLabel).toBe(
      "pull requests unavailable - GitHub not reachable",
    );
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-faint",
      emptyClassName: "text-label text-ink-faint",
      listClassName: "space-y-fg-1-5",
    });
    expect(view.rows[0]).toMatchObject({
      numberLabel: "#42",
      titleLabel: "Centralize status rows",
      stateLabel: "open",
      stateTone: "accent",
      icon: "pull-request",
      iconTone: "accent",
      iconToneClass: "text-accent",
      authorLabel: "octo",
      checksLabel: "checks",
      checksTone: "active",
      checksToneClass: "text-state-active",
      mergedLabel: null,
    });
  });

  it("projects merged and draft PR rows without app-layer branching", () => {
    expect(
      derivePRsView(
        {
          prs: [
            pr({
              is_draft: true,
              checks: { total: 2, passed: 0, failing: 1, pending: 1 },
            }),
          ],
          available: true,
          reason: null,
          tiers: {},
        },
        null,
        false,
        "open",
      ).rows[0],
    ).toMatchObject({
      stateLabel: "draft",
      stateTone: "neutral",
      iconTone: "faint",
      iconToneClass: "text-ink-faint",
      checksLabel: "1 failing",
      checksTone: "broken",
      checksToneClass: "text-state-broken",
    });

    const merged = derivePRsView(
      {
        prs: [pr({ merged_at: "2026-06-18T01:00:00Z", checks: null })],
        available: true,
        reason: null,
        tiers: {},
      },
      null,
      false,
      "merged",
    );

    expect(merged.loadingLabel).toBe("reading recent PRs...");
    expect(merged.emptyLabel).toBe("no recently-merged pull requests");
    expect(merged.rows[0]).toMatchObject({
      icon: "merged",
      iconTone: "muted",
      iconToneClass: "text-ink-muted",
      stateLabel: "merged",
      stateTone: "neutral",
      checksLabel: null,
      checksToneClass: null,
      mergedLabel: "merged",
    });
  });

  it("projects unavailable PR and issue messages from capability-local reasons", () => {
    expect(
      derivePRsView(
        { prs: [pr()], available: false, reason: "gh auth missing", tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      available: false,
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
      prs: [],
      rows: [],
      unavailableLabel: "gh auth missing",
    });

    expect(
      deriveIssuesView(
        { issues: [issue()], available: false, reason: "gh unavailable", tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      available: false,
      showLoading: false,
      showUnavailable: true,
      showEmpty: false,
      showList: false,
      issues: [],
      rows: [],
      unavailableLabel: "gh unavailable",
    });
  });

  it("projects issue row labels and capped issue chips in stores", () => {
    const view = deriveIssuesView(
      { issues: [issue()], available: true, reason: null, tiers: {} },
      null,
      false,
    );

    expect(view.loadingLabel).toBe("reading open issues...");
    expect(view.emptyLabel).toBe("no open issues");
    expect(view.unavailableLabel).toBe("issues unavailable - GitHub not reachable");
    expect(view).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: false,
      showList: true,
      loadingClassName:
        "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      unavailableClassName: "text-label text-ink-faint",
      emptyClassName: "text-label text-ink-faint",
      listClassName: "space-y-fg-1-5",
    });
    expect(view.rows[0]).toMatchObject({
      numberLabel: "#7",
      titleLabel: "Harden state boundary",
      authorLabel: "octo",
      labels: ["state", "ui", "extra"],
    });
  });

  it("projects PR and issue loading and empty visibility states in stores", () => {
    expect(derivePRsView(undefined, null, true, "open")).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      derivePRsView({ prs: [], available: true, reason: null, tiers: {} }, null, false),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
    expect(deriveIssuesView(undefined, null, true)).toMatchObject({
      showLoading: true,
      showUnavailable: false,
      showEmpty: false,
      showList: false,
    });
    expect(
      deriveIssuesView(
        { issues: [], available: true, reason: null, tiers: {} },
        null,
        false,
      ),
    ).toMatchObject({
      showLoading: false,
      showUnavailable: false,
      showEmpty: true,
      showList: false,
    });
  });

  it("projects status-tab section headers and count receipts in stores", () => {
    expect(
      deriveStatusTabSectionsView({
        openPlans: 2,
        openPrs: 0,
        openIssues: 4,
      }),
    ).toEqual({
      openPlans: { id: "open-plans", title: "Open plans", count: 2 },
      openPrs: { id: "open-prs", title: "Open PRs", count: undefined },
      openIssues: { id: "open-issues", title: "Open issues", count: 4 },
      recentPrs: { id: "recent-prs", title: "Recent PRs" },
      recentCommits: { id: "recent-commits", title: "Recent commits" },
    });
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
    expect(view.planRows).toHaveLength(1);
    expect(view.planRows[0]).toMatchObject({
      artifact: view.plans[0],
      nodeId: "doc:2026-06-14-x-plan",
      titleLabel: "x plan",
      modifiedAt: undefined,
      phaseLabel: "execute",
      tierLabel: "L3",
      tierAriaLabel: "tier L3",
      openAriaLabel: "open plan x plan in the reader",
      selectAriaLabel: "select plan x plan on the stage",
      showProgress: true,
      progressDone: 2,
      progressTotal: 5,
      progressTextLabel: "2/5",
      progressLabel: "x plan completion",
      progressPercentLabel: "40%",
    });
    expect(view.planRows[0]!.toggleLabel(false)).toBe("expand steps for x plan");
    expect(view.planRows[0]!.toggleLabel(true)).toBe("collapse steps for x plan");
    expect(view.adrs.map((artifact) => artifact.node_id)).toEqual([
      "doc:2026-06-14-x-adr",
    ]);
    expect(view.adrRows).toEqual([
      {
        artifact: view.adrs[0],
        nodeId: "doc:2026-06-14-x-adr",
        titleLabel: "x adr",
        modifiedAt: undefined,
        selectAriaLabel: "ADR x adr, status proposed",
        statusLabel: "proposed",
        featureLabel: null,
        showStatusPlaceholder: false,
        statusPlaceholderLabel: "status pending",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        iconClassName: "shrink-0 text-ink-faint",
        bodyClassName: "min-w-0 flex-1",
        headingClassName: "flex items-center gap-fg-1-5",
        titleClassName: "min-w-0 truncate text-body text-ink",
        statusPlaceholderClassName:
          "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint",
        metaClassName: "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
      },
    ]);
    expect(view.planIds).toEqual(["doc:2026-06-14-x-plan"]);
    expect([...view.occupiedPhases]).toEqual(["execute", "adr"]);
    expect(view.count).toBe(2);
    expect(view.workSurfaceState).toBe("list");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(true);
    expect(view.liveMessage).toBe("2 in-flight items");
    expect(view.workStatusTitle).toBe("2 in-flight items");
    expect(view.workStatusDetail).toBe("");
    expect(view.openPlansStatusLabel).toBe("1 plan in flight");
    expect(view.workSurfaceAriaLabel).toBe("work pipeline status");
    expect(view.workStatusSectionClassName).toBe(
      "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted",
    );
    expect(view.workListSectionClassName).toBe("space-y-fg-2 text-body");
    expect(view.workLiveRegionClassName).toBe("sr-only");
    expect(view.workStatusIconClassName).toBe("text-ink-faint");
    expect(view.workStatusTitleClassName).toBe("font-medium text-ink");
    expect(view.workStatusDetailClassName).toBe("text-ink-faint");
    expect(view.workListAriaLabel).toBe("in-flight pipeline work");
    expect(view.workListClassName).toBe("space-y-fg-1");
    expect(view.workTabbablePlanId).toBe("doc:2026-06-14-x-plan");
    expect(view.workTabbableAdrId).toBeNull();
  });

  it("derives WorkTab ADR row labels from pipeline artifacts", () => {
    const view = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:adr-with-feature",
          stem: "adr-with-feature",
          title: "`Feature` ADR",
          doc_type: "adr",
          status: "accepted",
          phase: "adr",
          feature_tags: ["graph"],
          dates: { modified: "2026-06-18T00:00:00Z" },
        },
      ],
      false,
    );

    expect(view.adrRows).toEqual([
      {
        artifact: view.adrs[0],
        nodeId: "doc:adr-with-feature",
        titleLabel: "Feature ADR",
        modifiedAt: "2026-06-18T00:00:00Z",
        selectAriaLabel: "ADR Feature ADR, status accepted",
        statusLabel: "accepted",
        featureLabel: "graph",
        showStatusPlaceholder: false,
        statusPlaceholderLabel: "status pending",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        iconClassName: "shrink-0 text-ink-faint",
        bodyClassName: "min-w-0 flex-1",
        headingClassName: "flex items-center gap-fg-1-5",
        titleClassName: "min-w-0 truncate text-body text-ink",
        statusPlaceholderClassName:
          "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint",
        metaClassName: "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
      },
    ]);
    expect(view.workTabbablePlanId).toBeNull();
    expect(view.workTabbableAdrId).toBe("doc:adr-with-feature");
  });

  it("reports degraded when the structural tier is explicitly unavailable", () => {
    const view = derivePipelineStatusView(structuralDown, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
    expect(view.reasons.structural).toBe("vault index rebuilding");
    // While degraded the projection is not trusted: no stale list is rendered.
    expect(view.artifacts).toEqual([]);
    expect(view.plans).toEqual([]);
    expect(view.planRows).toEqual([]);
    expect(view.adrs).toEqual([]);
    expect(view.planIds).toEqual([]);
    expect(view.workTabbablePlanId).toBeNull();
    expect(view.workTabbableAdrId).toBeNull();
    expect(view.count).toBe(0);
    expect(view.workSurfaceState).toBe("degraded");
    expect(view.showWorkDegraded).toBe(true);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("pipeline status unavailable");
    expect(view.workStatusTitle).toBe("pipeline status unavailable");
    expect(view.workStatusDetail).toBe(
      "the pipeline read is degraded — vault index rebuilding",
    );
    expect(view.openPlansStatusLabel).toBe("pipeline status unavailable");
  });

  it("carries the designed degraded fallback copy when the tier reason is absent", () => {
    const view = derivePipelineStatusView(
      { structural: { available: false } },
      artifacts,
      false,
    );
    expect(view.workStatusTitle).toBe("pipeline status unavailable");
    expect(view.workStatusDetail).toBe(
      "the pipeline read is degraded; in-flight work will appear here once it recovers",
    );
  });

  it("derives status-tab plan row labels from plan artifacts", () => {
    const view = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:backtick-plan",
          stem: "backtick-plan",
          title: "`Backtick` plan",
          doc_type: "plan",
          phase: "plan",
        },
      ],
      false,
    );

    expect(view.planRows[0]).toMatchObject({
      nodeId: "doc:backtick-plan",
      titleLabel: "Backtick plan",
      modifiedAt: undefined,
      phaseLabel: "plan",
      tierLabel: null,
      tierAriaLabel: null,
      openAriaLabel: "open plan Backtick plan in the reader",
      selectAriaLabel: "select plan Backtick plan on the stage",
      showProgress: false,
      progressDone: 0,
      progressTotal: 0,
      progressTextLabel: "0/0",
      progressLabel: "Backtick plan completion",
      progressPercentLabel: null,
    });
    expect(view.planRows[0]!.toggleLabel(false)).toBe("expand steps for Backtick plan");
  });

  it("derives the WorkTab roving tab stop from the first plan, then first ADR", () => {
    const adrOnly = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:2026-06-14-x-adr",
          stem: "2026-06-14-x-adr",
          title: "x adr",
          doc_type: "adr",
          status: "proposed",
          phase: "adr",
        },
      ],
      false,
    );

    expect(adrOnly.workTabbablePlanId).toBeNull();
    expect(adrOnly.workTabbableAdrId).toBe("doc:2026-06-14-x-adr");
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
    expect(view.workSurfaceState).toBe("loading");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(true);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("loading in-flight work");
    expect(view.workStatusTitle).toBe("reading in-flight work…");
    expect(view.workStatusDetail).toBe("");
    expect(view.workStatusSectionClassName).toBe(
      "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint",
    );
    expect(view.workStatusTitleClassName).toBe("animate-pulse-live");
    expect(view.openPlansStatusLabel).toBe("reading in-flight work…");
  });

  it("carries the designed empty-state copy from the stores layer", () => {
    const view = derivePipelineStatusView(structuralUp, [], false);
    expect(view.workSurfaceState).toBe("empty");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(true);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("no in-flight work");
    expect(view.workStatusTitle).toBe("no work in flight on this branch");
    expect(view.workStatusDetail).toBe(
      "no in-flight pipeline work in the current scope; active ADRs and plans will appear here as they advance.",
    );
    expect(view.openPlansStatusLabel).toBe("no plans in flight on this branch");
  });

  it("does not expose cached pipeline data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.pipeline(""), {
      artifacts,
      tiers: structuralUp,
    });
    client.setQueryData(engineKeys.pipeline("scope-a", "HEAD"), {
      artifacts,
      tiers: structuralUp,
    });

    expect(normalizePipelineStatusRequestIdentity(" scope-a ", " HEAD ")).toEqual({
      scope: "scope-a",
      asOf: "HEAD",
    });
    expect(
      normalizePipelineStatusRequestIdentity({ scope: "scope-a" }, Number.NaN),
    ).toEqual({
      scope: null,
      asOf: undefined,
    });

    const { result } = renderHook(() => usePipelineStatus(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => usePipelineStatus({ scope: "scope-a" }, "HEAD"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });
});

describe("derivePlanSummaryView (plan card metadata from the engine summary)", () => {
  it("maps the served state + counts to presentation, % over served counts", () => {
    const view = derivePlanSummaryView({
      wave_count: 3,
      phase_count: 8,
      step_count: 21,
      done_count: 10,
      plan_state: "in-progress",
    });
    expect(view.hasStructure).toBe(true);
    expect(view.stateLabel).toBe("In progress");
    expect(view.tone).toBe("active");
    expect(view.percent).toBe(48); // round(10/21*100)
    expect(view.percentLabel).toBe("48%");
    expect(view).toMatchObject({
      waveCount: 3,
      phaseCount: 8,
      stepCount: 21,
      doneCount: 10,
    });
  });

  it("derives the percentage from the TRUE counts even when the interior truncated", () => {
    // The summary carries the pre-truncation totals, so the card % is honest where
    // the old client-side count over the served slice would have been wrong.
    const view = derivePlanSummaryView({
      wave_count: 4,
      phase_count: 40,
      step_count: 9001,
      done_count: 4500,
      plan_state: "in-progress",
    });
    expect(view.percent).toBe(Math.round((4500 / 9001) * 100));
    expect(view.stepCount).toBe(9001);
  });

  it("treats a finished plan and a no-step plan honestly", () => {
    const finished = derivePlanSummaryView({
      wave_count: 0,
      phase_count: 2,
      step_count: 6,
      done_count: 6,
      plan_state: "finished",
    });
    expect(finished.stateLabel).toBe("Finished");
    expect(finished.tone).toBe("complete");
    expect(finished.percentLabel).toBe("100%");

    const empty = derivePlanSummaryView({
      wave_count: 0,
      phase_count: 0,
      step_count: 0,
      done_count: 0,
      plan_state: null,
    });
    // No steps → no fake bar/percentage; falls back to the "Not started" label.
    expect(empty.hasStructure).toBe(false);
    expect(empty.percent).toBeNull();
    expect(empty.percentLabel).toBeNull();
    expect(empty.stateLabel).toBe("Not started");
    expect(empty.tone).toBe("pending");
  });
});

describe("derivePlanInteriorView (step-tree rollup + truncation, W01.P02.S11)", () => {
  it("passes through the engine-served rollups across the L3 wave/phase shape", () => {
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
              rollup: { done: 2, total: 3 },
            },
          ],
          rollup: { done: 2, total: 3 },
        },
      ],
      phases: [],
      steps: [],
      summary: {
        wave_count: 1,
        phase_count: 1,
        step_count: 3,
        done_count: 2,
        plan_state: "in-progress",
      },
      truncated: null,
    };
    const view = derivePlanInteriorView(interior, false);
    // Rollups are READ FROM THE WIRE, not re-counted client-side.
    expect(view.waves[0].phases[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.waves[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.hasUngroupedSteps).toBe(false);
    // The plan-level rollup comes from the engine summary.
    expect(view.rollup).toEqual({ done: 2, total: 3 });
    expect(view.truncated).toBeNull();
  });

  it("takes the plan rollup from the engine summary, honest under truncation", () => {
    // The interior serialized only 2 of 9001 steps, but the engine summary counts
    // the TRUE pre-truncation totals — so the plan rollup is NOT the undercount the
    // old client-side `rollupSteps(served)` would have produced ({1, 2}).
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [],
      phases: [],
      steps: [
        {
          node_id: "x#S01",
          id: "S01",
          done: true,
          action: "wire the plan",
          exec_node_id: "doc:exec-a",
        },
        { node_id: "x#S02", id: "S02", done: false },
      ],
      summary: {
        wave_count: 0,
        phase_count: 0,
        step_count: 9001,
        done_count: 4500,
        plan_state: "in-progress",
      },
      truncated: { total_nodes: 9001, returned_nodes: 2000, reason: "node ceiling" },
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.rollup).toEqual({ done: 4500, total: 9001 });
    expect(view.empty).toBe(false);
    expect(view.hasUngroupedSteps).toBe(true);
    expect(view.listAriaLabel).toBe("plan steps");
    expect(view.steps).toMatchObject([
      {
        targetNodeId: "doc:exec-a",
        selectable: true,
        headingLabel: "wire the plan",
        rowAriaLabel: "step S01, open exec record",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus hover:bg-paper-sunken",
      },
      {
        targetNodeId: null,
        selectable: false,
        headingLabel: "S02",
        rowAriaLabel: "step S02, no exec record",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus cursor-default opacity-80",
      },
    ]);
    expect(view.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "node ceiling",
    });
    expect(view.truncatedMessage).toBe(
      "showing 2000 of 9001 nodes - this plan exceeds the interior ceiling; open it on the stage to see the full tree.",
    );
  });

  it("is the inert empty view while loading with no held interior", () => {
    const view = derivePlanInteriorView(undefined, true);
    expect(view.loading).toBe(true);
    expect(view.served).toBe(true);
    expect(view.empty).toBe(true);
    expect(view.loadingMessage).toBe("loading steps...");
    expect(view.placeholderMessage).toBe(
      "step tree pending - the plan interior is not yet served.",
    );
    expect(view.emptyMessage).toBe("no steps in this plan yet.");
    expect(view.listAriaLabel).toBe("plan steps");
    expect(view.truncatedMessage).toBeNull();
    expect(view.rollup).toEqual({ done: 0, total: 0 });
    expect(view.waves).toEqual([]);
    expect(view.hasUngroupedSteps).toBe(false);
  });

  it("does not expose cached plan interior data when the row is collapsed", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.planInterior("scope-a", ""), {
      interior: planInterior(),
      tiers: {},
    });
    client.setQueryData(engineKeys.planInterior("scope-a", "feature:state"), {
      interior: planInterior(),
      tiers: {},
    });
    client.setQueryData(engineKeys.planInterior("scope-a", "doc:plan"), {
      interior: planInterior(),
      tiers: {},
    });

    expect(normalizePlanInteriorRequestIdentity(" doc:plan ", " scope-a ")).toEqual({
      scope: "scope-a",
      planId: "doc:plan",
    });
    expect(
      normalizePlanInteriorRequestIdentity({ id: "doc:plan" }, { scope: "scope-a" }),
    ).toEqual({
      scope: null,
      planId: null,
    });
    expect(normalizePlanInteriorRequestIdentity("feature:state", "scope-a")).toEqual({
      scope: "scope-a",
      planId: null,
    });

    const { result } = renderHook(() => usePlanInterior(null, "scope-a"), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => usePlanInterior("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => usePlanInterior("doc:plan", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
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

  it("does not expose cached lineage data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.lineage("", {}), lineageSlice());
    client.setQueryData(
      engineKeys.lineage(
        "scope-a",
        { from: "2026-06-01", to: "2026-06-30" },
        "filter",
        "HEAD",
      ),
      lineageSlice(),
    );

    expect(
      normalizeTimelineLineageRequestIdentity(
        " scope-a ",
        { from: " 2026-06-01 ", to: " 2026-06-30 " },
        " filter ",
        " HEAD ",
      ),
    ).toEqual({
      scope: "scope-a",
      range: { from: "2026-06-01", to: "2026-06-30" },
      filter: "filter",
      asOf: "HEAD",
    });
    expect(
      normalizeTimelineLineageRequestIdentity(
        { scope: "scope-a" },
        { from: 1, to: { value: "2026-06-30" } },
        { filter: "ignored" },
        Number.NaN,
      ),
    ).toEqual({
      scope: null,
      range: { from: undefined, to: undefined },
      filter: undefined,
      asOf: undefined,
    });

    const { result } = renderHook(() => useTimelineLineage(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () =>
        useTimelineLineage(
          { scope: "scope-a" },
          { from: "2026-06-01", to: "2026-06-30" },
          "filter",
          "HEAD",
        ),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });
});

describe("deriveTimelineSurfaceChromeView (timeline status chrome)", () => {
  it("projects loading and auto-fit pending as the same quiet loading state", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: true,
        hasMarks: false,
        surface: "normal",
      }),
    ).toMatchObject({
      showLoading: true,
      // Loading is UI-only: the label is the screen-reader name of the shared
      // Skeleton, with no presentation className carried (state-mode-uniformity ADR).
      loadingLabel: "reading the timeline…",
      showEmpty: false,
      showError: false,
    });
  });

  it("projects empty copy from the surface state", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: false,
        surface: "lifecycle-sparse",
      }),
    ).toMatchObject({
      showEmpty: true,
      // Empty renders through the shared StateBlock; only the sentence is the
      // deriver's, presentation is the kit's (state-mode-uniformity ADR).
      emptyLabel: "lineage appears as documents gain dates",
    });

    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: false,
        surface: "normal",
      }),
    ).toMatchObject({
      showEmpty: true,
      emptyLabel: "no lineage in this range yet",
    });
  });

  it("projects degraded reconnecting and real error states distinctly", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: true,
        surface: "reconnecting",
      }),
    ).toMatchObject({
      // Degraded renders through the shared StateBlock inline notice; only the
      // sentence is the deriver's (state-mode-uniformity ADR).
      showDegraded: true,
      degradedLabel: "reconnecting — showing the last lineage",
      showError: false,
    });

    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: true,
        autoFitPending: false,
        hasMarks: false,
        surface: "reconnecting",
      }),
    ).toMatchObject({
      showDegraded: false,
      showError: true,
      errorLabel: "couldn’t load the timeline",
      errorClassName:
        "absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted",
      retryLabel: "retry",
      retryButtonClassName:
        "rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
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

describe("graph cache key (graph-filter-fetch-split: backend re-query, cache-instant repeat)", () => {
  it("is filter-sensitive, so a facet change is a distinct cache entry (engine re-queries the limited set)", () => {
    const scope = "scope-a";
    const keyAdr = engineKeys.graph(scope, { doc_types: ["adr"] });
    const keyPlan = engineKeys.graph(scope, { doc_types: ["plan"] });
    const keyNone = engineKeys.graph(scope);
    // A filter change keys a DIFFERENT entry — the engine re-queries the filtered
    // (limited) set; it is never one un-filtered "all data" entry the client masks.
    expect(keyAdr).not.toEqual(keyPlan);
    expect(keyAdr).not.toEqual(keyNone);
    // Only the filter segment differs; scope/granularity/lens/focus are identical.
    expect(keyAdr.slice(0, 3)).toEqual(keyPlan.slice(0, 3));
    expect(keyAdr.slice(4)).toEqual(keyPlan.slice(4));
  });

  it("is stable for identical filter content, so a repeated filter reuses the entry (no re-query)", () => {
    const scope = "scope-a";
    const keyA = engineKeys.graph(scope, { doc_types: ["adr"], statuses: ["draft"] });
    const keyRepeat = engineKeys.graph(scope, {
      doc_types: ["adr"],
      statuses: ["draft"],
    });
    // The same facet selection resolves to the SAME key — a toggle back to a
    // previously-seen filter is a cache hit (keepPreviousData keeps it from blanking).
    expect(keyRepeat).toEqual(keyA);
  });
});
