// Decomposed from engine.ts (module-decomposition mandate, 2026-07-12).

import type { TiersBlock } from "./tiers";

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
  /** The document's H1 title (engine-served on every vault-tree row); absent when
   *  the document carries none. A match field for the files(vault) search
   *  provider (search-providers ADR) — a document is findable by its title, not
   *  just its stem. */
  title?: string;
  feature_tags: string[];
  // All day-granular ISO strings ("YYYY-MM-DD") AFTER adaptation, so the rail's
  // date narrow compares them directly with the `date_range` bounds by the active
  // `date_field` criterion (Issue #38). `modified` arrives on the wire as epoch
  // millis and is normalized to this form by `adaptVaultTreeDates`.
  dates: { created?: string; modified?: string; stamped?: string };
  /** ADR H1 status (dashboard-pipeline-wire W01), when the entry is an ADR. */
  status?: string;
  /** Plan tier (dashboard-pipeline-wire W01), when the entry is a plan. */
  tier?: string;
  /** Plan checkbox lifecycle progress (done/total) for the active scope,
   *  projected from the SAME `lifecycle_in_scope` facet the node-graph pipeline
   *  reads. Present only on plan rows that carry checkbox progress; absent
   *  everywhere else so the left rail paints the honest not-started baseline. */
  progress?: { done: number; total: number };
  /** Ingest-measured document weight (left-rail-tree-controls ADR D2): byte
   *  length + whitespace-separated word count of the body. Absent on an older
   *  engine or a node that carries none — honest absence, the rail renders
   *  nothing (never a fabricated zero). */
  size?: { bytes: number; words: number };
}

export interface VaultTreeResponse {
  entries: VaultTreeEntry[];
  tiers: TiersBlock;
  /** False while a progressive partial (the first page rendered ahead of the
   *  continuing drain — universal-data-loading ADR D5) is held; true (or
   *  absent, for cached pre-flag shapes) once the walk drained to completion.
   *  Client narrowing over an incomplete listing must surface the honest
   *  partial state (the complete-set law applies at the moment a narrow
   *  lands on the finished listing). */
  complete?: boolean;
  /** The engine graph `generation` the drained rows belong to (vault-tree-delta
   *  ADR D1). The client records it so a later generation-invalidation sweep can
   *  fetch a `since=<generation>` delta and patch this listing instead of
   *  re-draining it. Absent on an older engine or a partial mid-drain listing —
   *  a listing with no known generation has no delta baseline and re-drains. */
  generation?: number;
}

/** The engine-reduced generation-keyed delta response (vault-tree-delta ADR D3),
 *  KEY-GENERIC over the row entry type: a diff from the client's held generation to
 *  the current one, or a full-drain instruction when the baseline is no longer a
 *  stable complete set (evicted/restarted, or — for code — a truncated corpus).
 *  `/vault-tree/delta` keys `Entry` by stem; `/code-files/delta` by path. */
export interface RowDeltaResponse<Entry> {
  /** The current graph generation the delta (or full-drain) is against. */
  generation: number;
  /** True when `since` is no longer a valid baseline: the client must re-drain the
   *  whole listing rather than patch. Mutually exclusive with a diff. */
  full_required?: boolean;
  /** The client's baseline generation, echoed on a real diff. */
  since?: number;
  /** Rows added or modified since `since` — full entries to merge in by key. */
  changed?: Entry[];
  /** Row keys dropped since `since` — remove these from the held listing. */
  removed?: string[];
  tiers: TiersBlock;
}

/** The `/vault-tree/delta` response (rows keyed by stem). */
export type VaultTreeDeltaResponse = RowDeltaResponse<VaultTreeEntry>;

/** The `/code-files/delta` response (rows keyed by path). */
export type CodeFilesDeltaResponse = RowDeltaResponse<CodeFileEntry>;

// The complete code-file listing (search-providers ADR: the one contract event).
// One minimal row per `code:` file node projected off the code corpus graph —
// NOT the DOI-bounded graph slice — so the files(code) search provider narrows a
// COMPLETE client-held listing (the complete-paginated-set rule), never a capped
// slice that would silently miss files.
export interface CodeFileEntry {
  /** Repo-relative POSIX path — the node key and the display path. */
  path: string;
  /** The `code:{path}` graph node id, so a hit is directly navigable through
   *  the shared open verb (no separate resolution). */
  node_id: string;
  /** The file's display title (a package-entry file shows its package name);
   *  absent when the node carries none. */
  title?: string;
  /** Wire language token (`rust`/`typescript`/`javascript`/`python`), when the
   *  path extension classifies; absent for an unclassified extension. */
  lang?: string;
}

