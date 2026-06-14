// Typed engine API client (W02.P05.S17) — the single surface through which
// the GUI speaks to the engine, covering every contract query family: map,
// vault-tree, graph query, nodes, filters, events, asof, diff, status,
// search, ops. Capabilities are binding, endpoint shapes illustrative
// (contract status line); wire types stay snake_case as served.
//
// The same client runs against the W02.P05 mock engine and the live serve
// origin (W03.P12.S49 swaps the base URL behind the env flag) — passing
// unchanged against both IS the contract-shape verification.

import { useQuery } from "@tanstack/react-query";

import { DEFAULT_SALIENCE_LENS, type SalienceLens } from "../view/salienceLens";
import {
  adaptFilters,
  adaptGraphSlice,
  adaptMap,
  adaptSearch,
  adaptSession,
  adaptSettings,
  adaptStatus,
  adaptVaultTree,
  adaptWorkspaces,
  unwrapEnvelope,
} from "./liveAdapters";

// In development Vite proxies /api to the engine (vite.config.ts); in
// production the SPA is served by the engine itself, so the API shares the
// origin (contract §1) and the prefix collapses.
const API_BASE = import.meta.env.DEV ? "/api" : "";

// --- cross-cutting contract shapes (§2) ----------------------------------------

/** Every response carries a per-tier degradation block — truthful absence. */
export type TiersBlock = Record<string, { available: boolean; reason?: string }>;

export class EngineError extends Error {
  readonly status: number;
  readonly path: string;
  /**
   * The per-tier degradation block the engine attaches to its error envelope
   * (contract §2; the every-wire-response-carries-the-tiers-block rule).
   * Preserved through the error path so a backend-DOWN condition (e.g. a
   * rag-down 502) surfaces as degradation truth the GUI can render, never a
   * tiers-less bare error. Undefined only when the failure carried no
   * structured envelope (a genuine transport fault).
   */
  readonly tiers?: TiersBlock;
  /** The unwrapped error envelope body, when the engine served one. */
  readonly body?: unknown;
  constructor(
    path: string,
    status: number,
    detail?: { tiers?: TiersBlock; body?: unknown },
  ) {
    super(`engine ${path} responded ${status}`);
    this.path = path;
    this.status = status;
    this.tiers = detail?.tiers;
    this.body = detail?.body;
  }
}

/**
 * Build an EngineError from a non-ok response, preserving the tiers block the
 * engine attaches to its error envelope (contract §2 /
 * every-wire-response-carries-the-tiers-block). The transport must never
 * discard the degradation truth: a down backend has to reach the client as a
 * degraded state, not a bare failure. A body that is missing or unparseable
 * (a genuine transport fault) yields an EngineError with no tiers.
 */
async function engineErrorFrom(path: string, response: Response): Promise<EngineError> {
  let body: unknown;
  let tiers: TiersBlock | undefined;
  try {
    body = unwrapEnvelope(await response.json());
    if (body && typeof body === "object" && "tiers" in body) {
      const candidate = (body as { tiers?: unknown }).tiers;
      if (candidate && typeof candidate === "object") {
        tiers = candidate as TiersBlock;
      }
    }
  } catch {
    // No structured JSON body — nothing to preserve.
  }
  return new EngineError(path, response.status, { tiers, body });
}

// --- §3 workspace map / vault tree ----------------------------------------------

export interface MapWorktree {
  id: string;
  path: string;
  branch: string;
  has_vault: boolean;
  is_default?: boolean;
  degraded?: string[];
  /** Commits in HEAD not yet pushed to upstream; absent when no upstream is configured. */
  ahead?: number;
  /** Commits in upstream not yet merged into HEAD; absent when no upstream is configured. */
  behind?: number;
}

export interface MapRepository {
  path: string;
  branches: { name: string; kind: "default" | "feature" | "other" }[];
  worktrees: MapWorktree[];
}

export interface MapResponse {
  repositories: MapRepository[];
  tiers: TiersBlock;
}

// --- workspace registry (dashboard-workspace-registry ADR) ----------------------
//
// The multi-workspace project-root registry surface. `GET /workspaces`
// enumerates the registered roots; registry mutation (select/add/forget) rides
// `PUT /session` (config), consumed through the same `usePutSession` mutation as
// the active-scope switch. Wire shapes stay snake_case as the live
// `vaultspec-session`-backed routes serve them under the `{data, tiers}`
// envelope.

