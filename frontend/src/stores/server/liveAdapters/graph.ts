// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeDashboardDateRange } from "../dashboardDateRange";
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
} from "../dashboardStateNormalization";
import type {
  DashboardState,
  EmbeddingsResponse,
  EngineEdge,
  EngineNode,
  GraphCorpus,
  GraphSlice,
  NodeEmbedding,
  TiersBlock,
  WireMetaEdge,
} from "../engine";
import { normalizeStoreScope } from "../scopeIdentity";
import { isRec, type Rec } from "./internal";

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
export const EDGE_TIER_ORDER: readonly EngineEdge["tier"][] = [
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
