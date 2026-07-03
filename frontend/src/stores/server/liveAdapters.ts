// Live-origin adapters (W03.P12.S49): the anti-corruption layer between
// the live serve wire and the client's internal contract types. The
// contract is binding at capability level with shapes illustrative; the
// live engine settled several shapes differently (the `{data, tiers}`
// envelope, a flat workspace map, a vocabulary wrapper, stem-keyed vault
// trees, an index-rollup status). Each adapter is TOLERANT: a body already
// in the internal shape (the mock) passes through unchanged, so one client
// code path serves both origins — the S49 verification property.
//
// Capability-level divergences that an adapter cannot honestly paper over
// are NOT absorbed here; they are flagged in the S49 record and to the
// engine owners (loose-scoping stance).

import { CANONICAL_TIERS } from "./engine";
import type {
  ChangedFile,
  CodeFileEntry,
  CodeFilesResponse,
  CodeFilesTruncation,
  ContentResponse,
  ContentTruncated,
  DashboardState,
  EmbeddingsResponse,
  EngineEdge,
  EngineNode,
  EngineStatus,
  FileTreeEntry,
  FileTreeResponse,
  FileTreeTruncated,
  FiltersVocabulary,
  GitChangeGroup,
  GitDiffHunk,
  GitDiffLine,
  GitFileDiff,
  GitOpResponse,
  GraphCorpus,
  GraphSlice,
  HistoryCommit,
  HistoryResponse,
  HistoryTruncated,
  InteriorPhase,
  InteriorRollup,
  InteriorStep,
  InteriorWave,
  Issue,
  IssuesResponse,
  LineageArc,
  LineageNode,
  LineagePhase,
  LineageSlice,
  MapResponse,
  NodeDetail,
  NodeEmbedding,
  NodeEvidence,
  PipelineArtifact,
  PipelinePhase,
  PipelineResponse,
  PlanInterior,
  PlanInteriorResponse,
  PlanSummary,
  PrChecks,
  PRsResponse,
  PullRequest,
  RecentScope,
  ScopeContextWire,
  SearchIndexState,
  SearchResponse,
  SessionState,
  SettingControlKind,
  SettingDef,
  SettingsSchema,
  SettingsState,
  SettingValueType,
  TiersBlock,
  VaultTreeEntry,
  VaultTreeResponse,
  WireMetaEdge,
  WorkspaceRoot,
  WorkspacesState,
} from "./engine";
import { normalizeDashboardDateRange } from "./dashboardDateRange";
import { normalizeStoreScope, SCOPE_ID_MAX_CHARS } from "./scopeIdentity";
import { normalizeWorkspaceLayoutBlob } from "../workspaceLayout";
import {
  cloneDashboardFilters,
  normalizeDashboardGraphBounds,
  normalizeDashboardGraphCorpus,
  normalizeDashboardGraphGranularity,
  normalizeDashboardNodeId,
  normalizeDashboardPanelState,
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  normalizeDashboardSelectedIds,
  normalizeDashboardTimelineMode,
} from "./dashboardStateNormalization";
import { normalizeNodeId, normalizeNodeIds } from "../nodeIds";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

/**
 * Unwrap the live `{data, tiers}` envelope (and the events family's extra
 * `{payload}` nesting) onto the internal flat-with-tiers shape. Flat
 * bodies pass through.
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRec(body) || !isRec(body.data) || !("tiers" in body)) return body;
  let data = body.data;
  if (isRec(data.payload) && Object.keys(data).length <= 2) {
    // events: {data: {payload: {...}, shape}} → payload
    data = data.payload;
  }
  // A cursor-paginated route (e.g. /file-tree) carries `next_cursor` as a SIBLING
  // of `data` at the envelope top level (vaultspec-api `envelope(data, tiers,
  // next_cursor)`), not inside `data`. Preserve it onto the flattened body so the
  // pagination consumer can read it; absent on a non-paginated or last-page
  // response. Flat (already-unwrapped, e.g. mock) bodies hit the guard above and
  // pass through with their own `next_cursor` intact.
  const flat: Rec = { ...data, tiers: body.tiers as TiersBlock };
  if (typeof body.next_cursor === "string") flat.next_cursor = body.next_cursor;
  return flat;
}

// --- §4 graph slice: fold the separate meta-edge array into edges ----------------

/**
 * The tier treatment a constellation ribbon takes: the tier carrying the most
 * underlying edges in the aggregation (ties resolve by canonical order). A
 * meta-edge spans tiers, but the line treatment needs one — the dominant tier
 * is the honest single answer. Ties resolve by the canonical edge-tier order
 * (`EDGE_TIER_ORDER`). The engine never mints a semantic graph edge (ADR D3.5),
 * so semantic is never a candidate — a stray `semantic` key in the incoming
 * breakdown is ignored. An empty/all-zero breakdown (degenerate; the live engine
 * never emits one) falls back to `structural`, the tier of the cross-feature
 * mentions that produce meta-edges.
 */
const EDGE_TIER_ORDER: readonly EngineEdge["tier"][] = [
  "declared",
  "structural",
  "temporal",
];