/** One registered project root (GET /workspaces). A `WorkspaceRoot` is the
 *  user-state record of a git workspace the operator pointed the dashboard at —
 *  read-only: it records a path, never implies any repository mutation. */
export interface WorkspaceRoot {
  /** Stable workspace id (the canonical git common dir). */
  id: string;
  /** Operator-facing label (defaults to the root's final path component). */
  label: string;
  /** Absolute root path — rendered as monospace path identity. */
  path: string;
  /** Advisory launch-default marker: true for the auto-registered launch root. */
  is_launch: boolean;
  /** Last-seen reachability: an unreachable root renders degraded, not dropped. */
  reachable: boolean;
  /** The reason a root is unreachable, for copy-tone rendering; null when reachable. */
  unreachable_reason: string | null;
}

/** The workspace registry enumeration (GET /workspaces data): the registered
 *  roots plus the active-workspace id the rail marks current. */
export interface WorkspacesState {
  workspaces: WorkspaceRoot[];
  /** The active workspace id, or null when none is selected yet. */
  active_workspace: string | null;
  tiers: TiersBlock;
}

export interface VaultTreeEntry {
  path: string;
  doc_type: string;
  feature_tags: string[];
  dates: { created?: string; modified?: string };
}

export interface VaultTreeResponse {
  entries: VaultTreeEntry[];
  tiers: TiersBlock;
}

// --- §4 graph shapes -------------------------------------------------------------

export interface EngineNode {
  id: string;
  kind: string;
  doc_type?: string;
  feature_tags?: string[];
  title?: string;
  dates?: { created?: string; modified?: string };
  lifecycle?: { state: string; progress?: { done: number; total: number } };
  degree_by_tier?: Partial<
    Record<"declared" | "structural" | "temporal" | "semantic", number>
  >;
  /**
   * Feature-convergence nodes only (constellation granularity, engine
   * addendum S02): how many documents converge on the feature. Drives the
   * center-of-gravity sizing (ADR D4.1); absent on document nodes.
   */
  member_count?: number;
  /**
   * The authority register the node answers in (graph-node-semantics ADR):
   * `design` (ADR), `roadmap` (plan/feature), `evidence` (exec), `judgment`
   * (audit), `law` (rule), `substrate` (research/reference), `manifest`
   * (index), or `unknown` (an unrecognized type, surfaced honestly). The
   * stable handle the salience lenses bias toward; an ADDITIVE projection, it
   * never re-keys the node.
   */
  authority_class?: string;
  /**
   * The aggregate-species hint (graph-node-semantics ADR): `true` for exec
   * records, collapsible into their parent plan at overview LOD so the long
   * tail does not swamp the field. `false`/absent for individually-weighted
   * species (ADR, plan, audit, rule).
   */
  aggregate?: boolean;
  /**
   * The single active-lens Degree-of-Interest salience float in [0,1]
   * (graph-node-salience ADR): the engine-computed, per-lens, CPU-bound node
   * importance for the REQUESTED lens. Present on document nodes; absent on
   * feature-convergence nodes (the salience model ranks documents). It is a
   * single float for the active lens, NEVER a per-lens map — treating it as a
   * fixed number anywhere discards the intent dimension the ADR exists for.
   * The representation layer CONSUMES this (node size + label priority,
   * graph-representation ADR encoding map); now produced for real by the
   * merged salience engine, no longer a representation mock stub.
   */
  salience?: number;
  /**
   * Per-node semantic embedding vector (graph-representation ADR §4 amendment):
   * the rag embedding delivered to the CPU worker for the semantic UMAP layout
   * mode. The engine never serves layout coordinates (graph-compute-is-CPU); it
   * serves the raw embedding and the worker projects it. Absent on nodes lacking
   * an embedding — the semantic mode draws those in a connectivity-fallback
   * position and says so.
   */
  embedding?: number[];
}

