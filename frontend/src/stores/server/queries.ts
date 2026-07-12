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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { debounce } from "../../platform/timing";
import type {
  ChangedFile,
  GitChangeGroup,
  ContentResponse,
  ContentTruncated,
  DashboardDateRange,
  DashboardFilters,
  DashboardGraphBounds,
  DashboardPanelState,
  DashboardState,
  DashboardTimelineMode,
  EmbeddingsResponse,
  EngineEdge,
  EngineNode,
  EngineStatus,
  FiltersVocabulary,
  FileTreeEntry,
  FileTreeResponse,
  GitFileDiff,
  GitOpResponse,
  GraphCorpus,
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
  MapWorktree,
  NodeDetail,
  OpsResult,
  OpsWriteResult,
  PipelineArtifact,
  PlanInterior,
  PlanSummary,
  PRsResponse,
  PullRequest,
  SessionState,
  SessionUpdate,
  SettingsSchema,
  SettingsState,
  SettingUpdate,
  TierAvailability,
  TiersBlock,
  RecentScope,
  VaultTreeEntry,
  VaultTreeResponse,
  WorkspaceRoot,
  WorkspacesState,
} from "./engine";
import {
  CANONICAL_TIERS,
  DEFAULT_SALIENCE_LENS,
  EngineError,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
} from "./engine";
import type { SalienceLens } from "./engine";
import {
  authoringClient,
  requireActorToken,
  type DirectWriteOutcome,
} from "./authoring";
import {
  deriveEditorialTitle,
  sanitizeHeadingText,
  sanitizeReaderBody,
} from "./markdownSanitize";
import { parseDocument, type Frontmatter } from "./parseDocument";
import { normalizeSearchTarget, type SearchTarget } from "../searchTarget";
import {
  cloneDashboardFilters,
  dashboardGraphQueryVariables,
  dashboardLineageFilterArg,
  dashboardSelectionId,
  normalizeDashboardGraphBounds,
  normalizeDashboardGraphCorpus,
  normalizeDashboardGraphGranularity,
  normalizeDashboardPanelState,
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  patchDashboardState,
  selectionPatch,
  type DashboardGraphQueryVariables,
} from "./dashboardState";
import { isFreshDashboardGraphDefaultsState } from "./dashboardDefaults";
import {
  dashboardPlayheadForTimelineMode,
  type DashboardPlayhead,
} from "./dashboardTimeline";
import { normalizeDashboardDateRange } from "./dashboardDateRange";
import { queryClient as defaultQueryClient } from "./queryClient";
import { normalizeStoreScope } from "./scopeIdentity";
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
  resolveKeybindingOverrides,
  resolveReduceMotionSetting,
  resolveEffectiveSetting,
  resolveSettings,
  normalizeSettingsScope,
  settingEnumMembers,
  type GraphSettingsDefaults,
  type SettingsGroup,
} from "./settingsSelectors";
import { filterChoicesFromDashboardState, type FilterChoices } from "../view/filters";
import {
  DEFAULT_RAIL_SORT,
  type RailSortKey,
  type RailSortValue,
} from "../view/railSort";
import { setKeymapOverridesReader } from "../view/keymapDispatcher";
import {
  deriveSessionIntentBootHealIntent,
  isSessionIntentStale,
  readSessionIntentTouch,
  stampSessionIntentTouch,
} from "../view/sessionIntentFreshness";
import { movePlayhead } from "../view/timelineIntent";
import { normalizeNodeId, normalizeNodeIds } from "../nodeIds";
import { normalizeSearchQuery } from "../searchQuery";
import {
  featureQueryMatches,
  featureQueryPlainText,
  featureTagDisplayName,
  type FeatureQuery,
} from "../featureQuery";
import { useViewStore } from "../view/viewStore";
import type { KeybindingOverrides } from "../../platform/keymap/registry";

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

export const GIT_QUERY_KEY_PART_MAX_CHARS = 2048;