function dominantTier(breakdown: Record<string, number>): EngineEdge["tier"] {
  let best: EngineEdge["tier"] = "structural";
  // Seed at 0 so a tier only wins on a POSITIVE count: an empty breakdown
  // keeps the `structural` default rather than the first-enumerated tier.
  let bestCount = 0;
  for (const tier of EDGE_TIER_ORDER) {
    const count = breakdown[tier] ?? 0;
    if (count > bestCount) {
      best = tier;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One wire meta-edge → the internal edge representation. The wire carries no
 * id/relation/tier, so synthesize: a stable identity-bearing id from the
 * endpoint pair (provenance-stable, re-derives identically), the `related`
 * relation, the dominant tier for line treatment, and the aggregation payload
 * on `meta` (the ribbon's width-by-count and hover breakdown).
 */
export function metaEdgeToEdge(meta: WireMetaEdge): EngineEdge {
  // Use JSON-encoded endpoint pair as the id suffix to avoid collisions when
  // an endpoint id itself contains the "->" separator (provenance-stable-keys).
  return {
    id: `meta:${JSON.stringify([meta.src, meta.dst])}`,
    src: meta.src,
    dst: meta.dst,
    relation: "related",
    tier: dominantTier(meta.breakdown_by_tier),
    confidence: 1,
    meta: { count: meta.count, breakdown_by_tier: meta.breakdown_by_tier },
  };
}

/**
 * Live `/graph/query` settles constellation relationships in a SEPARATE
 * top-level `meta_edges` array at feature granularity (engine addendum S02),
 * with `edges` empty. Fold those into the internal edge list so one downstream
 * path renders both granularities. TOLERANT: a body without `meta_edges`
 * (document granularity, or any origin that already inlined them) passes
 * through unchanged — the S49 one-code-path property. (`/graph/asof` stays on
 * the document path: its constellation-granularity shape is the open S50
 * divergence, out of scope here.)
 */
/** Defensive CLIENT-SIDE payload ceilings (bounded-by-default at the trust boundary):
 *  the engine bounds slices server-side, but the client must NOT trust the wire — an
 *  adversarial or buggy unbounded payload would exhaust client memory. These clamp the
 *  mapped slice and surface honest truncation (never a silent partial). Set well above
 *  any normal bounded slice so they only fire on a runaway/hostile payload. */
export const MAX_CLIENT_GRAPH_NODES = 20000;
export const MAX_CLIENT_GRAPH_EDGES = 80000;

export function adaptGraphSlice(
  body: unknown,
  options?: { corpus?: GraphCorpus },
): GraphSlice {
  if (!isRec(body)) return body as GraphSlice;
  // The code corpus (codebase-graphing ADR D1/D7) is a DIFFERENT dataset whose
  // `code:` file nodes are the legitimate content (code-graph-files-only: files
  // are its ONLY node kind) — the vault-only code-node exclusion below must NOT
  // fire when adapting it. On the vault corpus (default) the exclusion stays in
  // force, keeping the vault graph clean.
  const isCodeCorpus = options?.corpus === "code";
  const allNodes = Array.isArray(body.nodes) ? (body.nodes as EngineNode[]) : [];
  const allEdges = Array.isArray(body.edges) ? (body.edges as EngineEdge[]) : [];
  // G2 trust-boundary cap: clamp a hostile/buggy oversized payload BEFORE mapping, so
  // a runaway wire response can never exhaust client memory; report it as truncation.
  const nodeOverflow = allNodes.length > MAX_CLIENT_GRAPH_NODES;
  const rawNodes = nodeOverflow ? allNodes.slice(0, MAX_CLIENT_GRAPH_NODES) : allNodes;
  const edges =
    allEdges.length > MAX_CLIENT_GRAPH_EDGES
      ? allEdges.slice(0, MAX_CLIENT_GRAPH_EDGES)
      : allEdges;
  const clientTruncated = nodeOverflow
    ? {
        total_nodes: allNodes.length,
        returned_nodes: rawNodes.length,
        reason: "client node ceiling",
      }
    : null;
  const metaEdges = Array.isArray(body.meta_edges)
    ? (body.meta_edges as WireMetaEdge[])
    : [];
  // Defensive index/code exclusion (terminology-standardization ADR D5/D6,
  // belt-and-braces): `index` documents and `code` artefacts are never displayable
  // knowledge nodes. The engine excludes them at the projection, but the frontend
  // must not render them if any producer (or the mock) ever emits one — so drop
  // them here and keep the slice self-consistent by dropping edges that reference a
  // dropped node. An edge is kept only when BOTH endpoints survive.
  const droppedNodeIds = new Set<string>();
  const nodes = rawNodes.filter((node) => {
    if (!isCodeCorpus && isExcludedGraphNode(node)) {
      droppedNodeIds.add(node.id);
      return false;
    }
    return true;
  });
  // Self-consistent slice: an edge survives only when BOTH endpoints are in the
  // FINAL node set. That covers excluded (index/code) nodes AND nodes sliced away
  // by the client cap — a fired `nodeOverflow` must not leave an edge dangling to
  // an absent node (a three.js NaN/glitch trigger). When neither the cap nor the
  // exclusion fired, every node is present, so the fast path skips the filter.
  const needsEdgeFilter = nodeOverflow || droppedNodeIds.size > 0;
  const keptNodeIds = needsEdgeFilter ? new Set(nodes.map((n) => n.id)) : null;
  const endpointsKept = (e: { src: string; dst: string }): boolean =>
    keptNodeIds === null || (keptNodeIds.has(e.src) && keptNodeIds.has(e.dst));
  const keptEdges = needsEdgeFilter ? edges.filter(endpointsKept) : edges;
  // Drop the raw meta_edges off the returned slice — it is now in `edges`.
  const { meta_edges: _folded, ...rest } = body as Rec;
  if (!metaEdges.length) {
    return {
      ...(rest as object),
      nodes,
      edges: keptEdges,
      ...(clientTruncated ? { truncated: clientTruncated } : {}),
    } as GraphSlice;
  }
  // Deduplicate by id: if an origin already inlined a meta-edge into `edges`
  // (same id as would be synthesized), the fold must not append a duplicate
  // (provenance-stable-keys-are-identity-bearing: one edge per id per slice). A
  // meta-edge whose endpoint was dropped (excluded or capped) is likewise excluded.
  const existingIds = new Set(keptEdges.map((e) => e.id));
  const folded = metaEdges
    .map(metaEdgeToEdge)
    .filter((e) => !existingIds.has(e.id) && endpointsKept(e));
  return {
    ...(rest as object),
    nodes,
    edges: [...keptEdges, ...folded],
    ...(clientTruncated ? { truncated: clientTruncated } : {}),
  } as GraphSlice;
}

/**
 * A node the frontend must never render as a knowledge node (ADR D5/D6): an `index`
 * document, or a `code` artefact. Code is detected three ways for robustness across
 * producer shapes — the `code:` id prefix, a `code` kind, or the `code-artifact`
 * wire species — so a code node is dropped however it is labelled.
 */
function isExcludedGraphNode(node: EngineNode): boolean {
  if (node.doc_type === "index") return true;
  const kind = node.kind;
  if (kind === "code" || kind === "code-artifact") return true;
  if (typeof node.id === "string" && node.id.startsWith("code:")) {
    return true;
  }
  return false;
}

// --- §3 dashboard state (dashboard-state-centralization W02) --------------------

/**
 * Live `/dashboard-state` -> the canonical stores-layer state. The route is
 * identity-bearing, so node ids pass through the same trim/dedupe/cap rules as
 * dashboard-state writes, and malformed IDs are dropped/cleared rather than
 * coerced into new identities.
 */
export function adaptDashboardState(body: unknown): DashboardState {
  if (!isRec(body)) {
    return {
      scope: "",
      selected_ids: [],
      hovered_id: null,
      filters: {},
      date_range: {},
      timeline_mode: { kind: "live" },
      graph_granularity: "feature",
      corpus: "vault",
      salience_lens: normalizeDashboardSalienceLens(undefined),
      salience_focus: null,
      representation_mode: "connectivity",
      graph_bounds: normalizeDashboardGraphBounds(undefined),
      panel_state: normalizeDashboardPanelState(undefined),
      tiers: {},
    };
  }
  return {
    scope: normalizeStoreScope(body.scope) ?? "",
    selected_ids: normalizeDashboardSelectedIds(body.selected_ids),
    hovered_id: normalizeDashboardNodeId(body.hovered_id),
    filters: cloneDashboardFilters(body.filters),
    date_range: normalizeDashboardDateRange(body.date_range),
    timeline_mode: normalizeDashboardTimelineMode(body.timeline_mode),
    graph_granularity: normalizeDashboardGraphGranularity(body.graph_granularity),
    corpus: normalizeDashboardGraphCorpus(body.corpus),
    salience_lens: normalizeDashboardSalienceLens(body.salience_lens),
    salience_focus: normalizeDashboardNodeId(body.salience_focus),
    representation_mode: normalizeDashboardRepresentationMode(body.representation_mode),
    graph_bounds: normalizeDashboardGraphBounds(body.graph_bounds),
    panel_state: normalizeDashboardPanelState(body.panel_state),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- §4 bounded embedding slice (graph-semantic-embeddings ADR) ------------------
//
// Tolerant adapter for `GET /graph/embeddings`. The live `{data: {embeddings,
// generation, truncated, lens}, tiers}` envelope is already unwrapped by
// `unwrapEnvelope` before this runs; a body already in the internal shape (the
// mock) passes through unchanged — the one-code-path property
// (mock-mirrors-live-wire-shape). Every entry defaults defensively: an entry
// without a `node_id` string or a numeric `vector` array is dropped, so a sparse
// or malformed shape NEVER throws and never carries a half-formed vector into the
// projection. `tiers` rides through verbatim (the envelope's degradation truth,
// defaulted to an empty block when absent) — the stores layer reads semantic
// availability from it (ADR D7), never a bare transport error. `generation`
// defaults to 0 (the cache-per-generation key) and `truncated` to null.

/** Default one served embedding, tolerating an absent/partial object: a missing
 *  `node_id` string or non-numeric `vector` array yields null (dropped by the
 *  caller). The vector is filtered to finite numbers so a `NaN`/string element
 *  can never reach the projection. */
function adaptNodeEmbedding(value: unknown): NodeEmbedding | null {
  if (!isRec(value)) return null;
  if (typeof value.node_id !== "string") return null;
  if (!Array.isArray(value.vector)) return null;
  const vector = value.vector.filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  // A vector that lost every element to the finite filter is not a real
  // embedding — drop it so the node falls into the honest fallback ring rather
  // than a degenerate zero-length projection.
  if (vector.length === 0) return null;
  return { node_id: value.node_id, vector };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  slice (a real object with the three fields); null/absent stays null. */
function adaptEmbeddingsTruncated(value: unknown): EmbeddingsResponse["truncated"] {
  if (
    isRec(value) &&
    typeof value.total_nodes === "number" &&
    typeof value.returned_nodes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_nodes: value.total_nodes,
      returned_nodes: value.returned_nodes,
      reason: value.reason,
    };
  }
  return null;
}

/**
 * Live `/graph/embeddings` → the internal embedding slice. TOLERANT: an absent
 * `embeddings` array defaults to empty (the semantic mode draws every node in the
 * fallback ring), `generation` defaults to 0, `truncated` to null, and the
 * optional `lens` echo is forwarded only when a string. `tiers` rides through
 * verbatim — the surface reads semantic availability through the stores hook,
 * never this raw block (degradation-is-read-from-tiers).
 */
export function adaptGraphEmbeddings(body: unknown): EmbeddingsResponse {
  if (!isRec(body)) {
    return { embeddings: [], generation: 0, tiers: {}, truncated: null };
  }
  const embeddings = Array.isArray(body.embeddings)
    ? body.embeddings
        .map(adaptNodeEmbedding)
        .filter((e): e is NodeEmbedding => e !== null)
    : [];
  return {
    embeddings,
    generation: typeof body.generation === "number" ? body.generation : 0,
    tiers: (body.tiers ?? {}) as TiersBlock,
    ...(typeof body.lens === "string"
      ? { lens: body.lens as EmbeddingsResponse["lens"] }
      : {}),
    truncated: adaptEmbeddingsTruncated(body.truncated),
  };
}

/**
 * The CONTRACTUAL embedding↔node join (graph-node-representation ADR D1): build a
 * `Map<node_id, vector>` from the adapted embedding slice, keyed strictly by
 * `node_id`, NEVER by the positional/DOI order the rows happen to arrive in. The
 * `/graph/embeddings` route serves a `node_id`-keyed SUBSET of the graph node set
 * — a node with no served vector is simply ABSENT from the map (an honest
 * absence: the scene rings it in the fallback, never mis-assigning some other
 * node's vector to it). Robust to the embeddings array being reordered relative to
 * the served node set, to being a strict subset (fewer rows than nodes), and to a
 * duplicate `node_id` (last row wins, deterministic — a degenerate shape the live
 * route never emits, but the join must not corrupt identity if it does). This is
 * the single owner of the by-id join: the scene merges this map onto its nodes
 * with `map.get(node.id)`, so the node order on either side is irrelevant.
 */
export function embeddingsByNodeId(
  response: Pick<EmbeddingsResponse, "embeddings">,
): Map<string, number[]> {
  const byId = new Map<string, number[]>();
  for (const e of response.embeddings) byId.set(e.node_id, e.vector);
  return byId;
}

// --- §5 bounded temporal-lineage slice (dashboard-timeline ADR) ------------------
//
// Tolerant adapter for `GET /graph/lineage`. The live `{data: {nodes, arcs,
// truncated}, tiers}` envelope is already unwrapped by `unwrapEnvelope` before
// this runs (the client's get path flattens `data` and lifts `tiers`); a body
// already in the internal shape (the mock) passes through unchanged — the
// one-code-path property (mock-mirrors-live-wire-shape). Every missing field
// defaults to a safe empty so a sparse or older shape NEVER throws and the chrome
// never reads the raw tiers block (degradation truth rides on `tiers`, defaulted
// to an empty block when absent). The OPTIONAL wire fields — a node's `title`,
// an arc's `derivation` (absent until the node-semantics field ships, the ADR's
// one real dependency), and the whole `truncated` block — are tolerated absent.

const LINEAGE_PHASES: LineagePhase[] = [
  "research",
  "adr",
  "plan",
  "exec",
  "review",
  "codify",
];

/** Default one dated lineage node, tolerating an absent or partial object: an
 *  unknown phase falls back to `research` (the first lane, never invents a new
 *  one), `dates` defaults to empty (`created`/`modified` forwarded only when the
 *  right type), and `degree` to 0. `modified` is the engine `Timestamp` (epoch-ms
 *  NUMBER) — forwarded only when numeric, never coerced from a string. */
function adaptLineageNode(value: unknown): LineageNode {
  if (!isRec(value)) {
    return { id: "", doc_type: "", phase: "research", dates: {}, degree: 0 };
  }
  const phaseRaw = typeof value.phase === "string" ? value.phase : "";
  const phase = (LINEAGE_PHASES as string[]).includes(phaseRaw)
    ? (phaseRaw as LineagePhase)
    : "research";
  const rawDates = isRec(value.dates) ? value.dates : {};
  const dates: { created?: string; modified?: number } = {};
  if (typeof rawDates.created === "string") dates.created = rawDates.created;
  if (typeof rawDates.modified === "number") dates.modified = rawDates.modified;
  return {
    id: typeof value.id === "string" ? value.id : "",
    doc_type: typeof value.doc_type === "string" ? value.doc_type : "",
    phase,
    dates,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    degree: typeof value.degree === "number" ? value.degree : 0,
  };
}

/** Default one lineage arc, tolerating an absent or partial object: an unknown
 *  tier falls back to `structural` (the tier of the structural mentions the
 *  fallback edges carry), `confidence` to 0, and the optional `derivation` is
 *  forwarded only when present (absent until the node-semantics field lands —
 *  the graceful-fallback the ADR mandates). */
function adaptLineageArc(value: unknown): LineageArc {
  if (!isRec(value)) {
    return {
      id: "",
      src: "",
      dst: "",
      relation: "",
      tier: "structural",
      confidence: 0,
    };
  }
  const tierRaw = typeof value.tier === "string" ? value.tier : "";
  const tier = (EDGE_TIER_ORDER as readonly string[]).includes(tierRaw)
    ? (tierRaw as LineageArc["tier"])
    : "structural";
  return {
    id: typeof value.id === "string" ? value.id : "",
    src: typeof value.src === "string" ? value.src : "",
    dst: typeof value.dst === "string" ? value.dst : "",
    relation: typeof value.relation === "string" ? value.relation : "",
    ...(typeof value.derivation === "string" ? { derivation: value.derivation } : {}),
    tier,
    confidence: typeof value.confidence === "number" ? value.confidence : 0,
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  slice (a real object with the three fields); null/absent stays null. */
function adaptLineageTruncated(value: unknown): LineageSlice["truncated"] {
  if (
    isRec(value) &&
    typeof value.total_nodes === "number" &&
    typeof value.returned_nodes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_nodes: value.total_nodes,
      returned_nodes: value.returned_nodes,
      reason: value.reason,
    };
  }
  return null;
}

/**
 * Live `/graph/lineage` → the internal lineage slice. TOLERANT: an absent
 * `nodes`/`arcs` array defaults to empty (the timeline renders its empty/degraded
 * state from the tiers block), `truncated` defaults to null, and the per-node
 * `title` / per-arc `derivation` optionals are tolerated absent. `tiers` rides
 * through verbatim (the envelope's degradation truth, defaulted to an empty block
 * when wholly absent) — the surface reads degradation only through the stores
 * hook, never this raw block.
 */
export function adaptLineageSlice(body: unknown): LineageSlice {
  if (!isRec(body)) return { nodes: [], arcs: [], tiers: {}, truncated: null };
  return {
    nodes: Array.isArray(body.nodes) ? body.nodes.map(adaptLineageNode) : [],
    arcs: Array.isArray(body.arcs) ? body.arcs.map(adaptLineageArc) : [],
    tiers: (body.tiers ?? {}) as TiersBlock,
    truncated: adaptLineageTruncated(body.truncated),
  };
}

function normalizeMapString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMapStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeMapString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
}

function normalizeMapCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function adaptMapBranch(
  value: unknown,
): MapResponse["repositories"][number]["branches"][number] | null {
  if (!isRec(value)) return null;
  const name = normalizeMapString(value.name);
  if (name === undefined) return null;
  return {
    name,
    kind:
      value.class === "default"
        ? "default"
        : value.class === "feature"
          ? "feature"
          : "other",
  };
}

function adaptMapWorktree(
  value: unknown,
): MapResponse["repositories"][number]["worktrees"][number] | null {
  if (!isRec(value)) return null;
  const path = normalizeMapString(value.path);
  if (path === undefined) return null;
  const branch = (normalizeMapString(value.head_ref) ?? "").replace(
    /^refs\/heads\//,
    "",
  );
  const degraded = normalizeMapStringList(value.degraded);
  const ahead = normalizeMapCount(value.ahead);
  const behind = normalizeMapCount(value.behind);
  return {
    // Scope tokens are normalized worktree paths on the live origin.
    id: path,
    path,
    branch,
    has_vault: value.has_vault === true,
    is_default: value.is_main === true,
    ...(degraded !== undefined ? { degraded } : {}),
    ...(typeof value.dirty === "boolean" ? { dirty: value.dirty } : {}),
    // ahead/behind are null when no upstream is configured — map to
    // undefined so callers can distinguish "unknown" from "0 ahead".
    ...(ahead !== undefined ? { ahead } : {}),
    ...(behind !== undefined ? { behind } : {}),
  };
}

/** Live workspace map → the internal repositories shape. */
export function adaptMap(body: unknown): MapResponse {
  if (!isRec(body)) return body as MapResponse;
  if ("repositories" in body) return body as unknown as MapResponse;
  const worktrees = Array.isArray(body.worktrees) ? body.worktrees : [];
  const branches = Array.isArray(body.branches) ? body.branches : [];
  return {
    repositories: [
      {
        path: normalizeMapString(body.workspace) ?? "",
        branches: branches
          .map(adaptMapBranch)
          .filter(
            (
              branch,
            ): branch is MapResponse["repositories"][number]["branches"][number] =>
              branch !== null,
          ),
        worktrees: worktrees
          .map(adaptMapWorktree)
          .filter(
            (
              worktree,
            ): worktree is MapResponse["repositories"][number]["worktrees"][number] =>
              worktree !== null,
          ),
      },
    ],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** The canonical rag-running lifecycle token — the one source of the `"running"`
 *  string both produced (by `adaptStatus`) and tested (by `isRagRunning`). */
const RAG_RUNNING = "running";

/**
 * Whether rag is up given its lifecycle word. The single predicate the whole
 * stores layer routes through: rag is running IFF the lifecycle word is exactly
 * `"running"` (any other word — `stopped`/`absent`/loading — is down). Defined
 * once here beside `adaptStatus` (the status-rollup home) and consumed by
 * `adaptStatus`, `deriveRagStatusView`, and the search controller, replacing the
 * three independent `=== "running"` checks that previously drifted apart.
 */
export function isRagRunning(word: string | undefined): boolean {
  return word === RAG_RUNNING;
}

/**
 * Live status rollup → the internal status shape.
 *
 * The live engine serves `{data: {git, index, backends, ok}, tiers}`, unwrapped
 * by `unwrapEnvelope` before this adapter runs. Each block is optional; the
 * adapter maps what is present and leaves absent blocks undefined so the NowStrip
 * renders the HONEST degraded state (contract §2) rather than a lie.
 *
 * git block: live wire sends `{head_ref, dirty, ahead?, behind?}`.
 *   `dirty` may be a boolean (live) or a string[] (legacy/internal) — both map
 *   to the single clean/dirty boolean; per-file changed paths come from
 *   `/ops/git/status`, never this rollup.
 *
 * core block: extracted from `backends.core`; `vault_health` forwarded when
 *   present so `coreCard` can report "vault green" vs "vault unknown".
 */
export function adaptStatus(body: unknown): EngineStatus {
  if (!isRec(body)) return body as EngineStatus;
  if ("nodes" in body && "degradations" in body) return body as unknown as EngineStatus;
  const tiers = (body.tiers ?? {}) as TiersBlock;
  const index = isRec(body.index) ? body.index : {};
  const backends = isRec(body.backends) ? body.backends : {};
  const rag = isRec(backends.rag) ? backends.rag : {};
  const core = isRec(backends.core) ? backends.core : null;
  const git = isRec(body.git) ? body.git : null;
  // Contract §2: a tier ABSENT from the block is a designed degraded state —
  // absence ≠ available. Collect degraded tiers: those explicitly marked
  // available:false AND those missing from the block entirely.
  const degradations = CANONICAL_TIERS.filter(
    (tier) => tiers[tier] === undefined || tiers[tier].available === false,
  );
  // Live `/status` git: `dirty` is a BOOLEAN ("is the tree dirty?") — the live
  // engine serves NO per-file list. Tolerate a legacy/internal `string[]` by
  // collapsing it to "is anything dirty", but the wire truth is the boolean.
  const dirty = git
    ? Array.isArray(git.dirty)
      ? (git.dirty as unknown[]).length > 0
      : git.dirty === true
    : false;
  // `ahead`/`behind` are Option<u32> on the wire: PRESERVE undefined (no upstream
  // configured) rather than coercing to 0, so "no upstream" stays distinguishable
  // from "even with upstream" (git-diff-browser ADR: absent ≠ zero).
  const numOrUndef = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
  return {
    ok: Boolean(body.ok),
    nodes: Number(index.nodes ?? 0),
    edges: Number(index.edges ?? 0),
    degradations,
    tiers,
    git: git
      ? {
          branch: String(git.head_ref ?? git.branch ?? "").replace(
            /^refs\/heads\//,
            "",
          ),
          ahead: numOrUndef(git.ahead),
          behind: numOrUndef(git.behind),
          dirty,
        }
      : undefined,
    core: core
      ? {
          reachable: true,
          vault_health:
            typeof core.vault_health === "string" ? core.vault_health : undefined,
        }
      : undefined,
    // The live `/status` now carries an explicit machine `state`
    // (running/crashed/absent) plus a `reason`; source the lifecycle word from it
    // so a CRASHED rag (discovered but not serving) is distinguishable from a
    // genuinely ABSENT one. Fall back to the available-flag word for older or
    // synthetic samples carrying no `state`. `isRagRunning` still gates on exactly
    // `"running"`; one source of the `"running"` token, one predicate over it.
    rag: {
      service:
        typeof rag.state === "string"
          ? rag.state
          : rag.available === true
            ? RAG_RUNNING
            : "stopped",
      reason: typeof rag.reason === "string" ? rag.reason : undefined,
    },
  };
}

/** Live `{vocabulary: {...}}` → the internal filters vocabulary. */
export function adaptFilters(body: unknown): FiltersVocabulary {
  if (!isRec(body)) return body as FiltersVocabulary;
  if (!isRec(body.vocabulary)) return body as unknown as FiltersVocabulary;
  const v = body.vocabulary;
  const list = (key: string): string[] =>
    Array.isArray(v[key]) ? (v[key] as string[]) : [];
  // The live `date_bounds` arrives as `{min, max}` (inclusive ISO corpus span);
  // the internal shape is `{from, to}`. Map it (tolerant of an already-internal
  // `{from, to}`) so the corpus-span consumers (the timeline fit-all/fit-feature
  // controls and the minimap scrubber) work against the live origin, not only the
  // mock. Absent when no node carries a created date (the field is skipped live).
  const mapBounds = (raw: unknown): { from?: string; to?: string } | undefined =>
    isRec(raw)
      ? {
          from: (raw.min ?? raw.from) as string | undefined,
          to: (raw.max ?? raw.to) as string | undefined,
        }
      : undefined;
  const rawBounds = isRec(v.date_bounds) ? v.date_bounds : undefined;
  const dateBounds = mapBounds(rawBounds);
  // Per-criterion corpus spans (Issue #14): each {min,max} mapped to {from,to}, the
  // same shape as the flat `date_bounds`. A criterion absent from the live vocabulary
  // stays absent here — its presence is the capability gate for that date field.
  const rawByField = isRec(v.date_bounds_by_field) ? v.date_bounds_by_field : undefined;
  const dateBoundsByField = rawByField
    ? {
        created: mapBounds(rawByField.created),
        modified: mapBounds(rawByField.modified),
        stamped: mapBounds(rawByField.stamped),
      }
    : undefined;
  return {
    relations: list("relations"),
    tiers: list("tiers"),
    // doc_types and feature_tags are enumerated data-driven by the live
    // vocabulary; empty stays honest (the facet rows hide on empty vocabularies).
    doc_types: list("doc_types"),
    feature_tags: list("feature_tags"),
    kinds: list("kinds"),
    // STATUS lifecycle vocabulary — the engine enumerates ADR status adjectives
    // and plan tiers data-driven; empty stays honest (the facet rows hide).
    statuses: list("statuses"),
    plan_tiers: list("plan_tiers"),
    plan_states: list("plan_states"),
    health: list("health"),
    date_bounds: dateBounds,
    date_bounds_by_field: dateBoundsByField,
    tiers_block: (body.tiers ?? undefined) as TiersBlock | undefined,
  };
}

/**
 * Live `/search` serves rag's FLAT annotated HTTP envelope (rag-integration-
 * hardening D1): `results` sits at the TOP level (already unwrapped from the §2
 * `{data, tiers}` wrapper by `unwrapEnvelope`), each item carrying rag's real
 * per-hit vocabulary (path/stem/source, score, `snippet`/excerpt/text, and the
 * species-specific metadata), plus the engine's `node_id` value-add. The
 * envelope also carries rag's forwarded `index_state` freshness block and the
 * engine-annotated `semantic_epoch`. Map result items tolerantly and derive the
 * graph node id from a stem/path only when the engine annotation is absent — the
 * annotation gap is a flagged divergence, not silently papered. There is ONE
 * shape: the older nested CLI-subprocess envelope is retired (no bridge).
 */
export const SEARCH_RESULTS_MAX_ITEMS = 256;
export const SEARCH_RESULT_IDENTITY_MAX_CHARS = 2048;
export const SEARCH_RESULT_EXCERPT_MAX_CHARS = 4096;

function normalizeSearchResultString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= SEARCH_RESULT_IDENTITY_MAX_CHARS
    ? normalized
    : undefined;
}

function normalizeSearchResultExcerpt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  return normalized.length <= SEARCH_RESULT_EXCERPT_MAX_CHARS
    ? normalized
    : normalized.slice(0, SEARCH_RESULT_EXCERPT_MAX_CHARS);
}

function normalizeSearchResultScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/** A code result's 1-based line endpoint: a finite, non-negative integer, else
 *  undefined (rag emits `null` for vault hits). */
function normalizeSearchResultLine(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/** An `index_state` count field: a finite, non-negative integer, else undefined
 *  (a malformed or absent count never poisons the freshness block). */
function normalizeSearchCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/**
 * The shared D4 semantic epoch the engine annotates on a `/search` success
 * (rag-integration-hardening D3). Three distinct served truths, preserved:
 * a finite non-negative number is the warm epoch; an explicit `null` is the
 * engine's HONEST absent marker (a cold/failed cache read — freshness unknown,
 * never fabricated); anything else (field absent, non-number) is `undefined` —
 * the wire carried no epoch at all (the degraded path emits none). `null` and
 * `undefined` are NOT collapsed: one is "known-unknown", the other "not served".
 */
function normalizeSearchEpoch(
  present: boolean,
  value: unknown,
): number | null | undefined {
  if (!present) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/** rag's `index_state` freshness block → the internal `SearchIndexState`,
 *  forwarded verbatim (engine-read-and-infer — no engine staleness semantics),
 *  every field normalized tolerantly and dropped when malformed/absent. Returns
 *  undefined when no field survives (a sparse or absent block). */
function adaptSearchIndexState(value: unknown): SearchIndexState | undefined {
  if (!isRec(value)) return undefined;
  const state = pickDefined({
    source: normalizeSearchResultString(value.source),
    indexed_count: normalizeSearchCount(value.indexed_count),
    vault_count: normalizeSearchCount(value.vault_count),
    code_count: normalizeSearchCount(value.code_count),
    indexed_target_root: normalizeSearchResultString(value.indexed_target_root),
    requested_target_root: normalizeSearchResultString(value.requested_target_root),
    target_matches:
      typeof value.target_matches === "boolean" ? value.target_matches : undefined,
    status: normalizeSearchResultString(value.status),
  });
  return Object.keys(state).length > 0 ? state : undefined;
}

/** Drop `undefined` entries so only present fields ride the optional wire shape. */
function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function adaptSearchResult(item: unknown): SearchResponse["results"][number] | null {
  if (!isRec(item)) return null;
  const score = normalizeSearchResultScore(item.score);
  if (score === null) return null;
  const nodeId = normalizeNodeId(item.node_id) ?? undefined;
  const sourceValue = normalizeSearchResultString(item.source);
  const pathValue = normalizeSearchResultString(item.path);
  const stemValue = normalizeSearchResultString(item.stem);
  const source = sourceValue ?? pathValue ?? stemValue;
  if (source === undefined) return null;
  // rag's short preview field is `snippet`; `excerpt`/`text` are tolerated aliases.
  const excerpt =
    normalizeSearchResultExcerpt(item.snippet) ??
    normalizeSearchResultExcerpt(item.excerpt) ??
    normalizeSearchResultExcerpt(item.text);
  const normalizedItem: Record<string, unknown> = {
    ...item,
    ...(nodeId !== undefined ? { node_id: nodeId } : { node_id: undefined }),
    ...(sourceValue !== undefined ? { source: sourceValue } : { source: undefined }),
    ...(pathValue !== undefined ? { path: pathValue } : { path: undefined }),
    ...(stemValue !== undefined ? { stem: stemValue } : { stem: undefined }),
  };
  // The rag wire carries rich, species-specific metadata the rich pills render
  // (vault: doc_type/feature/date; code: language/line range/symbol). The engine
  // forwards it verbatim (rag-client `forward_search`); carry it through tolerantly
  // and bounded so the view layer can read it without a second fetch. Only defined
  // fields are emitted, mirroring the optional wire shape.
  const rich = pickDefined({
    title: normalizeSearchResultString(item.title),
    rerank_text: normalizeSearchResultExcerpt(item.rerank_text),
    doc_type: normalizeSearchResultString(item.doc_type),
    feature: normalizeSearchResultString(item.feature),
    date: normalizeSearchResultString(item.date),
    language: normalizeSearchResultString(item.language),
    line_start: normalizeSearchResultLine(item.line_start),
    line_end: normalizeSearchResultLine(item.line_end),
    node_type: normalizeSearchResultString(item.node_type),
    function_name: normalizeSearchResultString(item.function_name),
    class_name: normalizeSearchResultString(item.class_name),
  });
  return {
    score,
    source,
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...rich,
    node_id: deriveSearchNodeId(normalizedItem),
  };
}

export function adaptSearch(body: unknown): SearchResponse {
  if (!isRec(body)) return body as never;
  // The flat annotated shape (rag-integration-hardening D1): `results` at the
  // top level, adapted per hit. The old nested `{envelope:{data:{results}}}`
  // CLI-subprocess shape is retired — search rides the resident HTTP service, so
  // there is exactly one shape and no discriminating bridge.
  const rawResults = Array.isArray(body.results) ? body.results : [];
  const results: SearchResponse["results"] = [];
  for (const item of rawResults) {
    const result = adaptSearchResult(item);
    if (result === null) continue;
    results.push(result);
    if (results.length >= SEARCH_RESULTS_MAX_ITEMS) break;
  }
  // Freshness (D3): rag's `index_state` forwarded verbatim and the engine's
  // annotated `semantic_epoch` passed through as served truth. Both are optional
  // and only emitted when present, so a degraded/empty search (no freshness on
  // the wire) carries neither rather than a fabricated block.
  const indexState = adaptSearchIndexState(body.index_state);
  const epoch = normalizeSearchEpoch("semantic_epoch" in body, body.semantic_epoch);
  return {
    results,
    tiers: (body.tiers ?? {}) as TiersBlock,
    ...(indexState !== undefined ? { index_state: indexState } : {}),
    ...(epoch !== undefined ? { semantic_epoch: epoch } : {}),
  };
}

/** Stem-suffix doc-type derivation (matches the vault naming convention).
 *  `.index` (`.vault/index` feature-index) stems get NO special doc-type — they
 *  are strictly-ignored metanodes (index-node-exclusion ADR), never categorized as
 *  an `index` type; they fall through to the generic `document`. */
export function docTypeFromStem(stem: string): string {
  if (/-W\d+-P\d+-S\d+$|-P\d+-S\d+$|-S\d+$|-summary$/.test(stem)) return "exec";
  const match = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
  if (match) return match[1];
  return "document";
}

function normalizeVaultTreeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeVaultTreeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeVaultTreeString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Normalize a served vault-tree date to a comparable, day-granular ISO string
 *  ("YYYY-MM-DD"). The engine serves `created`/`stamped` as ISO date strings but
 *  `modified` as EPOCH MILLIS (a number), so a string is reduced to its day part
 *  and a finite number is coerced through `Date` to the same ISO day. This makes
 *  every entry date directly comparable with the timeline's `date_range` bounds
 *  (also `YYYY-MM-DD`), keyed by the active `date_field` criterion — without this,
 *  the old string-only normalizer DROPPED the numeric `modified`, and the rail's
 *  date narrow then excluded EVERY entry whenever a range was active (Issue #38). */
function normalizeVaultTreeDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  return undefined;
}

function adaptVaultTreeDates(value: unknown): VaultTreeEntry["dates"] {
  if (!isRec(value)) return {};
  const out: VaultTreeEntry["dates"] = {};
  const created = normalizeVaultTreeDate(value.created);
  const modified = normalizeVaultTreeDate(value.modified);
  const stamped = normalizeVaultTreeDate(value.stamped);
  if (created !== undefined) out.created = created;
  if (modified !== undefined) out.modified = modified;
  if (stamped !== undefined) out.stamped = stamped;
  return out;
}

function normalizeVaultTreeProgress(
  value: unknown,
): VaultTreeEntry["progress"] | undefined {
  if (!isRec(value)) return undefined;
  if (
    typeof value.done !== "number" ||
    typeof value.total !== "number" ||
    !Number.isFinite(value.done) ||
    !Number.isFinite(value.total)
  ) {
    return undefined;
  }
  const done = Math.floor(value.done);
  const total = Math.floor(value.total);
  if (done < 0 || total <= 0 || done > total) return undefined;
  return { done, total };
}

function adaptVaultTreeEntry(value: unknown): VaultTreeEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeVaultTreeString(value.path);
  const stem =
    normalizeVaultTreeString(value.stem) ?? (path ? stemFromPath(path) : undefined);
  if (stem === undefined) return null;
  const docType = normalizeVaultTreeString(value.doc_type) ?? docTypeFromStem(stem);
  const entryPath =
    path ?? `.vault/${docType === "document" ? "doc" : docType}/${stem}.md`;
  const status = normalizeVaultTreeString(value.status);
  const tier = normalizeVaultTreeString(value.tier);
  const title = normalizeVaultTreeString(value.title);
  const progress = normalizeVaultTreeProgress(value.progress);
  return {
    path: entryPath,
    doc_type: docType,
    feature_tags: normalizeVaultTreeStringList(value.feature_tags),
    dates: adaptVaultTreeDates(value.dates),
    ...(title !== undefined ? { title } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(tier !== undefined ? { tier } : {}),
    ...(progress !== undefined ? { progress } : {}),
  };
}

/** Live stem/node_id tree entries → the internal path-bearing entries. */
export function adaptVaultTree(body: unknown): VaultTreeResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return body as VaultTreeResponse;
  }
  const entries = body.entries
    .map(adaptVaultTreeEntry)
    .filter((entry): entry is VaultTreeEntry => entry !== null);
  return { entries, tiers: (body.tiers ?? {}) as TiersBlock };
}

// --- /code-files: the complete code-file listing (search-providers ADR) ----------
//
// Tolerant adapter for the drained `/code-files` walk. Every field defaults to a
// safe empty so a sparse or older shape NEVER throws: a row missing its `path` is
// dropped (a code hit with no path is unnavigable), a missing `node_id` is
// reconstructed from the path (the files-only `code:{path}` identity), and the
// walk-cap `truncated` block is passed through only when it is a well-formed
// honesty record (null otherwise — absence reads as completeness, never a guess).

function adaptCodeFileEntry(value: unknown): CodeFileEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeVaultTreeString(value.path);
  if (path === undefined) return null;
  const nodeId = normalizeVaultTreeString(value.node_id) ?? `code:${path}`;
  const title = normalizeVaultTreeString(value.title);
  const lang = normalizeVaultTreeString(value.lang);
  return {
    path,
    node_id: nodeId,
    ...(title !== undefined ? { title } : {}),
    ...(lang !== undefined ? { lang } : {}),
  };
}

function adaptCodeFilesTruncation(value: unknown): CodeFilesTruncation | null {
  if (!isRec(value)) return null;
  const returned = value.returned_files;
  const reason = normalizeVaultTreeString(value.reason);
  if (
    typeof returned !== "number" ||
    !Number.isFinite(returned) ||
    reason === undefined
  ) {
    return null;
  }
  return { returned_files: Math.max(0, Math.floor(returned)), reason };
}

/** Live code-file rows → the internal complete listing. Fail-closed to an empty
 *  listing (never a throw) when the shape is unrecognized, preserving any tiers
 *  block so degradation truth still rides through. */
export function adaptCodeFiles(body: unknown): CodeFilesResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return {
      entries: [],
      tiers: (isRec(body) ? (body.tiers ?? {}) : {}) as TiersBlock,
      truncated: null,
    };
  }
  const entries = body.entries
    .map(adaptCodeFileEntry)
    .filter((entry): entry is CodeFileEntry => entry !== null);
  return {
    entries,
    tiers: (body.tiers ?? {}) as TiersBlock,
    truncated: adaptCodeFilesTruncation(body.truncated),
  };
}

// --- §3 code (worktree) file tree (dashboard-code-tree ADR) ----------------------
//
// Tolerant adapter for `GET /file-tree`. The live `{data, tiers, next_cursor?}`
// envelope is already unwrapped by `unwrapEnvelope` before this runs (with the
// top-level `next_cursor` preserved onto the flat body); a body already in the
// internal shape (the mock) passes through unchanged — the one-code-path
// property. Every missing field defaults to a safe empty so a sparse or older
// shape NEVER throws and the chrome never reads the raw tiers block (the
// degradation truth rides on `tiers`, defaulted to an empty block when absent).

function normalizeFileTreeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFileTreeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** Default one child wire row, tolerating an absent or partial object: a missing
 *  path is malformed and dropped; an unknown/absent `kind` defaults to `file`
 *  (never wrongly shown expandable); `has_children` is true only for directories;
 *  and a missing `node_id` is derived from the canonical `code:{path}` rule. */
function adaptFileTreeEntry(value: unknown): FileTreeEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeFileTreeString(value.path);
  if (path === undefined) return null;
  const kind = value.kind === "dir" ? "dir" : "file";
  const nodeId = normalizeNodeId(value.node_id) ?? codeNodeIdFromPath(path);
  return {
    path,
    kind,
    has_children: kind === "dir" && value.has_children === true,
    node_id: nodeId,
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  level (a real object with the three fields); null/absent stays null. */
function adaptFileTreeTruncated(value: unknown): FileTreeTruncated | null {
  const totalChildren = isRec(value)
    ? normalizeFileTreeCount(value.total_children)
    : undefined;
  const returnedChildren = isRec(value)
    ? normalizeFileTreeCount(value.returned_children)
    : undefined;
  const reason = isRec(value) ? normalizeFileTreeString(value.reason) : undefined;
  if (
    totalChildren !== undefined &&
    returnedChildren !== undefined &&
    reason !== undefined
  ) {
    return {
      total_children: totalChildren,
      returned_children: returnedChildren,
      reason,
    };
  }
  return null;
}

/** Live `/file-tree` → the internal file-tree response. TOLERANT: an absent
 *  `entries` array defaults to empty (the code mode renders its empty/degraded
 *  state from the tiers block), and `truncated`/`next_cursor` default to
 *  null/undefined. */
export function adaptFileTree(body: unknown): FileTreeResponse {
  if (!isRec(body)) {
    return { entries: [], path: "", truncated: null, tiers: {} };
  }
  return {
    entries: Array.isArray(body.entries)
      ? body.entries
          .map(adaptFileTreeEntry)
          .filter((entry): entry is FileTreeEntry => entry !== null)
      : [],
    path: normalizeFileTreeString(body.path) ?? "",
    truncated: adaptFileTreeTruncated(body.truncated),
    next_cursor: normalizeFileTreeString(body.next_cursor),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- §4 read-only content fetch (review-rail-viewers ADR) ------------------------
//
// Tolerant adapter for `GET /nodes/{id}/content`. The live `{data, tiers}`
// envelope is already unwrapped by `unwrapEnvelope` before this runs; a body
// already in the internal shape (the mock) passes through unchanged — the
// one-code-path property. Every missing field defaults to a safe empty so a
// sparse or older shape NEVER throws and the viewer reads degraded state from the
// `tiers` block (defaulted to an empty block when absent), never from a thrown
// adapter. The `blob_hash` is the content-addressing key the bounded cache uses.

/** Default the content truncation block: forwarded only when the engine capped
 *  the body (a real object with the three fields); null/absent stays null. */
function adaptContentTruncated(value: unknown): ContentTruncated | null {
  if (
    isRec(value) &&
    typeof value.total_bytes === "number" &&
    typeof value.returned_bytes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_bytes: value.total_bytes,
      returned_bytes: value.returned_bytes,
      reason: value.reason,
    };
  }
  return null;
}

/** Live `/nodes/{id}/content` → the internal content response. TOLERANT: an
 *  absent body yields an empty text with an empty tiers block (the viewer renders
 *  its degraded/empty state from the tiers truth), and `language_hint`/`truncated`
 *  default to null. */
export function adaptContent(body: unknown): ContentResponse {
  if (!isRec(body)) {
    return {
      path: "",
      blob_hash: "",
      byte_len: 0,
      language_hint: null,
      text: "",
      truncated: null,
      tiers: {},
    };
  }
  const text = typeof body.text === "string" ? body.text : "";
  return {
    path: typeof body.path === "string" ? body.path : "",
    blob_hash: typeof body.blob_hash === "string" ? body.blob_hash : "",
    byte_len: typeof body.byte_len === "number" ? body.byte_len : text.length,
    language_hint: typeof body.language_hint === "string" ? body.language_hint : null,
    text,
    truncated: adaptContentTruncated(body.truncated),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- §4 node detail: flatten the {detail:{bundle}} wire ----------------------------
//
// The live `/nodes/{id}` route serves `{data:{detail:{bundle:{node, edges_by_tier,
// neighbors, degree_by_tier}}, summary?}, tiers}` (the orchestration-era context
// bundle, unchanged since the first serve-mode front door). The internal
// `NodeDetail` shape the stores layer consumes is FLAT — `{node, summary?, tiers}` —
// so this adapter bridges the nested wire into it (the tolerant one-code-path
// discipline of `adaptContent`): a mock/already-flat body whose `node` is at the
// top level passes through unchanged. Without this bridge `useNodeDetailView` reads
// `data.node` off the nested body, finds `undefined`, and degrades EVERY node to
// `unavailable` — the latent mock-mirrors-live divergence the injected-literal tests
// never exercised. `summary` is the lazy first-prose-line the route fills for doc
// nodes (absent for synthesized feature nodes); the hover card renders it when
// present and omits it otherwise.

/** Live `/nodes/{id}` → the internal flat `NodeDetail`. TOLERANT: an absent/odd
 *  shape yields an empty tiers block and an undefined node, so the consuming view
 *  reads degraded state from the tiers truth rather than a thrown adapter. */
export function adaptNodeDetail(body: unknown): NodeDetail {
  const rec = isRec(body) ? body : {};
  const detail = isRec(rec.detail) ? rec.detail : undefined;
  const bundle = detail && isRec(detail.bundle) ? detail.bundle : undefined;
  // Flat (mock / test fixture) node wins; else the nested context-bundle node.
  const node = (isRec(rec.node) ? rec.node : undefined) ?? bundle?.node;
  const summary =
    typeof rec.summary === "string"
      ? rec.summary
      : detail && typeof detail.summary === "string"
        ? detail.summary
        : undefined;
  const result: NodeDetail = {
    // A 200 always carries a node; an absent one keeps `data.node` falsy so the
    // view degrades honestly rather than rendering an empty-id card.
    node: node as EngineNode,
    tiers: (rec.tiers ?? {}) as TiersBlock,
  };
  if (summary !== undefined) result.summary = summary;
  if (isRec(rec.interior)) result.interior = rec.interior as unknown as GraphSlice;
  return result;
}

// --- §4 node evidence: floor the three evidence arrays -----------------------------
//
// The live `/nodes/{id}/evidence` route serves the evidence fields directly under
// `data` (flattened to the top level by `unwrapEnvelope`, with the `tiers` block a
// sibling). It was the ONE `/nodes` endpoint consumed RAW — every sibling
// (`adaptNodeDetail`/`adaptContent`/...) has a tolerant adapter and this did not. The
// engine serde OMITS an empty evidence array, so a node with no code locations (or no
// commits/documents) arrives MISSING that key; the pure evidence fold
// (`deriveEvidenceGroups`/`hasEvidence`) then read `.length` of `undefined` and crashed
// the whole graph (stage) panel on every hover/select. This adapter is the boundary
// fix (mock-mirrors-live, one-code-path): floor all three arrays so EVERY evidence
// consumer is protected, not just the hover card.

/** Live `/nodes/{id}/evidence` → the internal `NodeEvidence`. TOLERANT (the
 *  one-code-path discipline of `adaptNodeDetail`/`adaptContent`): each of the three
 *  evidence arrays is floored to `[]` when the wire omits it (the engine serde skips
 *  empty arrays), and an absent/odd body yields three empty arrays plus an empty tiers
 *  block — so the consumer reads degraded state from the `tiers` truth rather than a
 *  thrown adapter, and the evidence fold never reads `.length` of undefined. */
export function adaptNodeEvidence(body: unknown): NodeEvidence {
  const rec = isRec(body) ? body : {};
  return {
    documents: Array.isArray(rec.documents)
      ? (rec.documents as NodeEvidence["documents"])
      : [],
    code_locations: Array.isArray(rec.code_locations)
      ? (rec.code_locations as NodeEvidence["code_locations"])
      : [],
    commits: Array.isArray(rec.commits) ? (rec.commits as NodeEvidence["commits"]) : [],
    tiers: (rec.tiers ?? {}) as TiersBlock,
  };
}

// --- §5 recent commit history (status-overview ADR) --------------------------------
//
// The bounded recent-commit list with subjects, consumed through the stores
// history query (the sole wire client of `/history`). TOLERANT (the same one-code-
// path discipline as `adaptContent`): a sparse or older shape never throws — an
// absent body yields an empty commit list with an empty tiers block, and a
// malformed commit entry is dropped rather than crashing the rail. The rail reads
// degraded state from the `tiers` block, never from a thrown adapter.

/** Default the history truncation block: forwarded only when the engine clamped
 *  an over-ceiling request (a real object with the three fields); else null. */
function adaptHistoryTruncated(value: unknown): HistoryTruncated | null {
  if (
    isRec(value) &&
    typeof value.requested === "number" &&
    typeof value.returned === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      requested: value.requested,
      returned: value.returned,
      reason: value.reason,
    };
  }
  return null;
}

export const HISTORY_COMMITS_MAX_ITEMS = 200;
export const HISTORY_COMMIT_NODE_IDS_CAP = 256;
export const HISTORY_STRING_MAX_CHARS = 4096;
export const HISTORY_COMMIT_BODY_MAX_CHARS = 4097;

function normalizeHistoryString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= HISTORY_STRING_MAX_CHARS
    ? trimmed
    : null;
}

function normalizeHistoryBody(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= HISTORY_COMMIT_BODY_MAX_CHARS
    ? value
    : value.slice(0, HISTORY_COMMIT_BODY_MAX_CHARS);
}

/** One commit row → the internal shape, or null when the entry is malformed
 *  (missing its hash) so a single bad row never crashes the list. */
function adaptHistoryCommit(value: unknown): HistoryCommit | null {
  if (!isRec(value)) return null;
  const hash = normalizeHistoryString(value.hash);
  if (hash === null) return null;
  const shortHash = normalizeHistoryString(value.short_hash) ?? hash.slice(0, 8);
  return {
    hash,
    short_hash: shortHash,
    subject: normalizeHistoryString(value.subject) ?? "",
    body: normalizeHistoryBody(value.body),
    ts: typeof value.ts === "number" && Number.isFinite(value.ts) ? value.ts : 0,
    node_ids: Array.isArray(value.node_ids)
      ? normalizeNodeIds(value.node_ids, HISTORY_COMMIT_NODE_IDS_CAP)
      : [],
  };
}

/** Live `/history` → the internal history response. TOLERANT: an absent body
 *  yields an empty commit list with an empty tiers block (the rail renders its
 *  degraded/empty state from the tiers truth), and malformed rows are dropped. */
export function adaptHistory(body: unknown): HistoryResponse {
  if (!isRec(body)) {
    return { commits: [], truncated: null, next_cursor: null, tiers: {} };
  }
  const commits: HistoryCommit[] = [];
  if (Array.isArray(body.commits)) {
    for (const row of body.commits) {
      const commit = adaptHistoryCommit(row);
      if (commit === null) continue;
      commits.push(commit);
      if (commits.length >= HISTORY_COMMITS_MAX_ITEMS) break;
    }
  }
  const truncated =
    adaptHistoryTruncated(body.truncated) ??
    (Array.isArray(body.commits) && commits.length >= HISTORY_COMMITS_MAX_ITEMS
      ? {
          requested: body.commits.length,
          returned: commits.length,
          reason: "adapter commit ceiling",
        }
      : null);
  return {
    commits,
    truncated,
    next_cursor: normalizeHistoryString(body.next_cursor),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- GitHub work items (GET /prs, GET /issues) -------------------------------------
//
// TOLERANT, mirroring adaptHistory: a non-record or missing-field body yields an
// empty, unavailable result with an empty tiers block, and malformed rows are
// dropped, so one bad row never crashes the rail. `available`/`reason` carry the
// capability-local degradation the engine reports explicitly (never guessed).

const GITHUB_WORK_ITEM_LABELS_CAP = 32;

function normalizeGitHubWorkItemNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function normalizeGitHubWorkItemString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGitHubWorkItemNullableString(value: unknown): string | null {
  return normalizeGitHubWorkItemString(value) ?? null;
}

function normalizeGitHubWorkItemLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const label of value) {
    const normalized = normalizeGitHubWorkItemString(label);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    labels.push(normalized);
    if (labels.length >= GITHUB_WORK_ITEM_LABELS_CAP) break;
  }
  return labels;
}

function normalizeGitHubWorkItemCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function adaptPrChecks(value: unknown): PrChecks | null {
  if (!isRec(value)) return null;
  return {
    total: normalizeGitHubWorkItemCount(value.total),
    passed: normalizeGitHubWorkItemCount(value.passed),
    failing: normalizeGitHubWorkItemCount(value.failing),
    pending: normalizeGitHubWorkItemCount(value.pending),
  };
}

function adaptPullRequest(value: unknown): PullRequest | null {
  if (!isRec(value)) return null;
  const number = normalizeGitHubWorkItemNumber(value.number);
  if (number === null) return null;
  return {
    number,
    title: normalizeGitHubWorkItemString(value.title) ?? "",
    author: normalizeGitHubWorkItemString(value.author) ?? "",
    state: normalizeGitHubWorkItemString(value.state) ?? "",
    is_draft: value.is_draft === true,
    url: normalizeGitHubWorkItemString(value.url) ?? "",
    created_at: normalizeGitHubWorkItemNullableString(value.created_at),
    updated_at: normalizeGitHubWorkItemNullableString(value.updated_at),
    merged_at: normalizeGitHubWorkItemNullableString(value.merged_at),
    review_decision: normalizeGitHubWorkItemString(value.review_decision) ?? "",
    checks: adaptPrChecks(value.checks),
  };
}

function adaptIssue(value: unknown): Issue | null {
  if (!isRec(value)) return null;
  const number = normalizeGitHubWorkItemNumber(value.number);
  if (number === null) return null;
  return {
    number,
    title: normalizeGitHubWorkItemString(value.title) ?? "",
    author: normalizeGitHubWorkItemString(value.author) ?? "",
    state: normalizeGitHubWorkItemString(value.state) ?? "",
    url: normalizeGitHubWorkItemString(value.url) ?? "",
    created_at: normalizeGitHubWorkItemNullableString(value.created_at),
    updated_at: normalizeGitHubWorkItemNullableString(value.updated_at),
    labels: normalizeGitHubWorkItemLabels(value.labels),
  };
}

/** Live `/prs` → the internal PRs response. Tolerant; capability availability is
 *  read from the engine's explicit `available`/`reason`, defaulting to
 *  unavailable when absent so the rail degrades safely. */
export function adaptPrs(body: unknown): PRsResponse {
  if (!isRec(body)) {
    return { prs: [], available: false, reason: null, tiers: {} };
  }
  const prs = Array.isArray(body.prs)
    ? body.prs.map(adaptPullRequest).filter((p): p is PullRequest => p !== null)
    : [];
  return {
    prs,
    available: body.available === true,
    reason: normalizeGitHubWorkItemNullableString(body.reason),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Live `/issues` → the internal issues response. Tolerant, same contract as
 *  {@link adaptPrs}. */
export function adaptIssues(body: unknown): IssuesResponse {
  if (!isRec(body)) {
    return { issues: [], available: false, reason: null, tiers: {} };
  }
  const issues = Array.isArray(body.issues)
    ? body.issues.map(adaptIssue).filter((i): i is Issue => i !== null)
    : [];
  return {
    issues,
    available: body.available === true,
    reason: normalizeGitHubWorkItemNullableString(body.reason),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- shared doc-node-id grammar (§2 identity) --------------------------------------
//
// The single owner of the `doc:{stem}` grammar: strip the directory and the `.md`
// suffix to recover a vault document's stem, then prefix `doc:` for its node id.
// Both `deriveSearchNodeId` (the live search adapter) and the search controller's
// `pathStem`/`pathToDocNodeId` consume this pair, so the grammar lives in exactly
// one place instead of being re-implemented per consumer (centralisation audit L2).

/** A vault path → its canonical stem: the filename without directory or `.md`. */
export function stemFromPath(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

/** A vault document stem → its contract document node id (`doc:{stem}`). */
export function docNodeIdFromStem(stem: string): string {
  return `doc:${stem}`;
}

/** A repo-relative code path → its contract code-artifact node id (`code:{path}`). */
export function codeNodeIdFromPath(path: string): string {
  return `code:${path}`;
}

/** Canonicalize a feature tag to its IDENTITY form: strip a leading `#` (frontmatter
 *  `tags:` carry it; engine-served `feature_tags` never do) and trim. This is the
 *  matching/identity counterpart to the DISPLAY sanitizer `featureTagDisplayName`, so a
 *  `#feature-raw` and a `feature-raw` resolve to the SAME node id and the SAME membership
 *  key everywhere a feature is selected, filtered, or matched. Returns null for a blank
 *  or non-string input. The identity is the raw (de-hashed) tag — NEVER the title-cased
 *  display string (that conversion is lossy and one-way). */
export function normalizeFeatureTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  // Trim FIRST so a leading-whitespace `  #tag  ` still de-hashes (the `^#+` anchor only
  // bites at position 0), then strip the hash, then trim any gap after it.
  const cleaned = tag.trim().replace(/^#+/, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** A feature tag → its synthesized constellation node id (`feature:{tag}`). The tag is
 *  normalized first (de-hashed) so `#feature-raw` and `feature-raw` map to one id. */
export function featureNodeIdFromTag(tag: string): string {
  return `feature:${normalizeFeatureTag(tag) ?? tag}`;
}

/** Recover the feature tag from a synthesized feature node id, or null. The recovered
 *  tag is normalized so a comparison against an engine-served `feature_tags` entry (which
 *  is already de-hashed) is exact. */
export function featureTagFromNodeId(id: string | null): string | null {
  if (id === null || !id.startsWith("feature:")) return null;
  return normalizeFeatureTag(id.slice("feature:".length));
}

/**
 * Click-through node id for a search hit. The engine's `node_id` annotation
 * always wins (contract §8 — the engine's sole value-add over the rag
 * pass-through). When it is absent, the client may only derive a fallback
 * along the node-id grammar (§2 identity, M-B1): a CODE hit derives
 * `code:{repo-relative path}`, a vault hit derives `doc:{stem}` through the
 * shared `stemFromPath`/`docNodeIdFromStem` grammar. A code result must NEVER be
 * papered as a `doc:` id — that loses the directory and mislabels the kind,
 * pointing at no graph node (finding wire-03). When no honest id can be formed
 * the value is null, never a guess.
 */
export function deriveSearchNodeId(item: Record<string, unknown>): string | null {
  if (typeof item.node_id === "string") return item.node_id;
  const path = typeof item.path === "string" ? item.path : undefined;
  const stem = typeof item.stem === "string" ? item.stem : undefined;
  // A vault document is always a `.md` path/stem; anything else (or an explicit
  // `source: "code"`) is a code hit whose id lives in the `code:` namespace.
  const isCode =
    item.source === "code" || (path !== undefined && !path.endsWith(".md"));
  if (isCode) return path ? codeNodeIdFromPath(path) : null;
  const docStem = stem ?? (path ? stemFromPath(path) : null);
  return docStem ? docNodeIdFromStem(docStem) : null;
}

// --- session / settings (user-state-persistence W04.P08.S28) ---------------------
//
// Tolerant adapters for the orchestration crate's session/settings surface. The
// live `{data, tiers}` envelope is already unwrapped by `unwrapEnvelope` before
// these run (the client's get/put path); a body already in the internal shape
// (the mock) passes through unchanged — the one-code-path property. Every
// missing field defaults to a safe empty so a sparse or older shape NEVER throws
// and the chrome never has to read the raw tiers block (the degradation truth
// still rides through on `tiers`, defaulted to an empty block when absent).

function normalizeSessionString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= SCOPE_ID_MAX_CHARS
    ? normalized
    : undefined;
}

export const SESSION_STRING_LIST_MAX_ITEMS = 512;

function normalizeSessionStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeSessionString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= SESSION_STRING_LIST_MAX_ITEMS) break;
  }
  return out;
}

/** Tolerant adapter for the machine-global `recent_scopes` list: an array of
 *  `{workspace, scope}` pairs, dropping malformed entries, deduping by the pair,
 *  and bounding the list. A sparse or older session shape (no `recent_scopes`)
 *  defaults to an empty list rather than throwing. */
function normalizeRecentScopes(value: unknown): RecentScope[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RecentScope[] = [];
  for (const entry of value) {
    if (!isRec(entry)) continue;
    const workspace = normalizeSessionString(entry.workspace);
    const scope = normalizeSessionString(entry.scope);
    if (workspace === undefined || scope === undefined) continue;
    const key = `${workspace} ${scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ workspace, scope });
    if (out.length >= SESSION_STRING_LIST_MAX_ITEMS) break;
  }
  return out;
}

/** Default a scope-context wire shape, tolerating an absent or partial object:
 *  an absent `folder` becomes null (no folder selected), absent `feature_tags`
 *  becomes []. */
function adaptScopeContext(value: unknown): ScopeContextWire {
  if (!isRec(value)) return { folder: null, feature_tags: [] };
  const folder = normalizeSessionString(value.folder) ?? null;
  const workspaceLayout = normalizeWorkspaceLayoutBlob(value.workspace_layout);
  return {
    folder,
    feature_tags: normalizeSessionStringList(value.feature_tags),
    ...(workspaceLayout !== null ? { workspace_layout: workspaceLayout } : {}),
  };
}

/**
 * Live `/session` → the internal session state. TOLERANT: a sparse body (no
 * `scope_context`, no `recents`) defaults to safe empties rather than throwing,
 * so a freshly-recreated best-effort store (the prototype's corrupt→empty path)
 * restores as "no selection yet" instead of crashing the load.
 */
export function adaptSession(body: unknown): SessionState {
  if (!isRec(body)) {
    return {
      workspace: "",
      active_scope: "",
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      recent_scopes: [],
      tiers: {},
    };
  }
  return {
    workspace: normalizeSessionString(body.workspace) ?? "",
    active_scope: normalizeSessionString(body.active_scope) ?? "",
    // The active WORKSPACE id (dashboard-workspace-registry ADR); null when
    // absent (a sparse or older session shape) so the rail marks none current.
    active_workspace: normalizeSessionString(body.active_workspace) ?? null,
    scope_context: adaptScopeContext(body.scope_context),
    recents: normalizeSessionStringList(body.recents),
    recent_scopes: normalizeRecentScopes(body.recent_scopes),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- workspace registry (dashboard-workspace-registry ADR) -----------------------
//
// Tolerant adapter for `GET /workspaces`. The live `{data, tiers}` envelope is
// already unwrapped by `unwrapEnvelope` before this runs; a body already in the
// internal shape (the mock) passes through unchanged. Every missing field
// defaults to a safe empty so a sparse or older shape NEVER throws and the
// chrome never reads the raw tiers block (the degradation truth rides on `tiers`,
// defaulted to an empty block when absent).

/** Default one registered-root wire row, tolerating an absent or partial object:
 *  missing id/label/path become empty strings, `is_launch`/`reachable` default
 *  conservatively (false / true — an unmarked root is treated as reachable so it
 *  is never wrongly hidden as degraded), and an absent reason is null. */
function normalizeWorkspaceString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function adaptWorkspaceRoot(value: unknown): WorkspaceRoot | null {
  if (!isRec(value)) return null;
  const id = normalizeWorkspaceString(value.id);
  const path = normalizeWorkspaceString(value.path);
  if (id === undefined || path === undefined) return null;
  const label = normalizeWorkspaceString(value.label) ?? id;
  return {
    id,
    label,
    path,
    is_launch: value.is_launch === true,
    // Absent reachability is treated as reachable (do not hide a root as
    // degraded on a missing field); only an explicit `false` degrades.
    reachable: value.reachable !== false,
    unreachable_reason: normalizeWorkspaceString(value.unreachable_reason) ?? null,
  };
}

/** Live `/workspaces` → the internal workspaces state. TOLERANT: an absent
 *  `workspaces` array defaults to empty (the rail renders the header fallback),
 *  and an absent active-workspace id is null. */
export function adaptWorkspaces(body: unknown): WorkspacesState {
  if (!isRec(body)) return { workspaces: [], active_workspace: null, tiers: {} };
  return {
    workspaces: Array.isArray(body.workspaces)
      ? body.workspaces
          .map(adaptWorkspaceRoot)
          .filter((root): root is WorkspaceRoot => root !== null)
      : [],
    active_workspace: normalizeWorkspaceString(body.active_workspace) ?? null,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Keys that would mutate the prototype chain if mapped from an untrusted wire object
 *  (JSON.parse makes `__proto__` an OWN enumerable key) — dropped defensively as a
 *  prototype-pollution guard at the trust boundary. */
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Default a flat `{ key: value }` string map, dropping non-string values AND
 *  prototype-polluting keys (untrusted wire input). */
function adaptStringMap(value: unknown): Record<string, string> {
  if (!isRec(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

/**
 * Live `/settings` → the internal settings state. TOLERANT: an absent `global`
 * or `scoped` (or a sparse-omitted scope) defaults to an empty map, so the
 * client composes precedence over whatever is present without guarding for
 * missing keys.
 */
export function adaptSettings(body: unknown): SettingsState {
  if (!isRec(body)) return { global: {}, scoped: {}, tiers: {} };
  const scopedRaw = isRec(body.scoped) ? body.scoped : {};
  const scoped: Record<string, Record<string, string>> = {};
  for (const [scope, entries] of Object.entries(scopedRaw)) {
    if (UNSAFE_OBJECT_KEYS.has(scope)) continue;
    scoped[scope] = adaptStringMap(entries);
  }
  return {
    global: adaptStringMap(body.global),
    scoped,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

const CONTROL_KINDS: SettingControlKind[] = [
  "segmented",
  "switch",
  "text",
  "slider",
  "keybinding",
  "graph_controls",
];

function normalizeSchemaString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeOptionalSchemaString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSchemaStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeSettingControlKind(value: unknown): SettingControlKind {
  const normalized = normalizeOptionalSchemaString(value);
  return normalized !== undefined && (CONTROL_KINDS as string[]).includes(normalized)
    ? (normalized as SettingControlKind)
    : "text";
}

/** Decode one `value_type` tagged union from the wire, defaulting unknown or
 *  malformed shapes to a permissive `string` so a sparse or newer wire never
 *  throws (the tolerant-adapter property). */
function adaptValueType(value: unknown): SettingValueType {
  if (!isRec(value) || typeof value.type !== "string") {
    return { type: "string", max_len: 4096 };
  }
  switch (value.type) {
    case "enum":
      return {
        type: "enum",
        members: normalizeSchemaStringList(value.members),
      };
    case "bool":
      return { type: "bool" };
    case "integer":
      return {
        type: "integer",
        min: typeof value.min === "number" ? value.min : 0,
        max: typeof value.max === "number" ? value.max : 100,
      };
    case "keybindings":
      return {
        type: "keybindings",
        max_entries: typeof value.max_entries === "number" ? value.max_entries : 256,
      };
    case "graph_controls":
      return {
        type: "graph_controls",
        max_entries: typeof value.max_entries === "number" ? value.max_entries : 256,
      };
    case "string":
    default:
      return {
        type: "string",
        max_len: typeof value.max_len === "number" ? value.max_len : 4096,
      };
  }
}

/** Decode one declared setting from the wire, defaulting every missing field to
 *  a safe value. An unknown control kind falls back to `text` (the most generic
 *  renderer), so a newer engine-declared control never crashes an older client. */
function adaptSettingDef(value: unknown): SettingDef | null {
  if (!isRec(value)) return null;
  const key = normalizeOptionalSchemaString(value.key);
  if (key === undefined) return null;
  const control = normalizeSettingControlKind(value.control);
  return {
    key,
    value_type: adaptValueType(value.value_type),
    default: typeof value.default === "string" ? value.default : "",
    scope_eligible: value.scope_eligible === true,
    control,
    label: normalizeSchemaString(value.label, key),
    description: normalizeSchemaString(value.description, ""),
    group: normalizeSchemaString(value.group, "General"),
    order: typeof value.order === "number" ? value.order : 0,
    step: typeof value.step === "number" ? value.step : undefined,
    unit: normalizeOptionalSchemaString(value.unit),
    placeholder: normalizeOptionalSchemaString(value.placeholder),
  };
}

/** Live `/settings/schema` → the internal schema. TOLERANT: an absent settings
 *  or groups array defaults to empty; malformed defs are dropped rather than
 *  throwing, and the chrome never reads the raw tiers block. */
export function adaptSettingsSchema(body: unknown): SettingsSchema {
  if (!isRec(body)) return { settings: [], groups: [], tiers: {} };
  const settings = Array.isArray(body.settings)
    ? body.settings.map(adaptSettingDef).filter((d): d is SettingDef => d !== null)
    : [];
  const groups = normalizeSchemaStringList(body.groups);
  return { settings, groups, tiers: (body.tiers ?? {}) as TiersBlock };
}

// --- pipeline / plan-interior / git (dashboard-pipeline-wire W05.P11.S61) ---------
//
// Tolerant adapters for the three new wire capabilities, mirroring adaptGraphSlice:
// the live `{data, tiers}` envelope is already unwrapped by `unwrapEnvelope` before
// these run, and a body already in the internal shape (the mock) passes through
// unchanged — the one-code-path property. Every missing field defaults to a safe
// empty so a sparse or older shape NEVER throws and the chrome never reads the raw
// tiers block (degradation truth rides on `tiers`, defaulted to an empty block).

const PIPELINE_PHASES: PipelinePhase[] = [
  "research",
  "adr",
  "plan",
  "execute",
  "review",
];

function normalizePipelineString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePipelineStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizePipelineString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
}

function normalizePipelinePhase(value: unknown): PipelinePhase {
  const normalized = normalizePipelineString(value);
  return normalized !== undefined && (PIPELINE_PHASES as string[]).includes(normalized)
    ? (normalized as PipelinePhase)
    : "plan";
}

/** Default one in-flight artifact wire row, tolerating an absent or partial
 *  object. An unknown phase falls back to `plan` (the safe neutral phase); the
 *  optional status/tier/progress are forwarded only when present. */
function adaptPipelineArtifact(value: unknown): PipelineArtifact | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  if (nodeId === null) return null;
  const phase = normalizePipelinePhase(value.phase);
  const progress =
    isRec(value.progress) &&
    typeof value.progress.done === "number" &&
    Number.isFinite(value.progress.done) &&
    typeof value.progress.total === "number" &&
    Number.isFinite(value.progress.total)
      ? { done: value.progress.done, total: value.progress.total }
      : undefined;
  // Dates (dashboard-pipeline-status W01): forwarded only when a dates object is
  // present, so the row's freshness stamp is hidden on truthful absence.
  const dates = isRec(value.dates)
    ? {
        created: normalizePipelineString(value.dates.created),
        modified: normalizePipelineString(value.dates.modified),
      }
    : undefined;
  return {
    node_id: nodeId,
    stem: normalizePipelineString(value.stem) ?? "",
    title: normalizePipelineString(value.title),
    doc_type: normalizePipelineString(value.doc_type),
    status: normalizePipelineString(value.status),
    tier: normalizePipelineString(value.tier),
    progress,
    feature_tags: normalizePipelineStringList(value.feature_tags),
    dates,
    phase,
  };
}

/** Live `/pipeline` → the internal pipeline response. TOLERANT: an absent
 *  `artifacts` array defaults to empty (the Work pillar renders its empty state). */
export function adaptPipeline(body: unknown): PipelineResponse {
  if (!isRec(body)) return { artifacts: [], tiers: {} };
  return {
    artifacts: Array.isArray(body.artifacts)
      ? body.artifacts
          .map(adaptPipelineArtifact)
          .filter((artifact): artifact is PipelineArtifact => artifact !== null)
      : [],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Default one interior step wire row. `done` defaults to false (an unmarked
 *  step is open, never wrongly shown complete); the optional action and exec
 *  binding are forwarded only when present. */
/** A non-negative integer count, defaulting to 0 (tolerant of absent/garbage). */
function nonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/** Tolerant done/total rollup; absent or sparse → a zero rollup. */
function adaptInteriorRollup(value: unknown): InteriorRollup {
  if (!isRec(value)) return { done: 0, total: 0 };
  return { done: nonNegInt(value.done), total: nonNegInt(value.total) };
}

/** Tolerant per-plan summary; absent or sparse → zeros with no derived state. */
function adaptPlanSummary(value: unknown): PlanSummary {
  if (!isRec(value)) {
    return {
      wave_count: 0,
      phase_count: 0,
      step_count: 0,
      done_count: 0,
      plan_state: null,
    };
  }
  return {
    wave_count: nonNegInt(value.wave_count),
    phase_count: nonNegInt(value.phase_count),
    step_count: nonNegInt(value.step_count),
    done_count: nonNegInt(value.done_count),
    plan_state: typeof value.plan_state === "string" ? value.plan_state : null,
  };
}

function adaptInteriorStep(value: unknown): InteriorStep | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  const execNodeId = normalizeNodeId(value.exec_node_id);
  return {
    node_id: nodeId,
    id,
    action: normalizePipelineString(value.action),
    done: value.done === true,
    exec_node_id: execNodeId ?? undefined,
  };
}

function adaptInteriorPhase(value: unknown): InteriorPhase | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  return {
    node_id: nodeId,
    id,
    heading: normalizePipelineString(value.heading),
    steps: Array.isArray(value.steps)
      ? value.steps
          .map(adaptInteriorStep)
          .filter((step): step is InteriorStep => step !== null)
      : [],
    rollup: adaptInteriorRollup(value.rollup),
  };
}

function adaptInteriorWave(value: unknown): InteriorWave | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  return {
    node_id: nodeId,
    id,
    heading: normalizePipelineString(value.heading),
    phases: Array.isArray(value.phases)
      ? value.phases
          .map(adaptInteriorPhase)
          .filter((phase): phase is InteriorPhase => phase !== null)
      : [],
    rollup: adaptInteriorRollup(value.rollup),
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  interior (a real object with the three fields); null/absent stays null. */
function adaptInteriorTruncated(value: unknown): PlanInterior["truncated"] {
  if (
    isRec(value) &&
    typeof value.total_nodes === "number" &&
    typeof value.returned_nodes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_nodes: value.total_nodes,
      returned_nodes: value.returned_nodes,
      reason: value.reason,
    };
  }
  return null;
}

/** Live `/nodes/{id}/plan-interior` → the internal plan-interior response.
 *  TOLERANT: a sparse body defaults waves/phases/steps to empty and truncated to
 *  null, so the Work step-tree renders without guarding for missing keys. */
export function adaptPlanInterior(body: unknown): PlanInteriorResponse {
  const empty: PlanInterior = {
    plan_node_id: "",
    waves: [],
    phases: [],
    steps: [],
    summary: adaptPlanSummary(undefined),
    truncated: null,
  };
  if (!isRec(body)) return { interior: empty, tiers: {} };
  const raw = isRec(body.interior) ? body.interior : body;
  return {
    interior: {
      plan_node_id: normalizeNodeId(raw.plan_node_id) ?? "",
      waves: Array.isArray(raw.waves)
        ? raw.waves
            .map(adaptInteriorWave)
            .filter((wave): wave is InteriorWave => wave !== null)
        : [],
      phases: Array.isArray(raw.phases)
        ? raw.phases
            .map(adaptInteriorPhase)
            .filter((phase): phase is InteriorPhase => phase !== null)
        : [],
      steps: Array.isArray(raw.steps)
        ? raw.steps
            .map(adaptInteriorStep)
            .filter((step): step is InteriorStep => step !== null)
        : [],
      summary: adaptPlanSummary(raw.summary),
      truncated: adaptInteriorTruncated(raw.truncated),
    },
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

export const GIT_OP_VERB_MAX_CHARS = 32;
export const GIT_OP_OUTPUT_MAX_CHARS = 1024 * 1024;

function normalizeGitOpVerb(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.length <= GIT_OP_VERB_MAX_CHARS ? value : "";
}

function normalizeGitOpOutput(value: unknown): {
  output: string;
  truncated?: GitOpResponse["truncated"];
} {
  if (typeof value !== "string") return { output: "" };
  if (value.length <= GIT_OP_OUTPUT_MAX_CHARS) return { output: value };
  return {
    output: value.slice(0, GIT_OP_OUTPUT_MAX_CHARS),
    truncated: {
      returned_chars: GIT_OP_OUTPUT_MAX_CHARS,
      reason: "git output ceiling",
    },
  };
}

/** Live `/ops/git/{verb}` → the internal git-op response. TOLERANT: an absent
 *  `output` defaults to the empty string (no changes / empty diff), `verb` to the
 *  empty string. git's text output is capped at the stores boundary before the
 *  parser projects it into changed-files or diff state. */
export function adaptGitOp(body: unknown): GitOpResponse {
  if (!isRec(body)) return { verb: "", output: "", tiers: {} };
  const { output, truncated } = normalizeGitOpOutput(body.output);
  return {
    verb: normalizeGitOpVerb(body.verb),
    output,
    ...(truncated === undefined ? {} : { truncated }),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- git output parsers (git-diff-browser ADR / missing-backend-inventory B) ----------
//
// The `/ops/git` pass-through forwards git's stdout VERBATIM; the parse from that
// text into the chrome's structured shapes lives here in the stores layer (the
// chrome never re-parses unified-diff text on paint, and never fetches). The wire
// formats the engine whitelist produces:
//   • status : `git status --porcelain=v1 --branch` → a `## branch` header line,
//              then `XY path` per file (`R  old -> new` for renames).
//   • numstat: `git diff --numstat --no-color`       → `adds\tdels\tpath` per file
//              (`-\t-\tpath` for a binary file).
//   • diff   : `git diff --no-color -- <path>`        → a standard unified diff.

const VAULT_RE = /(^|\/)\.vault\//;
const PORCELAIN_CODES = new Set([" ", "M", "A", "D", "R", "C", "?", "U"]);
export const GIT_CHANGED_FILES_MAX_ROWS = 512;
export const GIT_PATH_MAX_CHARS = 4096;

function isVaultEntry(path: string): boolean {
  return VAULT_RE.test(path);
}

function normalizeGitPath(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= GIT_PATH_MAX_CHARS
    ? normalized
    : null;
}

function isPorcelainCode(code: string): boolean {
  return (
    code.length === 2 &&
    PORCELAIN_CODES.has(code.charAt(0)) &&
    PORCELAIN_CODES.has(code.charAt(1))
  );
}

/** Bucket a porcelain `XY` status into a render group + a grayscale-safe letter.
 *  X is the index (staged) side, Y the worktree side. A non-space, non-`?` index
 *  char means the change is staged; `??` is untracked; otherwise the worktree
 *  char drives the group. */
function classifyPorcelain(code: string): { group: GitChangeGroup; letter: string } {
  const x = code.charAt(0);
  const y = code.charAt(1);
  if (x === "?" || y === "?") return { group: "untracked", letter: "?" };
  // A staged (index-side) change: X carries a status and it is not a worktree-only
  // change. Renames are reported on the index side (`R `), so check rename first.
  if (x === "R" || y === "R") return { group: "renamed", letter: "R" };
  if (x !== " " && x !== "?") {
    const letter = x === "A" ? "A" : x === "D" ? "D" : "M";
    return { group: "staged", letter };
  }
  if (y === "D") return { group: "deleted", letter: "D" };
  if (y === "A") return { group: "added", letter: "A" };
  return { group: "modified", letter: "M" };
}

/** Parse `git status --porcelain=v1 --branch` output into changed-file entries
 *  (one per file). The `## branch` header line and blank lines are skipped; a
 *  rename's `old -> new` path keeps the NEW path (the entry git tracks forward).
 *  numstat tallies (`adds`/`dels`) are filled by `mergeNumstat`. */
export function parseGitStatus(output: string): ChangedFile[] {
  const entries: ChangedFile[] = [];
  for (const raw of output.split("\n")) {
    if (raw.trim().length === 0 || raw.startsWith("## ")) continue;
    // Porcelain v1: two status chars, a separator space, then the path.
    if (raw.length < 4 || raw.charAt(2) !== " ") continue;
    const code = raw.slice(0, 2);
    if (!isPorcelainCode(code)) continue;
    let path = raw.slice(3);
    // Rename/copy: `old -> new` — track the new path.
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    const normalizedPath = normalizeGitPath(path);
    if (normalizedPath === null) continue;
    const { group, letter } = classifyPorcelain(code);
    entries.push({
      path: normalizedPath,
      code,
      letter,
      group,
      adds: null,
      dels: null,
      vault: isVaultEntry(normalizedPath),
    });
    if (entries.length >= GIT_CHANGED_FILES_MAX_ROWS) break;
  }
  return entries;
}

function normalizeGitNumstatCount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Parse `git diff --numstat` output into a path → {adds, dels} map. A binary
 *  file's `-\t-\tpath` row maps to null tallies. */
export function parseGitNumstat(
  output: string,
): Map<string, { adds: number | null; dels: number | null }> {
  const tallies = new Map<string, { adds: number | null; dels: number | null }>();
  for (const raw of output.split("\n")) {
    if (raw === "") continue;
    const parts = raw.split("\t");
    if (parts.length < 3) continue;
    const [addsStr, delsStr, ...rest] = parts;
    let path = rest.join("\t");
    // numstat renames render as `old => new` or `pre{old => new}post`; the diff
    // browser keys on the new path the status list also tracks.
    const brace = path.indexOf("{");
    if (brace !== -1 && path.includes(" => ")) {
      path = path.replace(/\{[^}]* => ([^}]*)\}/, "$1").replace(/ => /, "");
    } else if (path.includes(" => ")) {
      path = path.split(" => ").pop() ?? path;
    }
    const normalizedPath = normalizeGitPath(path);
    if (normalizedPath === null) continue;
    const adds = addsStr === "-" ? null : normalizeGitNumstatCount(addsStr);
    const dels = delsStr === "-" ? null : normalizeGitNumstatCount(delsStr);
    if ((addsStr !== "-" && adds === null) || (delsStr !== "-" && dels === null)) {
      continue;
    }
    tallies.set(normalizedPath, {
      adds,
      dels,
    });
    if (tallies.size >= GIT_CHANGED_FILES_MAX_ROWS) break;
  }
  return tallies;
}

/** Reconcile parsed status entries with numstat tallies (path-keyed), returning
 *  the entries with `adds`/`dels` filled where numstat carried a row. */
export function mergeNumstat(
  entries: ChangedFile[],
  tallies: Map<string, { adds: number | null; dels: number | null }>,
): ChangedFile[] {
  return entries.map((e) => {
    const t = tallies.get(e.path);
    if (!t) return e;
    // A numstat ROW with both tallies null is git's binary marker (`-\t-`). An
    // entry with NO row (untracked) keeps null tallies but is NOT binary — the
    // two states must read differently in the UI.
    const binary = t.adds === null && t.dels === null;
    return { ...e, adds: t.adds, dels: t.dels, binary };
  });
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const GIT_DIFF_STATUS_LETTERS = new Set(["M", "A", "D", "R", "?"]);
export const GIT_DIFF_MAX_HUNKS = 256;
export const GIT_DIFF_MAX_LINES = 5_000;
export const GIT_DIFF_LINE_MAX_CHARS = 8_192;

export function normalizeGitDiffStatus(status: unknown): string | undefined {
  if (typeof status !== "string") return undefined;
  const normalized = status.trim().toUpperCase();
  return GIT_DIFF_STATUS_LETTERS.has(normalized) ? normalized : undefined;
}

function normalizeGitDiffLineText(text: string): {
  text: string;
  truncated: boolean;
} {
  return text.length <= GIT_DIFF_LINE_MAX_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, GIT_DIFF_LINE_MAX_CHARS), truncated: true };
}

/** Parse a single file's `git diff --no-color` output into the structured
 *  `GitFileDiff` the `DiffView` renders: hunk-per-entry with twin (old/new) line
 *  numbers and a per-line change kind. A diff with a `Binary files ... differ`
 *  marker (or no hunks) reports `binary`. */
export function parseUnifiedDiff(
  output: string,
  path: string,
  status?: unknown,
): GitFileDiff {
  const normalizedStatus = normalizeGitDiffStatus(status);
  const normalizedPath = normalizeGitPath(path) ?? "";
  const lines = output.split("\n");
  const totalHunks = lines.reduce(
    (count, line) => count + (HUNK_HEADER_RE.test(line) ? 1 : 0),
    0,
  );
  const binary = lines.some(
    (l) => l.startsWith("Binary files ") && l.endsWith(" differ"),
  );
  const hunks: GitDiffHunk[] = [];
  let current: GitDiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let returnedLines = 0;
  let truncatedReason: string | null = null;
  for (const line of lines) {
    const m = HUNK_HEADER_RE.exec(line);
    if (m) {
      if (hunks.length >= GIT_DIFF_MAX_HUNKS) {
        truncatedReason = "hunk ceiling";
        break;
      }
      current = { header: line, lines: [] };
      hunks.push(current);
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      continue;
    }
    if (!current) continue; // pre-hunk preamble (diff --git, index, ---, +++)
    if (returnedLines >= GIT_DIFF_MAX_LINES) {
      truncatedReason = "line ceiling";
      break;
    }
    const marker = line.charAt(0);
    if (marker === "+") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "add",
        old: null,
        new: newNo,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      newNo += 1;
    } else if (marker === "-") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "remove",
        old: oldNo,
        new: null,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      oldNo += 1;
    } else if (marker === " ") {
      const normalizedText = normalizeGitDiffLineText(line.slice(1));
      if (normalizedText.truncated) truncatedReason = "line length ceiling";
      const diffLine: GitDiffLine = {
        kind: "context",
        old: oldNo,
        new: newNo,
        text: normalizedText.text,
      };
      current.lines.push(diffLine);
      returnedLines += 1;
      oldNo += 1;
      newNo += 1;
    }
    // `\ No newline at end of file` and any other line is ignored.
  }
  return {
    path: normalizedPath,
    ...(normalizedStatus === undefined ? {} : { status: normalizedStatus }),
    hunks,
    binary: binary && hunks.length === 0,
    ...(truncatedReason === null
      ? {}
      : {
          truncated: {
            total_hunks: totalHunks,
            returned_hunks: hunks.length,
            reason: truncatedReason,
          },
        }),
  };
}
