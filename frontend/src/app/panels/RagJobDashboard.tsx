// Search dashboard header, job list, and activity log.

import { useMemo } from "react";

import { Button, ProgressBar, StateBlock } from "../kit";
import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";
import { useActiveScope, useRagStatus } from "../../stores/server/queries";
import {
  type RagStartOutcome,
  interpretRagStartEnvelope,
  useRagOpsState,
  useRagReindexWithProgress,
  useRagServiceDoctor,
  useRagServiceStart,
  useRagServiceStop,
} from "../../stores/server/ragControl";
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";
import { RagJobsTable } from "./RagJobsTable";
import { RagLogPane } from "./RagLogPane";

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

const LIFECYCLE_LABEL: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  crashed: "Not responding",
  absent: "Not running",
};

function lifecycleLabel(word: string): string {
  return LIFECYCLE_LABEL[word] ?? word.charAt(0).toUpperCase() + word.slice(1);
}

/** Visual tone for the current health state. */
type HealthTone = "active" | "stale" | "broken";

function healthTone(running: boolean, word: string): HealthTone {
  return running ? "active" : word === "crashed" ? "stale" : "broken";
}

const HEALTH_DOT: Record<HealthTone, string> = {
  active: "bg-state-active",
  stale: "bg-state-stale",
  broken: "bg-state-broken",
};
const HEALTH_INK: Record<HealthTone, string> = {
  active: "text-state-active",
  stale: "text-state-stale",
  broken: "text-state-broken",
};

export interface DashboardHeaderBarProps {
  /** Whether the process is running. */
  running: boolean;
  /** The user-facing health word. */
  healthWord: string;
  healthTone: HealthTone;
  /** An optional reason for limited availability. */
  degradedReason?: string;
  /** Whether status could not be loaded. */
  errored?: boolean;
  /** Optional compact process details. */
  pidPort?: string;
  /** The last start outcome. */
  startOutcome?: RagStartOutcome;
  /** Whether a start or stop action is pending. */
  actionsPending: boolean;
  /** Whether a health check is pending. */
  doctorPending: boolean;
  /** Whether reindexing is active. */
  reindexActive: boolean;
  /** Reindex progress from zero to one, when known. */
  reindexFraction?: number;
  /** The current reindex progress label. */
  reindexLabel?: string;
  onStart: (autoProvision?: boolean) => void;
  onStop: () => void;
  onRestart: () => void;
  onDoctor: () => void;
  onReindex: () => void;
}

