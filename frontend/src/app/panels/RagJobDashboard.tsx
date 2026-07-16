import { useState } from "react";

import { ConfirmDialog } from "../chrome/ConfirmDialog";
import { Button, ProgressBar, StateBlock } from "../kit";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { useActiveScope, useRagStatus } from "../../stores/server/queries";
import {
  type RagStartOutcome,
  interpretRagStartEnvelope,
  useRagReindexWithProgress,
  useRagServiceDoctor,
  useRagServiceStart,
  useRagServiceStop,
} from "../../stores/server/ragControl";
import { RagJobsTable } from "./RagJobsTable";

const M = {
  check: { key: "operations:searchMaintenance.actions.checkHealth" },
  restart: { key: "operations:searchMaintenance.actions.restart" },
  retrySetup: { key: "operations:searchMaintenance.actions.retrySetup" },
  start: { key: "operations:searchMaintenance.actions.start" },
  stop: { key: "operations:searchMaintenance.actions.stop" },
  update: { key: "operations:searchMaintenance.actions.update" },
  cancel: { key: "common:actions.cancel" },
  shared: { key: "operations:searchMaintenance.service.shared" },
  unavailable: { key: "operations:searchMaintenance.service.unavailable" },
  setupRequired: { key: "operations:searchMaintenance.service.setupRequired" },
  startFailed: { key: "operations:searchMaintenance.service.startFailed" },
  updateUnavailable: { key: "operations:searchMaintenance.service.updateUnavailable" },
  progress: { key: "operations:searchMaintenance.accessibility.progress" },
  working: { key: "operations:searchMaintenance.progress.working" },
  stopTitle: { key: "operations:searchMaintenance.confirmations.stop.title" },
  stopBody: { key: "operations:searchMaintenance.confirmations.stop.body" },
  stopConfirm: { key: "operations:searchMaintenance.destructiveActions.stop" },
  search: { key: "common:controlPanels.labels.search" },
} as const;

type HealthTone = "active" | "stale" | "broken";
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
  running: boolean;
  healthWord: string;
  healthTone: HealthTone;
  errored?: boolean;
  startOutcome?: RagStartOutcome;
  actionsPending: boolean;
  doctorPending: boolean;
  reindexActive: boolean;
  reindexFraction?: number;
  onStart: (autoProvision?: boolean) => void;
  onStop: () => void;
  onRestart: () => void;
  onDoctor: () => void;
  onReindex: () => void;
}

export function DashboardHeaderBar({
  running,
  healthWord,
  healthTone,
  errored,
  startOutcome,
  actionsPending,
  doctorPending,
  reindexActive,
  reindexFraction,
  onStart,
  onStop,
  onRestart,
  onDoctor,
  onReindex,
}: DashboardHeaderBarProps) {
  const resolve = useLocalizedMessageResolver();
  const [confirmStop, setConfirmStop] = useState(false);
  const needsInstall = startOutcome?.status === "needs_install";
  const startFailed =
    startOutcome !== undefined && !startOutcome.attached && !needsInstall;
  const tone = errored ? "broken" : healthTone;
  return (
    <>
      <div
        className="flex flex-col gap-fg-2 border-b border-rule px-fg-4 py-fg-3"
        data-rag-dashboard-header
      >
        <div className="flex items-center gap-fg-1-5">
          <span
            aria-hidden
            className={`size-fg-2 shrink-0 rounded-full ${HEALTH_DOT[tone]}`}
          />
          <span className="text-body font-medium text-ink">
            {resolve(M.search).message}
          </span>
          <span className={`text-meta ${HEALTH_INK[tone]}`} data-rag-health-word>
            {healthWord}
          </span>
          <span className="flex-1" />
          <span className="shrink-0 text-caption text-ink-faint">
            {resolve(M.shared).message}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-fg-1">
          {running ? (
            <>
              <Button
                variant="danger"
                onClick={() => setConfirmStop(true)}
                disabled={actionsPending}
              >
                {resolve(M.stop).message}
              </Button>
              <Button variant="ghost" onClick={onRestart} disabled={actionsPending}>
                {resolve(M.restart).message}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => onStart()}
              disabled={actionsPending}
            >
              {resolve(M.start).message}
            </Button>
          )}
          <Button variant="ghost" onClick={onDoctor} disabled={doctorPending}>
            {resolve(M.check).message}
          </Button>
          <span title={running ? undefined : resolve(M.updateUnavailable).message}>
            <Button
              variant="secondary"
              onClick={onReindex}
              disabled={reindexActive || !running}
            >
              {resolve(M.update).message}
            </Button>
          </span>
        </div>
        {reindexActive && (
          <div className="flex items-center gap-fg-2" data-rag-reindex-progress>
            <ProgressBar
              value={
                reindexFraction === undefined ? 0 : Math.round(reindexFraction * 100)
              }
              max={100}
              label={resolve(M.progress).message}
              className="flex-1"
            />
            <span className="text-meta text-ink-faint">
              {resolve(M.working).message}
            </span>
          </div>
        )}
        {needsInstall && (
          <div className="flex flex-col gap-fg-1">
            <p className="text-caption text-state-broken">
              {resolve(M.setupRequired).message}
            </p>
            <Button
              variant="secondary"
              onClick={() => onStart(true)}
              disabled={actionsPending}
            >
              {resolve(M.retrySetup).message}
            </Button>
          </div>
        )}
        {startFailed && (
          <p className="text-caption text-state-broken">
            {resolve(M.startFailed).message}
          </p>
        )}
        {errored && (
          <StateBlock
            mode="degraded"
            layout="inline"
            message={resolve(M.unavailable).message}
          />
        )}
      </div>
      <ConfirmDialog
        open={confirmStop}
        title={resolve(M.stopTitle).message}
        message={resolve(M.stopBody).message}
        confirmLabel={resolve(M.stopConfirm).message}
        cancelLabel={resolve(M.cancel).message}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          onStop();
        }}
      />
    </>
  );
}

export function RagJobDashboard() {
  const scope = useActiveScope();
  const status = useRagStatus();
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const doctor = useRagServiceDoctor(scope);
  const reindex = useRagReindexWithProgress(scope);
  const resolve = useLocalizedMessageResolver();
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;
  const healthWord = resolve(status.presentation).message;
  const tone: HealthTone = status.running
    ? "active"
    : status.loading
      ? "stale"
      : "broken";
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });
  return (
    <div className="flex flex-col" data-rag-job-dashboard>
      <DashboardHeaderBar
        running={status.running}
        healthWord={healthWord}
        healthTone={tone}
        errored={status.errored}
        startOutcome={startOutcome}
        actionsPending={start.isPending || stop.isPending}
        doctorPending={doctor.isPending}
        reindexActive={!reindex.progress.terminal && reindex.jobId !== null}
        reindexFraction={reindex.progress.fraction}
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
      </div>
    </div>
  );
}