/**
 * Constellation meta-edge wire shape (contract §4, engine addendum S02):
 * the engine returns feature↔feature relationships as a SEPARATE top-level
 * `meta_edges` array at feature granularity (never folded into `edges`).
 * `src`/`dst` are the synthesized feature NODE ids (`feature:{tag}`); the
 * wire carries no id/relation/tier — the client synthesizes those when it
 * folds the meta-edge into the internal edge representation (adaptGraphSlice).
 */
export interface WireMetaEdge {
  src: string;
  dst: string;
  src_feature: string;
  dst_feature: string;
  count: number;
  breakdown_by_tier: Record<string, number>;
}

export interface EngineEdge {
  id: string;
  src: string;
  dst: string;
  relation: string;
  // No direction field on the wire: direction is carried entirely by
  // src→dst ordering (contract §4 as amended by engine audit W03P10-602).
  tier: "declared" | "structural" | "temporal" | "semantic";
  confidence: number;
  state?: "resolved" | "stale" | "broken";
  provenance?: string;
  observed_at?: string;
  /**
   * The pipeline-derivation label (graph-node-semantics ADR), carried
   * ALONGSIDE the §4 `relation`/`tier` and NEVER instead of them: a first-class
   * labeled relation drawn from the closed `DerivationRelation` vocabulary
   * (`grounds`, `authorizes`/`binds`, `generated-by`, `aggregates`, `reviews`,
   * `promoted-from`), or `null` when the edge carries no pipeline relationship.
   * The two name different facts — derivation says WHAT the relationship is in
   * the framework, the tier says HOW the engine knows it. The representation
   * layer's lineage layout consumes it on the derivation axis. ADDITIVE: the
   * label is not part of the edge stable key, so labeling never re-keys.
   */
  derivation?: DerivationRelation | null;
  /** Constellation meta-edges only (engine-aggregated, §4). */
  meta?: { count: number; breakdown_by_tier: Record<string, number> };
}

/** The closed pipeline-derivation vocabulary (graph-node-semantics ADR). */
export type DerivationRelation =
  | "grounds"
  | "authorizes"
  | "binds"
  | "generated-by"
  | "aggregates"
  | "reviews"
  | "promoted-from";

/**
 * The salience lens (graph-node-salience ADR): the per-viewer-intent
 * parameterization the engine biases its importance computation toward.
 * `status` (the default, "what is in-flight") leads with betweenness + hub
 * score + high recency; `design` ("why is the system this way") leads with
 * authority PageRank + coreness. The canonical definition (and its active-lens
 * view store) lives in `view/salienceLens.ts`; re-exported here so the §4 wire
 * surface and its representation-layer consumers share one type and one default.
 */
export { DEFAULT_SALIENCE_LENS };
export type { SalienceLens };

/** The engine-owned filter object, echoed back normalized (§4). */
export interface GraphFilter {
  tiers?: Partial<Record<EngineEdge["tier"], boolean>>;
  min_confidence?: Partial<Record<"temporal" | "semantic", number>>;
  relations?: string[];
  structural_state?: ("resolved" | "stale" | "broken")[];
  kinds?: string[];
  doc_types?: string[];
  feature_tags?: string[];
  date_range?: { from?: string; to?: string };
  text?: string;
}

export interface GraphSlice {
  nodes: EngineNode[];
  edges: EngineEdge[];
  /**
   * Raw constellation meta-edges as served at feature granularity. The
   * client folds these into `edges` (adaptGraphSlice) so one downstream path
   * renders both granularities; consumers read the folded `edges`, not this.
   */
  meta_edges?: WireMetaEdge[];
  filter?: GraphFilter;
  tiers: TiersBlock;
  /**
   * Present on LIVE keyframe responses (constellation-live-delta S03): the
   * monotonic seq clock tip at the time the keyframe was built. Absent on
   * as-of/time-travel responses. Consumers use this as the `since` anchor
   * for the graph SSE subscription so deltas resume without re-keyframing.
   */
  last_seq?: number | null;
  /**
   * The bounded-query honesty block (graph-queries-are-bounded-by-default,
   * node-canvas ADR "States"): present and non-null ONLY when the engine's hard
   * node ceiling capped the slice. `/graph/query` serves it under the
   * `truncated` key (`vaultspec-api` `query.rs`); it survives `adaptGraphSlice`
   * untouched as part of the spread-through `rest`. The canvas renders it as the
   * "narrowed — refine your view" state over the capped subgraph, never as a
   * silent partial result.
   */
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
  /**
   * The active salience lens the engine computed for (graph-node-salience ADR
   * wire amendment), echoed so the client never re-derives which lens it renders.
   * Defaults to `status` when the request omitted it.
   */
  lens?: SalienceLens;
  /**
   * True when the salience was computed while a relevant tier was degraded (read
   * from the `tiers` block, never guessed): the client renders the ranking as
   * partial, never as a complete one. The degraded tier itself is in `tiers`.
   */
  salience_partial?: boolean;
}

