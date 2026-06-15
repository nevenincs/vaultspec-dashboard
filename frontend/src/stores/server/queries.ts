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
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import type { SalienceLens } from "../view/salienceLens";
import { DEFAULT_SALIENCE_LENS, useSalienceLensStore } from "../view/salienceLens";
import type {
  DiscoverResponse,
  EngineEdge,
  EngineStatus,
  GitFileDiff,
  GraphFilter,
  GraphSlice,
  InteriorStep,
  PipelineArtifact,
  PlanInterior,
  SessionUpdate,
  SettingUpdate,
  TiersBlock,
  WorkspaceRoot,
} from "./engine";
import { EngineError, engineClient, useEngineStatus } from "./engine";
import { useViewStore } from "../view/viewStore";

// --- stable serialization for key parts -----------------------------------------

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
  node: (id: string) => [...engineKeys.all, "node", id] as const,
  neighbors: (id: string, depth: number) =>
    [...engineKeys.all, "neighbors", id, depth] as const,
  evidence: (id: string) => [...engineKeys.all, "evidence", id] as const,
  discover: (id: string) => [...engineKeys.all, "discover", id] as const,
  events: (scope: string, range: { from?: string; to?: string }, bucket?: string) =>
    [...engineKeys.all, "events", scope, stableKey(range), bucket ?? "raw"] as const,
  search: (query: string, target?: string) =>
    [...engineKeys.all, "search", target ?? "vault", query] as const,
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
  diff: (scope: string, from: string | number, to: string | number) =>
    [...engineKeys.all, "diff", scope, String(from), String(to)] as const,
  // The bounded temporal-lineage projection (dashboard-timeline W02.P04.S22):
  // keyed by (scope, range, filter) — the contract's cacheability unit (range +
  // the engine-owned filter), so two date ranges or two filters never collide on
  // one cache entry, mirroring how `events` folds (range, bucket). `filter` is
  // the URL-encoded JSON filter string the route accepts; absent = no constraint.
  lineage: (scope: string, range: { from?: string; to?: string }, filter?: string) =>
    [...engineKeys.all, "lineage", scope, stableKey(range), filter ?? ""] as const,
  // The in-flight pipeline projection (dashboard-pipeline-status W01.P02.S06):
  // (scope, as-of) — the same cacheability unit the graph slice uses, so a
  // historical playhead reads a distinct cache entry from the live view.
  pipeline: (scope: string, asOf?: string | number) =>
    [...engineKeys.all, "pipeline", scope, asOf ?? "live"] as const,
  // The bounded plan-container interior (dashboard-pipeline-status W01.P02.S07):
  // keyed by the plan node id alone — lazily fetched only when a plan row expands.
  planInterior: (id: string) => [...engineKeys.all, "plan-interior", id] as const,
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
};

// --- read hooks --------------------------------------------------------------------

