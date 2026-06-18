// TanStack Query wiring (W02.P05.S20, ADR G5.b).
//
// Every engine read flows through TanStack Query; cache keys carry
// (scope, filter, as-of) because the contract makes scope fully stateless —
// responses are cacheable by exactly that triple and two scopes never
// interfere. SSE consumption rides v5's streamedQuery over the engine's
// multiplexed stream, through the same client transport the mock engine
// implements.

import {
  experimental_streamedQuery as streamedQuery,
  keepPreviousData,
  type QueryClient,
  queryOptions,
  type UseQueryResult,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { debounce } from "../../platform/timing";
import type {
  ChangedFile,
  ContentResponse,
  ContentTruncated,
  DashboardDateRange,
  DashboardFilters,
  DashboardGraphBounds,
  DashboardPanelState,
  DashboardState,
  DashboardTimelineMode,
  DiscoverResponse,
  EmbeddingsResponse,
  EngineEdge,
  EngineNode,
  EngineStatus,
  FiltersVocabulary,
  FileTreeEntry,
  FileTreeResponse,
  GitFileDiff,
  GraphFilter,
  GraphGranularity,
  GraphSlice,
  HistoryCommit,
  HistoryResponse,
  InteriorStep,
  Issue,
  IssuesResponse,
  LineageArc,
  LineageNode,
  LineageSlice,
  MapResponse,
  NodeDetail,
  OpsResult,
  OpsWriteResult,
  PipelineArtifact,
  PlanInterior,
  PRsResponse,
  PullRequest,
  SessionState,
  SessionUpdate,
  SettingsSchema,
  SettingsState,
  SettingUpdate,
  TierAvailability,
  TiersBlock,
  VaultTreeResponse,
  WorkspaceRoot,
  WorkspacesState,
} from "./engine";
import {
  CANONICAL_TIERS,
  DEFAULT_SALIENCE_LENS,
  EngineError,
  adaptOpsWrite,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
} from "./engine";
import type { SalienceLens } from "./engine";
import { dispatchOps } from "./opsActions";
import { parseDocument, type Frontmatter } from "./parseDocument";
import {
  dashboardGraphQueryVariables,
  dashboardSelectionId,
  type DashboardGraphQueryVariables,
} from "./dashboardState";
import { isFreshDashboardGraphDefaultsState } from "./dashboardDefaults";
import {
  dashboardPlayheadForTimelineMode,
  type DashboardPlayhead,
} from "./dashboardTimeline";
import { queryClient as defaultQueryClient } from "./queryClient";
import {
  codeNodeIdFromPath,
  docNodeIdFromStem,
  featureTagFromNodeId,
  isRagRunning,
  mergeNumstat,
  parseGitNumstat,
  parseGitStatus,
  parseUnifiedDiff,
  stemFromPath,
} from "./liveAdapters";
import {
  CONSUMED_SETTING_KEYS,
  resolveGraphSettingsDefaults,
  resolveReduceMotionSetting,
  resolveEffectiveSetting,
  resolveSettings,
  settingEnumMembers,
  type GraphSettingsDefaults,
  type SettingsGroup,
} from "./settingsSelectors";
import { useViewStore } from "../view/viewStore";

// --- stable serialization for key parts -----------------------------------------

export const DEFAULT_DASHBOARD_SALIENCE_LENS = DEFAULT_SALIENCE_LENS;

/** Stable JSON for cache keys: object keys sorted, undefined dropped. */
export function stableKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, (_, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    }
    return v;
  });
}

/** The (scope, filter, as-of) key triple, the contract's cacheability unit. */
export const engineKeys = {
  all: ["engine"] as const,
  status: () => [...engineKeys.all, "status"] as const,
  map: () => [...engineKeys.all, "map"] as const,
  // The workspace registry is workspace-singular (one registry per engine), so a
  // single stable key. Registry mutations (select/add/forget) ride the session
  // mutation, which invalidates this key so the picker re-reads the
  // authoritative shape (dashboard-workspace-registry ADR).
  workspaces: () => [...engineKeys.all, "workspaces"] as const,
  vaultTree: (scope: string) => [...engineKeys.all, "vault-tree", scope] as const,
  // The code (worktree) file tree is fetched ONE directory level per call
  // (dashboard-code-tree ADR): the key folds (scope, dir-path, cursor) so each
  // expanded directory — and each page of a paginated level — is its own cache
  // entry, lazily fetched on first expansion and cached per scope. A wholesale
  // scope/workspace swap removes the whole `file-tree` subtree so the prior
  // corpus's levels never survive (mirrors the vault-tree cache discipline).
  fileTree: (scope: string, path?: string, cursor?: string) =>
    [...engineKeys.all, "file-tree", scope, path ?? "", cursor ?? ""] as const,
  filters: (scope: string) => [...engineKeys.all, "filters", scope] as const,
  dashboardState: (scope: string, backendSessionIdentity: string) =>
    [...engineKeys.all, "dashboard-state", scope, backendSessionIdentity] as const,
  graph: (
    scope: string,
    filter?: GraphFilter,
    asOf?: string | number,
    granularity?: "document" | "feature",
    lens?: SalienceLens,
    focus?: string | null,
  ) =>
    [
      ...engineKeys.all,
      "graph",
      scope,
      stableKey(filter),
      asOf ?? "live",
      granularity ?? "document",
      // The active lens and focus are identity-bearing (graph-node-salience ADR:
      // a lens switch is a re-query, a focus change runs a warm-started PPR pass):
      // two lenses/focuses carry different salience and must not share a cache
      // entry. Defaulted so the omitted case is the status-lens, no-focus key.
      lens ?? DEFAULT_SALIENCE_LENS,
      focus ?? "none",
    ] as const,
  // The dedicated bounded embedding read (graph-semantic-embeddings ADR D2):
  // keyed by (scope, lens, focus) — the SAME DOI selection unit `/graph/query`
  // uses, so the embedding set aligns with the served constellation node set.
  // Fetched LAZILY only on entering semantic mode (the hook's `enabled` gate),
  // and invalidated on a generation bump by the same `graph-embeddings` subtree
  // sweep the watcher rebuild drives — so a re-index re-fetches fresh vectors
  // (full re-fetch per generation for v1, ADR D8) rather than diffing stale ones.
  graphEmbeddings: (scope: string, lens?: SalienceLens, focus?: string | null) =>
    [
      ...engineKeys.all,
      "graph-embeddings",
      scope,
      lens ?? DEFAULT_SALIENCE_LENS,
      focus ?? "none",
    ] as const,
  node: (scope: string, id: string) => [...engineKeys.all, "node", scope, id] as const,
  // The read-only content fetch (review-rail-viewers ADR): keyed by (scope,
  // nodeId) — the contract's cacheability unit for a per-scope read. The
  // `blob_hash` in the response makes the entry content-addressable, but the KEY
  // stays (scope, nodeId) so reopening the same doc/file is a cache hit; a changed
  // blob is a fresh fetch the watcher invalidation drives. Bounded at the call
  // site (gcTime + a per-observer cap, per bounded-by-default-for-every-
  // accumulator): the viewer must not retain every opened file's bytes for the
  // whole session.
  content: (scope: string, nodeId: string) =>
    [...engineKeys.all, "content", scope, nodeId] as const,
  neighbors: (scope: string, id: string, depth: number) =>
    [...engineKeys.all, "neighbors", scope, id, depth] as const,
  evidence: (scope: string, id: string) =>
    [...engineKeys.all, "evidence", scope, id] as const,
  discover: (scope: string, id: string) =>
    [...engineKeys.all, "discover", scope, id] as const,
  events: (scope: string, range: { from?: string; to?: string }, bucket?: string) =>
    [...engineKeys.all, "events", scope, stableKey(range), bucket ?? "raw"] as const,
  // The bounded recent-commit history (status-overview ADR): keyed by (scope,
  // limit) — the contract's cacheability unit for a per-scope read, folding the
  // bounded limit so two limits never collide. Bounded at the call site (gcTime +
  // the single-entry-per-observer shape, per bounded-by-default-for-every-
  // accumulator): the rail never accumulates every scope's history for the session.
  history: (scope: string, limit: number) =>
    [...engineKeys.all, "history", scope, limit] as const,
  // GitHub work items (status-rail redesign): keyed by (scope, state) so open and
  // merged PRs — and open vs closed issues — never collide. Bounded the same way
  // (gcTime + single-entry-per-observer): the rail never accumulates every scope's
  // forge data for the session.
  prs: (scope: string, state: string) =>
    [...engineKeys.all, "prs", scope, state] as const,
  issues: (scope: string, state: string) =>
    [...engineKeys.all, "issues", scope, state] as const,
  // Search is scoped to a worktree corpus just like graph/tree reads. Fold the
  // scope into the key so the same query text on two worktrees cannot share
  // semantic results.
  search: (scope: string, query: string, target?: string) =>
    [...engineKeys.all, "search", scope, target ?? "vault", query] as const,
  stream: (channels: readonly string[], since?: number, scope?: string) =>
    [
      ...engineKeys.all,
      "stream",
      channels.join(","),
      since ?? "live",
      // Scope folds into the stream identity (W02.P04.S14 per-scope clock): two
      // scopes' streams carry different deltas on different clocks and must not
      // share a cache entry. Absent scope = the active-scope fallback ("active").
      scope ?? "active",
    ] as const,
  diff: (scope: string, from: string | number, to: string | number, filter?: string) =>
    [...engineKeys.all, "diff", scope, String(from), String(to), filter ?? ""] as const,
  // The bounded temporal-lineage projection (dashboard-timeline W02.P04.S22):
  // keyed by (scope, range, filter) — the contract's cacheability unit (range +
  // the engine-owned filter), so two date ranges or two filters never collide on
  // one cache entry, mirroring how `events` folds (range, bucket). `filter` is
  // the URL-encoded JSON filter string the route accepts; absent = no constraint.
  lineage: (
    scope: string,
    range: { from?: string; to?: string },
    filter?: string,
    asOf?: string | number,
  ) =>
    [
      ...engineKeys.all,
      "lineage",
      scope,
      stableKey(range),
      filter ?? "",
      asOf == null ? "live" : String(asOf),
    ] as const,
  // The in-flight pipeline projection (dashboard-pipeline-status W01.P02.S06):
  // (scope, as-of) — the same cacheability unit the graph slice uses, so a
  // historical playhead reads a distinct cache entry from the live view.
  pipeline: (scope: string, asOf?: string | number) =>
    [...engineKeys.all, "pipeline", scope, asOf ?? "live"] as const,
  // The bounded plan-container interior (dashboard-pipeline-status W01.P02.S07):
  // keyed by (scope, plan node id) — lazily fetched only when a plan row expands.
  planInterior: (scope: string, id: string) =>
    [...engineKeys.all, "plan-interior", scope, id] as const,
  // The session/settings surface is workspace-singular (not scope-keyed): one
  // active session and one settings document per workspace, so a single stable
  // key each. Mutations invalidate exactly these.
  session: () => [...engineKeys.all, "session"] as const,
  settings: () => [...engineKeys.all, "settings"] as const,
  // The settings schema registry (dashboard-settings): engine-owned and stable
  // for a workspace, so a single key. Read rarely, cached long; the dialog reads
  // it to render controls. Never invalidated by a value write (only the schema
  // CHANGING would, which requires a redeploy).
  settingsSchema: () => [...engineKeys.all, "settings-schema"] as const,
  // The read-only `/ops/git` reads (git-diff-browser ADR / Feature B). Keyed by
  // scope: the changed-files list (porcelain status + numstat) is one entry per
  // scope; the per-file diff folds the file path so each open file is its own
  // cache entry. Gated on the git rollup's presence in the status snapshot, so a
  // `git` SSE chunk refreshing `/status` re-gates them; bounded at the call site
  // (gcTime, single entry per observer).
  gitChanges: (scope: string) => [...engineKeys.all, "git-changes", scope] as const,
  gitDiff: (scope: string, path: string) =>
    [...engineKeys.all, "git-diff", scope, path] as const,
  gitHistoricalDiff: (scope: string, path: string, from: string, to: string) =>
    [...engineKeys.all, "git-histdiff", scope, path, from, to] as const,
};

export const SCOPED_ENGINE_QUERY_SUBTREES = [
  "vault-tree",
  "file-tree",
  "filters",
  "dashboard-state",
  "graph",
  "graph-embeddings",
  "node",
  "content",
  "neighbors",
  "evidence",
  "discover",
  "events",
  "history",
  "stream",
  "diff",
  "lineage",
  "pipeline",
  "plan-interior",
  "search",
  "git-changes",
  "git-diff",
  "git-histdiff",
  "ops-rag",
] as const;

export const GRAPH_GENERATION_QUERY_SUBTREES = [
  "vault-tree",
  // A watcher/SSE re-ingest (an external edit, a rename, or another client's
  // write) bumps the generation WITHOUT a local mutation, so the open reader/
  // editor's served bytes and the file-tree projection would otherwise go stale
  // (document-edit-hardening W03.P04.S10: the re-ingest signal must reach the open
  // editor). Invalidating these on a generation bump makes the open document and
  // the tree re-read the fresh content - the backend->frontend half of the
  // bidirectional coupling, for changes the frontend did not originate.
  "content",
  "file-tree",
  "filters",
  "dashboard-state",
  "graph",
  "graph-embeddings",
  "node",
  "neighbors",
  "evidence",
  "discover",
  "events",
  "diff",
  "lineage",
  "stream",
  "history",
  "pipeline",
  "plan-interior",
  "search",
] as const;

function scopedEngineSubtreeKey(
  subtree: (typeof SCOPED_ENGINE_QUERY_SUBTREES)[number],
) {
  return [...engineKeys.all, subtree] as const;
}

function removeScopedEngineQueries(queryClient: QueryClient): void {
  for (const subtree of SCOPED_ENGINE_QUERY_SUBTREES) {
    queryClient.removeQueries({ queryKey: scopedEngineSubtreeKey(subtree) });
  }
}

function invalidateScopedEngineQueries(queryClient: QueryClient): void {
  for (const subtree of SCOPED_ENGINE_QUERY_SUBTREES) {
    queryClient.invalidateQueries({ queryKey: scopedEngineSubtreeKey(subtree) });
  }
}

export function refreshAfterAcceptedScopeSwitch(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: engineKeys.map() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateScopedEngineQueries(queryClient);
}

export function refreshAfterAcceptedWorkspaceSwitch(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: engineKeys.map() });
  removeScopedEngineQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: engineKeys.map() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.workspaces() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateScopedEngineQueries(queryClient);
}

// --- read hooks --------------------------------------------------------------------

/** The right rail's recovery snapshot; /stream deltas refine it later.
 *  Polls every 8 s while errored so status consumers self-heal after engine-up
 *  transitions without requiring a page reload (mirrors useWorkspaceMap). */
export function useEngineStatus() {
  return useQuery({
    queryKey: engineKeys.status(),
    queryFn: () => engineClient.status(),
    refetchInterval: (query) => (query.state.status === "error" ? 8_000 : false),
  });
}

/** Stores-owned invalidation seam for the engine status recovery snapshot. */
export function useInvalidateEngineStatus(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  }, [queryClient]);
}

function withManualRetry<T extends { refetch: () => unknown }>(
  query: T,
): T & { retry: () => void } {
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}

const noopRetry = () => undefined;

export function useWorkspaceMap() {
  const query = useQuery({
    queryKey: engineKeys.map(),
    queryFn: () => engineClient.map(),
    // Poll every 8 s while in error state (engine not yet running / token
    // not yet on disk) so the WorktreePicker self-heals after startup without
    // requiring a page reload (task-7 live-engine resilience).
    refetchInterval: (query) => (query.state.status === "error" ? 8_000 : false),
  });
  return withManualRetry(query);
}

/** The map's default corpus-bearing worktree for cold-start active-scope fallback. */
export function mapDefaultScope(
  map: ReturnType<typeof useWorkspaceMap>,
): string | null {
  for (const repo of map.data?.repositories ?? []) {
    const preferred =
      repo.worktrees.find((w) => w.is_default && w.has_vault) ??
      repo.worktrees.find((w) => w.has_vault);
    if (preferred) return preferred.id;
  }
  return null;
}

export function deriveActiveScope(
  picked: string | null,
  persisted: string | null | undefined,
  fallback: string | null,
): string | null {
  if (picked) return picked;
  if (persisted) return persisted;
  return fallback;
}

/**
 * The active scope, restored on load (user-state-persistence W04.P09.S29).
 *
 * Pure READ hook — precedence, highest first:
 *  1. the user's explicit in-session pick (`viewStore.scope`);
 *  2. the persisted session `active_scope`;
 *  3. the workspace map's default corpus-bearing worktree.
 *
 * The one-shot cold-start persistence remains mounted from Stage; this hook is
 * stores-layer composition for UI consumers and has no side effects.
 */
export function useActiveScope(): string | null {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  const session = useSession();

  const persisted = session.data?.active_scope || null;
  const fallback = mapDefaultScope(map);

  return useMemo(
    () => deriveActiveScope(picked, persisted, fallback),
    [picked, persisted, fallback],
  );
}

/**
 * The workspace map's degradation truth, derived inside the stores layer so the
 * worktree switcher (chrome) never reads the raw `tiers` block
 * (dashboard-layer-ownership / worktree-switcher ADR "States"). The `/map`
 * projection is resolved by the engine's structural read of the
 * repository→branch→worktree tree, so the `structural` tier is what gates the
 * map's availability. Contract §2: a tier marked `available:false` OR absent
 * from the served block is a designed degraded state — absence is degradation,
 * not availability. The reason travels through both the success envelope
 * (`data.tiers`) and the error envelope (`EngineError.tiers`, transport-
 * preserved). Returns `degraded` plus the per-tier reasons for copy-tone
 * rendering; the switcher consumes this, never `map.data.tiers`.
 */
export type WorkspaceMapAvailability = TierAvailability;

const WORKSPACE_MAP_TIERS = ["structural"] as const;
export type WorkspaceMapSurfaceState = "loading" | "error" | "ready";

export function deriveWorkspaceMapAvailability(
  tiers: TiersBlock | undefined,
): WorkspaceMapAvailability {
  return readTierAvailability(tiers, WORKSPACE_MAP_TIERS);
}

export function tierAvailabilityReason(
  availability: Pick<TierAvailability, "degradedTiers" | "reasons">,
): string {
  return (
    availability.degradedTiers
      .map((tier) => availability.reasons[tier])
      .find(Boolean) ?? ""
  );
}

export function deriveWorkspaceMapSurfaceState(
  query: Pick<UseQueryResult<MapResponse>, "isPending" | "isError">,
  availability: WorkspaceMapAvailability,
): WorkspaceMapSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  return "ready";
}

/** Stores hook: the workspace map's degradation, read through the wire client so
 *  the worktree switcher consumes derived truth instead of the raw `tiers`
 *  block. Mirrors `useVaultTreeAvailability`. */
export function useWorkspaceMapAvailability(): WorkspaceMapAvailability {
  return deriveWorkspaceMapAvailability(tiersFromQuery(useWorkspaceMap()));
}

export interface WorkspaceMapSurfaceView {
  map: UseQueryResult<MapResponse> & { retry: () => void };
  availability: WorkspaceMapAvailability;
  state: WorkspaceMapSurfaceState;
}

/**
 * Stores selector for the worktree switcher surface: one subscription owns both
 * the map payload and the loading/error/degraded classification. Chrome renders
 * the returned state; it does not decide whether a failure is a tiers-reported
 * degradation or a bare transport error.
 */
export function useWorkspaceMapSurface(): WorkspaceMapSurfaceView {
  const map = useWorkspaceMap();
  const availability = deriveWorkspaceMapAvailability(tiersFromQuery(map));
  return {
    map,
    availability,
    state: deriveWorkspaceMapSurfaceState(map, availability),
  };
}

// --- workspace registry (dashboard-workspace-registry ADR) -----------------------
//
// The multi-workspace project-root registry, consumed through stores hooks so the
// WorkspacePicker (chrome) never fetches the engine or reads the raw `tiers`
// block (dashboard-layer-ownership). `useWorkspaces` is the single wire seam for
// `GET /workspaces`; registry mutation (select/add/forget) rides the existing
// `usePutSession` mutation (the config surface), which invalidates BOTH the
// session and the workspaces keys so the picker re-reads the authoritative shape.

/** Read the workspace registry — the registered roots + the active-workspace id.
 *  Polls every 8 s while in error state so the picker self-heals after engine
 *  startup without a page reload (mirrors `useWorkspaceMap`). */
export function useWorkspaces() {
  return useQuery({
    queryKey: engineKeys.workspaces(),
    queryFn: () => engineClient.workspaces(),
    refetchInterval: (query) => (query.state.status === "error" ? 8_000 : false),
  });
}

/**
 * The workspace registry's degradation truth, derived inside the stores layer so
 * the picker (chrome) never reads the raw `tiers` block (dashboard-layer-
 * ownership). The `/workspaces` enumeration is resolved by the engine's
 * structural read of each registered repository, so the `structural` tier gates
 * the registry's availability. Contract §2: a tier marked `available:false` OR
 * absent from the served block is a designed degraded state. The reason travels
 * through both the success envelope (`data.tiers`) and the error envelope
 * (`EngineError.tiers`). Mirrors `useWorkspaceMapAvailability`.
 */
export type WorkspacesAvailability = TierAvailability;

const WORKSPACES_TIERS = ["structural"] as const;

export function deriveWorkspacesAvailability(
  tiers: TiersBlock | undefined,
): WorkspacesAvailability {
  return readTierAvailability(tiers, WORKSPACES_TIERS);
}

/** Stores hook: the workspace registry's degradation, read through the wire
 *  client so the picker consumes derived truth instead of the raw `tiers`
 *  block. */
export function useWorkspacesAvailability(): WorkspacesAvailability {
  return deriveWorkspacesAvailability(tiersFromQuery(useWorkspaces()));
}

export type WorkspaceTitleState = "loading" | "ready";

