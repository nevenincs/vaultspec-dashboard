// The rag job-dashboard JOBS region (rag-job-dashboard ADR D3; binding Figma
// RagJobDashboard jobs region 1102:4354). A sortable, filterable table over the
// ONE served, bounded jobs list: a filter query, phase facet toggles with counts,
// a sort control, and a column header whose active column carries the sort mark.
// Selecting a row JOINS the log pane (writes the shared view-store selection).
//
// Glass over the stores plane (dashboard-layer-ownership): the zero-prop region
// reads the jobs hook + the pure `deriveRagJobsTable` projection + the view-local
// presentation store, derives in useMemo (raw selectors), and never fetches the
// engine itself or reads the raw tiers block — offline truth is the tiers-gated
// `ragSemanticOffline` read the hook already interprets. All narrowing is
// PRESENTATION over one served list (filter-vs-presentation): it never writes the
// corpus filter, and a served list capped below the machine total renders its
// bound rather than fabricating completeness.

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

import {
  ProgressBar,
  SearchField,
  SectionLabel,
  Segment,
  SegmentedToggle,
  Skeleton,
  SkeletonRow,
  StateBlock,
  facetDotColor,
  type FacetDotTone,
} from "../kit";
import { useActiveScope } from "../../stores/server/queries";
import {
  RAG_JOBS_LIMIT_CAP,
  ragSemanticOffline,
  useRagJobs,
} from "../../stores/server/ragControl";
import {
  deriveRagJobsTable,
  RAG_JOB_PHASE_GROUPS,
  type RagJobPhaseGroup,
  type RagJobRow,
  type RagJobSortKey,
  type RagJobsTableView,
} from "../../stores/server/ragDashboardView";
import {
  selectRagDashboardJob,
  setRagDashboardJobsFilter,
  setRagDashboardSort,
  toggleRagDashboardFacet,
  useRagDashboardFacets,
  useRagDashboardJobsFilter,
  useRagDashboardSelectedJob,
  useRagDashboardSort,
} from "../../stores/view/ragDashboard";

// Phase group → semantic status dot tone (health family), shared with the facet
// toggles so a row's phase dot and its facet chip agree (never hue-only).
const GROUP_DOT: Record<RagJobPhaseGroup, FacetDotTone> = {
  running: "active",
  queued: "provisional",
  done: "complete",
  failed: "danger",
};

// Plain-language phase word (labels-are-user-facing): the served token stays in a
// title tooltip, only the reworded group word renders.
const GROUP_LABEL: Record<RagJobPhaseGroup, string> = {
  running: "Running",
  queued: "Queued",
  done: "Done",
  failed: "Failed",
};

// The five-column grid, shared by the header and every row so the columns align:
// Job (flex) · Phase · Progress (flex) · Started · Duration.
const GRID =
  "grid grid-cols-[minmax(6rem,2fr)_5.5rem_minmax(6rem,2fr)_5rem_4.5rem] items-center gap-fg-2";

/** Treat a sub-1e12 stamp as epoch seconds, otherwise milliseconds. */
function toMillis(stamp: number): number {
  return stamp < 1e12 ? stamp * 1000 : stamp;
}

/** Compact "5m ago" relative start label; an absent stamp reads as an em space. */
function formatStarted(startedAt: number | undefined): string {
  if (startedAt === undefined) return "—";
  const deltaS = Math.max(0, (Date.now() - toMillis(startedAt)) / 1000);
  if (deltaS < 60) return "just now";
  if (deltaS < 3600) return `${Math.floor(deltaS / 60)}m ago`;
  if (deltaS < 86400) return `${Math.floor(deltaS / 3600)}h ago`;
  return `${Math.floor(deltaS / 86400)}d ago`;
}

/** Compact runtime label: 45s / 2m 30s / 1h 5m. */
function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

/** One header column cell; the two sort-bearing columns are buttons that write the
 *  view store and carry the sort mark when active. */
