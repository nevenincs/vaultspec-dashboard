// The served-searches lane — the QUERY half of the one activity panel the
// search-service console shows (the index half is the updates table above it).
// The reference presentation is the service's own watch interface, which pairs
// an "Indexing jobs" lane with a "Served searches" lane: state, what was
// searched, the query, and how long it took. This lane mirrors that grammar in
// the console's compact column.
//
// Layer law: the lane renders the interpreted `RagSearchActivityView` from the
// stores hook (bounded lanes, ledger-side counts) and derives nothing itself.
// Counts are the service's own over the full retained set — never re-counted
// over the returned slice. A query string renders verbatim (it is the user's
// own text, length-bounded in stores); an unrecognized kind or state word stays
// OFF screen rather than leaking wire vocabulary.

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatDuration, formatNumber } from "../../platform/localization/formatters";
import {
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
  facetDotColor,
  type FacetDotTone,
} from "../kit";
import { useActiveScope } from "../../stores/server/queries";
import {
  useRagSearchActivity,
  type RagSearchActivityRecord,
  type RagSearchActivityView,
} from "../../stores/server/ragControl";
import { relativeStart } from "./RagJobsTable";

const M = {
  title: { key: "operations:searchMaintenance.searches.title" },
  empty: { key: "operations:searchMaintenance.searches.empty" },
  loading: { key: "operations:searchMaintenance.searches.loading" },
  unavailable: { key: "operations:searchMaintenance.searches.unavailable" },
  documents: { key: "operations:searchMaintenance.identity.documents" },
  code: { key: "operations:searchMaintenance.identity.code" },
  running: { key: "operations:searchMaintenance.states.running" },
  completed: { key: "operations:searchMaintenance.states.completed" },
  failed: { key: "operations:searchMaintenance.states.failed" },
} as const;

type SearchGroup = "running" | "done" | "failed";

const GROUP_DOT: Record<SearchGroup, FacetDotTone> = {
  running: "active",
  done: "complete",
  failed: "danger",
};

const GROUP_MESSAGE = {
  running: M.running,
  done: M.completed,
  failed: M.failed,
} as const satisfies Record<SearchGroup, { key: string }>;

/** Classify a served search into the three states the lane renders. An active
 *  record is in flight; a terminal one completed or failed by its outcome. */
export function searchGroup(record: RagSearchActivityRecord): SearchGroup {
  if (record.state === "active") return "running";
  return record.outcome === "success" ? "done" : "failed";
}

const GRID =
  "grid grid-cols-[6rem_5rem_minmax(8rem,3fr)_4.5rem_7rem] items-center gap-fg-2";

function SearchRow({ record }: { record: RagSearchActivityRecord }) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const group = searchGroup(record);
  const status = resolve(GROUP_MESSAGE[group]).message;
  const kind =
    record.type === "vault"
      ? resolve(M.documents).message
      : record.type === "code"
        ? resolve(M.code).message
        : null;
  const results =
    record.result_count === undefined
      ? null
      : resolve({
          key: "operations:searchMaintenance.searches.results",
          values: { count: record.result_count },
        }).message;
  const duration =
    record.total_seconds === undefined
      ? null
      : formatDuration(locale, Math.max(0, record.total_seconds) * 1000, {
          maxUnits: 1,
          style: "short",
        });
  const when = relativeStart(locale, record.finished_at ?? record.started_at);
  return (
    <div
      role="listitem"
      aria-label={
        resolve({
          key: "operations:searchMaintenance.searches.status",
          values: { status },
        }).message
      }
      className={`${GRID} rounded-fg-sm px-fg-2 py-fg-1`}
      data-search-row
    >
      <span className="flex min-w-0 items-center gap-fg-1">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: facetDotColor(GROUP_DOT[group]) }}
        />
        <span className="truncate text-meta text-ink-muted">{status}</span>
      </span>
      <span className="truncate text-meta text-ink-faint">{kind}</span>
      <span className="truncate text-meta text-ink" data-search-query>
        {record.query}
      </span>
      <span className="truncate text-meta tabular-nums text-ink-faint">{results}</span>
      <span className="flex flex-col items-end">
        <span className="truncate text-meta tabular-nums text-ink-faint">
          {duration}
        </span>
        <span className="truncate text-caption tabular-nums text-ink-faint">
          {when}
        </span>
      </span>
    </div>
  );
}

export interface SearchActivityLaneBodyProps {
  /** The interpreted served-search view plus the read's pending state. */
  view: RagSearchActivityView & { pending: boolean };
}

/** The wire-free lane body: active searches first, then the recent window, in
 *  the watch interface's column grammar. The desk renders it from authored
 *  props (production-dev-separation: no harness affordance on the container). */
export function SearchActivityLaneBody({ view }: SearchActivityLaneBodyProps) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const rows = [...view.active, ...view.recent];
  const count = formatNumber(locale, view.totalCount) ?? "";
  return (
    <div data-search-activity-region className="flex min-h-0 flex-col gap-fg-2">
      <SectionLabel count={count}>{resolve(M.title).message}</SectionLabel>
      {view.semanticOffline ? (
        <StateBlock mode="degraded" message={resolve(M.unavailable).message} />
      ) : view.pending && rows.length === 0 ? (
        <Skeleton label={resolve(M.loading).message} className="gap-fg-1-5">
          <SkeletonRow width="w-2/3" boxed />
          <SkeletonRow width="w-1/2" boxed />
        </Skeleton>
      ) : rows.length === 0 ? (
        <StateBlock mode="empty" message={resolve(M.empty).message} />
      ) : (
        <div className="min-h-0 overflow-x-auto" data-search-activity-scroll>
          <div role="list" className="flex min-w-[30rem] flex-col">
            {rows.map((record) => (
              <SearchRow key={record.request_id} record={record} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The wired lane: the bounded served-search read over the active scope. Mount-
 *  gated with the console that hosts it, so the steady poll runs only while the
 *  Advanced console is open (data-loading-activity). */
export function SearchActivityLane() {
  const scope = useActiveScope();
  const view = useRagSearchActivity(scope, { enabled: true });
  return <SearchActivityLaneBody view={view} />;
}
