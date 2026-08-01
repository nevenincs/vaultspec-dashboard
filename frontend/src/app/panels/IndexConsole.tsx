// The index console (advanced-service-console ADR D4) — the ONE canonical face of
// the tool the semantic index rides on, living in Settings ▸ Advanced. It
// replaces the modal "Search" dashboard the owner rejected on two counts: it is
// named for the TOOL (the served name from the component handshake) rather than
// for one of its features, and its controls are normal weighted actions on the
// identity line instead of a row of large buttons.
//
// What it states, in order: WHO the tool is (served name, the installed and
// required versions, its store's address / process / version / location, what it
// holds), WHAT it is doing right now (lifecycle actions + rebuild progress), the
// UPDATE monitor with its existing bounded filters, the LOG tail, and the
// storage/projects rollup that used to hang off the dialog footer. One console;
// nothing about this tool lives anywhere else.
//
// Layer law: every value is served and interpreted in stores
// (`useRagServiceIdentity`, `useRagStatus`, `useRagOpsState` via the storage
// rollup) — this surface derives nothing and never reads raw `tiers`. All reads
// are the tool's codified Tier-1 contract; no Qdrant-native read and no
// collection-name recomputation (rag-integration).
//
// Mount-gating: the console renders only while its Advanced fold is expanded, so
// its polls (jobs, log tail, ops-state) never run for someone who merely opened
// Settings (data-loading-activity).

import { useState } from "react";

import { ConfirmDialog } from "../chrome/ConfirmDialog";
import {
  Button,
  Divider,
  ProgressBar,
  PropertyRow,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatNumber } from "../../platform/localization/formatters";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useActiveScope, useRagStatus } from "../../stores/server/queries";
import {
  type RagStartOutcome,
  interpretRagStartEnvelope,
  useRagReindexWithProgress,
  useRagServiceDoctor,
  useRagServiceStart,
  useRagServiceStop,
} from "../../stores/server/ragControl";
import {
  useRagServiceIdentity,
  type RagServiceIdentityView,
} from "../../stores/server/ragServiceIdentity";
import { useRagDashboardSelectedJob } from "../../stores/view/ragDashboard";
import { RagJobsTable } from "./RagJobsTable";
import { RagDashboardFooter } from "./RagDashboardFooter";
import { IndexLogTail } from "./IndexLogTail";

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
  fallbackName: { key: "operations:searchMaintenance.identity.title" },
  version: { key: "operations:searchMaintenance.identity.version" },
  installedVersion: { key: "operations:searchMaintenance.identity.installedVersion" },
  requiredVersion: { key: "operations:searchMaintenance.identity.requiredVersion" },
  storageMode: { key: "operations:searchMaintenance.identity.storageMode" },
  storageAddress: { key: "operations:searchMaintenance.identity.storageAddress" },
  storageProcess: { key: "operations:searchMaintenance.identity.storageProcess" },
  storageVersion: { key: "operations:searchMaintenance.identity.storageVersion" },
  storagePath: { key: "operations:searchMaintenance.identity.storagePath" },
  documents: { key: "operations:searchMaintenance.identity.documents" },
  code: { key: "operations:searchMaintenance.identity.code" },
  identityUnavailable: { key: "operations:searchMaintenance.identity.unavailable" },
  identityLoading: { key: "operations:searchMaintenance.identity.loading" },
} as const;

export type IndexHealthTone = "active" | "stale" | "broken";
const HEALTH_DOT: Record<IndexHealthTone, string> = {
  active: "bg-state-active",
  stale: "bg-state-stale",
  broken: "bg-state-broken",
};
const HEALTH_INK: Record<IndexHealthTone, string> = {
  active: "text-state-active",
  stale: "text-state-stale",
  broken: "text-state-broken",
};

export interface IndexConsoleHeaderProps {
  /** The served identity facts; every field renders only when the wire carried it. */
  identity: RagServiceIdentityView;
  /** The identity read is in flight with nothing held. */
  identityLoading: boolean;
  /** The semantic tier reports unavailable (read from tiers, never guessed). */
  identityOffline: boolean;
  running: boolean;
  healthWord: string;
  healthTone: IndexHealthTone;
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

/**
 * The console's identity header: one weighted line (status mark, the SERVED tool
 * name, the status word, and the lifecycle actions) over the served identity
 * properties. The action shape is deliberate — one primary verb for the lifecycle
 * state and quiet text actions beside it, never the four equal filled buttons the
 * previous dashboard stacked in a wrapping row (ADR D4).
 *
 * Wire-free and props-driven, so the desk renders every state without a seed.
 */
export function IndexConsoleHeader({
  identity,
  identityLoading,
  identityOffline,
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
}: IndexConsoleHeaderProps) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const [confirmStop, setConfirmStop] = useState(false);
  const needsInstall = startOutcome?.status === "needs_install";
  const startFailed =
    startOutcome !== undefined && !startOutcome.attached && !needsInstall;
  const tone = errored ? "broken" : healthTone;
  // The tool's own name is SERVED (the component handshake), so it renders as
  // authored display text rather than a catalog label — the console must name
  // whatever tool is actually attached, not a name we hard-coded.
  const servedName =
    identity.name === null ? null : (authoredDisplayText(identity.name) as string);
  const number = (value: number | null) =>
    value === null ? null : (formatNumber(locale, value) ?? null);
  const rows: Array<[string, string | null]> = [
    [resolve(M.version).message, identity.version],
    [resolve(M.installedVersion).message, identity.installedVersion],
    [resolve(M.requiredVersion).message, identity.requiredVersion],
    [resolve(M.storageMode).message, identity.storageMode],
    [resolve(M.storageAddress).message, identity.storageEndpoint],
    [
      resolve(M.storageProcess).message,
      identity.storageProcessId === null ? null : String(identity.storageProcessId),
    ],
    [resolve(M.storageVersion).message, identity.storageVersion],
    [resolve(M.storagePath).message, identity.storagePath],
    [resolve(M.documents).message, number(identity.documents)],
    [resolve(M.code).message, number(identity.code)],
  ];
  const shownRows = rows.filter(
    (row): row is [string, string] => row[1] !== null && row[1].length > 0,
  );

