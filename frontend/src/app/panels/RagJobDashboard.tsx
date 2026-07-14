// @figma RagJobDashboard · SlhonORmySdoSMTQgDWw3w · 1102:4354
// The rag job dashboard shell + header bar (rag-job-dashboard ADR D1/D2). The
// Search service control panel is now a WIDE dialog cockpit: this file owns the
// dashboard SHELL (a header bar over the scrollable body regions) — the jobs and
// log regions compose below, and the footer storage strip rides the Dialog's
// pinned footer slot (wired in ControlPanels).
//
// Layer ownership (dashboard-layer-ownership): glass over the rag stores hooks.
// It reads interpreted status/ops-state (never the raw `tiers` block —
// degradation-is-read-from-tiers via `useRagStatus`), and dispatches every
// lifecycle/reindex verb through the one ops seam (the same hooks the retired
// console used; those interpretations carry forward here). It fetches nothing
// directly; the enclosing modal mount-gates the reads.
//
// The header bar is a PURE presentational component (`DashboardHeaderBar`) fed by
// props, so its verb eligibility and designed offline/degraded states are unit-
// testable without the live wire; the container wires the hooks.

import { useMemo } from "react";

import { Button, ProgressBar, StateBlock } from "../kit";
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
import { RagJobsTable } from "./RagJobsTable";
import { RagLogPane } from "./RagLogPane";

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

// The lifecycle translations carry forward from the retired console (the console
// file stays untouched; it may retire in W03). Wire token -> plain status word.
const LIFECYCLE_LABEL: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  crashed: "Not responding",
  absent: "Not running",
};

function lifecycleLabel(word: string): string {
  return LIFECYCLE_LABEL[word] ?? word.charAt(0).toUpperCase() + word.slice(1);
}

/** The health tone: running is active, crashed is stale (discovered but not
 *  serving), anything else is broken — dot and word agree. */
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
  /** True only when the service word is exactly "running". */
  running: boolean;
  /** The plain-language health word (already reworded — never a wire token). */
  healthWord: string;
  healthTone: HealthTone;
  /** The engine's degraded reason (semantic tier down), when present. */
  degradedReason?: string;
  /** True when the status snapshot is a genuine transport failure. */
  errored?: boolean;
  /** Compact "pid 1234 · :6333" process meta, when the ops-state served it. */
  pidPort?: string;
  /** The last start outcome, so the needs-install path can offer a retry. */
  startOutcome?: RagStartOutcome;
  /** A lifecycle mutation (start/stop) is in flight. */
  actionsPending: boolean;
  /** A doctor check is in flight. */
  doctorPending: boolean;
  /** A reindex job is live (progress not yet terminal). */
  reindexActive: boolean;
  /** 0..1 reindex progress, or undefined for an indeterminate stage. */
  reindexFraction?: number;
  /** The current reindex step/phase label. */
  reindexLabel?: string;
  onStart: (autoProvision?: boolean) => void;
  onStop: () => void;
  onRestart: () => void;
  onDoctor: () => void;
  onReindex: () => void;
}

/**
 * The dashboard header bar (ADR D2): service identity + health word, the lifecycle
 * verbs (Stop/Restart when running, Start when not), Doctor, and the reindex
 * trigger with its inline progress. Verbs that cannot apply while the service is
 * down render disabled-with-reason (D7), never dead-looking controls. Pure over
 * props — the container feeds it interpreted state.
 */
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
  const needsInstall = startOutcome?.status === "needs_install";
  const startFailed =
    startOutcome !== undefined && !startOutcome.attached && !needsInstall;
  // Reindex only applies to a running service; when down it stays visible but
  // disabled-with-reason (D7) rather than vanishing.
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
        <span className="text-body font-medium text-ink">Search service</span>
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

/**
 * The rag job dashboard: the header bar over the jobs and log regions. Mounted as
 * the wide Search service control panel body (ControlPanels); the footer storage
 * strip rides the Dialog's pinned footer slot. All reads mount-gate on the open
 * panel (this component only mounts while the dialog is open).
 */
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

  // Restart is machine-wide (stop then start); chained so the new service comes
  // up after the shared one is down.
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