export interface WorkspaceTitleView {
  state: WorkspaceTitleState;
  label: string;
  path: string | undefined;
  current: WorkspaceRoot | null;
}

export function deriveWorkspaceTitleView(
  data: WorkspacesState | undefined,
  loading: boolean,
): WorkspaceTitleView {
  if (loading) {
    return { state: "loading", label: "Project", path: undefined, current: null };
  }
  const current =
    data?.workspaces.find((root) => root.id === data.active_workspace) ??
    data?.workspaces[0] ??
    null;
  return {
    state: "ready",
    label: current?.label ?? "Project",
    path: current?.path,
    current,
  };
}

/**
 * Stores selector for the left-rail project title. The title surface reads the
 * workspace registry once and receives the active-or-first workspace label as an
 * interpreted view, rather than composing `useWorkspaces` + root selectors in
 * chrome.
 */
export function useWorkspaceTitleView(): WorkspaceTitleView {
  const workspaces = useWorkspaces();
  return deriveWorkspaceTitleView(workspaces.data, workspaces.isPending);
}

/** Stores selector: the active workspace's id (from the registry's
 *  `active_workspace`), or null when none is selected yet. The picker reads this
 *  to mark the current root — it never reads the raw response. */
export function useActiveWorkspace(): string | null {
  return useWorkspaces().data?.active_workspace ?? null;
}

/** Stores selector: the registered roots, or an empty list while loading /
 *  errored. Pure projection over the registry query for the picker. */
export function useWorkspaceRoots(): WorkspaceRoot[] {
  return useWorkspaces().data?.workspaces ?? [];
}

/**
 * The workspace-level wholesale-swap action (dashboard-workspace-registry ADR):
 * the stores-layer orchestration the WorkspacePicker invokes, exactly as the
 * worktree switcher invokes `setScope`. The control owns NO reset logic; this
 * hook owns the whole transition:
 *
 * 1. The active-workspace selection is durably persisted via `usePutSession`
 *    (the config surface). A rejected switch (unknown workspace → tiered 400)
 *    rejects the mutation before local workspace state or query caches move.
 * 2. `swapWorkspace` (the view store) runs from the accepted session response:
 *    the full 022 cross-store reset WIDENED to re-key the pin/lens stores to the
 *    accepted workspace and scope.
 * 3. The cached worktree SET plus every scoped read subtree are cleared/refetched:
 *    no prior project's node, graph, timeline, pipeline, browser, or git read
 *    survives the accepted project-level reset.
 *
 * Returns a `swap(workspace, scope)` callback plus the mutation handle so the
 * control can render pending / error honestly.
 */
export function useSwapWorkspace() {
  const queryClient = useQueryClient();
  const putSession = usePutSession();
  const swap = (workspace: string, scope: string | null) => {
    const intent = { workspace, scope };
    requestedWorkspaceSwitch = intent;
    const run = activeWorkspaceSwitchTail
      .catch(() => undefined)
      .then(async () => {
        const supersededBeforeWrite = supersededWorkspaceSwitch(intent);
        if (supersededBeforeWrite) throw supersededBeforeWrite;
        // Durably persist the active-workspace selection AND the new active
        // scope (the new project's default worktree) in one config write. Persisting
        // the workspace alone left the served/persisted active_scope dangling on the
        // prior project's worktree, so the browser kept showing the old corpus after
        // a switch (live verification finding H4). Local state moves only from the
        // accepted session response.
        try {
          const res = await putSession.mutateAsync(
            scope
              ? { active_workspace: workspace, active_scope: scope }
              : { active_workspace: workspace },
          );
          const supersededAfterWrite = supersededWorkspaceSwitch(intent);
          if (supersededAfterWrite) throw supersededAfterWrite;
          applyAcceptedWorkspaceSwitch(res, intent, queryClient);
          clearWorkspaceSwitchIntent(intent);
          return res;
        } catch (error) {
          const superseded = supersededWorkspaceSwitch(intent);
          if (superseded) throw superseded;
          clearWorkspaceSwitchIntent(intent);
          throw error;
        }
      });
    activeWorkspaceSwitchTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return { swap, mutation: putSession };
}

type WorkspaceSwitchIntent = {
  workspace: string;
  scope: string | null;
};

export class SupersededWorkspaceSwitchError extends Error {
  readonly requestedWorkspace: string;
  readonly requestedScope: string | null;
  readonly supersededByWorkspace: string;
  readonly supersededByScope: string | null;

  constructor(requested: WorkspaceSwitchIntent, supersededBy: WorkspaceSwitchIntent) {
    super(
      `workspace switch to ${requested.workspace}/${requested.scope ?? ""} was superseded by ${supersededBy.workspace}/${supersededBy.scope ?? ""}`,
    );
    this.name = "SupersededWorkspaceSwitchError";
    this.requestedWorkspace = requested.workspace;
    this.requestedScope = requested.scope;
    this.supersededByWorkspace = supersededBy.workspace;
    this.supersededByScope = supersededBy.scope;
  }
}

export function isSupersededWorkspaceSwitch(
  error: unknown,
): error is SupersededWorkspaceSwitchError {
  return error instanceof SupersededWorkspaceSwitchError;
}

let requestedWorkspaceSwitch: WorkspaceSwitchIntent | null = null;
let activeWorkspaceSwitchTail: Promise<void> = Promise.resolve();

function sameWorkspaceSwitchIntent(
  left: WorkspaceSwitchIntent | null,
  right: WorkspaceSwitchIntent,
): boolean {
  return (
    left !== null && left.workspace === right.workspace && left.scope === right.scope
  );
}

function supersededWorkspaceSwitch(
  intent: WorkspaceSwitchIntent,
): SupersededWorkspaceSwitchError | null {
  return requestedWorkspaceSwitch !== null &&
    !sameWorkspaceSwitchIntent(requestedWorkspaceSwitch, intent)
    ? new SupersededWorkspaceSwitchError(intent, requestedWorkspaceSwitch)
    : null;
}

function clearWorkspaceSwitchIntent(intent: WorkspaceSwitchIntent): void {
  if (sameWorkspaceSwitchIntent(requestedWorkspaceSwitch, intent)) {
    requestedWorkspaceSwitch = null;
  }
}

function applyAcceptedWorkspaceSwitch(
  session: SessionState,
  intent: WorkspaceSwitchIntent,
  queryClient: QueryClient,
): void {
  useViewStore
    .getState()
    .swapWorkspace(
      session.active_workspace ?? intent.workspace,
      session.active_scope || intent.scope,
    );
  // The PUT builds/warms the new scope server-side. Clear stale project reads
  // only after acceptance, then refetch now that the scope is warm so the
  // switch lands its corpus in-session (live verification finding H6).
  refreshAfterAcceptedWorkspaceSwitch(queryClient);
}

function seedSessionCache(queryClient: QueryClient, session: SessionState): void {
  queryClient.setQueryData(engineKeys.session(), session);
  void queryClient.invalidateQueries({ queryKey: engineKeys.session() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.workspaces() });
}

export class SupersededScopeSwitchError extends Error {
  readonly requestedScope: string;
  readonly supersededBy: string;

  constructor(requestedScope: string, supersededBy: string) {
    super(`scope switch to ${requestedScope} was superseded by ${supersededBy}`);
    this.name = "SupersededScopeSwitchError";
    this.requestedScope = requestedScope;
    this.supersededBy = supersededBy;
  }
}

export function isSupersededScopeSwitch(
  error: unknown,
): error is SupersededScopeSwitchError {
  return error instanceof SupersededScopeSwitchError;
}

let requestedActiveScope: string | null = null;
let activeScopeSwitchTail: Promise<void> = Promise.resolve();

function supersededScopeSwitch(scope: string): SupersededScopeSwitchError | null {
  return requestedActiveScope !== null && requestedActiveScope !== scope
    ? new SupersededScopeSwitchError(scope, requestedActiveScope)
    : null;
}

function applyAcceptedActiveScopeSwitch(
  session: SessionState,
  queryClient: QueryClient,
): void {
  seedSessionCache(queryClient, session);
  useViewStore.getState().setScope(session.active_scope);
  refreshAfterAcceptedScopeSwitch(queryClient);
}

/**
 * Stores-layer worktree scope switch: durable session persistence first, then the
 * local wholesale reset from the accepted active scope. Calls are serialized and
 * superseded requests are ignored at this seam, so a rapid A -> B click cannot
 * let A's later response re-apply stale graph/git/search scope after B became the
 * user's latest intent. Pure resolvers can call the imperative form; React
 * surfaces use `useSwitchActiveScope` to bind their provider client.
 */
export async function switchActiveScope(
  scope: string,
  queryClient: QueryClient = defaultQueryClient,
): Promise<SessionState> {
  requestedActiveScope = scope;
  const run = activeScopeSwitchTail
    .catch(() => undefined)
    .then(async () => {
      try {
        const session = await engineClient.putSession({ active_scope: scope });
        const superseded = supersededScopeSwitch(scope);
        if (superseded) throw superseded;
        applyAcceptedActiveScopeSwitch(session, queryClient);
        return session;
      } catch (error) {
        const superseded = supersededScopeSwitch(scope);
        if (superseded) throw superseded;
        throw error;
      }
    });
  activeScopeSwitchTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function useSwitchActiveScope(): (scope: string) => Promise<SessionState> {
  const queryClient = useQueryClient();
  return useCallback(
    (scope: string) => switchActiveScope(scope, queryClient),
    [queryClient],
  );
}

export function useVaultTree(scope: string | null) {
  const query = useQuery({
    queryKey: engineKeys.vaultTree(scope ?? ""),
    queryFn: () => engineClient.vaultTree(scope!),
    enabled: scope !== null,
  });
  return withManualRetry(query);
}

/**
 * The vault-tree's degradation truth, derived inside the stores layer so chrome
 * never reads the raw `tiers` block (dashboard-layer-ownership). Contract §2: a
 * tier marked `available:false` OR absent from the block is a designed degraded
 * state — absence is degradation, not availability. The reasons the engine
 * attached travel through both the success envelope (`data.tiers`) and the
 * error envelope (`EngineError.tiers`, preserved by the transport) so a
 * backend-down condition surfaces as designed degradation rather than a bare
 * error. Returns `degraded` plus the per-tier reasons for copy-tone rendering;
 * the sidebar consumes this, never `tree.data.tiers`.
 */
export type VaultTreeAvailability = TierAvailability;
export type VaultTreeSurfaceState = "loading" | "error" | "ready";

export function deriveVaultTreeAvailability(
  tiers: TiersBlock | undefined,
): VaultTreeAvailability {
  return readTierAvailability(tiers, CANONICAL_TIERS);
}

export function deriveVaultTreeSurfaceState(
  query: Pick<UseQueryResult<VaultTreeResponse>, "isPending" | "isError">,
  availability: VaultTreeAvailability,
): VaultTreeSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  return "ready";
}

/** Stores hook: the vault-tree degradation, read through the wire client so the
 *  sidebar consumes derived truth instead of the raw `tiers` block. Reads the
 *  FRESH error envelope's tiers over a stale held-success block via
 *  `tiersFromQuery` (degradation-is-read-from-tiers-not-guessed-from-errors). */
export function useVaultTreeAvailability(scope: string | null): VaultTreeAvailability {
  return deriveVaultTreeAvailability(tiersFromQuery(useVaultTree(scope)));
}

export interface VaultTreeSurfaceView {
  tree: UseQueryResult<VaultTreeResponse> & { retry: () => void };
  availability: VaultTreeAvailability;
  state: VaultTreeSurfaceState;
}

/**
 * Stores selector for the vault browser root surface. Degradation remains a
 * non-terminal banner for this surface, but the loading/error classification is
 * still stores-owned so the browser chrome does not branch on raw query flags.
 */
export function useVaultTreeSurface(scope: string | null): VaultTreeSurfaceView {
  const tree = useVaultTree(scope);
  const availability = deriveVaultTreeAvailability(tiersFromQuery(tree));
  return {
    tree,
    availability,
    state: deriveVaultTreeSurfaceState(tree, availability),
  };
}

// --- code (worktree) file tree (dashboard-code-tree ADR) -------------------------
//
// The read-only codebase file-tree browser's wire seam, consumed through these
// stores hooks so the CodeTree (chrome) never fetches the engine or reads the raw
// `tiers` block (dashboard-layer-ownership). The tree is fetched ONE directory
// level at a time: `useFileTree(scope, path)` reads the children of `path`
// (absent = the worktree root), so the rail expands a directory lazily on
// interaction and each level is its own (scope, path)-keyed cache entry — the
// rail never requests the whole tree (the bounded-read discipline,
// graph-queries-are-bounded-by-default). `enabled` is gated on a non-null scope
// AND, for a non-root level, on the level being requested (the directory was
// expanded), mirroring `useNodeNeighbors`'s lazy-on-id pattern.

export function useFileTree(scope: string | null, path?: string, enabled = true) {
  const query = useQuery({
    queryKey: engineKeys.fileTree(scope ?? "", path),
    queryFn: () => engineClient.fileTree({ scope: scope!, path }),
    enabled: scope !== null && enabled,
  });
  return withManualRetry(query);
}

/**
 * The file-tree's degradation truth, derived inside the stores layer so the code
 * mode (chrome) never reads the raw `tiers` block (dashboard-layer-ownership /
 * dashboard-code-tree ADR "States"). The code tree is a WORKTREE-ONLY capability
 * resolved by the engine's STRUCTURAL read of the working tree, so the
 * `structural` tier gates the code mode's availability: a remote-ref scope (no
 * working tree) or a scope whose structural tier is absent renders the code mode
 * as a designed degraded state, distinct from empty. Contract §2: a tier marked
 * `available:false` OR absent from a served block is degradation (absence is
 * degradation, not availability). The reason travels through both the success
 * envelope (`data.tiers`) and the error envelope (`EngineError.tiers`). Mirrors
 * `useVaultTreeAvailability`, scoped to the structural tier.
 */
export type FileTreeAvailability = TierAvailability;

const FILE_TREE_TIERS = ["structural"] as const;
export type FileTreeRootSurfaceState = "loading" | "error" | "degraded" | "ready";

export function deriveFileTreeAvailability(
  tiers: TiersBlock | undefined,
): FileTreeAvailability {
  return readTierAvailability(tiers, FILE_TREE_TIERS);
}

export function deriveFileTreeRootSurfaceState(
  query: Pick<UseQueryResult<FileTreeResponse>, "isPending" | "isError">,
  availability: FileTreeAvailability,
): FileTreeRootSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  if (availability.degraded) return "degraded";
  return "ready";
}

export type FileTreeLevelState = "loading" | "error" | "empty" | "ready";

export interface FileTreeLevelView {
  state: FileTreeLevelState;
  entries: FileTreeEntry[];
  truncated: FileTreeResponse["truncated"];
  retry: () => void;
}

export function deriveFileTreeLevelView(
  data: FileTreeResponse | undefined,
  loading: boolean,
  errored: boolean,
  retry: () => void = noopRetry,
): FileTreeLevelView {
  if (loading) {
    return { state: "loading", entries: [], truncated: null, retry };
  }
  if (errored) {
    return { state: "error", entries: [], truncated: null, retry };
  }
  const entries = data?.entries ?? [];
  return {
    state: entries.length === 0 ? "empty" : "ready",
    entries,
    truncated: data?.truncated ?? null,
    retry,
  };
}

/** Stores selector for one file-tree directory level. */
export function useFileTreeLevel(
  scope: string | null,
  path?: string,
  enabled = true,
): FileTreeLevelView {
  const level = useFileTree(scope, path, enabled);
  return useMemo(
    () =>
      deriveFileTreeLevelView(level.data, level.isPending, level.isError, level.retry),
    [level.data, level.isError, level.isPending, level.retry],
  );
}

/** Stores hook: the file-tree degradation for the worktree ROOT level, read
 *  through the wire client so the code mode consumes derived truth instead of the
 *  raw `tiers` block. The root level's tiers gate the whole code mode (a
 *  worktree-only capability); per-directory expansions inherit that availability. */
export function useFileTreeAvailability(scope: string | null): FileTreeAvailability {
  return deriveFileTreeAvailability(tiersFromQuery(useFileTree(scope)));
}

export interface FileTreeRootSurfaceView {
  rootLevel: FileTreeLevelView;
  availability: FileTreeAvailability;
  state: FileTreeRootSurfaceState;
}

/**
 * Stores selector for the code browser root surface. Unlike the vault browser,
 * file-tree structural degradation is terminal for code mode: a remote/bare
 * scope has no worktree directory hierarchy to render.
 */
export function useFileTreeRootSurface(scope: string | null): FileTreeRootSurfaceView {
  const rootQuery = useFileTree(scope);
  const availability = deriveFileTreeAvailability(tiersFromQuery(rootQuery));
  return {
    rootLevel: deriveFileTreeLevelView(
      rootQuery.data,
      rootQuery.isPending,
      rootQuery.isError,
      rootQuery.retry,
    ),
    availability,
    state: deriveFileTreeRootSurfaceState(rootQuery, availability),
  };
}

export function useFiltersVocabulary(scope: string | null) {
  return useQuery({
    queryKey: engineKeys.filters(scope ?? ""),
    queryFn: () => engineClient.filters(scope!),
    enabled: scope !== null,
  });
}

export interface FiltersVocabularyView {
  vocabulary: FiltersVocabulary | undefined;
  /** The enabled vocabulary query is in flight. */
  loading: boolean;
  /** Facet controls should show loading instead of "none in corpus". */
  facetsLoading: boolean;
  docTypes: string[];
  featureTags: string[];
  dateBounds: FiltersVocabulary["date_bounds"];
}

export function deriveFiltersVocabularyView(
  vocabulary: FiltersVocabulary | undefined,
  loading: boolean,
  awaitingScope: boolean,
): FiltersVocabularyView {
  return {
    vocabulary,
    loading,
    facetsLoading: awaitingScope || loading,
    docTypes: vocabulary?.doc_types ?? [],
    featureTags: vocabulary?.feature_tags ?? [],
    dateBounds: vocabulary?.date_bounds,
  };
}

/**
 * Stores selector for filter-vocabulary UI consumers. It prepares the data-driven
 * facet lists and loading semantics once so palette/sidebar chrome does not
 * branch on raw query flags or repeat optional field fallbacks.
 */
export function useFiltersVocabularyView(scope: string | null): FiltersVocabularyView {
  const query = useFiltersVocabulary(scope);
  const loading = scope !== null && query.isPending;
  const awaitingScope = scope === null;
  return useMemo(
    () => deriveFiltersVocabularyView(query.data, loading, awaitingScope),
    [query.data, loading, awaitingScope],
  );
}

export function dashboardStateSessionIdentity(
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): string {
  if (!session) return "session:pending";
  return stableKey({
    workspace: session.workspace,
    active_workspace: session.active_workspace,
    active_scope: session.active_scope,
  });
}

/**
 * The canonical frontend reader for shared dashboard state. Scope identifies the
 * dashboard snapshot; the backend session identity joins the key so a session
 * swap cannot serve another session's cached intent.
 */
export function useDashboardState(scope: string | null) {
  const session = useSession();
  const sessionIdentity = dashboardStateSessionIdentity(session.data);
  return useQuery<DashboardState>({
    queryKey: engineKeys.dashboardState(scope ?? "", sessionIdentity),
    queryFn: () => engineClient.dashboardState(scope!),
    enabled: scope !== null && session.isSuccess,
  });
}

export interface DashboardDateRangeView {
  fromMs: number;
  toMs: number;
  source: "dashboard" | "fallback";
}

function parseDashboardDateTick(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDashboardDateRangeView(
  dateRange: DashboardDateRange | undefined,
  fallback: Pick<DashboardDateRangeView, "fromMs" | "toMs">,
): DashboardDateRangeView {
  const fromMs = parseDashboardDateTick(dateRange?.from);
  const toMs = parseDashboardDateTick(dateRange?.to);
  if (fromMs !== null && toMs !== null) {
    return { fromMs, toMs, source: "dashboard" };
  }
  return { ...fallback, source: "fallback" };
}

/**
 * Stores selector for dashboard-owned date-range display. Timeline chrome passes
 * its visible-window fallback, but the canonical dashboard-state date range wins
 * when present so every date-range consumer renders the same intent.
 */
export function useDashboardDateRangeView(
  scope: string | null,
  fallback: Pick<DashboardDateRangeView, "fromMs" | "toMs">,
): DashboardDateRangeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardDateRangeView(dashboardState.data?.date_range, fallback),
    [dashboardState.data?.date_range, fallback],
  );
}

export interface DashboardRangeSelectView {
  dateRange: DashboardDateRange;
}

export function deriveDashboardRangeSelectView(
  state: Pick<DashboardState, "date_range"> | undefined,
): DashboardRangeSelectView {
  return {
    dateRange: state?.date_range ? { ...state.date_range } : {},
  };
}

/**
 * Stores selector for the timeline range selector. The component remains the
 * single writer for date-range intent, but committed band rendering reads one
 * stores-owned projection of canonical dashboard state.
 */
export function useDashboardRangeSelectView(
  scope: string | null,
): DashboardRangeSelectView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardRangeSelectView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardGraphDefaultsInitializationView {
  loaded: boolean;
  fresh: boolean;
}

export function deriveDashboardGraphDefaultsInitializationView(
  state: Pick<DashboardState, "filters" | "graph_granularity"> | undefined,
): DashboardGraphDefaultsInitializationView {
  return {
    loaded: state !== undefined,
    fresh: state ? isFreshDashboardGraphDefaultsState(state) : false,
  };
}

/**
 * Stores selector for settings graph-default initialization. Settings effects
 * orchestrate the one-time write, but dashboard-state readiness/freshness is
 * interpreted here so the app effect does not read raw dashboard payloads.
 */
export function useDashboardGraphDefaultsInitializationView(
  scope: string | null,
): DashboardGraphDefaultsInitializationView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardGraphDefaultsInitializationView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardFilterSummaryView {
  activeFilterCount: number;
  dateRangeLabel: string | null;
}

