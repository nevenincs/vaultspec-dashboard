// Decomposed from engine.ts (module-decomposition mandate, 2026-07-12).

import type { TiersBlock } from "./tiers";
import type { EngineNode, EngineEdge, GraphSlice } from "./graphTypes";

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
   *  temporal; the engine never mints a semantic graph edge (ADR D3.5). */
  tier: "declared" | "structural" | "temporal";
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

/**
 * Honest truncation for an over-ceiling diff (GIR-010, mirrors the graph-query /
 * lineage / ego `truncated` shape). `returned_deltas` is always 0: the server
 * degrades an over-ceiling diff to keyframe-only rather than ship a partial,
 * non-self-consistent mutation log.
 */
export interface GraphDiffTruncated {
  total_deltas: number;
  returned_deltas: number;
  reason: string;
}

export interface GraphDiffResponse {
  deltas: GraphDeltaEntry[];
  last_seq: number;
  tiers: TiersBlock;
  /**
   * Present (with `deltas` empty) when the server bounded an over-ceiling diff to
   * keyframe-only. The client answers by re-keyframing, never by applying a
   * partial log. Absent/null on an in-bounds diff.
   */
  truncated?: GraphDiffTruncated | null;
}

export interface GraphAsofResponse extends GraphSlice {
  /**
   * The requested timestamp echoed back. The engine returns the raw param as a
   * string when the caller passed a millisecond timestamp; callers must coerce
   * to number before using as a timeline cursor.
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
