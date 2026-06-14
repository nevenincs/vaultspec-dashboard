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
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import type {
  EngineStatus,
  GitFileDiff,
  GraphFilter,
  SessionUpdate,
  SettingUpdate,
  TiersBlock,
} from "./engine";
import { EngineError, engineClient, useEngineStatus } from "./engine";

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
  vaultTree: (scope: string) => [...engineKeys.all, "vault-tree", scope] as const,
  filters: (scope: string) => [...engineKeys.all, "filters", scope] as const,
  graph: (
    scope: string,
    filter?: GraphFilter,
    asOf?: string | number,
    granularity?: "document" | "feature",
  ) =>
    [
      ...engineKeys.all,
      "graph",
      scope,
      stableKey(filter),
      asOf ?? "live",
      granularity ?? "document",
    ] as const,
  node: (id: string) => [...engineKeys.all, "node", id] as const,
  neighbors: (id: string, depth: number) =>
    [...engineKeys.all, "neighbors", id, depth] as const,
  evidence: (id: string) => [...engineKeys.all, "evidence", id] as const,
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
  // The read-only git file diff (git-diff-browser ADR) — keyed by (scope, path):
  // a worktree's diff for one changed file. Distinct from `diff` (the temporal
  // graph delta); the two are different surfaces over different data.
  gitFileDiff: (scope: string, path: string) =>
    [...engineKeys.all, "git-file-diff", scope, path] as const,
  // The session/settings surface is workspace-singular (not scope-keyed): one
  // active session and one settings document per workspace, so a single stable
  // key each. Mutations invalidate exactly these.
  session: () => [...engineKeys.all, "session"] as const,
  settings: () => [...engineKeys.all, "settings"] as const,
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
) {
  return useQuery({
    queryKey: engineKeys.graph(scope ?? "", filter, asOf, granularity),
    queryFn: () =>
      engineClient.graphQuery({ scope: scope!, filter, as_of: asOf, granularity }),
    enabled: scope !== null,
  });
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

export function useNodeEvidence(id: string | null) {
  return useQuery({
    queryKey: engineKeys.evidence(id ?? ""),
    queryFn: () => engineClient.nodeEvidence(id!),
    enabled: id !== null,
  });
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
// `/status` snapshot carries `git: { branch, ahead, behind, dirty }` plus the wire
// `tiers` block. Per the git-diff-browser ADR, when git is absent from the response
// — either no `git` object or a `git` tier reporting unavailable/absent — that is a
// DESIGNED degraded state ("no repository state"), rendered as such, never an error.

const GIT_TIER = "git";

export interface GitStatusView {
  /** The status snapshot is in flight with no held git data. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** Designed degradation: git state is unavailable (absent object or unavailable tier). */
  degraded: boolean;
  /** The engine's per-tier reason when degraded, for copy-tone rendering. */
  reason?: string;
  /** The git rollup when available; undefined while loading/degraded/errored. */
  git?: NonNullable<EngineStatus["git"]>;
}

/**
 * Derive the git working-tree view (loading / degraded / errored / available)
 * from a status query's data + error + pending flags, reading the `git` payload
 * and the `git` tier ONLY here in the stores layer so the surface consumes
 * interpreted truth, never `status.data.tiers`. A served tiers block that omits
 * `git` or marks it unavailable is degradation (contract §2: absence ≠
 * available); a tiers-less transport fault is the errored branch.
 */
export function deriveGitStatusView(
  data: EngineStatus | undefined,
  error: unknown,
  pending: boolean,
): GitStatusView {
  if (data?.git) {
    const tier = data.tiers?.[GIT_TIER];
    // A served `git` tier marked unavailable degrades even when a stale `git`
    // object lingers; an absent git tier alongside a present payload is treated
    // as available (the v1 wire does not yet emit a dedicated git tier).
    if (tier && tier.available === false) {
      return { loading: false, errored: false, degraded: true, reason: tier.reason };
    }
    return { loading: false, errored: false, degraded: false, git: data.git };
  }
  // No git payload. A tiers-bearing error envelope (backend down) is designed
  // degradation; a tiers-less fault is the errored branch; otherwise in-flight.
  const tiers = data?.tiers ?? (error instanceof EngineError ? error.tiers : undefined);
  if (tiers) {
    const tier = tiers[GIT_TIER];
    return {
      loading: false,
      errored: false,
      degraded: true,
      reason: tier?.reason,
    };
  }
  if (error) return { loading: false, errored: true, degraded: false };
  return { loading: pending, errored: false, degraded: false };
}

/**
 * Stores hook: the active worktree's git working-tree view, read through the
 * status query so the git diff browser consumes interpreted state instead of the
 * raw `tiers` block. The surface renders loading / degraded / errored / available
 * directly from this, never inspecting `status.data.tiers`.
 */
export function useGitStatus(): GitStatusView {
  const status = useEngineStatus();
  return deriveGitStatusView(status.data, status.error, status.isPending);
}

/** The interpreted state of a file's read-only diff request. */
export interface GitFileDiffView {
  /** The diff request is in flight. */
  loading: boolean;
  /** Designed degradation: the read-only diff capability is not yet served. */
  degraded: boolean;
  /** A genuine transport failure (no tiers envelope), distinct from degraded. */
  errored: boolean;
  /** The structured diff body when available. */
  diff?: GitFileDiff;
  /** Retry the diff request. */
  retry: () => void;
}

/**
 * Derive the diff view (loading / degraded / errored / available) from a diff
 * query, reading the `git` tier ONLY here in the stores layer (dashboard-layer-
 * ownership). A tiers-bearing error envelope is designed degradation — the
 * read-only diff verb is not yet served (git-diff-browser ADR: the diff body is
 * engine-blocked); a tiers-less fault is the errored branch. Returns the body
 * verbatim when the engine serves one.
 */
export function deriveGitFileDiffView(query: {
  data?: GitFileDiff;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  enabled: boolean;
  refetch: () => void;
}): GitFileDiffView {
  const retry = query.refetch;
  if (!query.enabled) return { loading: false, degraded: false, errored: false, retry };
  if (query.data) {
    return { loading: false, degraded: false, errored: false, diff: query.data, retry };
  }
  if (query.isError) {
    // A tiers-bearing error envelope is designed degradation; a tiers-less
    // transport fault is the errored branch.
    const degraded =
      query.error instanceof EngineError && query.error.tiers !== undefined;
    return { loading: false, degraded, errored: !degraded, retry };
  }
  return { loading: query.isPending, degraded: false, errored: false, retry };
}

/**
 * Stores hook: the read-only structured diff for one changed file (git-diff-
 * browser ADR), interpreted in the stores layer so the surface never reads the
 * raw `tiers` block. Keyed by (scope, path); disabled until a file is selected.
 * The diff body is a pure projection of read-only git data served verbatim
 * through the engine's `/ops/git diff` pass-through; this surface NEVER writes.
 * Until the read-only verb is served the view reports degradation and the surface
 * renders the designed "diff not yet available" detail (never an error).
 */
export function useGitFileDiff(
  scope: string | null,
  path: string | null,
): GitFileDiffView {
  const enabled = scope !== null && path !== null;
  const query = useQuery({
    queryKey: engineKeys.gitFileDiff(scope ?? "", path ?? ""),
    queryFn: () => engineClient.gitFileDiff({ scope: scope!, path: path! }),
    enabled,
  });
  return deriveGitFileDiffView({
    data: query.data,
    error: query.error,
    isPending: query.isPending,
    isError: query.isError,
    enabled,
    refetch: () => void query.refetch(),
  });
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
