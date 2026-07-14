// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { normalizeNodeId, normalizeNodeIds } from "../../nodeIds";
import {
  EngineError,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type HistoryCommit,
  type HistoryResponse,
  type Issue,
  type IssuesResponse,
  type PRsResponse,
  type PullRequest,
  type TierAvailability,
} from "../engine";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  isAddressableNode,
  normalizeGraphSliceScope,
  normalizeNodeNeighborDepth,
  normalizeNodeScopedRequestIdentity,
  normalizeNodeScopedScope,
} from "./graph";
import { engineKeys } from "./internal";

// --- bounded recent commit history (status-overview ADR) ---------------------------
//
// The recent-commit list with subjects, consumed by the Status overview rail
// through these stores hooks so the rail (chrome) never fetches the engine or
// reads the raw `tiers` block (dashboard-layer-ownership: stores is the sole wire
// client of `/history`). The history query is BOUNDED at creation per
// bounded-by-default-for-every-accumulator: a fixed default limit folded into the
// key, an explicit `gcTime` that evicts an unobserved entry promptly, and the
// single-entry-per-(scope,limit) shape — the rail never accumulates every scope's
// commit list for the whole session. Degradation is read from the served `tiers`
// block, never guessed from a transport error
// (degradation-is-read-from-tiers-not-guessed-from-errors).

/** The rail's default recent-commit count (the ADR's ~20): a short snapshot, not
 *  the whole log. The engine clamps a larger value to its hard ceiling. */
export const DEFAULT_HISTORY_LIMIT = 20;

/** The rail's bounded local paging ceiling mirrors the engine's history clamp. */
export const MAX_HISTORY_LIMIT = 200;

/** How long an unobserved history entry survives before garbage collection
 *  (bounded-by-default-for-every-accumulator). 60s matches the content query's
 *  prompt eviction — generous for tab back-and-forth while keeping a long session
 *  from retaining every scope's commit list. */
const HISTORY_GC_TIME = 60_000;

export function normalizeHistoryLimit(limit: unknown): number {
  const candidate =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.floor(limit)
      : DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, candidate));
}

export interface HistoryRequestIdentity {
  scope: string | null;
  limit: number;
}

export function normalizeHistoryRequestIdentity(
  scope: unknown,
  limit: unknown = DEFAULT_HISTORY_LIMIT,
): HistoryRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    limit: normalizeHistoryLimit(limit),
  };
}

/**
 * The read-only recent-commit history fetch for one scope (status-overview ADR),
 * the SOLE wire client of `/history`. Keyed by (scope, limit); disabled when no
 * scope is resolved yet. Bounded: an explicit `gcTime` evicts the entry soon
 * after the tab is left, so a long session does not retain every scope's list.
 */
