// The search-service console (advanced-service-console ADR D4, renamed by the
// owner's directive recorded on that ADR) — the ONE canonical face of the
// service the semantic index rides on, living in Settings ▸ Advanced. Elements
// are named what they are: the SERVICE gets lifecycle verbs (start, stop,
// pause, resume — icon controls, compact by design), and the INDEX gets its own
// domain verb (rebuild), which lives with the index monitor rather than in the
// service lifecycle cluster.
//
// What it states, in order: WHO the service is and HOW it is doing (health word
// first, then its own port and process — both served verbatim), then the
// versions and the store facts, then the activity monitor, the log tail, and
// the storage/projects rollup. One console; nothing about this service lives
// anywhere else.
//
// Layer law: every value is served and interpreted in stores
// (`useRagServiceIdentity`, `useRagStatus`, `useRagQuiesce`) — this surface
// derives nothing and never reads raw `tiers`. All reads are the service's
// codified Tier-1 contract; no Qdrant-native read and no collection-name
// recomputation (rag-integration).
//
// Pause is rag's QUIESCE HOLD (machine-global, checkpointed, never a stop): the
// confirmation states the consequence, the health word tracks the hold
// lifecycle, and a resume refused because another program borrowed the search
// hardware renders the authored sentence — never the raw envelope.
//
// Mount-gating: the console renders only while its Advanced fold is expanded, so
// its polls (jobs, log tail, ops-state) never run for someone who merely opened
// Settings (data-loading-activity).

import { useState } from "react";

import {
  DatabaseBackup,
  Pause,
  Play,
  RotateCcw,
  Square,
  Stethoscope,
} from "lucide-react";