function dashboardDateRangeLabel(
  dateRange: DashboardDateRange | undefined,
): string | null {
  if (!dateRange?.from && !dateRange?.to) return null;
  return `${dateRange.from?.slice(0, 10) ?? "…"} → ${
    dateRange.to?.slice(0, 10) ?? "…"
  }`;
}

export function deriveDashboardFilterSummaryView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
): DashboardFilterSummaryView {
  const filters = state?.filters ?? {};
  return {
    activeFilterCount:
      (filters.doc_types?.length ?? 0) +
      (filters.feature_tags?.length ?? 0) +
      (filters.relations?.length ?? 0) +
      (filters.structural_state?.length ?? 0) +
      ((filters.text?.length ?? 0) > 0 ? 1 : 0),
    dateRangeLabel: dashboardDateRangeLabel(state?.date_range),
  };
}

/**
 * Stores selector for the stage filter toolbar summary. FilterBar is display
 * chrome; it renders the count/date labels without reinterpreting the dashboard
 * wire shape beside the canonical graph/date selectors.
 */
export function useDashboardFilterSummaryView(
  scope: string | null,
): DashboardFilterSummaryView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterSummaryView(dashboardState.data),
    [dashboardState.data],
  );
}

export type DashboardEditedWindow = "any" | "7d" | "30d" | "year";

const DAY_MS = 24 * 3600 * 1000;

export function dashboardEditedWindowRange(
  key: DashboardEditedWindow,
  now = Date.now(),
): DashboardDateRange {
  if (key === "any") return {};
  if (key === "7d") return { from: new Date(now - 7 * DAY_MS).toISOString() };
  if (key === "30d") return { from: new Date(now - 30 * DAY_MS).toISOString() };
  const year = new Date(now).getFullYear();
  return { from: new Date(Date.UTC(year, 0, 1)).toISOString() };
}

export function dashboardEditedWindowFromRange(
  range: DashboardDateRange,
  now = Date.now(),
): DashboardEditedWindow {
  if (!range.from && !range.to) return "any";
  if (range.to) return "any";
  const fromDay = range.from?.slice(0, 10);
  const dayFor = (offsetMs: number) =>
    new Date(now - offsetMs).toISOString().slice(0, 10);
  if (fromDay === dayFor(7 * DAY_MS)) return "7d";
  if (fromDay === dayFor(30 * DAY_MS)) return "30d";
  const yearStart = new Date(Date.UTC(new Date(now).getFullYear(), 0, 1))
    .toISOString()
    .slice(0, 10);
  return fromDay === yearStart ? "year" : "any";
}

function hasActiveDashboardDateRange(range: DashboardDateRange): boolean {
  return Boolean(range.from || range.to);
}

export interface DashboardFilterSidebarView {
  filters: DashboardFilters;
  dateRange: DashboardDateRange;
  docTypes: string[];
  featureTags: string[];
  editedWindow: DashboardEditedWindow;
  dateActive: boolean;
  anyActive: boolean;
}

export function deriveDashboardFilterSidebarView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
  now = Date.now(),
): DashboardFilterSidebarView {
  const filters = state?.filters ?? {};
  const dateRange = state?.date_range ?? {};
  const dateActive = hasActiveDashboardDateRange(dateRange);
  return {
    filters,
    dateRange,
    docTypes: filters.doc_types ?? [],
    featureTags: filters.feature_tags ?? [],
    editedWindow: dashboardEditedWindowFromRange(dateRange, now),
    dateActive,
    anyActive:
      (filters.doc_types?.length ?? 0) > 0 ||
      (filters.feature_tags?.length ?? 0) > 0 ||
      (filters.relations?.length ?? 0) > 0 ||
      (filters.structural_state?.length ?? 0) > 0 ||
      (filters.text?.length ?? 0) > 0 ||
      dateActive,
  };
}

/**
 * Stores selector for the full filter sidebar. The sidebar is app chrome: it
 * renders selected facets, active badges, and edited-window radios from one
 * interpreted dashboard-state view instead of reading raw filter/date payloads.
 */
export function useDashboardFilterSidebarView(
  scope: string | null,
): DashboardFilterSidebarView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterSidebarView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardTimelineModeView {
  mode: DashboardTimelineMode;
  timeTravel: boolean;
  opsDisabled: boolean;
  asOf?: number;
}

const LIVE_DASHBOARD_TIMELINE_MODE: DashboardTimelineMode = { kind: "live" };

export function deriveDashboardTimelineModeView(
  mode: DashboardTimelineMode | undefined,
): DashboardTimelineModeView {
  const resolved = mode ?? LIVE_DASHBOARD_TIMELINE_MODE;
  if (resolved.kind === "time-travel") {
    return {
      mode: resolved,
      timeTravel: true,
      opsDisabled: true,
      asOf: resolved.at,
    };
  }
  return {
    mode: resolved,
    timeTravel: false,
    opsDisabled: false,
    asOf: undefined,
  };
}

/**
 * Stores selector for the dashboard timeline mode. App chrome consumes this
 * interpreted view so time-travel cues, historical `asOf` reads, and operation
 * disablement all come from one stores-owned reading of `timeline_mode`.
 */
export function useDashboardTimelineModeView(
  scope: string | null,
): DashboardTimelineModeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardTimelineModeView(dashboardState.data?.timeline_mode),
    [dashboardState.data?.timeline_mode],
  );
}

export interface DashboardPlayheadView {
  loaded: boolean;
  playhead: DashboardPlayhead;
}

export function deriveDashboardPlayheadView(
  state: Pick<DashboardState, "timeline_mode"> | undefined,
): DashboardPlayheadView {
  return {
    loaded: state !== undefined,
    playhead: dashboardPlayheadForTimelineMode(state?.timeline_mode),
  };
}

/**
 * Stores selector for the timeline playhead's canonical dashboard-state mirror.
 * The timeline viewport is client-state in the shared TanStack cache, while
 * timeline-mode -> playhead interpretation is shared with the dashboard write seam.
 */
export function useDashboardPlayheadView(scope: string | null): DashboardPlayheadView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardPlayheadView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardStageSceneView {
  selectedIds: string[];
  selectedNodeId: string | null;
  graphQuery: DashboardGraphQueryVariables | null;
  granularity: GraphGranularity;
  activeRepresentationMode: DashboardState["representation_mode"];
  graphBounds: DashboardGraphBounds | undefined;
  timeline: DashboardTimelineModeView;
  liveTimeline: boolean;
}

export function deriveDashboardStageSceneView(
  state: DashboardState | undefined,
): DashboardStageSceneView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  return {
    selectedIds: state?.selected_ids ? [...state.selected_ids] : [],
    selectedNodeId: dashboardSelectionId(state),
    graphQuery: state ? dashboardGraphQueryVariables(state) : null,
    granularity: state?.graph_granularity ?? "feature",
    activeRepresentationMode: state?.representation_mode ?? "connectivity",
    graphBounds: state?.graph_bounds ? { ...state.graph_bounds } : undefined,
    timeline,
    liveTimeline: !timeline.timeTravel,
  };
}

/**
 * Stores selector for the Stage scene-owner read model. Stage still owns scene
 * commands, but dashboard-state interpretation stays centralized with the other
 * visual UI selectors.
 */
export function useDashboardStageSceneView(
  scope: string | null,
): DashboardStageSceneView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardStageSceneView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardGraphControlsView {
  graphBounds: DashboardGraphBounds;
  timeline: DashboardTimelineModeView;
  representationMode: DashboardState["representation_mode"];
  freezeAvailable: boolean;
}

const FALLBACK_DASHBOARD_GRAPH_BOUNDS: DashboardGraphBounds = {
  shape: "free",
  size: 0,
};

export function deriveDashboardGraphControlsView(
  state:
    | Pick<DashboardState, "graph_bounds" | "representation_mode" | "timeline_mode">
    | undefined,
): DashboardGraphControlsView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  const representationMode = state?.representation_mode ?? "connectivity";
  return {
    graphBounds: state?.graph_bounds
      ? { ...state.graph_bounds }
      : { ...FALLBACK_DASHBOARD_GRAPH_BOUNDS },
    timeline,
    representationMode,
    freezeAvailable: representationMode === "connectivity" && !timeline.timeTravel,
  };
}

/**
 * Stores selector for graph-control chrome: containment bounds plus the freeze
 * toggle's live/connectivity applicability. Scene commands stay in the app, but
 * dashboard-state interpretation stays here.
 */
export function useDashboardGraphControlsView(
  scope: string | null,
): DashboardGraphControlsView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardGraphControlsView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardLayoutSelectorView {
  dateRange: DashboardDateRange;
  representationMode: DashboardState["representation_mode"];
  spatialActive: DashboardState["representation_mode"] | null;
  timeline: DashboardTimelineModeView;
}

export interface DashboardLensSelectorView {
  lens: SalienceLens;
}

export function deriveDashboardLayoutSelectorView(
  state:
    | Pick<DashboardState, "date_range" | "representation_mode" | "timeline_mode">
    | undefined,
): DashboardLayoutSelectorView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  const representationMode = state?.representation_mode ?? "connectivity";
  return {
    dateRange: state?.date_range ? { ...state.date_range } : {},
    representationMode,
    spatialActive: timeline.timeTravel ? null : representationMode,
    timeline,
  };
}

export function deriveDashboardLensSelectorView(
  state: Pick<DashboardState, "salience_lens"> | undefined,
): DashboardLensSelectorView {
  return {
    lens: state?.salience_lens ?? DEFAULT_DASHBOARD_SALIENCE_LENS,
  };
}

/**
 * Stores selector for the stage layout picker. The component owns interaction
 * writes, while live/time-travel active-state and representation fallbacks stay
 * in the dashboard-state projection layer.
 */
export function useDashboardLayoutSelectorView(
  scope: string | null,
): DashboardLayoutSelectorView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardLayoutSelectorView(dashboardState.data),
    [dashboardState.data],
  );
}

/**
 * Stores selector for the stage salience-lens picker. The selector reads the
 * canonical dashboard lens with the same fallback used by graph queries.
 */
export function useDashboardLensSelectorView(
  scope: string | null,
): DashboardLensSelectorView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardLensSelectorView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardShellChromeView {
  panelState: DashboardPanelState;
  timeline: DashboardTimelineModeView;
}

const FALLBACK_DASHBOARD_PANEL_STATE: DashboardPanelState = {
  left_collapsed: false,
  right_collapsed: false,
  right_tab: "status",
};

export function deriveDashboardShellChromeView(
  state: Pick<DashboardState, "panel_state" | "timeline_mode"> | undefined,
): DashboardShellChromeView {
  return {
    panelState: state?.panel_state ?? FALLBACK_DASHBOARD_PANEL_STATE,
    timeline: deriveDashboardTimelineModeView(state?.timeline_mode),
  };
}

/**
 * Stores selector for AppShell chrome. The shell consumes a single interpreted
 * panel/time-travel view instead of reading raw dashboard-state fields for rail
 * collapse, right-tab, and context-menu operation gating.
 */
export function useDashboardShellChromeView(
  scope: string | null,
): DashboardShellChromeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardShellChromeView(dashboardState.data),
    [dashboardState.data],
  );
}

type DashboardTierName = (typeof CANONICAL_TIERS)[number];

type DashboardTierMap = Record<DashboardTierName, boolean>;

export interface DashboardTierDialView {
  filters: DashboardFilters;
  tiers: DashboardTierMap;
  minConfidence: NonNullable<DashboardFilters["min_confidence"]>;
  timeline: DashboardTimelineModeView;
  availability: GraphSliceAvailability;
  semanticDegraded: boolean;
}

interface DashboardGraphSliceVariables {
  scope: string;
  filter: GraphFilter;
  asOf?: string | number;
  granularity: GraphGranularity;
  lens: SalienceLens;
  focus: string | null;
}

function cloneDashboardDateRangeForQuery(
  range: DashboardDateRange | undefined,
): DashboardDateRange {
  return range ? { ...range } : {};
}

function cloneDashboardFiltersForQuery(filters: DashboardFilters): DashboardFilters {
  return {
    ...filters,
    tiers: filters.tiers ? { ...filters.tiers } : undefined,
    min_confidence: filters.min_confidence ? { ...filters.min_confidence } : undefined,
    relations: filters.relations ? [...filters.relations] : undefined,
    structural_state: filters.structural_state
      ? [...filters.structural_state]
      : undefined,
    kinds: filters.kinds ? [...filters.kinds] : undefined,
    doc_types: filters.doc_types ? [...filters.doc_types] : undefined,
    feature_tags: filters.feature_tags ? [...filters.feature_tags] : undefined,
    date_range: filters.date_range
      ? cloneDashboardDateRangeForQuery(filters.date_range)
      : undefined,
  };
}

function dashboardGraphSliceVariables(
  state: DashboardState,
): DashboardGraphSliceVariables {
  const filter = cloneDashboardFiltersForQuery(state.filters);
  if (state.date_range.from || state.date_range.to) {
    filter.date_range = cloneDashboardDateRangeForQuery(state.date_range);
  } else {
    delete filter.date_range;
  }
  return {
    scope: state.scope,
    filter,
    asOf:
      state.timeline_mode.kind === "time-travel" ? state.timeline_mode.at : undefined,
    granularity: state.graph_granularity,
    lens: state.salience_lens,
    focus: state.salience_focus,
  };
}

export function deriveDashboardTierDialView(
  state: Pick<DashboardState, "filters" | "timeline_mode"> | undefined,
  availability: GraphSliceAvailability,
): DashboardTierDialView {
  const filters = cloneDashboardFiltersForQuery(state?.filters ?? {});
  return {
    filters,
    tiers: {
      declared: filters.tiers?.declared ?? true,
      structural: filters.tiers?.structural ?? true,
      temporal: filters.tiers?.temporal ?? true,
      semantic: filters.tiers?.semantic ?? true,
    },
    minConfidence: filters.min_confidence ?? {},
    timeline: deriveDashboardTimelineModeView(state?.timeline_mode),
    availability,
    semanticDegraded: availability.degradedTiers.includes("semantic"),
  };
}

/**
 * Stores selector for the stage tier dial. The dial consumes one interpreted view
 * for tier toggles, confidence floors, time-travel applicability, and semantic
 * degradation instead of reading raw dashboard filters or graph-query variables.
 */
export function useDashboardTierDialView(scope: string | null): DashboardTierDialView {
  const dashboardState = useDashboardState(scope);
  const graphQuery = useMemo(
    () =>
      dashboardState.data ? dashboardGraphSliceVariables(dashboardState.data) : null,
    [dashboardState.data],
  );
  const slice = useGraphSlice(
    graphQuery?.scope ?? null,
    graphQuery?.filter,
    graphQuery?.asOf,
    graphQuery?.granularity,
    graphQuery?.lens,
    graphQuery?.focus,
  );
  const availability = useGraphSliceAvailability(slice, graphQuery !== null);
  return useMemo(
    () => deriveDashboardTierDialView(dashboardState.data, availability),
    [availability, dashboardState.data],
  );
}

export function useGraphSlice(
  scope: string | null,
  filter?: GraphFilter,
  asOf?: string | number,
  granularity?: "document" | "feature",
  lens?: SalienceLens,
  focus?: string | null,
) {
  return useQuery({
    queryKey: engineKeys.graph(scope ?? "", filter, asOf, granularity, lens, focus),
    queryFn: () =>
      engineClient.graphQuery({
        scope: scope!,
        filter,
        as_of: asOf,
        granularity,
        lens,
        focus,
      }),
    enabled: scope !== null,
  });
}

/**
 * The active-lens graph slice (graph-node-salience): reads lens + focus from
 * canonical dashboard state and parameterizes the graph query by them, so a lens
 * switch or focus change is a re-query keyed on (lens, focus).
 */
export function useSalienceGraphSlice(
  scope: string | null,
  filter?: GraphFilter,
  asOf?: string | number,
  granularity?: "document" | "feature",
) {
  const dashboardState = useDashboardState(scope);
  const state = dashboardState.data;
  return useGraphSlice(
    state ? scope : null,
    filter,
    asOf,
    granularity,
    state?.salience_lens,
    state?.salience_focus ?? null,
  );
}

/**
 * The salience query's loading + degradation truth, derived in the stores layer
 * so the scene loading channel and the chrome never read the raw `tiers` block or
 * re-derive partiality (dashboard-layer-ownership / degradation-is-read-from-
 * tiers). `loading` covers BOTH the initial fetch and a focus-change re-query
 * (`isFetching`), so the scene can show a loading state on a focus change behind
 * the stores->scene boundary (W04.P09.S39). `partial` is the engine's
 * `salience_partial` flag when served, OR derived from a degraded tier in the
 * served block — read from tiers, fresh error tiers winning over a stale held
 * success block, NEVER from a bare transport error (S40).
 */