export interface FiltersVocabulary {
  relations: string[];
  tiers: string[];
  doc_types: string[];
  feature_tags: string[];
  kinds: string[];
  date_bounds?: { from?: string; to?: string };
  tiers_block?: TiersBlock;
}

export interface NodeDetail {
  node: EngineNode;
  interior?: GraphSlice;
  tiers: TiersBlock;
}

export interface NodeEvidence {
  documents: { path: string; doc_type: string }[];
  code_locations: { path: string; symbol?: string; line?: number; state: string }[];
  commits: { sha: string; subject: string; rule?: string }[];
  tiers: TiersBlock;
}

export interface DiscoverResponse {
  candidates: EngineEdge[];
  tiers: TiersBlock;
}

// --- §5 temporal shapes ------------------------------------------------------------

export interface EngineEvent {
  id: string;
  ts: string;
  kind: string;
  ref: string;
  /** Bounded per contract §5: commit + doc ids + code ids capped at 20. */
  node_ids: string[];
  /** How many ids the cap dropped; 0/absent means the list is complete. */
  truncated_node_ids?: number;
}

export interface EventBucket {
  from: string;
  to: string;
  counts_by_kind: Record<string, number>;
}

export interface EventsResponse {
  events?: EngineEvent[];
  buckets?: EventBucket[];
  tiers: TiersBlock;
}

/**
 * One delta entry — the single shape shared by /graph/diff and SSE graph.
 * `granularity` is present on constellation-live-delta responses (S03) and
 * discriminates document edges from feature-node/meta-edge deltas.
 */
export interface GraphDeltaEntry {
  op: "add" | "remove" | "change";
  node?: EngineNode;
  edge?: EngineEdge;
  t: number;
  seq: number;
  /** Present when the engine emits both delta species on the single clock. */
  granularity?: "document" | "feature";
}

export interface GraphDiffResponse {
  deltas: GraphDeltaEntry[];
  last_seq: number;
  tiers: TiersBlock;
}

export interface GraphAsofResponse extends GraphSlice {
  /**
   * The requested timestamp echoed back. The engine returns the raw param as a
   * string when the caller passed a millisecond timestamp; callers must coerce
   * to number before using as a timeline cursor (see timeTravel.ts scrubTo).
   */
  t: string | number;
  /**
   * Resolved commit sha for the snapshot. Informational; not used for replay.
   */
  resolved_sha?: string;
  // `seq` is NOT in the wire shape: historical views carry `last_seq: null`
  // (inherited from GraphSlice). The scrubTo driver derives a splice-safe seq
  // from the diff batch when last_seq is absent.
}

// --- §6 status / ops ------------------------------------------------------------------

export interface EngineStatus {
  ok: boolean;
  nodes: number;
  edges: number;
  degradations: string[];
  tiers: TiersBlock;
  // The live `/status` git rollup (git-diff-browser ADR / mock-mirrors-live-wire-
  // shape): `dirty` is a BOOLEAN ("is the working tree dirty?") — the live engine
  // serves NO per-file changed list, so the changed-files LIST is engine-blocked
  // and rendered as a designed degraded state. `ahead`/`behind` are OPTIONAL:
  // absent means "no upstream configured" (NOT zero), so divergence is only
  // shown when an upstream exists. `branch` is derived from the live `head_ref`.
  git?: { branch: string; ahead?: number; behind?: number; dirty: boolean };
  core?: { reachable: boolean; vault_health?: string };
  rag?: { service: string; watcher?: string; index?: string; jobs?: number };
}

