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
  ContentResponse,
  ContentTruncated,
  EngineEdge,
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
  GraphSlice,
  HistoryCommit,
  HistoryResponse,
  HistoryTruncated,
  InteriorPhase,
  InteriorStep,
  InteriorWave,
  LineageArc,
  LineageNode,
  LineagePhase,
  LineageSlice,
  MapResponse,
  PipelineArtifact,
  PipelinePhase,
  PipelineResponse,
  PlanInterior,
  PlanInteriorResponse,
  ScopeContextWire,
  SessionState,
  SettingControlKind,
  SettingDef,
  SettingsSchema,
  SettingsState,
  SettingValueType,
  TiersBlock,
  VaultTreeResponse,
  WireMetaEdge,
  WorkspaceRoot,
  WorkspacesState,
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
 * is the honest single answer. Ties resolve by the canonical tier order
 * (`CANONICAL_TIERS`). An empty/all-zero breakdown (degenerate; the live engine
 * never emits one) falls back to `structural`, the tier of the cross-feature
 * mentions that produce meta-edges.
 */
function dominantTier(breakdown: Record<string, number>): EngineEdge["tier"] {
  let best: EngineEdge["tier"] = "structural";
  // Seed at 0 so a tier only wins on a POSITIVE count: an empty breakdown
  // keeps the `structural` default rather than the first-enumerated tier.
  let bestCount = 0;
  for (const tier of CANONICAL_TIERS) {
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
export function adaptGraphSlice(body: unknown): GraphSlice {
  if (!isRec(body)) return body as GraphSlice;
  const edges = Array.isArray(body.edges) ? (body.edges as EngineEdge[]) : [];
  const metaEdges = Array.isArray(body.meta_edges)
    ? (body.meta_edges as WireMetaEdge[])
    : [];
  // Drop the raw meta_edges off the returned slice — it is now in `edges`.
  const { meta_edges: _folded, ...rest } = body as Rec;
  if (!metaEdges.length) {
    return { ...(rest as object), edges } as GraphSlice;
  }
  // Deduplicate by id: if an origin already inlined a meta-edge into `edges`
  // (same id as would be synthesized), the fold must not append a duplicate
  // (provenance-stable-keys-are-identity-bearing: one edge per id per slice).
  const existingIds = new Set(edges.map((e) => e.id));
  const folded = metaEdges.map(metaEdgeToEdge).filter((e) => !existingIds.has(e.id));
  return {
    ...(rest as object),
    edges: [...edges, ...folded],
  } as GraphSlice;
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
  const tier = (CANONICAL_TIERS as readonly string[]).includes(tierRaw)
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
          // ahead/behind are null when no upstream is configured — map to
          // undefined so callers can distinguish "unknown" from "0 ahead".
          ahead: w.ahead != null ? Number(w.ahead) : undefined,
          behind: w.behind != null ? Number(w.behind) : undefined,
        })),
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
 *   `dirty` may be a boolean (live) or a string[] (internal/mock) — both mapped
 *   tolerantly; a boolean `true` produces a one-element sentinel so
 *   `gitCard` correctly shows the dirty indicator without overclaiming the count.
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
    // Emit the canonical lifecycle word `isRagRunning` later tests: a reachable
    // backend maps to exactly `"running"` (the running token), anything else to
    // `"stopped"`. One source of the `"running"` token, one predicate over it.
    rag: { service: rag.available === true ? RAG_RUNNING : "stopped" },
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
  const rawBounds = isRec(v.date_bounds) ? v.date_bounds : undefined;
  const dateBounds = rawBounds
    ? {
        from: (rawBounds.min ?? rawBounds.from) as string | undefined,
        to: (rawBounds.max ?? rawBounds.to) as string | undefined,
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
    date_bounds: dateBounds,
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
      // Status/tier query-time facets (dashboard-pipeline-wire W01): forwarded
      // when present so an ADR carries its status and a plan its tier; absent
      // everywhere else (truthful absence).
      ...(typeof entry.status === "string" ? { status: entry.status } : {}),
      ...(typeof entry.tier === "string" ? { tier: entry.tier } : {}),
      // Plan checkbox progress (dashboard-pipeline-wire): forwarded only when
      // the wire carries a well-formed {done,total} pair so the plan-status pip
      // (✓/◐/○) lights up from real lifecycle truth; absent (and so honest
      // not-started) on every non-plan row and progress-less plan.
      ...(isRec(entry.progress) &&
      typeof entry.progress.done === "number" &&
      typeof entry.progress.total === "number"
        ? { progress: { done: entry.progress.done, total: entry.progress.total } }
        : {}),
      dates: {},
    };
  });
  return { entries, tiers: (body.tiers ?? {}) as TiersBlock };
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