export interface SalienceSliceView {
  /** The active lens the slice was (or is being) computed for. */
  lens: SalienceLens;
  /** The slice is in flight: an initial fetch, a lens switch, or a focus change. */
  loading: boolean;
  /** The salience ranking is partial (a relevant tier degraded). */
  partial: boolean;
  /** Names of the tiers reporting unavailable/absent in the served block. */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

/**
 * Derive the salience slice view from the served data + error + in-flight state.
 * Degradation is read from the `tiers` block through the single reader (success
 * data, or the error envelope's tiers, with FRESH error tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers), and `partial` honors the engine's own
 * `salience_partial` flag OR a degraded tier in that block. A wholly absent
 * block (a bare transport fault) is NOT treated as degraded here — that is the
 * query's error state, which the scene renders distinctly.
 */
export function deriveSalienceSliceView(
  lens: SalienceLens,
  data: GraphSlice | undefined,
  error: unknown,
  loading: boolean,
): SalienceSliceView {
  const servedData = loading ? undefined : data;
  const { degradedTiers, reasons } = readTierAvailability(
    tiersFromQuery({ data: servedData, error }),
    CANONICAL_TIERS,
  );
  // Partial: the engine's explicit flag, OR a degraded tier in the served block.
  // Never inferred from a bare transport error (no tiers => not partial here).
  const partial = servedData?.salience_partial === true || degradedTiers.length > 0;
  return { lens: servedData?.lens ?? lens, loading, partial, degradedTiers, reasons };
}

/**
 * Stores hook: the active-lens salience slice view (loading on lens/focus change,
 * partiality + degradation read from tiers), so the scene loading channel and the
 * lens-selector chrome consume interpreted truth, never the raw `tiers` block.
 * `loading` is true on a focus change too (the warm-started PPR re-query), which
 * is the focus-change loading state the scene shows behind the stores boundary.
 */
export function useSalienceSliceView(
  scope: string | null,
  filter?: GraphFilter,
  asOf?: string | number,
  granularity?: "document" | "feature",
): SalienceSliceView {
  const dashboardState = useDashboardState(scope);
  const lens = dashboardState.data?.salience_lens ?? DEFAULT_SALIENCE_LENS;
  const slice = useSalienceGraphSlice(scope, filter, asOf, granularity);
  // isFetching covers a focus-change/lens-switch re-query while held data is
  // shown; isPending is the initial fetch. Either is a loading state for the
  // scene on a focus change.
  const loading =
    scope !== null &&
    (dashboardState.isPending ||
      dashboardState.isFetching ||
      slice.isPending ||
      slice.isFetching);
  return deriveSalienceSliceView(lens, slice.data, slice.error, loading);
}

// --- semantic embeddings (graph-semantic-embeddings ADR) ---------------------
//
// `GET /graph/embeddings` is the dedicated bounded embedding read. It is fetched
// LAZILY only on entering semantic mode (the `enabled` gate, ADR D2) and cached
// per generation (the watcher's gap-driven invalidation re-fetches on a
// generation bump, ADR D8). The scene is a dumb consumer: it reads the
// interpreted view below, never `engineClient.graphEmbeddings` or the raw `tiers`
// block. Semantic availability is read from the `tiers` block (ADR D7 /
// degradation-is-read-from-tiers), with FRESH error tiers winning over a stale
// held-success block, never from a bare fetch rejection — so the scene draws the
// honest fallback ring rather than flapping offline on a transport blip.

/** The interpreted semantic-embeddings view the scene consumes: loading /
 *  unavailable / available / the embeddings keyed by node id. `unavailable` is a
 *  DESIGNED state (rag/Qdrant down → the semantic tier reports unavailable), never
 *  an anonymous error; the scene rings every node in the honest fallback. */
export interface SemanticEmbeddingsView {
  /** The embedding read is in flight with no held vectors. */
  loading: boolean;
  /**
   * Designed degradation: the semantic tier is unavailable (rag/Qdrant down).
   * Read from the served `tiers` block (success OR a tiers-bearing error
   * envelope, fresh error winning), NEVER from a bare transport fault and NEVER
   * inferred from an empty embeddings array. When true the scene draws the
   * fallback ring as honest absence (the designed Held state).
   */
  unavailable: boolean;
  /**
   * Meaning availability (graph-node-representation ADR D2): the mode is real and
   * ready to ship ONLY when BOTH the embedding-presence floor is met AND the
   * `tiers` search/semantic tier reports available. An empty array with the tier
   * UP is NOT `unavailable` (held is read from tiers alone) — it is simply not yet
   * `available` (the presence floor is unmet). This is the positive availability
   * gate; `unavailable` is the negative (held) one, and they are distinct.
   */
  available: boolean;
  /** The number of served nodes carrying a real vector (the presence count the
   *  availability floor reads). The fraction-of-node-set floor is enforced in the
   *  scene gate where the full node set is known; here the stores layer reads the
   *  count the response actually carried. */
  embeddingCount: number;
  /** The served vectors keyed by node id — the scene merges these onto its nodes
   *  for the UMAP projection. Empty while loading/unavailable. */
  embeddings: Map<string, number[]>;
  /** The graph generation the held vectors were read at (the cache key); 0 when
   *  none held yet. */
  generation: number;
}

const SEMANTIC_TIER = "semantic";

/**
 * The minimum count of served vectors for the stores-layer embedding-presence
 * floor (graph-node-representation ADR D2). At least this many nodes must carry a
 * real vector before Meaning is `available` — so the mode never reports ready on a
 * path that delivered no embeddings (the unserved-embedding blind spot). This is a
 * POSITIVE availability floor, NOT a held trigger: a response below it with the
 * tier UP is "not yet available", never "unavailable" (held is read from `tiers`
 * alone). The fraction-of-node-set floor (`SEMANTIC_GATE_DATA_PRESENCE_MIN`) is
 * enforced in the scene gate where the full served node set is in hand.
 */
export const MEANING_EMBEDDING_PRESENCE_FLOOR = 1;

/**
 * Derive the semantic-embeddings view from the embedding query's data + error +
 * pending flags, reading the `semantic` tier ONLY here in the stores layer so the
 * scene consumes interpreted truth, never the raw `tiers` block.
 *
 * Held (`unavailable`) is read from the `tiers` block ALONE (success block, or a
 * tiers-bearing error envelope with FRESH error tiers winning via `tiersFromQuery`
 * — degradation-is-read-from-tiers-not-guessed-from-errors): a served block
 * marking `semantic` unavailable degrades; a tiers-less transport fault is NOT
 * rendered as unavailable here (that is the query's error state), and an empty
 * embeddings array is NEVER read as held.
 *
 * Available (Meaning ships, ADR D2) requires BOTH the embedding-presence floor
 * (`MEANING_EMBEDDING_PRESENCE_FLOOR` served vectors) AND the `semantic` tier
 * reporting available — so the mode reports ready only on a path that actually
 * delivered embeddings AND whose backend tier is up. The embeddings are keyed by
 * node id for the scene's per-node merge.
 */
export function deriveSemanticEmbeddingsView(
  data: EmbeddingsResponse | undefined,
  error: unknown,
  loading: boolean,
  enabled: boolean,
): SemanticEmbeddingsView {
  if (!enabled) {
    return {
      loading: false,
      unavailable: false,
      available: false,
      embeddingCount: 0,
      embeddings: new Map(),
      generation: 0,
    };
  }
  const tiers = tiersFromQuery({ data, error });
  const semantic = tiers?.[SEMANTIC_TIER];
  // Held is read from the tiers block ALONE: an explicit available:false marks the
  // tier down. A tiers-less transport fault and an empty array are NOT held.
  const unavailable = semantic !== undefined && semantic.available === false;
  // The tier is affirmatively up only when the block reports it available:true.
  // (An absent semantic tier is neither up nor explicitly down — it cannot satisfy
  // the positive availability gate, matching contract §2 absence-is-not-available.)
  const tierUp = semantic !== undefined && semantic.available === true;
  const embeddings = new Map<string, number[]>();
  if (!unavailable && data) {
    for (const e of data.embeddings) embeddings.set(e.node_id, e.vector);
  }
  const embeddingCount = embeddings.size;
  const presenceFloorMet = embeddingCount >= MEANING_EMBEDDING_PRESENCE_FLOOR;
  const available = tierUp && presenceFloorMet;
  return {
    loading,
    unavailable,
    available,
    embeddingCount,
    embeddings,
    generation: data?.generation ?? 0,
  };
}

/**
 * Stores hook: the lazy per-generation semantic embedding read for the active
 * scope, enabled ONLY when semantic mode is entered (`enabled`). Returns the
 * interpreted view (loading / unavailable from tiers / the node-id-keyed
 * vectors) so the scene consumes derived truth instead of fetching itself
 * (dashboard-layer-ownership). The lens + focus align the embedding set with the
 * constellation's served node set. `retry: false` so a rag-down read surfaces
 * immediately as the designed fallback state rather than after backoff.
 */
export function useGraphEmbeddings(
  scope: string | null,
  enabled: boolean,
  lens?: SalienceLens,
  focus?: string | null,
): SemanticEmbeddingsView {
  const active = scope !== null && enabled;
  const query = useQuery({
    queryKey: engineKeys.graphEmbeddings(scope ?? "", lens, focus),
    queryFn: () => engineClient.graphEmbeddings({ scope: scope!, lens, focus }),
    enabled: active,
    retry: false,
  });
  return deriveSemanticEmbeddingsView(
    query.data,
    query.error ?? null,
    active && query.isPending,
    active,
  );
}

/**
 * The graph slice's loading + degradation truth, derived inside the stores layer
 * so chrome (the nav toolbar's granularity descent) never reads the raw `tiers`
 * block (dashboard-layer-ownership / nav-controls ADR "States"). Contract §2: a
 * tier marked `available:false` OR absent from the served block is a designed
 * degraded state. The reasons travel through both the success envelope
 * (`data.tiers`) and the error envelope (`EngineError.tiers`, transport-preserved)
 * so a backend-down condition surfaces as designed degradation, never a bare
 * error. `loading` is the query's in-flight state for the affected slice. The nav
 * toolbar consumes this, never `slice.data.tiers`.
 */
export interface GraphSliceAvailability extends TierAvailability {
  /** The slice query is in flight (no held data yet). */
  loading: boolean;
}

type GraphSliceAvailabilitySource = Pick<
  UseQueryResult<GraphSlice>,
  "data" | "error" | "isPending"
>;

export function deriveGraphSliceAvailability(
  tiers: TiersBlock | undefined,
  loading: boolean,
): GraphSliceAvailability {
  return { loading, ...readTierAvailability(tiers, CANONICAL_TIERS) };
}

/**
 * Stores hook: the graph slice's loading + degradation truth for the active
 * scope and granularity, read through the wire client so the nav toolbar
 * consumes derived truth instead of the raw `tiers` block. Mirrors
 * `useVaultTreeAvailability`. The toolbar passes the same (scope, granularity)
 * it renders so the descent reflects the slice it is steering.
 */
export function useGraphSliceAvailability(
  slice: GraphSliceAvailabilitySource | null,
  active = true,
): GraphSliceAvailability {
  // Availability is a projection over the already-held canonical graph slice.
  // It must not issue an unfiltered /graph/query just to read the tiers block:
  // that second request can drift from the Stage's filter/lens/date identity and
  // duplicates the graph payload.
  return deriveGraphSliceAvailability(
    slice ? tiersFromQuery(slice) : undefined,
    active && Boolean(slice?.isPending),
  );
}

/**
 * Whether an id addresses a REAL graph node the `/nodes/{id}` family can resolve.
 * Constellation FEATURE nodes are SYNTHESIZED aggregates (id `feature:<tag>`), not
 * stored graph nodes, so the engine 404s `/nodes/feature:…`, `…/evidence`, and
 * `…/neighbors`. The feature node's data (member_count, degree, the features it
 * links to via meta_edges) already rides the graph slice, so the chrome must NOT
 * fire a doc-detail fetch for one: gating these queries here stops the 404 storm
 * on the DEFAULT constellation view — and the false `degraded` policy trips those
 * 404s caused — without changing what the consumers render (they already coped
 * with absent detail). Every non-feature id (doc:, and any other real node kind)
 * stays addressable.
 */
export function isAddressableNode(id: string | null): id is string {
  return id !== null && featureTagFromNodeId(id) === null;
}

export function useNodeDetail(id: string | null, scope: string | null) {
  return useQuery({
    queryKey: engineKeys.node(scope ?? "", id ?? ""),
    queryFn: () => engineClient.node(id!, scope!),
    enabled: scope !== null && isAddressableNode(id),
  });
}

export type NodeDetailSurfaceState = "idle" | "loading" | "unavailable" | "ready";

export interface NodeDetailView {
  state: NodeDetailSurfaceState;
  detail: NodeDetail | null;
  node: EngineNode | null;
}

export function deriveNodeDetailView(
  data: NodeDetail | undefined,
  loading: boolean,
  errored: boolean,
  enabled: boolean,
): NodeDetailView {
  if (!enabled) return { state: "idle", detail: null, node: null };
  if (loading) return { state: "loading", detail: null, node: null };
  if (errored || !data?.node) {
    return { state: "unavailable", detail: null, node: null };
  }
  return { state: "ready", detail: data, node: data.node };
}

/**
 * Stores selector for node-detail consumers. The inspector and node interiors
 * render a designed state from this view instead of branching on raw query flags
 * or re-guarding the possibly-missing `node` payload themselves.
 */
export function useNodeDetailView(
  id: string | null,
  scope: string | null,
): NodeDetailView {
  const enabled = scope !== null && isAddressableNode(id);
  const query = useNodeDetail(id, scope);
  return deriveNodeDetailView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

/** The lifecycle axis: every opened feature has the same internal grammar. */
export const FEATURE_LIFECYCLE_AXIS = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
] as const;

export function featureLifecycleRank(kind: string): number {
  const i = (FEATURE_LIFECYCLE_AXIS as readonly string[]).indexOf(kind);
  return i === -1 ? FEATURE_LIFECYCLE_AXIS.length : i;
}

/** Order a feature's documents along the lifecycle axis, stable by title. */
export function arrangeFeatureLifecycleAxis(
  nodes: readonly EngineNode[],
): EngineNode[] {
  return nodes
    .filter((n) => featureLifecycleRank(n.kind) < FEATURE_LIFECYCLE_AXIS.length)
    .sort(
      (a, b) =>
        featureLifecycleRank(a.kind) - featureLifecycleRank(b.kind) ||
        (a.title ?? a.id).localeCompare(b.title ?? b.id),
    );
}

export type FeatureLifecycleState = "loading" | "ready";

export interface FeatureLifecycleView {
  state: FeatureLifecycleState;
  docs: EngineNode[];
}

export function deriveFeatureLifecycleView(
  nodes: readonly EngineNode[] | undefined,
): FeatureLifecycleView {
  if (!nodes) return { state: "loading", docs: [] };
  return { state: "ready", docs: arrangeFeatureLifecycleAxis(nodes) };
}

/**
 * Stores selector for a synthesized feature island's bounded document lifecycle.
 * Feature nodes are not addressable by `/nodes/{id}`, so the island consumes this
 * feature-filtered document slice instead of minting graph-query identity locally.
 */
export function useFeatureLifecycleView(
  id: string,
  scope: string | null,
): FeatureLifecycleView {
  const tag = featureTagFromNodeId(id);
  const slice = useGraphSlice(
    tag === null ? null : scope,
    tag === null ? undefined : { feature_tags: [tag] },
    undefined,
    "document",
  );
  return deriveFeatureLifecycleView(slice.data?.nodes);
}

export function useNodeNeighbors(id: string | null, scope: string | null, depth = 1) {
  return useQuery({
    queryKey: engineKeys.neighbors(scope ?? "", id ?? "", depth),
    queryFn: () => engineClient.nodeNeighbors(id!, { scope: scope!, depth }),
    enabled: scope !== null && isAddressableNode(id),
  });
}

export const INSPECTOR_EDGE_TIER_ORDER = [
  "declared",
  "structural",
  "temporal",
  "semantic",
] as const;

export interface InspectorNeighborTierView {
  tiers: Map<EngineEdge["tier"], EngineEdge[]>;
  tierKeys: EngineEdge["tier"][];
}

export function deriveInspectorNeighborTierView(
  edges: readonly EngineEdge[] | undefined,
): InspectorNeighborTierView {
  const tiers = new Map<EngineEdge["tier"], EngineEdge[]>();
  for (const tier of INSPECTOR_EDGE_TIER_ORDER) {
    const members = (edges ?? []).filter((edge) => edge.tier === tier && !edge.meta);
    if (members.length > 0) tiers.set(tier, members);
  }
  return { tiers, tierKeys: [...tiers.keys()] };
}

export function useInspectorNeighborTierView(
  id: string | null,
  scope: string | null,
): InspectorNeighborTierView {
  const neighbors = useNodeNeighbors(id, scope);
  return useMemo(
    () => deriveInspectorNeighborTierView(neighbors.data?.edges),
    [neighbors.data?.edges],
  );
}

// --- read-only content fetch (review-rail-viewers ADR) ---------------------------
//
// The viewer backend's wire seam, consumed through these stores hooks so the
// markdown reader and the code viewer (chrome) never fetch the engine or read the
// raw `tiers` block (dashboard-layer-ownership: stores is the sole wire client of
// `/nodes/{id}/content`). The content query is BOUNDED at creation per
// bounded-by-default-for-every-accumulator: an explicit `gcTime` evicts an
// unobserved entry promptly, and `maxPages`-style cache pressure is bounded by the
// per-observer single-entry shape (one open viewer holds one content entry) plus
// the prompt gcTime — the viewer never accumulates every opened file's bytes for
// the session. Disabled until a node is actually open (`nodeId === null` =
// nothing to read), following the `useNodeDetail` enabled-on-id pattern.

/** How long an unobserved content entry survives in cache before garbage
 *  collection (bounded-by-default-for-every-accumulator). 60s is generous for the
 *  back-and-forth of reading a few documents while keeping a long review session
 *  from retaining the bytes of every file ever opened — the prompt eviction is the
 *  bound, since each content entry can be up to MAX_CONTENT_BYTES. */
const CONTENT_GC_TIME = 60_000;

/**
 * The read-only content fetch for one document/file node (review-rail-viewers
 * ADR), the SOLE wire client of `/nodes/{id}/content`. Keyed by (scope, nodeId);
 * disabled when either is null (no node open / no worktree resolved yet). Bounded:
 * an explicit `gcTime` evicts the (potentially MAX_CONTENT_BYTES) entry soon after
 * the viewer closes, so a long session does not retain every opened file's bytes.
 */
export function useNodeContent(nodeId: string | null, scope: string | null) {
  return useQuery({
    queryKey: engineKeys.content(scope ?? "", nodeId ?? ""),
    queryFn: () => engineClient.content(nodeId!, scope ?? undefined),
    enabled: nodeId !== null && scope !== null,
    gcTime: CONTENT_GC_TIME,
  });
}

/**
 * The interpreted content view the markdown reader and the code viewer render. A
 * single shape both viewers consume: `loading` while in flight, `degraded` read
 * from the served `tiers` block (the `structural` tier the content read resolves
 * through), `errored` for a tiers-less transport fault (distinct from degraded),
 * `truncated` carrying the honest byte-cap block, and the content fields when
 * served. The viewers consume this, never `content.data.tiers`.
 */
export interface ContentView extends TierAvailability {
  /** The content query is in flight with no held content. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** The served repo-relative path, when available. */
  path?: string;
  /** The git-style blob oid of the served bytes, when available. */
  blobHash?: string;
  /** The extension-derived highlighter grammar hint; null when none applies. */
  languageHint: string | null;
  /** The (possibly truncated) UTF-8 text; empty while loading/degraded/errored. */
  text: string;
  /** The honest byte-cap block when the body was truncated; null otherwise. */
  truncated: ContentTruncated | null;
  /** True iff the engine answered with content (vs loading/degraded/errored). */
  available: boolean;
}

// The content read is resolved by the engine's STRUCTURAL read of the worktree
// substrate, so the `structural` tier gates content availability (contract §2).
const CONTENT_TIERS = ["structural"] as const;

/**
 * Derive the content view from a content query's data + error + pending flags,
 * reading the served `tiers` block ONLY here in the stores layer so the viewers
 * consume interpreted truth, never the raw block. Degradation is read from the
 * `tiers` block (success data, OR a FRESH error envelope's tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers-not-guessed-from-errors). A served block that
 * marks `structural` unavailable — or omits it — is designed degradation
 * (contract §2: absence ≠ available); a tiers-less transport fault is the errored
 * branch, NOT degradation. While degraded the (possibly stale) text is not shown
 * as current; the viewer renders the degraded notice.
 */
export function deriveContentView(
  data: ContentResponse | undefined,
  error: unknown,
  loading: boolean,
): ContentView {
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, CONTENT_TIERS);
  // A tiers-less transport fault (no envelope) is the errored branch; a
  // tiers-bearing error or a degraded served block is designed degradation.
  const errored =
    error instanceof EngineError ? error.tiers === undefined : error != null;
  const available =
    !loading && !errored && !availability.degraded && data !== undefined;
  return {
    ...availability,
    loading,
    errored,
    path: data?.path,
    blobHash: data?.blob_hash,
    languageHint: data?.language_hint ?? null,
    text: availability.degraded || errored ? "" : (data?.text ?? ""),
    truncated: data?.truncated ?? null,
    available,
  };
}

/**
 * Stores hook: the content view for one open document/file node, read through the
 * content query so the markdown reader and the code viewer consume interpreted
 * state (loading / degraded / errored / truncated / content) instead of fetching
 * themselves or reading the raw `tiers` block.
 */
export function useContentView(
  nodeId: string | null,
  scope: string | null,
): ContentView {
  const query = useNodeContent(nodeId, scope);
  const loading = nodeId !== null && scope !== null && query.isPending;
  return deriveContentView(query.data, query.error ?? null, loading);
}

export type ViewerStateTone = "faint" | "muted" | "broken";

export interface CodeViewerView {
  /** The designed surface state the code viewer renders. */
  state: "loading" | "errored" | "degraded" | "empty" | "ready";
  /** Placeholder copy for non-ready states. */
  stateMessage: string | null;
  /** Placeholder tone for non-ready states. */
  stateTone: ViewerStateTone;
  /** Text passed to the tokenizer; blank outside the ready state. */
  text: string;
  /** Raw, 1:1 source lines for the virtualized line list. */
  rawLines: string[];
  /** Served repo-relative path for the header. */
  path?: string;
  /** Highlighter grammar hint for the tokenizer and language badge. */
  languageHint: string | null;
  /** Honest byte-cap marker shown only with ready content. */
  truncated: ContentTruncated | null;
}

/**
 * Derive the code viewer's render model from the tiers-interpreted content view.
 * The app renders virtualization/highlighting chrome; stores owns state
 * classification, degradation copy, and which bytes are safe to tokenize.
 */