export interface OpsResult {
  ok: boolean;
  envelope: unknown;
  tiers: TiersBlock;
}

// --- PROPOSED read-only git file diff shape (NOT a live wire contract) ----------------
//
// IMPORTANT: the live engine does NOT serve a read-only diff. Its ops whitelist
// is ONLY `/ops/core/{verb}` and `/ops/rag/{verb}` (POST); there is no `/ops/git/*`
// route, and `engine-read-and-infer` forbids inventing one in this UI-adoption
// cycle. The per-file diff body is therefore ENGINE-BLOCKED: the `DiffView`
// surface renders the honest "engine capability pending" state, and no live query
// calls a non-existent endpoint.
//
// The structured shapes below are kept ONLY as the `DiffView` component's prop
// contract (so the chrome is complete and fully testable) and as a DOCUMENTED
// FORWARD PROPOSAL for a future contract amendment — a separate engine feature
// (a read-only diff pass-through plus a richer per-file dirty-entry shape), out of
// scope here. A hunk-per-entry document with twin (old/new) line numbers and an
// explicit per-line change type lets a future view render without re-parsing
// unified-diff text. None of this is served by the current wire.

/** A single changed line within a hunk. `kind` is the non-color identity. */
export interface GitDiffLine {
  kind: "add" | "remove" | "context";
  /** Old-side line number; null on an added line. */
  old?: number | null;
  /** New-side line number; null on a removed line. */
  new?: number | null;
  text: string;
}

/** One hunk: its `@@` range header and the lines it carries. */
export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

/**
 * The structured read-only diff for one changed file — the `DiffView` prop
 * contract and a proposed future wire shape. NOT served by the live engine.
 */
export interface GitFileDiff {
  path: string;
  /** Git status letter for the entry (A/M/D/R/?) — the non-color status mark. */
  status?: string;
  hunks: GitDiffHunk[];
  /** True when there is no textual diff (binary blob or a pure rename). */
  binary?: boolean;
  /** Honest truncation, when a future engine capped an oversized body. */
  truncated?: { total_hunks: number; returned_hunks: number; reason: string };
}

// --- §8 search ---------------------------------------------------------------------------

export interface SearchResult {
  score: number;
  source: string;
  excerpt?: string;
  /** The engine's value-add: results click through into the graph. */
  node_id: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  tiers: TiersBlock;
}

// --- session / settings (user-state-persistence W04.P08.S25) -----------------------------
//
// The orchestration crate's session/settings surface (the "builds beside" layer,
// foundation contract §9). Wire shapes stay snake_case exactly as the live
// `vaultspec-session`-backed routes serve them under the shared `{data, tiers}`
// envelope. This is the durable, session-defining state — active scope, the
// active folder + its feature-tag contexts, recents, and user settings — that
// survives a reload; ephemeral view state stays in localStorage.

/** A scope's persisted folder + feature-tag context (GET /session). `folder` is
 *  null when no folder is selected; `feature_tags` is the grouping primitive the
 *  "current folder + contexts" projection is built on (never a new node model). */
export interface ScopeContextWire {
  folder: string | null;
  feature_tags: string[];
}

/** The current session: the "where am I and what am I looking at" the dashboard
 *  restores on load instead of recomputing a default (GET/PUT /session data). */
export interface SessionState {
  workspace: string;
  active_scope: string;
  /** The active WORKSPACE id beside the active scope (dashboard-workspace-
   *  registry ADR): the registered root the dashboard is pointed at, or null
   *  when none is selected yet. */
  active_workspace: string | null;
  scope_context: ScopeContextWire;
  recents: string[];
  tiers: TiersBlock;
}

/** The scope-context part of a PUT /session body. `scope` selects which scope
 *  the context belongs to (absent = the active scope); an absent or null
 *  `folder` clears it; `feature_tags` is set wholesale. */
export interface ScopeContextUpdate {
  scope?: string;
  folder?: string | null;
  feature_tags?: string[];
}