/** Status and actions shown above the dashboard body. */
export function DashboardHeaderBar({
  running,
  healthWord,
  healthTone: tone,
  degradedReason,
  errored,
  pidPort,
  startOutcome,
  actionsPending,
  doctorPending,
  reindexActive,
  reindexFraction,
  reindexLabel,
  onStart,
  onStop,
  onRestart,
  onDoctor,
  onReindex,
}: DashboardHeaderBarProps) {
  const searchLabel = useLocalizedMessage(
    CONTROL_PANEL_VOCABULARY["search-service"].label,
  );
  const needsInstall = startOutcome?.status === "needs_install";
  const startFailed =
    startOutcome !== undefined && !startOutcome.attached && !needsInstall;
  // Keep reindex visible with an explanation when it is unavailable.
  const reindexBlockReason = running
    ? undefined
    : "Start the search service to reindex.";

  return (
    <div
      className="flex flex-col gap-fg-2 border-b border-rule px-fg-4 py-fg-3"
      data-rag-dashboard-header
    >
      <div className="flex items-center gap-fg-1-5">
        <span
          aria-hidden
          className={`size-fg-2 shrink-0 rounded-full ${HEALTH_DOT[tone]}`}
        />
        <span className="text-body font-medium text-ink">{searchLabel}</span>
        <span className={`text-meta ${HEALTH_INK[tone]}`} data-rag-health-word>
          {healthWord}
        </span>
        {pidPort !== undefined && (
          <span className="min-w-0 truncate text-meta tabular-nums text-ink-faint">
            {pidPort}
          </span>
        )}
        <span className="flex-1" />
        <span className="shrink-0 text-caption text-ink-faint">
          shared across projects
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-fg-1">
        {running ? (
          <>
            <Button variant="danger" onClick={onStop} disabled={actionsPending}>
              Stop
            </Button>
            <Button variant="ghost" onClick={onRestart} disabled={actionsPending}>
              Restart
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => onStart()} disabled={actionsPending}>
            Start service
          </Button>
        )}
        <Button variant="ghost" onClick={onDoctor} disabled={doctorPending}>
          Check health
        </Button>
        <span title={reindexBlockReason}>
          <Button
            variant="secondary"
            onClick={onReindex}
            disabled={reindexActive || reindexBlockReason !== undefined}
          >
            Reindex documents
          </Button>
        </span>
      </div>

      {reindexActive && (
        <div className="flex items-center gap-fg-2" data-rag-reindex-progress>
          <ProgressBar
            value={
              reindexFraction !== undefined ? Math.round(reindexFraction * 100) : 0
            }
            max={100}
            label="Reindex progress"
            className="flex-1"
          />
          <span className="shrink-0 text-meta tabular-nums text-ink-faint">
            {reindexLabel ?? "working"}
          </span>
        </div>
      )}

      {needsInstall && (
        <div className="flex flex-col gap-fg-1">
          <p className="text-caption text-state-broken">
            The search backend is not installed — install it, or retry with
            auto-provision.
          </p>
          <div className="flex flex-wrap gap-fg-1">
            <Button
              variant="secondary"
              onClick={() => onStart(true)}
              disabled={actionsPending}
            >
              Retry with auto-provision
            </Button>
          </div>
        </div>
      )}
      {startFailed && (
        <p className="text-caption text-state-broken">
          {`Start failed: ${startOutcome?.reason ?? "unknown error"}`}
        </p>
      )}
      {errored ? (
        <StateBlock
          mode="degraded"
          layout="inline"
          message="The dashboard cannot reach the engine — status is unavailable."
        />
      ) : (
        degradedReason !== undefined && (
          <p className="text-caption text-ink-faint" data-rag-degraded-reason>
            {degradedReason}
          </p>
        )
      )}
    </div>
  );
}

/** Dashboard header, jobs, and activity log. */
export function RagJobDashboard() {
  const scope = useActiveScope();
  const status = useRagStatus();
  const opsState = useRagOpsState(scope);
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const doctor = useRagServiceDoctor(scope);
  const reindex = useRagReindexWithProgress(scope);

  const word = status.running ? "running" : (status.service ?? "absent");
  const tone = healthTone(status.running, word);
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;

  const pidPort = useMemo(() => {
    const qdrant = record(opsState.data?.envelope?.qdrant);
    const pid = qdrant?.pid;
    const port = qdrant?.port;
    const parts = [
      typeof pid === "number" ? `pid ${pid}` : null,
      typeof port === "number" ? `:${port}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [opsState.data]);

  // Restart only after the stop action succeeds.
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });

  return (
    <div className="flex flex-col" data-rag-job-dashboard>
      <DashboardHeaderBar
        running={status.running}
        healthWord={lifecycleLabel(word)}
        healthTone={tone}
        degradedReason={status.degraded ? status.reason : undefined}
        errored={status.errored}
        pidPort={pidPort}
        startOutcome={startOutcome}
        actionsPending={start.isPending || stop.isPending}
        doctorPending={doctor.isPending}
        reindexActive={!reindex.progress.terminal && reindex.jobId !== null}
        reindexFraction={reindex.progress.fraction}
        reindexLabel={reindex.progress.step ?? reindex.progress.phase}
        onStart={(autoProvision) =>
          start.mutate(autoProvision ? { qdrant_auto_provision: true } : undefined)
        }
        onStop={() => stop.mutate()}
        onRestart={restart}
        onDoctor={() => doctor.mutate()}
        onReindex={() => reindex.trigger({ type: "vault" })}
      />
      <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-rag-dashboard-body>
        <RagJobsTable />
        <RagLogPane />
      </div>
    </div>
  );
}
