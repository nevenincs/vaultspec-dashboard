import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import {
  formatDuration,
  formatNumber,
  formatRelativeTime,
} from "../../platform/localization/formatters";
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

const M = {
  filterStatus: { key: "operations:searchMaintenance.accessibility.filterByStatus" },
  filterUpdates: { key: "operations:searchMaintenance.accessibility.filterUpdates" },
  progress: { key: "operations:searchMaintenance.accessibility.progress" },
  sortUpdates: { key: "operations:searchMaintenance.accessibility.sortUpdates" },
  title: { key: "operations:searchMaintenance.jobs.title" },
  update: { key: "operations:searchMaintenance.jobs.update" },
  empty: { key: "operations:searchMaintenance.jobs.empty" },
  noMatches: { key: "operations:searchMaintenance.jobs.noMatches" },
  placeholder: { key: "operations:searchMaintenance.filters.placeholder" },
  newest: { key: "operations:searchMaintenance.labels.newest" },
  longest: { key: "operations:searchMaintenance.labels.longest" },
  updateColumn: { key: "operations:searchMaintenance.labels.update" },
  status: { key: "operations:searchMaintenance.labels.status" },
  progressColumn: { key: "operations:searchMaintenance.labels.progress" },
  started: { key: "operations:searchMaintenance.labels.started" },
  duration: { key: "operations:searchMaintenance.labels.duration" },
  working: { key: "operations:searchMaintenance.progress.working" },
  unavailable: { key: "operations:searchMaintenance.service.unavailable" },
  loading: { key: "operations:searchMaintenance.states.checking" },
} as const;

const GROUP_DOT: Record<RagJobPhaseGroup, FacetDotTone> = {
  running: "active",
  queued: "provisional",
  done: "complete",
  failed: "danger",
  unavailable: "stale",
};

const GROUP_MESSAGE = {
  running: { key: "operations:searchMaintenance.states.running" },
  queued: { key: "operations:searchMaintenance.states.queued" },
  done: { key: "operations:searchMaintenance.states.completed" },
  failed: { key: "operations:searchMaintenance.states.failed" },
  unavailable: { key: "operations:searchMaintenance.states.statusUnavailable" },
} as const;

const GRID =
  "grid grid-cols-[minmax(6rem,2fr)_6rem_minmax(6rem,2fr)_7rem_6rem] items-center gap-fg-2";

function relativeStart(locale: string, startedAt: number | undefined): string | null {
  if (startedAt === undefined) return null;
  const milliseconds = startedAt < 1e12 ? startedAt * 1000 : startedAt;
  const seconds = Math.round((milliseconds - Date.now()) / 1000);
  if (Math.abs(seconds) < 60)
    return formatRelativeTime(locale, seconds, "second", { numeric: "auto" });
  if (Math.abs(seconds) < 3600)
    return formatRelativeTime(locale, Math.round(seconds / 60), "minute", {
      numeric: "auto",
    });
  if (Math.abs(seconds) < 86400)
    return formatRelativeTime(locale, Math.round(seconds / 3600), "hour", {
      numeric: "auto",
    });
  return formatRelativeTime(locale, Math.round(seconds / 86400), "day", {
    numeric: "auto",
  });
}

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
  if (sortKey === undefined)
    return (
      <span
        className={`flex items-center text-caption font-medium text-ink-faint ${alignClass}`}
      >
        {label}
      </span>
    );
  const active = activeSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => setRagDashboardSort(sortKey)}
      aria-pressed={active}
      className={`flex items-center gap-fg-1 text-caption font-medium text-ink-faint ${alignClass}`}
    >
      <span>{label}</span>
      {active && <ChevronDown size={12} aria-hidden />}
    </button>
  );
}