/** A partial session update (PUT /session): any absent field leaves that part of
 *  the session untouched. An unknown `active_scope` is a tiered 400 and leaves the
 *  active scope unchanged. The registry-mutation fields (dashboard-workspace-
 *  registry ADR) ride the same config surface: `active_workspace` selects the
 *  active root (an unregistered id is a tiered 400), `add_workspace` registers an
 *  operator-supplied path read-only (an invalid path is a tiered 400), and
 *  `forget_workspace` removes a root (the last launch root is refused). */
export interface SessionUpdate {
  active_scope?: string;
  scope_context?: ScopeContextUpdate;
  push_recent?: string;
  active_workspace?: string;
  add_workspace?: string;
  forget_workspace?: string;
}

/** User settings (GET/PUT /settings data): a flat `global` map plus a per-scope
 *  `scoped` map. `scoped` sparse-omits scopes with no scoped keys. */
export interface SettingsState {
  global: Record<string, string>;
  scoped: Record<string, Record<string, string>>;
  tiers: TiersBlock;
}

/** A single settings write (PUT /settings body): a key/value pair, global when
 *  `scope` is absent, scope-scoped otherwise. */
export interface SettingUpdate {
  scope?: string;
  key: string;
  value: string;
}

// --- the client ------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Production token bootstrap (DF-6 amendment): the engine injects a
 * `vaultspec-token` meta tag into the served index.html; the default
 * transport carries it as the bearer. In dev the Vite proxy injects the
 * header instead (vite.config.ts), so an absent tag is not an error.
 */
export function bearerToken(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector('meta[name="vaultspec-token"]')?.getAttribute("content") ??
    null
  );
}

const defaultTransport: FetchLike = (input, init) => {
  const token = bearerToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};

export interface EngineClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class EngineClient {
  readonly baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(options: EngineClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? API_BASE;
    this.fetchImpl = options.fetchImpl ?? defaultTransport;
  }

  /**
   * Swap the transport at runtime — the app bootstrap installs the mock
   * engine here when `VITE_MOCK_ENGINE=1` (S19), and S49 swaps the live
   * origin back behind the same flag.
   */
  useTransport(fetchImpl: FetchLike): void {
    this.fetchImpl = fetchImpl;
  }

  // §3
  async map(): Promise<MapResponse> {
    return adaptMap(await this.get("/map"));
  }

  /** The workspace registry (dashboard-workspace-registry ADR): the registered
   *  project roots with reachability plus the active-workspace id. */
  async workspaces(): Promise<WorkspacesState> {
    return adaptWorkspaces(await this.get("/workspaces"));
  }

  async vaultTree(scope: string): Promise<VaultTreeResponse> {
    return adaptVaultTree(await this.get("/vault-tree", { scope }));
  }

  // §4
  async graphQuery(body: {
    scope: string;
    filter?: GraphFilter;
    /** Engine-owned granularity (contract §4): document edges, or
     *  feature-convergence nodes + meta-edges. Omitted = document. */
    granularity?: "document" | "feature";
    as_of?: string | number;
    /**
     * The active salience lens (graph-node-salience ADR §4 amendment): a request
     * parameter selecting which per-lens importance field the engine computes
     * and — via DOI — which node set is served. `status` (default) or `design`;
     * omitted = the engine defaults to status. Switching lens is a re-query the
     * stores layer issues. The representation layer drives this from its
     * active-lens view state.
     */
    lens?: SalienceLens;
    /** The DOI focus node id folded into the salience distance term. */
    focus?: string | null;
  }): Promise<GraphSlice> {
    return adaptGraphSlice(await this.post("/graph/query", body));
  }

  async filters(scope: string): Promise<FiltersVocabulary> {
    return adaptFilters(await this.get("/filters", { scope }));
  }

  node(id: string): Promise<NodeDetail> {
    return this.get(`/nodes/${encodeURIComponent(id)}`);
  }

  nodeNeighbors(
    id: string,
    params: { depth?: number; tiers?: string; scope?: string } = {},
  ): Promise<GraphSlice> {
    return this.get(`/nodes/${encodeURIComponent(id)}/neighbors`, params);
  }

  nodeEvidence(id: string): Promise<NodeEvidence> {
    return this.get(`/nodes/${encodeURIComponent(id)}/evidence`);
  }

  discover(id: string): Promise<DiscoverResponse> {
    return this.post(`/nodes/${encodeURIComponent(id)}/discover`, {});
  }

