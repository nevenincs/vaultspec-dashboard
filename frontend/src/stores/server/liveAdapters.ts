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

import type {
  EngineEdge,
  EngineStatus,
  FiltersVocabulary,
  GraphSlice,
  MapResponse,
  TiersBlock,
  VaultTreeResponse,
  WireMetaEdge,
} from "./engine";

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
  return { ...data, tiers: body.tiers as TiersBlock };
}

// --- §4 graph slice: fold the separate meta-edge array into edges ----------------

/** Canonical tier order — also the tie-break for a meta-edge's dominant tier. */
const TIER_ORDER = ["declared", "structural", "temporal", "semantic"] as const;

/**
 * The tier treatment a constellation ribbon takes: the tier carrying the most
 * underlying edges in the aggregation (ties resolve by canonical order). A
 * meta-edge spans tiers, but the line treatment needs one — the dominant tier
 * is the honest single answer. An empty/all-zero breakdown (degenerate; the
 * live engine never emits one) falls back to `structural`, the tier of the
 * cross-feature mentions that produce meta-edges.
 */
function dominantTier(breakdown: Record<string, number>): EngineEdge["tier"] {
  let best: EngineEdge["tier"] = "structural";
  // Seed at 0 so a tier only wins on a POSITIVE count: an empty breakdown
  // keeps the `structural` default rather than the first-enumerated tier.
  let bestCount = 0;
  for (const tier of TIER_ORDER) {
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
  return {
    id: `meta:${meta.src}->${meta.dst}`,
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
export function adaptGraphSlice(body: unknown): GraphSlice {
  if (!isRec(body)) return body as GraphSlice;
  const edges = Array.isArray(body.edges) ? (body.edges as EngineEdge[]) : [];
  const metaEdges = Array.isArray(body.meta_edges)
    ? (body.meta_edges as WireMetaEdge[])
    : [];
  // Drop the raw meta_edges off the returned slice — it is now in `edges`.
  const { meta_edges: _folded, ...rest } = body as Rec;
  return {
    ...(rest as object),
    edges: metaEdges.length ? [...edges, ...metaEdges.map(metaEdgeToEdge)] : edges,
  } as GraphSlice;
}

/** Live workspace map → the internal repositories shape. */
export function adaptMap(body: unknown): MapResponse {
  if (!isRec(body)) return body as MapResponse;
  if ("repositories" in body) return body as unknown as MapResponse;
  const worktrees = Array.isArray(body.worktrees) ? (body.worktrees as Rec[]) : [];
  const branches = Array.isArray(body.branches) ? (body.branches as Rec[]) : [];
  return {
    repositories: [
      {
        path: String(body.workspace ?? ""),
        branches: branches.map((b) => ({
          name: String(b.name ?? ""),
          kind: (b.class === "default"
            ? "default"
            : b.class === "feature"
              ? "feature"
              : "other") as "default" | "feature" | "other",
        })),
        worktrees: worktrees.map((w) => ({
          // Scope tokens are normalized worktree paths on the live origin.
          id: String(w.path ?? ""),
          path: String(w.path ?? ""),
          branch: String(w.head_ref ?? "").replace(/^refs\/heads\//, ""),
          has_vault: Boolean(w.has_vault),
          is_default: Boolean(w.is_main),
          degraded: Array.isArray(w.degraded) ? (w.degraded as string[]) : undefined,
        })),
      },
    ],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Live status rollup → the internal status shape (no git block served). */
export function adaptStatus(body: unknown): EngineStatus {
  if (!isRec(body)) return body as EngineStatus;
  if ("nodes" in body && "degradations" in body) return body as unknown as EngineStatus;
  const tiers = (body.tiers ?? {}) as TiersBlock;
  const index = isRec(body.index) ? body.index : {};
  const backends = isRec(body.backends) ? body.backends : {};
  const rag = isRec(backends.rag) ? backends.rag : {};
  return {
    ok: Boolean(body.ok),
    nodes: Number(index.nodes ?? 0),
    edges: Number(index.edges ?? 0),
    degradations: Object.entries(tiers)
      .filter(([, state]) => state.available === false)
      .map(([tier]) => tier),
    tiers,
    core: { reachable: isRec(backends.core) },
    rag: { service: rag.available === true ? "running" : "stopped" },
    // git: not served by the live status — the now strip renders the
    // honest down state; flagged as a capability divergence.
  };
}

/** Live `{vocabulary: {...}}` → the internal filters vocabulary. */
export function adaptFilters(body: unknown): FiltersVocabulary {
  if (!isRec(body)) return body as FiltersVocabulary;
  if (!isRec(body.vocabulary)) return body as unknown as FiltersVocabulary;
  const v = body.vocabulary;
  const list = (key: string): string[] =>
    Array.isArray(v[key]) ? (v[key] as string[]) : [];
  return {
    relations: list("relations"),
    tiers: list("tiers"),
    // The live vocabulary does not enumerate doc types or date bounds yet;
    // empty stays honest (the facet rows hide on empty vocabularies).
    doc_types: list("doc_types"),
    feature_tags: list("feature_tags"),
    kinds: list("kinds"),
    tiers_block: (body.tiers ?? undefined) as TiersBlock | undefined,
  };
}

/**
 * Live `/search` nests the rag envelope verbatim:
 * `{envelope: {ok, data: {results}}}`. Map result items tolerantly (the
 * rag item vocabulary: path/stem/source, score, excerpt/text) and derive
 * the graph node id from a stem when the engine annotation is absent —
 * the annotation gap is a flagged divergence, not silently papered.
 */
export function adaptSearch(body: unknown): { results: unknown[]; tiers: TiersBlock } {
  if (!isRec(body)) return body as never;
  if (Array.isArray(body.results)) return body as never; // internal/mock shape
  const envelope = isRec(body.envelope) ? body.envelope : {};
  const data = isRec(envelope.data) ? envelope.data : {};
  const rawResults = Array.isArray(data.results) ? (data.results as Rec[]) : [];
  return {
    results: rawResults.map((item) => ({
      score: Number(item.score ?? 0),
      source: String(item.source ?? item.path ?? item.stem ?? "result"),
      excerpt:
        typeof item.excerpt === "string"
          ? item.excerpt
          : typeof item.text === "string"
            ? item.text
            : undefined,
      node_id: deriveSearchNodeId(item),
    })),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Stem-suffix doc-type derivation (matches the vault naming convention). */
export function docTypeFromStem(stem: string): string {
  if (/-W\d+-P\d+-S\d+$|-P\d+-S\d+$|-S\d+$|-summary$/.test(stem)) return "exec";
  const match = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
  if (match) return match[1];
  if (/\.index$/.test(stem)) return "index";
  return "document";
}

/** Live stem/node_id tree entries → the internal path-bearing entries. */
export function adaptVaultTree(body: unknown): VaultTreeResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return body as VaultTreeResponse;
  }
  const entries = (body.entries as Rec[]).map((entry) => {
    if (typeof entry.path === "string") return entry as never;
    const stem = String(entry.stem ?? "");
    const docType = docTypeFromStem(stem);
    return {
      path: `.vault/${docType === "document" ? "doc" : docType}/${stem}.md`,
      doc_type: docType,
      feature_tags: Array.isArray(entry.feature_tags)
        ? (entry.feature_tags as string[])
        : [],
      dates: {},
    };
  });
  return { entries, tiers: (body.tiers ?? {}) as TiersBlock };
}

/**
 * Click-through node id for a search hit. The engine's `node_id` annotation
 * always wins (contract §8 — the engine's sole value-add over the rag
 * pass-through). When it is absent, the client may only derive a fallback
 * along the node-id grammar (§2 identity, M-B1): a CODE hit derives
 * `code:{repo-relative path}`, a vault hit derives `doc:{stem}`. A code result
 * must NEVER be papered as a `doc:` id — that loses the directory and mislabels
 * the kind, pointing at no graph node (finding wire-03). When no honest id can
 * be formed the value is null, never a guess.
 */
export function deriveSearchNodeId(item: Record<string, unknown>): string | null {
  if (typeof item.node_id === "string") return item.node_id;
  const path = typeof item.path === "string" ? item.path : undefined;
  const stem = typeof item.stem === "string" ? item.stem : undefined;
  // A vault document is always a `.md` path/stem; anything else (or an explicit
  // `source: "code"`) is a code hit whose id lives in the `code:` namespace.
  const isCode = item.source === "code" || (path !== undefined && !path.endsWith(".md"));
  if (isCode) return path ? `code:${path}` : null;
  const docStem = stem ?? (path ? path.replace(/^.*\//, "").replace(/\.md$/, "") : null);
  return docStem ? `doc:${docStem}` : null;
}