function HeaderCell({
  label,
  sortKey,
  activeSort,
  align = "start",
}: {
  label: string;
  sortKey?: RagJobSortKey;
  activeSort: RagJobSortKey;
  align?: "start" | "end";
}) {
  const alignClass = align === "end" ? "justify-end text-right" : "justify-start";
  if (sortKey === undefined) {
    return (
      <span
        className={`flex items-center text-caption font-medium uppercase tracking-[0.025rem] text-ink-faint ${alignClass}`}
      >
        {label}
      </span>
    );
  }
  const active = activeSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => setRagDashboardSort(sortKey)}
      aria-pressed={active}
      className={`flex items-center gap-fg-1 text-caption font-medium uppercase tracking-[0.025rem] transition-colors duration-ui-fast hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${alignClass} ${
        active ? "text-ink-muted" : "text-ink-faint"
      }`}
    >
      <span>{label}</span>
      {active && <ChevronDown size={12} aria-hidden className="shrink-0" />}
    </button>
  );
}

/** A single job row: a selectable button laying its cells on the shared grid. */
function JobRow({ row, selected }: { row: RagJobRow; selected: boolean }) {
  const running = row.group === "running";
  const failed = row.group === "failed";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => selectRagDashboardJob(selected ? "" : row.id)}
      data-selected={selected ? "" : undefined}
      className={`${GRID} w-full rounded-fg-sm px-fg-2 py-fg-1-5 text-left transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
        selected ? "bg-accent-subtle" : "hover:bg-paper-sunken"
      }`}
    >
      {/* Job identity: id + optional trigger/source sub-label. */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-meta text-ink" title={row.id}>
          {row.id}
        </span>
        {row.kind !== undefined && (
          <span className="truncate text-caption text-ink-faint">{row.kind}</span>
        )}
      </span>
      {/* Phase: dot + plain word (raw phase in the tooltip). */}
      <span
        className="flex min-w-0 items-center gap-fg-1"
        title={row.phase || undefined}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: facetDotColor(GROUP_DOT[row.group]) }}
        />
        <span className="truncate text-meta text-ink-muted">
          {GROUP_LABEL[row.group]}
        </span>
      </span>
      {/* Progress: a running bar + step; a failed note; otherwise the step, if any. */}
      <span className="flex min-w-0 flex-col gap-fg-0-5">
        {running && row.fraction !== undefined ? (
          <ProgressBar
            value={Math.round(row.fraction * 100)}
            max={100}
            label={`${row.id} progress`}
          />
        ) : null}
        {row.step !== undefined && (
          <span
            className={`truncate text-caption ${failed ? "text-state-broken" : "text-ink-faint"}`}
          >
            {row.step}
          </span>
        )}
        {running && row.fraction === undefined && row.step === undefined && (
          <span className="truncate text-caption text-ink-faint">Working…</span>
        )}
      </span>
      {/* Started (relative) and Duration, both tabular. */}
      <span className="truncate text-meta tabular-nums text-ink-faint">
        {formatStarted(row.startedAt)}
      </span>
      <span className="truncate text-right text-meta tabular-nums text-ink-faint">
        {formatDuration(row.durationSeconds)}
      </span>
    </button>
  );
}

/** The presentational jobs table body — pure over the derived view + selection.
 *  Exported for the render test (the zero-prop wrapper wires the stores). */