function JobRow({ row, selected }: { row: RagJobRow; selected: boolean }) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const status = resolve(GROUP_MESSAGE[row.group]).message;
  const update = resolve(M.update).message;
  const progress = resolve(M.progress).message;
  const started = relativeStart(locale, row.startedAt);
  const duration =
    row.durationSeconds === undefined
      ? null
      : formatDuration(locale, Math.max(0, row.durationSeconds) * 1000, {
          maxUnits: 2,
          style: "short",
        });
  return (
    <button
      type="button"
      aria-label={
        resolve({
          key: "operations:searchMaintenance.accessibility.updateStatus",
          values: { status },
        }).message
      }
      aria-pressed={selected}
      onClick={() => selectRagDashboardJob(selected ? "" : row.id)}
      data-selected={selected ? "" : undefined}
      className={`${GRID} w-full rounded-fg-sm px-fg-2 py-fg-1-5 text-left ${
        selected ? "bg-accent-subtle" : "hover:bg-paper-sunken"
      }`}
    >
      <span className="truncate text-meta text-ink">{update}</span>
      <span className="flex min-w-0 items-center gap-fg-1">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: facetDotColor(GROUP_DOT[row.group]) }}
        />
        <span className="truncate text-meta text-ink-muted">{status}</span>
      </span>
      <span className="min-w-0">
        {row.group === "running" && row.fraction !== undefined ? (
          <ProgressBar
            value={Math.round(row.fraction * 100)}
            max={100}
            label={progress}
          />
        ) : row.group === "running" ? (
          <span className="truncate text-caption text-ink-faint">
            {resolve(M.working).message}
          </span>
        ) : null}
      </span>
      <span className="truncate text-meta tabular-nums text-ink-faint">{started}</span>
      <span className="truncate text-right text-meta tabular-nums text-ink-faint">
        {duration}
      </span>
    </button>
  );
}

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
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const facetSet = useMemo(() => new Set(table.facets), [table.facets]);
  const filtering = table.filterText.trim().length > 0 || table.facets.length > 0;
  const count = formatNumber(locale, table.servedCount) ?? "";
  return (
    <div data-rag-jobs-region className="flex min-h-0 flex-col gap-fg-2">
      <SectionLabel count={count}>{resolve(M.title).message}</SectionLabel>
      <div className="flex flex-wrap items-center gap-fg-2">
        <div className="min-w-[10rem] flex-1">
          <SearchField
            value={table.filterText}
            onChange={setRagDashboardJobsFilter}
            onClear={() => setRagDashboardJobsFilter("")}
            placeholder={resolve(M.placeholder).message}
            ariaLabel={resolve(M.filterUpdates).message}
          />
        </div>
        <SegmentedToggle
          value={table.sort}
          onChange={setRagDashboardSort}
          ariaLabel={resolve(M.sortUpdates).message}
        >
          <Segment value="recency">{resolve(M.newest).message}</Segment>
          <Segment value="duration">{resolve(M.longest).message}</Segment>
        </SegmentedToggle>
      </div>
      <div
        role="group"
        aria-label={resolve(M.filterStatus).message}
        className="flex flex-wrap gap-fg-1"
      >
        {RAG_JOB_PHASE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            role="checkbox"
            aria-checked={facetSet.has(group)}
            onClick={() => toggleRagDashboardFacet(group)}
            className="inline-flex items-center gap-fg-1 rounded-fg-pill border border-rule px-fg-2 py-fg-0-5 text-meta"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: facetDotColor(GROUP_DOT[group]) }}
            />
            <span>{resolve(GROUP_MESSAGE[group]).message}</span>
            <span data-tabular>{formatNumber(locale, table.groupCounts[group])}</span>
          </button>
        ))}
      </div>
      {offline ? (
        <StateBlock mode="degraded" message={resolve(M.unavailable).message} />
      ) : pending ? (
        <Skeleton label={resolve(M.loading).message} className="gap-fg-1-5">
          <SkeletonRow width="w-2/3" boxed />
          <SkeletonRow width="w-1/2" boxed />
        </Skeleton>
      ) : (
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 overflow-x-auto" data-rag-jobs-scroll>
            <div className="flex min-h-0 min-w-[34rem] flex-col">
              <div className={`${GRID} border-b border-rule px-fg-2 pb-fg-1`}>
                <HeaderCell
                  label={resolve(M.updateColumn).message}
                  activeSort={table.sort}
                />
                <HeaderCell label={resolve(M.status).message} activeSort={table.sort} />
                <HeaderCell
                  label={resolve(M.progressColumn).message}
                  activeSort={table.sort}
                />
                <HeaderCell
                  label={resolve(M.started).message}
                  sortKey="recency"
                  activeSort={table.sort}
                />
                <HeaderCell
                  label={resolve(M.duration).message}
                  sortKey="duration"
                  activeSort={table.sort}
                  align="end"
                />
              </div>
              <div className="flex min-h-0 flex-col overflow-y-auto pt-fg-1">
                {table.rows.map((row) => (
                  <JobRow key={row.id} row={row} selected={selectedJobId === row.id} />
                ))}
              </div>
            </div>
          </div>
          {table.rows.length === 0 && (
            <StateBlock
              mode="empty"
              message={resolve(filtering ? M.noMatches : M.empty).message}
            />
          )}
          {table.truncated && table.total !== undefined && (
            <p className="pt-fg-1-5 text-caption text-ink-faint">
              {
                resolve({
                  key: "operations:searchMaintenance.jobs.partial",
                  values: { count: table.total, shown: table.servedCount },
                }).message
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function RagJobsTable() {
  const scope = useActiveScope();
  const jobsQuery = useRagJobs(scope, RAG_JOBS_LIMIT_CAP);
  const sort = useRagDashboardSort();
  const facets = useRagDashboardFacets();
  const filterText = useRagDashboardJobsFilter();
  const selectedJobId = useRagDashboardSelectedJob();
  const viewState = useMemo(
    () => ({ sort, facets, filterText }),
    [sort, facets, filterText],
  );
  const table = useMemo(
    () => deriveRagJobsTable(jobsQuery.data?.envelope ?? null, viewState),
    [jobsQuery.data, viewState],
  );
  return (
    <RagJobsTableBody
      table={table}
      selectedJobId={selectedJobId}
      offline={ragSemanticOffline(jobsQuery.data)}
      pending={jobsQuery.isPending}
    />
  );
}
