// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import {
  CANONICAL_TIERS,
  type EngineStatus,
  type FiltersVocabulary,
  type LineageArc,
  type LineageNode,
  type LineagePhase,
  type LineageSlice,
  type MapResponse,
  type TiersBlock,
} from "../engine";
import { EDGE_TIER_ORDER } from "./graph";
import { isRec } from "./internal";

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