export function normalizeGitQueryKeyPart(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= GIT_QUERY_KEY_PART_MAX_CHARS
    ? normalized
    : "";
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
  // The complete code-file listing (search-providers ADR), keyed on scope alone:
  // one bounded cache entry per corpus, walked to completion by the client so the
  // files(code) provider narrows the WHOLE set. A scope/workspace swap evicts it
  // like the vault-tree cache (default gcTime bounds retention).
  codeFiles: (scope: string) => [...engineKeys.all, "code-files", scope] as const,
  // The code (worktree) file tree is fetched ONE directory level per call
  // (dashboard-code-tree ADR): the key folds (scope, dir-path, cursor) so each
  // expanded directory — and each page of a paginated level — is its own cache
  // entry, lazily fetched on first expansion and cached per scope. A wholesale
  // scope/workspace swap removes the whole `file-tree` subtree so the prior
  // corpus's levels never survive (mirrors the vault-tree cache discipline).
  fileTree: (scope: string, path?: string, cursor?: string) =>
    [...engineKeys.all, "file-tree", scope, path ?? "", cursor ?? ""] as const,
  filters: (scope: string, corpus?: GraphCorpus) =>
    [...engineKeys.all, "filters", scope, corpus ?? "vault"] as const,
  dashboardState: (scope: string, backendSessionIdentity: string) =>
    [...engineKeys.all, "dashboard-state", scope, backendSessionIdentity] as const,
  graph: (
    scope: string,
    filter?: GraphFilter,
    asOf?: string | number,
    granularity?: "document" | "feature",
    lens?: SalienceLens,
    focus?: string | null,
    corpus?: GraphCorpus,
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
      // The active corpus (codebase-graphing ADR D7): vault and code are
      // DISCONNECTED datasets, so they must never share a cache entry — a corpus
      // switch is a key change that refetches the other corpus and reloads the
      // canvas. Defaulted to `vault` so the pre-corpus key is byte-identical.
      corpus ?? "vault",
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
  stream: (channels: readonly unknown[], since?: unknown, scope?: unknown) => {
    const identity = normalizeEngineStreamIdentity(channels, since, scope);
    return [
      ...engineKeys.all,
      "stream",
      identity.channels.join(","),
      identity.since ?? "live",
      // Scope folds into the stream identity (W02.P04.S14 per-scope clock): two
      // scopes' streams carry different deltas on different clocks and must not
      // share a cache entry. Absent scope = the active-scope fallback ("active").
      identity.scope ?? "active",
    ] as const;
  },
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
  // The provisioning status projection (project-provisioning ADR): keyed by the
  // resolved target so a per-workspace/worktree status caches independently.
  provisionStatus: (workspace?: string, worktree?: string) =>
    [
      ...engineKeys.all,
      "provision",
      "status",
      workspace ?? "active",
      worktree ?? "root",
    ] as const,
  provisionJob: (id: string) => [...engineKeys.all, "provision", "job", id] as const,
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
  gitChanges: (scope: unknown) =>
    [...engineKeys.all, "git-changes", normalizeGitQueryKeyPart(scope)] as const,
  gitDiff: (scope: unknown, path: unknown) =>
    [
      ...engineKeys.all,
      "git-diff",
      normalizeGitQueryKeyPart(scope),
      normalizeGitQueryKeyPart(path),
    ] as const,
  gitHistoricalDiff: (scope: unknown, path: unknown, from: unknown, to: unknown) =>
    [
      ...engineKeys.all,
      "git-histdiff",
      normalizeGitQueryKeyPart(scope),
      normalizeGitQueryKeyPart(path),
      normalizeGitQueryKeyPart(from),
      normalizeGitQueryKeyPart(to),
    ] as const,
};

export const SCOPED_ENGINE_QUERY_SUBTREES = [
  "vault-tree",
  // The complete code-file listing (search-providers ADR D1): keyed on scope so
  // a workspace swap evicts the prior corpus's listing and the next scope starts
  // fresh — the files(code) provider must never serve another scope's files.
  "code-files",
  "file-tree",
  "filters",
  "dashboard-state",
  "graph",
  "graph-embeddings",
  "node",
  "content",
  "neighbors",
  "evidence",
  "events",
  "history",
  "prs",
  "issues",
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
  // The complete code-file listing (search-providers ADR D1): projected from the
  // LinkageGraph and memoized on the graph `generation` server-side, so a new
  // ingest (added or removed source file) bumps the generation and the client
  // listing must re-read from the fresh projection on the next render.
  "code-files",
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

/** Minimum interval between full Refresh sweeps. A held chord or rapid double-click
 *  coalesces inside this window: the prior invalidation already re-fetches the latest, so
 *  repeats within it are redundant work (global-context-actions, Refresh optimization). */
export const REFRESH_COALESCE_MS = 300;
let lastEngineRefreshAt = -Infinity;

/**
 * Re-fetch the engine data on demand (the reload/refresh family). Three optimization
 * passes over the original per-subtree sweep:
 *  1. COALESCE rapid repeats (held chord / double-click) inside `REFRESH_COALESCE_MS`, so
 *     a burst fires ONE sweep rather than dozens of redundant invalidation passes.
 *  2. ONE predicate (`engineKeys.all`) invalidates the entire engine query tree in a
 *     single cache scan — every scoped subtree PLUS the singleton families (map, status,
 *     workspaces, session, settings). This is intentionally BROADER than the prior scoped
 *     sweep it replaced (which touched only the per-scope subtrees): a user-initiated
 *     "Refresh data" is meant to catch even a stale workspace/session registry.
 *  3. `refetchType: "active"` re-fetches ONLY queries with a mounted observer; inactive
 *     cached entries are marked stale and re-fetch lazily on next mount, bounding the
 *     fan-out to what the user can actually see. CONTRACT: this holds only while a visible
 *     surface keeps an active (mounted, enabled) observer — a mounted-but-`enabled:false`
 *     query a user expects Refresh to update would NOT refetch here. The ONE such surface
 *     is the hidden-tab-paused backend-signal stream (universal-data-loading ADR D4),
 *     which is safe by construction: the tab is hidden (no user can press Refresh into
 *     it) and resume invalidates + refetches the stream key itself. Any future
 *     enabled-gated query must make the same argument or refetch on its own re-enable.
 * Client-side only — no backend mutation, so it is safe in time-travel and needs no
 * confirm guard.
 */
export function refreshAllEngineQueries(): void {
  const now = Date.now();
  if (now - lastEngineRefreshAt < REFRESH_COALESCE_MS) return;
  lastEngineRefreshAt = now;
  void defaultQueryClient.invalidateQueries({
    queryKey: engineKeys.all,
    refetchType: "active",
  });
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

export interface WorkspaceMapPickerRowView {
  worktree: MapWorktree;
  selectable: boolean;
  isActive: boolean;
  isPending: boolean;
  isDegraded: boolean;
  rowClassName: string;
  activeCueClassName: string;
  /** The worktree's display NAME (path basename) — the row's primary ink. */
  nameLabel: string;
  /** The checked-out branch when it adds identity beyond the name (null when it
   *  matches the folder name — "main main" says nothing twice). */
  branchLabel: string | null;
  branchClassName: string;
  badgeClassName: string;
  degradedIconClassName: string;
  pendingLabelClassName: string;
  title: string;
  ariaLabel: string;
  defaultLabel: string | null;
  /** Quiet marker for a worktree with no vault to open (context-only row). */
  noVaultLabel: string | null;
  degradedTitle: string;
  pendingLabel: string | null;
}

export interface WorkspaceMapPickerPresentationView {
  worktrees: MapWorktree[];
  /** The FULL ordered worktree set of the ACTIVE project (the worktree
   *  disclosure). The cross-project "Recent" section is derived separately from
   *  the session recents, not from this `/map` projection. */
  rows: WorkspaceMapPickerRowView[];
  /** Label for the active project's worktree disclosure — names the project so
   *  the count is never read machine-wide. */
  allLabel: string;
  /** The active PROJECT's display name (threaded from the registry), or null
   *  before the registry resolves — the trigger's identity line. */
  projectLabel: string | null;
  /** The pending-aware headline worktree (the switch target while switching,
   *  else the active worktree) — drives the trigger's git line and path line so
   *  the header never mixes target and outgoing state. */
  headline: MapWorktree | null;
  pending: boolean;
  triggerLabel: string;
  triggerAriaLabel: string;
  triggerClassName: string;
  triggerLabelClassName: string;
  triggerIconClassName: string;
  loadingLabel: string;
  loadingClassName: string;
  errorLabel: string;
  errorRootClassName: string;
  errorLabelClassName: string;
  retryLabel: string;
  retryAriaLabel: string;
  retryButtonClassName: string;
  degradedLabel: string | null;
  degradedClassName: string;
  listAriaLabel: string;
  emptyLabel: string | null;
  emptyClassName: string;
  singleScopeLabel: string | null;
  singleScopeClassName: string;
}

const WORKSPACE_MAP_PICKER_LOADING_CLASS =
  "px-fg-1 py-fg-0-5 text-label text-ink-faint";
const WORKSPACE_MAP_PICKER_ERROR_ROOT_CLASS = "space-y-fg-1 px-fg-1 py-fg-0-5";
const WORKSPACE_MAP_PICKER_ERROR_LABEL_CLASS = "text-label text-state-broken";
const WORKSPACE_MAP_PICKER_RETRY_BUTTON_CLASS =
  "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_TRIGGER_CLASS =
  "flex w-full items-center rounded-fg-xs py-fg-1 text-left transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_TRIGGER_LABEL_BASE_CLASS =
  "min-w-0 flex-1 truncate text-left text-body-strong";
const WORKSPACE_MAP_PICKER_TRIGGER_ICON_CLASS = "shrink-0 text-ink-faint";
const WORKSPACE_MAP_PICKER_DEGRADED_CLASS =
  "mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted";
const WORKSPACE_MAP_PICKER_EMPTY_CLASS = "px-fg-2 py-fg-1 text-label text-ink-faint";
const WORKSPACE_MAP_PICKER_SINGLE_SCOPE_CLASS =
  "px-fg-2 py-fg-0-5 text-caption text-ink-faint";
const WORKSPACE_MAP_PICKER_ROW_BASE_CLASS =
  "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORKSPACE_MAP_PICKER_ACTIVE_CUE_BASE_CLASS =
  "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full";
const WORKSPACE_MAP_PICKER_BRANCH_CLASS = "min-w-0 truncate";
const WORKSPACE_MAP_PICKER_BADGE_CLASS = "shrink-0 text-ink-faint";
const WORKSPACE_MAP_PICKER_DEGRADED_ICON_CLASS =
  "flex shrink-0 items-center text-state-stale";
const WORKSPACE_MAP_PICKER_PENDING_LABEL_CLASS =
  "ml-auto shrink-0 text-caption text-ink-faint";

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

/** The worktree's display NAME — the basename of its path (the default worktree
 *  of `…/main` reads "main"). The left rail's single clickable title shows this,
 *  not the branch, so the worktree identity is stated once per rail. */
export function worktreeName(path: string): string {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Sort corpus-bearing worktrees first, defaults leading, bare refs last. */
export function orderWorkspaceMapWorktrees(
  worktrees: readonly MapWorktree[],
): MapWorktree[] {
  return [...worktrees].sort(
    (a, b) =>
      Number(b.has_vault) - Number(a.has_vault) ||
      Number(b.is_default ?? false) - Number(a.is_default ?? false) ||
      a.branch.localeCompare(b.branch),
  );
}

export function workspaceMapPickerRowClassName(state: {
  isActive: boolean;
  selectable: boolean;
}): string {
  const stateClass = state.isActive
    ? "bg-accent-subtle font-medium text-ink"
    : state.selectable
      ? "text-ink-muted hover:bg-paper-sunken hover:text-ink"
      : "cursor-not-allowed text-ink-faint/60";
  return `${WORKSPACE_MAP_PICKER_ROW_BASE_CLASS} ${stateClass}`;
}

export function workspaceMapPickerActiveCueClassName(isActive: boolean): string {
  return `${WORKSPACE_MAP_PICKER_ACTIVE_CUE_BASE_CLASS} ${
    isActive ? "bg-accent" : "bg-transparent"
  }`;
}

export function workspaceMapPickerTriggerLabelClassName(pending: boolean): string {
  return `${WORKSPACE_MAP_PICKER_TRIGGER_LABEL_BASE_CLASS} ${
    pending ? "text-ink-muted" : "text-ink"
  }`;
}

export function deriveWorkspaceMapPickerPresentationView({
  map,
  activeScope,
  pendingId,
  availability,
  projectLabel = null,
}: {
  map: MapResponse | undefined;
  activeScope: string | null;
  pendingId: string | null;
  availability: WorkspaceMapAvailability;
  /** The active project's display name from the registry (identity line). */
  projectLabel?: string | null;
}): WorkspaceMapPickerPresentationView {
  const worktrees = orderWorkspaceMapWorktrees(
    map?.repositories.flatMap((repo) => repo.worktrees) ?? [],
  );
  const selectableCount = worktrees.filter((worktree) => worktree.has_vault).length;
  const current = worktrees.find((worktree) => worktree.id === activeScope);
  const pending = pendingId !== null && pendingId !== activeScope;
  const pendingWorktree = pending
    ? worktrees.find((worktree) => worktree.id === pendingId)
    : undefined;
  const headlineWorktree = pendingWorktree ?? current;
  const headlineName = headlineWorktree ? worktreeName(headlineWorktree.path) : null;
  const availabilityReason = tierAvailabilityReason(availability);

  const rows = worktrees.map((worktree) => {
    const selectable = worktree.has_vault;
    const isActive = worktree.id === activeScope;
    const isPending = pending && worktree.id === pendingId;
    const isDegraded = (worktree.degraded?.length ?? 0) > 0;
    const name = worktreeName(worktree.path);
    const branch = worktree.branch.trim();
    return {
      worktree,
      selectable,
      isActive,
      isPending,
      isDegraded,
      rowClassName: workspaceMapPickerRowClassName({ isActive, selectable }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
      nameLabel: name,
      branchLabel: branch.length > 0 && branch !== name ? branch : null,
      branchClassName: WORKSPACE_MAP_PICKER_BRANCH_CLASS,
      badgeClassName: WORKSPACE_MAP_PICKER_BADGE_CLASS,
      degradedIconClassName: WORKSPACE_MAP_PICKER_DEGRADED_ICON_CLASS,
      pendingLabelClassName: WORKSPACE_MAP_PICKER_PENDING_LABEL_CLASS,
      title: worktree.has_vault
        ? worktree.path
        : `${worktree.path} — no vault here; shown for context`,
      ariaLabel: worktree.has_vault
        ? `switch to ${name}${branch.length > 0 && branch !== name ? ` on branch ${branch}` : ""}${
            worktree.is_default ? ", the default worktree" : ""
          }${isActive ? ", the current worktree" : ""}`
        : `${name} — no vault here, shown for context only`,
      defaultLabel: worktree.is_default ? "·default" : null,
      noVaultLabel: worktree.has_vault ? null : "·no vault",
      degradedTitle: worktree.degraded?.join(", ") ?? "",
      pendingLabel: isPending ? "switching…" : null,
    };
  });

  return {
    worktrees,
    rows,
    allLabel: projectLabel
      ? `Worktrees in ${projectLabel}`
      : "This project's worktrees",
    projectLabel,
    headline: headlineWorktree ?? null,
    pending,
    triggerLabel: headlineName ?? "Pick a worktree…",
    triggerAriaLabel: headlineName
      ? `current location: ${projectLabel ? `${projectLabel} / ` : ""}${headlineName}${
          pending ? ", switching" : ""
        }`
      : "choose a project or worktree",
    triggerClassName: WORKSPACE_MAP_PICKER_TRIGGER_CLASS,
    triggerLabelClassName: workspaceMapPickerTriggerLabelClassName(pending),
    triggerIconClassName: WORKSPACE_MAP_PICKER_TRIGGER_ICON_CLASS,
    loadingLabel: "Loading worktrees…",
    loadingClassName: WORKSPACE_MAP_PICKER_LOADING_CLASS,
    errorLabel: "The worktree list couldn't be loaded",
    errorRootClassName: WORKSPACE_MAP_PICKER_ERROR_ROOT_CLASS,
    errorLabelClassName: WORKSPACE_MAP_PICKER_ERROR_LABEL_CLASS,
    retryLabel: "Retry",
    retryAriaLabel: "retry loading the worktree list",
    retryButtonClassName: WORKSPACE_MAP_PICKER_RETRY_BUTTON_CLASS,
    degradedLabel: availability.degraded
      ? `The worktree list is partly unavailable right now${
          availabilityReason ? ` — ${availabilityReason}` : ""
        }. Showing what loaded.`
      : null,
    degradedClassName: WORKSPACE_MAP_PICKER_DEGRADED_CLASS,
    listAriaLabel: "projects and worktrees",
    emptyLabel:
      worktrees.length === 0
        ? "No worktrees here yet — point the engine at a repository to begin."
        : selectableCount === 0
          ? "None of these worktrees has a vault to open — they're shown for context."
          : null,
    emptyClassName: WORKSPACE_MAP_PICKER_EMPTY_CLASS,
    singleScopeLabel:
      selectableCount === 1 && worktrees.length === 1
        ? "This is the only worktree with a vault."
        : null,
    singleScopeClassName: WORKSPACE_MAP_PICKER_SINGLE_SCOPE_CLASS,
  };
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

/** One registered-project row in the worktree picker's "Projects" section
 *  (multi-project identity): the registered root's name + path, current marker,
 *  and reachability. Selecting a non-active reachable root swaps the whole
 *  workspace. Reuses the worktree-row class helpers so projects and worktrees
 *  read identically (design-system-is-centralized). */
export interface WorktreePickerProjectRowView {
  id: string;
  label: string;
  path: string;
  isActive: boolean;
  selectable: boolean;
  title: string;
  ariaLabel: string;
  rowClassName: string;
  activeCueClassName: string;
}

/** A distinguishing, human project name. The engine auto-labels a root with its
 *  path basename, so a machine full of `…/<repo>-worktrees/main` worktrees would
 *  ALL read "main" — useless. So we derive the REPO identity from the path: the
 *  parent dir minus a `-worktrees` suffix is the unique, meaningful name
 *  (`vaultspec-core-worktrees/main` → "vaultspec-core"). A genuinely custom label
 *  (one the operator set, differing from the basename) still wins. */
export function workspaceRootName(root: Pick<WorkspaceRoot, "label" | "path">): string {
  const segments = root.path.split(/[\\/]+/).filter(Boolean);
  const base = segments[segments.length - 1] ?? "";
  const parent = segments[segments.length - 2] ?? "";
  const label = root.label.trim();
  // A custom label (not just the auto basename) is authoritative.
  if (label.length > 0 && label.toLowerCase() !== base.toLowerCase()) return label;
  // The dominant `<repo>-worktrees/<branch>` layout: identity is the repo name.
  if (/-worktrees$/i.test(parent)) {
    const repo = parent.replace(/-worktrees$/i, "");
    return /^(main|master)$/i.test(base) ? repo : `${repo} · ${base}`;
  }
  // A generic branch-y basename with a meaningful parent: qualify with the parent.
  if (/^(main|master)$/i.test(base) && parent) return `${parent} · ${base}`;
  return base || label || root.path;
}

export function deriveWorktreePickerProjectRows(
  roots: readonly WorkspaceRoot[],
  activeWorkspace: string | null,
): WorktreePickerProjectRowView[] {
  return roots.map((root) => {
    const isActive = root.id === activeWorkspace;
    const name = workspaceRootName(root);
    return {
      id: root.id,
      label: name,
      path: root.path,
      isActive,
      selectable: root.reachable,
      title: root.reachable
        ? root.path
        : `${root.path} — ${root.unreachable_reason ?? "unreachable"}`,
      ariaLabel: root.reachable
        ? `switch to project ${name}${isActive ? ", current project" : ""}`
        : `${name} — unreachable: ${root.unreachable_reason ?? "path not reachable"}`,
      rowClassName: workspaceMapPickerRowClassName({
        isActive,
        selectable: root.reachable,
      }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
    };
  });
}

/** One row of the dropdown's cross-project "Recent" section: a worktree the
 *  operator navigated to, attributed to its project. Unlike a
 *  `WorkspaceMapPickerRowView` (built from the active project's `/map`), a recent
 *  may belong to ANOTHER registered project, so it is derived from the session's
 *  machine-global `recent_scopes` joined with the registry roots. */
export interface WorktreePickerRecentRowView {
  /** Stable key: `${workspace} ${scope}`. */
  key: string;
  workspace: string;
  scope: string;
  /** The worktree display name (basename of the scope path). */
  worktreeName: string;
  /** The owning project's name (registry label, falling back to basename). */
  projectLabel: string;
  /** The row's primary ink: a same-project entry is just the worktree name; a
   *  cross-project entry LEADS with the project ("project / worktree") so the
   *  distinguishing token carries the emphasis when basenames collide. */
  label: string;
  /** This entry is the current active (workspace, scope). */
  isActive: boolean;
  /** This entry belongs to the currently-active project. */
  sameProject: boolean;
  /** Reachable + switchable (its project root is reachable). */
  selectable: boolean;
  title: string;
  ariaLabel: string;
  rowClassName: string;
  activeCueClassName: string;
}

/** How many cross-project recents the dropdown surfaces (a shortlist, not the
 *  full bounded history the engine retains). */
export const WORKTREE_PICKER_RECENT_LIMIT = 8;

/**
 * Derive the unified cross-project "Recent" rows from the session's machine-global
 * `recent_scopes` (MRU pairs) joined with the registry roots for project naming.
 * The CURRENT (active workspace, active scope) is always prepended and marked
 * current, so the section is never empty and shows where you are at a glance.
 * Deduped by the (workspace, scope) pair and bounded to a shortlist.
 */
export function deriveWorktreePickerRecentRows({
  recentScopes,
  roots,
  activeWorkspace,
  activeScope,
  limit = WORKTREE_PICKER_RECENT_LIMIT,
}: {
  recentScopes: readonly RecentScope[];
  roots: readonly WorkspaceRoot[];
  activeWorkspace: string | null;
  activeScope: string | null;
  limit?: number;
}): WorktreePickerRecentRowView[] {
  const rootById = new Map(roots.map((root) => [root.id, root] as const));
  const keyOf = (workspace: string, scope: string) => `${workspace} ${scope}`;
  const seen = new Set<string>();
  const ordered: Array<{ workspace: string; scope: string }> = [];
  const push = (workspace: unknown, scope: unknown) => {
    if (typeof workspace !== "string" || typeof scope !== "string") return;
    if (workspace.length === 0 || scope.length === 0) return;
    const key = keyOf(workspace, scope);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push({ workspace, scope });
  };
  // The current location is always the first recent (marked current below).
  if (activeWorkspace && activeScope) push(activeWorkspace, activeScope);
  for (const entry of recentScopes) push(entry.workspace, entry.scope);

  return ordered.slice(0, Math.max(0, limit)).map(({ workspace, scope }) => {
    const root = rootById.get(workspace);
    const projectLabel = root ? workspaceRootName(root) : worktreeName(workspace);
    const name = worktreeName(scope);
    const isActive = workspace === activeWorkspace && scope === activeScope;
    const sameProject = workspace === activeWorkspace;
    const selectable = root?.reachable ?? true;
    return {
      key: keyOf(workspace, scope),
      workspace,
      scope,
      worktreeName: name,
      projectLabel,
      label: sameProject ? name : `${projectLabel} / ${name}`,
      isActive,
      sameProject,
      selectable,
      title: sameProject ? scope : `${projectLabel} / ${name}\n${scope}`,
      ariaLabel: sameProject
        ? `switch to ${name}${isActive ? ", current" : ""}`
        : `switch to ${name} in project ${projectLabel}`,
      rowClassName: workspaceMapPickerRowClassName({ isActive, selectable }),
      activeCueClassName: workspaceMapPickerActiveCueClassName(isActive),
    };
  });
}

/** Stores hook: the workspace registry's degradation, read through the wire
 *  client so the picker consumes derived truth instead of the raw `tiers`
 *  block. */
export function useWorkspacesAvailability(): WorkspacesAvailability {
  return deriveWorkspacesAvailability(tiersFromQuery(useWorkspaces()));
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
  const swap = (workspace: unknown, scope: unknown = null) => {
    const intent = normalizeWorkspaceSwitchIntent(workspace, scope);
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
            intent.scope !== null
              ? { active_workspace: intent.workspace, active_scope: intent.scope }
              : { active_workspace: intent.workspace },
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

/**
 * Register a NEW project root from an operator-supplied absolute path
 * (dashboard-workspace-registry ADR): the stores-layer orchestration the
 * AddProjectDialog invokes. The engine `add_workspace` registers the path
 * read-only (it discovers a git workspace and records ONE config row — never
 * clones, inits, or mutates the repository); an invalid path is a tiered 400 the
 * caller surfaces honestly. The engine does NOT echo the new root's id on the PUT,
 * so the id is recovered by DIFFING the registry before/after the registration —
 * a genuinely new root (re-adding an existing path is a no-op that adds none) is
 * then SELECTED through the same wholesale `swap` the project switcher uses, so
 * "add a project" opens it, matching the VS Code / Zed open-folder norm. Returns
 * the added root (or null when the path was already registered / ambiguous).
 */
export function useAddWorkspace() {
  const queryClient = useQueryClient();
  const putSession = usePutSession();
  const { swap } = useSwapWorkspace();
  const add = async (path: unknown): Promise<WorkspaceRoot | null> => {
    const normalized = normalizeStoreScope(path);
    if (normalized === null) {
      throw new Error("a project path is required");
    }
    const before = new Set(
      (
        queryClient.getQueryData<WorkspacesState>(engineKeys.workspaces())
          ?.workspaces ?? []
      ).map((root) => root.id),
    );
    await putSession.mutateAsync({ add_workspace: normalized });
    // Re-read the registry to learn the newly-registered root's id (the PUT
    // echoes only the session, not the registered id). `usePutSession` already
    // invalidated the workspaces key, so this resolves the authoritative shape.
    const after = await queryClient.fetchQuery({
      queryKey: engineKeys.workspaces(),
      queryFn: () => engineClient.workspaces(),
    });
    const added = after.workspaces.find((root) => !before.has(root.id)) ?? null;
    if (added) await swap(added.id);
    return added;
  };
  return { add, mutation: putSession };
}

/**
 * Remove ONE entry from the machine-global cross-project recents (history CRUD):
 * the stores-layer seam the project navigator invokes to prune a single recent.
 * Rides the `PUT /session` config surface (`remove_recent_scope`), which
 * invalidates the session key so the history re-reads. Fire-and-forget by default
 * (a failed prune never blocks the UI), but returns the promise for callers that
 * want to await.
 */
export function useRemoveRecent(): (entry: RecentScope) => Promise<unknown> {
  const putSession = usePutSession();
  return (entry: RecentScope) => {
    const workspace = normalizeStoreScope(entry?.workspace);
    const scope = normalizeStoreScope(entry?.scope);
    if (workspace === null || scope === null) return Promise.resolve(undefined);
    return putSession
      .mutateAsync({ remove_recent_scope: { workspace, scope } })
      .catch(() => undefined);
  };
}

/** Clear the ENTIRE machine-global cross-project recents (history CRUD). Rides the
 *  `PUT /session` config surface (`clear_recent_scopes`). */
export function useClearRecents(): () => Promise<unknown> {
  const putSession = usePutSession();
  return () =>
    putSession.mutateAsync({ clear_recent_scopes: true }).catch(() => undefined);
}

export type WorkspaceSwitchIntent = {
  workspace: string;
  scope: string | null;
};

export function normalizeWorkspaceSwitchIntent(
  workspace: unknown,
  scope: unknown = null,
): WorkspaceSwitchIntent {
  const normalizedWorkspace = normalizeStoreScope(workspace);
  if (normalizedWorkspace === null) {
    throw new Error("workspace switch requires a non-empty workspace");
  }
  return {
    workspace: normalizedWorkspace,
    scope: normalizeStoreScope(scope),
  };
}

export function normalizeAcceptedWorkspaceSwitchState(
  session: Pick<SessionState, "active_workspace" | "active_scope">,
  intent: WorkspaceSwitchIntent,
): WorkspaceSwitchIntent {
  return {
    workspace: normalizeStoreScope(session.active_workspace) ?? intent.workspace,
    scope: normalizeStoreScope(session.active_scope) ?? intent.scope,
  };
}

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

function mirrorAcceptedSessionScopeContext(session: SessionState): void {
  useViewStore.getState().mirrorSessionScopeContext({
    folder: session.scope_context.folder,
    featureTags: session.scope_context.feature_tags,
  });
}

function applyAcceptedWorkspaceSwitch(
  session: SessionState,
  intent: WorkspaceSwitchIntent,
  queryClient: QueryClient,
): void {
  const accepted = normalizeAcceptedWorkspaceSwitchState(session, intent);
  useViewStore.getState().swapWorkspace(accepted.workspace, accepted.scope);
  mirrorAcceptedSessionScopeContext(session);
  // The PUT builds/warms the new scope server-side. Clear stale project reads
  // only after acceptance, then refetch now that the scope is warm so the
  // switch lands its corpus in-session (live verification finding H6).
  refreshAfterAcceptedWorkspaceSwitch(queryClient);
}

export function seedSessionCache(
  queryClient: QueryClient,
  session: SessionState,
): void {
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

export function normalizeActiveScopeSwitchScope(scope: unknown): string {
  const normalized = normalizeStoreScope(scope);
  if (normalized === null) {
    throw new Error("scope switch requires a non-empty scope");
  }
  return normalized;
}

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
  mirrorAcceptedSessionScopeContext(session);
  refreshAfterAcceptedScopeSwitch(queryClient);
}

/**
 * Stores-layer worktree scope switch: durable session persistence first, then the
 * local wholesale reset from the accepted active scope. Calls are serialized and
 * superseded requests are ignored at this seam, so a rapid A -> B click cannot
 * let A's later response re-apply stale graph/git/search scope after B became the
 * user's latest intent. Pure resolvers can call the imperative form; React
 * surfaces that need only the durable scope transition use `useSwitchActiveScope`
 * to bind their provider client. Worktree UI activation uses
 * `activateWorktreeScope`, which layers the accepted-scope live playhead reset on
 * top of this durable switch.
 */
export async function switchActiveScope(
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<SessionState> {
  const acceptedScope = normalizeActiveScopeSwitchScope(scope);
  requestedActiveScope = acceptedScope;
  const run = activeScopeSwitchTail
    .catch(() => undefined)
    .then(async () => {
      try {
        const session = await engineClient.putSession({ active_scope: acceptedScope });
        const superseded = supersededScopeSwitch(acceptedScope);
        if (superseded) throw superseded;
        applyAcceptedActiveScopeSwitch(session, queryClient);
        return session;
      } catch (error) {
        const superseded = supersededScopeSwitch(acceptedScope);
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

export function useSwitchActiveScope(): (scope: unknown) => Promise<SessionState> {
  const queryClient = useQueryClient();
  return useCallback(
    (scope: unknown) => switchActiveScope(scope, queryClient),
    [queryClient],
  );
}

/**
 * Worktree activation intent: persist the accepted active scope first, then
 * dock dashboard time back to LIVE for that accepted scope. Row clicks and
 * context-menu actions use this single stores-layer transition so session and
 * timeline propagation cannot drift.
 */
export async function activateWorktreeScope(
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<SessionState> {
  const session = await switchActiveScope(scope, queryClient);
  movePlayhead("live", session.active_scope);
  return session;
}

export function useActivateWorktreeScope(): (scope: unknown) => Promise<SessionState> {
  const queryClient = useQueryClient();
  return useCallback(
    (scope: unknown) => activateWorktreeScope(scope, queryClient),
    [queryClient],
  );
}

export interface TimelineBootHealInput {
  scope: string | null;
  stateLoaded: boolean;
  isLive: boolean;
  alreadyHealed: boolean;
}

/**
 * Cold-start timeline healing (TTR-005): with time-travel ENTRY retired, the app
 * must always resolve to a LIVE playhead. A scope whose backend-persisted
 * `timeline_mode` is time-travel would otherwise load into a historical view with
 * no exit (the entry affordances are gone). This derives whether to force live:
 * the active scope's dashboard state has loaded, its persisted mode is NOT live,
 * and this scope has not already been healed this session. `activateWorktreeScope`
 * already heals on explicit worktree activation; this covers the cold-start
 * restore path, which persists a scope but never resets the playhead.
 */
export function deriveTimelineBootHealIntent({
  scope,
  stateLoaded,
  isLive,
  alreadyHealed,
}: TimelineBootHealInput): boolean {
  if (scope === null) return false;
  if (!stateLoaded) return false;
  if (isLive) return false;
  if (alreadyHealed) return false;
  return true;
}

/**
 * Force the dashboard playhead to LIVE once per scope on load (TTR-005). Mounted
 * once by the Stage: after time-travel entry was retired every scope must boot
 * live, so a persisted time-travel mode is healed to live exactly once — idempotent
 * with `activateWorktreeScope` (which also lands live: whichever fires first wins,
 * the other observes `live` and no-ops). One-shot per scope via a healed-set ref so
 * the heal cannot race the session seed or re-fire when its own write settles.
 */
export function useHealTimelineModeToLiveOnBoot(): void {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const healedScopesRef = useRef<Set<string>>(new Set());

  const stateLoaded = dashboardState.data !== undefined;
  const isLive = (dashboardState.data?.timeline_mode?.kind ?? "live") === "live";

  useEffect(() => {
    const alreadyHealed = scope !== null && healedScopesRef.current.has(scope);
    if (
      scope === null ||
      !deriveTimelineBootHealIntent({ scope, stateLoaded, isLive, alreadyHealed })
    ) {
      return;
    }
    healedScopesRef.current.add(scope);
    movePlayhead("live", scope);
  }, [scope, stateLoaded, isLive]);
}

/**
 * Stale-SESSION-INTENT boot heal (dashboard-state field lifetimes ADR,
 * global-state-review 2026-07-03). Dashboard-state fields classify into durable
 * preferences (filters, date range, granularity, corpus, panels — persist forever)
 * and SESSION INTENT: the canonical selection, whose resumption value is real inside
 * a working session and gone after a genuine absence — a days-old persisted
 * selection otherwise silently re-drives the rail reveal, the cluster spotlight, and
 * the camera on a fresh load (GSR-002). Once per scope per app lifetime: when the
 * dashboard state has loaded and the scope's view-local activity stamp is stale
 * (8h) or absent, clear the selection through the ONE canonical selection seam —
 * every surface follows via the existing projection. The scope is then stamped, and
 * re-stamped whenever the canonical selection changes while mounted, so an actively
 * used tab keeps its scope fresh and a mid-session reload resumes. Mirrors the
 * TTR-005 timeline heal's one-shot discipline (its stricter unconditional clear
 * stays — a modal mode with no exit has no resumption value).
 */
export function useHealStaleSessionIntentOnBoot(): void {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const healedScopesRef = useRef<Set<string>>(new Set());

  const stateLoaded = dashboardState.data !== undefined;
  const hasSelection = (dashboardState.data?.selected_ids?.length ?? 0) > 0;
  const selectedId = dashboardSelectionId(dashboardState.data);

  useEffect(() => {
    if (scope === null || !stateLoaded) return;
    const alreadyHealed = healedScopesRef.current.has(scope);
    if (!alreadyHealed) {
      healedScopesRef.current.add(scope);
      const stale = isSessionIntentStale(readSessionIntentTouch(scope), Date.now());
      if (
        deriveSessionIntentBootHealIntent({
          scope,
          stateLoaded,
          hasSelection,
          stale,
          alreadyHealed,
        })
      ) {
        void patchDashboardState(scope, selectionPatch([])).catch(() => undefined);
      }
    }
    stampSessionIntentTouch(scope, Date.now());
  }, [scope, stateLoaded, hasSelection]);

  // Activity tracking: a selection CHANGE while mounted refreshes the scope's stamp,
  // so a long-open, actively-used tab never reads as absent on its next reload.
  useEffect(() => {
    if (scope === null || selectedId === null) return;
    stampSessionIntentTouch(scope, Date.now());
  }, [scope, selectedId]);
}

export interface VaultTreeRequestIdentity {
  scope: string | null;
}

export function normalizeVaultTreeRequestIdentity(
  scope: unknown,
): VaultTreeRequestIdentity {
  return { scope: normalizeGraphSliceScope(scope) };
}

export function useVaultTree(scope: unknown) {
  const request = normalizeVaultTreeRequestIdentity(scope);
  const enabled = request.scope !== null;
  const queryClient = useQueryClient();
  const queryKey = engineKeys.vaultTree(request.scope ?? "");
  const query = useQuery({
    queryKey,
    // Progressive listing (universal-data-loading ADR D5): each accumulated
    // page prefix is written into THIS query's cache entry (`complete: false`)
    // so the rail paints the first page immediately; the resolved value — the
    // whole drained listing, `complete: true` — replaces it on settle. A
    // failed walk falls back to normal query-error semantics.
    queryFn: () =>
      engineClient.vaultTree(request.scope!, (partial) => {
        queryClient.setQueryData(queryKey, partial);
      }),
    enabled,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
}

export interface CodeFilesRequestIdentity {
  scope: string | null;
}

export function normalizeCodeFilesRequestIdentity(
  scope: unknown,
): CodeFilesRequestIdentity {
  return { scope: normalizeGraphSliceScope(scope) };
}

/** The complete code-file listing (search-providers ADR): the client walks the
 *  cursor to completion, so the files(code) provider holds the WHOLE set to
 *  narrow client-side (the complete-paginated-set rule). Bounded cache keyed on
 *  scope, mirroring `useVaultTree`; default gcTime bounds retention. */
export function useCodeFiles(scope: unknown) {
  const request = normalizeCodeFilesRequestIdentity(scope);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.codeFiles(request.scope ?? ""),
    queryFn: () => engineClient.codeFiles(request.scope!),
    enabled,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
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

// The vault tree LISTS DOCUMENTS, so its "are documents available" truth is the
// STRUCTURAL tier alone — that tier is what carries the document graph. A down
// `semantic` tier (rag search), a `declared` tier still "building", or an absent
// `temporal` tier do NOT make documents unavailable: with `structural` up, every
// document is present and listable. Reading ALL canonical tiers here made the rail
// cry "Some documents are temporarily unavailable" whenever semantic search was off
// — a false alarm, and inconsistent with the global/search surface, which correctly
// treats semantic-offline as a search-tier state, not a documents-gone condition.
// Semantic/temporal degradation is surfaced by THOSE features (search, timeline),
// not by the document list.
const VAULT_TREE_CONTENT_TIERS = ["structural"] as const;

export function deriveVaultTreeAvailability(
  tiers: TiersBlock | undefined,
): VaultTreeAvailability {
  return readTierAvailability(tiers, VAULT_TREE_CONTENT_TIERS);
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
export function useVaultTreeAvailability(scope: unknown): VaultTreeAvailability {
  return deriveVaultTreeAvailability(tiersFromQuery(useVaultTree(scope)));
}

export interface VaultTreeSurfaceView {
  tree: ReturnType<typeof useVaultTree>;
  availability: VaultTreeAvailability;
  state: VaultTreeSurfaceState;
  /** False while a progressive partial listing is held (the drain is still
   *  walking — universal-data-loading ADR D5): the rail renders its honest
   *  partial-narrow affordance until this flips true. */
  complete: boolean;
}

/**
 * Stores selector for the vault browser root surface. Degradation remains a
 * non-terminal banner for this surface, but the loading/error classification is
 * still stores-owned so the browser chrome does not branch on raw query flags.
 */
export function useVaultTreeSurface(scope: unknown): VaultTreeSurfaceView {
  const tree = useVaultTree(scope);
  const availability = deriveVaultTreeAvailability(tiersFromQuery(tree));
  return {
    tree,
    availability,
    state: deriveVaultTreeSurfaceState(tree, availability),
    // Absent flag (older cached shapes) reads as complete; only an explicit
    // in-flight partial (`complete: false`) triggers the partial affordance.
    complete: tree.data?.complete !== false,
  };
}

export interface VaultTreeDocTypeGroup {
  docType: string;
  entries: VaultTreeEntry[];
}

export interface VaultTreeFeatureGroup {
  /** The feature tag, without the leading `#`; untagged documents use `(untagged)`. */
  feature: string;
  /** Total document count across every doc-type group in this feature bucket. */
  count: number;
  /** Summed served byte weight of this feature's members (left-rail-tree-controls
   *  corpus-weight sort): 0 when no member carries a served size. A multi-tag
   *  document weighs into each of its features (shares need not sum to 100%). */
  weightBytes: number;
  /** Doc-type sub-groups, in canonical `.vault/` order then alphabetical. */
  docTypes: VaultTreeDocTypeGroup[];
}

export interface VaultTreeBrowserView {
  activeFilter: string;
  entries: VaultTreeEntry[];
  groups: VaultTreeFeatureGroup[];
  filteredToNothing: boolean;
}

// Pipeline reading order (terminology-standardization ADR D2); `index` is never a
// displayed group (ADR D5), so it is omitted here and the feature projection skips
// index entries outright.
const VAULT_TREE_DOC_TYPE_ORDER = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

function vaultTreeDocTypeOrder(present: Iterable<string>): string[] {
  const presentSet = new Set(present);
  const order: string[] = [...VAULT_TREE_DOC_TYPE_ORDER];
  for (const extra of [...presentSet].sort()) {
    if (!order.includes(extra)) order.push(extra);
  }
  return order.filter((docType) => presentSet.has(docType));
}

export function projectVaultTreeFeatureGroups(
  entries: readonly VaultTreeEntry[],
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultTreeFeatureGroup[] {
  const UNTAGGED = "(untagged)";
  const byFeature = new Map<string, Map<string, VaultTreeEntry[]>>();
  for (const entry of entries) {
    // `index` is never a displayed node (terminology-standardization ADR D5): a
    // generated feature index must not appear inside a feature's category sub-groups.
    if (entry.doc_type === "index") continue;
    const features = entry.feature_tags.length > 0 ? entry.feature_tags : [UNTAGGED];
    for (const feature of features) {
      let docMap = byFeature.get(feature);
      if (!docMap) {
        docMap = new Map();
        byFeature.set(feature, docMap);
      }
      const list = docMap.get(entry.doc_type) ?? [];
      list.push(entry);
      docMap.set(entry.doc_type, list);
    }
  }

  const groups: VaultTreeFeatureGroup[] = [];
  for (const [feature, docMap] of byFeature) {
    const docTypes = vaultTreeDocTypeOrder(docMap.keys()).map((docType) => ({
      docType,
      entries: docMap
        .get(docType)!
        .slice()
        .sort((a, b) =>
          // The historical sub-folder order is path-ascending (chronological by
          // the date-stamped stem); a chosen sort key reorders it through the
          // ONE comparator (ADR D3 — one sort concept for the whole tree).
          sort.key === "recency" || sort.key === "docs"
            ? (sort.direction === "desc" ? 1 : -1) * a.path.localeCompare(b.path)
            : compareVaultEntriesBySort(sort, a, b),
        ),
    }));
    const count = docTypes.reduce((n, group) => n + group.entries.length, 0);
    const weightBytes = docTypes.reduce(
      (n, group) =>
        n + group.entries.reduce((m, entry) => m + (entry.size?.bytes ?? 0), 0),
      0,
    );
    groups.push({ feature, count, weightBytes, docTypes });
  }
  return groups;
}

export function filterVaultTreeEntries(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeEntry[] {
  const q = filter.trim().toLowerCase();
  if (q.length === 0) return [...entries];
  return entries.filter(
    (entry) =>
      stemFromPath(entry.path).toLowerCase().includes(q) ||
      entry.path.toLowerCase().includes(q) ||
      entry.feature_tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

export function deriveVaultTreeBrowserView(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeBrowserView {
  const activeFilter = filter.trim();
  const filteredEntries = filterVaultTreeEntries(entries, activeFilter);
  return {
    activeFilter,
    entries: filteredEntries,
    groups: projectVaultTreeFeatureGroups(filteredEntries),
    filteredToNothing: activeFilter.length > 0 && filteredEntries.length === 0,
  };
}

// --- editor linking corpus (document-editor-redesign ADR) ------------------------
//
// The pickable corpus for the document editor's Related and Feature link pickers:
// the existing vault documents (stem + human title + first feature tag) and the
// existing feature-tag vocabulary. Both derive from the ALREADY-served
// `/vault-tree` listing, so the editor stays app/ leaf chrome that fetches nothing
// (dashboard-layer-ownership): the picker reads THIS selector, never the wire.
// Bounded by the vault tree's server ceiling; the combobox narrows this bounded
// slice client-side. Index documents are already excluded from `/vault-tree` rows
// (terminology-standardization ADR D5), so they never surface as link targets.

export interface EditorCorpusDocument {
  /** The document stem (`doc:` id tail) — the value persisted into `related`. */
  stem: string;
  /** The document's H1 title when the row carries one, else the stem. */
  title: string;
  /** The document's first feature tag (bare, no `#`), for the picker row's
   *  category dot; null when the document carries no feature tag. */
  feature: string | null;
}

export interface EditorLinkingCorpus {
  documents: readonly EditorCorpusDocument[];
  /** The distinct feature-tag vocabulary (bare, no `#`), sorted for stable rows. */
  featureTags: readonly string[];
}

export function deriveEditorLinkingCorpus(
  entries: readonly VaultTreeEntry[],
): EditorLinkingCorpus {
  const documents: EditorCorpusDocument[] = entries.map((entry) => {
    const stem = stemFromPath(entry.path);
    return { stem, title: entry.title ?? stem, feature: entry.feature_tags[0] ?? null };
  });
  const featureTags = Array.from(
    new Set(entries.flatMap((entry) => entry.feature_tags)),
  ).sort((a, b) => a.localeCompare(b));
  return { documents, featureTags };
}

/** Stores selector: the editor's link-picker corpus, derived in a useMemo over the
 *  raw vault-tree slice (store-selector law — never derived inside a selector). The
 *  corpus is empty until the tree resolves; the picker degrades to free entry. */
export function useEditorLinkingCorpus(scope: unknown): EditorLinkingCorpus {
  const entries = useVaultTree(scope).data?.entries;
  return useMemo(() => deriveEditorLinkingCorpus(entries ?? []), [entries]);
}

// --- left-rail Vault tab projections (binding `LeftRail` 238:600) -----------------
//
// The Vault tab renders TWO parallel collapsible sections over the SAME
// `/vault-tree` projection (views-are-projections-of-one-model): a FEATURES index
// (feature → its documents) and a doc-type-first DOCUMENTS tree (ADRs / Audits /
// Execution / Plans / References / Research → documents), each leaf a DocRow that
// carries the human title + date + status. Both are narrowed by ONE facet pass —
// the canonical left-rail filter (feature text, doc types, statuses, feature tags,
// date range) — so the rail tree agrees with the graph it filters (left-rail-top
// ADR D5). No engine work and no new wire field: `status`, `dates`, `doc_type`,
// and `feature_tags` are already on the `VaultTreeEntry` the projection reads.

/** Doc-type-first display order for the Documents section — the pipeline reading
 *  order (terminology-standardization ADR D2): Research · Decisions · Plans · Steps
 *  · Audits · References. `index` is hidden (the rail mirrors `.vault/` EXCEPT the
 *  generated index, ADR D5); unknown types append alphabetically. */
const VAULT_RAIL_DOC_TYPE_ORDER = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

export interface VaultDocTypeGroup {
  docType: string;
  count: number;
  /** Member documents, newest-modified first (the board lists recent ADRs top). */
  entries: VaultTreeEntry[];
}

/** Newest-modified first; ties broken by path for a stable order. */
function compareVaultRecency(a: VaultTreeEntry, b: VaultTreeEntry): number {
  const am = a.dates.modified ?? "";
  const bm = b.dates.modified ?? "";
  if (am !== bm) return am < bm ? 1 : -1;
  return a.path.localeCompare(b.path);
}

/** A document's sortable field for a non-recency sort key (left-rail-tree-
 *  controls ADR D3): the served H1 title (falling back to the stem) for `name`,
 *  the day-granular ISO date for `created`/`modified`, the served word count for
 *  `size`. `null` = the fact is absent — an absent fact sorts LAST regardless of
 *  direction (honest absence never floats to the top). */
function vaultEntrySortField(
  entry: VaultTreeEntry,
  key: RailSortKey,
): string | number | null {
  switch (key) {
    case "name":
      return (entry.title ?? stemFromPath(entry.path)).toLowerCase();
    case "created":
      return entry.dates.created ?? null;
    case "modified":
      return entry.dates.modified ?? null;
    case "size":
      return entry.size?.words ?? null;
    case "weight":
      return entry.size?.bytes ?? null;
    case "recency":
    case "docs":
      return null;
  }
}

/** The ONE document comparator the whole vault tree sorts by (ADR D3): `recency`
 *  is the historical newest-modified-first order (direction flips it); every
 *  other key compares its field with absent-last, path tiebreak. */
export function compareVaultEntriesBySort(
  sort: RailSortValue,
  a: VaultTreeEntry,
  b: VaultTreeEntry,
): number {
  // `docs` is a FOLDER-count order — a document list has no per-item count, so
  // its leaves keep the historical recency order (direction still applies).
  if (sort.key === "recency" || sort.key === "docs") {
    const cmp = compareVaultRecency(a, b);
    return sort.direction === "desc" ? cmp : -cmp;
  }
  const av = vaultEntrySortField(a, sort.key);
  const bv = vaultEntrySortField(b, sort.key);
  if (av === null && bv === null) return a.path.localeCompare(b.path);
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  if (cmp === 0) return a.path.localeCompare(b.path);
  return sort.direction === "asc" ? cmp : -cmp;
}

/** Group vault entries by doc type (the Documents section), excluding `index`.
 *  Member order follows the rail sort plane; the default is the historical
 *  newest-modified-first. */
export function projectVaultDocTypeGroups(
  entries: readonly VaultTreeEntry[],
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultDocTypeGroup[] {
  const byType = new Map<string, VaultTreeEntry[]>();
  for (const entry of entries) {
    if (entry.doc_type === "index") continue;
    const list = byType.get(entry.doc_type) ?? [];
    list.push(entry);
    byType.set(entry.doc_type, list);
  }
  const order: string[] = [...VAULT_RAIL_DOC_TYPE_ORDER];
  for (const extra of [...byType.keys()].sort()) {
    if (extra !== "index" && !order.includes(extra)) order.push(extra);
  }
  return order
    .filter((docType) => byType.has(docType))
    .map((docType) => {
      const list = byType
        .get(docType)!
        .slice()
        .sort((a, b) => compareVaultEntriesBySort(sort, a, b));
      return { docType, count: list.length, entries: list };
    });
}

/** The canonical left-rail filter facets, read from `dashboardState.filters`
 *  (+ `date_range`). `featureQuery` is the rail's primary "filter by feature"
 *  control — the backend feature filter (glob/regex over feature_tags) the rail's
 *  feature search bar authors; the rail applies it client-side so it agrees with
 *  the graph the same filter narrows. */
export interface VaultRailFacets {
  featureQuery: FeatureQuery | null;
  docTypes: string[];
  statuses: string[];
  featureTags: string[];
  dateRange: { from?: string; to?: string };
  /** The active date criterion the `date_range` applies to (Issue #14/#38) — the
   *  SAME field the timeline and the engine narrow by. "created" is the default. */
  dateField: "created" | "modified" | "stamped";
}

/** Apply the canonical facet filters to the vault listing (D5): the rail tree
 *  honours the feature query, doc types, statuses, feature tags, and the edited
 *  date range — so it agrees with the graph the same filter narrows. The feature
 *  query is matched against each entry's RAW feature tags AND their sanitized
 *  display names, so a query narrows by either the hyphenated tag or the readable
 *  name (the dual-match the search bar's autofill also uses). */
export function narrowVaultRailEntries(
  entries: readonly VaultTreeEntry[],
  facets: VaultRailFacets,
): VaultTreeEntry[] {
  const { featureQuery, docTypes, statuses, featureTags, dateField } = facets;
  const { from, to } = facets.dateRange;
  return entries.filter((entry) => {
    if (featureQuery) {
      const candidates = entry.feature_tags.flatMap((tag) => [
        tag,
        featureTagDisplayName(tag),
      ]);
      if (!featureQueryMatches(featureQuery, candidates)) return false;
    }
    if (docTypes.length > 0 && !docTypes.includes(entry.doc_type)) return false;
    if (
      statuses.length > 0 &&
      !(entry.status !== undefined && statuses.includes(entry.status))
    ) {
      return false;
    }
    if (
      featureTags.length > 0 &&
      !entry.feature_tags.some((tag) => featureTags.includes(tag))
    ) {
      return false;
    }
    if (from || to) {
      // Compare the entry's ACTIVE-criterion date (created/modified/stamped) — the
      // SAME field the timeline + engine narrow by — against the day-granular ISO
      // bounds (Issue #38). Both sides are normalized to "YYYY-MM-DD", so a string
      // compare is chronological. An entry is excluded only when it lacks THAT
      // field (it cannot fall in range), never because a different/absent field is
      // missing — and after adaptation every entry carries all three dates.
      const value = entry.dates[dateField];
      if (value === undefined) return false;
      if (from && value < from) return false;
      if (to && value > to) return false;
    }
    return true;
  });
}

export interface VaultRailView {
  /** The FEATURES section: feature → its documents (DocRows), most-active first. */
  featureGroups: VaultTreeFeatureGroup[];
  /** The DOCUMENTS section: doc-type folders → documents (DocRows). */
  docTypeGroups: VaultDocTypeGroup[];
  featureCount: number;
  docTypeCount: number;
  /** A facet was active but narrowed everything away (vs. an empty corpus). */
  filteredToNothing: boolean;
  /** Total served byte weight of the WHOLE (unfiltered) vault listing — the
   *  corpus-weight share denominator, so a feature's share stays stable while a
   *  filter narrows the visible set. 0 when no entry carries a size. */
  totalCorpusBytes: number;
}

/** A feature folder's sortable aggregate for a non-recency key (ADR D3): its
 *  name, its newest member date, or its summed member word count. `null` =
 *  no member carries the fact — the folder sorts last. */
function featureGroupSortField(
  group: VaultTreeFeatureGroup,
  key: RailSortKey,
): string | number | null {
  if (key === "name") return group.feature.toLowerCase();
  if (key === "weight") return group.weightBytes > 0 ? group.weightBytes : null;
  let maxDate: string | null = null;
  let words: number | null = null;
  for (const sub of group.docTypes) {
    for (const entry of sub.entries) {
      if (key === "size" && entry.size) words = (words ?? 0) + entry.size.words;
      if (key === "created" || key === "modified") {
        const value = entry.dates[key];
        if (value !== undefined && (maxDate === null || value > maxDate)) {
          maxDate = value;
        }
      }
    }
  }
  return key === "size" ? words : maxDate;
}

/** Derive the whole Vault-tab view from the entries + the canonical facets,
 *  ordered by the ONE rail sort plane (left-rail-tree-controls ADR D3). The
 *  default is the historical order byte-for-byte: features most-active first,
 *  documents newest-modified first. */
export function deriveVaultRailView(
  entries: readonly VaultTreeEntry[],
  facets: VaultRailFacets,
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultRailView {
  const narrowed = narrowVaultRailEntries(entries, facets);
  const featureGroups = projectVaultTreeFeatureGroups(narrowed, sort).sort((a, b) => {
    if (sort.key === "recency" || sort.key === "docs") {
      const cmp = b.count - a.count;
      if (cmp !== 0) return sort.direction === "desc" ? cmp : -cmp;
      return a.feature.localeCompare(b.feature);
    }
    const av = featureGroupSortField(a, sort.key);
    const bv = featureGroupSortField(b, sort.key);
    if (av === null && bv === null) return a.feature.localeCompare(b.feature);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    if (cmp === 0) return a.feature.localeCompare(b.feature);
    return sort.direction === "asc" ? cmp : -cmp;
  });
  const docTypeGroups = projectVaultDocTypeGroups(narrowed, sort);
  const anyFacet =
    facets.featureQuery !== null ||
    facets.docTypes.length > 0 ||
    facets.statuses.length > 0 ||
    facets.featureTags.length > 0 ||
    Boolean(facets.dateRange.from) ||
    Boolean(facets.dateRange.to);
  return {
    featureGroups,
    docTypeGroups,
    featureCount: featureGroups.length,
    docTypeCount: docTypeGroups.length,
    filteredToNothing: anyFacet && narrowed.length === 0,
    totalCorpusBytes: entries.reduce((n, entry) => n + (entry.size?.bytes ?? 0), 0),
  };
}

/** Stores selector for the canonical left-rail facets. The rail reads the SAME
 *  `dashboardState.filters` the graph filter authors (no second source of truth),
 *  so the Vault tree and the graph narrow identically (dashboard-layer-ownership,
 *  filtering-has-one-canonical-surface). */
export function useVaultRailFacets(scope: unknown): VaultRailFacets {
  const dashboardState = useDashboardState(scope);
  // The rail narrows by the SAME date field the timeline + engine use: the active
  // criterion when the engine advertises it (capability gate), else the "created"
  // default the engine applies (Issue #14/#38). A primitive — stable-selector safe.
  const { criterion, served } = useTimelineDateCriterion(scope);
  const dateField = served ? criterion : "created";
  return useMemo(() => {
    const filters = dashboardState.data?.filters;
    return {
      featureQuery: filters?.feature_query ?? null,
      docTypes: filters?.doc_types ?? [],
      statuses: filters?.statuses ?? [],
      featureTags: filters?.feature_tags ?? [],
      dateRange: dashboardState.data?.date_range ?? {},
      dateField,
    };
  }, [dashboardState.data, dateField]);
}

/** The canonical facet filter serialized for the timeline's lineage read
 *  (unified-filter-plane D3): the timeline narrows by the SAME
 *  `dashboardState.filters` the rail authors and the graph consumes, so a feature
 *  filter set in the rail (or a category toggled on the graph) narrows the
 *  timeline too. Returns `undefined` when no facet is active. Selects the raw,
 *  stable filters slice and derives the string in `useMemo` — never inside the
 *  selector (stable-selectors). The date range is excluded by
 *  `dashboardLineageFilterArg`; the timeline owns its own date axis. */
export function useTimelineLineageFilterArg(scope: unknown): string | undefined {
  const dashboardState = useDashboardState(scope);
  const filters = dashboardState.data?.filters;
  const { criterion, served } = useTimelineDateCriterion(scope);
  // The active date criterion rides as the `date_field` facet so the timeline
  // narrows by the SAME field the graph does (Issue #14). Only sent for a
  // non-default criterion AND only when the engine advertises it (capability gate),
  // so an older engine — which rejects unknown filter fields — never receives it.
  const dateField = served && criterion !== "created" ? criterion : undefined;
  return useMemo(
    () => (filters ? dashboardLineageFilterArg({ filters }, dateField) : undefined),
    [filters, dateField],
  );
}

export type TimelineDateCriterion = "created" | "modified" | "stamped";

export interface TimelineDateCriterionView {
  /** The active date field (`created` default). */
  criterion: TimelineDateCriterion;
  /** Whether the engine serves the `timeline_date_criterion` setting — the
   *  capability gate for enabling Modified/Stamped + sending `date_field`. */
  served: boolean;
}

export function deriveTimelineDateCriterion(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
): TimelineDateCriterionView {
  const eff = resolveEffectiveSetting(
    schema,
    settings,
    activeScope,
    CONSUMED_SETTING_KEYS.timelineDateCriterion,
  );
  const value = eff?.value;
  const criterion: TimelineDateCriterion =
    value === "modified" || value === "stamped" ? value : "created";
  return { criterion, served: eff !== null };
}

/** The active timeline date criterion, read from the engine-served
 *  `timeline_date_criterion` setting (schema-driven persistence, Issue #14). */
export function useTimelineDateCriterion(scope: unknown): TimelineDateCriterionView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return useMemo(
    () => deriveTimelineDateCriterion(schema.data, settings.data, scope),
    [schema.data, settings.data, scope],
  );
}

/** A plain narrow string for the Files tree (which can only narrow paths by text):
 *  the canonical feature query stripped of its glob/regex grammar down to the
 *  literal a path match can use. The Vault tree narrows by the feature query
 *  proper; the Files tree shares the SAME canonical control through this reduction
 *  so one bar narrows both tabs. */
export function useVaultFilesNarrowText(scope: unknown): string {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => featureQueryPlainText(dashboardState.data?.filters.feature_query),
    [dashboardState.data?.filters.feature_query],
  );
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

export interface FileTreeRequestIdentity {
  scope: string | null;
  path: string | undefined;
  enabled: boolean;
}

export function normalizeFileTreeRequestIdentity(
  scope: unknown,
  path: unknown = undefined,
  enabled: unknown = true,
): FileTreeRequestIdentity {
  const normalizedPath =
    path === undefined || path === null
      ? undefined
      : typeof path === "string"
        ? path.trim() || undefined
        : null;
  return {
    scope: normalizeGraphSliceScope(scope),
    path: normalizedPath ?? undefined,
    enabled: normalizedPath !== null && enabled === true,
  };
}

export function useFileTree(scope: unknown, path?: unknown, enabled: unknown = true) {
  const request = normalizeFileTreeRequestIdentity(scope, path, enabled);
  const active = request.scope !== null && request.enabled;
  const query = useQuery({
    queryKey: engineKeys.fileTree(request.scope ?? "", request.path),
    queryFn: () => engineClient.fileTree({ scope: request.scope!, path: request.path }),
    enabled: active,
  });
  return withManualRetry(active ? query : { ...query, data: undefined });
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

export interface FileTreeRowView {
  entry: FileTreeEntry;
  /** Final path segment rendered by the code browser row. */
  displayName: string;
}

export interface FileTreeLevelView {
  state: FileTreeLevelState;
  entries: FileTreeEntry[];
  /** Render-ready rows so app chrome does not parse file paths. */
  rows: FileTreeRowView[];
  truncated: FileTreeResponse["truncated"];
  loadingMessage: string;
  errorTitle: string;
  retryLabel: string;
  emptyMessage: string;
  childLoadingMessage: string;
  childErrorMessage: string;
  truncationMessage: string | null;
  childLoadingClassName: string;
  childErrorClassName: string;
  truncationClassName: string;
  retry: () => void;
}

function fileTreeEntryDisplayName(path: string): string {
  return path.replace(/\/+$/, "").replace(/^.*\//, "");
}

function fileTreeTruncationMessage(
  truncated: FileTreeResponse["truncated"],
): string | null {
  return truncated
    ? `more here (${truncated.total_children}) — expand a subdirectory to narrow.`
    : null;
}

const FILE_TREE_LEVEL_COPY = {
  loadingMessage: "reading the worktree…",
  errorTitle: "code tree unavailable",
  retryLabel: "try again",
  emptyMessage: "No source files in this worktree yet.",
  childLoadingMessage: "…",
  childErrorMessage: "could not list this directory.",
  childLoadingClassName:
    "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
  childErrorClassName: "px-fg-1 py-fg-0-5 text-caption text-state-broken",
  truncationClassName: "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
} as const;

export function fileTreeChildStatusStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${0.25 + depth * 0.75}rem` };
}

export function deriveFileTreeLevelView(
  data: FileTreeResponse | undefined,
  loading: boolean,
  errored: boolean,
  retry: () => void = noopRetry,
): FileTreeLevelView {
  const base = {
    ...FILE_TREE_LEVEL_COPY,
    truncationMessage: null,
    retry,
  };
  if (loading) {
    return { state: "loading", entries: [], rows: [], truncated: null, ...base };
  }
  if (errored) {
    return { state: "error", entries: [], rows: [], truncated: null, ...base };
  }
  const entries = data?.entries ?? [];
  const rows = entries.map((entry) => ({
    entry,
    displayName: fileTreeEntryDisplayName(entry.path),
  }));
  return {
    state: entries.length === 0 ? "empty" : "ready",
    entries,
    rows,
    truncated: data?.truncated ?? null,
    ...FILE_TREE_LEVEL_COPY,
    truncationMessage: fileTreeTruncationMessage(data?.truncated ?? null),
    retry,
  };
}

/** Stores selector for one file-tree directory level. */
export function useFileTreeLevel(
  scope: unknown,
  path?: unknown,
  enabled: unknown = true,
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
export function useFileTreeAvailability(scope: unknown): FileTreeAvailability {
  return deriveFileTreeAvailability(tiersFromQuery(useFileTree(scope)));
}

export interface FileTreeRootSurfaceView {
  rootLevel: FileTreeLevelView;
  availability: FileTreeAvailability;
  state: FileTreeRootSurfaceState;
  degradedMessage: string;
  browserLabel: string;
  loadingClassName: string;
  errorRootClassName: string;
  errorTitleClassName: string;
  retryButtonClassName: string;
  degradedClassName: string;
  emptyClassName: string;
  navClassName: string;
}

function fileTreeDegradedMessage(availability: FileTreeAvailability): string {
  const reason = tierAvailabilityReason(availability);
  return `this scope has no code tree${reason ? ` — ${reason}` : ""}. the vault browser remains available.`;
}

/**
 * Stores selector for the code browser root surface. Unlike the vault browser,
 * file-tree structural degradation is terminal for code mode: a remote/bare
 * scope has no worktree directory hierarchy to render.
 */
export function useFileTreeRootSurface(scope: unknown): FileTreeRootSurfaceView {
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
    degradedMessage: fileTreeDegradedMessage(availability),
    browserLabel: "code browser",
    loadingClassName: "animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint",
    errorRootClassName: "space-y-fg-1 px-fg-1 py-fg-0-5",
    errorTitleClassName: "text-label text-state-broken",
    retryButtonClassName:
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    degradedClassName:
      "mx-fg-1 my-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted",
    emptyClassName: "px-fg-1 py-fg-0-5 text-label text-ink-faint",
    navClassName: "text-label",
  };
}

export interface FiltersVocabularyRequestIdentity {
  scope: string | null;
  /** The corpus whose facet vocabulary is served (codebase-graphing ADR D5 —
   *  `/filters` serves the ACTIVE corpus only; the code corpus carries its own
   *  mtime date span per the code-timeline-range ADR). */
  corpus: GraphCorpus;
}

export function normalizeFiltersVocabularyRequestIdentity(
  scope: unknown,
  corpus?: unknown,
): FiltersVocabularyRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    corpus: normalizeDashboardGraphCorpus(corpus),
  };
}

export function useFiltersVocabulary(scope: unknown, corpus?: unknown) {
  const request = normalizeFiltersVocabularyRequestIdentity(scope, corpus);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.filters(request.scope ?? "", request.corpus),
    queryFn: () => engineClient.filters(request.scope!, request.corpus),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export interface FiltersVocabularyView {
  vocabulary: FiltersVocabulary | undefined;
  /** The enabled vocabulary query is in flight. */
  loading: boolean;
  /** Facet controls should show loading instead of "none in corpus". */
  facetsLoading: boolean;
  docTypes: string[];
  featureTags: string[];
  /** STATUS lifecycle vocabulary (ADR adjectives + plan meta-states). */
  statuses: string[];
  /** PLAN STATUS lifecycle vocabulary (active/complete), engine-served. */
  planStates: string[];
  /** HEALTH validity vocabulary (dangling/orphaned, present-in-corpus). */
  health: string[];
  dateBounds: FiltersVocabulary["date_bounds"];
  /** Per-criterion corpus spans (Issue #14): the timeline's edges for each date
   *  field. Present only on an engine that serves it (the Modified/Stamped gate). */
  dateBoundsByField: FiltersVocabulary["date_bounds_by_field"];
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
    statuses: vocabulary?.statuses ?? [],
    planStates: vocabulary?.plan_states ?? [],
    health: vocabulary?.health ?? [],
    dateBounds: vocabulary?.date_bounds,
    dateBoundsByField: vocabulary?.date_bounds_by_field,
  };
}

/**
 * Stores selector for filter-vocabulary UI consumers. It prepares the data-driven
 * facet lists and loading semantics once so palette/sidebar chrome does not
 * branch on raw query flags or repeat optional field fallbacks.
 */
export function useFiltersVocabularyView(
  scope: unknown,
  corpus?: unknown,
): FiltersVocabularyView {
  const request = normalizeFiltersVocabularyRequestIdentity(scope, corpus);
  const query = useFiltersVocabulary(scope, corpus);
  const loading = request.scope !== null && query.isPending;
  const awaitingScope = request.scope === null;
  return useMemo(
    () => deriveFiltersVocabularyView(query.data, loading, awaitingScope),
    [query.data, loading, awaitingScope],
  );
}

/** The tiers the timeline's dated-document axis depends on. The vault tree
 *  deliberately scopes its content availability to `structural` only and leaves
 *  temporal degradation to THIS surface (see `VAULT_TREE_CONTENT_TIERS`): the
 *  timeline draws the temporal axis, so a structural- or temporal-tier outage is
 *  the timeline's degraded condition. Semantic is search-only and never gates it. */
const TIMELINE_CONTENT_TIERS = ["structural", "temporal"] as const;

export interface TimelineAvailability {
  /** A structural/temporal tier is unavailable on the served filters vocabulary, so
   *  the timeline renders the uniform degraded state. Read from the tiers block (a
   *  fresh error envelope's tiers winning over a stale held-success block), never
   *  guessed from a transport error (degradation-is-read-from-tiers). */
  degraded: boolean;
}

/** Derive the timeline's degraded state from the filters vocabulary's tiers block.
 *  The corpus date bounds the timeline scrubs ride the `/filters` envelope, which
 *  carries the per-tier availability block; when the structural/temporal tier is
 *  down the bounds are unreliable, which is DEGRADED — distinct from a loaded-but-
 *  empty corpus (no dated documents), which is EMPTY. */
export function useTimelineAvailability(
  scope: unknown,
  corpus?: unknown,
): TimelineAvailability {
  const query = useFiltersVocabulary(scope, corpus);
  const errorTiers = query.error instanceof EngineError ? query.error.tiers : undefined;
  const tiers = errorTiers ?? query.data?.tiers_block;
  return useMemo(
    () => ({
      degraded: readTierAvailability(tiers, TIMELINE_CONTENT_TIERS).degraded,
    }),
    [tiers],
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

export interface DashboardStateRequestIdentity {
  scope: string | null;
  sessionIdentity: string;
}

export function normalizeDashboardStateRequestIdentity(
  scope: unknown,
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): DashboardStateRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    sessionIdentity: dashboardStateSessionIdentity(session),
  };
}

/**
 * The canonical frontend reader for shared dashboard state. Scope identifies the
 * dashboard snapshot; the backend session identity joins the key so a session
 * swap cannot serve another session's cached intent.
 */
export function useDashboardState(scope: unknown) {
  const session = useSession();
  const request = normalizeDashboardStateRequestIdentity(scope, session.data);
  const enabled = request.scope !== null && session.isSuccess;
  const query = useQuery<DashboardState>({
    queryKey: engineKeys.dashboardState(request.scope ?? "", request.sessionIdentity),
    // Forward TanStack's AbortSignal so a query cancellation (unmount / clear /
    // scope swap) aborts the in-flight fetch and TanStack OWNS the resulting
    // cancellation — instead of leaving a dangling /dashboard-state fetch that the
    // env teardown later aborts as an UNHANDLED rejection (the VaultBrowser render
    // test's red). Mirrors the graph-query signal-threading already in this module.
    queryFn: ({ signal }) => engineClient.dashboardState(request.scope!, signal),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** Stores/server selector for the canonical selected dashboard node id. */
export function useDashboardSelectedNodeId(scope: unknown): string | null {
  const dashboardState = useDashboardState(scope);
  return dashboardSelectionId(dashboardState.data);
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
  const normalized = normalizeDashboardDateRange(dateRange);
  const fromMs = parseDashboardDateTick(normalized.from);
  const toMs = parseDashboardDateTick(normalized.to);
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
  scope: unknown,
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
    dateRange: normalizeDashboardDateRange(state?.date_range),
  };
}

/**
 * Stores selector for the timeline range selector. The component remains the
 * single writer for date-range intent, but committed band rendering reads one
 * stores-owned projection of canonical dashboard state.
 */
export function useDashboardRangeSelectView(scope: unknown): DashboardRangeSelectView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardRangeSelectView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardGraphDefaultsInitializationView {
  loaded: boolean;
  fresh: boolean;
  identity: string | null;
}

export function dashboardGraphDefaultsInitializationIdentity(
  scope: unknown,
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): string | null {
  const normalizedScope = normalizeGraphSliceScope(scope);
  if (normalizedScope === null || !session) return null;
  return stableKey({
    scope: normalizedScope,
    session: dashboardStateSessionIdentity(session),
  });
}

export function deriveDashboardGraphDefaultsInitializationView(
  state: Pick<DashboardState, "filters" | "graph_granularity"> | undefined,
  identity: string | null = null,
): DashboardGraphDefaultsInitializationView {
  return {
    loaded: state !== undefined,
    fresh: state ? isFreshDashboardGraphDefaultsState(state) : false,
    identity,
  };
}

/**
 * Stores selector for settings graph-default initialization. Settings effects
 * orchestrate the one-time write, but dashboard-state readiness/freshness is
 * interpreted here so the app effect does not read raw dashboard payloads.
 */
export function useDashboardGraphDefaultsInitializationView(
  scope: unknown,
): DashboardGraphDefaultsInitializationView {
  const session = useSession();
  const dashboardState = useDashboardState(scope);
  const identity = dashboardGraphDefaultsInitializationIdentity(scope, session.data);
  return useMemo(
    () => deriveDashboardGraphDefaultsInitializationView(dashboardState.data, identity),
    [dashboardState.data, identity],
  );
}

export interface DashboardFilterSummaryView {
  activeFilterCount: number;
  dateRangeLabel: string | null;
}

function dashboardDateRangeLabel(
  dateRange: DashboardDateRange | undefined,
): string | null {
  const normalized = normalizeDashboardDateRange(dateRange);
  if (!normalized.from && !normalized.to) return null;
  return `${normalized.from?.slice(0, 10) ?? "…"} → ${
    normalized.to?.slice(0, 10) ?? "…"
  }`;
}

export function deriveDashboardFilterSummaryView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
): DashboardFilterSummaryView {
  const filters = state?.filters ?? {};
  return {
    // The advanced-flyout facet count shown on the Filters button badge. The
    // feature query is NOT counted here — it is the visible search bar's own
    // state, authored beside the flyout, not an advanced facet inside it.
    activeFilterCount:
      (filters.doc_types?.length ?? 0) +
      (filters.feature_tags?.length ?? 0) +
      (filters.statuses?.length ?? 0) +
      (filters.plan_states?.length ?? 0) +
      (filters.health?.length ?? 0) +
      (filters.relations?.length ?? 0) +
      (filters.structural_state?.length ?? 0),
    dateRangeLabel: dashboardDateRangeLabel(state?.date_range),
  };
}

/**
 * Stores selector for the stage filter toolbar summary. FilterBar is display
 * chrome; it renders the count/date labels without reinterpreting the dashboard
 * wire shape beside the canonical graph/date selectors.
 */
export function useDashboardFilterSummaryView(
  scope: unknown,
): DashboardFilterSummaryView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterSummaryView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardFilterChoicesView {
  choices: FilterChoices;
  loaded: boolean;
}

export function deriveDashboardFilterChoicesView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
): DashboardFilterChoicesView {
  return {
    choices: filterChoicesFromDashboardState(state),
    loaded: state !== undefined,
  };
}

/**
 * Stores/server selector for canonical dashboard filter choices. The pure
 * projection stays in stores/view/filters, but the dashboard-state subscription
 * lives here with the other dashboard-state selectors so consumers do not wire a
 * query hook from the view layer.
 */
export function useDashboardFilterChoicesView(
  scope: unknown,
): DashboardFilterChoicesView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterChoicesView(dashboardState.data),
    [dashboardState.data],
  );
}

export function useDashboardFilterChoices(scope: unknown): FilterChoices {
  return useDashboardFilterChoicesView(scope).choices;
}

export type DashboardEditedWindow = "any" | "7d" | "30d" | "year";

const DAY_MS = 24 * 3600 * 1000;

export interface DashboardEditedWindowOptionView {
  key: DashboardEditedWindow;
  label: string;
}

export interface DashboardEditedWindowRowView extends DashboardEditedWindowOptionView {
  active: boolean;
  inputClassName: string;
  labelClassName: string;
  valueClassName: string;
}

export interface DashboardFilterSidebarPresentationView {
  panelAriaLabel: string;
  panelClassName: string;
  headerClassName: string;
  titleClassName: string;
  headerActionsClassName: string;
  titleLabel: string;
  clearAllClassName: string;
  clearAllLabel: string;
  clearAllAriaLabel: string;
  closeButtonClassName: string;
  closeAriaLabel: string;
  sectionClassName: string;
  sectionButtonClassName: string;
  sectionMetaClassName: string;
  sectionBadgeClassName: string;
  sectionIconClassName: string;
  sectionBodyClassName: string;
  kindSectionLabel: string;
  featureSectionLabel: string;
  editedSectionLabel: string;
  editedWindowAriaLabel: string;
  facetEmptyClassName: string;
  facetListClassName: string;
  facetOverflowButtonClassName: string;
  footerClassName: string;
  footerTextClassName: string;
  editedWindows: DashboardEditedWindowOptionView[];
}

export const DASHBOARD_FILTER_SIDEBAR_PRESENTATION: DashboardFilterSidebarPresentationView =
  {
    panelAriaLabel: "filter panel",
    // The advanced-filter flyout is portalled to <body> and positioned (fixed) to
    // the RIGHT of the rail's Filters button so it flies out OVER the stage — the
    // graph and any open documents — rather than being clipped inside the rail
    // column. The top/left are set inline from the trigger rect; this class owns
    // only the layer and pointer surface. The entrance is a fade applied by the
    // container ONLY once the anchor has settled (no slide — it would read as a
    // jump while the rail header reflows into place on open).
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
  };

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
  statuses: string[];
  planStates: string[];
  health: string[];
  editedWindow: DashboardEditedWindow;
  editedWindowRows: DashboardEditedWindowRowView[];
  dateActive: boolean;
  anyActive: boolean;
  presentation: DashboardFilterSidebarPresentationView;
}

export function deriveDashboardFilterSidebarView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
  now = Date.now(),
): DashboardFilterSidebarView {
  const filters = state?.filters ?? {};
  const dateRange = normalizeDashboardDateRange(state?.date_range);
  const dateActive = hasActiveDashboardDateRange(dateRange);
  const editedWindow = dashboardEditedWindowFromRange(dateRange, now);
  return {
    filters,
    dateRange,
    docTypes: filters.doc_types ?? [],
    featureTags: filters.feature_tags ?? [],
    statuses: filters.statuses ?? [],
    planStates: filters.plan_states ?? [],
    health: filters.health ?? [],
    editedWindow,
    editedWindowRows: DASHBOARD_FILTER_SIDEBAR_PRESENTATION.editedWindows.map(
      (option) => ({
        ...option,
        active: option.key === editedWindow,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: option.key === editedWindow ? "text-ink" : "text-ink-muted",
      }),
    ),
    dateActive,
    presentation: DASHBOARD_FILTER_SIDEBAR_PRESENTATION,
    anyActive:
      (filters.doc_types?.length ?? 0) > 0 ||
      (filters.feature_tags?.length ?? 0) > 0 ||
      (filters.statuses?.length ?? 0) > 0 ||
      (filters.plan_states?.length ?? 0) > 0 ||
      (filters.health?.length ?? 0) > 0 ||
      (filters.relations?.length ?? 0) > 0 ||
      (filters.structural_state?.length ?? 0) > 0 ||
      dateActive,
  };
}

/**
 * Stores selector for the full filter sidebar. The sidebar is app chrome: it
 * renders selected facets, active badges, and edited-window radios from one
 * interpreted dashboard-state view instead of reading raw filter/date payloads.
 */
export function useDashboardFilterSidebarView(
  scope: unknown,
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
  scope: unknown,
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
export function useDashboardPlayheadView(scope: unknown): DashboardPlayheadView {
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
  dateField?: TimelineDateCriterion,
): DashboardStageSceneView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  return {
    selectedIds: state?.selected_ids ? [...state.selected_ids] : [],
    selectedNodeId: dashboardSelectionId(state),
    graphQuery: state ? dashboardGraphQueryVariables(state, dateField) : null,
    granularity: state?.graph_granularity ?? "feature",
    activeRepresentationMode: normalizeDashboardRepresentationMode(
      state?.representation_mode,
    ),
    graphBounds: state?.graph_bounds
      ? normalizeDashboardGraphBounds(state.graph_bounds)
      : undefined,
    timeline,
    liveTimeline: !timeline.timeTravel,
  };
}

/**
 * Stores selector for the Stage scene-owner read model. Stage still owns scene
 * commands, but dashboard-state interpretation stays centralized with the other
 * visual UI selectors.
 */
export function useDashboardStageSceneView(scope: unknown): DashboardStageSceneView {
  const dashboardState = useDashboardState(scope);
  const { criterion, served } = useTimelineDateCriterion(scope);
  // The graph narrows its date_range window by the active criterion (Issue #14),
  // gated to a non-default, engine-advertised value so an older engine is unaffected.
  const dateField = served && criterion !== "created" ? criterion : undefined;
  return useMemo(
    () => deriveDashboardStageSceneView(dashboardState.data, dateField),
    [dashboardState.data, dateField],
  );
}

export interface DashboardGraphControlsView {
  timeline: DashboardTimelineModeView;
  representationMode: DashboardState["representation_mode"];
  graphBounds: DashboardGraphBounds;
  freezeAvailable: boolean;
  /** The active graph granularity — the read-back the View section's Features /
   *  Documents toggle renders its active segment from, so the control can never
   *  drift from the served dashboard-state. */
  granularity: GraphGranularity;
}

export function deriveDashboardGraphControlsView(
  state:
    | Pick<
        DashboardState,
        "graph_bounds" | "representation_mode" | "timeline_mode" | "graph_granularity"
      >
    | undefined,
): DashboardGraphControlsView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  const representationMode = normalizeDashboardRepresentationMode(
    state?.representation_mode,
  );
  return {
    timeline,
    representationMode,
    graphBounds: normalizeDashboardGraphBounds(state?.graph_bounds),
    freezeAvailable: representationMode === "connectivity" && !timeline.timeTravel,
    granularity: normalizeDashboardGraphGranularity(state?.graph_granularity),
  };
}

/**
 * Stores selector for graph-control chrome: containment bounds plus the freeze
 * toggle's live/connectivity applicability. Scene commands stay in the app, but
 * dashboard-state interpretation stays here.
 */
export function useDashboardGraphControlsView(
  scope: unknown,
): DashboardGraphControlsView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardGraphControlsView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardShellChromeView {
  panelState: DashboardPanelState;
  timeline: DashboardTimelineModeView;
}

export function deriveDashboardShellChromeView(
  state: Pick<DashboardState, "panel_state" | "timeline_mode"> | undefined,
): DashboardShellChromeView {
  return {
    panelState: normalizeDashboardPanelState(state?.panel_state),
    timeline: deriveDashboardTimelineModeView(state?.timeline_mode),
  };
}

/**
 * Stores selector for AppShell chrome. The shell consumes a single interpreted
 * panel/time-travel view instead of reading raw dashboard-state fields for rail
 * collapse, right-tab, and context-menu operation gating.
 */
export function useDashboardShellChromeView(scope: unknown): DashboardShellChromeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardShellChromeView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface GraphSliceRequestIdentity {
  scope: string | null;
  filter: GraphFilter;
  asOf: string | number | undefined;
  granularity: GraphGranularity;
  lens: SalienceLens;
  focus: string | null;
  corpus: GraphCorpus;
}

function graphSliceRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const normalizeGraphSliceScope = normalizeStoreScope;

export function normalizeGraphSliceAsOf(asOf: unknown): string | number | undefined {
  if (typeof asOf === "number") return Number.isFinite(asOf) ? asOf : undefined;
  if (typeof asOf !== "string") return undefined;
  const normalized = asOf.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeGraphSliceFilter(filter: unknown): GraphFilter {
  const source = graphSliceRecord(filter);
  const normalized: GraphFilter = cloneDashboardFilters(source);
  const dateRange = normalizeDashboardDateRange(source.date_range);
  if (dateRange.from || dateRange.to) normalized.date_range = dateRange;
  return normalized;
}

export function normalizeGraphSliceRequestIdentity(
  scope: unknown,
  filter: unknown,
  asOf: unknown,
  granularity: unknown,
  lens: unknown,
  focus: unknown,
  corpus?: unknown,
): GraphSliceRequestIdentity {
  const normalizedCorpus = normalizeDashboardGraphCorpus(corpus);
  // The code corpus carries no vault Filter grammar, no salience lens, no as_of and
  // no focus (ADR D1/D5 — the queryFn sends none of them), so none of those may be
  // part of the request IDENTITY either: pin them to their canonical defaults so a
  // left-rail filter toggle cannot re-key and re-fetch a byte-identical code slice
  // (settle-on-swap audit — the spurious re-deliveries that interrupted in-flight
  // settles and froze the layout mid-convergence). The ONE facet that does carry
  // over is the timeline's `date_range` (code-timeline-range ADR): it stays in the
  // identity so a range change re-keys and re-narrows the code slice by mtime.
  if (normalizedCorpus === "code") {
    const dateRange = normalizeGraphSliceFilter(filter).date_range;
    const codeFilter = normalizeGraphSliceFilter(undefined);
    if (dateRange) codeFilter.date_range = dateRange;
    return {
      scope: normalizeGraphSliceScope(scope),
      filter: codeFilter,
      asOf: undefined,
      granularity: normalizeDashboardGraphGranularity(granularity),
      lens: normalizeDashboardSalienceLens(undefined),
      focus: normalizeNodeId(undefined),
      corpus: normalizedCorpus,
    };
  }
  return {
    scope: normalizeGraphSliceScope(scope),
    filter: normalizeGraphSliceFilter(filter),
    asOf: normalizeGraphSliceAsOf(asOf),
    granularity: normalizeDashboardGraphGranularity(granularity),
    lens: normalizeDashboardSalienceLens(lens),
    focus: normalizeNodeId(focus),
    corpus: normalizedCorpus,
  };
}

/** Bounded poll interval (ms) for a graph slice whose held tiers block reports a
 *  tier still mid-build. Active ONLY while that holds; the predicate returns
 *  false the moment the fold flips the tier to ready, so the poll self-clears
 *  (bounded-by-default-for-every-accumulator). */
const GRAPH_BUILDING_REFETCH_MS = 4_000;

/**
 * Whether a HELD graph slice's tiers block still names a tier mid-build (the
 * engine's unavailable-while-building sentinel — a canonical tier marked
 * unavailable with a reason that names a build). The tiers block is a per-fetch
 * SNAPSHOT, and a declared fold's completion splices its edges via the no-refetch
 * delta path (graphSync), so a "still building" tier would otherwise never clear
 * from the held slice until an unrelated refetch — the stuck "Still loading
 * links…" banner (Issue #4A). While this holds, the slice query is bounded-polled
 * to re-read the tiers; once the fold flips the tier to ready it returns false and
 * the poll stops. Mirrors `isBuildingReason` on the chrome side.
 */
function graphSliceHasBuildingTier(data: GraphSlice | undefined): boolean {
  const tiers = data?.tiers;
  if (!tiers) return false;
  return CANONICAL_TIERS.some((tier) => {
    const state = tiers[tier];
    return (
      state?.available === false &&
      typeof state.reason === "string" &&
      state.reason.toLowerCase().includes("building")
    );
  });
}

export function useGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
  lens?: unknown,
  focus?: unknown,
  corpus?: unknown,
) {
  const request = normalizeGraphSliceRequestIdentity(
    scope,
    filter,
    asOf,
    granularity,
    lens,
    focus,
    corpus,
  );
  const isCode = request.corpus === "code";
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.graph(
      request.scope ?? "",
      request.filter,
      request.asOf,
      request.granularity,
      request.lens,
      request.focus,
      request.corpus,
    ),
    queryFn: () =>
      // The code corpus is a DISCONNECTED dataset (ADR D1/D5): it carries no vault
      // Filter grammar, no salience lens, and no as_of (present view only) — the
      // engine rejects those on the code corpus as typed errors. The ONE shared
      // facet is the timeline `date_range` (code-timeline-range ADR), always sent
      // with its pinned `modified` criterion — the only date a code file carries.
      isCode
        ? engineClient.graphQuery({
            scope: request.scope!,
            granularity: request.granularity,
            corpus: "code",
            ...(request.filter.date_range
              ? {
                  filter: {
                    date_range: request.filter.date_range,
                    date_field: "modified" as const,
                  },
                }
              : {}),
          })
        : engineClient.graphQuery({
            scope: request.scope!,
            filter: request.filter,
            as_of: request.asOf,
            granularity: request.granularity,
            lens: request.lens,
            focus: request.focus,
          }),
    enabled,
    // Tier-1 filter changes (graph-filter-fetch-split ADR D1): hold the prior bounded
    // slice while the newly-filtered one loads, so a filter change never blanks and a
    // previously-seen filter resolves instantly from cache. The scene's warm-start
    // (object constancy by id) animates the transition rather than re-exploding.
    placeholderData: keepPreviousData,
    // Held-slice tiers lag (Issue #4A): the tiers block is a per-fetch snapshot and a
    // declared fold's completion splices its edges via the no-refetch delta path, so a
    // "still building" tier would otherwise leave the "Still loading links…" banner
    // stuck until an unrelated refetch. Poll on a bounded interval ONLY while a held
    // tier reads building; the moment the fold flips it to ready the predicate returns
    // false and the poll stops (bounded-by-default-for-every-accumulator).
    refetchInterval: (query) =>
      graphSliceHasBuildingTier(query.state.data as GraphSlice | undefined)
        ? GRAPH_BUILDING_REFETCH_MS
        : false,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * Constellation-first progressive graph slice (on-demand-cold-start ADR D1).
 * A LIVE document-granularity request whose slice is COLD (no held or
 * placeholder data — the 1.9MB-class read is still in flight) serves the
 * same-identity feature-LOD constellation as the held slice instead: 16x
 * smaller, and a cache SHARE with the nav toolbar's descent (same query key),
 * so a re-ascend or prior visit paints instantly. `isPending` is masked false
 * while the fill shows, which makes the availability derivation report
 * `refreshing` — the canvas renders the real constellation plus the
 * non-blocking refresh banner, never a blank skeleton for MBs. Passthrough
 * (zero extra query) for: feature-granularity requests, time-travel (`asOf`
 * reads one historical snapshot), and any slice with held data.
 */
export function useProgressiveGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
  lens?: unknown,
  focus?: unknown,
  corpus?: unknown,
) {
  const requested = useGraphSlice(
    scope,
    filter,
    asOf,
    granularity,
    lens,
    focus,
    corpus,
  );
  const wantsFill =
    normalizeDashboardGraphGranularity(granularity) === "document" &&
    normalizeGraphSliceAsOf(asOf) === undefined;
  // Cold = the requested slice holds nothing (not even keepPreviousData).
  const cold = wantsFill && requested.data === undefined;
  const constellation = useGraphSlice(
    cold ? scope : null,
    filter,
    undefined,
    "feature",
    lens,
    focus,
    corpus,
  );
  const fillData = cold ? constellation.data : undefined;
  return useMemo(() => {
    if (fillData === undefined) return requested;
    return { ...requested, data: fillData, isPending: false };
  }, [requested, fillData]);
}

/**
 * The active-lens graph slice (graph-node-salience): reads lens + focus from
 * canonical dashboard state and parameterizes the graph query by them, so a lens
 * switch or focus change is a re-query keyed on (lens, focus).
 */
export function useSalienceGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
) {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const dashboardState = useDashboardState(normalizedScope);
  const state = dashboardState.data;
  return useGraphSlice(
    state ? normalizedScope : null,
    filter,
    asOf,
    granularity,
    state?.salience_lens,
    state?.salience_focus ?? null,
    // The active corpus (codebase-graphing ADR D7): read from canonical
    // dashboard state so a corpus switch is a re-query keyed on (…, corpus).
    state?.corpus,
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
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
): SalienceSliceView {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const dashboardState = useDashboardState(normalizedScope);
  const lens = dashboardState.data?.salience_lens ?? DEFAULT_SALIENCE_LENS;
  const slice = useSalienceGraphSlice(normalizedScope, filter, asOf, granularity);
  // isFetching covers a focus-change/lens-switch re-query while held data is
  // shown; isPending is the initial fetch. Either is a loading state for the
  // scene on a focus change.
  const loading =
    normalizedScope !== null &&
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

export interface GraphEmbeddingsRequestIdentity {
  scope: string | null;
  lens: SalienceLens;
  focus: string | null;
}

export const normalizeGraphEmbeddingsScope = normalizeGraphSliceScope;

export function normalizeGraphEmbeddingsRequestIdentity(
  scope: unknown,
  lens: unknown,
  focus: unknown,
): GraphEmbeddingsRequestIdentity {
  return {
    scope: normalizeGraphEmbeddingsScope(scope),
    lens: normalizeDashboardSalienceLens(lens),
    focus: normalizeNodeId(focus),
  };
}

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
  const availability = readTierAvailability(tiers, [SEMANTIC_TIER]);
  const semantic = tiers?.[SEMANTIC_TIER];
  // Held is read from the tiers block ALONE: an explicit available:false OR an
  // absent semantic tier in a served block marks the tier down. A tiers-less
  // transport fault and an empty array are NOT held.
  const unavailable = tiers !== undefined && availability.degraded;
  // The tier is affirmatively up only when the block reports it available:true.
  // A tiers-less transport fault and a degraded served block cannot satisfy the
  // positive availability gate.
  const tierUp =
    tiers !== undefined && !availability.degraded && semantic?.available === true;
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
  scope: unknown,
  enabled: boolean,
  lens?: unknown,
  focus?: unknown,
): SemanticEmbeddingsView {
  const request = normalizeGraphEmbeddingsRequestIdentity(scope, lens, focus);
  const active = request.scope !== null && enabled;
  const query = useQuery({
    queryKey: engineKeys.graphEmbeddings(
      request.scope ?? "",
      request.lens,
      request.focus,
    ),
    queryFn: () =>
      engineClient.graphEmbeddings({
        scope: request.scope!,
        lens: request.lens,
        focus: request.focus,
      }),
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
  /** A re-query is in flight WHILE a previous slice is held on screen
   *  (`keepPreviousData`): the canvas renders this as a non-blocking corner
   *  refresh banner, never a blanking loading card (universal-data-loading
   *  ADR D2). */
  refreshing: boolean;
}

type GraphSliceAvailabilitySource = Pick<
  UseQueryResult<GraphSlice>,
  "data" | "error" | "isPending" | "isFetching"
>;

export function deriveGraphSliceAvailability(
  tiers: TiersBlock | undefined,
  loading: boolean,
  refreshing = false,
): GraphSliceAvailability {
  return { loading, refreshing, ...readTierAvailability(tiers, CANONICAL_TIERS) };
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
    // Refreshing = a re-query behind a HELD slice (fetching, not the initial
    // pending, data present) — the keepPreviousData window the canvas must
    // signal without blanking (universal-data-loading ADR D2).
    active &&
      Boolean(slice?.isFetching) &&
      !slice?.isPending &&
      slice?.data !== undefined,
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
export interface NodeScopedRequestIdentity {
  scope: string | null;
  nodeId: string | null;
  depth: number;
}

export const normalizeNodeScopedScope = normalizeGraphSliceScope;

export function normalizeNodeNeighborDepth(depth: unknown): number {
  return typeof depth === "number" && Number.isFinite(depth) && depth > 0
    ? Math.trunc(depth)
    : 1;
}

export function normalizeNodeScopedRequestIdentity(
  scope: unknown,
  nodeId: unknown,
  depth: unknown = 1,
): NodeScopedRequestIdentity {
  return {
    scope: normalizeNodeScopedScope(scope),
    nodeId: normalizeNodeId(nodeId),
    depth: normalizeNodeNeighborDepth(depth),
  };
}

export function isAddressableNode(id: unknown): id is string {
  const nodeId = normalizeNodeId(id);
  return nodeId !== null && featureTagFromNodeId(nodeId) === null;
}

export function useNodeDetail(id: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.node(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.node(request.nodeId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
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
export function useNodeDetailView(id: unknown, scope: unknown): NodeDetailView {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useNodeDetail(request.nodeId, request.scope);
  return deriveNodeDetailView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

/**
 * Resolve a node's IDENTITY from the IN-MEMORY active stage graph slice — the
 * slice the Stage already holds — instead of the `/nodes/{id}` detail family.
 * Constellation FEATURE nodes (id `feature:<tag>`) are synthesized aggregates the
 * detail route 404s (see `isAddressableNode`), so `useNodeDetailView` returns a
 * null node for them; their identity (id, kind, title, member_count) nonetheless
 * already rides the graph slice. This selector reconstructs the SAME cached slice
 * query the Stage issues (a cache hit — never a new fetch; TanStack dedupes on the
 * shared key) and finds the node by id, so consumers like the hover card can show
 * a feature node's identity without a doc-detail round-trip. Returns the raw slice
 * node reference (stable between fetches) memoized on (nodeId, slice.data) per
 * stable-selectors. Addressable doc nodes also resolve here, but their richer
 * detail/evidence is sourced from the detail route by the caller.
 */
export function useGraphNodeFromActiveSlice(
  id: unknown,
  scope: unknown,
): EngineNode | null {
  const nodeId = normalizeNodeId(id);
  const { graphQuery } = useDashboardStageSceneView(scope);
  const slice = useGraphSlice(
    graphQuery?.scope ?? null,
    graphQuery?.filter,
    graphQuery?.asOf,
    graphQuery?.granularity,
    graphQuery?.lens,
    graphQuery?.focus,
  );
  const nodes = slice.data?.nodes;
  return useMemo(() => {
    if (nodeId === null || !nodes) return null;
    return nodes.find((n) => n.id === nodeId) ?? null;
  }, [nodeId, nodes]);
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

export function useNodeNeighbors(id: unknown, scope: unknown, depth: unknown = 1) {
  const request = normalizeNodeScopedRequestIdentity(scope, id, depth);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.neighbors(
      request.scope ?? "",
      request.nodeId ?? "",
      request.depth,
    ),
    queryFn: () =>
      engineClient.nodeNeighbors(request.nodeId!, {
        scope: request.scope!,
        depth: request.depth,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

// The edge-tier bucketing order for the inspector's neighbor list. The engine
// never mints a semantic graph edge (ADR D3.5), so semantic is not an edge tier.
export const INSPECTOR_EDGE_TIER_ORDER = [
  "declared",
  "structural",
  "temporal",
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
export function useNodeContent(nodeId: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, nodeId);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.content(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.content(request.nodeId!, request.scope ?? undefined),
    enabled,
    gcTime: CONTENT_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
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
  /** The path-derived highlighter grammar hint; null when none applies. */
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
export function useContentView(nodeId: unknown, scope: unknown): ContentView {
  const request = normalizeNodeScopedRequestIdentity(scope, nodeId);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useNodeContent(nodeId, scope);
  const loading = enabled && query.isPending;
  // Memoize the derived view so it is referentially STABLE across renders where the
  // query state is unchanged. deriveContentView returns a fresh object each call; a
  // fresh ContentView every render churns every consumer that derives further state
  // from it (the markdown editor's frontmatter properties) and feeds the
  // getSnapshot/effect-dependency loops the stable-selector discipline prevents.
  return useMemo(
    () => deriveContentView(query.data, query.error ?? null, loading),
    [query.data, query.error, loading],
  );
}

export type ViewerStateTone = "faint" | "muted" | "broken";

export interface CodeViewerView {
  /** The designed surface state the code viewer renders. */
  state: "loading" | "errored" | "degraded" | "empty" | "ready";
  /** Placeholder copy for non-ready states. */
  stateMessage: string | null;
  /** Placeholder tone for non-ready states. */
  stateTone: ViewerStateTone;
  /** Placeholder ink class for non-ready states. */
  stateToneClass: string;
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
  /** Header affordance label for the display-only code viewer. */
  readOnlyLabel: string;
  /** Render-ready byte-cap receipt, null when the content is not truncated. */
  truncationMessage: string | null;
}

function codeViewerTruncationMessage(
  truncated: ContentTruncated | null,
): string | null {
  if (truncated === null) return null;
  return `Truncated to the first ${truncated.returned_bytes.toLocaleString("en-US")} of ${truncated.total_bytes.toLocaleString("en-US")} bytes — open the file directly for the full contents.`;
}

function viewerStateToneClass(tone: ViewerStateTone): string {
  if (tone === "broken") return "text-state-broken";
  if (tone === "muted") return "text-ink-muted";
  return "text-ink-faint";
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
    readOnlyLabel: "read-only",
    truncationMessage: null,
  };
  if (content.loading) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading file...",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.errored) {
    const stateTone: ViewerStateTone = "broken";
    return {
      ...base,
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "degraded",
      stateMessage: `File unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (!content.available || content.text.length === 0) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "empty",
      stateMessage: "This file is empty.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }

  const text = content.text;
  const stateTone: ViewerStateTone = "faint";
  return {
    state: "ready",
    stateMessage: null,
    stateTone,
    stateToneClass: viewerStateToneClass(stateTone),
    text,
    rawLines: text.replace(/\n$/, "").split("\n"),
    path: content.path,
    languageHint: content.languageHint,
    truncated: content.truncated,
    readOnlyLabel: "read-only",
    truncationMessage: codeViewerTruncationMessage(content.truncated),
  };
}

type MarkdownHeaderCategory = "adr" | "audit" | "exec" | "plan" | "research";

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
};

function markdownHeaderDocType(path: string | undefined, stem: string): string | null {
  if (path) {
    const match = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
    if (match) return match[1] ?? null;
  }
  const suffix = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
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
  /** Placeholder ink class for non-ready states. */
  stateToneClass: string;
  /** Structured frontmatter chrome, null when the document has no visible metadata. */
  frontmatter: FrontmatterHeaderView | null;
  /** Reader meta status from frontmatter, if present. */
  status: string | null;
  /** Markdown body with the leading frontmatter fence removed. */
  body: string;
  /** Editorial header/footer projection rendered by the reader app chrome. */
  editorial: MarkdownReaderEditorialView;
  /** Honest byte-cap marker shown only with ready content. */
  truncated: ContentTruncated | null;
  /** Render-ready byte-cap receipt, null when the content is not truncated. */
  truncationMessage: string | null;
}

export type FrontmatterTagCategory =
  | "adr"
  | "audit"
  | "exec"
  | "feature"
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

export interface MarkdownReaderEyebrowView {
  label: string;
  category: FrontmatterTagCategory;
}

export interface MarkdownReaderEditorialView {
  title: string | null;
  dek: string | null;
  body: string;
  eyebrow: MarkdownReaderEyebrowView | null;
  meta: string[];
  footerTags: FrontmatterTagView[];
  related: FrontmatterRelatedView[];
}

const DOCTYPE_EYEBROW: Partial<Record<FrontmatterTagCategory, string>> = {
  adr: "Decision",
  audit: "Audit",
  exec: "Step",
  plan: "Plan",
  research: "Research",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FRONTMATTER_TAG_CATEGORIES = new Set<FrontmatterTagCategory>([
  "adr",
  "audit",
  "exec",
  "feature",
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

function markdownReaderEyebrow(
  frontmatter: FrontmatterHeaderView | null,
): MarkdownReaderEyebrowView | null {
  if (!frontmatter) return null;
  for (const tag of frontmatter.tags) {
    const label = tag.category ? DOCTYPE_EYEBROW[tag.category] : undefined;
    if (tag.category && label) return { label, category: tag.category };
  }
  return null;
}

function markdownReaderFooterTags(
  frontmatter: FrontmatterHeaderView | null,
): FrontmatterTagView[] {
  return (
    frontmatter?.tags.filter(
      (tag) => !(tag.category && DOCTYPE_EYEBROW[tag.category]),
    ) ?? []
  );
}

function formatReaderLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function markdownReaderReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function splitMarkdownReaderEditorialBody(body: string): {
  title: string | null;
  dek: string | null;
  rest: string;
} {
  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  let title: string | null = null;
  const heading = /^#\s+(.+?)\s*$/.exec(lines[index] ?? "");
  if (heading) {
    // Reduce the H1 to a clean editorial title: markdown stripped, the
    // `{feature} {doctype}:` template prefix and `| (status: …)` metadata removed
    // (both surface elsewhere — the eyebrow and the meta line), capitalized.
    title = deriveEditorialTitle(heading[1]);
    index += 1;
  }
  while (index < lines.length && lines[index].trim() === "") index += 1;
  let dek: string | null = null;
  const next = lines[index]?.trim() ?? "";
  const isProse = next !== "" && !/^(#{1,6}\s|[-*>|]|\d+\.\s|```)/.test(next);
  if (title && isProse) {
    const dekLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== "") {
      dekLines.push(lines[index].trim());
      index += 1;
    }
    // The dek is also rendered as a raw string (italic chrome), so strip any
    // inline markdown from it for the same no-noise plain-text guarantee.
    dek = sanitizeHeadingText(dekLines.join(" "));
  }
  return { title, dek, rest: lines.slice(index).join("\n").replace(/^\n+/, "") };
}

function markdownReaderTruncationMessage(
  truncated: ContentTruncated | null,
): string | null {
  if (truncated === null) return null;
  return `Truncated to the first ${truncated.returned_bytes.toLocaleString("en-US")} of ${truncated.total_bytes.toLocaleString("en-US")} bytes — open the file directly for the full document.`;
}

function deriveMarkdownReaderEditorialView(
  body: string,
  frontmatter: FrontmatterHeaderView | null,
  status: string | null,
): MarkdownReaderEditorialView {
  const split = splitMarkdownReaderEditorialBody(body);
  const date = formatReaderLongDate(
    frontmatter?.dates.find((entry) => entry.label === "created")?.value,
  );
  const meta = [
    date,
    `${markdownReaderReadingMinutes(split.rest)} min read`,
    status,
  ].filter((part): part is string => Boolean(part));
  return {
    title: split.title,
    dek: split.dek,
    body: split.rest,
    eyebrow: markdownReaderEyebrow(frontmatter),
    meta,
    footerTags: markdownReaderFooterTags(frontmatter),
    related: frontmatter?.related ?? [],
  };
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
    editorial: deriveMarkdownReaderEditorialView("", null, null),
    truncated: null,
    truncationMessage: null,
  };
  if (content.loading) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading document…",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.errored) {
    const stateTone: ViewerStateTone = "broken";
    return {
      ...base,
      state: "errored",
      stateMessage: "The document could not be loaded.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "degraded",
      stateMessage: `Document unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (!content.available || content.text.length === 0) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  const parsed = parseDocument(content.text);
  const frontmatter = deriveFrontmatterHeaderView(parsed.frontmatter);
  const status = parsed.frontmatter?.status ?? null;
  const stateTone: ViewerStateTone = "faint";
  // Read-mode sanitization (no-noise editorial directive): strip HTML comments and
  // reduce every heading to plain text before the reader renders the body.
  const readerBody = sanitizeReaderBody(parsed.body);
  return {
    state: "ready",
    stateMessage: null,
    stateTone,
    stateToneClass: viewerStateToneClass(stateTone),
    frontmatter,
    status,
    body: readerBody,
    editorial: deriveMarkdownReaderEditorialView(readerBody, frontmatter, status),
    truncated: content.truncated,
    truncationMessage: markdownReaderTruncationMessage(content.truncated),
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

/** The rail's bounded local paging ceiling mirrors the engine's history clamp. */
export const MAX_HISTORY_LIMIT = 200;

/** How long an unobserved history entry survives before garbage collection
 *  (bounded-by-default-for-every-accumulator). 60s matches the content query's
 *  prompt eviction — generous for tab back-and-forth while keeping a long session
 *  from retaining every scope's commit list. */
const HISTORY_GC_TIME = 60_000;

export function normalizeHistoryLimit(limit: unknown): number {
  const candidate =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.floor(limit)
      : DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, candidate));
}

export interface HistoryRequestIdentity {
  scope: string | null;
  limit: number;
}

export function normalizeHistoryRequestIdentity(
  scope: unknown,
  limit: unknown = DEFAULT_HISTORY_LIMIT,
): HistoryRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    limit: normalizeHistoryLimit(limit),
  };
}

/**
 * The read-only recent-commit history fetch for one scope (status-overview ADR),
 * the SOLE wire client of `/history`. Keyed by (scope, limit); disabled when no
 * scope is resolved yet. Bounded: an explicit `gcTime` evicts the entry soon
 * after the tab is left, so a long session does not retain every scope's list.
 */
export function useNodeHistory(scope: unknown, limit: unknown = DEFAULT_HISTORY_LIMIT) {
  const request = normalizeHistoryRequestIdentity(scope, limit);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.history(request.scope ?? "", request.limit),
    queryFn: () =>
      engineClient.history({ scope: request.scope!, limit: request.limit }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
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
  /** True when the current bounded history window can request the next page. */
  canShowMore: boolean;
  /** True iff the engine answered with history (vs loading/degraded/errored). */
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  unavailableLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  showMoreLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listRootClassName: string;
  listClassName: string;
  commitBodyClassName: string;
  showMoreButtonClassName: string;
}

export interface RecentCommitRow {
  commit: HistoryCommit;
  /** Commit node id, used for event selection metadata. */
  eventId: string;
  /** Graph nodes the row can select; excludes the commit node itself. */
  touchedNodeIds: string[];
  /** Whether activating the row has a graph selection target. */
  selectable: boolean;
  /** Whether the row has an expandable commit message body. */
  hasBody: boolean;
  /** Commit subject with the empty-subject fallback already applied. */
  subjectLabel: string;
  /** Accessible label for activating the row selection. */
  rowAriaLabel: string;
  /** Accessible label for expanding/collapsing the full message body. */
  messageToggleLabel: (expanded: boolean) => string;
  /** Compact age label for the status rail; derived with the row projection. */
  ageLabel: string;
}

// The commit read is resolved by the engine's STRUCTURAL read of the worktree's
// git object DB, so the `structural` tier gates history availability (contract §2,
// status-overview ADR: a scope with no readable git history degrades structural).
const HISTORY_TIERS = ["structural"] as const;
const HISTORY_COMMIT_NODE_IDS_CAP = 256;

function normalizeHistoryCommitText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHistoryCommitBody(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeHistoryCommitTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeHistoryCommitForView(commit: unknown): HistoryCommit | null {
  if (commit === null || typeof commit !== "object") return null;
  const record = commit as Partial<Record<keyof HistoryCommit, unknown>>;
  const hash = normalizeHistoryCommitText(record.hash);
  if (hash.length === 0) return null;
  const shortHash = normalizeHistoryCommitText(record.short_hash) || hash.slice(0, 8);
  return {
    hash,
    short_hash: shortHash,
    subject: normalizeHistoryCommitText(record.subject),
    body: normalizeHistoryCommitBody(record.body),
    ts: normalizeHistoryCommitTimestamp(record.ts),
    node_ids: Array.isArray(record.node_ids)
      ? normalizeNodeIds(record.node_ids, HISTORY_COMMIT_NODE_IDS_CAP)
      : [],
  };
}

export function normalizeHistoryCommitsForView(commits: unknown): HistoryCommit[] {
  if (!Array.isArray(commits)) return [];
  return commits
    .map(normalizeHistoryCommitForView)
    .filter((commit): commit is HistoryCommit => commit !== null);
}

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
  limit = DEFAULT_HISTORY_LIMIT,
): HistoryView {
  const renderLimit = normalizeHistoryLimit(limit);
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, HISTORY_TIERS);
  const errored =
    error instanceof EngineError ? error.tiers === undefined : error != null;
  const available =
    !loading && !errored && !availability.degraded && data !== undefined;
  const commits =
    loading || availability.degraded || errored
      ? []
      : normalizeHistoryCommitsForView(data?.commits);
  const recentCommitRows = commits
    .slice(0, renderLimit)
    .map((commit): RecentCommitRow => {
      const touchedNodeIds = commit.node_ids.filter((id) => !id.startsWith("commit:"));
      const subjectLabel = commit.subject || "(no subject)";
      return {
        commit,
        eventId: `commit:${commit.hash}`,
        touchedNodeIds,
        selectable: touchedNodeIds.length > 0,
        hasBody: commit.body.trim().length > 0,
        subjectLabel,
        rowAriaLabel: `commit ${commit.short_hash}: ${subjectLabel}`,
        messageToggleLabel: (expanded) =>
          `${expanded ? "collapse" : "expand"} message for ${commit.short_hash}`,
        ageLabel: recentCommitAgeLabel(commit.ts, now),
      };
    });
  const canShowMore = commits.length >= renderLimit && renderLimit < MAX_HISTORY_LIMIT;
  const showLoading = loading;
  const showUnavailable = !showLoading && (availability.degraded || errored);
  const showEmpty = available && recentCommitRows.length === 0;
  const showList = available && recentCommitRows.length > 0;
  return {
    ...availability,
    loading,
    errored,
    commits,
    recentCommitRows,
    canShowMore,
    available,
    showLoading,
    showUnavailable,
    showEmpty,
    showList,
    unavailableLabel: "recent history unavailable",
    loadingLabel: "reading recent commits...",
    emptyLabel: "no commits yet on this branch.",
    showMoreLabel: "Show more",
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: "text-label text-ink-muted",
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listRootClassName: STATUS_BODY_LIST_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
    commitBodyClassName:
      "ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted",
    showMoreButtonClassName:
      "w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  };
}

/**
 * Stores hook: the interpreted recent-history view for a scope, read through the
 * history query so the Status overview rail consumes interpreted state (loading /
 * degraded / errored / commits) instead of fetching itself or reading the raw
 * `tiers` block.
 */
export function useHistoryView(
  scope: unknown,
  limit: unknown = DEFAULT_HISTORY_LIMIT,
): HistoryView {
  const request = normalizeHistoryRequestIdentity(scope, limit);
  const query = useNodeHistory(request.scope, request.limit);
  const loading = request.scope !== null && query.isPending;
  return deriveHistoryView(
    query.data,
    query.error ?? null,
    loading,
    Date.now(),
    request.limit,
  );
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
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  /** The capability-local reason when unavailable (gh missing/offline/unauthed). */
  reason: string | null;
  prs: PullRequest[];
  rows: PullRequestRowView[];
  loadingLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listClassName: string;
}

export interface IssuesView {
  loading: boolean;
  errored: boolean;
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  reason: string | null;
  issues: Issue[];
  rows: IssueRowView[];
  loadingLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listClassName: string;
}

export interface PullRequestRowView {
  pr: PullRequest;
  icon: "pull-request" | "merged";
  iconTone: "accent" | "muted" | "faint";
  iconToneClass: string;
  numberLabel: string;
  titleLabel: string;
  stateLabel: string;
  stateTone: "accent" | "neutral";
  authorLabel: string | null;
  checksLabel: string | null;
  checksTone: "active" | "broken" | "faint" | null;
  checksToneClass: string | null;
  mergedLabel: string | null;
}

export interface IssueRowView {
  issue: Issue;
  numberLabel: string;
  titleLabel: string;
  authorLabel: string | null;
  labels: string[];
}

function pullRequestLoadingLabel(state: "open" | "merged"): string {
  return state === "merged" ? "reading recent PRs..." : "reading open PRs...";
}

function pullRequestEmptyLabel(state: "open" | "merged"): string {
  return state === "merged"
    ? "no recently-merged pull requests"
    : "no open pull requests";
}

function pullRequestUnavailableLabel(reason: string | null): string {
  return reason ?? "pull requests unavailable - GitHub not reachable";
}

function issueUnavailableLabel(reason: string | null): string {
  return reason ?? "issues unavailable - GitHub not reachable";
}

const STATUS_BODY_LOADING_CLASS =
  "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none";
const STATUS_BODY_UNAVAILABLE_CLASS = "text-label text-ink-faint";
const STATUS_BODY_EMPTY_CLASS = "text-label text-ink-faint";
// Card-to-card gap inside the status sections (PRs / issues / commits): the rail's
// items are bordered cards now (binding 599:2099), so they read with a 0.375rem gutter.
const STATUS_BODY_LIST_CLASS = "space-y-fg-1-5";

interface GitHubWorkItemAvailability<T> {
  loading: boolean;
  errored: boolean;
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  reason: string | null;
  items: T[];
}

function deriveGitHubWorkItemAvailability<T>(
  data:
    | {
        available: boolean;
        reason: string | null;
      }
    | undefined,
  items: T[] | undefined,
  error: unknown,
  loading: boolean,
): GitHubWorkItemAvailability<T> {
  const errored = error != null;
  const available = !loading && !errored && data?.available === true;
  const visibleItems = available ? (items ?? []) : [];
  const showLoading = loading;
  const showUnavailable = !showLoading && !available;
  const showEmpty = available && visibleItems.length === 0;
  const showList = available && visibleItems.length > 0;
  return {
    loading,
    errored,
    available,
    showLoading,
    showUnavailable,
    showEmpty,
    showList,
    reason: data?.reason ?? null,
    items: visibleItems,
  };
}

function pullRequestIconToneClass(tone: PullRequestRowView["iconTone"]): string {
  if (tone === "muted") return "text-ink-muted";
  if (tone === "faint") return "text-ink-faint";
  return "text-accent";
}

function pullRequestChecksToneClass(
  tone: NonNullable<PullRequestRowView["checksTone"]>,
): string {
  if (tone === "active") return "text-state-active";
  if (tone === "broken") return "text-state-broken";
  return "text-ink-faint";
}

export function derivePullRequestRowView(
  pr: PullRequest,
  state: "open" | "merged",
): PullRequestRowView {
  const merged = state === "merged";
  const failing = pr.checks?.failing ?? 0;
  const passed = pr.checks?.passed ?? 0;
  const total = pr.checks?.total ?? 0;
  const checksOk = total > 0 && failing === 0 && passed === total;
  const checksLabel =
    total === 0
      ? null
      : checksOk
        ? "checks"
        : failing > 0
          ? `${failing} failing`
          : "checks pending";
  const iconTone: PullRequestRowView["iconTone"] = merged
    ? "muted"
    : pr.is_draft
      ? "faint"
      : "accent";
  const checksTone: PullRequestRowView["checksTone"] =
    total === 0 ? null : checksOk ? "active" : failing > 0 ? "broken" : "faint";
  return {
    pr,
    icon: merged ? "merged" : "pull-request",
    iconTone,
    iconToneClass: pullRequestIconToneClass(iconTone),
    numberLabel: `#${pr.number}`,
    titleLabel: pr.title,
    stateLabel: merged ? "merged" : pr.is_draft ? "draft" : "open",
    stateTone: merged || pr.is_draft ? "neutral" : "accent",
    authorLabel: pr.author || null,
    checksLabel,
    checksTone,
    checksToneClass:
      checksTone === null ? null : pullRequestChecksToneClass(checksTone),
    mergedLabel: merged && pr.merged_at ? "merged" : null,
  };
}

export function deriveIssueRowView(issue: Issue): IssueRowView {
  return {
    issue,
    numberLabel: `#${issue.number}`,
    titleLabel: issue.title,
    authorLabel: issue.author || null,
    labels: issue.labels.slice(0, 3),
  };
}

export function derivePRsView(
  data: PRsResponse | undefined,
  error: unknown,
  loading: boolean,
  state: "open" | "merged" = "open",
): PRsView {
  const { items: prs, ...availability } = deriveGitHubWorkItemAvailability(
    data,
    data?.prs,
    error,
    loading,
  );
  return {
    ...availability,
    prs,
    rows: prs.map((pr) => derivePullRequestRowView(pr, state)),
    loadingLabel: pullRequestLoadingLabel(state),
    emptyLabel: pullRequestEmptyLabel(state),
    unavailableLabel: pullRequestUnavailableLabel(data?.reason ?? null),
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: STATUS_BODY_UNAVAILABLE_CLASS,
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
  };
}

export function deriveIssuesView(
  data: IssuesResponse | undefined,
  error: unknown,
  loading: boolean,
): IssuesView {
  const { items: issues, ...availability } = deriveGitHubWorkItemAvailability(
    data,
    data?.issues,
    error,
    loading,
  );
  return {
    ...availability,
    issues,
    rows: issues.map(deriveIssueRowView),
    loadingLabel: "reading open issues...",
    emptyLabel: "no open issues",
    unavailableLabel: issueUnavailableLabel(data?.reason ?? null),
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: STATUS_BODY_UNAVAILABLE_CLASS,
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
  };
}

export interface PullRequestsRequestIdentity {
  scope: string | null;
  state: "open" | "merged";
}

export interface IssuesRequestIdentity {
  scope: string | null;
  state: "open" | "closed";
}

export function normalizePullRequestsRequestIdentity(
  scope: unknown,
  state: unknown = "open",
): PullRequestsRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    state: state === "merged" ? "merged" : "open",
  };
}

export function normalizeIssuesRequestIdentity(
  scope: unknown,
  state: unknown = "open",
): IssuesRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    state: state === "closed" ? "closed" : "open",
  };
}

function useNodePrs(scope: unknown, state: unknown) {
  const request = normalizePullRequestsRequestIdentity(scope, state);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.prs(request.scope ?? "", request.state),
    queryFn: () => engineClient.prs({ scope: request.scope!, state: request.state }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

function useNodeIssues(scope: unknown, state: unknown) {
  const request = normalizeIssuesRequestIdentity(scope, state);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.issues(request.scope ?? "", request.state),
    queryFn: () => engineClient.issues({ scope: request.scope!, state: request.state }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** Interpreted pull-request view for the rail's OPEN PRS / RECENT PRS sections.
 *  `state` selects open (default) or recently-merged PRs. */
export function usePRsView(scope: unknown, state: unknown = "open"): PRsView {
  const request = normalizePullRequestsRequestIdentity(scope, state);
  const query = useNodePrs(request.scope, request.state);
  const loading = request.scope !== null && query.isPending;
  return derivePRsView(query.data, query.error ?? null, loading, request.state);
}

/** Interpreted issue view for the rail's OPEN ISSUES section. */
export function useIssuesView(scope: unknown, state: unknown = "open"): IssuesView {
  const request = normalizeIssuesRequestIdentity(scope, state);
  const query = useNodeIssues(request.scope, request.state);
  const loading = request.scope !== null && query.isPending;
  return deriveIssuesView(query.data, query.error ?? null, loading);
}

export type StatusTabSectionId =
  | "open-plans"
  | "open-prs"
  | "open-issues"
  | "recent-prs"
  | "recent-commits";

export interface StatusSectionCardView {
  id: StatusTabSectionId;
  title: string;
  count?: number;
}

export interface StatusTabSectionsView {
  openPlans: StatusSectionCardView;
  openPrs: StatusSectionCardView;
  openIssues: StatusSectionCardView;
  recentPrs: StatusSectionCardView;
  recentCommits: StatusSectionCardView;
}

function positiveStatusCount(count: number): number | undefined {
  return count > 0 ? count : undefined;
}

export function deriveStatusTabSectionsView(counts: {
  openPlans: number;
  openPrs: number;
  openIssues: number;
}): StatusTabSectionsView {
  return {
    openPlans: {
      id: "open-plans",
      title: "Open plans",
      count: positiveStatusCount(counts.openPlans),
    },
    openPrs: {
      id: "open-prs",
      title: "Open PRs",
      count: positiveStatusCount(counts.openPrs),
    },
    openIssues: {
      id: "open-issues",
      title: "Open issues",
      count: positiveStatusCount(counts.openIssues),
    },
    recentPrs: { id: "recent-prs", title: "Recent PRs" },
    recentCommits: { id: "recent-commits", title: "Recent commits" },
  };
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
  ids: readonly unknown[],
  scope: unknown,
  depth: unknown = 1,
) {
  const normalizedScope = normalizeNodeScopedScope(scope);
  const normalizedDepth = normalizeNodeNeighborDepth(depth);
  // Bound the fan-out; the most-recently-added ids (working-set tail) win when
  // the set exceeds the cap, since those are the user's latest expansions.
  const bounded =
    ids.length > MAX_BULK_NEIGHBOR_IDS ? ids.slice(-MAX_BULK_NEIGHBOR_IDS) : ids;
  const queries = bounded.map((id) => {
    const nodeId = normalizeNodeId(id);
    const enabled = normalizedScope !== null && isAddressableNode(nodeId);
    return {
      queryKey: engineKeys.neighbors(
        normalizedScope ?? "",
        nodeId ?? "",
        normalizedDepth,
      ),
      queryFn: () =>
        engineClient.nodeNeighbors(nodeId!, {
          scope: normalizedScope!,
          depth: normalizedDepth,
        }),
      // Skip synthesized feature aggregates — the engine has no ego network for a
      // `feature:<tag>` id (it 404s); expanding one is a no-op, not a degraded
      // request. Real nodes (doc:, …) expand as before.
      enabled,
    };
  });
  const results = useQueries({ queries });
  return results.map((result, index) =>
    queries[index]?.enabled ? result : { ...result, data: undefined },
  );
}

export function useNodeEvidence(id: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.evidence(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.nodeEvidence(request.nodeId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export function useEngineEvents(scope: unknown, range: unknown = {}, bucket?: unknown) {
  const request = normalizeEngineEventsRequestIdentity(scope, range, bucket);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.events(request.scope ?? "", request.range, request.bucket),
    queryFn: () =>
      engineClient.events({
        scope: request.scope!,
        ...request.range,
        bucket: request.bucket,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export interface EngineEventsRequestIdentity {
  scope: string | null;
  range: { from?: string; to?: string };
  bucket: string | undefined;
}

export interface TimelineLineageRequestIdentity {
  scope: string | null;
  range: { from?: string; to?: string };
  filter: string | undefined;
  asOf: string | number | undefined;
}

export interface GraphDiffRequestIdentity {
  scope: string | null;
  from: string | number | null;
  to: string | number | null;
  filter: string | undefined;
}

function normalizeTemporalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTemporalRange(range: unknown): { from?: string; to?: string } {
  const source =
    range !== null && typeof range === "object" && !Array.isArray(range)
      ? (range as Record<string, unknown>)
      : {};
  return {
    from: normalizeTemporalText(source.from),
    to: normalizeTemporalText(source.to),
  };
}

function normalizeTemporalPoint(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return normalizeTemporalText(value) ?? null;
}

export function normalizeEngineEventsRequestIdentity(
  scope: unknown,
  range: unknown = {},
  bucket?: unknown,
): EngineEventsRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    range: normalizeTemporalRange(range),
    bucket: normalizeTemporalText(bucket),
  };
}

export function normalizeTimelineLineageRequestIdentity(
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
): TimelineLineageRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    range: normalizeTemporalRange(range),
    filter: normalizeTemporalText(filter),
    asOf: normalizeGraphSliceAsOf(asOf),
  };
}

export function normalizeGraphDiffRequestIdentity(
  scope: unknown,
  from: unknown,
  to: unknown,
  filter?: unknown,
): GraphDiffRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    from: normalizeTemporalPoint(from),
    to: normalizeTemporalPoint(to),
    filter: normalizeTemporalText(filter),
  };
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
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
) {
  const request = normalizeTimelineLineageRequestIdentity(scope, range, filter, asOf);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.lineage(
      request.scope ?? "",
      request.range,
      request.filter,
      request.asOf,
    ),
    queryFn: () =>
      engineClient.lineage({
        scope: request.scope!,
        ...request.range,
        filter: request.filter,
        // BLOB-TRUE as-of (dashboard-timeline ADR fast-follow): when the timeline
        // is in time-travel it passes the (settled/debounced) playhead instant, so
        // the slice reflects the graph at T, not just creation-date gating. Absent
        // (LIVE) = live graph. A distinct `asOf` is its own cache entry (above).
        t: request.asOf == null ? undefined : String(request.asOf),
      }),
    enabled,
    // Flicker-free refresh on a BESPOKE backend signal: the timeline holds its
    // dataset in memory and windows it client-side, so this query refetches ONLY
    // when its identity changes — a graph generation bump (the SSE delta clock
    // invalidates the `lineage` subtree) or a filter/as-of switch, never on
    // navigation. `placeholderData` keeps the PREVIOUS dataset rendered across
    // that refetch so the surface never blanks/reloads (the user-visible flicker
    // the range-keyed fetch used to cause). Continuous, never destroyed.
    placeholderData: keepPreviousData,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
}

export interface TimelineLineageView {
  loading: boolean;
  errored: boolean;
  nodes: LineageNode[];
  arcs: LineageArc[];
  retry: () => void;
}

export interface TimelineSurfaceChromeView {
  showLoading: boolean;
  // Loading is UI-only (state-mode-uniformity ADR): the label is the screen-reader
  // name of the shared `Skeleton`, never visible body copy — no presentation
  // className is carried. Empty/degraded render through the shared `StateBlock`, so
  // their presentation classNames/dots are likewise the kit's, not the deriver's.
  loadingLabel: string;
  showEmpty: boolean;
  emptyLabel: string;
  showDegraded: boolean;
  degradedLabel: string;
  showError: boolean;
  errorLabel: string;
  errorClassName: string;
  retryLabel: string;
  retryButtonClassName: string;
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

export function deriveTimelineSurfaceChromeView({
  scopePresent,
  loading,
  errored,
  autoFitPending,
  hasMarks,
  surface,
}: {
  scopePresent: boolean;
  loading: boolean;
  errored: boolean;
  autoFitPending: boolean;
  hasMarks: boolean;
  surface: string;
}): TimelineSurfaceChromeView {
  const showEmpty =
    scopePresent &&
    !loading &&
    !errored &&
    !autoFitPending &&
    !hasMarks &&
    (surface === "empty" || surface === "normal" || surface === "lifecycle-sparse");
  return {
    showLoading: loading || autoFitPending,
    loadingLabel: "reading the timeline…",
    showEmpty,
    emptyLabel:
      surface === "lifecycle-sparse"
        ? "lineage appears as documents gain dates"
        : "no lineage in this range yet",
    showDegraded: surface === "reconnecting" && !errored,
    degradedLabel: "reconnecting — showing the last lineage",
    showError: errored,
    errorLabel: "couldn’t load the timeline",
    errorClassName:
      "absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted",
    retryLabel: "retry",
    retryButtonClassName:
      "rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  };
}

/**
 * Stores selector for the timeline's bounded lineage read. The timeline surface
 * consumes interpreted loading/error state and stable node/arc arrays instead of
 * branching on raw query flags and optional payload fields.
 */
export function useTimelineLineageView(
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
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
  scope: unknown,
  from: unknown,
  to: unknown,
  filter?: unknown,
) {
  const request = normalizeGraphDiffRequestIdentity(scope, from, to, filter);
  const enabled =
    request.scope !== null &&
    request.from !== null &&
    request.to !== null &&
    String(request.from) !== String(request.to);
  const query = useQuery({
    queryKey: engineKeys.diff(
      request.scope ?? "",
      request.from ?? "",
      request.to ?? "",
      request.filter,
    ),
    queryFn: () =>
      engineClient.graphDiff({
        scope: request.scope!,
        from: request.from!,
        to: request.to!,
        filter: request.filter,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export { normalizeSearchTarget } from "../searchTarget";
export type { SearchTarget } from "../searchTarget";

export interface SearchRequestIdentity {
  query: string;
  target: SearchTarget;
  scope: string | null;
}

export const normalizeSearchScope = normalizeGraphSliceScope;

export function normalizeSearchRequestIdentity(
  rawQuery: unknown,
  target: unknown,
  scope: unknown,
): SearchRequestIdentity {
  return {
    query: normalizeSearchQuery(rawQuery),
    target: normalizeSearchTarget(target),
    scope: normalizeSearchScope(scope),
  };
}

export function useEngineSearch(
  scope: unknown,
  query: unknown,
  target: unknown = "vault",
) {
  const request = normalizeSearchRequestIdentity(query, target, scope);
  const enabled = request.scope !== null && request.query.length > 0;
  const result = useQuery({
    queryKey: engineKeys.search(request.scope ?? "", request.query, request.target),
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
          {
            scope: request.scope!,
            query: request.query,
            target: request.target,
            max_results: SEARCH_MAX_RESULTS,
          },
          controller.signal,
        );
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    },
    enabled,
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
  return enabled ? result : { ...result, data: undefined };
}

// The client-side search abort budget. Ordering invariant (rag-integration-
// hardening ADR D2): this MUST stay STRICTLY GREATER than the engine's search
// budget (`SEARCH_HTTP_BUDGET` = 10s in `engine/crates/vaultspec-api/src/routes/
// ops.rs`) plus transport margin. When the client outlives the engine, every
// search outcome — success, degraded, or shape-miss — arrives as a tiers-carrying
// envelope BEFORE the client can abort, so degradation is read from tiers truth
// (the whole degradation architecture depends on the envelope actually landing).
// A client abort under this ordering therefore means only one thing honestly: the
// engine itself is unreachable — the genuine transport-error state. 12s = 10s
// engine budget + 2s transport margin. Exported so a guard test can pin the
// ordering invariant client-side (the engine budget it must exceed).
export const SEARCH_QUERY_TIMEOUT_MS = 12_000;

// The engine's own search budget (`SEARCH_HTTP_BUDGET` in
// `engine/crates/vaultspec-api/src/routes/ops.rs`), mirrored here ONLY so the
// ordering invariant is guard-testable on the frontend. This is not a wire value
// the app reads — it is the number the client budget above must strictly exceed.
// Two-sided anchor: the engine test
// `search_budget_is_pinned_to_the_frontend_mirror_anchor` (ops.rs) pins the real
// constant to this value, so a budget retune fails engine-side before this mirror
// can go silently stale.
export const ENGINE_SEARCH_BUDGET_MS = 10_000;

// The app-chosen per-target result bound, sent as `max_results` in the POST
// /search body so the wire payload is app-bounded rather than left at rag's CLI
// default (rag-integration-hardening ADR D5 / research G6). Sized to the unified
// palette's merged-view bound (`UNIFIED_SEARCH_RESULTS_MAX_ITEMS` = 40 in
// `searchController.ts`): the merge ranks vault + code hits together and keeps the
// top N, so in the worst case all N winners come from one corpus — fetching up to
// N per target is the honest bound that keeps the merged top-N correct. It sits
// below the engine's `MAX_SEARCH_RESULTS` ceiling (50). The value is FIXED, so it
// stays OUT of the query key (the key varies only by scope/target/query); a guard
// test pins it equal to the merged-view bound so the two never drift.
export const SEARCH_MAX_RESULTS = 40;

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
  loading: boolean;
  schemaLoading: boolean;
  settingsLoading: boolean;
  groups: SettingsGroup[];
  title: string;
  description: string;
  loadingMessage: string;
  emptyMessage: string;
  cancelLabel: string;
  doneLabel: string;
}

export interface ThemeSettingView {
  loading: boolean;
  serverTheme: string | undefined;
  themeMembers: readonly string[];
}

export interface SettingsEffectsView {
  loading: boolean;
  reduceMotion: boolean;
  graphDefaults: GraphSettingsDefaults | null;
}

export function deriveSettingsDialogView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
  schemaLoading: boolean,
  settingsLoading = false,
): SettingsDialogView {
  const loading = schemaLoading || settingsLoading;
  return {
    loading,
    schemaLoading,
    settingsLoading,
    groups: loading ? [] : resolveSettings(schema, settings, activeScope),
    title: "Settings",
    description: "Preferences are saved to this workspace. Some apply per scope.",
    loadingMessage: "Loading settings…",
    emptyMessage: "No settings are available.",
    cancelLabel: "Cancel",
    doneLabel: "Done",
  };
}

export function deriveThemeSettingView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  schemaLoading = false,
  settingsLoading = false,
): ThemeSettingView {
  const loading = schemaLoading || settingsLoading;
  const themeSetting = resolveEffectiveSetting(
    loading ? undefined : schema,
    loading ? undefined : settings,
    null,
    CONSUMED_SETTING_KEYS.theme,
  );
  return {
    loading,
    serverTheme: themeSetting?.value,
    themeMembers: settingEnumMembers(themeSetting?.def),
  };
}

export function deriveSettingsEffectsView(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
  schemaLoading = false,
  settingsLoading = false,
): SettingsEffectsView {
  const loading = schemaLoading || settingsLoading;
  return {
    loading,
    reduceMotion: loading ? false : resolveReduceMotionSetting(schema, settings),
    graphDefaults: loading
      ? null
      : resolveGraphSettingsDefaults(schema, settings, activeScope),
  };
}

/**
 * Stores selector for the schema-driven settings dialog. It composes the schema
 * registry and persisted values into resolved groups so app chrome never
 * re-implements effective-value precedence or query loading semantics.
 */
export function useSettingsDialogView(activeScope: unknown): SettingsDialogView {
  const normalizedScope = normalizeSettingsScope(activeScope);
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsDialogView(
    schema.data,
    settings.data,
    normalizedScope,
    schema.isPending,
    settings.isPending,
  );
}

/**
 * Stores selector for the platform theme bridge. Theme application stays in the
 * app/platform bridge, but effective-value resolution stays in this layer.
 */
export function useThemeSettingView(): ThemeSettingView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveThemeSettingView(
    schema.data,
    settings.data,
    schema.isPending,
    settings.isPending,
  );
}

/**
 * Stores selector for settings side effects. The app bridge applies document
 * attributes and one-time dashboard defaults, but settings interpretation stays
 * centralized here.
 */
export function useSettingsEffectsView(activeScope: unknown): SettingsEffectsView {
  const normalizedScope = normalizeSettingsScope(activeScope);
  const schema = useSettingsSchema();
  const settings = useSettings();
  return deriveSettingsEffectsView(
    schema.data,
    settings.data,
    normalizedScope,
    schema.isPending,
    settings.isPending,
  );
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

// --- live keybinding override binding (keyboard-action-system W02) ---------------
//
// The one global keymap dispatcher resolves a chord against the registry using a
// SYNCHRONOUS override reader (`setKeymapOverridesReader`). The persisted override
// map lives in the engine `keybindings` setting, read through this layer (the sole
// wire client — dashboard-layer-ownership). We bridge the two with a module-scoped
// cache: the binding hook recomputes the decoded map whenever the settings snapshot
// changes and stores it here, and the reader returns it on each keydown without a
// React render. This keeps stores the owner of wire access while the dispatcher
// stays a pure synchronous resolver.

let liveKeybindingOverrides: KeybindingOverrides = {};
let keymapReaderWired = false;

/**
 * Mount-once binding that wires the persisted-override selector into the global
 * keymap dispatcher. It reads the live settings snapshot through the stores hooks
 * and pushes the decoded override map into the module cache the dispatcher's
 * synchronous reader returns. App chrome mounts this once near the shell top; it
 * fetches nothing itself and reads no raw `tiers` block.
 */
export function useKeymapOverridesBinding(): void {
  const schema = useSettingsSchema();
  const settings = useSettings();
  const overrides = useMemo(
    () => resolveKeybindingOverrides(schema.data, settings.data),
    [schema.data, settings.data],
  );

  useEffect(() => {
    if (!keymapReaderWired) {
      setKeymapOverridesReader(() => liveKeybindingOverrides);
      keymapReaderWired = true;
    }
    // M4: reset to the no-override default on unmount so a teardown/remount (HMR,
    // StrictMode, a future non-app-lifetime mount) never leaves the dispatcher
    // reading a stale closure over the last-known overrides.
    return () => {
      setKeymapOverridesReader(() => ({}));
      liveKeybindingOverrides = {};
      keymapReaderWired = false;
    };
  }, []);

  useEffect(() => {
    liveKeybindingOverrides = overrides;
  }, [overrides]);
}

export function normalizeSettingUpdate(update: unknown): SettingUpdate | null {
  if (update === null || typeof update !== "object") return null;
  const record = update as Record<string, unknown>;
  if (typeof record.key !== "string" || typeof record.value !== "string") {
    return null;
  }
  const key = record.key.trim();
  if (key.length === 0) return null;
  const scope = normalizeSettingsScope(record.scope) ?? undefined;
  return { key, value: record.value, scope };
}

/** Persist a single settings write; seed + invalidate the settings cache. */
export function usePutSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => {
      const normalized = normalizeSettingUpdate(body);
      return normalized === null
        ? Promise.reject(new Error("Invalid settings update"))
        : engineClient.putSettings(normalized);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(engineKeys.settings(), settings);
      void queryClient.invalidateQueries({ queryKey: engineKeys.settings() });
    },
  });
}

// --- document write/create mutations (document-editor backend) -------------------
//
// Save, frontmatter, rename, and create ALL route through the authoring
// ledger's `directWrite` route (`operation: "replace_body"` /
// `"edit_frontmatter"` / `"rename"` / `"create_document"`,
// ledgered-edit-migration W01.P02 / W03.P07 / W03.P08 / W03.P09) — a
// self-approving direct changeset, not the legacy `/ops/core` ops-dispatch
// seam. `directWriteResultToOpsResult` maps the body/frontmatter outcome onto
// the SAME `OpsWriteResult` shape the editor lifecycle already consumes
// (`applyEditorWriteResult`); rename and create each map their own outcome
// shape locally (`RenameDocResult`, `OpsWriteResult`'s `created` variant). Every
// direct-write kind PINS the doc's `scope`, so a mutation that races a
// scope-switch is refused rather than silently landing in the wrong worktree.
// Only `archive`/`link` (feature-archive, relate) still dispatch through the
// legacy `dispatchOps` seam — the ops-dispatch write mode itself is now dead
// in practice (no live caller), left alive per the ADR's staged W04 removal.
//
// Either way, a conflict/refusal is a typed result the caller drives editor state
// from — NOT a thrown error — so the mutation resolves (never rejects) on a
// business outcome; only a transport fault (a tiers-bearing EngineError) or the
// actor-token fail-safe (`requireActorToken`, no identity bootstrapped) rejects.
// Concurrency rides the read's echoed `blob_hash`; degradation is read from the
// result's tiers, never guessed from transport
// (degradation-is-read-from-tiers-not-guessed-from-errors).

/** Strip the `doc:` prefix from a node id to recover the document STEM the write
 *  ops address by (`ref`). A non-`doc:` id passes through unchanged so a caller
 *  that already holds a bare stem is tolerated. */
export function stemFromNodeId(nodeId: string): string {
  return nodeId.startsWith("doc:") ? nodeId.slice("doc:".length) : nodeId;
}

/** The arguments to a body save: the open doc's node id + scope, the new text, and
 *  the optimistic-concurrency base (the `blob_hash` the draft was read at). */
export interface SaveBodyArgs {
  nodeId: unknown;
  scope: unknown;
  text: unknown;
  baseBlobHash: unknown;
}

interface WriteArgsRecord {
  [key: string]: unknown;
}

function writeArgsRecord(value: unknown): WriteArgsRecord {
  return value !== null && typeof value === "object" ? (value as WriteArgsRecord) : {};
}

function normalizeWriteText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeWriteOptionalString(value: unknown): string | undefined {
  return normalizeGitDiffArg(value) ?? undefined;
}

function normalizeWriteStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: string[] = [];
  for (const entry of value) {
    const text = normalizeGitDiffArg(entry);
    if (text !== null) normalized.push(text);
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeWriteRef(nodeId: unknown): {
  nodeId: string | null;
  ref: string | null;
} {
  const normalizedNodeId = normalizeNodeId(nodeId);
  return {
    nodeId: normalizedNodeId,
    ref: normalizedNodeId === null ? null : stemFromNodeId(normalizedNodeId),
  };
}

function refusedWriteResult(error: string): {
  result: OpsWriteResult;
  tiers: TiersBlock;
} {
  return {
    result: { kind: "refused", checks: [], errors: [error] },
    tiers: {},
  };
}

export interface NormalizedSaveBodyArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  text: string;
  baseBlobHash: string;
}

export function normalizeSaveBodyArgs(args: unknown): NormalizedSaveBodyArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    text: normalizeWriteText(value.text),
    baseBlobHash: normalizeWriteText(value.baseBlobHash),
  };
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
  scope: unknown,
  nodeId?: unknown,
): void {
  const normalizedScope = normalizeGitDiffArg(scope);
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (normalizedScope !== null && normalizedNodeId !== null) {
    void queryClient.invalidateQueries({
      queryKey: engineKeys.content(normalizedScope, normalizedNodeId),
    });
  }

  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  void queryClient.invalidateQueries({ queryKey: engineKeys.map() });

  if (normalizedScope === null) {
    invalidateQueryPrefix(queryClient, [...engineKeys.all, "search"]);
    return;
  }

  invalidateGraphGenerationSubtrees(queryClient, normalizedScope);
  void queryClient.invalidateQueries({
    queryKey: engineKeys.gitChanges(normalizedScope),
  });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "file-tree", normalizedScope]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff", normalizedScope]);
  invalidateQueryPrefix(queryClient, [
    ...engineKeys.all,
    "git-histdiff",
    normalizedScope,
  ]);
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
  scope: unknown,
): void {
  const normalizedScope = normalizeGitDiffArg(scope);
  if (normalizedScope !== null) {
    invalidateGraphGenerationSubtrees(queryClient, normalizedScope);
  }
}

/**
 * Backend `git` signal recovery invalidation. `/status` carries the dirty/ahead
 * rollup, while `/ops/git/status|numstat|diff|histdiff` and `/history` are
 * separate scoped projections. A git stream frame means the rollup, per-scope git
 * reads, and commit history may be stale, so refresh them from the same
 * stores-owned recovery seam.
 */
export function invalidateGitRecoveryReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: engineKeys.status() });
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-changes"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-diff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "git-histdiff"]);
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "history"]);
}

/**
 * Invalidate semantic consumers for one scope after rag lifecycle or index
 * freshness changes. Search results and graph embeddings are the two scoped
 * client-side semantic caches; callers must not hand-compose these families.
 */
export function invalidateScopedSemanticReads(
  queryClient: QueryClient,
  scope: unknown,
): void {
  const normalizedScope = normalizeSearchScope(scope);
  if (normalizedScope === null) return;
  invalidateQueryPrefix(queryClient, [...engineKeys.all, "search", normalizedScope]);
  invalidateQueryPrefix(queryClient, [
    ...engineKeys.all,
    "graph-embeddings",
    normalizedScope,
  ]);
}

/**
 * Map a `directWrite` outcome onto the shared `OpsWriteResult` shape the editor
 * save lifecycle already consumes (`applyEditorWriteResult`), so the Save
 * button's cutover to the ledgered route is invisible to the view layer above
 * this store. The direct-write conflict's `target_blob_hash` (the blob the save
 * would have produced had the base still matched) is not carried through — the
 * editor conflict UX has only ever rendered `expected`/`actual`.
 *
 * A `refused` result's reason rides BOTH `errors` and `checks` — the editor's
 * advisories panel (`conformanceChecksOf`, stores/view/editor.ts) reads only
 * `checks`, mirroring the one-entry `{severity, message, fixable}` shape
 * `applyRenameEditorResult`'s collision branch already uses — so a denied
 * (e.g. a scope-pin mismatch, a non-human actor) or failed direct write is
 * never a silently blank advisories panel.
 */
function directWriteRefusedResult(reason: string): OpsWriteResult {
  return {
    kind: "refused",
    checks: [{ severity: "error", message: reason, fixable: false }],
    errors: [reason],
  };
}

function directWriteResultToOpsResult(outcome: DirectWriteOutcome): {
  result: OpsWriteResult;
  tiers: TiersBlock;
} {
  if (outcome.kind === "applied") {
    return {
      result: {
        kind: "saved",
        path: outcome.documentPath ?? "",
        blobHash: outcome.blobHash ?? "",
        checks: [],
      },
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "conflict") {
    return {
      result: {
        kind: "conflict",
        expected: outcome.conflict.expected_blob_hash,
        actual: outcome.conflict.actual_blob_hash,
        path: outcome.conflict.document_path,
      },
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "denied") {
    return {
      result: directWriteRefusedResult(
        outcome.reason ?? "the direct editor save was denied",
      ),
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "failed") {
    return {
      result: directWriteRefusedResult(
        outcome.reason ?? "the direct editor save failed",
      ),
      tiers: outcome.tiers,
    };
  }
  if (outcome.kind === "in_flight") {
    return {
      result: directWriteRefusedResult(
        "a prior save for this document is still in flight — try again shortly",
      ),
      tiers: outcome.tiers,
    };
  }

  const exhaustive: never = outcome;
  return exhaustive;
}

/**
 * Save the open document's body through the authoring ledger's `directWrite`
 * route (`operation: "replace_body"`, ledgered-edit-migration W01.P02 /
 * W02.P06) — a self-approved direct changeset, not the legacy `set-body` ops
 * dispatch. Sends the open doc's `scope` as the direct-write scope PIN, so a
 * save that races a scope-switch is refused as a redacted denial rather than
 * silently landing in the wrong worktree. Resolves with the typed
 * `OpsWriteResult` — a `conflict` (the optimistic blob-hash base went stale) or a
 * `refused` (a validation rejection, denial, or in-flight collision) is a typed
 * result the caller drives editor state from, NOT a thrown error; only a
 * transport fault, or the actor-token fail-safe (no identity bootstrapped —
 * `requireActorToken`), rejects. On a `saved` outcome the vault-mutation read
 * surfaces are invalidated so the next read returns the new blob, graph
 * generation, tree rows, git dirty/change state, and graph-derived projections.
 * The new `blob_hash` is echoed in the result for the caller to adopt as the next
 * optimistic-concurrency base.
 */
export function useSaveBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveBodyArgs) => {
      const normalized = normalizeSaveBodyArgs(args);
      if (normalized.ref === null) {
        return refusedWriteResult("Missing document id");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "replace_body",
          ref: normalized.ref,
          body: normalized.text,
          expected_blob_hash: normalized.baseBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      return directWriteResultToOpsResult(outcome);
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeSaveBodyArgs(args);
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, normalized.scope, normalized.nodeId);
      }
    },
  });
}

/** The arguments to a frontmatter write (`set-frontmatter`): the open doc + scope,
 *  plus the metadata fields to set. The body text is untouched. */
export interface SetFrontmatterArgs {
  nodeId: unknown;
  scope: unknown;
  date?: unknown;
  tags?: unknown;
  related?: unknown;
  baseBlobHash: unknown;
}

export interface NormalizedSetFrontmatterArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  date?: string;
  tags?: string[];
  related?: string[];
  baseBlobHash: string;
}

export function normalizeSetFrontmatterArgs(
  args: unknown,
): NormalizedSetFrontmatterArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    date: normalizeWriteOptionalString(value.date),
    tags: normalizeWriteStringList(value.tags),
    related: normalizeWriteStringList(value.related),
    baseBlobHash: normalizeWriteText(value.baseBlobHash),
  };
}

/**
 * Set the open document's frontmatter (date / tags / related) through the
 * authoring ledger's `directWrite` route (`operation: "edit_frontmatter"`,
 * ledgered-edit-migration W03.P07) — a self-approved direct changeset, not
 * the legacy `set-frontmatter` ops dispatch. Sends the open doc's `scope` as
 * the direct-write scope pin, same as `useSaveBody`. Same typed-result
 * discipline — a `conflict`/`refused` resolves (never throws); a frontmatter
 * validation refusal (or a denial, or an in-flight collision) arrives as a
 * `refused` carrying the served reason so the editor explains the rejection
 * without parsing prose; only a transport fault, or the actor-token fail-safe
 * (`requireActorToken`), rejects. Invalidates the shared vault-mutation read
 * surfaces on a successful save.
 */
export function useSetFrontmatter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SetFrontmatterArgs) => {
      const normalized = normalizeSetFrontmatterArgs(args);
      if (normalized.ref === null) {
        return refusedWriteResult("Missing document id");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "edit_frontmatter",
          ref: normalized.ref,
          frontmatter: {
            date: normalized.date,
            tags: normalized.tags,
            related: normalized.related,
          },
          expected_blob_hash: normalized.baseBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      return directWriteResultToOpsResult(outcome);
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeSetFrontmatterArgs(args);
      if (result.kind === "saved") {
        invalidateAfterVaultMutation(queryClient, normalized.scope, normalized.nodeId);
      }
    },
  });
}

/** The arguments to a document create (`create`): the scope it lands in, the doc
 *  type + feature (the only required fields), an optional title, and optional
 *  related stems. */
export interface CreateDocArgs {
  scope: unknown;
  docType: unknown;
  feature: unknown;
  title?: unknown;
  related?: unknown;
}

export interface NormalizedCreateDocArgs {
  scope: string | null;
  docType: string;
  feature: string;
  title?: string;
  related?: string[];
}

export function normalizeCreateDocArgs(args: unknown): NormalizedCreateDocArgs {
  const value = writeArgsRecord(args);
  return {
    scope: normalizeGitDiffArg(value.scope),
    docType: normalizeWriteOptionalString(value.docType) ?? "",
    feature: normalizeWriteOptionalString(value.feature) ?? "",
    title: normalizeWriteOptionalString(value.title),
    related: normalizeWriteStringList(value.related),
  };
}

/**
 * Create a new document through the authoring ledger's `directWrite` route
 * (`operation: "create_document"`, ledgered-edit-migration W03.P09) — a
 * self-approved direct changeset, not the legacy `create` ops dispatch. Sends
 * the target `scope` as the direct-write scope pin, same as Save/frontmatter/
 * rename. Resolves with `{ result, nodeId }` where `result` is the typed
 * `OpsWriteResult` and `nodeId` is the SERVER-echoed `doc:<stem>` id (W03.P09a
 * — `vault add` names the created file itself; the client never predicted a
 * stem, and now doesn't need to: the apply receipt echoes the real
 * `result_node_id`/`result_stem`/`document_path` for a landed create,
 * re-resolved server-side, never client-guessed). `conflict`/`refused`
 * (including a predicted-create-path collision, structurally tagged
 * `denialKind === "path_collision"` — W05.P14, never a reason-text substring
 * match) is a typed result the caller drives UI state from — NOT a thrown
 * error; only a transport fault, or the actor-token fail-safe
 * (`requireActorToken`), rejects. On a `created` outcome the same vault-
 * mutation read surfaces are invalidated as a save (a new doc can introduce
 * tree rows, graph nodes, filter facets, search hits, and git change
 * entries).
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
      const normalized = normalizeCreateDocArgs(args);
      if (normalized.docType.length === 0 || normalized.feature.length === 0) {
        return {
          ...refusedWriteResult("Document type and feature are required"),
          nodeId: null,
        };
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "create_document",
          create: {
            doc_type: normalized.docType,
            feature: normalized.feature,
            title: normalized.title ?? "",
            related: normalized.related,
          },
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      if (outcome.kind === "applied") {
        // W03.P09a: the apply receipt now echoes the created document's real
        // identity (server-resolved, never client-predicted) —
        // `resultNodeId` is already the full `doc:<stem>` id.
        return {
          result: {
            kind: "created",
            path: outcome.documentPath ?? "",
            stem: outcome.resultStem ?? "",
          },
          tiers: outcome.tiers,
          nodeId: outcome.resultNodeId ?? null,
        };
      }
      if (outcome.kind === "conflict") {
        return {
          result: {
            kind: "conflict",
            expected: outcome.conflict.expected_blob_hash,
            actual: outcome.conflict.actual_blob_hash,
          },
          tiers: outcome.tiers,
          nodeId: null,
        };
      }
      // A predicted-create-path collision (`denialKind === "path_collision"`,
      // W05.P14) rides the same denied-status VALUE as every other denial and
      // folds into the SAME refused-with-checks result below: `OpsWriteResult`
      // (unlike rename's `RenameDocResult`) carries no distinct `collision`
      // kind for create, so there is no separate branch to route to.
      const reason =
        outcome.kind === "denied" || outcome.kind === "failed"
          ? (outcome.reason ?? "Create refused")
          : "a prior create for this document is still in flight — try again shortly";
      return {
        result: directWriteRefusedResult(reason),
        tiers: outcome.tiers,
        nodeId: null,
      };
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeCreateDocArgs(args);
      if (result.kind === "created") {
        invalidateAfterVaultMutation(queryClient, normalized.scope);
      }
    },
  });
}

/** Args for {@link useRenameDoc}: the open document's node id, the new stem, and
 *  the optimistic-concurrency base. */
export interface RenameDocArgs {
  scope?: unknown;
  /** The current node id (`doc:<old-stem>`) being renamed. */
  nodeId: unknown;
  /** The new identity-bearing stem (filename without `.md`). */
  to: unknown;
  /** The pre-rename blob hash for optimistic concurrency. */
  expectedBlobHash?: unknown;
}

/** The typed outcome of a rename, branched on the rename envelope (NEVER the HTTP
 *  code): `renamed` carries the re-keyed `newNodeId` the caller retargets the open
 *  editor/tab to; the failure kinds drive the editor's reconcile/advisory UI
 *  without parsing prose. */
export type RenameDocResult =
  | {
      kind: "renamed";
      oldNodeId: string;
      newNodeId: string;
      newBlobHash: string;
      incomingRewritten: number;
    }
  | { kind: "conflict"; expected: string; actual: string }
  | { kind: "collision"; message: string }
  | { kind: "refused"; message: string; checks: unknown[] };

export interface NormalizedRenameDocArgs {
  scope: string | null;
  nodeId: string | null;
  ref: string | null;
  to: string;
  expectedBlobHash?: string;
}

export function normalizeRenameDocArgs(args: unknown): NormalizedRenameDocArgs {
  const value = writeArgsRecord(args);
  const identity = normalizeWriteRef(value.nodeId);
  return {
    scope: normalizeGitDiffArg(value.scope),
    nodeId: identity.nodeId,
    ref: identity.ref,
    to: normalizeWriteOptionalString(value.to) ?? "",
    expectedBlobHash: normalizeWriteOptionalString(value.expectedBlobHash),
  };
}

function refusedRenameResult(message: string): {
  result: RenameDocResult;
  tiers: TiersBlock;
} {
  return {
    result: { kind: "refused", message, checks: [] },
    tiers: {},
  };
}

/**
 * Rename a document's file through the authoring ledger's `directWrite` route
 * (`operation: "rename"`, ledgered-edit-migration W03.P08) — a self-approved
 * direct changeset, not the legacy `rename` ops dispatch. Sends the open doc's
 * `scope` as the direct-write scope pin, same as Save/frontmatter. On a
 * `renamed` outcome the caller re-keys the open editor/tab from `oldNodeId` to
 * `newNodeId` (the engine has already re-pointed incoming `related:` links,
 * and the watcher re-ingests) — `incomingRewritten` is not carried by the
 * direct-write outcome and floors to 0 (no consumer reads it today). A
 * `conflict` (a stale optimistic base) / `collision` (the target stem is
 * occupied, routed on the served structured `denialKind === "path_collision"`
 * — W05.P14, never a reason-text substring match) / `refused` (every other
 * denial/failure/in-flight collision) is a typed result the caller drives
 * editor state from — NOT a thrown error; only a transport fault, or the
 * actor-token fail-safe (`requireActorToken`), rejects. The same vault-
 * mutation read surfaces are invalidated as a save (a rename changes tree
 * rows, the content key, graph nodes, and git entries).
 */
export function useRenameDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: RenameDocArgs,
    ): Promise<{ result: RenameDocResult; tiers: TiersBlock }> => {
      const normalized = normalizeRenameDocArgs(args);
      if (normalized.ref === null || normalized.nodeId === null) {
        return refusedRenameResult("Missing document id");
      }
      if (normalized.to.length === 0) {
        return refusedRenameResult("Rename target is required");
      }
      // The direct-write route REQUIRES `expected_blob_hash` for rename (unlike
      // the legacy op, which tolerated an absent fence) — refuse client-side
      // rather than sending an empty string, which the backend 422s as a
      // malformed request rather than a graceful denial VALUE.
      if (!normalized.expectedBlobHash) {
        return refusedRenameResult("Missing the pre-rename optimistic base");
      }
      const outcome = await authoringClient.directWrite(
        {
          operation: "rename",
          ref: normalized.ref,
          new_stem: normalized.to,
          expected_blob_hash: normalized.expectedBlobHash,
          scope: normalized.scope,
        },
        { actorToken: requireActorToken() },
      );
      let result: RenameDocResult;
      if (outcome.kind === "applied") {
        result = {
          kind: "renamed",
          oldNodeId: normalized.nodeId,
          newNodeId: docNodeIdFromStem(normalized.to),
          newBlobHash: outcome.blobHash ?? "",
          incomingRewritten: 0,
        };
      } else if (outcome.kind === "conflict") {
        result = {
          kind: "conflict",
          expected: outcome.conflict.expected_blob_hash,
          actual: outcome.conflict.actual_blob_hash,
        };
      } else if (outcome.kind === "denied" && outcome.denialKind === "path_collision") {
        result = {
          kind: "collision",
          message: outcome.reason ?? "Target already exists",
        };
      } else {
        const reason =
          outcome.kind === "denied" || outcome.kind === "failed"
            ? (outcome.reason ?? "Rename refused")
            : "a prior rename for this document is still in flight — try again shortly";
        result = {
          kind: "refused",
          message: reason,
          checks: [{ severity: "error", message: reason, fixable: false }],
        };
      }
      return { result, tiers: outcome.tiers };
    },
    onSuccess: ({ result }, args) => {
      const normalized = normalizeRenameDocArgs(args);
      if (result.kind === "renamed") {
        invalidateAfterVaultMutation(queryClient, normalized.scope);
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
export function useReadTime(nodeId: unknown, scope: unknown): ReadTimeEstimate {
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
  const availability = readTierAvailability(tiers, [RAG_TIER]);
  const degraded = tiers !== undefined && availability.degraded;
  // Prefer the per-tier semantic-degradation reason; fall back to the lifecycle
  // reason the `/status` machine `state` carries (crashed/absent explanation) when
  // the tier block names none.
  const reason = availability.reasons[RAG_TIER] ?? data?.rag?.reason;

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

export interface PipelineStatusRequestIdentity {
  scope: string | null;
  asOf: string | number | undefined;
}

export interface PlanInteriorRequestIdentity {
  scope: string | null;
  planId: string | null;
}

export function normalizePipelineStatusRequestIdentity(
  scope: unknown,
  asOf?: unknown,
): PipelineStatusRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    asOf: normalizeGraphSliceAsOf(asOf),
  };
}

export function normalizePlanInteriorRequestIdentity(
  planId: unknown,
  scope: unknown,
): PlanInteriorRequestIdentity {
  const nodeId = normalizeNodeId(planId);
  return {
    scope: normalizeNodeScopedScope(scope),
    planId: isAddressableNode(nodeId) ? nodeId : null,
  };
}

/**
 * The in-flight pipeline projection for the active scope (W01.P02.S06). Disabled when
 * scope is null (no worktree resolved yet), following the `useGraphSlice` pattern. The
 * `asOf` playhead folds into the cache key so a historical view reads a distinct entry
 * (W03.P08.S36 / dashboard-timeline ADR). The live wire's `pipeline(scope)` takes no
 * as-of yet, so a past playhead reuses the live projection until the wire grows the
 * parameter — the surface still degrades honestly via the served tiers block.
 */
export function usePipelineStatus(scope: unknown, asOf?: unknown) {
  const request = normalizePipelineStatusRequestIdentity(scope, asOf);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.pipeline(request.scope ?? "", request.asOf),
    queryFn: () => engineClient.pipeline(request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * A plan node's bounded wave/phase/step interior (W01.P02.S07). Disabled until a plan
 * row is expanded (`planId === null` means collapsed), following the `useNodeNeighbors`
 * enabled-on-id pattern so the interior is fetched lazily, never for every row.
 */
export function usePlanInterior(planId: unknown, scope: unknown) {
  const request = normalizePlanInteriorRequestIdentity(planId, scope);
  const enabled = request.scope !== null && request.planId !== null;
  const query = useQuery({
    queryKey: engineKeys.planInterior(request.scope ?? "", request.planId ?? ""),
    queryFn: () => engineClient.planInterior(request.planId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
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
  /** Work tab's rendered state token for the root data attribute. */
  workSurfaceState: "degraded" | "loading" | "empty" | "list";
  /** Whether Work tab should render the designed degraded status state. */
  showWorkDegraded: boolean;
  /** Whether Work tab should render the loading status state. */
  showWorkLoading: boolean;
  /** Whether Work tab should render the designed empty status state. */
  showWorkEmpty: boolean;
  /** Whether Work tab should render the in-flight list. */
  showWorkList: boolean;
  /** The in-flight artifacts (active plans + in-flight ADRs); empty while degraded. */
  artifacts: PipelineArtifact[];
  /** Plan artifacts, split once in the stores layer for right-rail work surfaces. */
  plans: PipelineArtifact[];
  /** Plan rows with Status-tab presentation labels pre-derived from the artifact. */
  planRows: PipelinePlanRowView[];
  /** ADR artifacts, split once in the stores layer for right-rail work surfaces. */
  adrs: PipelineArtifact[];
  /** ADR rows with Work-tab presentation labels pre-derived from the artifact. */
  adrRows: PipelineAdrRowView[];
  /** Plan node ids for expansion-store enrollment. */
  planIds: string[];
  /** Occupied pipeline phases for the compact pipeline arc. */
  occupiedPhases: ReadonlySet<string>;
  /** Count of renderable in-flight artifacts. */
  count: number;
  /** Polite live-region text for the pipeline surface state. */
  liveMessage: string;
  /** Full Work tab status heading for degraded/loading/empty states. */
  workStatusTitle: string;
  /** Full Work tab status detail for degraded/empty states. */
  workStatusDetail: string;
  /** Compact Status tab open-plans status label for degraded/loading/empty states. */
  openPlansStatusLabel: string;
  /** Work tab section accessible label. */
  workSurfaceAriaLabel: string;
  /** Work tab status-state section class. */
  workStatusSectionClassName: string;
  /** Work tab list-state section class. */
  workListSectionClassName: string;
  /** Work tab live-region class. */
  workLiveRegionClassName: string;
  /** Work tab status-state icon wrapper class. */
  workStatusIconClassName: string;
  /** Work tab status title class. */
  workStatusTitleClassName: string;
  /** Work tab status detail class. */
  workStatusDetailClassName: string;
  /** Work tab in-flight list accessible label. */
  workListAriaLabel: string;
  /** Work tab in-flight list class. */
  workListClassName: string;
  /** Work tab's single roving Tab stop when a plan row is first. */
  workTabbablePlanId: string | null;
  /** Work tab's single roving Tab stop when no plan row is present. */
  workTabbableAdrId: string | null;
}

export interface PipelinePlanRowView {
  artifact: PipelineArtifact;
  nodeId: string;
  titleLabel: string;
  modifiedAt: string | undefined;
  phaseLabel: string;
  tierLabel: string | null;
  tierAriaLabel: string | null;
  openAriaLabel: string;
  selectAriaLabel: string;
  showProgress: boolean;
  progressDone: number;
  progressTotal: number;
  progressTextLabel: string;
  progressLabel: string;
  progressPercentLabel: string | null;
  toggleLabel: (expanded: boolean) => string;
}

export interface PipelineAdrRowView {
  artifact: PipelineArtifact;
  nodeId: string;
  titleLabel: string;
  modifiedAt: string | undefined;
  selectAriaLabel: string;
  statusLabel: string | null;
  featureLabel: string | null;
  showStatusPlaceholder: boolean;
  statusPlaceholderLabel: string;
  rowClassName: string;
  iconClassName: string;
  bodyClassName: string;
  headingClassName: string;
  titleClassName: string;
  statusPlaceholderClassName: string;
  metaClassName: string;
}

// The pipeline projection is resolved by the engine's STRUCTURAL read of the vault
// corpus, so the `structural` tier gates availability (contract §2).
const PIPELINE_STATUS_TIERS = ["structural"] as const;
const WORK_STATUS_SECTION_CLASS =
  "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted";
const WORK_LOADING_SECTION_CLASS =
  "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint";
const WORK_LIST_SECTION_CLASS = "space-y-fg-2 text-body";
const WORK_LIVE_REGION_CLASS = "sr-only";
const WORK_STATUS_ICON_CLASS = "text-ink-faint";
const WORK_STATUS_TITLE_CLASS = "font-medium text-ink";
const WORK_LOADING_TITLE_CLASS = "animate-pulse-live";
const WORK_STATUS_DETAIL_CLASS = "text-ink-faint";
const WORK_LIST_CLASS = "space-y-fg-1";
const WORK_ADR_ROW_CLASS =
  "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORK_ADR_ICON_CLASS = "shrink-0 text-ink-faint";
const WORK_ADR_BODY_CLASS = "min-w-0 flex-1";
const WORK_ADR_HEADING_CLASS = "flex items-center gap-fg-1-5";
const WORK_ADR_TITLE_CLASS = "min-w-0 truncate text-body text-ink";
const WORK_ADR_STATUS_PLACEHOLDER_CLASS =
  "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint";
const WORK_ADR_META_CLASS =
  "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint";

function pipelineArtifactTitleLabel(artifact: PipelineArtifact): string {
  return (artifact.title ?? artifact.stem).replace(/`/g, "");
}

function pipelinePlanRowView(artifact: PipelineArtifact): PipelinePlanRowView {
  const titleLabel = pipelineArtifactTitleLabel(artifact);
  const done = artifact.progress?.done ?? 0;
  const total = artifact.progress?.total ?? 0;
  const tierLabel = artifact.tier ?? null;
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : null;
  return {
    artifact,
    nodeId: artifact.node_id,
    titleLabel,
    modifiedAt: artifact.dates?.modified,
    phaseLabel: artifact.phase,
    tierLabel,
    tierAriaLabel: tierLabel === null ? null : `tier ${tierLabel}`,
    openAriaLabel: `open plan ${titleLabel} in the reader`,
    selectAriaLabel: `select plan ${titleLabel} on the stage`,
    showProgress: total > 0,
    progressDone: done,
    progressTotal: total,
    progressTextLabel: `${done}/${total}`,
    progressLabel: `${titleLabel} completion`,
    progressPercentLabel: progressPercent === null ? null : `${progressPercent}%`,
    toggleLabel: (expanded) =>
      `${expanded ? "collapse" : "expand"} steps for ${titleLabel}`,
  };
}

function pipelineAdrRowView(artifact: PipelineArtifact): PipelineAdrRowView {
  const titleLabel = pipelineArtifactTitleLabel(artifact);
  const statusLabel = artifact.status ?? null;
  return {
    artifact,
    nodeId: artifact.node_id,
    titleLabel,
    modifiedAt: artifact.dates?.modified,
    selectAriaLabel: `ADR ${titleLabel}${statusLabel ? `, status ${statusLabel}` : ""}`,
    statusLabel,
    featureLabel: artifact.feature_tags?.[0] ?? null,
    showStatusPlaceholder: statusLabel === null && !ADR_STATUS_SERVED,
    statusPlaceholderLabel: "status pending",
    rowClassName: WORK_ADR_ROW_CLASS,
    iconClassName: WORK_ADR_ICON_CLASS,
    bodyClassName: WORK_ADR_BODY_CLASS,
    headingClassName: WORK_ADR_HEADING_CLASS,
    titleClassName: WORK_ADR_TITLE_CLASS,
    statusPlaceholderClassName: WORK_ADR_STATUS_PLACEHOLDER_CLASS,
    metaClassName: WORK_ADR_META_CLASS,
  };
}

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
  const planRows = plans.map(pipelinePlanRowView);
  const adrs = trustedArtifacts.filter((artifact) => artifact.doc_type === "adr");
  const adrRows = adrs.map(pipelineAdrRowView);
  const workTabbablePlanId = planRows[0]?.nodeId ?? null;
  const workTabbableAdrId =
    workTabbablePlanId === null ? (adrRows[0]?.nodeId ?? null) : null;
  const count = trustedArtifacts.length;
  const showWorkDegraded = availability.degraded;
  const showWorkLoading = !showWorkDegraded && loading;
  const showWorkEmpty = !showWorkDegraded && !showWorkLoading && count === 0;
  const showWorkList = !showWorkDegraded && !showWorkLoading && count > 0;
  const workSurfaceState = showWorkDegraded
    ? "degraded"
    : showWorkLoading
      ? "loading"
      : showWorkEmpty
        ? "empty"
        : "list";
  const degradedReason = availability.reasons[WORK_PILLAR_TIER];
  const liveMessage = availability.degraded
    ? "pipeline status unavailable"
    : loading
      ? "loading in-flight work"
      : count === 0
        ? "no in-flight work"
        : `${count} in-flight item${count === 1 ? "" : "s"}`;
  const workStatusTitle = availability.degraded
    ? "pipeline status unavailable"
    : loading
      ? "reading in-flight work…"
      : count === 0
        ? "no work in flight on this branch"
        : liveMessage;
  const workStatusDetail = availability.degraded
    ? degradedReason
      ? `the pipeline read is degraded — ${degradedReason}`
      : "the pipeline read is degraded; in-flight work will appear here once it recovers"
    : loading
      ? ""
      : count === 0
        ? "no in-flight pipeline work in the current scope; active ADRs and plans will appear here as they advance."
        : "";
  const openPlansStatusLabel = availability.degraded
    ? "pipeline status unavailable"
    : loading
      ? "reading in-flight work…"
      : plans.length === 0
        ? "no plans in flight on this branch"
        : `${plans.length} plan${plans.length === 1 ? "" : "s"} in flight`;
  return {
    loading,
    workSurfaceState,
    showWorkDegraded,
    showWorkLoading,
    showWorkEmpty,
    showWorkList,
    ...availability,
    // While degraded the projection cannot be trusted, so do not render a stale list as
    // current in-flight work; the surface shows the degraded notice instead.
    artifacts: trustedArtifacts,
    plans,
    planRows,
    adrs,
    adrRows,
    planIds: plans.map((plan) => plan.node_id),
    occupiedPhases: new Set(
      trustedArtifacts.map((artifact) => artifact.phase as string),
    ),
    count,
    liveMessage,
    workStatusTitle,
    workStatusDetail,
    openPlansStatusLabel,
    workSurfaceAriaLabel: "work pipeline status",
    workStatusSectionClassName: showWorkLoading
      ? WORK_LOADING_SECTION_CLASS
      : WORK_STATUS_SECTION_CLASS,
    workListSectionClassName: WORK_LIST_SECTION_CLASS,
    workLiveRegionClassName: WORK_LIVE_REGION_CLASS,
    workStatusIconClassName: WORK_STATUS_ICON_CLASS,
    workStatusTitleClassName: showWorkLoading
      ? WORK_LOADING_TITLE_CLASS
      : WORK_STATUS_TITLE_CLASS,
    workStatusDetailClassName: WORK_STATUS_DETAIL_CLASS,
    workListAriaLabel: "in-flight pipeline work",
    workListClassName: WORK_LIST_CLASS,
    workTabbablePlanId,
    workTabbableAdrId,
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
  scope: unknown,
  asOf?: unknown,
): PipelineStatusView {
  const request = normalizePipelineStatusRequestIdentity(scope, asOf);
  const query = usePipelineStatus(request.scope, request.asOf);
  return derivePipelineStatusView(
    tiersFromQuery(query),
    query.data?.artifacts ?? [],
    request.scope !== null && query.isPending,
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

export interface InteriorStepView extends InteriorStep {
  targetNodeId: string | null;
  selectable: boolean;
  headingLabel: string;
  rowAriaLabel: string;
  rowClassName: string;
}

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
  /** Whether the plan-interior capability is served by the backend. */
  served: boolean;
  /** Whether the served interior carries no visible containers or steps. */
  empty: boolean;
  /** The ordered waves (L3/L4 shape); empty for L1/L2 plans. */
  waves: InteriorWaveView[];
  /** The ordered phases (L2 shape); empty for L1 and L3/L4 plans. */
  phases: InteriorPhaseView[];
  /** The flat steps (L1 shape); empty for L2/L3/L4 plans. */
  steps: InteriorStepView[];
  /** Whether the flat L1 step bucket should be rendered. */
  hasUngroupedSteps: boolean;
  /** The plan-level rolled-up completion (from the engine summary, truncation-honest). */
  rollup: InteriorRollup;
  /** The engine-served structural summary (counts + completion state), pre-truncation. */
  summary: PlanSummary;
  /** Honest bounded-interior truncation when the engine capped the tree; null otherwise. */
  truncated: PlanInterior["truncated"];
  loadingMessage: string;
  placeholderMessage: string;
  emptyMessage: string;
  listAriaLabel: string;
  truncatedMessage: string | null;
}

/** The inert zero summary for a collapsed/unserved interior — a stable reference
 *  so a consumer memoizing on `view.summary` does not recompute every render. */
const EMPTY_PLAN_SUMMARY: PlanSummary = {
  wave_count: 0,
  phase_count: 0,
  step_count: 0,
  done_count: 0,
  plan_state: null,
};

function interiorStepView(step: InteriorStep): InteriorStepView {
  const targetNodeId = step.exec_node_id ?? null;
  return {
    ...step,
    targetNodeId,
    selectable: targetNodeId !== null,
    headingLabel: step.action ?? step.id,
    rowAriaLabel: `step ${step.id}${
      targetNodeId ? ", open exec record" : ", no exec record"
    }`,
    rowClassName: `flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
      targetNodeId ? "hover:bg-paper-sunken" : "cursor-default opacity-80"
    }`,
  };
}

/**
 * Derive the plan-interior view (W01.P02.S11): the per-container rollups and the
 * plan-level completion are READ FROM THE ENGINE (computed pre-truncation), never
 * re-counted client-side over a possibly-truncated tree
 * (`display-state-is-backend-served-not-frontend-derived`). The truncated honesty
 * block surfaces as a designed state (graph-queries-are-bounded-by-default). The
 * tier-honest shape passes through: an L1 plan carries flat `steps`, an L2 plan
 * `phases`, an L3/L4 plan `waves` — exactly as the wire serves it.
 */
export function derivePlanInteriorView(
  interior: PlanInterior | undefined,
  loading: boolean,
): PlanInteriorView {
  if (!interior) {
    return {
      loading,
      served: PLAN_INTERIOR_SERVED,
      empty: true,
      waves: [],
      phases: [],
      steps: [],
      hasUngroupedSteps: false,
      rollup: { done: 0, total: 0 },
      summary: EMPTY_PLAN_SUMMARY,
      truncated: null,
      loadingMessage: "loading steps...",
      placeholderMessage: "step tree pending - the plan interior is not yet served.",
      emptyMessage: "no steps in this plan yet.",
      listAriaLabel: "plan steps",
      truncatedMessage: null,
    };
  }
  // Per-container rollups are served by the engine (computed over the full step
  // subtree pre-truncation) — pass them through, never re-count the served slice.
  const phases: InteriorPhaseView[] = interior.phases.map((p) => ({
    ...p,
    steps: p.steps.map(interiorStepView),
    rollup: p.rollup,
  }));
  const waves: InteriorWaveView[] = interior.waves.map((w) => ({
    ...w,
    phases: w.phases.map((p) => ({
      ...p,
      steps: p.steps.map(interiorStepView),
      rollup: p.rollup,
    })),
    rollup: w.rollup,
  }));
  const steps: InteriorStepView[] = interior.steps.map(interiorStepView);
  // Plan-level rollup comes from the engine summary (truncation-honest totals).
  const planRollup: InteriorRollup = {
    done: interior.summary.done_count,
    total: interior.summary.step_count,
  };
  const truncated = interior.truncated ?? null;
  return {
    loading,
    served: PLAN_INTERIOR_SERVED,
    empty: waves.length === 0 && phases.length === 0 && steps.length === 0,
    waves,
    phases,
    steps,
    hasUngroupedSteps: steps.length > 0,
    rollup: planRollup,
    summary: interior.summary,
    truncated,
    loadingMessage: "loading steps...",
    placeholderMessage: "step tree pending - the plan interior is not yet served.",
    emptyMessage: "no steps in this plan yet.",
    listAriaLabel: "plan steps",
    truncatedMessage: truncated
      ? `showing ${truncated.returned_nodes} of ${truncated.total_nodes} nodes - this plan exceeds the interior ceiling; open it on the stage to see the full tree.`
      : null,
  };
}

/**
 * Stores hook: the interpreted plan-interior view for an expanded plan node
 * (W01.P02.S11). `planId === null` means the row is collapsed: the query is disabled and
 * the view is the inert empty state. The Work step tree renders rolled-up completion and
 * honest truncation directly from this, never the raw interior response.
 */
export function usePlanInteriorView(planId: unknown, scope: unknown): PlanInteriorView {
  const request = normalizePlanInteriorRequestIdentity(planId, scope);
  const query = usePlanInterior(request.planId, request.scope);
  return derivePlanInteriorView(
    query.data?.interior,
    request.planId !== null && query.isPending,
  );
}

/** The completion tone of a plan, for the summary card's state badge + bar. The
 *  classification stays engine-served (`plan_state`); this is presentation only. */
export type PlanStateTone = "pending" | "active" | "complete";

/** The interpreted plan-summary view the reader's plan card renders: the
 *  user-facing state label + tone, the completion percentage, and the wave/phase/
 *  step counts — all from the engine `PlanSummary` (no client re-counting). */
export interface PlanSummaryView {
  /** Whether the plan carries any steps (the card hides its bar/% when false). */
  hasStructure: boolean;
  /** User-facing state label (`ui-labels-are-user-facing`). */
  stateLabel: string;
  /** Presentation tone for the badge/bar, mapped from the served `plan_state`. */
  tone: PlanStateTone;
  /** Completion percentage over served counts; null when the plan has no steps. */
  percent: number | null;
  /** `"48%"` readout, or null when there is no step progress to show. */
  percentLabel: string | null;
  waveCount: number;
  phaseCount: number;
  stepCount: number;
  doneCount: number;
}

const PLAN_STATE_PRESENTATION: Record<string, { label: string; tone: PlanStateTone }> =
  {
    "not-started": { label: "Not started", tone: "pending" },
    "in-progress": { label: "In progress", tone: "active" },
    finished: { label: "Finished", tone: "complete" },
  };

/**
 * Map the engine `PlanSummary` to the reader card's presentation. The completion
 * CLASS is engine-served (`plan_state`); this only chooses a user-facing label, a
 * tone, and the display percentage (presentation math over served counts, mirroring
 * `pipelineRowView`'s `progressPercent`). A plan with no steps falls back to the
 * "Not started" presentation with no percentage.
 */
export function derivePlanSummaryView(summary: PlanSummary): PlanSummaryView {
  const stepCount = summary.step_count;
  const doneCount = summary.done_count;
  const hasStructure = stepCount > 0;
  const percent = hasStructure ? Math.round((doneCount / stepCount) * 100) : null;
  const presentation =
    (summary.plan_state ? PLAN_STATE_PRESENTATION[summary.plan_state] : undefined) ??
    PLAN_STATE_PRESENTATION["not-started"];
  return {
    hasStructure,
    stateLabel: presentation.label,
    tone: presentation.tone,
    percent,
    percentLabel: percent === null ? null : `${percent}%`,
    waveCount: summary.wave_count,
    phaseCount: summary.phase_count,
    stepCount,
    doneCount,
  };
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

export type ChangedDocumentCategory = "adr" | "audit" | "exec" | "plan" | "research";

export interface ChangedSourceFileRow {
  path: string;
  basename: string;
  nodeId: string;
  group: ChangedFile["group"];
  dotColor: string;
  rowClassName: string;
  dotClassName: string;
  basenameClassName: string;
  adds: number | null;
  dels: number | null;
  addsLabel: string | null;
  delsLabel: string | null;
  addsClassName: string;
  delsClassName: string;
  openArrowClassName: string;
}

export interface ChangedDocumentRow {
  path: string;
  title: string;
  nodeId: string;
  category?: ChangedDocumentCategory;
  rowClassName: string;
  fallbackDotClassName: string;
  titleClassName: string;
  openArrowClassName: string;
}

const CHANGED_DOCUMENT_CATEGORY: Record<string, ChangedDocumentCategory> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
};

function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** The repo-relative parent directory of a path, shown dimmed beside the basename
 *  so a row reads unambiguously even when the basename is opaque (a cache file's
 *  hash name) or duplicated across directories (the many `index.ts`/`mod.rs`). */
function fileDirname(path: string): string {
  const segments = path.split(/[/\\]/);
  segments.pop();
  return segments.join("/");
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

const CHANGES_OVERVIEW_ROW_CLASS =
  "flex h-[1.875rem] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const CHANGED_FILE_DOT_CLASS = "size-2 shrink-0 rounded-full";
const CHANGED_FILE_BASENAME_CLASS =
  "min-w-0 flex-1 truncate font-mono text-[0.71875rem] text-ink";
const CHANGED_FILE_ADDS_CLASS = "shrink-0 text-meta text-diff-add";
const CHANGED_FILE_DELS_CLASS = "shrink-0 text-meta text-diff-remove";
const CHANGED_DOCUMENT_FALLBACK_DOT_CLASS = "size-2 shrink-0 rounded-full bg-ink-faint";
const CHANGED_DOCUMENT_TITLE_CLASS =
  "min-w-0 flex-1 truncate text-[0.78125rem] text-ink";
const CHANGES_OVERVIEW_OPEN_ARROW_CLASS = "shrink-0 text-body text-ink-faint";

function changedFileRow(file: ChangedFile): ChangedSourceFileRow {
  return {
    path: file.path,
    basename: fileBasename(file.path),
    nodeId: codeNodeIdFromPath(file.path),
    group: file.group,
    dotColor: changedFileDotColor(file.group),
    rowClassName: CHANGES_OVERVIEW_ROW_CLASS,
    dotClassName: CHANGED_FILE_DOT_CLASS,
    basenameClassName: CHANGED_FILE_BASENAME_CLASS,
    adds: file.adds,
    dels: file.dels,
    addsLabel: file.adds === null ? null : `${file.adds} added`,
    delsLabel: file.dels === null ? null : `${file.dels} removed`,
    addsClassName: CHANGED_FILE_ADDS_CLASS,
    delsClassName: CHANGED_FILE_DELS_CLASS,
    openArrowClassName: CHANGES_OVERVIEW_OPEN_ARROW_CLASS,
  };
}

function changedFileDotColor(group: ChangedFile["group"]): string {
  if (group === "added") return "var(--color-diff-add)";
  if (group === "deleted" || group === "renamed") return "var(--color-diff-remove)";
  return "var(--color-state-stale)";
}

function changedDocumentRow(file: ChangedFile): ChangedDocumentRow {
  const docType = changedDocumentType(file.path);
  const category = docType === null ? undefined : CHANGED_DOCUMENT_CATEGORY[docType];
  return {
    path: file.path,
    title: changedDocumentTitle(file.path),
    nodeId: docNodeIdFromStem(stemFromPath(file.path)),
    rowClassName: CHANGES_OVERVIEW_ROW_CLASS,
    fallbackDotClassName: CHANGED_DOCUMENT_FALLBACK_DOT_CLASS,
    titleClassName: CHANGED_DOCUMENT_TITLE_CLASS,
    openArrowClassName: CHANGES_OVERVIEW_OPEN_ARROW_CLASS,
    ...(category ? { category } : {}),
  };
}

// --- status-grouped change tree (binding GitStatusPill 642:1745 / GitFileRow 653:1864) -
//
// The Changes body groups every working-tree entry under three collapsible status
// parents — MODIFIED / DELETED / NEW — exactly as the binding GitStatusPill expanded
// state renders them. A row is the entry's filename + numstat (mono diff tallies):
// MODIFIED shows +A −D, DELETED shows only −D and strikes the name, NEW shows only
// +A. No per-row status dot and no open arrow (the GROUP conveys the status); a click
// still opens the code viewer (source files) or the markdown reader (vault docs).

/** The three status buckets the change tree groups entries into, in render order. */
export type GitChangeBucket = "staged" | "modified" | "deleted" | "new";

const GIT_CHANGE_BUCKET_ORDER: readonly GitChangeBucket[] = [
  // Staged first: it is what the next commit will capture, the most actionable
  // group. The remaining buckets carry the worktree-side (unstaged) changes.
  "staged",
  "modified",
  "deleted",
  "new",
] as const;

// SectionLabel uppercases the eyebrow, so author Title-case and it renders
// STAGED / MODIFIED / DELETED / NEW to match the binding.
const GIT_CHANGE_BUCKET_LABEL: Record<GitChangeBucket, string> = {
  staged: "Staged",
  modified: "Modified",
  deleted: "Deleted",
  new: "New",
};

/** Map a porcelain status group onto its tree bucket. An index-side change
 *  (porcelain X set) buckets as STAGED — what the next commit will capture —
 *  before the worktree-side groups: deleted → DELETED, added/untracked → NEW,
 *  the rest → MODIFIED. */
function gitChangeBucket(group: GitChangeGroup): GitChangeBucket {
  if (group === "staged") return "staged";
  if (group === "deleted") return "deleted";
  if (group === "added" || group === "untracked") return "new";
  return "modified";
}

export interface GitChangeRow {
  path: string;
  /** Source-file basename, or the readable title for a vault document. */
  label: string;
  /** The dimmed parent-directory context shown after the basename (empty at repo
   *  root). Disambiguates opaque/duplicate basenames so a row is always readable. */
  dirLabel: string;
  dirClassName: string;
  nodeId: string;
  /** Open target: the code viewer for files, the markdown reader for vault docs. */
  surface: "code" | "markdown";
  /** numstat tallies; the bucket decides which side(s) render. */
  showAdds: boolean;
  showDels: boolean;
  adds: number;
  dels: number;
  addsLabel: string;
  delsLabel: string;
  /** A binary entry carries no line tally; the row shows a "binary" tag instead
   *  (distinct from an untracked entry, which simply has no tallies). */
  showBinary: boolean;
  binaryLabel: string;
  binaryClassName: string;
  rowClassName: string;
  labelClassName: string;
  diffClassName: string;
  addsClassName: string;
  delsClassName: string;
}

export interface GitChangeGroupView {
  id: GitChangeBucket;
  /** Title-case label; the SectionLabel eyebrow renders it uppercase. */
  label: string;
  ariaLabel: string;
  count: number;
  rows: GitChangeRow[];
}

// Binding GitFileRow (653:1864): a flat row (no card chrome, no dot, no arrow) — the
// name rides the body role in ink, the numstat the mono meta role in the
// sacred diff hues. Deleted strikes the name and dims it to ink-muted.
const GIT_CHANGE_ROW_CLASS =
  "flex w-full items-center gap-fg-2 rounded-fg-xs py-fg-0-5 pr-fg-1 text-left transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
// The basename sizes to content but yields to the dimmed dir context when the row
// is tight (shrink, not flex-1), so both the name and its location stay legible.
const GIT_CHANGE_LABEL_CLASS = "shrink truncate text-[0.75rem] text-ink";
const GIT_CHANGE_LABEL_DELETED_CLASS =
  "shrink truncate text-[0.75rem] text-ink-muted line-through";
// The dimmed parent-dir context takes the remaining width, truncating first.
const GIT_CHANGE_DIR_CLASS = "min-w-0 flex-1 truncate text-[0.6875rem] text-ink-faint";
const GIT_CHANGE_DIFF_CLASS = "flex shrink-0 items-center gap-fg-1 font-mono text-meta";
const GIT_CHANGE_ADDS_CLASS = "shrink-0 text-diff-add";
const GIT_CHANGE_DELS_CLASS = "shrink-0 text-diff-remove";
const GIT_CHANGE_BINARY_CLASS = "shrink-0 text-meta text-ink-faint";

function gitChangeRow(file: ChangedFile, bucket: GitChangeBucket): GitChangeRow {
  const isDoc = file.vault;
  const adds = file.adds ?? 0;
  const dels = file.dels ?? 0;
  return {
    path: file.path,
    label: isDoc ? changedDocumentTitle(file.path) : fileBasename(file.path),
    dirLabel: fileDirname(file.path),
    dirClassName: GIT_CHANGE_DIR_CLASS,
    nodeId: isDoc
      ? docNodeIdFromStem(stemFromPath(file.path))
      : codeNodeIdFromPath(file.path),
    surface: isDoc ? "markdown" : "code",
    // MODIFIED shows both sides; DELETED only deletions; NEW only additions — and
    // only when the numstat side is present (binary entries carry null).
    showAdds: bucket !== "deleted" && file.adds !== null,
    showDels: bucket !== "new" && file.dels !== null,
    adds,
    dels,
    addsLabel: `${adds} added`,
    delsLabel: `${dels} removed`,
    // Binary only when numstat actually flagged it (`-\t-`); an untracked entry
    // has no numstat row and stays non-binary with no tally.
    showBinary: file.binary === true,
    binaryLabel: "binary",
    binaryClassName: GIT_CHANGE_BINARY_CLASS,
    rowClassName: GIT_CHANGE_ROW_CLASS,
    labelClassName:
      bucket === "deleted" ? GIT_CHANGE_LABEL_DELETED_CLASS : GIT_CHANGE_LABEL_CLASS,
    diffClassName: GIT_CHANGE_DIFF_CLASS,
    addsClassName: GIT_CHANGE_ADDS_CLASS,
    delsClassName: GIT_CHANGE_DELS_CLASS,
  };
}

/** Bucket every changed entry into the MODIFIED / DELETED / NEW tree groups, keeping
 *  only non-empty groups in render order. */
function deriveGitChangeGroups(files: readonly ChangedFile[]): GitChangeGroupView[] {
  const byBucket: Record<GitChangeBucket, GitChangeRow[]> = {
    staged: [],
    modified: [],
    deleted: [],
    new: [],
  };
  for (const file of files) {
    const bucket = gitChangeBucket(file.group);
    byBucket[bucket].push(gitChangeRow(file, bucket));
  }
  return GIT_CHANGE_BUCKET_ORDER.filter((bucket) => byBucket[bucket].length > 0).map(
    (bucket) => ({
      id: bucket,
      label: GIT_CHANGE_BUCKET_LABEL[bucket],
      ariaLabel: `${GIT_CHANGE_BUCKET_LABEL[bucket].toLowerCase()} changes`,
      count: byBucket[bucket].length,
      rows: byBucket[bucket],
    }),
  );
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
  noScope: boolean;
  loading: boolean;
  degraded: boolean;
  errored: boolean;
  clean: boolean;
  hasChanges: boolean;
  hasFiles: boolean;
  hasDocuments: boolean;
  files: ChangedSourceFileRow[];
  documents: ChangedDocumentRow[];
  /** The status-grouped change tree (MODIFIED / DELETED / NEW) the body renders. */
  changeGroups: GitChangeGroupView[];
  summary: ChangedFilesView["summary"];
  summaryLabels: {
    files: string;
    documents: string;
    additions: string;
    deletions: string;
  };
  loadingLabel: string;
  degradedLabel: string;
  errorTitle: string;
  retryLabel: string;
  noScopeLabel: string;
  filesSectionLabel: string;
  filesListAriaLabel: string;
  documentsSectionLabel: string;
  documentsListAriaLabel: string;
  cleanLabel: string;
  noScopeClassName: string;
  rootClassName: string;
  summaryClassName: string;
  summaryPrimaryClassName: string;
  summaryDividerClassName: string;
  summaryAdditionsClassName: string;
  summaryDeletionsClassName: string;
  loadingClassName: string;
  degradedClassName: string;
  errorRootClassName: string;
  errorTitleClassName: string;
  retryButtonClassName: string;
  sectionLabelClassName: string;
  listClassName: string;
  cleanClassName: string;
  retry: () => void;
}

function pluralLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function changedSummaryLabels(
  summary: ChangedFilesView["summary"],
): ChangesOverviewView["summaryLabels"] {
  return {
    files: pluralLabel(summary.files, "file"),
    documents: pluralLabel(summary.documents, "document"),
    additions: `+${summary.additions}`,
    deletions: `−${summary.deletions}`,
  };
}

const CHANGES_OVERVIEW_NO_SCOPE_CLASS = "text-label text-ink-faint";
const CHANGES_OVERVIEW_ROOT_CLASS = "space-y-fg-3 text-label";
const CHANGES_OVERVIEW_SUMMARY_CLASS = "flex flex-wrap items-center gap-fg-1-5";
// Binding GitStatusPill `git-head` (642:1721): "N files · M documents" rides the
// label role in ink/muted; the diff tallies read the meta role in the sacred hues.
const CHANGES_OVERVIEW_SUMMARY_PRIMARY_CLASS = "text-label font-medium text-ink-muted";
const CHANGES_OVERVIEW_SUMMARY_DIVIDER_CLASS = "text-ink-faint";
const CHANGES_OVERVIEW_SUMMARY_ADDITIONS_CLASS = "text-meta text-diff-add";
const CHANGES_OVERVIEW_SUMMARY_DELETIONS_CLASS = "text-meta text-diff-remove";
const CHANGES_OVERVIEW_LOADING_CLASS =
  "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none";
const CHANGES_OVERVIEW_DEGRADED_CLASS =
  "rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted";
const CHANGES_OVERVIEW_ERROR_ROOT_CLASS = "flex items-center gap-fg-2";
const CHANGES_OVERVIEW_ERROR_TITLE_CLASS = "flex-1 text-label text-state-broken";
const CHANGES_OVERVIEW_RETRY_BUTTON_CLASS =
  "rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const CHANGES_OVERVIEW_SECTION_LABEL_CLASS = "mb-fg-1";
const CHANGES_OVERVIEW_LIST_CLASS = "space-y-fg-1";
const CHANGES_OVERVIEW_CLEAN_CLASS = "text-label text-ink-faint";

export function deriveChangesOverviewView(
  git: GitStatusHookView,
  changed: ChangedFilesView,
  scope: string | null | undefined = undefined,
): ChangesOverviewView {
  const gitAvailable = git.git !== undefined;
  const summary = gitAvailable ? changed.summary : EMPTY_CHANGED_FILES_SUMMARY;
  const hasChanges = gitAvailable && summary.total > 0;
  const files = gitAvailable ? changed.codeFiles.map(changedFileRow) : [];
  const documents = gitAvailable ? changed.documents.map(changedDocumentRow) : [];
  const changeGroups = gitAvailable ? deriveGitChangeGroups(changed.files) : [];
  return {
    noScope: scope === null,
    loading: (git.loading || changed.loading) && !hasChanges,
    degraded: git.degraded && !hasChanges,
    errored: (git.errored || changed.errored) && !hasChanges,
    clean:
      scope !== null && gitAvailable && !git.loading && !changed.loading && !hasChanges,
    hasChanges,
    hasFiles: files.length > 0,
    hasDocuments: documents.length > 0,
    files,
    documents,
    changeGroups,
    summary,
    summaryLabels: changedSummaryLabels(summary),
    loadingLabel: "reading changes…",
    degradedLabel: "repository state unavailable",
    errorTitle: "changes unavailable",
    retryLabel: "retry",
    noScopeLabel: "No worktree selected — pick one in the left rail first.",
    filesSectionLabel: "Changed files — open diff or source",
    filesListAriaLabel: "changed files",
    documentsSectionLabel: "Changed documents — open reader",
    documentsListAriaLabel: "changed documents",
    cleanLabel: "working tree clean — no changes to review.",
    noScopeClassName: CHANGES_OVERVIEW_NO_SCOPE_CLASS,
    rootClassName: CHANGES_OVERVIEW_ROOT_CLASS,
    summaryClassName: CHANGES_OVERVIEW_SUMMARY_CLASS,
    summaryPrimaryClassName: CHANGES_OVERVIEW_SUMMARY_PRIMARY_CLASS,
    summaryDividerClassName: CHANGES_OVERVIEW_SUMMARY_DIVIDER_CLASS,
    summaryAdditionsClassName: CHANGES_OVERVIEW_SUMMARY_ADDITIONS_CLASS,
    summaryDeletionsClassName: CHANGES_OVERVIEW_SUMMARY_DELETIONS_CLASS,
    loadingClassName: CHANGES_OVERVIEW_LOADING_CLASS,
    degradedClassName: CHANGES_OVERVIEW_DEGRADED_CLASS,
    errorRootClassName: CHANGES_OVERVIEW_ERROR_ROOT_CLASS,
    errorTitleClassName: CHANGES_OVERVIEW_ERROR_TITLE_CLASS,
    retryButtonClassName: CHANGES_OVERVIEW_RETRY_BUTTON_CLASS,
    sectionLabelClassName: CHANGES_OVERVIEW_SECTION_LABEL_CLASS,
    listClassName: CHANGES_OVERVIEW_LIST_CLASS,
    cleanClassName: CHANGES_OVERVIEW_CLEAN_CLASS,
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
  scope: unknown,
  git: Pick<GitStatusHookView, "git">,
): ChangedFilesView {
  const normalizedScope = normalizeGitDiffArg(scope);
  const enabled =
    normalizedScope !== null && CHANGED_FILES_LIST_SERVED && git.git !== undefined;
  const query = useQuery({
    queryKey: engineKeys.gitChanges(normalizedScope ?? ""),
    queryFn: async () => {
      const [status, numstat] = await Promise.all([
        engineClient.opsGit("status", { scope: normalizedScope! }),
        engineClient.opsGit("numstat", { scope: normalizedScope! }),
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

export function useChangedFiles(scope: unknown): ChangedFilesView {
  const git = useGitStatus();
  return useChangedFilesForGit(scope, git);
}

export function useChangesOverview(scope: unknown): ChangesOverviewView {
  const git = useGitStatus();
  const normalizedScope = normalizeGitDiffArg(scope);
  const changed = useChangedFilesForGit(normalizedScope, git);
  return deriveChangesOverviewView(git, changed, normalizedScope);
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

function parseGitOpDiff(
  op: GitOpResponse,
  path: string,
  status?: unknown,
): GitFileDiff {
  const diff = parseUnifiedDiff(op.output, path, status);
  if (op.truncated === undefined || diff.truncated !== undefined) return diff;
  return {
    ...diff,
    truncated: {
      total_hunks: diff.hunks.length,
      returned_hunks: diff.hunks.length,
      reason: op.truncated.reason,
    },
  };
}

export interface NormalizedGitDiffRequest {
  scope: string | null;
  path: string | null;
  from: string | null;
  to: string | null;
}

function normalizeGitDiffArg(value: unknown): string | null {
  const normalized = normalizeGitQueryKeyPart(value);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Canonicalize git diff selector inputs at the stores boundary before they become
 * query keys or `/ops/git` arguments. Blank presentation state disables the read;
 * non-blank values use one trimmed identity for cache and wire.
 */
export function normalizeGitDiffRequest(
  scope: unknown,
  path: unknown,
  from: unknown = null,
  to: unknown = null,
): NormalizedGitDiffRequest {
  return {
    scope: normalizeGitDiffArg(scope),
    path: normalizeGitDiffArg(path),
    from: normalizeGitDiffArg(from),
    to: normalizeGitDiffArg(to),
  };
}

export function canReadGitFileDiff(
  scope: unknown,
  path: unknown,
  git: Pick<GitStatusHookView, "git">,
): boolean {
  const request = normalizeGitDiffRequest(scope, path);
  return (
    request.scope !== null &&
    request.path !== null &&
    GIT_DIFF_CAPABILITY_SERVED &&
    git.git !== undefined
  );
}

export function canReadGitHistoricalFileDiff(
  scope: unknown,
  path: unknown,
  from: unknown,
  to: unknown,
  git: Pick<GitStatusHookView, "git">,
): boolean {
  const request = normalizeGitDiffRequest(scope, path, from, to);
  return (
    canReadGitFileDiff(request.scope, request.path, git) &&
    request.from !== null &&
    request.to !== null
  );
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
  scope: unknown,
  path: unknown,
  status?: unknown,
): GitFileDiffView {
  const git = useGitStatus();
  const request = normalizeGitDiffRequest(scope, path);
  const enabled = canReadGitFileDiff(request.scope, request.path, git);
  const query = useQuery({
    queryKey: engineKeys.gitDiff(request.scope ?? "", request.path ?? ""),
    queryFn: async () => {
      const scoped = request.scope!;
      const gitPath = request.path!;
      const op = await engineClient.opsGit("diff", {
        scope: scoped,
        path: gitPath,
      });
      return parseGitOpDiff(op, gitPath, status);
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
  scope: unknown,
  path: unknown,
  from: unknown,
  to: unknown,
  status?: unknown,
): GitFileDiffView {
  const git = useGitStatus();
  const request = normalizeGitDiffRequest(scope, path, from, to);
  const enabled = canReadGitHistoricalFileDiff(
    request.scope,
    request.path,
    request.from,
    request.to,
    git,
  );
  const query = useQuery({
    queryKey: engineKeys.gitHistoricalDiff(
      request.scope ?? "",
      request.path ?? "",
      request.from ?? "",
      request.to ?? "",
    ),
    queryFn: async () => {
      const scoped = request.scope!;
      const gitPath = request.path!;
      const fromRev = request.from!;
      const toRev = request.to!;
      const op = await engineClient.opsGit("histdiff", {
        scope: scoped,
        path: gitPath,
        from: fromRev,
        to: toRev,
      });
      return parseGitOpDiff(op, gitPath, status);
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
/** Per-SSE-frame byte ceiling (bounded-by-default, hardening G5): real delta/event
 *  frames are small; a frame whose accumulated `data:` exceeds this is a runaway or
 *  hostile payload — stop accumulating and DROP it rather than buffer + `JSON.parse`
 *  a multi-megabyte string (a client memory-exhaustion path). Generous vs any real
 *  frame so it only fires on a runaway. */
export const MAX_SSE_FRAME_BYTES = 2 * 1024 * 1024;

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
      else if (line.startsWith("data:")) {
        data += line.slice(5).trim();
        if (data.length > MAX_SSE_FRAME_BYTES) break;
      }
    }
    // Drop an empty frame, or a runaway one over the byte ceiling (never parse it).
    if (data.length === 0 || data.length > MAX_SSE_FRAME_BYTES) continue;
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

export const ENGINE_STREAM_CHANNELS = ["backends", "git", "graph"] as const;
export type EngineStreamChannel = (typeof ENGINE_STREAM_CHANNELS)[number];

export interface EngineStreamIdentity {
  channels: EngineStreamChannel[];
  since: number | undefined;
  scope: string | undefined;
}

export function normalizeEngineStreamChannel(
  channel: unknown,
): EngineStreamChannel | null {
  if (typeof channel !== "string") return null;
  const normalized = channel.trim();
  return (ENGINE_STREAM_CHANNELS as readonly string[]).includes(normalized)
    ? (normalized as EngineStreamChannel)
    : null;
}

export function normalizeEngineStreamChannels(
  channels: readonly unknown[],
): EngineStreamChannel[] {
  const requested = new Set<EngineStreamChannel>();
  for (const channel of channels) {
    const normalized = normalizeEngineStreamChannel(channel);
    if (normalized !== null) requested.add(normalized);
  }
  return ENGINE_STREAM_CHANNELS.filter((channel) => requested.has(channel));
}

export function normalizeEngineStreamSince(since: unknown): number | undefined {
  return typeof since === "number" && Number.isFinite(since) && since >= 0
    ? Math.trunc(since)
    : undefined;
}

export function normalizeEngineStreamScope(scope: unknown): string | undefined {
  return normalizeGitDiffArg(scope) ?? undefined;
}

export function normalizeEngineStreamIdentity(
  channels: readonly unknown[],
  since?: unknown,
  scope?: unknown,
): EngineStreamIdentity {
  return {
    channels: normalizeEngineStreamChannels(channels),
    since: normalizeEngineStreamSince(since),
    scope: normalizeEngineStreamScope(scope),
  };
}

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
  channels: readonly unknown[],
  since?: unknown,
  scope?: unknown,
) {
  const identity = normalizeEngineStreamIdentity(channels, since, scope);
  return queryOptions({
    // The resume point is identity-bearing: two `since` offsets carry
    // different delta windows and must not collide on one cache entry
    // (adversarial finding stream-01), mirroring how `graph` folds as-of.
    // Scope joins the key for the same reason (per-scope clock, W02.P04.S14).
    queryKey: engineKeys.stream(identity.channels, identity.since, identity.scope),
    queryFn: streamedQuery({
      streamFn: async (context) =>
        sseChunks(
          await engineClient.openStream(
            [...identity.channels],
            identity.since,
            context.signal,
            identity.scope,
          ),
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
  channels: readonly unknown[],
  since?: unknown,
  scope?: unknown,
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
/** Grace before a hidden tab pauses the backend-signal stream
 *  (universal-data-loading ADR D4): long enough that tab-switching never
 *  churns the EventSource, short enough that a parked tab stops holding a
 *  connection open. */
export const BACKEND_SIGNAL_HIDDEN_PAUSE_MS = 60_000;

/**
 * True once the document has stayed hidden past the grace window; flips back
 * false the moment it is visible again. SSR/test-safe: no `document` means
 * never paused.
 */
export function useDocumentHiddenPause(
  graceMs: number = BACKEND_SIGNAL_HIDDEN_PAUSE_MS,
): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      if (document.hidden) {
        timer ??= setTimeout(() => setPaused(true), graceMs);
      } else {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        setPaused(false);
      }
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", apply);
    };
  }, [graceMs]);
  return paused;
}

/**
 * Hidden-tab pause (universal-data-loading ADR D4): when the tab stays hidden
 * past the grace, the subscription disables AND the in-flight stream is
 * cancelled (closing the EventSource — `enabled: false` alone would leave it
 * open, and cancelling alone would let `retry` reconnect). On return the
 * stream key is invalidated so the re-enabled observer reopens the
 * EventSource and re-snapshots — the pause gap is a designed resume, never a
 * lost-stream degradation (these channels are unanchored; every reconnect
 * re-serves current state). The `graph` delta channel is untouched: it is
 * mount-gated in Stage and seq-anchored.
 */
const BACKEND_SIGNAL_STREAM_KEY = engineKeys.stream(
  BACKEND_SIGNAL_CHANNELS,
  undefined,
  undefined,
);

export function useBackendSignalStream() {
  const paused = useDocumentHiddenPause();
  const queryClient = useQueryClient();
  const wasPausedRef = useRef(false);
  useEffect(() => {
    if (paused) {
      wasPausedRef.current = true;
      void queryClient.cancelQueries({ queryKey: BACKEND_SIGNAL_STREAM_KEY });
      return;
    }
    if (!wasPausedRef.current) return;
    wasPausedRef.current = false;
    // Resume: staleTime Infinity would otherwise keep the held (now gapped)
    // accumulator fresh forever; invalidating refetches the ACTIVE re-enabled
    // observer, reopening the stream for a fresh snapshot.
    void queryClient.invalidateQueries({ queryKey: BACKEND_SIGNAL_STREAM_KEY });
  }, [paused, queryClient]);
  return useQuery({
    ...engineStreamOptions(BACKEND_SIGNAL_CHANNELS),
    enabled: !paused,
  });
}

export type BackendSignalChannel = (typeof BACKEND_SIGNAL_CHANNELS)[number];

export function normalizeBackendSignalChannel(
  channel: unknown,
): BackendSignalChannel | null {
  const normalized = normalizeEngineStreamChannel(channel);
  return normalized === "backends" || normalized === "git" ? normalized : null;
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
    const channel = normalizeBackendSignalChannel(chunk.channel);
    if (channel === "backends" && backends === undefined) {
      backends = stableKey(chunk.data);
    } else if (channel === "git" && git === undefined) {
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