export function RagJobsTableBody({
  table,
  selectedJobId,
  offline,
  pending,
}: {
  table: RagJobsTableView;
  selectedJobId: string | null;
  offline: boolean;
  pending: boolean;
}) {
  const facetSet = useMemo(() => new Set(table.facets), [table.facets]);
  const filtering = table.filterText.trim().length > 0 || table.facets.length > 0;

  return (
    <div data-rag-jobs-region className="flex min-h-0 flex-col gap-fg-2">
      <SectionLabel count={table.servedCount}>Jobs</SectionLabel>

      {/* Controls: filter query · phase facet toggles · sort. */}
      <div className="flex flex-wrap items-center gap-fg-2">
        <div className="min-w-[10rem] flex-1">
          <SearchField
            value={table.filterText}
            onChange={(value) => setRagDashboardJobsFilter(value)}
            onClear={() => setRagDashboardJobsFilter("")}
            placeholder="Filter jobs…"
            ariaLabel="Filter jobs"
          />
        </div>
        <SegmentedToggle
          value={table.sort}
          onChange={(value) => setRagDashboardSort(value)}
          ariaLabel="Sort jobs"
        >
          <Segment value="recency" title="Newest first">
            Newest
          </Segment>
          <Segment value="duration" title="Longest running first">
            Longest
          </Segment>
        </SegmentedToggle>
      </div>
      <div
        role="group"
        aria-label="Filter by phase"
        className="flex flex-wrap items-center gap-fg-1"
      >
        {RAG_JOB_PHASE_GROUPS.map((group) => {
          const checked = facetSet.has(group);
          return (
            <button
              key={group}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggleRagDashboardFacet(group)}
              className={`inline-flex shrink-0 items-center gap-fg-1 rounded-fg-pill border px-fg-2 py-fg-0-5 text-meta font-medium transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                checked
                  ? "border-accent bg-accent-subtle text-accent-text"
                  : "border-rule bg-paper-sunken text-ink-muted hover:border-rule-strong"
              }`}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: facetDotColor(GROUP_DOT[group]) }}
              />
              <span>{GROUP_LABEL[group]}</span>
              <span data-tabular className="tabular-nums text-ink-faint">
                {table.groupCounts[group]}
              </span>
            </button>
          );
        })}
      </div>

      {offline ? (
        <StateBlock
          mode="degraded"
          title="Search service offline"
          message="Job history is unavailable while the search service is down."
        />
      ) : pending ? (
        <Skeleton label="Loading jobs…" className="gap-fg-1-5">
          <SkeletonRow width="w-2/3" boxed />
          <SkeletonRow width="w-1/2" boxed />
          <SkeletonRow width="w-3/5" boxed />
        </Skeleton>
      ) : (
        <div className="flex min-h-0 flex-col">
          {/* Column header row on the shared grid. */}
          <div className={`${GRID} border-b border-rule px-fg-2 pb-fg-1`}>
            <HeaderCell label="Job" activeSort={table.sort} />
            <HeaderCell label="Phase" activeSort={table.sort} />
            <HeaderCell label="Progress" activeSort={table.sort} />
            <HeaderCell label="Started" sortKey="recency" activeSort={table.sort} />
            <HeaderCell
              label="Duration"
              sortKey="duration"
              activeSort={table.sort}
              align="end"
            />
          </div>

          {table.rows.length === 0 ? (
            <StateBlock
              mode="empty"
              message={
                filtering
                  ? "No jobs match this filter."
                  : "No indexing jobs yet — reindex to populate the history."
              }
            />
          ) : (
            <div className="flex min-h-0 flex-col overflow-y-auto pt-fg-1">
              {table.rows.map((row) => (
                <JobRow key={row.id} row={row} selected={selectedJobId === row.id} />
              ))}
            </div>
          )}

          {/* Honest served-vs-total bound: never a silent undercount. */}
          {table.truncated && (
            <p className="pt-fg-1-5 text-caption text-ink-faint">
              Showing the {table.servedCount} most recent job
              {table.servedCount === 1 ? "" : "s"}
              {table.total !== undefined ? ` of ${table.total}` : ""} — older history is
              not loaded.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The JOBS region, mount-gated by the dashboard panel host (so the jobs read
 * polls only while the dashboard is open). Reads the served jobs list, the pure
 * table projection, and the view-local presentation state; emits selection into
 * the shared store to join the log pane.
 */
export function RagJobsTable() {
  const scope = useActiveScope();
  const jobsQuery = useRagJobs(scope, RAG_JOBS_LIMIT_CAP);
  const sort = useRagDashboardSort();
  const facets = useRagDashboardFacets();
  const filterText = useRagDashboardJobsFilter();
  const selectedJobId = useRagDashboardSelectedJob();

  const snapshot = jobsQuery.data?.envelope ?? null;
  const viewState = useMemo(
    () => ({ sort, facets, filterText }),
    [sort, facets, filterText],
  );
  const table = useMemo(
    () => deriveRagJobsTable(snapshot, viewState),
    [snapshot, viewState],
  );
  const offline = ragSemanticOffline(jobsQuery.data);

  return (
    <RagJobsTableBody
      table={table}
      selectedJobId={selectedJobId}
      offline={offline}
      pending={jobsQuery.isPending}
    />
  );
}