  return (
    <>
      <div className="flex flex-col gap-fg-2" data-index-console-header>
        <div className="flex flex-wrap items-center gap-x-fg-2 gap-y-fg-1">
          <span
            aria-hidden
            className={`size-fg-2 shrink-0 rounded-full ${HEALTH_DOT[tone]}`}
          />
          <span className="min-w-0 truncate text-body font-medium text-ink">
            {servedName ?? resolve(M.fallbackName).message}
          </span>
          <span
            className={`shrink-0 text-meta ${HEALTH_INK[tone]}`}
            data-index-health-word
          >
            {healthWord}
          </span>
          <span className="flex-1" />
          {/* One weighted lifecycle verb, then quiet text actions — the redesigned
              control shape (ADR D4). */}
          <div className="flex shrink-0 flex-wrap items-center gap-fg-1">
            {running ? (
              <Button
                variant="danger"
                onClick={() => setConfirmStop(true)}
                disabled={actionsPending}
              >
                {resolve(M.stop).message}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => onStart()}
                disabled={actionsPending}
              >
                {resolve(M.start).message}
              </Button>
            )}
            {running && (
              <Button variant="ghost" onClick={onRestart} disabled={actionsPending}>
                {resolve(M.restart).message}
              </Button>
            )}
            <Button variant="ghost" onClick={onDoctor} disabled={doctorPending}>
              {resolve(M.check).message}
            </Button>
            <span title={running ? undefined : resolve(M.updateUnavailable).message}>
              <Button
                variant="ghost"
                onClick={onReindex}
                disabled={reindexActive || !running}
              >
                {resolve(M.update).message}
              </Button>
            </span>
          </div>
        </div>
        <p className="text-caption text-ink-faint">{resolve(M.shared).message}</p>

        {reindexActive && (
          <div className="flex items-center gap-fg-2" data-index-reindex-progress>
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

        <Divider />

        <div className="flex flex-col" data-index-identity>
          {identityOffline ? (
            <StateBlock
              mode="degraded"
              layout="inline"
              message={resolve(M.identityUnavailable).message}
            />
          ) : identityLoading && shownRows.length === 0 ? (
            <Skeleton label={resolve(M.identityLoading).message} className="gap-fg-1">
              <SkeletonRow width="w-2/3" />
              <SkeletonRow width="w-1/2" />
            </Skeleton>
          ) : shownRows.length === 0 ? (
            <StateBlock
              mode="empty"
              layout="inline"
              message={resolve(M.identityUnavailable).message}
            />
          ) : (
            shownRows.map(([label, value]) => (
              <PropertyRow
                key={label}
                label={label}
                value={authoredDisplayText(value)}
                data-index-identity-row
              />
            ))
          )}
        </div>
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

/** The wired console: composes the identity/status/lifecycle reads, then the three
 *  monitors (updates, log, storage) that were previously scattered across the
 *  retired dialog body and its footer. */
export function IndexConsole() {
  const scope = useActiveScope();
  const status = useRagStatus();
  const { identity, loading, offline } = useRagServiceIdentity(scope);
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const doctor = useRagServiceDoctor(scope);
  const reindex = useRagReindexWithProgress(scope);
  const resolve = useLocalizedMessageResolver();
  // The updates table owns the selection; the log tail narrows to it, so picking an
  // update in the monitor scopes its log — one selection, two views of it.
  const selectedJobId = useRagDashboardSelectedJob();
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;
  const healthWord = resolve(status.presentation).message;
  const tone: IndexHealthTone = status.running
    ? "active"
    : status.loading
      ? "stale"
      : "broken";
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });

  return (
    <div className="flex flex-col gap-fg-3" data-index-console>
      <IndexConsoleHeader
        identity={identity}
        identityLoading={loading}
        identityOffline={offline}
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
      <RagJobsTable />
      <IndexLogTail jobId={selectedJobId} />
      <RagDashboardFooter />
    </div>
  );
}
