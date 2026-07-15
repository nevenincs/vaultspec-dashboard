// The rag job-dashboard LOG region (rag-job-dashboard ADR D4; binding Figma
// RagJobDashboard log pane 1102:4354). A bounded, mount-gated tail of the brokered
// `/ops/rag/logs` window: a lines selector (50/200/500), an optional job-filter
// join chip carried from the jobs table, a free-text client filter that is HONEST
// about narrowing only the fetched window, and monospace rows tone-tagged by level.
//
// Glass over the stores plane (dashboard-layer-ownership): the zero-prop region
// reads `useRagLogs` (which polls only while mounted and stops on a tiers-gated
// offline read) plus the view-local presentation store, and derives the client
// narrow in useMemo. It never fetches the engine itself, never reads raw tiers,
// and never accumulates beyond the last served window (bounded-accumulator).

import { useMemo } from "react";
import { X } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  SearchField,
  SectionLabel,
  Segment,
  SegmentedToggle,
  StateBlock,
} from "../kit";
import { useActiveScope } from "../../stores/server/queries";
import {
  useRagLogs,
  type RagLogLevel,
  type RagLogLine,
} from "../../stores/server/ragControl";
import {
  RAG_LOG_LINES_CHOICES,
  selectRagDashboardJob,
  setRagDashboardLogFilter,
  setRagDashboardLines,
  useRagDashboardLines,
  useRagDashboardLogFilter,
  useRagDashboardSelectedJob,
  type RagLogLinesChoice,
} from "../../stores/view/ragDashboard";
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";

// Level → ink tone (status-tone conventions): info reads muted, warning cautions,
// error/critical break; debug recedes; an unparsed line stays muted (untoned).
function logToneClass(level: RagLogLevel | undefined): string {
  switch (level) {
    case "warning":
      return "text-state-stale";
    case "error":
    case "critical":
      return "text-state-broken";
    case "debug":
      return "text-ink-faint";
    default:
      return "text-ink-muted";
  }
}

/** The presentational log body — pure over the (already client-filtered) rows plus
 *  the window/offline/join state. Exported for the render test. */
export function RagLogPaneBody({
  lines,
  windowCount,
  semanticOffline,
  logFilter,
  selectedJobId,
  linesChoice,
}: {
  lines: RagLogLine[];
  windowCount: number;
  semanticOffline: boolean;
  logFilter: string;
  selectedJobId: string | null;
  linesChoice: RagLogLinesChoice;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const unavailableTitle = resolveMessage(
    CONTROL_PANEL_VOCABULARY["search-service"].unavailableTitle,
  );
  const filtering = logFilter.trim().length > 0;

  return (
    <div data-rag-log-region className="flex min-h-0 flex-col gap-fg-2">
      <SectionLabel count={windowCount}>Log</SectionLabel>

      {/* Controls: lines window · job join chip · client text filter. */}
      <div className="flex flex-wrap items-center gap-fg-2">
        <SegmentedToggle
          value={String(linesChoice)}
          onChange={(value) => setRagDashboardLines(value)}
          ariaLabel="Log window size"
        >
          {RAG_LOG_LINES_CHOICES.map((choice) => (
            <Segment key={choice} value={String(choice)} title={`Last ${choice} lines`}>
              {choice}
            </Segment>
          ))}
        </SegmentedToggle>
        {selectedJobId !== null && (
          <span className="inline-flex shrink-0 items-center gap-fg-1 rounded-fg-pill bg-accent-subtle px-fg-2 py-fg-0-5 text-meta font-medium text-accent-text">
            <span className="max-w-[12rem] truncate" title={selectedJobId}>
              Job: {selectedJobId}
            </span>
            <button
              type="button"
              onClick={() => selectRagDashboardJob("")}
              aria-label="Clear job filter"
              className="shrink-0 rounded-fg-xs transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
        <div className="min-w-[10rem] flex-1">
          <SearchField
            value={logFilter}
            onChange={(value) => setRagDashboardLogFilter(value)}
            onClear={() => setRagDashboardLogFilter("")}
            placeholder="Filter lines…"
            ariaLabel="Filter log lines"
          />
        </div>
      </div>

      {/* Honesty: the client filter narrows only the fetched window (D4). */}
      {filtering && (
        <p className="text-caption text-ink-faint">
          Filter applies to the fetched window (last {linesChoice} lines), not the whole
          log.
        </p>
      )}

      {semanticOffline ? (
        <StateBlock
          mode="degraded"
          title={unavailableTitle.usedFallback ? undefined : unavailableTitle.message}
          message="Log lines are unavailable while the search service is down."
        />
      ) : lines.length === 0 ? (
        <StateBlock
          mode="empty"
          message={
            filtering
              ? "No log lines in this window match the filter."
              : "No log lines in this window."
          }
        />
      ) : (
        <div
          role="log"
          aria-label="Service log tail"
          className="flex min-h-0 flex-col gap-fg-0-5 overflow-y-auto rounded-fg-sm bg-paper-sunken p-fg-2"
        >
          {lines.map((line, index) => (
            <span
              key={`${index}-${line.text.slice(0, 24)}`}
              className={`whitespace-pre-wrap break-all font-mono text-caption ${logToneClass(line.level)}`}
            >
              {line.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The LOG region, mount-gated by the dashboard panel host (so the tail polls only
 * while the dashboard is open). Reads the bounded log window joined to the
 * selected job, narrows it on the client honestly, and renders tone-tagged rows.
 */
export function RagLogPane() {
  const scope = useActiveScope();
  const linesChoice = useRagDashboardLines();
  const selectedJobId = useRagDashboardSelectedJob();
  const logFilter = useRagDashboardLogFilter();

  const view = useRagLogs(scope, {
    lines: linesChoice,
    jobId: selectedJobId ?? undefined,
  });

  const filtered = useMemo(() => {
    const needle = logFilter.trim().toLowerCase();
    if (needle.length === 0) return view.lines;
    return view.lines.filter((line) => line.text.toLowerCase().includes(needle));
  }, [view.lines, logFilter]);

  return (
    <RagLogPaneBody
      lines={filtered}
      windowCount={view.total}
      semanticOffline={view.semanticOffline}
      logFilter={logFilter}
      selectedJobId={selectedJobId}
      linesChoice={linesChoice}
    />
  );
}