export function deriveCodeViewerView(content: ContentView): CodeViewerView {
  const base = {
    text: "",
    rawLines: [] as string[],
    path: content.path,
    languageHint: null,
    truncated: null,
  };
  if (content.loading) {
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading file...",
      stateTone: "faint",
    };
  }
  if (content.errored) {
    return {
      ...base,
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone: "broken",
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    return {
      ...base,
      state: "degraded",
      stateMessage: `File unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone: "muted",
    };
  }
  if (!content.available || content.text.length === 0) {
    return {
      ...base,
      state: "empty",
      stateMessage: "This file is empty.",
      stateTone: "faint",
    };
  }

  const text = content.text;
  return {
    state: "ready",
    stateMessage: null,
    stateTone: "faint",
    text,
    rawLines: text.replace(/\n$/, "").split("\n"),
    path: content.path,
    languageHint: content.languageHint,
    truncated: content.truncated,
  };
}

type MarkdownHeaderCategory = "adr" | "audit" | "exec" | "index" | "plan" | "research";

export interface MarkdownHeaderView {
  /** The document title rendered by the viewer header. */
  title: string;
  /** The path trail leading to the document, derived from the served path. */
  trail?: Array<{ label: string }>;
  /** The design-system category token for the document type, when one is bound. */
  category?: MarkdownHeaderCategory;
  /** The raw document type label shown in the chip. */
  categoryLabel?: string;
  /** Frontmatter metadata rows shown by the viewer header. */
  meta?: Array<{ label: string; value: string }>;
}

const MARKDOWN_HEADER_DOC_TYPE_CATEGORY: Record<string, MarkdownHeaderCategory> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
  index: "index",
};

function markdownHeaderDocType(path: string | undefined, stem: string): string | null {
  if (path) {
    const match = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
    if (match) return match[1] ?? null;
  }
  const suffix = /-(research|adr|plan|exec|audit|reference|index)$/.exec(stem);
  return suffix ? (suffix[1] ?? null) : null;
}

function markdownHeaderTitle(stem: string): string {
  return stem.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ") || stem;
}

/**
 * Derive the binding document-header view for an open markdown document from the
 * already-served content view. Pure: no fetch, no app chrome dependency, and no
 * direct renderer callback. The caller adds close/navigation intent.
 */
export function deriveMarkdownHeaderView(
  nodeId: string,
  content: ContentView,
): MarkdownHeaderView {
  const stem = nodeId.replace(/^doc:/, "");
  const docType = markdownHeaderDocType(content.path, stem);
  const category =
    docType === null ? undefined : MARKDOWN_HEADER_DOC_TYPE_CATEGORY[docType];
  const { frontmatter } = parseDocument(content.text);

  const trail = content.path
    ? content.path
        .split("/")
        .slice(0, -1)
        .filter(Boolean)
        .map((label) => ({ label }))
    : undefined;

  const meta: MarkdownHeaderView["meta"] = [];
  if (typeof frontmatter?.date === "string") {
    meta.push({ label: "created", value: frontmatter.date });
  }
  if (typeof frontmatter?.modified === "string") {
    meta.push({ label: "modified", value: frontmatter.modified });
  }

  return {
    title: markdownHeaderTitle(stem),
    trail,
    category,
    categoryLabel: docType ?? undefined,
    meta: meta.length > 0 ? meta : undefined,
  };
}

export interface MarkdownReaderView {
  /** The designed reader state the app renders. */
  state: "loading" | "errored" | "degraded" | "empty" | "ready";
  /** Placeholder copy for non-ready states. */
  stateMessage: string | null;
  /** Placeholder tone for non-ready states. */
  stateTone: ViewerStateTone;
  /** Structured frontmatter chrome, null when the document has no visible metadata. */
  frontmatter: FrontmatterHeaderView | null;
  /** Reader meta status from frontmatter, if present. */
  status: string | null;
  /** Markdown body with the leading frontmatter fence removed. */
  body: string;
  /** Honest byte-cap marker shown only with ready content. */
  truncated: ContentTruncated | null;
}

export type FrontmatterTagCategory =
  | "adr"
  | "audit"
  | "code"
  | "exec"
  | "feature"
  | "index"
  | "plan"
  | "research";

export interface FrontmatterTagView {
  /** Display text including the leading hash. */
  label: string;
  /** Design-system category token when the tag names one. */
  category?: FrontmatterTagCategory;
}

export interface FrontmatterDateView {
  label: "created" | "modified";
  value: string;
}

export interface FrontmatterRelatedView {
  stem: string;
  nodeId: string;
}

export interface FrontmatterHeaderView {
  tags: FrontmatterTagView[];
  dates: FrontmatterDateView[];
  related: FrontmatterRelatedView[];
}

const FRONTMATTER_TAG_CATEGORIES = new Set<FrontmatterTagCategory>([
  "adr",
  "audit",
  "code",
  "exec",
  "feature",
  "index",
  "plan",
  "research",
]);

function frontmatterTagView(tag: string): FrontmatterTagView {
  const label = `#${tag}`;
  if (FRONTMATTER_TAG_CATEGORIES.has(tag as FrontmatterTagCategory)) {
    return { label, category: tag as FrontmatterTagCategory };
  }
  return { label };
}

export function deriveFrontmatterHeaderView(
  frontmatter: Frontmatter | null,
): FrontmatterHeaderView | null {
  if (!frontmatter) return null;
  const tags = frontmatter.tags.map(frontmatterTagView);
  const dates: FrontmatterDateView[] = [];
  if (frontmatter.date !== undefined) {
    dates.push({ label: "created", value: frontmatter.date });
  }
  if (frontmatter.modified !== undefined) {
    dates.push({ label: "modified", value: frontmatter.modified });
  }
  const related = frontmatter.related.map((stem) => ({
    stem,
    nodeId: docNodeIdFromStem(stem),
  }));
  if (tags.length === 0 && dates.length === 0 && related.length === 0) {
    return null;
  }
  return { tags, dates, related };
}

/**
 * Derive the markdown reader's document model from the already-served content
 * view. The reader renders this projection, while navigation click intent stays
 * in app chrome.
 */
export function deriveMarkdownReaderView(content: ContentView): MarkdownReaderView {
  const base = {
    frontmatter: null,
    status: null,
    body: "",
    truncated: null,
  };
  if (content.loading) {
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading document…",
      stateTone: "faint",
    };
  }
  if (content.errored) {
    return {
      ...base,
      state: "errored",
      stateMessage: "The document could not be loaded.",
      stateTone: "broken",
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    return {
      ...base,
      state: "degraded",
      stateMessage: `Document unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone: "muted",
    };
  }
  if (!content.available || content.text.length === 0) {
    return {
      ...base,
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone: "faint",
    };
  }
  const parsed = parseDocument(content.text);
  return {
    state: "ready",
    stateMessage: null,
    stateTone: "faint",
    frontmatter: deriveFrontmatterHeaderView(parsed.frontmatter),
    status: parsed.frontmatter?.status ?? null,
    body: parsed.body,
    truncated: content.truncated,
  };
}

// --- bounded recent commit history (status-overview ADR) ---------------------------
//
// The recent-commit list with subjects, consumed by the Status overview rail
// through these stores hooks so the rail (chrome) never fetches the engine or
// reads the raw `tiers` block (dashboard-layer-ownership: stores is the sole wire
// client of `/history`). The history query is BOUNDED at creation per
// bounded-by-default-for-every-accumulator: a fixed default limit folded into the
// key, an explicit `gcTime` that evicts an unobserved entry promptly, and the
// single-entry-per-(scope,limit) shape — the rail never accumulates every scope's
// commit list for the whole session. Degradation is read from the served `tiers`
// block, never guessed from a transport error
// (degradation-is-read-from-tiers-not-guessed-from-errors).

/** The rail's default recent-commit count (the ADR's ~20): a short snapshot, not
 *  the whole log. The engine clamps a larger value to its hard ceiling. */
export const DEFAULT_HISTORY_LIMIT = 20;

/** The Status overview renders a short commit snapshot, not every fetched row. */
export const STATUS_RECENT_COMMIT_ROWS = 12;

/** How long an unobserved history entry survives before garbage collection
 *  (bounded-by-default-for-every-accumulator). 60s matches the content query's
 *  prompt eviction — generous for tab back-and-forth while keeping a long session
 *  from retaining every scope's commit list. */
const HISTORY_GC_TIME = 60_000;

/**
 * The read-only recent-commit history fetch for one scope (status-overview ADR),
 * the SOLE wire client of `/history`. Keyed by (scope, limit); disabled when no
 * scope is resolved yet. Bounded: an explicit `gcTime` evicts the entry soon
 * after the tab is left, so a long session does not retain every scope's list.
 */
export function useNodeHistory(scope: string | null, limit = DEFAULT_HISTORY_LIMIT) {
  return useQuery({
    queryKey: engineKeys.history(scope ?? "", limit),
    queryFn: () => engineClient.history({ scope: scope!, limit }),
    enabled: scope !== null,
    gcTime: HISTORY_GC_TIME,
  });
}

/**
 * The interpreted history view the Status overview rail renders: `loading` while
 * in flight, `degraded` read from the served `tiers` block (the `structural` tier
 * the commit read resolves through), `errored` for a tiers-less transport fault
 * (distinct from degraded), and the commit list when served. The rail consumes
 * this, never `history.data.tiers`.
 */
export interface HistoryView extends TierAvailability {
  /** The history query is in flight with no held commits. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** The recent commits, newest-first; empty while loading/degraded/errored. */
  commits: HistoryCommit[];
  /** Render-ready recent commit rows with selectable graph targets pre-derived. */
  recentCommitRows: RecentCommitRow[];
  /** True iff the engine answered with history (vs loading/degraded/errored). */
  available: boolean;
}

export interface RecentCommitRow {
  commit: HistoryCommit;
  /** Commit node id, used for event selection metadata. */
  eventId: string;
  /** Graph nodes the row can select; excludes the commit node itself. */
  touchedNodeIds: string[];
  /** Whether activating the row has a graph selection target. */
  selectable: boolean;
  /** Compact age label for the status rail; derived with the row projection. */
  ageLabel: string;
}

// The commit read is resolved by the engine's STRUCTURAL read of the worktree's
// git object DB, so the `structural` tier gates history availability (contract §2,
// status-overview ADR: a scope with no readable git history degrades structural).
const HISTORY_TIERS = ["structural"] as const;

function recentCommitAgeLabel(ts: number, now: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const ageMs = now - ts;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

/**
 * Derive the history view from a history query's data + error + pending flags,
 * reading the served `tiers` block ONLY here in the stores layer so the rail
 * consumes interpreted truth, never the raw block. Degradation is read from the
 * `tiers` block (success data, OR a FRESH error envelope's tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers-not-guessed-from-errors). A served block that
 * marks `structural` unavailable — or omits it — is designed degradation
 * (contract §2: absence ≠ available); a tiers-less transport fault is the errored
 * branch, NOT degradation. While degraded the (possibly stale) list is not shown.
 */
export function deriveHistoryView(
  data: HistoryResponse | undefined,
  error: unknown,
  loading: boolean,
  now = Date.now(),
): HistoryView {
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, HISTORY_TIERS);
  const errored =
    error instanceof EngineError ? error.tiers === undefined : error != null;
  const available =
    !loading && !errored && !availability.degraded && data !== undefined;
  const commits =
    loading || availability.degraded || errored ? [] : (data?.commits ?? []);
  const recentCommitRows = commits
    .slice(0, STATUS_RECENT_COMMIT_ROWS)
    .map((commit): RecentCommitRow => {
      const touchedNodeIds = commit.node_ids.filter((id) => !id.startsWith("commit:"));
      return {
        commit,
        eventId: `commit:${commit.hash}`,
        touchedNodeIds,
        selectable: touchedNodeIds.length > 0,
        ageLabel: recentCommitAgeLabel(commit.ts, now),
      };
    });
  return {
    ...availability,
    loading,
    errored,
    commits,
    recentCommitRows,
    available,
  };
}

/**
 * Stores hook: the interpreted recent-history view for a scope, read through the
 * history query so the Status overview rail consumes interpreted state (loading /
 * degraded / errored / commits) instead of fetching itself or reading the raw
 * `tiers` block.
 */
export function useHistoryView(
  scope: string | null,
  limit = DEFAULT_HISTORY_LIMIT,
): HistoryView {
  const query = useNodeHistory(scope, limit);
  const loading = scope !== null && query.isPending;
  return deriveHistoryView(query.data, query.error ?? null, loading);
}

// --- GitHub work items: open PRs, recent (merged) PRs, open issues -------------------
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): these are
// the SOLE wire client for the new rail sections. The DUMB PR/issue views consume
// these interpreted hooks — they never fetch, never read the raw `tiers` block.
// Availability is the engine's capability-local `available`/`reason` (gh reachable
// + authed), interpreted here so the surface renders a designed degraded state
// rather than guessing from a transport error.

export interface PRsView {
  loading: boolean;
  errored: boolean;
  /** The engine answered and `gh` is reachable + authed (data.available). */
  available: boolean;
  /** The capability-local reason when unavailable (gh missing/offline/unauthed). */
  reason: string | null;
  prs: PullRequest[];
}

export interface IssuesView {
  loading: boolean;
  errored: boolean;
  available: boolean;
  reason: string | null;
  issues: Issue[];
}

export function derivePRsView(
  data: PRsResponse | undefined,
  error: unknown,
  loading: boolean,
): PRsView {
  const errored = error != null;
  const available = !loading && !errored && data?.available === true;
  return {
    loading,
    errored,
    available,
    reason: data?.reason ?? null,
    prs: available ? (data?.prs ?? []) : [],
  };
}

export function deriveIssuesView(
  data: IssuesResponse | undefined,
  error: unknown,
  loading: boolean,
): IssuesView {
  const errored = error != null;
  const available = !loading && !errored && data?.available === true;
  return {
    loading,
    errored,
    available,
    reason: data?.reason ?? null,
    issues: available ? (data?.issues ?? []) : [],
  };
}

function useNodePrs(scope: string | null, state: "open" | "merged") {
  return useQuery({
    queryKey: engineKeys.prs(scope ?? "", state),
    queryFn: () => engineClient.prs({ scope: scope!, state }),
    enabled: scope !== null,
    gcTime: HISTORY_GC_TIME,
  });
}

function useNodeIssues(scope: string | null, state: "open" | "closed") {
  return useQuery({
    queryKey: engineKeys.issues(scope ?? "", state),
    queryFn: () => engineClient.issues({ scope: scope!, state }),
    enabled: scope !== null,
    gcTime: HISTORY_GC_TIME,
  });
}

/** Interpreted pull-request view for the rail's OPEN PRS / RECENT PRS sections.
 *  `state` selects open (default) or recently-merged PRs. */
export function usePRsView(
  scope: string | null,
  state: "open" | "merged" = "open",
): PRsView {
  const query = useNodePrs(scope, state);
  const loading = scope !== null && query.isPending;
  return derivePRsView(query.data, query.error ?? null, loading);
}

/** Interpreted issue view for the rail's OPEN ISSUES section. */
export function useIssuesView(
  scope: string | null,
  state: "open" | "closed" = "open",
): IssuesView {
  const query = useNodeIssues(scope, state);
  const loading = scope !== null && query.isPending;
  return deriveIssuesView(query.data, query.error ?? null, loading);
}

/**
 * Bulk ego-network fetch for the stage's working set (layer-ownership, F-H1):
 * one neighbors query per id, fanned out through `useQueries`, so the app/scene
 * layers never call the engine client directly - the stores layer stays the sole
 * wire client. Mirrors `useNodeNeighbors`'s per-id key + shape; returns the query
 * results array so the caller reads each `.data` / `.dataUpdatedAt`.
 */
/** Ceiling on concurrent ego fetches (perf-sweep F#6). Each working-set id fans
 * out one `/neighbors` round-trip; without a bound, a pathological working set
 * (a future "expand all", or a runaway expansion) fires unbounded concurrent
 * requests at the engine. The cap is far above normal interactive use (a user
 * expands a handful of nodes), so it never bites real usage — it only prevents
 * the latent cliff. */
const MAX_BULK_NEIGHBOR_IDS = 96;

export function useNodeNeighborsBulk(
  ids: readonly string[],
  scope: string | null,
  depth = 1,
) {
  // Bound the fan-out; the most-recently-added ids (working-set tail) win when
  // the set exceeds the cap, since those are the user's latest expansions.
  const bounded =
    ids.length > MAX_BULK_NEIGHBOR_IDS ? ids.slice(-MAX_BULK_NEIGHBOR_IDS) : ids;
  return useQueries({
    queries: bounded.map((id) => ({
      queryKey: engineKeys.neighbors(scope ?? "", id, depth),
      queryFn: () => engineClient.nodeNeighbors(id, { scope: scope!, depth }),
      // Skip synthesized feature aggregates — the engine has no ego network for a
      // `feature:<tag>` id (it 404s); expanding one is a no-op, not a degraded
      // request. Real nodes (doc:, …) expand as before.
      enabled: scope !== null && isAddressableNode(id),
    })),
  });
}

export function useNodeEvidence(id: string | null, scope: string | null) {
  return useQuery({
    queryKey: engineKeys.evidence(scope ?? "", id ?? ""),
    queryFn: () => engineClient.nodeEvidence(id!, scope!),
    enabled: scope !== null && isAddressableNode(id),
  });
}

// --- node-scoped semantic discover (canvas-controls ADR) ---------------------
//
// Discover is `POST /nodes/{id}/discover` returning ranked candidate edges that
// never auto-assert (contract §4). The chrome panel is a dumb view: it MUST NOT
// fetch the engine itself (dashboard-layer-ownership — stores is the sole wire
// client). This hook is that single wire seam; the panel consumes it and reads
// the interpreted view below, never `engineClient.discover` or the raw `tiers`
// block. Disabled until a node is actually open; `retry:false` so a rag-down
// 502 surfaces immediately as the designed discover-offline state rather than
// after backoff.

/** The interpreted discover view the panel renders: loading / offline / the
 *  ranked candidates. Degradation (rag absent → a 502 or a `semantic` tier
 *  reporting unavailable) is a DESIGNED state, never an anonymous error. */
export interface DiscoverView {
  /** The discover request is in flight with no held candidates. */
  loading: boolean;
  /**
   * Designed degradation: rag is not available. Sourced from a tiers-bearing
   * error envelope marking `semantic` unavailable, a served block that marks
   * it unavailable, OR a plain transport failure on the discover route (the
   * route only fails when rag is down). Rendered as discover-offline, not an
   * error.
   */
  offline: boolean;
  /** The ranked candidate edges when served; empty array while loading/offline. */
  candidates: EngineEdge[];
}

const DISCOVER_TIER = "semantic";

/**
 * Derive the discover view (loading / offline / candidates) from a discover
 * query's data + error + pending flags, reading the `semantic` tier ONLY here
 * in the stores layer so the panel consumes interpreted truth, never the raw
 * `tiers` block. A served block (success or a tiers-bearing error envelope)
 * marking `semantic` unavailable degrades; a tiers-less transport fault on this
 * route is still rag-down (the route fails only when rag is absent), so it maps
 * to offline too — the panel never renders a bare error here.
 */
export function deriveDiscoverView(
  data: DiscoverResponse | undefined,
  error: unknown,
  loading: boolean,
  enabled: boolean,
): DiscoverView {
  if (!enabled) return { loading: false, offline: false, candidates: [] };
  const errTiers = error instanceof EngineError ? error.tiers : undefined;
  const tiers = data?.tiers ?? errTiers;
  const tierDegraded =
    tiers !== undefined &&
    (tiers[DISCOVER_TIER] === undefined || tiers[DISCOVER_TIER]?.available === false);
  // Any error on the discover route is rag-down (the route fails only then), so
  // a tiers-less transport fault is still the designed offline state.
  const offline = error !== null || tierDegraded;
  return {
    loading,
    offline,
    candidates: data?.candidates ?? [],
  };
}

/**
 * Stores hook: node-scoped semantic discovery for the open node, read through
 * the wire client so the discover panel consumes the interpreted view instead
 * of fetching itself. `nodeId === null` means the panel is closed: the query is
 * disabled and the view is the inert closed state.
 */
export function useDiscover(nodeId: string | null, scope: string | null): DiscoverView {
  const enabled = scope !== null && nodeId !== null;
  const query = useQuery({
    queryKey: engineKeys.discover(scope ?? "", nodeId ?? ""),
    queryFn: () => engineClient.discover(nodeId!, scope!),
    enabled,
    retry: false,
  });
  return deriveDiscoverView(
    query.data,
    query.error ?? null,
    enabled && query.isPending,
    enabled,
  );
}

export function useEngineEvents(
  scope: string | null,
  range: { from?: string; to?: string } = {},
  bucket?: string,
) {
  return useQuery({
    queryKey: engineKeys.events(scope ?? "", range, bucket),
    queryFn: () => engineClient.events({ scope: scope!, ...range, bucket }),
    enabled: scope !== null,
  });
}

/**
 * The bounded temporal-lineage projection for the timeline (dashboard-timeline
 * ADR, W02.P04.S22). Wraps `engineClient.lineage` so the timeline surface is a
 * dumb single-selector consumer (dashboard-layer-ownership: the stores layer is
 * the sole wire client) — the surface never fetches the engine, never reads the
 * raw `tiers` block, and defines no lineage shape of its own. Returns the dated
 * nodes + self-consistent arcs + `tiers` + honest `truncated`; disabled when
 * scope is null (no worktree resolved yet), following the `useGraphSlice` /
 * `useEngineEvents` enabled-on-scope pattern. The (scope, range, filter) key
 * triple makes a range scrub or a feature filter its own cache entry.
 */
export function useTimelineLineage(
  scope: string | null,
  range: { from?: string; to?: string } = {},
  filter?: string,
  asOf?: string | number,
) {
  const query = useQuery({
    queryKey: engineKeys.lineage(scope ?? "", range, filter, asOf),
    queryFn: () =>
      engineClient.lineage({
        scope: scope!,
        ...range,
        filter,
        // BLOB-TRUE as-of (dashboard-timeline ADR fast-follow): when the timeline
        // is in time-travel it passes the (settled/debounced) playhead instant, so
        // the slice reflects the graph at T, not just creation-date gating. Absent
        // (LIVE) = live graph. A distinct `asOf` is its own cache entry (above).
        t: asOf == null ? undefined : String(asOf),
      }),
    enabled: scope !== null,
    // Flicker-free refresh on a BESPOKE backend signal: the timeline holds its
    // dataset in memory and windows it client-side, so this query refetches ONLY
    // when its identity changes — a graph generation bump (the SSE delta clock
    // invalidates the `lineage` subtree) or a filter/as-of switch, never on
    // navigation. `placeholderData` keeps the PREVIOUS dataset rendered across
    // that refetch so the surface never blanks/reloads (the user-visible flicker
    // the range-keyed fetch used to cause). Continuous, never destroyed.
    placeholderData: keepPreviousData,
  });
  return withManualRetry(query);
}

export interface TimelineLineageView {
  loading: boolean;
  errored: boolean;
  nodes: LineageNode[];
  arcs: LineageArc[];
  retry: () => void;
}

export function deriveTimelineLineageView(
  data: LineageSlice | undefined,
  loading: boolean,
  errored: boolean,
  retry: () => void = noopRetry,
): TimelineLineageView {
  const slice = loading || errored ? undefined : data;
  return {
    loading,
    errored,
    nodes: slice?.nodes ?? [],
    arcs: slice?.arcs ?? [],
    retry,
  };
}

/**
 * Stores selector for the timeline's bounded lineage read. The timeline surface
 * consumes interpreted loading/error state and stable node/arc arrays instead of
 * branching on raw query flags and optional payload fields.
 */
export function useTimelineLineageView(
  scope: string | null,
  range: { from?: string; to?: string } = {},
  filter?: string,
  asOf?: string | number,
): TimelineLineageView {
  const lineage = useTimelineLineage(scope, range, filter, asOf);
  return useMemo(
    () =>
      deriveTimelineLineageView(
        lineage.data,
        lineage.isLoading,
        lineage.isError,
        lineage.retry,
      ),
    [lineage.data, lineage.isError, lineage.isLoading, lineage.retry],
  );
}

/**
 * Graph diff between two timestamps (§5 /graph/diff). Returns the set of
 * add/remove/change operations on nodes and edges between `from` and `to`
 * (millisecond timestamps or ISO strings). Disabled when scope is null or
 * the window is empty (from === to). Cache keys fold both endpoints so two
 * windows never collide, and fold the optional filter because it changes the
 * served delta set (mirrors engineKeys.graph folding filter/as-of).
 */
export function useGraphDiff(
  scope: string | null,
  from: string | number,
  to: string | number,
  filter?: string,
) {
  return useQuery({
    queryKey: engineKeys.diff(scope ?? "", from, to, filter),
    queryFn: () => engineClient.graphDiff({ scope: scope!, from, to, filter }),
    enabled: scope !== null && String(from) !== String(to),
  });
}

export function useEngineSearch(
  scope: string | null,
  query: string,
  target: "vault" | "code" = "vault",
) {
  return useQuery({
    queryKey: engineKeys.search(scope ?? "", query, target),
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        SEARCH_QUERY_TIMEOUT_MS,
      );
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      try {
        return await engineClient.search(
          { scope: scope!, query, target },
          controller.signal,
        );
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    },
    enabled: scope !== null && query.length > 0,
    // Search is user-driven and has an explicit retry affordance. Do not let the
    // shared transient retry policy prolong a bounded search timeout into a
    // second spinner cycle.
    retry: false,
    // Evict superseded search results promptly (B7, resource-hardening): a long
    // search session issues many distinct query strings, each a fresh cache
    // entry holding a SearchResponse. A short gcTime drops a result soon after
    // its observer goes (query changed / panel closed), bounding cache count
    // instead of holding every term for the global 120s default.
    gcTime: 30_000,
  });
}

const SEARCH_QUERY_TIMEOUT_MS = 5_000;

// --- session / settings (user-state-persistence W04.P08.S26) -------------------------
//
// The durable "where am I" session and the user settings, consumed through
// stores hooks so chrome and scene never touch the wire (dashboard-layer-
// ownership). `useSession` is what Stage reads on load to restore the persisted
// active scope instead of recomputing a default — the reload-amnesia cure. The
// mutation hooks persist a selection and invalidate their own key so the read
// re-fetches the authoritative server shape.

/** Read the current session — the restore-on-load source of truth. */
export function useSession() {
  return useQuery({
    queryKey: engineKeys.session(),
    queryFn: () => engineClient.session(),
  });
}

/** True when a session mutation was rejected by the engine as a bad request. */
export function isSessionMutationRejected(error: unknown): boolean {
  return error instanceof EngineError && error.status === 400;
}

/** Read user settings (global + per-scope scoped keys). */
export function useSettings() {
  return useQuery({
    queryKey: engineKeys.settings(),
    queryFn: () => engineClient.settings(),
  });
}

/**
 * Read the engine-owned settings schema registry — the single source of truth
 * the settings dialog renders its controls and defaults from (dashboard-settings).
 * The schema is stable for a deployment, so it is cached long and never
 * invalidated by a value write; only the schema itself changing (a redeploy)
 * would alter it.
 */
export function useSettingsSchema() {
  return useQuery({
    queryKey: engineKeys.settingsSchema(),
    queryFn: () => engineClient.settingsSchema(),
    staleTime: Infinity,
    // Bounded by default (bounded-by-default-for-every-accumulator): a
    // staleTime:Infinity query MUST still declare a gcTime so an unobserved
    // schema entry is reclaimed rather than lingering on the default. The
    // schema is tiny and cheap to refetch, so a short window suffices.
    gcTime: 60_000,
  });
}

export interface SettingsDialogView {
  schemaLoading: boolean;
  groups: SettingsGroup[];
}

export interface ThemeSettingView {
  serverTheme: string | undefined;
  themeMembers: readonly string[];
}

export interface SettingsEffectsView {
  reduceMotion: boolean;
  graphDefaults: GraphSettingsDefaults | null;
}

export function deriveSettingsDialogView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: string | null,
  schemaLoading: boolean,
): SettingsDialogView {
  return {
    schemaLoading,
    groups: resolveSettings(schema, settings, activeScope),
  };
}

export function deriveThemeSettingView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
): ThemeSettingView {
  const themeSetting = resolveEffectiveSetting(
    schema,
    settings,
    null,
    CONSUMED_SETTING_KEYS.theme,
  );
  return {
    serverTheme: themeSetting?.value,
    themeMembers: settingEnumMembers(themeSetting?.def),
  };
}

export function deriveSettingsEffectsView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: string | null,
): SettingsEffectsView {
  return {
    reduceMotion: resolveReduceMotionSetting(schema, settings),
    graphDefaults: resolveGraphSettingsDefaults(schema, settings, activeScope),
  };
}

/**
 * Stores selector for the schema-driven settings dialog. It composes the schema
 * registry and persisted values into resolved groups so app chrome never
 * re-implements effective-value precedence or query loading semantics.
 */
export function useSettingsDialogView(activeScope: string | null): SettingsDialogView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsDialogView(
    schema.data,
    settings.data,
    activeScope,
    schema.isLoading,
  );
}

/**
 * Stores selector for the platform theme bridge. Theme application stays in the
 * app/platform bridge, but effective-value resolution stays in this layer.
 */
export function useThemeSettingView(): ThemeSettingView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveThemeSettingView(schema.data, settings.data);
}

/**
 * Stores selector for settings side effects. The app bridge applies document
 * attributes and one-time dashboard defaults, but settings interpretation stays
 * centralized here.
 */
export function useSettingsEffectsView(
  activeScope: string | null,
): SettingsEffectsView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsEffectsView(schema.data, settings.data, activeScope);
}

/**
 * Persist a partial session update (active scope, scope context, or a recent).
 * On success the server returns the full updated session, which seeds the cache
 * directly AND triggers an invalidation so any other observer re-reads. A
 * rejected switch (unknown scope → tiered 400) rejects the mutation; callers
 * surface it gracefully and the persisted state stays unchanged.
 */
export function usePutSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionUpdate) => engineClient.putSession(body),
    onSuccess: (session) => {
      // A session mutation may carry a registry mutation (select/add/forget a
      // workspace, dashboard-workspace-registry ADR), so refresh the registry
      // enumeration too — the picker re-reads the authoritative roots + active
      // marker without a separate mutation hook.
      seedSessionCache(queryClient, session);
    },
  });
}

/** Persist a single settings write; seed + invalidate the settings cache. */
export function usePutSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingUpdate) => engineClient.putSettings(body),
    onSuccess: (settings) => {
      queryClient.setQueryData(engineKeys.settings(), settings);
      void queryClient.invalidateQueries({ queryKey: engineKeys.settings() });
    },
  });
}

// --- document write/create mutations (document-editor backend) -------------------
//
// The save/create/frontmatter mutations the editor drives. They run through the
// ONE platform ops-dispatch seam (`dispatchOps`, opsActions) — NOT a direct
// engine-client call — so every vault mutation stays logged, traced, and centrally
// guardable, exactly like the rag control verbs (dashboard-layer-ownership: the app
// layer never reaches the engine client itself). The dispatch resolves with the
// brokered `OpsResult`; `adaptOpsWrite` interprets the sibling envelope's `status`
// + `data` into the typed `OpsWriteResult` (saved / conflict / refused / created),
// branching on those fields and NEVER on the HTTP code (the wire returns 200 for
// both success and business-refusal). A conflict/refusal is a typed result the
// caller drives editor state from — NOT a thrown error — so the mutation resolves
// (never rejects) on a business outcome; only a transport fault (a tiers-bearing
// EngineError) rejects. Concurrency rides the read's echoed `blob_hash`; degradation
// is read from the result's tiers, never guessed from transport
// (degradation-is-read-from-tiers-not-guessed-from-errors).

/** Strip the `doc:` prefix from a node id to recover the document STEM the write
 *  ops address by (`ref`). A non-`doc:` id passes through unchanged so a caller
 *  that already holds a bare stem is tolerated. */
export function stemFromNodeId(nodeId: string): string {
  return nodeId.startsWith("doc:") ? nodeId.slice("doc:".length) : nodeId;
}

/** Run a write op through the ops-dispatch seam and interpret its result; surface
 *  the brokered tiers alongside the typed outcome so the caller can read
 *  degradation from tiers (never from transport). */
async function runWriteOp(
  verb: string,
  body: {
    scope?: string;
    ref: string;
    body?: string;
    expected_blob_hash?: string;
    date?: string;
    tags?: string[];
    related?: string[];
  },
): Promise<{ result: OpsWriteResult; tiers: TiersBlock }> {
  const ops: OpsResult = await dispatchOps({
    target: "core",
    verb,
    mode: "write",
    body,
  });
  return { result: adaptOpsWrite(ops), tiers: ops.tiers };
}

/** The arguments to a body save: the open doc's node id + scope, the new text, and
 *  the optimistic-concurrency base (the `blob_hash` the draft was read at). */
export interface SaveBodyArgs {
  nodeId: string;
  scope: string | null;
  text: string;
  baseBlobHash: string;
}

function invalidateQueryPrefix(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): void {
  void queryClient.invalidateQueries({ queryKey, exact: false });
}

function invalidateScopedStreams(queryClient: QueryClient, scope: string): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        key[0] === engineKeys.all[0] &&
        key[1] === "stream" &&
        key[key.length - 1] === scope
      );
    },
  });
}

function invalidateScopedQuerySubtree(
  queryClient: QueryClient,
  subtree: (typeof GRAPH_GENERATION_QUERY_SUBTREES)[number],
  scope: string,
): void {
  if (subtree === "stream") {
    invalidateScopedStreams(queryClient, scope);
    return;
  }
  invalidateQueryPrefix(queryClient, [...engineKeys.all, subtree, scope]);
}

function invalidateGraphGenerationSubtrees(
  queryClient: QueryClient,
  scope: string,
): void {
  for (const subtree of GRAPH_GENERATION_QUERY_SUBTREES) {
    invalidateScopedQuerySubtree(queryClient, subtree, scope);
  }
}

/**
 * Invalidate every read surface a successful vault mutation can stale. A write or
 * create changes the document bytes, the current graph generation, the vault/code
 * tree projections, git dirty/change reads, and any graph-derived node/search
 * projections. Centralizing the sweep keeps save/frontmatter/create enrolled in
 * the same stack-managed refresh boundary.
 */
export function invalidateAfterVaultMutation(
  queryClient: QueryClient,
  scope: string | null,
  nodeId?: string,
): void {
  if (scope !== null && nodeId !== undefined) {
    void queryClient.invalidateQueries({
      queryKey: engineKeys.content(scope, nodeId),
    });
  }

  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.map() });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "search"]);

  if (scope !== null) {
    invalidateGraphGenerationSubtrees(queryClient, scope);
    void queryClient.invalidateQueries({ queryKey: engineKeys.gitChanges(scope) });
    invalidateQueryPrefix(queryClient, [...engineKeys.all, "file-tree", scope]);
    invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff", scope]);
  }
}

/**
 * Invalidate graph-generation projections after an external watcher rebuild or
 * graph stream recovery. This is narrower than a local vault mutation because it
 * does not imply a local git/status write, but the graph-derived readers must all
 * re-read from the new generation rather than keeping stale node/tree/facet
 * projections.
 */
export function invalidateGraphGenerationReads(
  queryClient: QueryClient,
  scope: string,
): void {
  invalidateGraphGenerationSubtrees(queryClient, scope);
}

/**
 * Backend `git` signal recovery invalidation. `/status` carries the dirty/ahead
 * rollup, while `/ops/git/status|numstat|diff` and `/history` are separate scoped
 * projections. A git stream frame means the rollup, per-scope git reads, and
 * commit history may be stale, so refresh them from the same stores-owned
 * recovery seam.
 */
export function invalidateGitRecoveryReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-changes"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-histdiff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "history"]);
}

/**
 * Save the open document's body (`set-body`). Resolves with the typed
 * `OpsWriteResult` — a `conflict` (the optimistic blob-hash base went stale) or a
 * `refused` (a validation rejection) is a typed result the caller drives editor
 * state from, NOT a thrown error; only a transport fault rejects. On a `saved`
 * outcome the vault-mutation read surfaces are invalidated so the next read
 * returns the new blob, graph generation, tree rows, git dirty/change state, and
 * graph-derived projections. The new `blob_hash` is echoed in the result for the
 * caller to adopt as the next optimistic-concurrency base.
 */
export function useSaveBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SaveBodyArgs) =>
      runWriteOp("set-body", {
        scope: args.scope ?? undefined,
        ref: stemFromNodeId(args.nodeId),
        body: args.text,
        expected_blob_hash: args.baseBlobHash,
      }),
    onSuccess: ({ result }, args) => {
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, args.scope, args.nodeId);
      }
    },
  });
}

/** The arguments to a frontmatter write (`set-frontmatter`): the open doc + scope,
 *  plus the metadata fields to set. The body text is untouched. */
export interface SetFrontmatterArgs {
  nodeId: string;
  scope: string | null;
  date?: string;
  tags?: string[];
  related?: string[];
  baseBlobHash: string;
}

/**
 * Set the open document's frontmatter (`set-frontmatter`): date / tags / related.
 * Same typed-result discipline as `useSaveBody` — a `conflict`/`refused` resolves
 * (never throws); a frontmatter validation refusal arrives as a `refused` carrying
 * the `checks` + `errors` so the editor explains the rejection without parsing
 * prose. Invalidates the shared vault-mutation read surfaces on a successful save.
 */
export function useSetFrontmatter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SetFrontmatterArgs) =>
      runWriteOp("set-frontmatter", {
        scope: args.scope ?? undefined,
        ref: stemFromNodeId(args.nodeId),
        expected_blob_hash: args.baseBlobHash,
        date: args.date,
        tags: args.tags,
        related: args.related,
      }),
    onSuccess: ({ result }, args) => {
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, args.scope, args.nodeId);
      }
    },
  });
}

/** The arguments to a document create (`create`): the scope it lands in, the doc
 *  type + feature (the only required fields), an optional title, and optional
 *  related stems. */
export interface CreateDocArgs {
  scope: string | null;
  docType: string;
  feature: string;
  title?: string;
  related?: string[];
}

/**
 * Create a new document (`create`). Resolves with `{ result, nodeId }` where
 * `result` is the typed `OpsWriteResult` (`created` on success, carrying the new
 * doc's `path` + `stem`; `refused` on a validation rejection) and `nodeId` is the
 * synthesized `doc:<stem>` id (null when the create was refused). On a `created`
 * outcome the same vault-mutation read surfaces are invalidated as a save (a new
 * doc can introduce tree rows, graph nodes, filter facets, search hits, and git
 * change entries).
 */
export function useCreateDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: CreateDocArgs,
    ): Promise<{
      result: OpsWriteResult;
      tiers: TiersBlock;
      nodeId: string | null;
    }> => {
      const ops: OpsResult = await dispatchOps({
        target: "core",
        verb: "create",
        mode: "create",
        body: {
          scope: args.scope ?? undefined,
          doc_type: args.docType,
          feature: args.feature,
          title: args.title,
          related: args.related,
        },
      });
      const result = adaptOpsWrite(ops);
      const nodeId = result.kind === "created" ? docNodeIdFromStem(result.stem) : null;
      return { result, tiers: ops.tiers, nodeId };
    },
    onSuccess: ({ result }, args) => {
      if (result.kind === "created") {
        invalidateAfterVaultMutation(queryClient, args.scope);
      }
    },
  });
}

// --- read-side editor derivations (document-editor backend) ----------------------
//
// The editor's read-side projections — all derived from EXISTING wire reads (the
// graph node payload, the content text, the parsed frontmatter), NO new content-
// endpoint field. Each is a pure projection over a query the stores layer already
// owns (views-are-projections-of-one-model): the editor chrome consumes the derived
// view, never re-deriving from the raw graph slice or re-fetching.

/**
 * Derive a node's `doc_type` from the graph slice (the `EngineNode.doc_type`
 * facet). Pure: scans the served nodes for the id and returns its type, or null
 * when the node is absent / carries no type. No new wire field — the doc type
 * already rides every document node.
 */
export function deriveDocType(
  nodeId: string | null,
  nodes: EngineNode[] | undefined,
): string | null {
  if (nodeId === null || !nodes) return null;
  const node = nodes.find((n) => n.id === nodeId);
  return node?.doc_type ?? null;
}

/**
 * Stores hook: the open node's `doc_type`, read from the active scope's graph
 * slice. A projection over the SAME `/graph/query` the canvas consumes (no new
 * read); the editor uses it to pick the right frontmatter template / validation.
 */
export function useDocType(nodeId: string | null, scope: string | null): string | null {
  const slice = useGraphSlice(scope, undefined, undefined, "document");
  return deriveDocType(nodeId, slice.data?.nodes);
}

/** Words-per-minute the read-time estimate assumes (a common prose reading pace). */
export const READ_TIME_WPM = 200;

/** A read-time estimate derived from the document text: the minute count and
 *  whether it is a floor (the served body was truncated, so the true read time is
 *  AT LEAST this — honest "≥ N min"). */
export interface ReadTimeEstimate {
  /** Whole minutes (ceil of words ÷ WPM); at least 1 for any non-empty body. */
  minutes: number;
  /** True when the served body was truncated — the estimate is a floor. */
  atLeast: boolean;
  /** The counted word total of the served (possibly truncated) text. */
  words: number;
}

/**
 * Derive a read-time estimate from the content text (word count ÷ ~200 wpm). When
 * the served body was truncated (`truncated` non-null), the estimate is an honest
 * FLOOR (`atLeast: true`) — the true read time is at least this, never a fabricated
 * exact value over a partial body. Pure over the already-fetched content text; no
 * new wire field.
 */
export function deriveReadTime(
  text: string,
  truncated: ContentTruncated | null,
): ReadTimeEstimate {
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / READ_TIME_WPM));
  return { minutes, atLeast: truncated !== null, words };
}

/**
 * Stores hook: the open document's read-time estimate, derived from its content
 * view's text (a projection over the SAME `/nodes/{id}/content` read the markdown
 * reader consumes). Honest floor when the body was truncated.
 */
export function useReadTime(
  nodeId: string | null,
  scope: string | null,
): ReadTimeEstimate {
  const content = useContentView(nodeId, scope);
  return deriveReadTime(content.text, content.truncated);
}

/** One resolved related-link: the related document's `doc:<stem>` id and the
 *  structural state of the open node's outbound edge to it (`resolved` when the
 *  link lands on a live node, `stale`/`broken` when the edge says so, or `absent`
 *  when the frontmatter names a related stem the graph carries no edge for). */
export interface LinkResolution {
  /** The related document stem named in the frontmatter. */
  stem: string;
  /** The synthesized `doc:<stem>` target node id. */
  nodeId: string;
  /** The structural state of the open node's outbound edge to the target, or
   *  `absent` when no such edge exists in the served slice. */
  state: "resolved" | "stale" | "broken" | "absent";
}

/**
 * Derive the resolution state of each frontmatter `related:` link: join the parsed
 * related stems (→ `doc:<stem>`) against the open node's OUTBOUND structural edges
 * in the graph slice, reading each edge's `state` (`resolved`/`stale`/`broken`). A
 * related stem the slice carries no matching outbound edge for is `absent` (the
 * frontmatter names it but the graph has no structural link yet) — surfaced
 * honestly, never silently dropped. Pure over the parsed frontmatter + the served
 * edges; no new wire field.
 */
export function deriveLinkResolution(
  nodeId: string | null,
  text: string,
  edges: EngineEdge[] | undefined,
): LinkResolution[] {
  if (nodeId === null) return [];
  const related = parseDocument(text).frontmatter?.related ?? [];
  // Index the open node's outbound STRUCTURAL edges by destination so each related
  // stem reads its edge state in one pass.
  const outbound = new Map<string, EngineEdge["state"]>();
  for (const edge of edges ?? []) {
    if (edge.src === nodeId && edge.tier === "structural") {
      outbound.set(edge.dst, edge.state);
    }
  }
  return related.map((stem) => {
    const targetId = docNodeIdFromStem(stem);
    const state = outbound.get(targetId);
    return {
      stem,
      nodeId: targetId,
      state: state ?? "absent",
    };
  });
}

/**
 * Stores hook: the resolution state of the open document's frontmatter `related:`
 * links — each related stem joined to the open node's outbound structural edge
 * state in the graph slice. A projection over the content text (frontmatter) + the
 * SAME `/graph/query` the canvas consumes; the editor renders resolved / stale /
 * broken / absent affordances from it without re-fetching.
 */
export function useLinkResolution(
  nodeId: string | null,
  scope: string | null,
): LinkResolution[] {
  const content = useContentView(nodeId, scope);
  const slice = useGraphSlice(
    nodeId === null ? null : scope,
    undefined,
    undefined,
    "document",
  );
  return deriveLinkResolution(nodeId, content.text, slice.data?.edges);
}

// --- git working-tree state (git-diff-browser ADR) -----------------------------------
//
// The git diff browser is app chrome; it consumes git state through these stores
// selectors and NEVER reads the raw `tiers` block (dashboard-layer-ownership). The
// LIVE `/status` snapshot carries `git: { branch (from head_ref), ahead?, behind?,
// dirty: boolean }` — a clean/dirty BOOLEAN, NOT a per-file list, and ahead/behind
// that are absent when no upstream is configured. `git` is NOT one of the canonical
// tiers (`declared`/`structural`/`temporal`/`semantic`), so git availability is
// derived from the PRESENCE of the `git` payload, never from a (non-existent) git
// tier. When the engine responds but carries no `git` object, that is the designed
// "no repository state" degraded state; a tiers-less transport fault is the error.
//
// RICHER CAPABILITIES (now SERVED by the read-only `/ops/git/{verb}` pass-through —
// the engine forwards porcelain `status`, `numstat`, and unified `diff` for a path
// VERBATIM, with NO diff algorithm and NO mutating verb, by construction
// `engine-read-and-infer`): the per-file CHANGED-FILES LIST (from porcelain status
// + numstat) and the per-file DIFF BODY (from unified diff). The selectors below
// fetch them through the stores layer's `client.opsGit` seam and parse git's
// verbatim text (`parseGitStatus` / `parseGitNumstat` / `parseUnifiedDiff`) into the
// status-grouped list and hunk-by-hunk shapes the chrome renders.

/** The per-file changed-files list IS served (porcelain status + numstat). */
export const CHANGED_FILES_LIST_SERVED = true;
/** The read-only per-file diff body IS served (unified diff for a path). */
export const GIT_DIFF_CAPABILITY_SERVED = true;

export interface GitStatusView {
  /** The status snapshot is in flight with no held git data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** Designed degradation: the engine responded but carries no git payload. */
  degraded: boolean;
  /** The git rollup when available; undefined while loading/degraded/errored. */
  git?: NonNullable<EngineStatus["git"]>;
  /**
   * The working tree is dirty (live `dirty: boolean`). True iff git is available
   * AND dirty. The per-file changed list is served separately by `useChangedFiles`
   * (porcelain status + numstat); this boolean is the header's clean/dirty pill.
   */
  dirty: boolean;
}

/** The git view plus a retry bound to the STATUS query (not some other query). */
export interface GitStatusHookView extends GitStatusView {
  /** Refetch the status snapshot — the source of git state (LOW: not events). */
  retry: () => void;
}

/**
 * Derive the git working-tree view (loading / degraded / errored / available)
 * from a status query's data + error + pending flags, reading the `git` payload
 * ONLY here in the stores layer so the surface consumes interpreted truth, never
 * `status.data.tiers`. `git` is not a tier: availability tracks the PRESENCE of
 * the `git` object. An engine response with no git payload is designed
 * degradation; a tiers-less transport fault is the errored branch.
 */
export function deriveGitStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): GitStatusView {
  if (data?.git) {
    return {
      loading: false,
      errored: false,
      degraded: false,
      git: data.git,
      dirty: data.git.dirty,
    };
  }
  // No git payload. A served response (success data OR a tiers-bearing error
  // envelope, i.e. the engine answered) is designed degradation; a tiers-less
  // fault is the errored branch; otherwise still in flight.
  const answered =
    data !== undefined || (error instanceof EngineError && error.tiers !== undefined);
  if (answered) {
    return { loading: false, errored: false, degraded: true, dirty: false };
  }
  if (error) return { loading: false, errored: true, degraded: false, dirty: false };
  return { loading: pending, errored: false, degraded: false, dirty: false };
}

/**
 * Stores hook: the active worktree's git working-tree view, read through the
 * status query so the git diff browser consumes interpreted state instead of the
 * raw `tiers` block. The surface renders loading / degraded / errored / available
 * directly from this, never inspecting `status.data.tiers`.
 */
export function useGitStatus(): GitStatusHookView {
  const status = useEngineStatus();
  const view = deriveGitStatusView(status.data, status.error, status.isPending);
  return { ...view, retry: () => void status.refetch() };
}

// --- vaultspec-core status (status rollup) ------------------------------------------
//
// The core rollup is app chrome; it consumes interpreted status through this stores
// selector and never inspects `status.core` directly (dashboard-layer-ownership).
// The `/status` snapshot carries `core: { reachable, vault_health? }` when the
// engine can report core health. Missing/unreachable core is a designed down state;
// a tiers-less transport fault is the errored branch.

export interface CoreStatusView {
  /** The status snapshot is in flight with no held core data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope). */
  errored: boolean;
  /** Whether vaultspec-core is reachable according to the served status rollup. */
  reachable: boolean;
  /** The forwarded core vault health word, when present. */
  vaultHealth?: string;
}

export function deriveCoreStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): CoreStatusView {
  if (data?.core) {
    return {
      loading: false,
      errored: false,
      reachable: data.core.reachable,
      vaultHealth: data.core.vault_health,
    };
  }
  if (error) {
    return { loading: false, errored: true, reachable: false };
  }
  return { loading: pending, errored: false, reachable: false };
}

export function useCoreStatus(): CoreStatusView {
  const status = useEngineStatus();
  return deriveCoreStatusView(status.data, status.error, status.isPending);
}

// --- location anchor (status-overview ADR: "Where are we?") -------------------------
//
// The "Where are we?" anchor composes EXISTING wire reads — the active scope (the
// absolute worktree path, canonical token, forward slashes), the worktree it
// belongs to from `/map` (branch + is_main), and the git rollup from `/status`
// (branch + dirty/ahead/behind) — into ONE interpreted view so the Status tab
// (dumb chrome) reads a single selector and never iterates `map.data.repositories`
// or reads the raw `tiers` block (dashboard-layer-ownership). No new wire read.

/** The interpreted location anchor the Status overview header renders. */
export interface LocationAnchorView {
  /** The absolute worktree path being browsed (canonical token, forward slashes). */
  path: string | null;
  /** The current git branch (preferring the `/map` worktree, then the git rollup). */
  branch: string | null;
  /** True when the active scope is the repository's main/default worktree. */
  isMain: boolean;
  /** Working-tree dirty truth from the git rollup (false when unknown/clean). */
  dirty: boolean;
  /** Commits ahead of upstream; undefined = no upstream configured (not zero). */
  ahead?: number;
  /** Commits behind upstream; undefined = no upstream configured (not zero). */
  behind?: number;
}

/**
 * Derive the location anchor from the active scope, the workspace map, and the git
 * status view. Pure projection over already-fetched reads: it matches the active
 * scope to its `/map` worktree (for branch + is_main) and falls back to the git
 * rollup's branch when the map has not resolved the worktree yet. The dirty /
 * ahead / behind chips come from the git rollup. Reads no raw `tiers` block.
 */
export function deriveLocationAnchor(
  scope: string | null,
  map: MapResponse | undefined,
  git: GitStatusView,
): LocationAnchorView {
  let branch: string | null = git.git?.branch ?? null;
  let isMain = false;
  if (scope && map) {
    for (const repo of map.repositories) {
      // The live engine's scope token IS the worktree path; match on either the
      // path or the stable id so the anchor resolves on the live origin and the
      // mock (whose worktree id and path differ) alike.
      const wt = repo.worktrees.find((w) => w.path === scope || w.id === scope);
      if (wt) {
        branch = wt.branch || branch;
        isMain = wt.is_default === true;
        break;
      }
    }
  }
  return {
    path: scope,
    branch,
    isMain,
    dirty: git.dirty,
    ahead: git.git?.ahead,
    behind: git.git?.behind,
  };
}

/**
 * Stores hook: the interpreted location anchor for the Status overview header,
 * composing the active scope, `/map`, and `/status` git rollup so the rail (dumb
 * chrome) reads one selector. The active scope is passed in by the caller (it
 * already holds it via `useActiveScope`), keeping this hook a pure composition of
 * the two stores reads.
 */
export function useLocationAnchor(scope: string | null): LocationAnchorView {
  const map = useWorkspaceMap();
  const git = useGitStatus();
  return deriveLocationAnchor(scope, map.data, git);
}

// --- rag service status (dashboard-rag-manager ADR) ----------------------------------
//
// The rag rollup is app chrome; it reads rag readiness through this stores
// selector and NEVER inspects `status.rag` or the raw `tiers` block directly
// (dashboard-layer-ownership / rag-manager ADR "Reads status truth via stores").
// The `/status` snapshot carries `rag: { service, watcher?, index?, jobs? }` plus
// the wire `tiers` block. Per the rag-manager ADR, rag-down, rag-absent, and a
// `semantic` tier reporting unavailable are all DESIGNED degraded states sourced
// from that truth — never failures. "Readiness" is the COMPOSITE the ADR names
// (running + index present + watcher live), derived ONLY from fields the snapshot
// actually carries; no rag semantics are reconstructed here.

const RAG_TIER = "semantic";

/** The interpreted rag service view consumed by the rollup and the ops cluster. */
export interface RagStatusView {
  /** The status snapshot is in flight with no held rag data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — engine unreachable. */
  errored: boolean;
  /**
   * Designed degradation: the `semantic` tier reports unavailable (or is absent
   * from a served block). Distinct from a plain stopped/absent service — this is
   * the engine telling us the capability is down.
   */
  degraded: boolean;
  /** The engine's per-tier reason when degraded, for copy-tone rendering. */
  reason?: string;
  /**
   * The service lifecycle word verbatim from the snapshot ("running" / "stopped"
   * / "absent" / …) when a rag payload is present; undefined while loading or on
   * a tiers-less transport fault. Never synthesized.
   */
  service?: string;
  /** True only when the service word is exactly "running". */
  running: boolean;
  /** The watcher state word when present (e.g. "watching"); undefined otherwise. */
  watcher?: string;
  /** The index-present word when present (e.g. "fresh"); undefined otherwise. */
  index?: string;
  /** In-flight job count when present; undefined otherwise. */
  jobs?: number;
  /**
   * The composite readiness the ADR names: rag is "ready" only when the service
   * is running, the index is present, and the watcher is live. Derived strictly
   * from the carried fields; false whenever any is missing or the tier degrades.
   */
  ready: boolean;
}

/**
 * Derive the rag service view (loading / errored / degraded / lifecycle / composite
 * readiness) from a status query's data + error + pending flags, reading the `rag`
 * payload and the `semantic` tier ONLY here in the stores layer so the rollup and
 * the ops cluster consume interpreted truth, never `status.data.tiers` or the raw
 * `status.rag`. A served tiers block that marks `semantic` unavailable (or omits it)
 * is degradation (contract §2: absence ≠ available); a tiers-less transport fault is
 * the errored branch. The composite `ready` is true only when running + index +
 * watcher all hold — the ADR's "states the composite plainly rather than making the
 * operator infer it".
 */
export function deriveRagStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): RagStatusView {
  const tiers = tiersFromQuery({ data, error });
  const tier = tiers?.[RAG_TIER];
  const degraded = tier !== undefined && tier.available === false;
  const reason = degraded ? tier?.reason : undefined;

  if (data?.rag) {
    const rag = data.rag;
    const running = isRagRunning(rag.service);
    const ready =
      running && !degraded && rag.index !== undefined && rag.watcher !== undefined;
    return {
      loading: false,
      errored: false,
      degraded,
      reason,
      service: rag.service,
      running,
      watcher: rag.watcher,
      index: rag.index,
      jobs: rag.jobs,
      ready,
    };
  }
  // No rag payload. A tiers-bearing envelope (served snapshot OR a backend-down
  // error envelope) is designed degradation; a tiers-less fault is the errored
  // branch; otherwise the snapshot is still in flight.
  if (tiers) {
    return {
      loading: false,
      errored: false,
      degraded,
      reason,
      running: false,
      ready: false,
    };
  }
  if (error) {
    return {
      loading: false,
      errored: true,
      degraded: false,
      running: false,
      ready: false,
    };
  }
  return {
    loading: pending,
    errored: false,
    degraded: false,
    running: false,
    ready: false,
  };
}

/**
 * Stores hook: the rag service view, read through the status query so the rag
 * manager surface consumes interpreted state instead of the raw `tiers` block or
 * the raw `status.rag`. The rollup and the ops cluster render
 * loading / errored / degraded / lifecycle / readiness directly from this.
 */
export function useRagStatus(): RagStatusView {
  const status = useEngineStatus();
  return deriveRagStatusView(status.data, status.error, status.isPending);
}

export interface StatusRollupView {
  engineUnreachable: boolean;
  degradations: string[];
  git: GitStatusHookView;
  core: CoreStatusView;
  rag: RagStatusView;
}

/**
 * Stores selector for the NowStrip status rollup. The chrome reads one
 * interpreted view instead of mixing raw `/status` query state with derived
 * git/core/rag selectors, so engine-unreachable and degraded-backend copy are
 * decided in the stores layer with the rest of the status truth.
 */
export function useStatusRollup(): StatusRollupView {
  const status = useEngineStatus();
  return {
    engineUnreachable: status.isError,
    degradations: status.data?.degradations ?? [],
    git: {
      ...deriveGitStatusView(status.data, status.error, status.isPending),
      retry: () => void status.refetch(),
    },
    core: deriveCoreStatusView(status.data, status.error, status.isPending),
    rag: deriveRagStatusView(status.data, status.error, status.isPending),
  };
}

// --- work pillar availability (dashboard-activity-rail ADR) ---------------------------
//
// The right-rail `work` tab is the in-flight pipeline pillar: the active ADRs and
// plans in scope, with their wave/phase/step progress. That CONTENT and its wire are
// specified by the sibling `dashboard-pipeline-status` ADR and are out of scope for
// the activity-rail plan; what lands now is the tab FRAME with its own designed
// degraded and empty states. The frame is app chrome under dashboard-layer-ownership:
// it reads availability through this stores selector ONLY, never fetching the engine
// and never inspecting the raw `tiers` block.
//
// The pillar's documents (ADRs, plans) and their lifecycle/progress are resolved by
// the engine's STRUCTURAL read of the vault corpus, so the `structural` tier gates the
// pillar's availability (contract §2: a tier marked `available:false` OR absent from a
// served block is a designed degraded state — absence is degradation, not
// availability). Degradation is derived from the tiers truth the wire carries (the
// success envelope's `tiers`, or the FRESH error envelope's `tiers` winning over a
// stale held block), per degradation-is-read-from-tiers-not-guessed-from-errors —
// never inferred from a bare transport error. The `items` array is the seam the
// pipeline-status plan extends with the real in-flight ADR/plan list; today it is
// always empty, so a non-degraded pillar renders the designed empty state.

const WORK_PILLAR_TIER = "structural";

/**
 * The interpreted work-pillar view the `WorkTab` frame renders. `degraded` is the
 * designed-down state (the `structural` tier reports unavailable or is absent from a
 * served block); `items` carries the in-flight pipeline work once the pipeline-status
 * wire lands (empty today, so the available case is the designed empty state).
 */
export interface WorkPillarAvailability {
  /** A served tiers block reports the structural tier unavailable (or absent). */
  degraded: boolean;
  /** The structural tier's human reason when degraded, for copy-tone rendering. */
  reason?: string;
  /**
   * The in-flight pipeline work (active ADRs/plans). Empty today — this is the seam
   * the sibling dashboard-pipeline-status plan extends with the real list; the frame
   * renders the designed empty state whenever it is empty and the pillar is available.
   */
  items: readonly never[];
}

/**
 * Derive the work-pillar view from the status snapshot's served tiers block, reading
 * the `structural` tier ONLY here in the stores layer so the `WorkTab` frame consumes
 * interpreted truth, never `status.data.tiers`. A served block (success data OR a
 * tiers-bearing error envelope) that marks `structural` unavailable — or omits it — is
 * designed degradation (contract §2: absence ≠ available). A wholly absent block (a
 * tiers-less transport fault with no envelope) is NOT treated as degraded: it is the
 * query's error state, and the frame must not guess "down" from a bare transport error
 * (degradation-is-read-from-tiers-not-guessed-from-errors).
 */
export function deriveWorkPillarAvailability(
  tiers: TiersBlock | undefined,
): WorkPillarAvailability {
  const { degraded, reasons } = readTierAvailability(tiers, [WORK_PILLAR_TIER]);
  return {
    degraded,
    reason: reasons[WORK_PILLAR_TIER],
    items: [],
  };
}

/**
 * Stores hook: the work pillar's availability, read through the status query so the
 * `WorkTab` frame consumes derived truth instead of the raw `tiers` block. The FRESH
 * error envelope's tiers win over a stale held-success block so a backend-down
 * condition surfaces as designed degradation rather than a bare error. Mirrors
 * `useVaultTreeAvailability` / `useGraphSliceAvailability`.
 */
export function useWorkPillarAvailability(): WorkPillarAvailability {
  return deriveWorkPillarAvailability(tiersFromQuery(useEngineStatus()));
}

// --- in-flight pipeline status (dashboard-pipeline-status ADR) -------------------------
//
// The Work surface's content data: the in-flight pipeline projection (active plans +
// in-flight ADRs) and a plan's bounded wave/phase/step interior. The surface is app
// chrome under dashboard-layer-ownership: it consumes these stores hooks + the
// tiers-reading view selectors ONLY, never fetching the engine and never inspecting the
// raw `tiers` block. Degradation is read from the served tiers block (success data OR a
// FRESH error envelope's tiers winning over a stale held-success block), per
// degradation-is-read-from-tiers-not-guessed-from-errors — never guessed from a bare
// transport error. The surface is a projection over the one model
// (views-are-projections-of-one-model); the bounded interior + honest truncation honor
// graph-queries-are-bounded-by-default.
//
// STAGED CAPABILITY (dashboard-pipeline-status ADR "Constraints"): the honest full
// surface is gated on the sibling `dashboard-pipeline-wire`. These constants signal
// which wire capabilities are served so the surface renders a designed per-capability
// placeholder rather than a broken control when a capability is not yet live (mirroring
// the `CHANGED_FILES_LIST_SERVED` constant). The wire is shipped, so all three are true
// today; flipping one false degrades exactly that part of the surface to its placeholder.

/** The in-flight pipeline projection (`GET /pipeline`) is served by the engine. */
export const PIPELINE_STATUS_SERVED = true;
/** The bounded plan-container interior (`/nodes/{id}/plan-interior`) is served. */
export const PLAN_INTERIOR_SERVED = true;
/** Real ADR frontmatter status is served as a doc-node facet. */
export const ADR_STATUS_SERVED = true;

/**
 * The in-flight pipeline projection for the active scope (W01.P02.S06). Disabled when
 * scope is null (no worktree resolved yet), following the `useGraphSlice` pattern. The
 * `asOf` playhead folds into the cache key so a historical view reads a distinct entry
 * (W03.P08.S36 / dashboard-timeline ADR). The live wire's `pipeline(scope)` takes no
 * as-of yet, so a past playhead reuses the live projection until the wire grows the
 * parameter — the surface still degrades honestly via the served tiers block.
 */
export function usePipelineStatus(scope: string | null, asOf?: string | number) {
  return useQuery({
    queryKey: engineKeys.pipeline(scope ?? "", asOf),
    queryFn: () => engineClient.pipeline(scope!),
    enabled: scope !== null,
  });
}

/**
 * A plan node's bounded wave/phase/step interior (W01.P02.S07). Disabled until a plan
 * row is expanded (`planId === null` means collapsed), following the `useNodeNeighbors`
 * enabled-on-id pattern so the interior is fetched lazily, never for every row.
 */
export function usePlanInterior(planId: string | null, scope: string | null) {
  return useQuery({
    queryKey: engineKeys.planInterior(scope ?? "", planId ?? ""),
    queryFn: () => engineClient.planInterior(planId!, scope!),
    enabled: scope !== null && planId !== null,
  });
}

/**
 * The interpreted pipeline-status view the Work surface renders (W01.P02.S08). Modeled on
 * `deriveGraphSliceAvailability`: `loading` is the query's in-flight state, `degraded` is
 * read from the served `tiers` block (the `structural` tier the pipeline projection
 * resolves through), and `artifacts` is the in-flight list. The surface consumes this,
 * never `pipeline.data.tiers`.
 */
export interface PipelineStatusView extends TierAvailability {
  /** The pipeline query is in flight with no held data. */
  loading: boolean;
  /** The in-flight artifacts (active plans + in-flight ADRs); empty while degraded. */
  artifacts: PipelineArtifact[];
  /** Plan artifacts, split once in the stores layer for right-rail work surfaces. */
  plans: PipelineArtifact[];
  /** ADR artifacts, split once in the stores layer for right-rail work surfaces. */
  adrs: PipelineArtifact[];
  /** Plan node ids for expansion-store enrollment. */
  planIds: string[];
  /** Occupied pipeline phases for the compact pipeline arc. */
  occupiedPhases: ReadonlySet<string>;
  /** Count of renderable in-flight artifacts. */
  count: number;
  /** Polite live-region text for the pipeline surface state. */
  liveMessage: string;
}

// The pipeline projection is resolved by the engine's STRUCTURAL read of the vault
// corpus, so the `structural` tier gates availability (contract §2).
const PIPELINE_STATUS_TIERS = ["structural"] as const;

/**
 * Derive the pipeline-status view from a pipeline query's data + error + pending flags,
 * reading the served tiers block ONLY here in the stores layer. A served block (success
 * data OR a tiers-bearing error envelope) that marks `structural` unavailable — or omits
 * it — is designed degradation (contract §2: absence ≠ available). A wholly absent block
 * (a tiers-less transport fault) is NOT degradation — that is the query's error state,
 * and the surface must not guess "down" from a bare transport error
 * (degradation-is-read-from-tiers-not-guessed-from-errors). The FRESH error envelope's
 * tiers win over a stale held-success block (the `errTiers ?? dataTiers` order at the
 * call site), so a backend that just went down surfaces as degradation immediately.
 */
export function derivePipelineStatusView(
  tiers: TiersBlock | undefined,
  artifacts: PipelineArtifact[],
  loading: boolean,
): PipelineStatusView {
  const availability = readTierAvailability(tiers, PIPELINE_STATUS_TIERS);
  const trustedArtifacts = availability.degraded ? [] : artifacts;
  const plans = trustedArtifacts.filter((artifact) => artifact.doc_type === "plan");
  const adrs = trustedArtifacts.filter((artifact) => artifact.doc_type === "adr");
  const count = trustedArtifacts.length;
  return {
    loading,
    ...availability,
    // While degraded the projection cannot be trusted, so do not render a stale list as
    // current in-flight work; the surface shows the degraded notice instead.
    artifacts: trustedArtifacts,
    plans,
    adrs,
    planIds: plans.map((plan) => plan.node_id),
    occupiedPhases: new Set(
      trustedArtifacts.map((artifact) => artifact.phase as string),
    ),
    count,
    liveMessage: availability.degraded
      ? "pipeline status unavailable"
      : loading
        ? "loading in-flight work"
        : count === 0
          ? "no in-flight work"
          : `${count} in-flight item${count === 1 ? "" : "s"}`,
  };
}

/**
 * Stores hook: the interpreted pipeline-status view for a scope + playhead (W01.P02.S09).
 * Reads tiers from the success envelope, then the `EngineError` envelope (the FRESH error
 * winning over a stale held block), so the Work surface consumes interpreted truth and
 * never the raw tiers block. The active as-of playhead threads through so the surface
 * reflects the historical pipeline under a past playhead (W03.P08.S36).
 */
export function usePipelineStatusView(
  scope: string | null,
  asOf?: string | number,
): PipelineStatusView {
  const query = usePipelineStatus(scope, asOf);
  return derivePipelineStatusView(
    tiersFromQuery(query),
    query.data?.artifacts ?? [],
    scope !== null && query.isPending,
  );
}

/**
 * The interpreted plan-interior view the expandable step tree renders (W01.P02.S11):
 * the ordered wave→phase→step tree with per-container rolled-up completion, the honest
 * bounded-interior truncation block, and the loading flag. The surface consumes this,
 * never the raw interior response.
 */
export interface InteriorRollup {
  done: number;
  total: number;
}

export type InteriorStepView = InteriorStep;

export interface InteriorPhaseView {
  node_id: string;
  id: string;
  heading?: string;
  steps: InteriorStepView[];
  rollup: InteriorRollup;
}

export interface InteriorWaveView {
  node_id: string;
  id: string;
  heading?: string;
  phases: InteriorPhaseView[];
  rollup: InteriorRollup;
}

export interface PlanInteriorView {
  /** The interior query is in flight with no held data (the expanded row is loading). */
  loading: boolean;
  /** The ordered waves (L3/L4 shape); empty for L1/L2 plans. */
  waves: InteriorWaveView[];
  /** The ordered phases (L2 shape); empty for L1 and L3/L4 plans. */
  phases: InteriorPhaseView[];
  /** The flat steps (L1 shape); empty for L2/L3/L4 plans. */
  steps: InteriorStepView[];
  /** The plan-level rolled-up completion across every step the interior carries. */
  rollup: InteriorRollup;
  /** Honest bounded-interior truncation when the engine capped the tree; null otherwise. */
  truncated: PlanInterior["truncated"];
}

/** Roll up a step list to a done/total fraction (a done step is `done: true`). */
function rollupSteps(steps: InteriorStep[]): InteriorRollup {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

/** Sum two rollups (phase → wave, wave → plan aggregation). */
function sumRollups(rollups: InteriorRollup[]): InteriorRollup {
  return rollups.reduce(
    (acc, r) => ({ done: acc.done + r.done, total: acc.total + r.total }),
    { done: 0, total: 0 },
  );
}

/**
 * Derive the plan-interior view (W01.P02.S11): attach per-container rolled-up completion
 * bottom-up (steps → phase → wave → plan) and surface the truncated honesty block as a
 * designed state, never a silent partial result (graph-queries-are-bounded-by-default).
 * The tier-honest shape passes through: an L1 plan carries flat `steps`, an L2 plan
 * `phases`, an L3/L4 plan `waves` — exactly as the wire serves it.
 */
export function derivePlanInteriorView(
  interior: PlanInterior | undefined,
  loading: boolean,
): PlanInteriorView {
  if (!interior) {
    return {
      loading,
      waves: [],
      phases: [],
      steps: [],
      rollup: { done: 0, total: 0 },
      truncated: null,
    };
  }
  const phases: InteriorPhaseView[] = interior.phases.map((p) => ({
    ...p,
    rollup: rollupSteps(p.steps),
  }));
  const waves: InteriorWaveView[] = interior.waves.map((w) => {
    const phaseViews = w.phases.map((p) => ({ ...p, rollup: rollupSteps(p.steps) }));
    return {
      ...w,
      phases: phaseViews,
      rollup: sumRollups(phaseViews.map((p) => p.rollup)),
    };
  });
  const steps: InteriorStepView[] = interior.steps.map((s) => ({ ...s }));
  // Plan-level rollup spans whichever container shape the tier serves.
  const planRollup = sumRollups([
    ...waves.map((w) => w.rollup),
    ...phases.map((p) => p.rollup),
    rollupSteps(steps),
  ]);
  return {
    loading,
    waves,
    phases,
    steps,
    rollup: planRollup,
    truncated: interior.truncated ?? null,
  };
}

/**
 * Stores hook: the interpreted plan-interior view for an expanded plan node
 * (W01.P02.S11). `planId === null` means the row is collapsed: the query is disabled and
 * the view is the inert empty state. The Work step tree renders rolled-up completion and
 * honest truncation directly from this, never the raw interior response.
 */
export function usePlanInteriorView(
  planId: string | null,
  scope: string | null,
): PlanInteriorView {
  const query = usePlanInterior(planId, scope);
  return derivePlanInteriorView(
    query.data?.interior,
    planId !== null && query.isPending,
  );
}

/** The interpreted outcome of an ops dispatch, for the receipt copy. */
export type OpsOutcome = "ok" | "backend-down" | "failed";

/**
 * Classify an ops dispatch outcome in the stores layer so the chrome receipt
 * never inspects the raw `tiers` block itself (dashboard-layer-ownership /
 * rag-manager ADR: "reads status truth via stores"). A rejected dispatch whose
 * `EngineError` carries a tiers block is the backend reporting itself down (the
 * rag-down 502 surfaces as section-2 tier truth, contract §2 /
 * every-wire-response-carries-the-tiers-block) — distinct from a tiers-less
 * transport fault, which is a plain failure. A resolved-but-not-ok envelope is
 * also a plain failure. The chrome renders the returned kind, not the block.
 */
export function classifyOpsOutcome(
  result: Pick<OpsResult, "ok" | "tiers"> | { error: unknown },
): OpsOutcome {
  if ("error" in result) {
    return result.error instanceof EngineError && result.error.tiers !== undefined
      ? "backend-down"
      : "failed";
  }
  // A brokered rag control verb degrades to a 200 carrying a semantic-unavailable
  // `tiers` block rather than a 502 (rag-control-plane ADR D2: degradation is
  // read from tiers, not an error status). Read that truth here so a rag-down
  // op still surfaces as backend-down, not a flat failure.
  if (readTierAvailability(result.tiers, ["semantic"]).degraded) {
    return "backend-down";
  }
  return result.ok ? "ok" : "failed";
}

export interface OpsReceipt {
  verb: string;
  tone: "ok" | "failed" | "down";
  text: string;
}

function opsReceiptForOutcome(
  verb: string,
  outcome: OpsOutcome,
  failureText = "failed",
): OpsReceipt {
  if (outcome === "ok") return { verb, tone: "ok", text: "ok" };
  if (outcome === "backend-down") {
    return { verb, tone: "down", text: "rag is down — start it first" };
  }
  return { verb, tone: "failed", text: failureText };
}

export function opsReceiptFromResult(
  verb: string,
  result: Pick<OpsResult, "ok" | "tiers">,
): OpsReceipt {
  return opsReceiptForOutcome(verb, classifyOpsOutcome(result));
}

export function opsReceiptFromError(verb: string, error: unknown): OpsReceipt {
  return opsReceiptForOutcome(
    verb,
    classifyOpsOutcome({ error }),
    error instanceof Error ? error.message : "failed",
  );
}

// The `git` working-tree reads degrade off the PRESENCE of the git rollup in the
// status snapshot (git is NOT a canonical tier — see `deriveGitStatusView`). When
// the engine reports no git payload, the changed-files and diff selectors render
// their designed degraded state rather than firing a doomed `/ops/git` query.

/**
 * The interpreted changed-files view the `ChangesOverview` list renders. Parsed
 * from the porcelain `status` + `numstat` reads and grouped by git status. A
 * tiers-bearing `/ops/git` error envelope (or a transport fault) marks `errored`;
 * the surface distinguishes that from the clean (empty) and loading states.
 */
export interface ChangedFilesView {
  /** A changed-files read is in flight with no held entries. */
  loading: boolean;
  /** A genuine `/ops/git` failure (the engine answered with an error or faulted). */
  errored: boolean;
  /** One entry per changed file, status-grouped + numstat-reconciled. */
  files: ChangedFile[];
  /** Non-vault changed files, for source/diff surfaces. */
  codeFiles: ChangedFile[];
  /** Vault document changes, for document-reader surfaces. */
  documents: ChangedFile[];
  /** Summary counts/totals for the Changes tab header. */
  summary: {
    files: number;
    documents: number;
    additions: number;
    deletions: number;
    total: number;
  };
}

export type ChangedDocumentCategory =
  | "adr"
  | "audit"
  | "exec"
  | "index"
  | "plan"
  | "research";

export interface ChangedSourceFileRow {
  path: string;
  basename: string;
  nodeId: string;
  group: ChangedFile["group"];
  adds: number | null;
  dels: number | null;
}

export interface ChangedDocumentRow {
  path: string;
  title: string;
  nodeId: string;
  category?: ChangedDocumentCategory;
}

const CHANGED_DOCUMENT_CATEGORY: Record<string, ChangedDocumentCategory> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
  index: "index",
};

function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function changedDocumentType(path: string): string | null {
  const match = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
  return match ? (match[1] ?? null) : null;
}

function changedDocumentTitle(path: string): string {
  let stem = stemFromPath(path).replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const parts = stem.split("-");
  const suffix = parts[parts.length - 1];
  if (
    suffix !== undefined &&
    [
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "reference",
      "index",
      "rule",
      "summary",
    ].includes(suffix)
  ) {
    parts.pop();
  }
  stem = parts.join(" ").trim();
  if (stem.length === 0) return stemFromPath(path);
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function changedFileRow(file: ChangedFile): ChangedSourceFileRow {
  return {
    path: file.path,
    basename: fileBasename(file.path),
    nodeId: codeNodeIdFromPath(file.path),
    group: file.group,
    adds: file.adds,
    dels: file.dels,
  };
}

function changedDocumentRow(file: ChangedFile): ChangedDocumentRow {
  const docType = changedDocumentType(file.path);
  const category = docType === null ? undefined : CHANGED_DOCUMENT_CATEGORY[docType];
  return {
    path: file.path,
    title: changedDocumentTitle(file.path),
    nodeId: docNodeIdFromStem(stemFromPath(file.path)),
    ...(category ? { category } : {}),
  };
}

export function deriveChangedFilesView(
  files: ChangedFile[] | undefined,
  loading: boolean,
  errored: boolean,
  available = true,
): ChangedFilesView {
  const entries = available ? (files ?? []) : [];
  const codeFiles = entries.filter((file) => !file.vault);
  const documents = entries.filter((file) => file.vault);
  return {
    loading: available && loading,
    errored: available && errored,
    files: entries,
    codeFiles,
    documents,
    summary: {
      files: codeFiles.length,
      documents: documents.length,
      additions: entries.reduce((n, file) => n + (file.adds ?? 0), 0),
      deletions: entries.reduce((n, file) => n + (file.dels ?? 0), 0),
      total: entries.length,
    },
  };
}

const EMPTY_CHANGED_FILES_SUMMARY: ChangedFilesView["summary"] = {
  files: 0,
  documents: 0,
  additions: 0,
  deletions: 0,
  total: 0,
};

export interface ChangesOverviewView {
  loading: boolean;
  degraded: boolean;
  errored: boolean;
  clean: boolean;
  hasChanges: boolean;
  files: ChangedSourceFileRow[];
  documents: ChangedDocumentRow[];
  summary: ChangedFilesView["summary"];
  retry: () => void;
}

export function deriveChangesOverviewView(
  git: GitStatusHookView,
  changed: ChangedFilesView,
): ChangesOverviewView {
  const gitAvailable = git.git !== undefined;
  const summary = gitAvailable ? changed.summary : EMPTY_CHANGED_FILES_SUMMARY;
  const hasChanges = gitAvailable && summary.total > 0;
  return {
    loading: (git.loading || changed.loading) && !hasChanges,
    degraded: git.degraded && !hasChanges,
    errored: (git.errored || changed.errored) && !hasChanges,
    clean: gitAvailable && !git.loading && !changed.loading && !hasChanges,
    hasChanges,
    files: gitAvailable ? changed.codeFiles.map(changedFileRow) : [],
    documents: gitAvailable ? changed.documents.map(changedDocumentRow) : [],
    summary,
    retry: git.retry,
  };
}

/**
 * Stores selector for the worktree's changed-files list: fetches porcelain
 * `status` and `numstat` through the `client.opsGit` seam (the stores layer is the
 * sole wire client — dashboard-layer-ownership), parses git's verbatim text, and
 * reconciles the numstat tallies onto the status entries. Disabled when scope is
 * null OR git is unavailable in the status snapshot (no doomed query when the
 * engine reports no repository state). A `git` SSE chunk refreshing `/status`
 * re-gates this query through the `useGitStatus` dependency.
 */
function useChangedFilesForGit(
  scope: string | null,
  git: Pick<GitStatusHookView, "git">,
): ChangedFilesView {
  const enabled = scope !== null && CHANGED_FILES_LIST_SERVED && git.git !== undefined;
  const query = useQuery({
    queryKey: engineKeys.gitChanges(scope ?? ""),
    queryFn: async () => {
      const [status, numstat] = await Promise.all([
        engineClient.opsGit("status", { scope: scope! }),
        engineClient.opsGit("numstat", { scope: scope! }),
      ]);
      return mergeNumstat(
        parseGitStatus(status.output),
        parseGitNumstat(numstat.output),
      );
    },
    enabled,
  });
  return deriveChangedFilesView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

export function useChangedFiles(scope: string | null): ChangedFilesView {
  const git = useGitStatus();
  return useChangedFilesForGit(scope, git);
}

export function useChangesOverview(scope: string | null): ChangesOverviewView {
  const git = useGitStatus();
  const changed = useChangedFilesForGit(scope, git);
  return deriveChangesOverviewView(git, changed);
}

/**
 * The interpreted state of a file's read-only diff (git-diff-browser ADR).
 *
 * The read-only diff IS served by the `/ops/git/diff` pass-through: this selector
 * fetches a file's unified diff through the `client.opsGit` seam and parses it into
 * the structured `GitFileDiff` the `DiffView` renders. `loading` is the in-flight
 * state; `errored` a genuine `/ops/git` failure; `diff` the parsed body when served.
 */
export interface GitFileDiffView {
  /** A diff read is in flight with no held body. */
  loading: boolean;
  /** A genuine `/ops/git/diff` failure (the engine answered with an error). */
  errored: boolean;
  /** The structured diff body when served; undefined while loading/errored. */
  diff?: GitFileDiff;
}

export function deriveGitFileDiffView(
  diff: GitFileDiff | undefined,
  loading: boolean,
  errored: boolean,
  available = true,
): GitFileDiffView {
  return {
    loading: available && loading,
    errored: available && errored,
    diff: available ? diff : undefined,
  };
}

/**
 * Stores selector for a changed file's read-only diff. Fetches the unified diff
 * for the path through `client.opsGit("diff", { scope, path })` and parses it
 * into the hunk-by-hunk `GitFileDiff` shape. Disabled until a file path is
 * selected, a scope is resolved, AND the status snapshot carries git state: a
 * closed diff view or no-repository degraded state fires no doomed query. The
 * optional `status` letter is threaded onto the parsed diff for the in-body
 * status mark.
 */
export function useGitFileDiff(
  scope: string | null,
  path: string | null,
  status?: string,
): GitFileDiffView {
  const git = useGitStatus();
  const enabled =
    scope !== null &&
    path !== null &&
    GIT_DIFF_CAPABILITY_SERVED &&
    git.git !== undefined;
  const query = useQuery({
    queryKey: engineKeys.gitDiff(scope ?? "", path ?? ""),
    queryFn: async () => {
      const op = await engineClient.opsGit("diff", {
        scope: scope!,
        path: path!,
      });
      return parseUnifiedDiff(op.output, path!, status);
    },
    enabled,
  });
  return deriveGitFileDiffView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

/**
 * Stores selector for a bounded historical text diff. This is the same parsed
 * `GitFileDiff` body that `DiffView` renders for working-tree diffs, but keyed by
 * both revisions so time-travel / history consumers cannot collapse distinct
 * two-rev reads into the live working-tree diff cache entry.
 */
export function useGitHistoricalFileDiff(
  scope: string | null,
  path: string | null,
  from: string | null,
  to: string | null,
  status?: string,
): GitFileDiffView {
  const git = useGitStatus();
  const enabled =
    scope !== null &&
    path !== null &&
    path.length > 0 &&
    from !== null &&
    from.length > 0 &&
    to !== null &&
    to.length > 0 &&
    GIT_DIFF_CAPABILITY_SERVED &&
    git.git !== undefined;
  const query = useQuery({
    queryKey: engineKeys.gitHistoricalDiff(
      scope ?? "",
      path ?? "",
      from ?? "",
      to ?? "",
    ),
    queryFn: async () => {
      const op = await engineClient.opsGit("histdiff", {
        scope: scope!,
        path: path!,
        from: from!,
        to: to!,
      });
      return parseUnifiedDiff(op.output, path!, status);
    },
    enabled,
  });
  return deriveGitFileDiffView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

// --- SSE consumption (§7) -------------------------------------------------------------

export interface StreamChunk {
  channel: string;
  data: unknown;
}

/**
 * Incremental text/event-stream parser: returns completed frames and the
 * unconsumed remainder (pure; transport-independent).
 */
export function parseSseFrames(buffer: string): {
  frames: StreamChunk[];
  rest: string;
} {
  const frames: StreamChunk[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let channel = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) channel = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data.length === 0) continue;
    try {
      frames.push({ channel, data: JSON.parse(data) });
    } catch {
      frames.push({ channel, data });
    }
  }
  return { frames, rest };
}

/** True when an error is an intentional cancel (abort), not a lost stream. */
function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

/**
 * Consume an SSE Response body as an async iterable of chunks. A clean
 * end-of-stream (`done`) returns normally; a non-ok response or a mid-stream
 * read failure throws `StreamLostError` (ADR D2) so the failure policy can
 * classify it `degraded`/`stream-lost` and the degradation surface can render.
 * An intentional abort (unmount / scope change) is re-thrown untouched - it is
 * not a lost stream.
 */
export async function* sseChunks(
  response: Response,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok || !response.body) {
    throw new StreamLostError(`graph stream responded ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        if (isAbort(cause)) throw cause;
        throw new StreamLostError("graph stream dropped");
      }
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      const { frames, rest } = parseSseFrames(buffer);
      buffer = rest;
      for (const frame of frames) {
        yield frame;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Cap the live accumulator (dashboard-optimization P-HIGH-6): the stream never
 * closes and `staleTime` is Infinity, so an unbounded `[...acc, chunk]` grows
 * for the whole session. Consumers read only the latest seq (`graphSync`) and
 * the most-recent per-channel frames (`NowStrip`), so retaining the tail is
 * sufficient and keeps memory + the per-append dedup scan bounded.
 */
export const STREAM_RETENTION = 256;

/** Dedup graph frames by seq WITHIN the retained window (a reconnect's since=
 *  replay overlapping the tail yields no second copy; a replay older than the
 *  256-frame window is not deduped here but is upserted idempotently by id at
 *  apply time), then ring-cap. Frames without a seq just append. Exported for
 *  the bounded-growth test. */
export function streamReducer(acc: StreamChunk[], chunk: StreamChunk): StreamChunk[] {
  const seq = (chunk.data as { seq?: unknown }).seq;
  if (
    typeof seq === "number" &&
    acc.some((held) => (held.data as { seq?: unknown }).seq === seq)
  ) {
    return acc;
  }
  const next = [...acc, chunk];
  return next.length > STREAM_RETENTION
    ? next.slice(next.length - STREAM_RETENTION)
    : next;
}

/**
 * Streamed query over the engine's multiplexed SSE stream. Chunks accumulate
 * via a seq-dedup reducer (not blind append), so a reconnect's `since=` replay
 * splices idempotently; `since` resumes the graph channel from a known seq and
 * is folded into the cache key so two resume offsets never collide (section 7).
 */
export function engineStreamOptions(
  channels: readonly string[],
  since?: number,
  scope?: string,
) {
  return queryOptions({
    // The resume point is identity-bearing: two `since` offsets carry
    // different delta windows and must not collide on one cache entry
    // (adversarial finding stream-01), mirroring how `graph` folds as-of.
    // Scope joins the key for the same reason (per-scope clock, W02.P04.S14).
    queryKey: engineKeys.stream(channels, since, scope),
    queryFn: streamedQuery({
      streamFn: async (context) =>
        sseChunks(
          await engineClient.openStream([...channels], since, context.signal, scope),
        ),
      reducer: streamReducer,
      initialValue: [] as StreamChunk[],
    }),
    staleTime: Infinity,
    // Bounded by default (bounded-by-default-for-every-accumulator): the stream
    // entry retains a 256-chunk array, so a staleTime:Infinity stream MUST
    // declare a gcTime to reclaim that array promptly once the stream is no
    // longer observed (tab closed / unmounted), not after the default window.
    gcTime: 30_000,
    retry: true,
    // Capped exponential backoff (P-MED-3, LOW-2): recover a transient blip
    // fast (250ms first retry), then back off exponentially to a 30s ceiling so
    // a flapping /stream cannot tight-loop reconnects or storm the error log.
    retryDelay: (attempt) =>
      attempt === 0 ? 250 : Math.min(30_000, 1_000 * 2 ** attempt),
  });
}

export function useEngineStream(
  channels: readonly string[],
  since?: number,
  scope?: string,
) {
  return useQuery(engineStreamOptions(channels, since, scope));
}

/**
 * The canonical backend-signal channel set (F-M1 / event-unity): `backends`
 * (rag/core lifecycle) + `git` (working-tree status) share ONE multiplexed SSE
 * subscription, so the dashboard opens a single backend-signal EventSource
 * instead of one per consumer. The `graph` channel stays SEPARATE — it is the
 * per-scope, `since=keyframeSeq`-anchored live delta clock (`useGraphLiveSync`)
 * and must never be folded in here.
 */
export const BACKEND_SIGNAL_CHANNELS = ["backends", "git"] as const;

/**
 * Subscribe the shared backend-signal stream. Mounted once at the app shell so
 * backend / git / rag-health stay live regardless of which rail tab is open;
 * NowStrip and the search controller call this same hook and TanStack Query
 * coalesces them onto the one EventSource (each filters the deduped accumulator
 * for its own channel). No `since`/`scope` — these channels are not anchored.
 */
export function useBackendSignalStream() {
  return useEngineStream(BACKEND_SIGNAL_CHANNELS);
}

/**
 * Stable signature of the latest retained backend/git signal values. This is
 * value-based, not length-based, because the stream accumulator is ring-capped:
 * once the retained array reaches STREAM_RETENTION its length stops changing even
 * though backend/git values keep changing.
 */
export function latestBackendSignalSignature(
  chunks: readonly StreamChunk[] | undefined,
): string | undefined {
  if (!chunks) return undefined;
  let backends: string | undefined;
  let git: string | undefined;
  for (
    let i = chunks.length - 1;
    i >= 0 && (backends === undefined || git === undefined);
    i--
  ) {
    const chunk = chunks[i];
    if (chunk.channel === "backends" && backends === undefined) {
      backends = stableKey(chunk.data);
    } else if (chunk.channel === "git" && git === undefined) {
      git = stableKey(chunk.data);
    }
  }
  if (backends === undefined && git === undefined) return undefined;
  return `backends:${backends ?? ""}|git:${git ?? ""}`;
}

/**
 * Stores-owned status recovery invalidation. Backend/git SSE frames are deltas;
 * `/status` is the recovery snapshot. Consumers call this hook instead of
 * manipulating the status query cache directly from app chrome.
 */
export function useStatusRecoveryRefresh(): void {
  const queryClient = useQueryClient();
  const stream = useBackendSignalStream();
  const previous = useRef<string | undefined>(undefined);
  const invalidateStatus = useMemo(
    () =>
      debounce(() => {
        invalidateGitRecoveryReads(queryClient);
      }, 150),
    [queryClient],
  );

  useEffect(() => () => invalidateStatus.cancel(), [invalidateStatus]);
  useEffect(() => {
    const signature = latestBackendSignalSignature(stream.data);
    if (signature === undefined) return;
    const prior = previous.current;
    previous.current = signature;
    if (prior !== signature) invalidateStatus();
  }, [stream.data, invalidateStatus]);
}