/** Honest walk-cap truncation (search-providers ADR / ADR D8): present only when
 *  the ingest walk cap bounded the corpus, so the listing is NOT the complete
 *  source tree. `null`/absent means the walk ran to completion. */
export interface CodeFilesTruncation {
  returned_files: number;
  reason: string;
}

export interface CodeFilesResponse {
  entries: CodeFileEntry[];
  tiers: TiersBlock;
  truncated: CodeFilesTruncation | null;
  /** True once the client walk drained to completion (always, for this non-partial
   *  listing); paired with `generation` it is a valid delta baseline — but ONLY when
   *  `truncated` is null (a capped corpus is not a stable complete set). */
  complete?: boolean;
  /** The code graph `generation` the drained rows belong to (vault-tree-delta ADR
   *  `/code-files` follow-on). The reconcile fetches a `since=<generation>` delta and
   *  patches this listing. OMITTED when the corpus is truncated — a capped listing has
   *  no stable delta baseline and re-drains. */
  generation?: number;
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

// --- filesystem browse picker (single-app-runtime ADR O6) -----------------------
//
// `GET /fs/list[?path=<absolute dir>]`: bounded, read-only OS directory browsing
// for the add-project picker. Without `path` it lists the filesystem roots (drive
// letters on Windows, `/` elsewhere); with an absolute `path` it lists that
// directory's immediate SUBDIRECTORIES only, name-sorted and capped. Each row
// carries the two markers the picker renders: `is_managed` (has a `.vault`) and
// `is_git` (has a `.git`) — a plain git repo the picker can register vs. one
// already vaultspec-managed.

export interface FsListEntry {
  name: string;
  path: string;
  is_managed: boolean;
  is_git: boolean;
}

export interface FsListResponse {
  /** The listed directory's absolute path; null at the filesystem-roots level. */
  path: string | null;
  /** The listed directory's parent path; null at the roots level or a root itself. */
  parent: string | null;
  entries: FsListEntry[];
  /** True when the 256-row cap clipped this level's entries. */
  truncated: boolean;
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
 *  `language_hint` is the engine's path-derived grammar hint (the viewer
 *  maps it to a Shiki grammar, degrading to plain text on an unknown hint);
 *  `blob_hash` is the git-style blob oid that content-addresses the cache entry. */
export interface ContentResponse {
  /** Repo-relative POSIX path of the served file. */
  path: string;
  /** Git-style blob oid of the bytes — content-addresses the cache entry. */
  blob_hash: string;
  /** Full byte length of the file (before any truncation). */
  byte_len: number;
  /** Path-derived highlighter grammar hint; null when none applies. */
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
  degree_by_tier?: Partial<Record<"declared" | "structural" | "temporal", number>>;
  /**
   * Aggregation anchors (constellation granularity, engine addendum S02): how
   * many members converge on the node — documents for a feature convergence,
   * member FILES for a code package-rollup representative
   * (code-graph-files-only). Drives the center-of-gravity sizing (ADR D4.1);
   * absent on document nodes and file-granularity code nodes.
   */
  member_count?: number;
  /**
   * CODE corpus (codebase-graphing CGR-002): served on code file nodes to
   * drive module-identity colouring. `module` is the owning top-level module key;
   * `module_hue` is the 0..6 ordered-palette index assigned to the top-seven
   * modules by member count (`null` for the long-tail); `depth` is the path-segment
   * depth. Backend-served + memoized per generation; absent on vault nodes.
   */
  module?: string;
  module_hue?: number | null;
  depth?: number;
  /**
   * CODE corpus package identity (code-graph-files-only): `package` is the
   * directory of the package the file belongs to (`null` for a standalone
   * file; `""` names the repository root); `package_entry` is true on the one
   * file that DISPLAYS as its package (`__init__.py` / `mod.rs` / `lib.rs` /
   * `index.*`) — the anchor the scene renders as the package.
   */
  package?: string | null;
  package_entry?: boolean;
  /**
   * Engine-served recency percentile over the code corpus (code-graph-heat ADR):
   * a dated file's worktree-mtime rank in [0, 1] (0 = oldest, 1 = newest); a
   * package-rollup representative carries its members' max. Computed over the
   * FULL pre-truncation set, stable under narrowing. Absent on undated files
   * and vault nodes.
   */
  recency_rank?: number;
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
  tier: "declared" | "structural" | "temporal";
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
  min_confidence?: Partial<Record<"temporal", number>>;
  relations?: string[];
  structural_state?: ("resolved" | "stale" | "broken")[];
  kinds?: string[];
  doc_types?: string[];
  feature_tags?: string[];
  /** Glob/regex search over feature tags (filter-controls campaign): a node
   *  passes if any of its feature_tags matches. The feature search graduates to
   *  this for power queries; distinct from exact `feature_tags` membership. */
  feature_query?: { value: string; mode: "glob" | "regex" };
  statuses?: string[];
  plan_tiers?: string[];
  /** Plan lifecycle states (engine-served, NEVER frontend-derived): `active`
   *  (in progress) / `complete` (finished). A node passes if its scoped lifecycle
   *  state is in this set; nodes with no lifecycle are excluded when it is set. */
  plan_states?: string[];
  /** Document-health conditions (filter-controls campaign): `dangling`/`orphaned`
   *  (engine-derived) + `invalid`/`empty-scaffold` (with core ingestion). A node
   *  passes if it carries any requested condition. */
  health?: string[];
  date_range?: { from?: string; to?: string };
  /** Which date field the `date_range` window filters by (Issue #14): `created`
   *  (default), `modified`, or `stamped`. Omitted = `created` — so the value is
   *  only ever sent for a non-default criterion (and only when the engine advertises
   *  `date_bounds_by_field`, i.e. supports it), keeping an older engine unaffected. */
  date_field?: "created" | "modified" | "stamped";
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

// The active graph corpus / view mode (codebase-graphing ADR D7): which dataset
// the whole graph surface renders — the vault knowledge graph (default) or the
// disconnected code graph. Mirrors the engine `GraphCorpus` wire enum.
export const GRAPH_CORPORA = ["vault", "code"] as const;
export type GraphCorpus = (typeof GRAPH_CORPORA)[number];

export const REPRESENTATION_MODES = [
  "connectivity",
  "temporal",
  "lineage",
  "hierarchical",
  "radial",
  "community",
] as const;
export type RepresentationMode = (typeof REPRESENTATION_MODES)[number];

export const DASHBOARD_PANEL_TABS = ["status", "changes"] as const;
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
  corpus: GraphCorpus;
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
  corpus?: GraphCorpus;
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
  /** The engine graph `generation` this present-view document slice belongs to
   *  (graph-slice-delta ADR D2), present ONLY on the delta-eligible present-view
   *  document vault slice (null on as-of/feature/code). Passed through `...rest` by
   *  `adaptGraphSlice`; the live-sync splice uses it as the `since` delta baseline. */
  generation?: number | null;
  /** The opaque params-fingerprint token the client returns verbatim in a
   *  `/graph/query/delta` request (graph-slice-delta ADR D3, guard #1) — the ring
   *  keys on it, so no client-side canonicalization can drift the lookup. Present
   *  only alongside a numeric `generation`. */
  slice_token?: string;
}

/** The engine-reduced `/graph/query/delta` response (graph-slice-delta ADR D3): an
 *  id-keyed node + edge diff from the client's held generation to the current one,
 *  or a full-drain instruction when the (token, generation) pair is not retained or
 *  truncation composition differs. */
export interface GraphSliceDeltaResponse {
  generation: number;
  full_required?: boolean;
  since?: number;
  changed_nodes?: EngineNode[];
  removed_node_ids?: string[];
  changed_edges?: EngineEdge[];
  removed_edge_ids?: string[];
  truncated?: { total_nodes: number; returned_nodes: number; reason: string } | null;
  tiers: TiersBlock;
}

export interface FiltersVocabulary {
  relations: string[];
  tiers: string[];
  doc_types: string[];
  feature_tags: string[];
  kinds: string[];
  /** ADR status adjectives (proposed/accepted/rejected/deprecated) — the
   *  DECISION STATUS lifecycle facet. */
  statuses?: string[];
  /** Plan complexity tiers (L1–L4). */
  plan_tiers?: string[];
  /** Plan lifecycle states present in the corpus (`active`/`complete`) — the
   *  PLAN STATUS facet. Empty when no lifecycle-bearing docs exist. */
  plan_states?: string[];
  /** Document-health conditions present in the corpus (filter-controls campaign):
   *  the `dangling`/`orphaned` HEALTH facet, empty when the corpus is clean. */
  health?: string[];
  date_bounds?: { from?: string; to?: string };
  /** Per-criterion corpus date spans (Issue #14): the timeline's left/right edges
   *  for each selectable date field. A criterion is omitted when no node carries it
   *  (honest degradation — the timeline keeps that criterion disabled). `date_bounds`
   *  above remains the `created` span for back-compat. Present only on an engine that
   *  serves it — its presence is the capability gate for enabling Modified/Stamped. */
  date_bounds_by_field?: {
    created?: { from?: string; to?: string };
    modified?: { from?: string; to?: string };
    stamped?: { from?: string; to?: string };
  };
  tiers_block?: TiersBlock;
}

/**
 * The pipeline document types the feature-coverage projection reports, in pipeline
 * order (research/reference are the parallel entry points → adr → plan → exec →
 * audit). Mirrors the engine `PIPELINE_DOC_TYPES` (feature-group-authoring ADR
 * D2/D3): the canonical order the panel iterates, so a sparse served `types` array
 * still renders every pipeline slot. `exec` is reported for coverage but is NEVER
 * offered for creation from the panel (ADR D4).
 */
export const PIPELINE_COVERAGE_DOC_TYPES = [
  "research",
  "reference",
  "adr",
  "plan",
  "exec",
  "audit",
] as const;

/**
 * Coverage of one pipeline doc type within a feature group (feature-group-authoring
 * ADR D2/D3, the `/features?feature=` wire): whether at least one document of the
 * type exists, how many, the newest present stem (the deterministic cross-link
 * target, ADR D5), the served hierarchy-gate `eligible` flag, and a `note` token
 * the dumb chrome maps to plain language (`requires-research-or-reference`,
 * `requires-adr`, `plan-derived`, `no-upstream`). Eligibility is engine-served
 * guidance, never client-recomputed (ADR D3).
 */
export interface FeatureTypeCoverage {
  doc_type: string;
  present: boolean;
  count: number;
  /** The newest present stem (the pre-fill link target); absent when missing. */
  newest_stem?: string;
  /** The served hierarchy gate — whether this type may be created right now. */
  eligible: boolean;
  /** A token naming why the type is ineligible, or an advisory when eligible. */
  note?: string;
}

/**
 * Full pipeline coverage for one feature group (`GET /features?scope=&feature=`,
 * unwrapped from the `{data: {coverage}, tiers}` envelope). An unknown feature (a
 * brand-new one being started in the panel) reads as all-missing coverage — the
 * "start a new feature" state — never a 404.
 */
export interface FeatureCoverage {
  feature: string;
  /** One entry per pipeline doc type, in pipeline order. */
  types: FeatureTypeCoverage[];
  /** The pipeline doc types with no document present, in pipeline order. */
  missing: string[];
  /** The advised next pipeline link to close; absent once the chain is satisfied. */
  next_step?: string;
}

/**
 * A compact per-feature roster entry (`GET /features?scope=`, the all-features
 * variant): the feature tag, its document counts, and the advised next step —
 * enough for the panel's feature combobox to show group progress without a
 * per-feature round trip.
 */
export interface FeatureRosterEntry {
  feature: string;
  doc_count: number;
  types_present: number;
  next_step?: string;
}

/** The per-feature coverage response (feature-present variant), unwrapped. */
export interface FeatureCoverageResponse {
  coverage: FeatureCoverage;
  tiers: TiersBlock;
}

/** The all-features roster response (feature-absent variant), unwrapped. */
export interface FeatureRosterResponse {
  roster: FeatureRosterEntry[];
  tiers: TiersBlock;
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
  /** A one-line headline summary of the document — the doc body's first prose
   *  line, filled by the `/nodes/{id}` route (node_detail summary route-fill).
   *  Present only for content-bearing DOC nodes; absent for synthesized
   *  feature/constellation nodes (no body) — an honest absence the hover card
   *  renders by omitting the summary line. */
  summary?: string;
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