  // §5
  events(params: {
    scope: string;
    from?: string;
    to?: string;
    kinds?: string;
    bucket?: string;
  }): Promise<EventsResponse> {
    return this.get("/events", params);
  }

  graphAsof(params: {
    scope: string;
    t: string | number;
    filter?: string;
  }): Promise<GraphAsofResponse> {
    // NB: the constellation-granularity shape of the time-travel surface is
    // the open S50 asof/diff divergence question (routed to team-lead); this
    // method intentionally stays on the document-granularity path the GUI
    // already consumes, untouched by the meta-edge fold.
    return this.get("/graph/asof", params);
  }

  graphDiff(params: {
    scope: string;
    from: string | number;
    to: string | number;
    filter?: string;
  }): Promise<GraphDiffResponse> {
    return this.get("/graph/diff", params);
  }

  // §6
  async status(): Promise<EngineStatus> {
    return adaptStatus(await this.get("/status"));
  }

  opsCore(verb: string, body: unknown = {}): Promise<OpsResult> {
    return this.post(`/ops/core/${encodeURIComponent(verb)}`, body);
  }

  opsRag(verb: string, body: unknown = {}): Promise<OpsResult> {
    return this.post(`/ops/rag/${encodeURIComponent(verb)}`, body);
  }

  /** §7 — open the multiplexed SSE stream through the same transport. The
   *  optional `scope` targets a specific worktree's clock (W02.P04.S14 wire
   *  change): resume runs against that scope's own monotonic seq; absent, the
   *  engine falls back to the active scope. */
  openStream(
    channels: string[],
    since?: number,
    signal?: AbortSignal,
    scope?: string,
  ): Promise<Response> {
    return this.fetchImpl(this.streamUrl(channels, since, scope), { signal });
  }

  // §7 — the SSE endpoint URL; consumption lives in queries.ts (S20).
  streamUrl(channels: string[], since?: number, scope?: string): string {
    const params = new URLSearchParams({ channels: channels.join(",") });
    if (since !== undefined) params.set("since", String(since));
    // Per-scope resume (W02.P04.S14): pass the scope so `since=` resumes against
    // that scope's own clock. Absent, the engine streams the active scope.
    if (scope !== undefined) params.set("scope", scope);
    return `${this.baseUrl}/stream?${params.toString()}`;
  }

  // §8
  async search(body: {
    query: string;
    target?: "vault" | "code";
    filters?: Record<string, string>;
  }): Promise<SearchResponse> {
    return adaptSearch(await this.post("/search", body)) as SearchResponse;
  }

  // --- session / settings (W04.P08.S25) ------------------------------------

  /** Read the current session — the "where am I" state restored on load. */
  async session(): Promise<SessionState> {
    return adaptSession(await this.get("/session"));
  }

  /** Persist a partial session update; returns the full updated session. An
   *  unknown `active_scope` throws an EngineError (tiered 400). */
  async putSession(body: SessionUpdate): Promise<SessionState> {
    return adaptSession(await this.put("/session", body));
  }

  /** Read user settings (global + per-scope scoped keys). */
  async settings(): Promise<SettingsState> {
    return adaptSettings(await this.get("/settings"));
  }

  /** Persist a single settings write; returns the full updated settings. */
  async putSettings(body: SettingUpdate): Promise<SettingsState> {
    return adaptSettings(await this.put("/settings", body));
  }

  // --- transport -----------------------------------------------------------

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) search.set(key, String(value));
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }
    const response = await this.fetchImpl(url);
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }
}

/** The app-wide default client (mock vs live origin resolved in S49). */
export const engineClient = new EngineClient();

export async function fetchEngineStatus(): Promise<EngineStatus> {
  return engineClient.status();
}

/** The right rail's recovery snapshot; /stream deltas refine it later.
 *  Polls every 8 s while errored so NowStrip self-heals after engine-up
 *  transitions without requiring a page reload (mirrors useWorkspaceMap). */
export function useEngineStatus() {
  return useQuery({
    queryKey: ["engine", "status"],
    queryFn: fetchEngineStatus,
    refetchInterval: (query) => (query.state.status === "error" ? 8_000 : false),
  });
}