export function useNodeHistory(scope: unknown, limit: unknown = DEFAULT_HISTORY_LIMIT) {
  const request = normalizeHistoryRequestIdentity(scope, limit);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.history(request.scope ?? "", request.limit),
    queryFn: () =>
      engineClient.history({ scope: request.scope!, limit: request.limit }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * The interpreted history view the Status overview rail renders: `loading` while
 * in flight, `degraded` read from the served `tiers` block (the `structural` tier
 * the commit read resolves through), `errored` for a tiers-less transport fault
 * (distinct from degraded), and the commit list when served. The rail consumes
 * this, never `history.data.tiers`.
 */
export interface HistoryView extends TierAvailability {
  /** The history query is in flight with no held commits. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /** The recent commits, newest-first; empty while loading/degraded/errored. */
  commits: HistoryCommit[];
  /** Render-ready recent commit rows with selectable graph targets pre-derived. */
  recentCommitRows: RecentCommitRow[];
  /** True when the current bounded history window can request the next page. */
  canShowMore: boolean;
  /** True iff the engine answered with history (vs loading/degraded/errored). */
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  unavailableLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  showMoreLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listRootClassName: string;
  listClassName: string;
  commitBodyClassName: string;
  showMoreButtonClassName: string;
}

export interface RecentCommitRow {
  commit: HistoryCommit;
  /** Commit node id, used for event selection metadata. */
  eventId: string;
  /** Graph nodes the row can select; excludes the commit node itself. */
  touchedNodeIds: string[];
  /** Whether activating the row has a graph selection target. */
  selectable: boolean;
  /** Whether the row has an expandable commit message body. */
  hasBody: boolean;
  /** Commit subject with the empty-subject fallback already applied. */
  subjectLabel: string;
  /** Accessible label for activating the row selection. */
  rowAriaLabel: string;
  /** Accessible label for expanding/collapsing the full message body. */
  messageToggleLabel: (expanded: boolean) => string;
  /** Compact age label for the status rail; derived with the row projection. */
  ageLabel: string;
}

// The commit read is resolved by the engine's STRUCTURAL read of the worktree's
// git object DB, so the `structural` tier gates history availability (contract §2,
// status-overview ADR: a scope with no readable git history degrades structural).
const HISTORY_TIERS = ["structural"] as const;
const HISTORY_COMMIT_NODE_IDS_CAP = 256;

function normalizeHistoryCommitText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHistoryCommitBody(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeHistoryCommitTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeHistoryCommitForView(commit: unknown): HistoryCommit | null {
  if (commit === null || typeof commit !== "object") return null;
  const record = commit as Partial<Record<keyof HistoryCommit, unknown>>;
  const hash = normalizeHistoryCommitText(record.hash);
  if (hash.length === 0) return null;
  const shortHash = normalizeHistoryCommitText(record.short_hash) || hash.slice(0, 8);
  return {
    hash,
    short_hash: shortHash,
    subject: normalizeHistoryCommitText(record.subject),
    body: normalizeHistoryCommitBody(record.body),
    ts: normalizeHistoryCommitTimestamp(record.ts),
    node_ids: Array.isArray(record.node_ids)
      ? normalizeNodeIds(record.node_ids, HISTORY_COMMIT_NODE_IDS_CAP)
      : [],
  };
}

export function normalizeHistoryCommitsForView(commits: unknown): HistoryCommit[] {
  if (!Array.isArray(commits)) return [];
  return commits
    .map(normalizeHistoryCommitForView)
    .filter((commit): commit is HistoryCommit => commit !== null);
}

function recentCommitAgeLabel(ts: number, now: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const ageMs = now - ts;
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h`;
  return `${Math.floor(ageMs / 86_400_000)}d`;
}

/**
 * Derive the history view from a history query's data + error + pending flags,
 * reading the served `tiers` block ONLY here in the stores layer so the rail
 * consumes interpreted truth, never the raw block. Degradation is read from the
 * `tiers` block (success data, OR a FRESH error envelope's tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers-not-guessed-from-errors). A served block that
 * marks `structural` unavailable — or omits it — is designed degradation
 * (contract §2: absence ≠ available); a tiers-less transport fault is the errored
 * branch, NOT degradation. While degraded the (possibly stale) list is not shown.
 */
export function deriveHistoryView(
  data: HistoryResponse | undefined,
  error: unknown,
  loading: boolean,
  now = Date.now(),
  limit = DEFAULT_HISTORY_LIMIT,
): HistoryView {
  const renderLimit = normalizeHistoryLimit(limit);
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, HISTORY_TIERS);
  const errored =
    error instanceof EngineError ? error.tiers === undefined : error != null;
  const available =
    !loading && !errored && !availability.degraded && data !== undefined;
  const commits =
    loading || availability.degraded || errored
      ? []
      : normalizeHistoryCommitsForView(data?.commits);
  const recentCommitRows = commits
    .slice(0, renderLimit)
    .map((commit): RecentCommitRow => {
      const touchedNodeIds = commit.node_ids.filter((id) => !id.startsWith("commit:"));
      const subjectLabel = commit.subject || "(no subject)";
      return {
        commit,
        eventId: `commit:${commit.hash}`,
        touchedNodeIds,
        selectable: touchedNodeIds.length > 0,
        hasBody: commit.body.trim().length > 0,
        subjectLabel,
        rowAriaLabel: `commit ${commit.short_hash}: ${subjectLabel}`,
        messageToggleLabel: (expanded) =>
          `${expanded ? "collapse" : "expand"} message for ${commit.short_hash}`,
        ageLabel: recentCommitAgeLabel(commit.ts, now),
      };
    });
  const canShowMore = commits.length >= renderLimit && renderLimit < MAX_HISTORY_LIMIT;
  const showLoading = loading;
  const showUnavailable = !showLoading && (availability.degraded || errored);
  const showEmpty = available && recentCommitRows.length === 0;
  const showList = available && recentCommitRows.length > 0;
  return {
    ...availability,
    loading,
    errored,
    commits,
    recentCommitRows,
    canShowMore,
    available,
    showLoading,
    showUnavailable,
    showEmpty,
    showList,
    unavailableLabel: "recent history unavailable",
    loadingLabel: "reading recent commits...",
    emptyLabel: "no commits yet on this branch.",
    showMoreLabel: "Show more",
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: "text-label text-ink-muted",
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listRootClassName: STATUS_BODY_LIST_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
    commitBodyClassName:
      "ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted",
    showMoreButtonClassName:
      "w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  };
}

/**
 * Stores hook: the interpreted recent-history view for a scope, read through the
 * history query so the Status overview rail consumes interpreted state (loading /
 * degraded / errored / commits) instead of fetching itself or reading the raw
 * `tiers` block.
 */
export function useHistoryView(
  scope: unknown,
  limit: unknown = DEFAULT_HISTORY_LIMIT,
): HistoryView {
  const request = normalizeHistoryRequestIdentity(scope, limit);
  const query = useNodeHistory(request.scope, request.limit);
  const loading = request.scope !== null && query.isPending;
  return deriveHistoryView(
    query.data,
    query.error ?? null,
    loading,
    Date.now(),
    request.limit,
  );
}

// --- GitHub work items: open PRs, recent (merged) PRs, open issues -------------------
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): these are
// the SOLE wire client for the new rail sections. The DUMB PR/issue views consume
// these interpreted hooks — they never fetch, never read the raw `tiers` block.
// Availability is the engine's capability-local `available`/`reason` (gh reachable
// + authed), interpreted here so the surface renders a designed degraded state
// rather than guessing from a transport error.

export interface PRsView {
  loading: boolean;
  errored: boolean;
  /** The engine answered and `gh` is reachable + authed (data.available). */
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  /** The capability-local reason when unavailable (gh missing/offline/unauthed). */
  reason: string | null;
  prs: PullRequest[];
  rows: PullRequestRowView[];
  loadingLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listClassName: string;
}

export interface IssuesView {
  loading: boolean;
  errored: boolean;
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  reason: string | null;
  issues: Issue[];
  rows: IssueRowView[];
  loadingLabel: string;
  emptyLabel: string;
  unavailableLabel: string;
  loadingClassName: string;
  unavailableClassName: string;
  emptyClassName: string;
  listClassName: string;
}

export interface PullRequestRowView {
  pr: PullRequest;
  icon: "pull-request" | "merged";
  iconTone: "accent" | "muted" | "faint";
  iconToneClass: string;
  numberLabel: string;
  titleLabel: string;
  stateLabel: string;
  stateTone: "accent" | "neutral";
  authorLabel: string | null;
  checksLabel: string | null;
  checksTone: "active" | "broken" | "faint" | null;
  checksToneClass: string | null;
  mergedLabel: string | null;
}

export interface IssueRowView {
  issue: Issue;
  numberLabel: string;
  titleLabel: string;
  authorLabel: string | null;
  labels: string[];
}

function pullRequestLoadingLabel(state: "open" | "merged"): string {
  return state === "merged" ? "reading recent PRs..." : "reading open PRs...";
}

function pullRequestEmptyLabel(state: "open" | "merged"): string {
  return state === "merged"
    ? "no recently-merged pull requests"
    : "no open pull requests";
}

function pullRequestUnavailableLabel(reason: string | null): string {
  return reason ?? "pull requests unavailable - GitHub not reachable";
}

function issueUnavailableLabel(reason: string | null): string {
  return reason ?? "issues unavailable - GitHub not reachable";
}

const STATUS_BODY_LOADING_CLASS =
  "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none";
const STATUS_BODY_UNAVAILABLE_CLASS = "text-label text-ink-faint";
const STATUS_BODY_EMPTY_CLASS = "text-label text-ink-faint";
// Card-to-card gap inside the status sections (PRs / issues / commits): the rail's
// items are bordered cards now (binding 599:2099), so they read with a 0.375rem gutter.
const STATUS_BODY_LIST_CLASS = "space-y-fg-1-5";

interface GitHubWorkItemAvailability<T> {
  loading: boolean;
  errored: boolean;
  available: boolean;
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  showList: boolean;
  reason: string | null;
  items: T[];
}

function deriveGitHubWorkItemAvailability<T>(
  data:
    | {
        available: boolean;
        reason: string | null;
      }
    | undefined,
  items: T[] | undefined,
  error: unknown,
  loading: boolean,
): GitHubWorkItemAvailability<T> {
  const errored = error != null;
  const available = !loading && !errored && data?.available === true;
  const visibleItems = available ? (items ?? []) : [];
  const showLoading = loading;
  const showUnavailable = !showLoading && !available;
  const showEmpty = available && visibleItems.length === 0;
  const showList = available && visibleItems.length > 0;
  return {
    loading,
    errored,
    available,
    showLoading,
    showUnavailable,
    showEmpty,
    showList,
    reason: data?.reason ?? null,
    items: visibleItems,
  };
}

function pullRequestIconToneClass(tone: PullRequestRowView["iconTone"]): string {
  if (tone === "muted") return "text-ink-muted";
  if (tone === "faint") return "text-ink-faint";
  return "text-accent";
}

function pullRequestChecksToneClass(
  tone: NonNullable<PullRequestRowView["checksTone"]>,
): string {
  if (tone === "active") return "text-state-active";
  if (tone === "broken") return "text-state-broken";
  return "text-ink-faint";
}

export function derivePullRequestRowView(
  pr: PullRequest,
  state: "open" | "merged",
): PullRequestRowView {
  const merged = state === "merged";
  const failing = pr.checks?.failing ?? 0;
  const passed = pr.checks?.passed ?? 0;
  const total = pr.checks?.total ?? 0;
  const checksOk = total > 0 && failing === 0 && passed === total;
  const checksLabel =
    total === 0
      ? null
      : checksOk
        ? "checks"
        : failing > 0
          ? `${failing} failing`
          : "checks pending";
  const iconTone: PullRequestRowView["iconTone"] = merged
    ? "muted"
    : pr.is_draft
      ? "faint"
      : "accent";
  const checksTone: PullRequestRowView["checksTone"] =
    total === 0 ? null : checksOk ? "active" : failing > 0 ? "broken" : "faint";
  return {
    pr,
    icon: merged ? "merged" : "pull-request",
    iconTone,
    iconToneClass: pullRequestIconToneClass(iconTone),
    numberLabel: `#${pr.number}`,
    titleLabel: pr.title,
    stateLabel: merged ? "merged" : pr.is_draft ? "draft" : "open",
    stateTone: merged || pr.is_draft ? "neutral" : "accent",
    authorLabel: pr.author || null,
    checksLabel,
    checksTone,
    checksToneClass:
      checksTone === null ? null : pullRequestChecksToneClass(checksTone),
    mergedLabel: merged && pr.merged_at ? "merged" : null,
  };
}

export function deriveIssueRowView(issue: Issue): IssueRowView {
  return {
    issue,
    numberLabel: `#${issue.number}`,
    titleLabel: issue.title,
    authorLabel: issue.author || null,
    labels: issue.labels.slice(0, 3),
  };
}

export function derivePRsView(
  data: PRsResponse | undefined,
  error: unknown,
  loading: boolean,
  state: "open" | "merged" = "open",
): PRsView {
  const { items: prs, ...availability } = deriveGitHubWorkItemAvailability(
    data,
    data?.prs,
    error,
    loading,
  );
  return {
    ...availability,
    prs,
    rows: prs.map((pr) => derivePullRequestRowView(pr, state)),
    loadingLabel: pullRequestLoadingLabel(state),
    emptyLabel: pullRequestEmptyLabel(state),
    unavailableLabel: pullRequestUnavailableLabel(data?.reason ?? null),
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: STATUS_BODY_UNAVAILABLE_CLASS,
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
  };
}

export function deriveIssuesView(
  data: IssuesResponse | undefined,
  error: unknown,
  loading: boolean,
): IssuesView {
  const { items: issues, ...availability } = deriveGitHubWorkItemAvailability(
    data,
    data?.issues,
    error,
    loading,
  );
  return {
    ...availability,
    issues,
    rows: issues.map(deriveIssueRowView),
    loadingLabel: "reading open issues...",
    emptyLabel: "no open issues",
    unavailableLabel: issueUnavailableLabel(data?.reason ?? null),
    loadingClassName: STATUS_BODY_LOADING_CLASS,
    unavailableClassName: STATUS_BODY_UNAVAILABLE_CLASS,
    emptyClassName: STATUS_BODY_EMPTY_CLASS,
    listClassName: STATUS_BODY_LIST_CLASS,
  };
}

export interface PullRequestsRequestIdentity {
  scope: string | null;
  state: "open" | "merged";
}

export interface IssuesRequestIdentity {
  scope: string | null;
  state: "open" | "closed";
}

export function normalizePullRequestsRequestIdentity(
  scope: unknown,
  state: unknown = "open",
): PullRequestsRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    state: state === "merged" ? "merged" : "open",
  };
}