import { ConfirmDialog } from "../chrome/ConfirmDialog";
import {
  Button,
  Divider,
  IconButton,
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
  type RagQuiesceWord,
  type RagStartOutcome,
  interpretRagStartEnvelope,
  useRagQuiesce,
  useRagReindexWithProgress,
  useRagServiceDoctor,
  useRagServicePause,
  useRagServiceResume,
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
import { SearchActivityLane } from "./SearchActivityLane";
import { IndexLogTail } from "./IndexLogTail";

const M = {
  check: { key: "operations:searchMaintenance.actions.checkHealth" },
  pause: { key: "operations:searchMaintenance.actions.pause" },
  restart: { key: "operations:searchMaintenance.actions.restart" },
  resume: { key: "operations:searchMaintenance.actions.resume" },
  retrySetup: { key: "operations:searchMaintenance.actions.retrySetup" },
  start: { key: "operations:searchMaintenance.actions.start" },
  stop: { key: "operations:searchMaintenance.actions.stop" },
  rebuild: { key: "operations:searchMaintenance.actions.update" },
  cancel: { key: "common:actions.cancel" },
  shared: { key: "operations:searchMaintenance.service.shared" },
  unavailable: { key: "operations:searchMaintenance.service.unavailable" },
  setupRequired: { key: "operations:searchMaintenance.service.setupRequired" },
  startFailed: { key: "operations:searchMaintenance.service.startFailed" },
  rebuildUnavailable: { key: "operations:searchMaintenance.service.updateUnavailable" },
  pauseUnavailable: { key: "operations:searchMaintenance.service.pauseUnavailable" },
  resumeHeld: { key: "operations:searchMaintenance.service.resumeHeld" },
  progress: { key: "operations:searchMaintenance.accessibility.progress" },
  working: { key: "operations:searchMaintenance.progress.working" },
  pauseTitle: { key: "operations:searchMaintenance.confirmations.pause.title" },
  pauseBody: { key: "operations:searchMaintenance.confirmations.pause.body" },
  stopTitle: { key: "operations:searchMaintenance.confirmations.stop.title" },
  stopBody: { key: "operations:searchMaintenance.confirmations.stop.body" },
  stopConfirm: { key: "operations:searchMaintenance.destructiveActions.stop" },
  statePaused: { key: "operations:searchMaintenance.states.paused" },
  statePausing: { key: "operations:searchMaintenance.states.pausing" },
  stateResuming: { key: "operations:searchMaintenance.states.resuming" },
  // The console names itself from the catalog, never from the served component
  // handshake: that value is the backend package identifier, which the labels
  // law keeps off screen no matter which tool is attached.
  title: { key: "operations:searchMaintenance.identity.title" },
  port: { key: "operations:searchMaintenance.identity.port" },
  process: { key: "operations:searchMaintenance.identity.process" },
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

/** The glyph size every lifecycle icon control renders at (1rem at basis). */
const GLYPH = 16;

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
  /** The service-hold lifecycle word (`unknown` when the wire reports none). */
  quiesceWord?: RagQuiesceWord;
  /** A hold transition or its mutation is in flight — both hold verbs wait. */
  quiescePending?: boolean;
  /** The last resume was refused: another program borrowed the search hardware. */
  resumeHeld?: boolean;
  onStart: (autoProvision?: boolean) => void;
  onStop: () => void;
  onRestart: () => void;
  onDoctor: () => void;
  onPause: () => void;
  onResume: () => void;
}

/**
 * The console's identity header: one weighted line (status mark, the catalog
 * name, the health word, and the lifecycle ICON controls) over the served
 * identity facts, health first and the service's own port right behind it.
 * The controls are compact icon buttons — the owner's ruling against the rows
 * of large default buttons this console twice grew — each named for the
 * SERVICE verb it performs; the index-domain rebuild verb is deliberately NOT
 * here (it lives with the index monitor).
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
  quiesceWord = "unknown",
  quiescePending = false,
  resumeHeld = false,
  onStart,
  onStop,
  onRestart,
  onDoctor,
  onPause,
  onResume,
}: IndexConsoleHeaderProps) {
  const resolve = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const needsInstall = startOutcome?.status === "needs_install";
  const startFailed =
    startOutcome !== undefined && !startOutcome.attached && !needsInstall;
  const tone = errored ? "broken" : healthTone;
  const held =
    quiesceWord === "paused" || quiesceWord === "pausing" || quiesceWord === "resuming";
  const number = (value: number | null) =>
    value === null ? null : (formatNumber(locale, value) ?? null);
  // A port and a process id are identifiers: rendered verbatim, never grouped.
  const verbatim = (value: number | null) => (value === null ? null : String(value));
  const rows: Array<[string, string | null]> = [
    [resolve(M.port).message, verbatim(identity.port)],
    [resolve(M.process).message, verbatim(identity.processId)],
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
  const startLabel = resolve(M.start).message;
  const stopLabel = resolve(M.stop).message;
  const pauseLabel = resolve(M.pause).message;
  const resumeLabel = resolve(M.resume).message;
  const restartLabel = resolve(M.restart).message;
  const checkLabel = resolve(M.check).message;

  return (
    <>
      <div className="flex flex-col gap-fg-2" data-index-console-header>
        <div className="flex flex-wrap items-center gap-x-fg-2 gap-y-fg-1">
          <span
            aria-hidden
            className={`size-fg-2 shrink-0 rounded-full ${HEALTH_DOT[tone]}`}
          />
          <span className="min-w-0 truncate text-body font-medium text-ink">
            {resolve(M.title).message}
          </span>
          <span
            className={`shrink-0 text-meta ${HEALTH_INK[tone]}`}
            data-index-health-word
          >
            {healthWord}
          </span>
          <span className="flex-1" />
          {/* The lifecycle cluster: compact icon controls, one per SERVICE verb.
              The verb set follows the state — start when stopped; pause / stop /
              restart while running; resume / stop while held. */}
          <div
            className="flex shrink-0 items-center gap-fg-1"
            data-index-lifecycle-controls
          >
            {!running && (
              <IconButton
                label={startLabel}
                title={startLabel}
                onClick={() => onStart()}
                disabled={actionsPending}
              >
                <Play size={GLYPH} aria-hidden />
              </IconButton>
            )}
            {running && !held && (
              <IconButton
                label={pauseLabel}
                title={pauseLabel}
                onClick={() => setConfirmPause(true)}
                disabled={actionsPending || quiescePending}
              >
                <Pause size={GLYPH} aria-hidden />
              </IconButton>
            )}
            {running && held && (
              <IconButton
                label={resumeLabel}
                title={resumeLabel}
                onClick={onResume}
                disabled={actionsPending || quiescePending}
              >
                <Play size={GLYPH} aria-hidden />
              </IconButton>
            )}
            {running && (
              <IconButton
                label={stopLabel}
                title={stopLabel}
                onClick={() => setConfirmStop(true)}
                disabled={actionsPending}
              >
                <Square size={GLYPH} aria-hidden />
              </IconButton>
            )}
            {running && !held && (
              <IconButton
                label={restartLabel}
                title={restartLabel}
                onClick={onRestart}
                disabled={actionsPending}
              >
                <RotateCcw size={GLYPH} aria-hidden />
              </IconButton>
            )}
            <IconButton
              label={checkLabel}
              title={checkLabel}
              onClick={onDoctor}
              disabled={doctorPending}
            >
              <Stethoscope size={GLYPH} aria-hidden />
            </IconButton>
          </div>
        </div>
        <p className="text-caption text-ink-faint">{resolve(M.shared).message}</p>

        {resumeHeld && (
          <p className="text-caption text-state-stale" data-index-resume-held>
            {resolve(M.resumeHeld).message}
          </p>
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
        open={confirmPause}
        title={resolve(M.pauseTitle).message}
        message={resolve(M.pauseBody).message}
        confirmLabel={pauseLabel}
        cancelLabel={resolve(M.cancel).message}
        onCancel={() => setConfirmPause(false)}
        onConfirm={() => {
          setConfirmPause(false);
          onPause();
        }}
      />
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

/** The index-domain control the service lifecycle cluster deliberately does not
 *  hold: rebuild acts on the INDEX, so it renders beside the index monitor's
 *  own heading, with its progress inline. Wire-free (props only). */
export function IndexRebuildControl({
  reindexActive,
  reindexFraction,
  running,
  onReindex,
}: {
  reindexActive: boolean;
  reindexFraction?: number;
  running: boolean;
  onReindex: () => void;
}) {
  const resolve = useLocalizedMessageResolver();
  const rebuildLabel = resolve(M.rebuild).message;
  return (
    <div className="flex items-center gap-fg-2" data-index-rebuild>
      {reindexActive && (
        <>
          <ProgressBar
            value={
              reindexFraction === undefined ? 0 : Math.round(reindexFraction * 100)
            }
            max={100}
            label={resolve(M.progress).message}
            className="w-24"
          />
          <span className="text-caption text-ink-faint">
            {resolve(M.working).message}
          </span>
        </>
      )}
      <IconButton
        label={rebuildLabel}
        title={running ? rebuildLabel : resolve(M.rebuildUnavailable).message}
        onClick={onReindex}
        disabled={reindexActive || !running}
      >
        <DatabaseBackup size={GLYPH} aria-hidden />
      </IconButton>
    </div>
  );
}

/** The wired console: composes the identity/status/lifecycle reads, then the
 *  monitors (updates + rebuild, log, storage). The health word tracks the hold
 *  lifecycle — a paused service says so before anything else does. */
export function IndexConsole() {
  const scope = useActiveScope();
  const status = useRagStatus();
  const { identity, loading, offline } = useRagServiceIdentity(scope);
  const start = useRagServiceStart(scope);
  const stop = useRagServiceStop(scope);
  const doctor = useRagServiceDoctor(scope);
  const pause = useRagServicePause(scope);
  const resume = useRagServiceResume(scope);
  const quiesce = useRagQuiesce(scope);
  const reindex = useRagReindexWithProgress(scope);
  const resolve = useLocalizedMessageResolver();
  // The updates table owns the selection; the log tail narrows to it, so picking an
  // update in the monitor scopes its log — one selection, two views of it.
  const selectedJobId = useRagDashboardSelectedJob();
  const startOutcome = start.data ? interpretRagStartEnvelope(start.data) : undefined;
  // Health first: the hold lifecycle outranks the generic running word — a held
  // service is not simply "Running", and the word says which way it is moving.
  const quiesceStateMessage =
    quiesce.word === "paused"
      ? M.statePaused
      : quiesce.word === "pausing"
        ? M.statePausing
        : quiesce.word === "resuming"
          ? M.stateResuming
          : null;
  const healthWord =
    status.running && quiesceStateMessage !== null
      ? resolve(quiesceStateMessage).message
      : resolve(status.presentation).message;
  const tone: IndexHealthTone =
    status.running && quiesceStateMessage !== null
      ? "stale"
      : status.running
        ? "active"
        : status.loading
          ? "stale"
          : "broken";
  const restart = () =>
    stop.mutate(undefined, { onSuccess: () => start.mutate(undefined) });
  const resumeEnvelope =
    resume.data && typeof resume.data.envelope === "object"
      ? (resume.data.envelope as Record<string, unknown> | null)
      : null;
  const resumeHeld =
    resumeEnvelope?.status === "borrower_lease_required" &&
    (quiesce.word === "paused" || quiesce.word === "pausing");

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
        quiesceWord={quiesce.word}
        quiescePending={pause.isPending || resume.isPending || quiesce.transitional}
        resumeHeld={resumeHeld}
        onStart={(autoProvision) =>
          start.mutate(autoProvision ? { qdrant_auto_provision: true } : undefined)
        }
        onStop={() => stop.mutate()}
        onRestart={restart}
        onDoctor={() => doctor.mutate()}
        onPause={() => pause.mutate()}
        onResume={() => resume.mutate()}
      />
      <RagJobsTable
        action={
          <IndexRebuildControl
            reindexActive={!reindex.progress.terminal && reindex.jobId !== null}
            reindexFraction={reindex.progress.fraction}
            running={status.running}
            onReindex={() => reindex.trigger({ type: "vault" })}
          />
        }
      />
      {/* The one activity panel is BOTH halves: the index updates above, the
          searches the service is serving right here beneath them — mirroring
          the service's own watch interface. */}
      <SearchActivityLane />
      <IndexLogTail jobId={selectedJobId} />
      <RagDashboardFooter />
    </div>
  );
}