export function useWorkspaceMap() {
  return useQuery({
    queryKey: engineKeys.map(),
    queryFn: () => engineClient.map(),
    // Poll every 8 s while in error state (engine not yet running / token
    // not yet on disk) so the WorktreePicker self-heals after startup without
    // requiring a page reload (task-7 live-engine resilience).
    refetchInterval: (query) => (query.state.status === "error" ? 8_000 : false),
  });
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
export interface WorkspaceMapAvailability {
  degraded: boolean;
  /** Names of the tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

const WORKSPACE_MAP_TIERS = ["structural"] as const;

export function deriveWorkspaceMapAvailability(
  tiers: TiersBlock | undefined,
): WorkspaceMapAvailability {
  // A wholly absent block (a genuine transport fault with no envelope) is NOT
  // treated as degraded here — that is the query's error state, which the
  // switcher renders distinctly. Degradation is reported only from a block the
  // engine actually served.
  if (!tiers) return { degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of WORKSPACE_MAP_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/** Stores hook: the workspace map's degradation, read through the wire client so
 *  the worktree switcher consumes derived truth instead of the raw `tiers`
 *  block. Mirrors `useVaultTreeAvailability`. */
export function useWorkspaceMapAvailability(): WorkspaceMapAvailability {
  const map = useWorkspaceMap();
  const fromData = map.data?.tiers;
  const fromError = map.error instanceof EngineError ? map.error.tiers : undefined;
  return deriveWorkspaceMapAvailability(fromData ?? fromError);
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
export interface WorkspacesAvailability {
  degraded: boolean;
  degradedTiers: string[];
  reasons: Record<string, string>;
}

const WORKSPACES_TIERS = ["structural"] as const;

export function deriveWorkspacesAvailability(
  tiers: TiersBlock | undefined,
): WorkspacesAvailability {
  if (!tiers) return { degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of WORKSPACES_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/** Stores hook: the workspace registry's degradation, read through the wire
 *  client so the picker consumes derived truth instead of the raw `tiers`
 *  block. */
export function useWorkspacesAvailability(): WorkspacesAvailability {
  const workspaces = useWorkspaces();
  const fromData = workspaces.data?.tiers;
  const fromError =
    workspaces.error instanceof EngineError ? workspaces.error.tiers : undefined;
  return deriveWorkspacesAvailability(fromData ?? fromError);
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
 * 1. `swapWorkspace` (the view store) runs the full 022 cross-store reset
 *    WIDENED to re-key the pin/lens stores to the NEW workspace.
 * 2. The cached worktree SET is cleared: the `/map`, `/vault-tree`, and
 *    `/workspaces` React-Query caches are removed so the next reads are keyed to
 *    the new workspace (the prior project's worktree set must not survive — the
 *    "widen to also clear the cached worktree set" requirement).
 * 3. The active-workspace selection is durably persisted via `usePutSession`
 *    (the config surface). A rejected switch (unknown workspace → tiered 400)
 *    rejects the mutation; the caller surfaces it as a non-silent status line.
 *
 * Returns a `swap(workspace, scope)` callback plus the mutation handle so the
 * control can render pending / error honestly.
 */
export function useSwapWorkspace() {
  const queryClient = useQueryClient();
  const putSession = usePutSession();
  const swap = (workspace: string, scope: string | null) => {
    // (1) the widened view-store reset, applied synchronously so the UI moves
    // immediately (optimistic, like setScope).
    useViewStore.getState().swapWorkspace(workspace, scope);
    // (2) clear the cached worktree set + scoped reads so nothing from the prior
    // project survives in the query cache. removeQueries drops the entries
    // entirely (vs invalidate, which would refetch the STALE-keyed read first).
    queryClient.removeQueries({ queryKey: engineKeys.map() });
    queryClient.removeQueries({ queryKey: [...engineKeys.all, "vault-tree"] });
    // The prior project's lazily-fetched code-tree levels must not survive the
    // swap either (dashboard-code-tree per-scope cache): drop the whole subtree.
    queryClient.removeQueries({ queryKey: [...engineKeys.all, "file-tree"] });
    queryClient.removeQueries({ queryKey: [...engineKeys.all, "graph"] });
    // (3) durably persist the active-workspace selection AND the new active
    // scope (the new project's default worktree) in one config write. Persisting
    // the workspace alone left the served/persisted active_scope dangling on the
    // prior project's worktree, so the browser kept showing the old corpus after
    // a switch (live verification finding H4). Sending the scope keeps the server
    // session consistent with the optimistic local swap above.
    return putSession
      .mutateAsync(
        scope
          ? { active_workspace: workspace, active_scope: scope }
          : { active_workspace: workspace },
      )
      .then((res) => {
        // The PUT builds/warms the new scope server-side. The optimistic scope
        // change above already fired the scoped reads (map / vault-tree /
        // file-tree / graph) against a still-COLD scope, which validate_scope
        // 400s until the build completes — so without a refetch here the rail
        // stays empty after a switch until a manual reload (live verification
        // finding H6). Re-fetch now that the scope is warm so the switch lands
        // its corpus in-session.
        queryClient.invalidateQueries({ queryKey: engineKeys.map() });
        queryClient.invalidateQueries({ queryKey: [...engineKeys.all, "vault-tree"] });
        queryClient.invalidateQueries({ queryKey: [...engineKeys.all, "file-tree"] });
        queryClient.invalidateQueries({ queryKey: [...engineKeys.all, "graph"] });
        return res;
      });
  };
  return { swap, mutation: putSession };
}

export function useVaultTree(scope: string | null) {
  return useQuery({
    queryKey: engineKeys.vaultTree(scope ?? ""),
    queryFn: () => engineClient.vaultTree(scope!),
    enabled: scope !== null,
  });
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
export interface VaultTreeAvailability {
  degraded: boolean;
  /** Names of the tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

const VAULT_TREE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;

export function deriveVaultTreeAvailability(
  tiers: TiersBlock | undefined,
): VaultTreeAvailability {
  // A wholly absent block (a genuine transport fault with no envelope) is NOT
  // treated as every-tier-degraded here — that is the query's error state, which
  // the sidebar renders distinctly. Degradation is reported only from a block
  // the engine actually served.
  if (!tiers) return { degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of VAULT_TREE_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/** Stores hook: the vault-tree degradation, read through the wire client so the
 *  sidebar consumes derived truth instead of the raw `tiers` block. */
export function useVaultTreeAvailability(scope: string | null): VaultTreeAvailability {
  const tree = useVaultTree(scope);
  const fromData = tree.data?.tiers;
  const fromError = tree.error instanceof EngineError ? tree.error.tiers : undefined;
  return deriveVaultTreeAvailability(fromData ?? fromError);
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
  return useQuery({
    queryKey: engineKeys.fileTree(scope ?? "", path),
    queryFn: () => engineClient.fileTree({ scope: scope!, path }),
    enabled: scope !== null && enabled,
  });
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
export interface FileTreeAvailability {
  degraded: boolean;
  /** Names of the tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

const FILE_TREE_TIERS = ["structural"] as const;

export function deriveFileTreeAvailability(
  tiers: TiersBlock | undefined,
): FileTreeAvailability {
  // A wholly absent block (a genuine transport fault with no envelope) is NOT
  // treated as degraded here — that is the query's error state, which the code
  // mode renders distinctly. Degradation is reported only from a block the engine
  // actually served.
  if (!tiers) return { degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of FILE_TREE_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/** Stores hook: the file-tree degradation for the worktree ROOT level, read
 *  through the wire client so the code mode consumes derived truth instead of the
 *  raw `tiers` block. The root level's tiers gate the whole code mode (a
 *  worktree-only capability); per-directory expansions inherit that availability. */
export function useFileTreeAvailability(scope: string | null): FileTreeAvailability {
  const tree = useFileTree(scope);
  const fromData = tree.data?.tiers;
  const fromError = tree.error instanceof EngineError ? tree.error.tiers : undefined;
  return deriveFileTreeAvailability(fromData ?? fromError);
}

export function useFiltersVocabulary(scope: string | null) {
  return useQuery({
    queryKey: engineKeys.filters(scope ?? ""),
    queryFn: () => engineClient.filters(scope!),
    enabled: scope !== null,
  });
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
 * The active-lens graph slice (graph-node-salience W04.P09): reads the active
 * salience lens + focus from the stores view layer (`useSalienceLensStore`) and
 * parameterizes the graph query by them, so a lens switch or focus change is a
 * re-query keyed on (lens, focus). This is the seam the scene consumes for the
 * salience-ranked node set; the chrome lens selector drives `setLens`/`setFocus`
 * on the store and never fetches the engine itself (dashboard-layer-ownership).
 */
export function useSalienceGraphSlice(
  scope: string | null,
  filter?: GraphFilter,
  asOf?: string | number,
  granularity?: "document" | "feature",
) {
  const lens = useSalienceLensStore((s) => s.lens);
  const focus = useSalienceLensStore((s) => s.focus);
  return useGraphSlice(scope, filter, asOf, granularity, lens, focus);
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

const SALIENCE_SLICE_TIERS = [
  "declared",
  "structural",
  "temporal",
  "semantic",
] as const;

/**
 * Derive the salience slice view from the served data + error + in-flight state.
 * Degradation is read from the `tiers` block (success data, or the error
 * envelope's tiers, with FRESH error tiers winning over a stale held-success
 * block — degradation-is-read-from-tiers), and `partial` honors the engine's
 * own `salience_partial` flag OR a degraded tier in that block. A wholly absent
 * block (a bare transport fault) is NOT treated as degraded here — that is the
 * query's error state, which the scene renders distinctly.
 */
export function deriveSalienceSliceView(
  lens: SalienceLens,
  data: GraphSlice | undefined,
  error: unknown,
  loading: boolean,
): SalienceSliceView {
  // Fresh error tiers win over a stale held-success block (the rule's ordering):
  // when the latest request errored with a tiers-bearing envelope, that error's
  // tiers are the freshest availability truth.
  const errTiers = error instanceof EngineError ? error.tiers : undefined;
  const tiers = errTiers ?? data?.tiers;
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  if (tiers) {
    for (const tier of SALIENCE_SLICE_TIERS) {
      const state = tiers[tier];
      if (state === undefined || state.available === false) {
        degradedTiers.push(tier);
        if (state?.reason) reasons[tier] = state.reason;
      }
    }
  }
  // Partial: the engine's explicit flag, OR a degraded tier in the served block.
  // Never inferred from a bare transport error (no tiers => not partial here).
  const partial = data?.salience_partial === true || degradedTiers.length > 0;
  return { lens: data?.lens ?? lens, loading, partial, degradedTiers, reasons };
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
  const lens = useSalienceLensStore((s) => s.lens);
  const slice = useSalienceGraphSlice(scope, filter, asOf, granularity);
  // isFetching covers a focus-change/lens-switch re-query while held data is
  // shown; isPending is the initial fetch. Either is a loading state for the
  // scene on a focus change.
  const loading = scope !== null && (slice.isPending || slice.isFetching);
  return deriveSalienceSliceView(lens, slice.data, slice.error, loading);
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
export interface GraphSliceAvailability {
  /** The slice query is in flight (no held data yet). */
  loading: boolean;
  /** A served tiers block reports at least one tier unavailable/absent. */
  degraded: boolean;
  /** Names of the tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

const GRAPH_SLICE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;

export function deriveGraphSliceAvailability(
  tiers: TiersBlock | undefined,
  loading: boolean,
): GraphSliceAvailability {
  // A wholly absent block (a genuine transport fault with no envelope) is NOT
  // treated as every-tier-degraded — that is the query's error state, distinct
  // from served degradation. Degradation is reported only from a block the
  // engine actually served (success data or a tiers-bearing error envelope).
  if (!tiers) return { loading, degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of GRAPH_SLICE_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { loading, degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/**
 * Stores hook: the graph slice's loading + degradation truth for the active
 * scope and granularity, read through the wire client so the nav toolbar
 * consumes derived truth instead of the raw `tiers` block. Mirrors
 * `useVaultTreeAvailability`. The toolbar passes the same (scope, granularity)
 * it renders so the descent reflects the slice it is steering.
 */
export function useGraphSliceAvailability(
  scope: string | null,
  granularity?: "document" | "feature",
): GraphSliceAvailability {
  const slice = useGraphSlice(scope, undefined, undefined, granularity);
  const fromData = slice.data?.tiers;
  const fromError = slice.error instanceof EngineError ? slice.error.tiers : undefined;
  return deriveGraphSliceAvailability(
    fromData ?? fromError,
    scope !== null && slice.isPending,
  );
}

export function useNodeDetail(id: string | null) {
  return useQuery({
    queryKey: engineKeys.node(id ?? ""),
    queryFn: () => engineClient.node(id!),
    enabled: id !== null,
  });
}

export function useNodeNeighbors(id: string | null, depth = 1) {
  return useQuery({
    queryKey: engineKeys.neighbors(id ?? "", depth),
    queryFn: () => engineClient.nodeNeighbors(id!, { depth }),
    enabled: id !== null,
  });
}

/**
 * Bulk ego-network fetch for the stage's working set (layer-ownership, F-H1):
 * one neighbors query per id, fanned out through `useQueries`, so the app/scene
 * layers never call the engine client directly - the stores layer stays the sole
 * wire client. Mirrors `useNodeNeighbors`'s per-id key + shape; returns the query
 * results array so the caller reads each `.data` / `.dataUpdatedAt`.
 */
export function useNodeNeighborsBulk(ids: readonly string[], depth = 1) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: engineKeys.neighbors(id, depth),
      queryFn: () => engineClient.nodeNeighbors(id, { depth }),
    })),
  });
}

export function useNodeEvidence(id: string | null) {
  return useQuery({
    queryKey: engineKeys.evidence(id ?? ""),
    queryFn: () => engineClient.nodeEvidence(id!),
    enabled: id !== null,
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
export function useDiscover(nodeId: string | null): DiscoverView {
  const enabled = nodeId !== null;
  const query = useQuery({
    queryKey: engineKeys.discover(nodeId ?? ""),
    queryFn: () => engineClient.discover(nodeId!),
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
) {
  return useQuery({
    queryKey: engineKeys.lineage(scope ?? "", range, filter),
    queryFn: () => engineClient.lineage({ scope: scope!, ...range, filter }),
    enabled: scope !== null,
  });
}

/**
 * Graph diff between two timestamps (§5 /graph/diff). Returns the set of
 * add/remove/change operations on nodes and edges between `from` and `to`
 * (millisecond timestamps or ISO strings). Disabled when scope is null or
 * the window is empty (from === to). Cache keys fold both endpoints so two
 * windows never collide (mirrors engineKeys.graph folding as-of).
 */
export function useGraphDiff(
  scope: string | null,
  from: string | number,
  to: string | number,
  filter?: string,
) {
  return useQuery({
    queryKey: engineKeys.diff(scope ?? "", from, to),
    queryFn: () => engineClient.graphDiff({ scope: scope!, from, to, filter }),
    enabled: scope !== null && String(from) !== String(to),
  });
}

export function useEngineSearch(query: string, target: "vault" | "code" = "vault") {
  return useQuery({
    queryKey: engineKeys.search(query, target),
    queryFn: () => engineClient.search({ query, target }),
    enabled: query.length > 0,
  });
}

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
  });
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
      queryClient.setQueryData(engineKeys.session(), session);
      void queryClient.invalidateQueries({ queryKey: engineKeys.session() });
      // A session mutation may carry a registry mutation (select/add/forget a
      // workspace, dashboard-workspace-registry ADR), so refresh the registry
      // enumeration too — the picker re-reads the authoritative roots + active
      // marker without a separate mutation hook.
      void queryClient.invalidateQueries({ queryKey: engineKeys.workspaces() });
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
// ENGINE-BLOCKED CAPABILITIES (NOT served by the live wire, signaled by constants,
// never faked as tiers): the per-file CHANGED-FILES LIST (live `dirty` is a single
// boolean) and the per-file DIFF BODY (the live ops whitelist is only
// `/ops/core/*` and `/ops/rag/*`; there is no `/ops/git/*` route, and
// engine-read-and-infer forbids inventing one here). Both surface as honest
// engine-blocked states; the richer shapes are a documented forward proposal.

/** The per-file changed-files list is not served by the live engine. */
export const CHANGED_FILES_LIST_SERVED = false;
/** The read-only diff body is not served by the live engine. */
export const GIT_DIFF_CAPABILITY_SERVED = false;

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
   * AND dirty. The PER-FILE list is engine-blocked — consumers render the dirty
   * truth as a single honest "changes present, per-file detail pending" state.
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
  const tiers = data?.tiers ?? (error instanceof EngineError ? error.tiers : undefined);
  const tier = tiers?.[RAG_TIER];
  const degraded = tier !== undefined && tier.available === false;
  const reason = degraded ? tier?.reason : undefined;

  if (data?.rag) {
    const rag = data.rag;
    const running = rag.service === "running";
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
  if (!tiers) return { degraded: false, items: [] };
  const state = tiers[WORK_PILLAR_TIER];
  const degraded = state === undefined || state.available === false;
  return {
    degraded,
    reason: degraded ? state?.reason : undefined,
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
  const status = useEngineStatus();
  const fromError =
    status.error instanceof EngineError ? status.error.tiers : undefined;
  return deriveWorkPillarAvailability(fromError ?? status.data?.tiers);
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
export function usePlanInterior(planId: string | null) {
  return useQuery({
    queryKey: engineKeys.planInterior(planId ?? ""),
    queryFn: () => engineClient.planInterior(planId!),
    enabled: planId !== null,
  });
}

/**
 * The interpreted pipeline-status view the Work surface renders (W01.P02.S08). Modeled on
 * `deriveGraphSliceAvailability`: `loading` is the query's in-flight state, `degraded` is
 * read from the served `tiers` block (the `structural` tier the pipeline projection
 * resolves through), and `artifacts` is the in-flight list. The surface consumes this,
 * never `pipeline.data.tiers`.
 */
export interface PipelineStatusView {
  /** The pipeline query is in flight with no held data. */
  loading: boolean;
  /** A served tiers block reports the pipeline tier unavailable (or absent). */
  degraded: boolean;
  /** Names of the tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
  /** The in-flight artifacts (active plans + in-flight ADRs); empty while degraded. */
  artifacts: PipelineArtifact[];
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
  if (!tiers) {
    return { loading, degraded: false, degradedTiers: [], reasons: {}, artifacts };
  }
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of PIPELINE_STATUS_TIERS) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  const degraded = degradedTiers.length > 0;
  return {
    loading,
    degraded,
    degradedTiers,
    reasons,
    // While degraded the projection cannot be trusted, so do not render a stale list as
    // current in-flight work; the surface shows the degraded notice instead.
    artifacts: degraded ? [] : artifacts,
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
  const fromError = query.error instanceof EngineError ? query.error.tiers : undefined;
  const tiers = fromError ?? query.data?.tiers;
  return derivePipelineStatusView(
    tiers,
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
export function usePlanInteriorView(planId: string | null): PlanInteriorView {
  const query = usePlanInterior(planId);
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
export function classifyOpsOutcome(result: {
  ok: boolean;
  error?: unknown;
}): OpsOutcome {
  if (result.error !== undefined) {
    return result.error instanceof EngineError && result.error.tiers !== undefined
      ? "backend-down"
      : "failed";
  }
  return result.ok ? "ok" : "failed";
}

/**
 * The interpreted state of a file's read-only diff (git-diff-browser ADR).
 *
 * IMPORTANT: the live engine serves NO read-only diff — there is no `/ops/git/*`
 * route in the ops whitelist, and engine-read-and-infer forbids inventing one in
 * this UI-adoption cycle. So this hook NEVER issues a network query; it reports a
 * single honest ENGINE-BLOCKED state, and the `DiffView` chrome renders the
 * "diff unavailable — engine capability pending" message. The richer structured
 * `GitFileDiff` shape is a documented forward proposal, not a live call.
 */
export interface GitFileDiffView {
  /** The read-only diff capability is not served by the engine (always true today). */
  engineBlocked: boolean;
  /** The structured diff body when a future engine serves one; undefined today. */
  diff?: GitFileDiff;
}

/**
 * Stores selector for a changed file's read-only diff. Returns the engine-blocked
 * capability state with no network call, because the live wire serves no diff
 * endpoint. When the proposed read-only diff pass-through lands as a contract
 * amendment, this selector grows the real query behind the same shape; the
 * `DiffView` consumer is unchanged.
 */
export function useGitFileDiff(
  _scope: string | null,
  _path: string | null,
): GitFileDiffView {
  return { engineBlocked: !GIT_DIFF_CAPABILITY_SERVED };
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
