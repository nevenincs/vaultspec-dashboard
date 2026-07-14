// The rag job-dashboard jobs-table derivation (rag-job-dashboard ADR D3): PURE
// functions that project the served, bounded jobs list into a sorted, filtered,
// phase-faceted table view. No hooks, no fetching, no view-store coupling — the
// input is the served snapshot plus the view state (sort key, filter text, active
// facets), the output is the rows plus the header/sort metadata and an HONEST
// truncation bound. Presentation over one served list (filter-vs-presentation
// law): this never narrows the corpus filter, and it never fabricates
// completeness — a served list capped below the machine total renders its bound.

import {
  isJobFailed,
  isJobTerminal,
  type RagJob,
  type RagJobsSnapshot,
} from "./ragControl";

/** How the jobs table sorts: newest-first, or longest-running-first. */
export type RagJobSortKey = "recency" | "duration";

/** The phase buckets the served phase vocabulary maps onto (the facet chips). */
export type RagJobPhaseGroup = "running" | "queued" | "done" | "failed";

/** The sort keys, in control order. */
export const RAG_JOB_SORT_KEYS: readonly RagJobSortKey[] = ["recency", "duration"];

/** The phase groups, in facet-chip order. */
export const RAG_JOB_PHASE_GROUPS: readonly RagJobPhaseGroup[] = [
  "running",
  "queued",
  "done",
  "failed",
];

const RAG_JOB_FIELD_MAX_CHARS = 2048;

function jobText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= RAG_JOB_FIELD_MAX_CHARS
    ? trimmed
    : undefined;
}

function jobNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Map a served phase word onto its facet group. `queued`/`pending` are queued;
 *  a failure phase is failed; any other terminal phase is done; else running. */
export function ragJobPhaseGroup(phase: string | undefined): RagJobPhaseGroup {
  const normalized = jobText(phase)?.toLowerCase();
  if (normalized === "queued" || normalized === "pending") return "queued";
  if (isJobFailed(phase)) return "failed";
  if (isJobTerminal(phase)) return "done";
  return "running";
}

/** One presentation row in the jobs table — a projection of a served `RagJob`. */
export interface RagJobRow {
  id: string;
  /** The raw served phase word (the non-color identity). */
  phase: string;
  /** The facet group the phase maps onto. */
  group: RagJobPhaseGroup;
  /** The current progress step, when the job reports one. */
  step?: string;
  /** Progress fraction 0..1 when a completed/total is reported, else undefined. */
  fraction?: number;
  /** Start time (epoch seconds/ms as rag serves it), when present. */
  startedAt?: number;
  /** Runtime in seconds, when present. */
  durationSeconds?: number;
  /** The trigger/source label (the "kind" column), when present. */
  kind?: string;
}

/** The derived jobs-table view: the rendered rows plus header/sort metadata,
 *  per-group counts (over the text-filtered set, so the chips reflect the
 *  search), and the honest served-vs-total truncation bound. */
export interface RagJobsTableView {
  rows: RagJobRow[];
  sort: RagJobSortKey;
  /** The active facet set (empty = every group shown). */
  facets: RagJobPhaseGroup[];
  filterText: string;
  /** Count per group over the text-filtered served list (pre-facet). */
  groupCounts: Record<RagJobPhaseGroup, number>;
  /** How many rows the served list carried (pre-truncation-note, post-parse). */
  servedCount: number;
  /** The machine total when rag reported one (>= servedCount). */
  total?: number;
  /** The served list was capped below the machine total — the counts/rows are a
   *  lower bound over the returned slice, not the full history. */
  truncated: boolean;
}

/** The view state the derivation consumes (owned by the view-local store). */
export interface RagJobsTableViewState {
  sort: RagJobSortKey;
  facets: readonly RagJobPhaseGroup[];
  filterText: string;
}

function toRow(job: RagJob): RagJobRow | null {
  const id = jobText(job?.id);
  if (id === undefined) return null;
  const phase = jobText(job?.phase) ?? "";
  const total = jobNumber(job?.progress?.total);
  const completed = jobNumber(job?.progress?.completed);
  const fraction =
    total !== undefined && total > 0 && completed !== undefined
      ? Math.max(0, Math.min(1, completed / total))
      : undefined;
  const kind = jobText(job?.trigger) ?? jobText(job?.source);
  const step = jobText(job?.progress?.step);
  const startedAt = jobNumber(job?.started_at);
  const durationSeconds = jobNumber(job?.runtime_seconds);
  return {
    id,
    phase,
    group: ragJobPhaseGroup(phase),
    ...(step !== undefined ? { step } : {}),
    ...(fraction !== undefined ? { fraction } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(kind !== undefined ? { kind } : {}),
  };
}

/** The searchable text of a row: id + step + kind, lowercased (id/step/kind
 *  substring match, ADR D3). */
function rowHaystack(row: RagJobRow): string {
  return [row.id, row.step, row.kind].filter(Boolean).join(" ").toLowerCase();
}

function compareRows(a: RagJobRow, b: RagJobRow, sort: RagJobSortKey): number {
  if (sort === "duration") {
    return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
  }
  // recency: newest start first; rows without a start time sink to the bottom.
  return (b.startedAt ?? 0) - (a.startedAt ?? 0);
}

function emptyGroupCounts(): Record<RagJobPhaseGroup, number> {
  return { running: 0, queued: 0, done: 0, failed: 0 };
}

/**
 * Derive the jobs-table view from the served snapshot and the view state. Rows
 * are parsed (malformed/idless jobs dropped), text-filtered (id/step/kind
 * substring, case-insensitive), phase-faceted (empty facet set = all), and
 * sorted. `groupCounts` is over the text-filtered set so the chips reflect the
 * active search; `truncated` reports the served list being capped below the
 * machine total (never re-counted client-side).
 */
export function deriveRagJobsTable(
  snapshot: RagJobsSnapshot | null | undefined,
  view: RagJobsTableViewState,
): RagJobsTableView {
  const parsed: RagJobRow[] = [];
  for (const job of snapshot?.jobs ?? []) {
    const row = toRow(job);
    if (row !== null) parsed.push(row);
  }

  const needle = view.filterText.trim().toLowerCase();
  const textFiltered =
    needle.length === 0
      ? parsed
      : parsed.filter((row) => rowHaystack(row).includes(needle));

  const groupCounts = emptyGroupCounts();
  for (const row of textFiltered) groupCounts[row.group] += 1;

  const facets = RAG_JOB_PHASE_GROUPS.filter((g) => view.facets.includes(g));
  const faceted =
    facets.length === 0
      ? textFiltered
      : textFiltered.filter((row) => facets.includes(row.group));

  const rows = [...faceted].sort((a, b) => compareRows(a, b, view.sort));

  const servedCount = parsed.length;
  const total = jobNumber(snapshot?.total);
  const truncated = total !== undefined && total > servedCount;

  return {
    rows,
    sort: view.sort,
    facets,
    filterText: view.filterText,
    groupCounts,
    servedCount,
    ...(total !== undefined ? { total } : {}),
    truncated,
  };
}
