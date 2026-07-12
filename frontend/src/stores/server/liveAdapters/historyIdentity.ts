// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeNodeIds } from "../../nodeIds";
import type {
  HistoryCommit,
  HistoryResponse,
  HistoryTruncated,
  Issue,
  IssuesResponse,
  PRsResponse,
  PrChecks,
  PullRequest,
  TiersBlock,
} from "../engine";
import { isRec } from "./internal";

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