/** Default one child wire row, tolerating an absent or partial object: an
 *  unknown/absent `kind` defaults to `file` (never wrongly shown expandable),
 *  `has_children` to false, and an absent `node_id` to the empty string (the
 *  code mode treats it as the quiet absent-interlink state). */
function adaptFileTreeEntry(value: unknown): FileTreeEntry {
  if (!isRec(value)) {
    return { path: "", kind: "file", has_children: false, node_id: "" };
  }
  return {
    path: typeof value.path === "string" ? value.path : "",
    kind: value.kind === "dir" ? "dir" : "file",
    has_children: value.has_children === true,
    node_id: typeof value.node_id === "string" ? value.node_id : "",
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  level (a real object with the three fields); null/absent stays null. */
function adaptFileTreeTruncated(value: unknown): FileTreeTruncated | null {
  if (
    isRec(value) &&
    typeof value.total_children === "number" &&
    typeof value.returned_children === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_children: value.total_children,
      returned_children: value.returned_children,
      reason: value.reason,
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
    entries: Array.isArray(body.entries) ? body.entries.map(adaptFileTreeEntry) : [],
    path: typeof body.path === "string" ? body.path : "",
    truncated: adaptFileTreeTruncated(body.truncated),
    next_cursor: typeof body.next_cursor === "string" ? body.next_cursor : undefined,
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

/** One commit row → the internal shape, or null when the entry is malformed
 *  (missing its hash) so a single bad row never crashes the list. */
function adaptHistoryCommit(value: unknown): HistoryCommit | null {
  if (!isRec(value) || typeof value.hash !== "string") return null;
  const hash = value.hash;
  return {
    hash,
    short_hash:
      typeof value.short_hash === "string" ? value.short_hash : hash.slice(0, 8),
    subject: typeof value.subject === "string" ? value.subject : "",
    ts: typeof value.ts === "number" ? value.ts : 0,
    node_ids: Array.isArray(value.node_ids)
      ? value.node_ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/** Live `/history` → the internal history response. TOLERANT: an absent body
 *  yields an empty commit list with an empty tiers block (the rail renders its
 *  degraded/empty state from the tiers truth), and malformed rows are dropped. */
export function adaptHistory(body: unknown): HistoryResponse {
  if (!isRec(body)) {
    return { commits: [], truncated: null, tiers: {} };
  }
  const commits = Array.isArray(body.commits)
    ? body.commits.map(adaptHistoryCommit).filter((c): c is HistoryCommit => c !== null)
    : [];
  return {
    commits,
    truncated: adaptHistoryTruncated(body.truncated),
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
  if (isCode) return path ? `code:${path}` : null;
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

/** Default a scope-context wire shape, tolerating an absent or partial object:
 *  an absent `folder` becomes null (no folder selected), absent `feature_tags`
 *  becomes []. */
function adaptScopeContext(value: unknown): ScopeContextWire {
  if (!isRec(value)) return { folder: null, feature_tags: [] };
  return {
    folder: typeof value.folder === "string" ? value.folder : null,
    feature_tags: Array.isArray(value.feature_tags)
      ? (value.feature_tags as string[])
      : [],
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
      tiers: {},
    };
  }
  return {
    workspace: typeof body.workspace === "string" ? body.workspace : "",
    active_scope: typeof body.active_scope === "string" ? body.active_scope : "",
    // The active WORKSPACE id (dashboard-workspace-registry ADR); null when
    // absent (a sparse or older session shape) so the rail marks none current.
    active_workspace:
      typeof body.active_workspace === "string" ? body.active_workspace : null,
    scope_context: adaptScopeContext(body.scope_context),
    recents: Array.isArray(body.recents) ? (body.recents as string[]) : [],
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
function adaptWorkspaceRoot(value: unknown): WorkspaceRoot {
  if (!isRec(value)) {
    return {
      id: "",
      label: "",
      path: "",
      is_launch: false,
      reachable: true,
      unreachable_reason: null,
    };
  }
  return {
    id: typeof value.id === "string" ? value.id : "",
    label: typeof value.label === "string" ? value.label : "",
    path: typeof value.path === "string" ? value.path : "",
    is_launch: value.is_launch === true,
    // Absent reachability is treated as reachable (do not hide a root as
    // degraded on a missing field); only an explicit `false` degrades.
    reachable: value.reachable !== false,
    unreachable_reason:
      typeof value.unreachable_reason === "string" ? value.unreachable_reason : null,
  };
}

/** Live `/workspaces` → the internal workspaces state. TOLERANT: an absent
 *  `workspaces` array defaults to empty (the rail renders the header fallback),
 *  and an absent active-workspace id is null. */
export function adaptWorkspaces(body: unknown): WorkspacesState {
  if (!isRec(body)) return { workspaces: [], active_workspace: null, tiers: {} };
  return {
    workspaces: Array.isArray(body.workspaces)
      ? (body.workspaces as unknown[]).map(adaptWorkspaceRoot)
      : [],
    active_workspace:
      typeof body.active_workspace === "string" ? body.active_workspace : null,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Default a flat `{ key: value }` string map, dropping non-string values. */
function adaptStringMap(value: unknown): Record<string, string> {
  if (!isRec(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
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
    scoped[scope] = adaptStringMap(entries);
  }
  return {
    global: adaptStringMap(body.global),
    scoped,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

const CONTROL_KINDS: SettingControlKind[] = ["segmented", "switch", "text", "slider"];

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
        members: Array.isArray(value.members)
          ? value.members.filter((m): m is string => typeof m === "string")
          : [],
      };
    case "bool":
      return { type: "bool" };
    case "integer":
      return {
        type: "integer",
        min: typeof value.min === "number" ? value.min : 0,
        max: typeof value.max === "number" ? value.max : 100,
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
  if (!isRec(value) || typeof value.key !== "string") return null;
  const controlRaw = typeof value.control === "string" ? value.control : "";
  const control = (CONTROL_KINDS as string[]).includes(controlRaw)
    ? (controlRaw as SettingControlKind)
    : "text";
  return {
    key: value.key,
    value_type: adaptValueType(value.value_type),
    default: typeof value.default === "string" ? value.default : "",
    scope_eligible: value.scope_eligible === true,
    control,
    label: typeof value.label === "string" ? value.label : value.key,
    description: typeof value.description === "string" ? value.description : "",
    group: typeof value.group === "string" ? value.group : "General",
    order: typeof value.order === "number" ? value.order : 0,
    step: typeof value.step === "number" ? value.step : undefined,
    unit: typeof value.unit === "string" ? value.unit : undefined,
    placeholder: typeof value.placeholder === "string" ? value.placeholder : undefined,
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
  const groups = Array.isArray(body.groups)
    ? body.groups.filter((g): g is string => typeof g === "string")
    : [];
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

/** Default one in-flight artifact wire row, tolerating an absent or partial
 *  object. An unknown phase falls back to `plan` (the safe neutral phase); the
 *  optional status/tier/progress are forwarded only when present. */
function adaptPipelineArtifact(value: unknown): PipelineArtifact {
  if (!isRec(value)) {
    return { node_id: "", stem: "", phase: "plan" };
  }
  const phaseRaw = typeof value.phase === "string" ? value.phase : "";
  const phase = (PIPELINE_PHASES as string[]).includes(phaseRaw)
    ? (phaseRaw as PipelinePhase)
    : "plan";
  const progress =
    isRec(value.progress) &&
    typeof value.progress.done === "number" &&
    typeof value.progress.total === "number"
      ? { done: value.progress.done, total: value.progress.total }
      : undefined;
  // Dates (dashboard-pipeline-status W01): forwarded only when a dates object is
  // present, so the row's freshness stamp is hidden on truthful absence.
  const dates = isRec(value.dates)
    ? {
        created:
          typeof value.dates.created === "string" ? value.dates.created : undefined,
        modified:
          typeof value.dates.modified === "string" ? value.dates.modified : undefined,
      }
    : undefined;
  return {
    node_id: typeof value.node_id === "string" ? value.node_id : "",
    stem: typeof value.stem === "string" ? value.stem : "",
    title: typeof value.title === "string" ? value.title : undefined,
    doc_type: typeof value.doc_type === "string" ? value.doc_type : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    tier: typeof value.tier === "string" ? value.tier : undefined,
    progress,
    feature_tags: Array.isArray(value.feature_tags)
      ? (value.feature_tags as string[])
      : undefined,
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
      ? body.artifacts.map(adaptPipelineArtifact)
      : [],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Default one interior step wire row. `done` defaults to false (an unmarked
 *  step is open, never wrongly shown complete); the optional action and exec
 *  binding are forwarded only when present. */
function adaptInteriorStep(value: unknown): InteriorStep {
  if (!isRec(value)) return { node_id: "", id: "", done: false };
  return {
    node_id: typeof value.node_id === "string" ? value.node_id : "",
    id: typeof value.id === "string" ? value.id : "",
    action: typeof value.action === "string" ? value.action : undefined,
    done: value.done === true,
    exec_node_id:
      typeof value.exec_node_id === "string" ? value.exec_node_id : undefined,
  };
}

function adaptInteriorPhase(value: unknown): InteriorPhase {
  if (!isRec(value)) return { node_id: "", id: "", steps: [] };
  return {
    node_id: typeof value.node_id === "string" ? value.node_id : "",
    id: typeof value.id === "string" ? value.id : "",
    heading: typeof value.heading === "string" ? value.heading : undefined,
    steps: Array.isArray(value.steps) ? value.steps.map(adaptInteriorStep) : [],
  };
}

function adaptInteriorWave(value: unknown): InteriorWave {
  if (!isRec(value)) return { node_id: "", id: "", phases: [] };
  return {
    node_id: typeof value.node_id === "string" ? value.node_id : "",
    id: typeof value.id === "string" ? value.id : "",
    heading: typeof value.heading === "string" ? value.heading : undefined,
    phases: Array.isArray(value.phases) ? value.phases.map(adaptInteriorPhase) : [],
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
    truncated: null,
  };
  if (!isRec(body)) return { interior: empty, tiers: {} };
  const raw = isRec(body.interior) ? body.interior : body;
  return {
    interior: {
      plan_node_id: typeof raw.plan_node_id === "string" ? raw.plan_node_id : "",
      waves: Array.isArray(raw.waves) ? raw.waves.map(adaptInteriorWave) : [],
      phases: Array.isArray(raw.phases) ? raw.phases.map(adaptInteriorPhase) : [],
      steps: Array.isArray(raw.steps) ? raw.steps.map(adaptInteriorStep) : [],
      truncated: adaptInteriorTruncated(raw.truncated),
    },
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Live `/ops/git/{verb}` → the internal git-op response. TOLERANT: an absent
 *  `output` defaults to the empty string (no changes / empty diff), `verb` to the
 *  empty string. git's text output is forwarded verbatim for the client to parse. */
export function adaptGitOp(body: unknown): GitOpResponse {
  if (!isRec(body)) return { verb: "", output: "", tiers: {} };
  return {
    verb: typeof body.verb === "string" ? body.verb : "",
    output: typeof body.output === "string" ? body.output : "",
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

function isVaultEntry(path: string): boolean {
  return VAULT_RE.test(path);
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
    if (raw === "" || raw.startsWith("## ")) continue;
    // Porcelain v1: two status chars, a separator space, then the path.
    if (raw.length < 4) continue;
    const code = raw.slice(0, 2);
    let path = raw.slice(3);
    // Rename/copy: `old -> new` — track the new path.
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    const { group, letter } = classifyPorcelain(code);
    entries.push({
      path,
      code,
      letter,
      group,
      adds: null,
      dels: null,
      vault: isVaultEntry(path),
    });
  }
  return entries;
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
    const adds = addsStr === "-" ? null : Number(addsStr);
    const dels = delsStr === "-" ? null : Number(delsStr);
    tallies.set(path, {
      adds: adds === null || Number.isNaN(adds) ? null : adds,
      dels: dels === null || Number.isNaN(dels) ? null : dels,
    });
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
    return t ? { ...e, adds: t.adds, dels: t.dels } : e;
  });
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parse a single file's `git diff --no-color` output into the structured
 *  `GitFileDiff` the `DiffView` renders: hunk-per-entry with twin (old/new) line
 *  numbers and a per-line change kind. A diff with a `Binary files ... differ`
 *  marker (or no hunks) reports `binary`. */
export function parseUnifiedDiff(
  output: string,
  path: string,
  status?: string,
): GitFileDiff {
  const lines = output.split("\n");
  const binary = lines.some(
    (l) => l.startsWith("Binary files ") && l.endsWith(" differ"),
  );
  const hunks: GitDiffHunk[] = [];
  let current: GitDiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const line of lines) {
    const m = HUNK_HEADER_RE.exec(line);
    if (m) {
      current = { header: line, lines: [] };
      hunks.push(current);
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      continue;
    }
    if (!current) continue; // pre-hunk preamble (diff --git, index, ---, +++)
    const marker = line.charAt(0);
    if (marker === "+") {
      const diffLine: GitDiffLine = {
        kind: "add",
        old: null,
        new: newNo,
        text: line.slice(1),
      };
      current.lines.push(diffLine);
      newNo += 1;
    } else if (marker === "-") {
      const diffLine: GitDiffLine = {
        kind: "remove",
        old: oldNo,
        new: null,
        text: line.slice(1),
      };
      current.lines.push(diffLine);
      oldNo += 1;
    } else if (marker === " ") {
      const diffLine: GitDiffLine = {
        kind: "context",
        old: oldNo,
        new: newNo,
        text: line.slice(1),
      };
      current.lines.push(diffLine);
      oldNo += 1;
      newNo += 1;
    }
    // `\ No newline at end of file` and any other line is ignored.
  }
  return { path, status, hunks, binary: binary && hunks.length === 0 };
}