export function normalizeIssuesRequestIdentity(
  scope: unknown,
  state: unknown = "open",
): IssuesRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    state: state === "closed" ? "closed" : "open",
  };
}

function useNodePrs(scope: unknown, state: unknown) {
  const request = normalizePullRequestsRequestIdentity(scope, state);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.prs(request.scope ?? "", request.state),
    queryFn: () => engineClient.prs({ scope: request.scope!, state: request.state }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

function useNodeIssues(scope: unknown, state: unknown) {
  const request = normalizeIssuesRequestIdentity(scope, state);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.issues(request.scope ?? "", request.state),
    queryFn: () => engineClient.issues({ scope: request.scope!, state: request.state }),
    enabled,
    gcTime: HISTORY_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** Interpreted pull-request view for the rail's OPEN PRS / RECENT PRS sections.
 *  `state` selects open (default) or recently-merged PRs. */
export function usePRsView(scope: unknown, state: unknown = "open"): PRsView {
  const request = normalizePullRequestsRequestIdentity(scope, state);
  const query = useNodePrs(request.scope, request.state);
  const loading = request.scope !== null && query.isPending;
  return derivePRsView(query.data, query.error ?? null, loading, request.state);
}

/** Interpreted issue view for the rail's OPEN ISSUES section. */
export function useIssuesView(scope: unknown, state: unknown = "open"): IssuesView {
  const request = normalizeIssuesRequestIdentity(scope, state);
  const query = useNodeIssues(request.scope, request.state);
  const loading = request.scope !== null && query.isPending;
  return deriveIssuesView(query.data, query.error ?? null, loading);
}

export type StatusTabSectionId =
  | "open-plans"
  | "pull-requests"
  | "open-issues"
  | "recent-commits";

export interface StatusSectionCardView {
  id: StatusTabSectionId;
  title: string;
  count?: number;
}

export interface StatusTabSectionsView {
  openPlans: StatusSectionCardView;
  pullRequests: StatusSectionCardView;
  openIssues: StatusSectionCardView;
  recentCommits: StatusSectionCardView;
}

function positiveStatusCount(count: number): number | undefined {
  return count > 0 ? count : undefined;
}

export function deriveStatusTabSectionsView(counts: {
  openPlans: number;
  openPrs: number;
  openIssues: number;
}): StatusTabSectionsView {
  return {
    openPlans: {
      id: "open-plans",
      // Titled just "Plans" (2026-07-14 wording refinement, like COMMITS): the
      // count receipt stays the actionable OPEN count; the section id stays.
      title: "Plans",
      count: positiveStatusCount(counts.openPlans),
    },
    // ONE pull-request section (2026-07-12 IA simplification, user-directed):
    // the former OPEN PRS / RECENT PRS folds collapsed into a single section —
    // open items lead, recently merged follow. The count receipt stays the
    // ACTIONABLE open count, never open+merged.
    pullRequests: {
      id: "pull-requests",
      title: "Pull requests",
      count: positiveStatusCount(counts.openPrs),
    },
    openIssues: {
      id: "open-issues",
      title: "Issues",
      count: positiveStatusCount(counts.openIssues),
    },
    // Titled just "Commits" (2026-07-14 wording refinement): the recency is
    // implicit in the list's newest-first order; the persisted section id stays.
    recentCommits: { id: "recent-commits", title: "Commits" },
  };
}

/** The one Pull requests section body view: open rows lead, recently-merged rows
 *  follow under a quiet sub-label. Availability is capability-local and shared
 *  (both reads ride the same gh broker): the open view's states lead so open
 *  rows never wait on the merged read; the section is empty only when BOTH
 *  settled lists are empty. */
export interface PullRequestsSectionView {
  showLoading: boolean;
  showUnavailable: boolean;
  showEmpty: boolean;
  loadingLabel: string;
  unavailableLabel: string;
  emptyLabel: string;
  openRows: PullRequestRowView[];
  mergedRows: PullRequestRowView[];
  mergedLabel: string;
  listClassName: string;
}

export function derivePullRequestsSectionView(
  open: PRsView,
  merged: PRsView,
): PullRequestsSectionView {
  const openUnavailable = !open.showLoading && open.showUnavailable;
  // Open rows never wait on the merged read — but when the open list settles
  // EMPTY while merged is still in flight, the skeleton holds (otherwise the
  // body renders a momentary blank: not empty, not loading, nothing to list).
  const showLoading =
    open.showLoading ||
    (!openUnavailable &&
      !open.showLoading &&
      open.rows.length === 0 &&
      merged.showLoading);
  const showUnavailable = !showLoading && openUnavailable;
  const settled = !showLoading && !showUnavailable;
  const mergedRows =
    settled && !merged.showLoading && !merged.showUnavailable ? merged.rows : [];
  const showEmpty =
    settled && open.rows.length === 0 && !merged.showLoading && mergedRows.length === 0;
  return {
    showLoading,
    showUnavailable,
    showEmpty,
    loadingLabel: open.loadingLabel,
    unavailableLabel: open.unavailableLabel,
    emptyLabel: "No pull requests.",
    openRows: settled ? open.rows : [],
    mergedRows,
    mergedLabel: "Recently merged",
    listClassName: open.listClassName,
  };
}

/**
 * Bulk ego-network fetch for the stage's working set (layer-ownership, F-H1):
 * one neighbors query per id, fanned out through `useQueries`, so the app/scene
 * layers never call the engine client directly - the stores layer stays the sole
 * wire client. Mirrors `useNodeNeighbors`'s per-id key + shape; returns the query
 * results array so the caller reads each `.data` / `.dataUpdatedAt`.
 */
/** Ceiling on concurrent ego fetches (perf-sweep F#6). Each working-set id fans
 * out one `/neighbors` round-trip; without a bound, a pathological working set
 * (a future "expand all", or a runaway expansion) fires unbounded concurrent
 * requests at the engine. The cap is far above normal interactive use (a user
 * expands a handful of nodes), so it never bites real usage — it only prevents
 * the latent cliff. */
const MAX_BULK_NEIGHBOR_IDS = 96;

export function useNodeNeighborsBulk(
  ids: readonly unknown[],
  scope: unknown,
  depth: unknown = 1,
) {
  const normalizedScope = normalizeNodeScopedScope(scope);
  const normalizedDepth = normalizeNodeNeighborDepth(depth);
  // Bound the fan-out; the most-recently-added ids (working-set tail) win when
  // the set exceeds the cap, since those are the user's latest expansions.
  const bounded =
    ids.length > MAX_BULK_NEIGHBOR_IDS ? ids.slice(-MAX_BULK_NEIGHBOR_IDS) : ids;
  const queries = bounded.map((id) => {
    const nodeId = normalizeNodeId(id);
    const enabled = normalizedScope !== null && isAddressableNode(nodeId);
    return {
      queryKey: engineKeys.neighbors(
        normalizedScope ?? "",
        nodeId ?? "",
        normalizedDepth,
      ),
      queryFn: () =>
        engineClient.nodeNeighbors(nodeId!, {
          scope: normalizedScope!,
          depth: normalizedDepth,
        }),
      // Skip synthesized feature aggregates — the engine has no ego network for a
      // `feature:<tag>` id (it 404s); expanding one is a no-op, not a degraded
      // request. Real nodes (doc:, …) expand as before.
      enabled,
    };
  });
  const results = useQueries({ queries });
  return results.map((result, index) =>
    queries[index]?.enabled ? result : { ...result, data: undefined },
  );
}

export function useNodeEvidence(id: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.evidence(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.nodeEvidence(request.nodeId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}
