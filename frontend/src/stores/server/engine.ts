// Typed engine API client (W02.P05.S17) — the single surface through which
// the GUI speaks to the engine, covering every contract query family: map,
// vault-tree, graph query, nodes, filters, events, asof, diff, status,
// search, ops. Capabilities are binding, endpoint shapes illustrative
// (contract status line); wire types stay snake_case as served.
//
// The client runs only against the live `vaultspec serve` origin; tests drive
// the SAME client against a real spawned engine (testing/liveClient), so a
// passing test IS the contract-shape verification — there is no mock double.

import {
  adaptContent,
  adaptDashboardState,
  adaptFileTree,
  adaptFilters,
  adaptGitOp,
  adaptGraphEmbeddings,
  adaptGraphSlice,
  adaptHistory,
  adaptIssues,
  adaptLineageSlice,
  adaptMap,
  adaptPipeline,
  adaptPlanInterior,
  adaptPrs,
  adaptSearch,
  adaptSession,
  adaptSettings,
  adaptSettingsSchema,
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

/**
 * The canonical, ordered tier-name vocabulary (contract §2). The single source
 * of truth for the four provenance tiers and their order — both the membership a
 * `*Availability` reader inspects and the tie-break ordering a dominant-tier pick
 * resolves by (liveAdapters `dominantTier`). Defined once here beside `TiersBlock`
 * (its owning type) and imported everywhere; per-surface single-tier subsets
 * (e.g. `["semantic"]`) stay local — this is the full ordered set, not a subset.
 */
export const CANONICAL_TIERS = [
  "declared",
  "structural",
  "temporal",
  "semantic",
] as const;

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

  /** The machine-readable `error_kind` the engine attaches to a typed error
   *  envelope (dashboard-settings: unknown_key / scope_not_allowed /
   *  invalid_value), when present. Lets a consumer distinguish WHY a write was
   *  rejected without parsing the human message. Undefined for untyped errors. */
  get errorKind(): string | undefined {
    if (this.body && typeof this.body === "object" && "error_kind" in this.body) {
      const kind = (this.body as { error_kind?: unknown }).error_kind;
      return typeof kind === "string" ? kind : undefined;
    }
    return undefined;
  }

  /** The human-facing `error` message the engine served, when present. */
  get errorMessage(): string | undefined {
    if (this.body && typeof this.body === "object" && "error" in this.body) {
      const msg = (this.body as { error?: unknown }).error;
      return typeof msg === "string" ? msg : undefined;
    }
    return undefined;
  }
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

// --- the single per-tier degradation read (contract §2) -------------------------
//
// One reader for the whole stores layer, encoding the degradation honesty law
// (degradation-is-read-from-tiers-not-guessed-from-errors) exactly once. Every
// `*Availability` surface was previously re-declaring this same triplet and
// re-walking the same loop by hand; collapsing them here means a new tier or a
// precedence fix touches one place, not 8+.

/**
 * The interpreted per-tier degradation a stores reader hands to chrome — never
 * the raw `tiers` block (dashboard-layer-ownership). The one shape the seven
 * former `*Availability` interfaces re-declared. Surfaces that carry extra
 * fields (loading, lens, items, artifacts) compose this triplet.
 */
export interface TierAvailability {
  /** At least one of the inspected tiers is unavailable or absent from the block. */
  degraded: boolean;
  /** Names of the inspected tiers reporting unavailable (or absent from the block). */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

/**
 * The single per-tier degradation loop. For each requested tier name, a tier
 * that is absent from the served block OR reports `available:false` is degraded
 * (contract §2: absence is degradation, not availability), recording the
 * engine's reason for copy-tone rendering. A wholly absent block (`undefined` —
 * a tiers-less transport fault) is NOT treated as degraded: that is the query's
 * error state, which each surface renders distinctly. Degradation is reported
 * only from a block the engine actually served.
 */
export function readTierAvailability(
  tiers: TiersBlock | undefined,
  tierNames: readonly string[],
): TierAvailability {
  if (!tiers) return { degraded: false, degradedTiers: [], reasons: {} };
  const degradedTiers: string[] = [];
  const reasons: Record<string, string> = {};
  for (const tier of tierNames) {
    const state = tiers[tier];
    if (state === undefined || state.available === false) {
      degradedTiers.push(tier);
      if (state?.reason) reasons[tier] = state.reason;
    }
  }
  return { degraded: degradedTiers.length > 0, degradedTiers, reasons };
}

/**
 * Pick the freshest tiers block out of a query's success data + error state,
 * encoding the precedence the wire honesty law mandates in ONE place: a FRESH
 * error envelope's tiers win over a STALE held-success block
 * (degradation-is-read-from-tiers-not-guessed-from-errors). When the latest
 * request errored with a tiers-bearing `EngineError`, that error's tiers are the
 * freshest availability truth and override the previously held success snapshot;
 * a tiers-less transport fault contributes nothing, falling back to the held
 * success block. Every former per-site `errTiers ?? data?.tiers` (and the one
 * BACKWARDS `fromData ?? fromError`) is replaced by this.
 */
export function tiersFromQuery(query: {
  data?: { tiers?: TiersBlock } | undefined;
  error?: unknown;
}): TiersBlock | undefined {
  const fromError = query.error instanceof EngineError ? query.error.tiers : undefined;
  return fromError ?? query.data?.tiers;
}

// --- §3 workspace map / vault tree ----------------------------------------------

export interface MapWorktree {
  id: string;
  path: string;
  branch: string;
  has_vault: boolean;
  is_default?: boolean;
  degraded?: string[];
  /** Working tree differs from HEAD; absent only if an older engine omitted it. */
  dirty?: boolean;
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
  /** ADR H1 status (dashboard-pipeline-wire W01), when the entry is an ADR. */
  status?: string;
  /** Plan tier (dashboard-pipeline-wire W01), when the entry is a plan. */
  tier?: string;
  /** Plan checkbox lifecycle progress (done/total) for the active scope,
   *  projected from the SAME `lifecycle_in_scope` facet the node-graph pipeline
   *  reads. Present only on plan rows that carry checkbox progress; absent
   *  everywhere else so the left rail paints the honest not-started baseline. */
  progress?: { done: number; total: number };
}

export interface VaultTreeResponse {
  entries: VaultTreeEntry[];
  tiers: TiersBlock;
}

// --- §3 code (worktree) file tree (dashboard-code-tree ADR) ----------------------
//
// The read-only codebase file-tree listing: `GET /file-tree?scope=&path=&cursor=`
// returns ONE directory level within a worktree scope (the rail expands lazily),
// metadata only (never file bytes), ignore-aware, hard-capped, and cursor-
// paginated with an honest `truncated` block. Each child carries the stable
// `code:<path>` node id derived through the SHARED `node_id` rule, so a file row
// joins the graph exactly as the vault browser's `doc:<stem>` row does. Wire
// shapes stay snake_case as the live `vaultspec-api` route serves them under the
// `{data, tiers}` envelope.

/** One child of a listed directory level (GET /file-tree data.entries). Metadata
 *  only — the ADR's read-only/no-content constraint; never file bytes. */
export interface FileTreeEntry {
  /** Repo-relative POSIX path (forward slashes), e.g. `src/main.rs`. */
  path: string;
  /** `dir` for a directory, `file` for a file — the non-color row identity. */
  kind: "dir" | "file";
  /** For a directory, whether it has at least one non-ignored child (the
   *  disclosure-affordance hint); always false for a file. */
  has_children: boolean;
  /** The stable `code:<path>` graph node id this path maps to (shared `node_id`
   *  rule). Present for navigation even when no `code:` node yet exists in the
   *  graph (unindexed / below the structural tier's reach) — the code mode renders
   *  a quiet absent-interlink state for those, never an error. */
  node_id: string;
}

/** The honest bounded-read marker (graph-queries-are-bounded-by-default): present
 *  and non-null ONLY when the engine's per-level child ceiling capped the level.
 *  The code mode renders it as a "more here — expand a subdirectory" state over
 *  the capped level, never as a silent partial result. */
export interface FileTreeTruncated {
  total_children: number;
  returned_children: number;
  reason: string;
}

/** One directory level (GET /file-tree data). `path` echoes the listed directory
 *  (empty for the worktree root); `truncated` is null on an uncapped level. */
export interface FileTreeResponse {
  entries: FileTreeEntry[];
  path: string;
  truncated: FileTreeTruncated | null;
  /** Cursor for the next page when the level paginates; absent on the last page. */
  next_cursor?: string;
  tiers: TiersBlock;
}

// --- §4 read-only content fetch (review-rail-viewers ADR) ------------------------
//
// `GET /nodes/{id}/content?scope=` is the ONE viewer backend: it serves the bytes
// of one document (`doc:<stem>`) or source file (`code:<path>`) so the markdown
// reader and the code viewer can DISPLAY content. The listing routes
// (`/vault-tree`, `/file-tree`) stay metadata-only — content lives only here. The
// body is byte-capped with an honest `truncated` block (bounded-by-default), and
// the `tiers` block rides success and error so the viewer derives degraded state
// from tiers, never from a transport error. Wire shapes stay snake_case as the
// live `vaultspec-api` route serves them under the `{data, tiers}` envelope.

/** The honest content byte-cap marker (graph-queries-are-bounded-by-default,
 *  generalized): present and non-null ONLY when the served body was capped at
 *  `MAX_CONTENT_BYTES`. The viewer renders it as a "truncated — open the file
 *  directly for the full body" state over the served prefix, never a silent
 *  partial. */
export interface ContentTruncated {
  total_bytes: number;
  returned_bytes: number;
  reason: string;
}

/** The bytes of one document or source file (GET /nodes/{id}/content data).
 *  `language_hint` is the engine's extension-derived grammar hint (the viewer
 *  maps it to a Shiki grammar, degrading to plain text on an unknown hint);
 *  `blob_hash` is the git-style blob oid that content-addresses the cache entry. */
export interface ContentResponse {
  /** Repo-relative POSIX path of the served file. */
  path: string;
  /** Git-style blob oid of the bytes — content-addresses the cache entry. */
  blob_hash: string;
  /** Full byte length of the file (before any truncation). */
  byte_len: number;
  /** Extension-derived highlighter grammar hint; null when none applies. */
  language_hint: string | null;
  /** The (possibly truncated) UTF-8 text. */
  text: string;
  /** Non-null only when the body was capped at the byte ceiling. */
  truncated: ContentTruncated | null;
  tiers: TiersBlock;
}

// --- §4 graph shapes -------------------------------------------------------------

export interface EngineNode {
  id: string;
  kind: string;
  doc_type?: string;
  feature_tags?: string[];
  title?: string;
  /**
   * ADR H1 status (dashboard-pipeline-wire W01): one of
   * `proposed`/`accepted`/`rejected`/`deprecated`. A query-time facet served on
   * ADR doc nodes (and mirrored on vault-tree / graph-query nodes); absent
   * everywhere else. Makes "in-flight ADR" honest — real status, not a checkbox
   * guess (an ADR has no steps).
   */
  status?: string;
  /**
   * Plan frontmatter tier (dashboard-pipeline-wire W01): one of `L1`-`L4`,
   * served on plan doc nodes; absent everywhere else.
   */
  tier?: string;
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
   * The literal per-type lifecycle status TOKEN the node answers in
   * (node-visual-richness ADR P01): the raw vocabulary term the type's status
   * machine resolved — e.g. `accepted`/`deprecated` (adr), `L2` (plan tier),
   * `high` (audit severity), `superseded` (rule), `in_flight` (feature). An
   * ADDITIVE projection beside `authority_class`/`aggregate`: present only when
   * the type carries a per-type status (absent on exec/research/etc. and on docs
   * predating the convention — honest absence, never a fabricated status). It
   * never re-keys the node (the §2 identity guarantee holds).
   */
  status_value?: string;
  /**
   * The closed status-treatment family the `status_value` resolves into
   * (node-visual-richness ADR P01): one of
   * `affirmed|provisional|negated|retired|graded|tiered`. The shape channel for
   * status — the scene maps it to ONE grayscale-safe stamp treatment, tint only
   * reinforces. ADDITIVE beside `status_value`; the two ride together and are
   * both absent when the type carries no per-type status.
   */
  status_class?: string;
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
   * Backend-projected world-space node body radius. This is additive contract
   * surface for the graph renderer; current canvas sizing still derives from
   * salience/member_count until the renderer switches over explicitly.
   */
  node_size?: number;
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
  // `binds` is a deliberate inbound-tolerant alias of `authorizes`: the engine
  // wire only ever emits `authorizes`, but the client accepts `binds` (the ADR's
  // synonym) so an older/alternate producer can never break edge styling.
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
 * authority PageRank + coreness. This is a wire/dashboard-state concept, not a
 * standalone view store authority.
 */
export const SALIENCE_LENSES = ["status", "design"] as const;
export type SalienceLens = (typeof SALIENCE_LENSES)[number];
export const DEFAULT_SALIENCE_LENS: SalienceLens = "status";

/** The engine-owned filter object, echoed back normalized (§4). */
export interface GraphFilter {
  tiers?: Partial<Record<EngineEdge["tier"], boolean>>;
  min_confidence?: Partial<Record<"temporal" | "semantic", number>>;
  relations?: string[];
  structural_state?: ("resolved" | "stale" | "broken")[];
  kinds?: string[];
  doc_types?: string[];
  feature_tags?: string[];
  /** Glob/regex search over feature tags (filter-controls campaign): a node
   *  passes if any of its feature_tags matches. The topic search graduates to
   *  this for power queries; distinct from exact `feature_tags` membership. */
  feature_query?: { value: string; mode: "glob" | "regex" };
  statuses?: string[];
  plan_tiers?: string[];
  /** Document-health conditions (filter-controls campaign): `dangling`/`orphaned`
   *  (engine-derived) + `invalid`/`empty-scaffold` (with core ingestion). A node
   *  passes if it carries any requested condition. */
  health?: string[];
  date_range?: { from?: string; to?: string };
  text?: string;
}

export type DashboardDateRange = { from?: string; to?: string };

export interface DashboardSelection {
  selected_ids: string[];
  hovered_id: string | null;
}

export type DashboardFilters = GraphFilter;

export type DashboardTimelineMode =
  | { kind: "live" }
  | { kind: "time-travel"; at: number };

export const GRAPH_GRANULARITIES = ["document", "feature"] as const;
export type GraphGranularity = (typeof GRAPH_GRANULARITIES)[number];

export const REPRESENTATION_MODES = [
  "connectivity",
  "temporal",
  "lineage",
  "hierarchical",
  "radial",
  "community",
  "semantic",
] as const;
export type RepresentationMode = (typeof REPRESENTATION_MODES)[number];

export const DASHBOARD_PANEL_TABS = ["status", "changes", "search"] as const;
export type DashboardPanelTab = (typeof DASHBOARD_PANEL_TABS)[number];

export interface DashboardPanelState {
  left_collapsed: boolean;
  right_collapsed: boolean;
  right_tab: DashboardPanelTab;
}

export const DASHBOARD_BOUND_SHAPES = ["free", "circle", "rect"] as const;
export type DashboardBoundShape = (typeof DASHBOARD_BOUND_SHAPES)[number];

export interface DashboardGraphBounds {
  shape: DashboardBoundShape;
  size: number;
}

export interface DashboardState extends DashboardSelection {
  scope: string;
  filters: DashboardFilters;
  date_range: DashboardDateRange;
  timeline_mode: DashboardTimelineMode;
  graph_granularity: GraphGranularity;
  salience_lens: SalienceLens;
  salience_focus: string | null;
  representation_mode: RepresentationMode;
  graph_bounds: DashboardGraphBounds;
  panel_state: DashboardPanelState;
  tiers: TiersBlock;
}

export interface DashboardStatePatch {
  scope?: string;
  selected_ids?: string[];
  hovered_id?: string | null;
  filters?: DashboardFilters;
  date_range?: DashboardDateRange;
  timeline_mode?: DashboardTimelineMode;
  graph_granularity?: GraphGranularity;
  salience_lens?: SalienceLens;
  salience_focus?: string | null;
  representation_mode?: RepresentationMode;
  graph_bounds?: DashboardGraphBounds;
  panel_state?: DashboardPanelState;
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
  /** ADR status adjectives (proposed/accepted/rejected/deprecated) + plan
   *  meta-states (in-progress/finished) — the STATUS lifecycle facet. */
  statuses?: string[];
  /** Plan complexity tiers (L1–L4). */
  plan_tiers?: string[];
  /** Document-health conditions present in the corpus (filter-controls campaign):
   *  the `dangling`/`orphaned` HEALTH facet, empty when the corpus is clean. */
  health?: string[];
  date_bounds?: { from?: string; to?: string };
  tiers_block?: TiersBlock;
}

/**
 * One served node embedding (graph-semantic-embeddings ADR D3): the stable node
 * id and its raw float32 vector as a JSON `number[]` — the shape the semantic
 * UMAP worker projects. Identity rides the stable node id (`doc:{stem}`,
 * provenance-stable-keys); the vector is an additive value, never an id input.
 */
export interface NodeEmbedding {
  node_id: string;
  vector: number[];
}

/**
 * The dedicated bounded embedding slice (engine `/graph/embeddings`, unwrapped
 * from the `{data, tiers}` envelope): the stored rag vectors for the SERVED
 * document node set, carrying the graph `generation` they were read at (ADR D8 —
 * the client caches per generation), the per-tier `tiers` availability block
 * (ADR D7 — semantic availability is read from here, never a bare transport
 * error), and an honest `truncated` block present and non-null ONLY when the node
 * ceiling capped the slice. Fetched LAZILY, only on entering semantic mode (ADR
 * D2). A node not present here has no stored vector — the scene draws the honest
 * fallback ring.
 */
export interface EmbeddingsResponse {
  embeddings: NodeEmbedding[];
  /** The graph generation the vectors were read at — the cache-per-generation
   *  key. Echoes the same generation `/graph/query` is anchored to. */
  generation: number;
  tiers: TiersBlock;
  /** The active salience lens echoed, so the embedding set's node order matches
   *  the constellation's DOI-ordered served set. */
  lens?: SalienceLens;
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
}

export interface NodeDetail {
  node: EngineNode;
  interior?: GraphSlice;
  tiers: TiersBlock;
}

export interface NodeEvidence {
  documents: { path: string; doc_type: string }[];
  code_locations: {
    path: string;
    symbol?: string;
    line?: number;
    state?: string;
  }[];
  // The engine `CorrelatedCommit` serializes `confidence: f32` (the correlating
  // edge's confidence) alongside `sha`/`subject`/`rule`, and the mock mirrors it
  // byte-for-byte; the type declares it optional so a richer consumer (the binding
  // hover-card) can surface it. Additive widening — no shape change.
  commits: { sha: string; subject: string; rule?: string; confidence?: number }[];
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

// --- §5 recent commit history (status-overview ADR) --------------------------------
//
// `GET /history?scope=&limit=N` is the ONE engine gap the status-overview rail
// fills: the last N commits as `{hash, short_hash, subject, ts, node_ids}`,
// newest-first, bounded by a hard ceiling, enveloped with the tiers block on
// success and error. The commit SUBJECT (the message's first line) is the new
// datum `/events` never carried. Wire shapes stay snake_case exactly as the live
// `vaultspec-api` `history` route serves them; `ts` is engine-wide milliseconds.

/** One recent commit (GET /history): its full hash, short (8-char) hash, subject
 *  line, commit time (ms epoch), and the bounded node ids it correlates to
 *  (`commit:<sha>` + touched docs + capped code ids) so the rail can cross-link a
 *  commit into the graph. */
export interface HistoryCommit {
  hash: string;
  short_hash: string;
  subject: string;
  /** The commit message body (everything after the subject), bounded by the
   *  engine's MAX_COMMIT_BODY_BYTES; empty for a single-line commit. Backs the
   *  rail's expandable commit-message dropdown. */
  body: string;
  /** Commit time in milliseconds since the Unix epoch (engine-wide Timestamp). */
  ts: number;
  /** Bounded per the event sourcer's cap: commit id + docs + capped code ids. */
  node_ids: string[];
}

/** Honest truncation when the request exceeded the served ceiling and was
 *  clamped (graph-queries-are-bounded-by-default); null/absent otherwise. */
export interface HistoryTruncated {
  requested: number;
  returned: number;
  reason: string;
}

export interface HistoryResponse {
  commits: HistoryCommit[];
  truncated: HistoryTruncated | null;
  /** Opaque pagination cursor for "Show more"; null/absent when the bounded
   *  recent-commit window is exhausted (rides the envelope's `next_cursor`). */
  next_cursor: string | null;
  tiers: TiersBlock;
}

// --- GitHub work items (GET /prs, GET /issues; status-rail redesign) -----------------
//
// Read-only git-forge metadata the engine brokers through the bounded `gh` CLI
// (engine-read-and-infer). PR/issue availability is a capability-local fact
// carried in `available`/`reason` (NOT one of the four canonical tiers), so the
// rail renders a designed "GitHub unavailable" state without the four-tier
// contract changing. The `tiers` block stays the canonical degradation truth.

/** A bounded check-rollup summary for a PR (counts, not every check). */
export interface PrChecks {
  total: number;
  passed: number;
  failing: number;
  pending: number;
}

/** One pull request (GET /prs): number, title, author login, state, draft flag,
 *  url, ISO timestamps, optional merged time, optional check summary, and the
 *  lowercased review decision (`approved` / `changes_requested` / …). */
export interface PullRequest {
  number: number;
  title: string;
  author: string;
  state: string;
  is_draft: boolean;
  url: string;
  created_at: string | null;
  updated_at: string | null;
  merged_at: string | null;
  review_decision: string;
  checks: PrChecks | null;
}

/** One issue (GET /issues): number, title, author login, state, url, ISO
 *  timestamps, and its label names. */
export interface Issue {
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  created_at: string | null;
  updated_at: string | null;
  labels: string[];
}

export interface PRsResponse {
  prs: PullRequest[];
  /** Capability-local availability (gh reachable + authed), distinct from tiers. */
  available: boolean;
  reason: string | null;
  tiers: TiersBlock;
}

export interface IssuesResponse {
  issues: Issue[];
  available: boolean;
  reason: string | null;
  tiers: TiersBlock;
}

// --- §5 bounded temporal-lineage projection (dashboard-timeline ADR) ----------------
//
// The diachronic lineage the phase-lane timeline draws: for a scope and an
// inclusive `[from, to]` ISO date range, the dated document nodes in range
// together with the self-consistent edges among them (every arc's src/dst is a
// returned node). Served by `GET /graph/lineage?scope&from&to&filter=` under the
// shared `{data: {nodes, arcs, truncated}, tiers, next_cursor?}` envelope; wire
// shapes stay snake_case exactly as the live `vaultspec-api` `graph_lineage`
// route serves them (mirrored from `engine-query` `lineage.rs`). The slice is
// bounded under the document node ceiling with an honest `truncated` block
// (graph-queries-are-bounded-by-default), and the semantic tier is present-only
// in the range lineage (reported degraded in the envelope `tiers` block).

/** The pipeline-phase LANE a dated document sits in (engine `PipelineLanePhase`,
 *  kebab-case on the wire): research/reference share the research lane, then adr,
 *  plan, exec, audit→review, rule→codify. The static lane a document belongs to
 *  by its kind alone — what the timeline lanes ARE. */
export type LineagePhase = "research" | "adr" | "plan" | "exec" | "review" | "codify";

/**
 * One dated document node in the lineage slice (engine `LineageNode`): everything
 * the phase-lane mark renders. Identity rides the engine's stable node id
 * (`doc:{stem}`, provenance-stable-keys-are-identity-bearing) — the timeline
 * caches and animates marks and arcs by it across scrub and live update.
 */
export interface LineageNode {
  /** Stable node id (`doc:{stem}`) — identity-bearing. */
  id: string;
  /** Vault doc type (`research`/`adr`/`plan`/`exec`/`audit`/`rule`/...). */
  doc_type: string;
  /** The derived pipeline-phase lane this document sits in. */
  phase: LineagePhase;
  /**
   * Blob-true date(s) the node carries: `created` from frontmatter is the mark
   * position; `modified` (engine `Timestamp` = i64 epoch-ms, when present) is the
   * faint trailing tick. Both optional — the engine omits an absent date.
   */
  dates: { created?: string; modified?: number };
  /** Body H1 title, when the document carries one. */
  title?: string;
  /** Total degree (edges touching this node over all tiers) — the v1 salience
   *  input the mark weight rides. */
  degree: number;
}

/**
 * One relation arc between two dated marks (engine `LineageArc`): the lineage
 * edge the timeline draws. Carries the stable edge id (arc identity), the
 * endpoints, the typed relation, the optional `derivation` framework label, the
 * provenance tier (the arc's tier-as-treatment styling), and the calibrated
 * confidence.
 *
 * `derivation` is the additive framework-relationship label specified by the
 * node-semantics ADR (`grounds`/`authorizes`/`generated-by`/...) — NOT yet
 * shipped on the engine `Edge`. Until it lands the arc carries the shipped
 * `relation`/`tier` truth and `derivation` is absent; the surface draws REAL
 * lineage from day one and gains the richer label when the field arrives.
 */
export interface LineageArc {
  /** Stable edge id — arc identity, preserved across scrub and live update. */
  id: string;
  src: string;
  dst: string;
  /** Typed relation wire name (`mentions`/`references`/`contains`/...). */
  relation: string;
  /** The framework derivation label, when shipped (absent until the
   *  node-semantics `derivation` field lands). */
  derivation?: string;
  /** Provenance tier wire name. The range lineage serves declared/structural/
   *  temporal; semantic is present-only (excluded). */
  tier: "declared" | "structural" | "temporal" | "semantic";
  /** Tier-calibrated, fixed-band confidence. */
  confidence: number;
}

/**
 * The bounded temporal-lineage slice (engine `LineageSlice`, unwrapped from the
 * `{data, tiers}` envelope): the dated nodes in range, the self-consistent edges
 * among them, the per-tier `tiers` availability block, and an honest `truncated`
 * block. `truncated` is present and non-null ONLY when the engine's document node
 * ceiling capped the slice (the route serves `null` otherwise); the timeline
 * renders it as the "narrowed — refine your range" state, never a silent partial.
 */
export interface LineageSlice {
  nodes: LineageNode[];
  arcs: LineageArc[];
  tiers: TiersBlock;
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
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
  // shape): `dirty` is a BOOLEAN ("is the working tree dirty?"); the per-file
  // changed list + diff body are served separately by the read-only `/ops/git`
  // pass-through (porcelain status / numstat / unified diff). `ahead`/`behind` are
  // OPTIONAL: absent means "no upstream configured" (NOT zero), so divergence is
  // only shown when an upstream exists. `branch` is derived from the live `head_ref`.
  git?: { branch: string; ahead?: number; behind?: number; dirty: boolean };
  core?: { reachable: boolean; vault_health?: string };
  rag?: { service: string; watcher?: string; index?: string; jobs?: number };
}

export interface OpsResult {
  ok: boolean;
  envelope: unknown;
  tiers: TiersBlock;
}

// --- §6 vault write/create ops (document-editor backend) -------------------------
//
// Document mutation goes through the engine's brokered core-ops front door, which
// forwards vaultspec-core's sibling `{schema, status, data}` envelope VERBATIM
// under `data.envelope` with the tiers block (engine-read-and-infer: the engine
// owns no vault-write semantics — it forwards core's verb result). Writes hit
// `POST /ops/core/{verb}/write` (verb ∈ set-body | set-frontmatter | edit |
// rename); create hits `POST /ops/core/create`. BOTH success and business-refusal
// return HTTP 200 — the client branches on the sibling envelope's `status` + the inner
// `conflict`/`refused`/`checks` fields, NEVER on the HTTP code (a transport error
// is a tiers-bearing EngineError, distinct from a refusal).

/** The body of a write op (`set-body` | `set-frontmatter` | `edit` | `rename`). `ref` is the
 *  doc STEM (the `doc:` prefix stripped from the node id). `body` carries the new
 *  document text for `set-body`/`edit`; the frontmatter fields carry the new
 *  metadata for `set-frontmatter`. `expected_blob_hash` is the optimistic-
 *  concurrency token echoed from the last read's `blob_hash`; a mismatch is the
 *  conflict the editor reconciles (never a silent overwrite). */
export interface OpsWriteBody {
  scope?: string;
  ref: string;
  body?: string;
  expected_blob_hash?: string;
  date?: string;
  tags?: string[];
  related?: string[];
  /** The new identity-bearing stem for the `rename` verb (forwarded as `--to`). */
  to?: string;
}

/** The body of a create op (`POST /ops/core/create`). */
export interface OpsCreateBody {
  scope?: string;
  doc_type: string;
  feature: string;
  title?: string;
  related?: string[];
}

/** The body of a feature-archive op (`POST /ops/core/archive`). */
export interface OpsArchiveBody {
  scope?: string;
  feature: string;
}

/**
 * The typed, discriminated result of a write/create op, interpreted by
 * `adaptOpsWrite` from the sibling envelope's `status` + `data` fields (never the
 * HTTP code). Four outcomes the write/create stores seam exposes:
 *  - `saved`    — `set-body`/`edit`/`set-frontmatter` succeeded; the new
 *                 `blobHash` is the next optimistic-concurrency base, and `checks`
 *                 carries any non-fatal advisory checks. Consumed by the editor
 *                 save lifecycle.
 *  - `conflict` — the `expected_blob_hash` did not match the on-disk blob
 *                 (someone else wrote); `expected`/`actual` drive the editor
 *                 reconcile UI.
 *  - `refused`  — a frontmatter (or other) validation refusal; `checks`/`errors`
 *                 explain why the write was rejected without parsing prose.
 *  - `created`  — a `create` succeeded; the new doc's `path` + `stem`. Consumed
 *                 by the create-doc flow, not by the editor save lifecycle.
 */
export type OpsWriteResult =
  | { kind: "saved"; path: string; blobHash: string; checks: unknown[] }
  | { kind: "conflict"; expected: string; actual: string; path?: string }
  | { kind: "refused"; checks: unknown[]; errors: string[]; path?: string }
  | { kind: "created"; path: string; stem: string };

/** Narrow the sibling envelope (`{schema, status, data}`) the engine forwards
 *  verbatim under `data.envelope`. The transport already unwrapped `{data, tiers}`
 *  onto the flat `OpsResult` shape, so `envelope` here is that sibling object. */
export function envelopeData(envelope: unknown): {
  status?: string;
  data: Record<string, unknown>;
} {
  if (!envelope || typeof envelope !== "object") return { data: {} };
  const env = envelope as { status?: unknown; data?: unknown };
  const status = typeof env.status === "string" ? env.status : undefined;
  const data =
    env.data && typeof env.data === "object"
      ? (env.data as Record<string, unknown>)
      : {};
  return { status, data };
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Interpret a write/create `OpsResult` into the typed `OpsWriteResult`, branching
 * on the sibling envelope's `status` + the inner `data` fields, NEVER on an HTTP
 * code (the wire returns 200 for both success and business-refusal). A blob-hash
 * conflict (`data.conflict === true`) and a validation refusal (`data.refused ===
 * true`) are distinct non-fatal outcomes the editor reconciles, NOT thrown errors;
 * an unrecognized failure shape degrades to a `refused` with the message it
 * carries so the caller still surfaces it honestly rather than swallowing it.
 */
export function adaptOpsWrite(result: OpsResult): OpsWriteResult {
  const { status, data } = envelopeData(result.envelope);
  // A conflict and a refusal both ride a `status: "failed"` envelope; the inner
  // `conflict`/`refused` flags discriminate them (branch on data, not HTTP).
  if (data.conflict === true) {
    return {
      kind: "conflict",
      expected: asString(data.expected),
      actual: asString(data.actual),
      path: typeof data.path === "string" ? data.path : undefined,
    };
  }
  if (data.refused === true) {
    return {
      kind: "refused",
      checks: Array.isArray(data.checks) ? data.checks : [],
      errors: Array.isArray(data.errors)
        ? data.errors.filter((e): e is string => typeof e === "string")
        : [],
      path: typeof data.path === "string" ? data.path : undefined,
    };
  }
  if (status === "created") {
    return { kind: "created", path: asString(data.path), stem: asString(data.stem) };
  }
  // Any non-failed write status (`updated` / `set` / `ok`) with no conflict/refusal
  // flag is a successful save; the new blob hash is the next concurrency base.
  return {
    kind: "saved",
    path: asString(data.path),
    blobHash: asString(data.blob_hash),
    checks: Array.isArray(data.checks) ? data.checks : [],
  };
}

// --- read-only /ops/git pass-through (dashboard-pipeline-wire W04) ---------------------
//
// The live engine NOW serves a read-only `/ops/git/{verb}` pass-through (POST):
// porcelain `status`, `numstat`, unified `diff` for a path, and two-rev
// `histdiff`, forwarded VERBATIM inside the shared `{data: {verb, output}, tiers}`
// envelope. The engine implements NO diff algorithm and exposes NO mutating git
// verb - the whitelist is read-only by construction (`engine-read-and-infer`).
// `output` is git's raw text; the client parses it (the structured `GitFileDiff`
// below is the parse target the DiffView renders).

/** The raw `/ops/git/{verb}` pass-through envelope shape: the verb echoed back
 *  and git's output forwarded verbatim. `verb` is `status` | `numstat` | `diff`
 *  | `histdiff`. */
export interface GitOpResponse {
  verb: string;
  /** Git's stdout, forwarded verbatim (porcelain status / numstat / unified diff). */
  output: string;
  /** Adapter-side cap marker when the raw git stdout exceeded the stores boundary. */
  truncated?: { returned_chars: number; reason: string };
  tiers: TiersBlock;
}

// The structured shapes below are the `DiffView` component's prop contract — what
// the client parses git's verbatim `diff` output INTO so the view renders without
// re-parsing unified-diff text on every paint. A hunk-per-entry document with
// twin (old/new) line numbers and an explicit per-line change type.

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
 * contract, parsed from git's verbatim `diff` output by `parseUnifiedDiff`.
 */
export interface GitFileDiff {
  path: string;
  /** Git status letter for the entry (A/M/D/R/?) — the non-color status mark. */
  status?: string;
  hunks: GitDiffHunk[];
  /** True when there is no textual diff (binary blob or a pure rename). */
  binary?: boolean;
  /** Honest truncation, when the engine capped an oversized body. */
  truncated?: { total_hunks: number; returned_hunks: number; reason: string };
}

// --- changed-files list (parsed from porcelain status + numstat) ----------------------
//
// The status-grouped changed-files list the `ChangesOverview` renders, parsed by
// `parseGitStatus` / `parseGitNumstat` from the verbatim porcelain-v1 + numstat
// output the `/ops/git` pass-through forwards. The flat porcelain `XY path` and
// numstat `adds\tdels\tpath` lines are reconciled into one entry per changed file.

/** The status groups the changed-files list buckets entries into, ordered as the
 *  surface renders them. `staged` carries an index-side change (porcelain X), the
 *  rest a worktree-side change (porcelain Y). */
export type GitChangeGroup =
  | "staged"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

/** One changed file in the working tree, reconciled from porcelain status and
 *  numstat. `code` is the raw two-char porcelain `XY` (the non-color identity);
 *  `adds`/`dels` are the numstat tallies (null for a binary file). */
export interface ChangedFile {
  path: string;
  /** The porcelain two-character `XY` status code (e.g. ` M`, `A `, `??`). */
  code: string;
  /** The single status letter shown as the grayscale-safe mark (M/A/D/R/?). */
  letter: string;
  /** Which status group the entry buckets into. */
  group: GitChangeGroup;
  /** numstat additions; null for a binary file or an entry with no numstat row. */
  adds: number | null;
  /** numstat deletions; null for a binary file or an entry with no numstat row. */
  dels: number | null;
  /** True when the entry is under the `.vault/` corpus. */
  vault: boolean;
}

// --- in-flight pipeline projection (dashboard-pipeline-wire W02) -----------------------
//
// The Work pillar's data: active plans (by lifecycle) and in-flight ADRs (by
// status) in scope, each with progress, status/tier, pipeline phase, and a
// stable node id. Bounded to active artifacts by construction. Wire shapes stay
// snake_case as the live `/pipeline` route serves them under `{data, tiers}`.

/** The pipeline phase an artifact sits in (research → adr → plan → execute →
 *  review), derived engine-side from doc_type and status. */
export type PipelinePhase = "research" | "adr" | "plan" | "execute" | "review";

/** One in-flight pipeline artifact (GET /pipeline data.artifacts). */
export interface PipelineArtifact {
  node_id: string;
  stem: string;
  title?: string;
  doc_type?: string;
  /** ADR status; absent on plans. */
  status?: string;
  /** Plan tier; absent on ADRs. */
  tier?: string;
  /** Plan checkbox progress; absent on ADRs. */
  progress?: { done: number; total: number };
  /**
   * The artifact's feature tags (dashboard-pipeline-status W01): the ADR row's
   * feature label is read from here. Truthful absence — forwarded only when the
   * doc node carries it.
   */
  feature_tags?: string[];
  /**
   * The doc node's created/modified dates (dashboard-pipeline-status W01): the
   * row's freshness stamp is derived from `modified`. Truthful absence — the
   * stamp is hidden when dates are not served.
   */
  dates?: { created?: string; modified?: string };
  phase: PipelinePhase;
}

/** The in-flight pipeline projection (GET /pipeline data). */
export interface PipelineResponse {
  artifacts: PipelineArtifact[];
  tiers: TiersBlock;
}

// --- bounded plan-container interior (dashboard-pipeline-wire W03) ---------------------
//
// The Work pillar's step tree: a plan node's wave → phase → step interior, each
// step bearing completion and the bound exec record, under a node ceiling with
// honest `truncated`. Tier-shape honest: an L1 plan returns flat `steps`, an L2
// plan `phases`, L3/L4 `waves`. Served by `/nodes/{id}/plan-interior`.

export interface InteriorStep {
  node_id: string;
  id: string;
  action?: string;
  done: boolean;
  /** The exec-record document node this step binds to, if any. */
  exec_node_id?: string;
}

export interface InteriorPhase {
  node_id: string;
  id: string;
  heading?: string;
  steps: InteriorStep[];
}

export interface InteriorWave {
  node_id: string;
  id: string;
  heading?: string;
  phases: InteriorPhase[];
}

/** The bounded plan-container interior (GET /nodes/{id}/plan-interior data.interior). */
export interface PlanInterior {
  plan_node_id: string;
  waves: InteriorWave[];
  phases: InteriorPhase[];
  steps: InteriorStep[];
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
}

export interface PlanInteriorResponse {
  interior: PlanInterior;
  tiers: TiersBlock;
}

// --- §8 search ---------------------------------------------------------------------------

export interface SearchResult {
  score: number;
  /** The corpus the hit came from (`vault` | `codebase`) — NOT the identity. The
   *  human identity is `title` (the doc H1) and the click-through is `node_id`. */
  source: string;
  /** The human title the rag wire carries (the document's H1 / the code symbol or
   *  file) — the pill's primary line. Absent on the text-match fallback. */
  title?: string;
  /** Short preview line (rag `snippet`/`excerpt`/`text`) — the Compact pill's body. */
  excerpt?: string;
  /** Full reranker context body (rag `rerank_text`) — the editorial long-form source. */
  rerank_text?: string;
  // Vault metadata (present for `source: "vault"` hits; mirrors the rag wire verbatim).
  doc_type?: string;
  feature?: string;
  date?: string;
  // Code metadata (present for `source: "codebase"` hits).
  language?: string;
  line_start?: number;
  line_end?: number;
  node_type?: string;
  function_name?: string;
  class_name?: string;
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
  /** The serialized dock workspace layout (editor-dock-workspace): an opaque JSON
   *  string carrying the open-document tab set + active tab for this scope.
   *  Persisted in the DURABLE per-scope session blob (SQLite-backed), so the
   *  workspace restores across reloads AND engine restarts. Absent until the
   *  workspace first persists a layout. */
  workspace_layout?: string;
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

/** The dock workspace-layout part of a PUT /session body (editor-dock-workspace).
 *  `scope` selects the scope (absent = active); `layout` is the opaque serialized
 *  layout blob, or null to clear it. Applied as a MERGE into the scope's session
 *  context, so it preserves the folder + feature-tag context (and vice versa). */
export interface WorkspaceLayoutUpdate {
  scope?: string;
  layout?: string | null;
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
  /** Persist the dock workspace layout for a scope (editor-dock-workspace),
   *  merged into the durable per-scope session context. */
  set_workspace_layout?: WorkspaceLayoutUpdate;
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

// --- settings schema (dashboard-settings W01/W02) -----------------------------
//
// The engine-owned settings registry served by GET /settings/schema: the single
// source of truth the client renders controls and synthesizes defaults from. The
// wire stays string-valued (the {global, scoped} maps above); these types carry
// the TYPING + UI hints so the dialog renders schema-driven controls and the
// effective-value selector decodes by declared type. Shapes mirror the live
// `vaultspec_session::settings_schema` serialization exactly (snake_case, the
// tagged `value_type`).

/** A setting's value type + constraints (the tagged `value_type`). The client
 *  decodes the string wire value by this and validates optimistically. */
export type SettingValueType =
  | { type: "enum"; members: string[] }
  | { type: "bool" }
  | { type: "string"; max_len: number }
  | { type: "integer"; min: number; max: number }
  // The keybinding override map (keyboard-action-system W02): the value is a JSON
  // OBJECT STRING `{action_id: chord}`, bounded by `max_entries`
  // (bounded-by-default-for-every-accumulator). The client decodes it into a
  // `KeybindingOverrides` map; the engine enforces the same entry cap.
  | { type: "keybindings"; max_entries: number };

/** The UI control a setting renders as (the schema-driven render hint). The
 *  `keybinding` kind renders the chord-recorder catalog (KeybindingControl). */
export type SettingControlKind =
  | "segmented"
  | "switch"
  | "text"
  | "slider"
  | "keybinding";

/** One declared setting (GET /settings/schema data.settings[]). */
export interface SettingDef {
  key: string;
  value_type: SettingValueType;
  /** The default wire value (string form) when no row exists. */
  default: string;
  /** Whether a per-scope override is allowed (false = global only). */
  scope_eligible: boolean;
  control: SettingControlKind;
  label: string;
  description: string;
  group: string;
  order: number;
  /** Slider step (slider controls only). */
  step?: number;
  /** Unit suffix for display, e.g. "%" (slider controls only). */
  unit?: string;
  /** Placeholder hint for an empty field (text controls only). */
  placeholder?: string;
}

/** The served settings schema (GET /settings/schema data): the declared settings
 *  plus the engine-owned group display order. */
export interface SettingsSchema {
  settings: SettingDef[];
  groups: string[];
  tiers: TiersBlock;
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
   * Swap the transport at runtime. The app always talks to the live engine; the
   * test harness uses this to point the app-wide client at the spawned
   * `vaultspec serve` over its loopback origin (testing/liveSetup).
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

  /** One bounded, ignore-aware directory level of the worktree file tree
   *  (dashboard-code-tree ADR): metadata only (no bytes), `path` defaults to the
   *  worktree root, `cursor` resumes a paginated level, `page_size` clamps a
   *  level. Each child carries the shared `code:<path>` interlink node id. */
  async fileTree(params: {
    scope: string;
    path?: string;
    cursor?: string;
    page_size?: number;
  }): Promise<FileTreeResponse> {
    return adaptFileTree(
      await this.get("/file-tree", {
        scope: params.scope,
        path: params.path,
        cursor: params.cursor,
        page_size: params.page_size,
      }),
    );
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

  /**
   * The dedicated bounded embedding read (graph-semantic-embeddings ADR D2):
   * rag's stored dense vectors for the SERVED document node set, fetched LAZILY
   * only on entering semantic mode and cached per generation (the stores hook
   * owns the laziness). `lens`/`focus` keep the embedding set aligned with
   * `/graph/query`'s DOI-ordered served node set. NEVER inline on `/graph/query`
   * — the default constellation path pays no embedding tax. The tolerant adapter
   * reconciles the wire shape; the stores layer reads semantic availability from
   * the `tiers` block (ADR D7), never a bare transport error.
   */
  async graphEmbeddings(params: {
    scope: string;
    lens?: SalienceLens;
    focus?: string | null;
  }): Promise<EmbeddingsResponse> {
    return adaptGraphEmbeddings(
      await this.get("/graph/embeddings", {
        scope: params.scope,
        lens: params.lens,
        focus: params.focus ?? undefined,
      }),
    );
  }

  async filters(scope: string): Promise<FiltersVocabulary> {
    return adaptFilters(await this.get("/filters", { scope }));
  }

  async dashboardState(scope: string): Promise<DashboardState> {
    return adaptDashboardState(await this.get("/dashboard-state", { scope }));
  }

  async patchDashboardState(body: DashboardStatePatch): Promise<DashboardState> {
    const state = adaptDashboardState(await this.patch("/dashboard-state", body));
    return body.graph_bounds === undefined
      ? state
      : { ...state, graph_bounds: body.graph_bounds };
  }

  /** The in-flight pipeline projection (dashboard-pipeline-wire W02): active
   *  plans + in-flight ADRs in scope. */
  async pipeline(scope: string): Promise<PipelineResponse> {
    return adaptPipeline(await this.get("/pipeline", { scope }));
  }

  node(id: string, scope?: string): Promise<NodeDetail> {
    return this.get(`/nodes/${encodeURIComponent(id)}`, { scope });
  }

  /** The read-only, bounded content fetch (review-rail-viewers ADR): the bytes of
   *  the document or source file the node id names, keyed on the stable id
   *  (`doc:<stem>` / `code:<path>`). The id is `encodeURIComponent`-encoded so a
   *  `code:<path>` id's slashes stay one path segment. `scope` is optional (absent
   *  = the active scope, the nodes-family convention). The tolerant adapter
   *  reconciles the wire shape; the viewers read the `tiers` block for degraded
   *  state. */
  async content(id: string, scope?: string): Promise<ContentResponse> {
    return adaptContent(
      await this.get(`/nodes/${encodeURIComponent(id)}/content`, { scope }),
    );
  }

  nodeNeighbors(
    id: string,
    params: { depth?: number; tiers?: string; scope?: string } = {},
  ): Promise<GraphSlice> {
    return this.get(`/nodes/${encodeURIComponent(id)}/neighbors`, params);
  }

  nodeEvidence(id: string, scope?: string): Promise<NodeEvidence> {
    return this.get(`/nodes/${encodeURIComponent(id)}/evidence`, { scope });
  }

  /** The bounded plan-container interior of a plan node (dashboard-pipeline-wire
   *  W03): the wave/phase/step tree under a node ceiling. */
  async planInterior(id: string, scope?: string): Promise<PlanInteriorResponse> {
    return adaptPlanInterior(
      await this.get(`/nodes/${encodeURIComponent(id)}/plan-interior`, { scope }),
    );
  }

  discover(id: string, scope?: string): Promise<DiscoverResponse> {
    return this.post(`/nodes/${encodeURIComponent(id)}/discover`, { scope });
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

  /** The bounded, read-only recent-commit history (status-overview ADR): the
   *  last N commits with subjects for a scope, newest-first. `limit` is optional
   *  (the engine defaults to ~20 and clamps a large value to a hard ceiling). The
   *  tolerant adapter reconciles the wire shape; the rail reads degraded state
   *  from the `tiers` block. */
  async history(params: {
    scope: string;
    limit?: number;
    cursor?: string;
  }): Promise<HistoryResponse> {
    return adaptHistory(await this.get("/history", params));
  }

  /** Open or recently-merged pull requests for a scope (status-rail redesign),
   *  brokered engine-side through the bounded `gh` CLI. `state` is `open`
   *  (default) or `merged`; the tolerant adapter reconciles the wire shape and
   *  carries the capability-local `available`/`reason` the rail degrades on. */
  async prs(params: {
    scope: string;
    state?: "open" | "merged";
    limit?: number;
  }): Promise<PRsResponse> {
    return adaptPrs(await this.get("/prs", params));
  }

  /** Open (or closed) issues for a scope (status-rail redesign), brokered
   *  engine-side through the bounded `gh` CLI; tolerant adapter, capability-local
   *  `available`/`reason`. */
  async issues(params: {
    scope: string;
    state?: "open" | "closed";
    limit?: number;
  }): Promise<IssuesResponse> {
    return adaptIssues(await this.get("/issues", params));
  }

  /** The bounded temporal-lineage projection (dashboard-timeline ADR, contract
   *  §5): for a scope and an inclusive `[from, to]` ISO `yyyy-mm-dd` date range
   *  (either bound optional/open), the dated document nodes in range plus the
   *  self-consistent edges among them. `filter` is the engine-owned wire filter
   *  as a URL-encoded JSON string, exactly as `/graph/lineage` accepts it (the
   *  same grammar `/graph/query` uses). Built and unwrapped through the same
   *  client path as `events`/`graphQuery`; the tolerant adapter reconciles the
   *  slice shape. */
  async lineage(params: {
    scope: string;
    from?: string;
    to?: string;
    filter?: string;
    /** Optional as-of time-travel token (ts | sha | ref) — when present the engine
     *  serves BLOB-TRUE lineage as it existed at T (dashboard-timeline ADR fast-
     *  follow). Absent = lineage over the live graph. */
    t?: string;
  }): Promise<LineageSlice> {
    return adaptLineageSlice(await this.get("/graph/lineage", params));
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

  /** A document WRITE op (document-editor backend): `set-body` | `set-frontmatter`
   *  | `edit` | `rename` against `POST /ops/core/{verb}/write`. The engine forwards core's
   *  `{schema, status, data}` envelope VERBATIM under `data.envelope` with the
   *  tiers block (engine-read-and-infer), HTTP 200 for both success and business-
   *  refusal; the caller interprets the outcome via `adaptOpsWrite`, branching on
   *  the envelope status + data, never the HTTP code. */
  opsCoreWrite(verb: string, body: OpsWriteBody): Promise<OpsResult> {
    return this.post(`/ops/core/${encodeURIComponent(verb)}/write`, body);
  }

  /** A document CREATE op (document-editor backend): `POST /ops/core/create`. The
   *  engine forwards core's `vaultspec.vault.add.v1` `created` envelope verbatim
   *  under `data.envelope` with the tiers block; `adaptOpsWrite` yields the new
   *  doc's path + stem. */
  opsCoreCreate(body: OpsCreateBody): Promise<OpsResult> {
    return this.post("/ops/core/create", body);
  }

  /** A feature-archive op: `POST /ops/core/archive` forwards
   *  `vaultspec-core vault feature archive <tag>`. The engine validates/bounds the
   *  feature token and forwards core's envelope VERBATIM under `data.envelope` with
   *  the tiers block (engine-read-and-infer); HTTP 200 for both a success and a
   *  business refusal (e.g. unknown tag), the caller branching on the envelope. */
  opsCoreArchive(body: OpsArchiveBody): Promise<OpsResult> {
    return this.post("/ops/core/archive", body);
  }

  /** The brokered rag READ verbs (rag-control-plane ADR D2): a GET against the
   *  one `/ops/rag/{verb}` namespace (service-state, jobs, watcher, projects,
   *  readiness, logs, metrics). rag's envelope is forwarded VERBATIM under
   *  `data.envelope` with the tiers block, so the unwrapped result is
   *  `{envelope, tiers}`. The control plane reads degraded state from `tiers`,
   *  never a transport error (degradation-is-read-from-tiers). */
  opsRagGet<T = unknown>(
    verb: string,
    params?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<{ envelope: T | null; tiers: TiersBlock }> {
    return this.get(`/ops/rag/${encodeURIComponent(verb)}`, params, signal);
  }

  /** The read-only git pass-through (dashboard-pipeline-wire W04; historical diff
   *  figma-parity-reconciliation S14): a whitelisted read-only git verb
   *  (`status` | `numstat` | `diff` | `histdiff`), git output forwarded verbatim.
   *  The `diff` verb requires a `path`; `histdiff` requires `path` plus the
   *  `from`/`to` revs of the two-rev historical diff; `status`/`numstat` take
   *  none. */
  async opsGit(
    verb: "status" | "numstat" | "diff" | "histdiff",
    body: { scope?: string; path?: string; from?: string; to?: string } = {},
  ): Promise<GitOpResponse> {
    return adaptGitOp(await this.post(`/ops/git/${encodeURIComponent(verb)}`, body));
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
  async search(
    body: {
      scope?: string;
      query: string;
      target?: "vault" | "code";
      filters?: Record<string, string>;
    },
    signal?: AbortSignal,
  ): Promise<SearchResponse> {
    return adaptSearch(await this.post("/search", body, signal)) as SearchResponse;
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

  /** Persist a single settings write; returns the full updated settings. A
   *  rejected write (unknown key / bad value / scope-not-allowed) throws an
   *  EngineError whose `errorKind` names the typed reason. */
  async putSettings(body: SettingUpdate): Promise<SettingsState> {
    return adaptSettings(await this.put("/settings", body));
  }

  /** Read the engine-owned settings schema registry — the single source of
   *  truth the client renders controls and synthesizes defaults from. */
  async settingsSchema(): Promise<SettingsSchema> {
    return adaptSettingsSchema(await this.get("/settings/schema"));
  }

  // --- transport -----------------------------------------------------------

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
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
    const response = await this.fetchImpl(url, signal ? { signal } : undefined);
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
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

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await engineErrorFrom(path, response);
    return unwrapEnvelope(await response.json()) as T;
  }
}

/** The app-wide default client, bound to the live engine origin. */
export const engineClient = new EngineClient();
