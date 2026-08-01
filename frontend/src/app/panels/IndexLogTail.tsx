// The index tool's log tail (advanced-service-console ADR D4) — the "log" half of
// the owner's log/updates/monitoring ask, rendered inside the ONE index console.
//
// Layer law: a dumb chrome view over the stores-owned `useRagLogs` tail. It
// fetches nothing, parses nothing, and never reads raw `tiers` — the hook already
// bounds the window (line count AND per-line length), parses the level/timestamp,
// and reports `semanticOffline` from the tiers block rather than from a transport
// error. Split like the other console surfaces: `IndexLogTailBody` is props-driven
// (unit-testable and desk-renderable wire-free) and `IndexLogTail` is the thin
// wired wrapper.
//
// Mount-gating (data-loading-activity): the tail POLLS while mounted, so it lives
// only under the expanded index console — a collapsed console runs no poll.

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatNumber } from "../../platform/localization/formatters";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { SectionLabel, Skeleton, SkeletonRow, StateBlock } from "../kit";
import { useActiveScope } from "../../stores/server/queries";
import {
  RAG_LOGS_LINES_DEFAULT,
  useRagLogs,
  type RagLogLevel,
  type RagLogsHookView,
} from "../../stores/server/ragControl";

const M = {
  title: { key: "operations:searchMaintenance.log.title" },
  empty: { key: "operations:searchMaintenance.log.empty" },
  loading: { key: "operations:searchMaintenance.log.loading" },
  unavailable: { key: "operations:searchMaintenance.log.unavailable" },
  scoped: { key: "operations:searchMaintenance.log.scopedToSelection" },
  region: { key: "operations:searchMaintenance.log.region" },
} as const;

/** Level -> the bound ink token. An unparsed level leaves the row untoned, so a
 *  line whose shape we did not recognize is never dressed up as a severity. */
const LEVEL_INK: Record<RagLogLevel, string> = {
  debug: "text-ink-faint",
  info: "text-ink-muted",
  warning: "text-state-stale",
  error: "text-state-broken",
  critical: "text-state-broken",
};

export interface IndexLogTailBodyProps {
  view: RagLogsHookView;
  /** The tail is narrowed to the update selected in the monitor table. */
  scopedToSelection: boolean;
}

export function IndexLogTailBody({ view, scopedToSelection }: IndexLogTailBodyProps) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const count = formatNumber(locale, view.lines.length) ?? "";
  return (
    <div className="flex min-h-0 flex-col gap-fg-2" data-index-log-region>
      <SectionLabel count={count}>{resolve(M.title).message}</SectionLabel>
      {scopedToSelection && (
        <p className="text-caption text-ink-faint">{resolve(M.scoped).message}</p>
      )}
      {view.semanticOffline ? (
        <StateBlock mode="degraded" message={resolve(M.unavailable).message} />
      ) : view.pending ? (
        // Loading is UI-ONLY (state-mode-uniformity ADR D2): a shimmer standing in
        // for the log rows, the human label only in the kit Skeleton's sr-only.
        <Skeleton label={resolve(M.loading).message} className="gap-fg-1">
          <SkeletonRow width="w-5/6" />
          <SkeletonRow width="w-2/3" />
          <SkeletonRow width="w-3/4" />
        </Skeleton>
      ) : view.lines.length === 0 ? (
        <StateBlock mode="empty" message={resolve(M.empty).message} />
      ) : (
        <div
          role="log"
          aria-label={resolve(M.region).message}
          tabIndex={0}
          className="max-h-[16rem] min-h-0 overflow-auto rounded-fg-sm border border-rule bg-paper-sunken px-fg-2 py-fg-1-5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {view.lines.map((line, index) => (
            <p
              // The served tail carries no per-line id and repeats identical lines,
              // so the position in THIS window is the only honest key.
              key={`${index}-${line.text}`}
              data-index-log-line={line.level ?? ""}
              className={`whitespace-pre-wrap break-words font-mono text-caption ${
                line.level === undefined ? "text-ink-muted" : LEVEL_INK[line.level]
              }`}
            >
              {authoredDisplayText(line.text)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export interface IndexLogTailProps {
  /** The update id selected in the monitor table, narrowing the tail to it. */
  jobId: string | null;
}

/** The wired tail: reads the bounded log window for the active scope, narrowed to
 *  the selected update when the operator picked one. */
export function IndexLogTail({ jobId }: IndexLogTailProps) {
  const scope = useActiveScope();
  const view = useRagLogs(scope, {
    lines: RAG_LOGS_LINES_DEFAULT,
    jobId: jobId ?? undefined,
    enabled: true,
  });
  return (
    <IndexLogTailBody
      view={view}
      scopedToSelection={jobId !== null && jobId.length > 0}
    />
  );
}
