// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  DEFAULT_SALIENCE_LENS,
  engineClient,
  type GraphCorpus,
  type GraphFilter,
  type SalienceLens,
} from "../engine";
import { queryClient as defaultQueryClient } from "../queryClient";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

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
  // The add-project OS folder picker (single-app-runtime ADR O6): keyed on the
  // browsed directory alone — this read is NOT project/scope-bound (it browses
  // the machine to find a folder to register), so no scope segment folds in.
  // Omitted `path` is the filesystem-roots level; each distinct directory is its
  // own bounded cache entry.
  fsList: (path?: string) => [...engineKeys.all, "fs-list", path ?? ""] as const,
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
  // The engine-reduced fold-header rollup (changes-summary-projection): a LIGHT
  // per-scope read the collapsed "Changes" header consumes so a cold load never
  // ships the full status+numstat text. Distinct prefix from `git-changes` so the
  // header summary and the expanded list evict/refresh as one family on a git SSE
  // frame (both enrolled below) without sharing a cache entry.
  gitChangesSummary: (scope: unknown) =>
    [
      ...engineKeys.all,
      "git-changes-summary",
      normalizeGitQueryKeyPart(scope),
    ] as const,
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
  "git-changes-summary",
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

export function withManualRetry<T extends { refetch: () => unknown }>(
  query: T,
): T & { retry: () => void } {
  return {
    ...query,
    retry: () => {
      void query.refetch();
    },
  };
}

export const noopRetry = () => undefined;

// --- shared git-query + stream-identity primitives (base module; no sibling deps) ---

export function normalizeGitDiffArg(value: unknown): string | null {
  const normalized = normalizeGitQueryKeyPart(value);
  return normalized.length > 0 ? normalized : null;
}

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
