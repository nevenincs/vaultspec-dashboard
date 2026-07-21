// The agent-service lifecycle control panel (a2a-product-provisioning W05.P12).
// A dumb chrome surface over the stores-owned lifecycle projection: it renders the
// served install / readiness / ownership / orchestration truth and the eligible
// lifecycle operations, and emits run intent — it NEVER fetches the engine or reads
// raw tiers (architecture-boundaries; the store is the sole wire client).
//
// Split like `ProvisionPanel`: `A2aLifecyclePanelBody` is a dumb, props-driven
// presentation (unit-tested wire-free with the real localization runtime — the
// permitted carve-out), and `A2aLifecyclePanel` is the thin wired wrapper that
// reads the stores hooks, memoizes the projection (frontend-store-selectors: derive
// in one `useMemo`, never a fresh reference per render), and delegates. Every
// displayed truth is backend-served; the eligible-op set is a UX affordance hint
// and the engine refuses authoritatively.

import { useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

import { Button, SectionLabel, Skeleton, SkeletonBar } from "../kit";
import type { ButtonVariant } from "../kit";
import { authoredDisplayText } from "../../platform/localization/displayText";
import type {
  A2aInstallState,
  A2aLifecycleJob,
  A2aLifecycleOp,
  A2aReadiness,
} from "../../stores/server/a2aLifecycle";
import {
  deriveA2aLifecycleView,
  useA2aLifecycleJob,
  useA2aLifecycleRun,
  useA2aLifecycleStatus,
  type A2aLifecycleView,
} from "../../stores/server/a2aLifecycle";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { ConfirmDialog } from "../chrome/ConfirmDialog";

/** The visual tone of the status dot — the readiness/degradation signal. */
type StatusTone = "ok" | "attention" | "down" | "unknown";

const TONE_DOT_CLASS: Record<StatusTone, string> = {
  ok: "bg-state-active",
  attention: "bg-state-stale",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  ok: "text-state-active",
  attention: "text-state-stale",
  down: "text-state-broken",
  unknown: "text-ink-muted",
};

/** The install-state word shown when no readiness model is available (a degraded
 *  or unknown install). Served token → plain-language catalog descriptor. */
const INSTALL_STATE_LABEL: Record<A2aInstallState | "unknown", MessageDescriptor> = {
  absent: { key: "common:agentService.installState.absent" },
  settled: { key: "common:agentService.installState.settled" },
  "recovery-required": { key: "common:agentService.installState.recoveryRequired" },
  busy: { key: "common:agentService.installState.busy" },
  unverifiable: { key: "common:agentService.installState.unverifiable" },
  unknown: { key: "common:agentService.installState.unknown" },
};

/** The per-operation button label. */
const OP_LABEL: Record<A2aLifecycleOp, MessageDescriptor> = {
  install: { key: "common:agentService.ops.install" },
  ensure: { key: "common:agentService.ops.ensure" },
  start: { key: "common:agentService.ops.start" },
  stop: { key: "common:agentService.ops.stop" },
  restart: { key: "common:agentService.ops.restart" },
  repair: { key: "common:agentService.ops.repair" },
  update: { key: "common:agentService.ops.update" },
  rollback: { key: "common:agentService.ops.rollback" },
  remove: { key: "common:agentService.ops.remove" },
  doctor: { key: "common:agentService.ops.doctor" },
};

/** The confirmation copy for each destructive op — remove and rollback both carry
 *  the data-preservation assurance in their body. */
interface OpConfirmCopy {
  readonly title: MessageDescriptor;
  readonly body: MessageDescriptor;
  readonly confirmLabel: MessageDescriptor;
  readonly cancelLabel: MessageDescriptor;
}

const OP_CONFIRM: Partial<Record<A2aLifecycleOp, OpConfirmCopy>> = {
  remove: {
    title: { key: "common:agentService.confirm.remove.title" },
    body: { key: "common:agentService.confirm.remove.body" },
    confirmLabel: { key: "common:agentService.confirm.remove.confirmLabel" },
    cancelLabel: { key: "common:agentService.confirm.remove.cancelLabel" },
  },
  rollback: {
    title: { key: "common:agentService.confirm.rollback.title" },
    body: { key: "common:agentService.confirm.rollback.body" },
    confirmLabel: { key: "common:agentService.confirm.rollback.confirmLabel" },
    cancelLabel: { key: "common:agentService.confirm.rollback.cancelLabel" },
  },
};

/** The primary op per install-state gets the accent variant; destructive ops the
 *  danger variant; everything else the standard secondary. */
function opVariant(op: A2aLifecycleOp, view: A2aLifecycleView): ButtonVariant {
  if (view.destructiveOps.has(op)) return "danger";
  if (op === "install" || op === "start") return "primary";
  return "secondary";
}

/** The stable display order of lifecycle operations (independent of eligibility). */
const OP_ORDER: readonly A2aLifecycleOp[] = [
  "install",
  "start",
  "stop",
  "restart",
  "ensure",
  "update",
  "repair",
  "rollback",
  "remove",
  "doctor",
];

/** The readiness word + tone shown for the current view. A cold worker on a live
 *  gateway is still "Running" (idle) — never a degradation. A degraded install (no
 *  readiness) falls back to the install-state word. */
function statusPresentation(view: A2aLifecycleView): {
  word: MessageDescriptor;
  tone: StatusTone;
} {
  const readiness: A2aReadiness | null = view.readiness;
  if (readiness) {
    switch (readiness.state) {
      case "uninstalled":
        return {
          word: { key: "common:agentService.readiness.uninstalled" },
          tone: "unknown",
        };
      case "installed-stopped":
        return {
          word: { key: "common:agentService.readiness.stopped" },
          tone: "attention",
        };
      case "gateway-ready":
        return readiness.worker === "cold"
          ? { word: { key: "common:agentService.readiness.workerIdle" }, tone: "ok" }
          : { word: { key: "common:agentService.readiness.running" }, tone: "ok" };
    }
  }
  return {
    word: INSTALL_STATE_LABEL[view.installState],
    tone: view.degraded ? "down" : "unknown",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Render only bounded outcome facts. Raw op payloads, service output, and unknown
 *  detail are never user-facing — the job's terminal state maps to one line. */
function JobOutcome({ job }: { job: A2aLifecycleJob }) {
  const resolveMessage = useLocalizedMessageResolver();
  if (job.state === "running") return null;
  const failed = job.state === "failed";
  const heading = resolveMessage({
    key: failed
      ? "common:agentService.outcome.failed"
      : "common:agentService.outcome.succeeded",
  });
  // Surface the data-preservation assurance whenever a remove reported success.
  const removedSafely =
    job.op === "remove" &&
    !failed &&
    isRecord(job.outcome) &&
    job.outcome["data_preserved"] === true;
  const dataPreserved = resolveMessage({ key: "common:agentService.dataPreserved" });
  return (
    <div className="flex flex-col gap-fg-1" data-a2a-outcome={job.state}>
      <div className="flex items-center gap-fg-1-5">
        {failed ? (
          <TriangleAlert aria-hidden size={14} className="shrink-0 text-state-broken" />
        ) : (
          <Check aria-hidden size={14} className="shrink-0 text-state-active" />
        )}
        <span className={`text-meta ${failed ? "text-state-broken" : "text-ink"}`}>
          {heading.message}
        </span>
      </div>
      {removedSafely && !dataPreserved.usedFallback && (
        <p className="text-meta text-ink-muted">{dataPreserved.message}</p>
      )}
    </div>
  );
}

export interface A2aLifecyclePanelBodyProps {
  view: A2aLifecycleView;
  job: A2aLifecycleJob | undefined;
  busy: boolean;
  runError: boolean;
  onRun: (op: A2aLifecycleOp) => void;
}

/** Dumb, props-driven presentation (unit-tested wire-free). Every affordance is an
 *  injected callback; the wired `A2aLifecyclePanel` is the only piece that touches a
 *  hook. */
export function A2aLifecyclePanelBody({
  view,
  job,
  busy,
  runError,
  onRun,
}: A2aLifecyclePanelBodyProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const [confirmOp, setConfirmOp] = useState<A2aLifecycleOp | null>(null);

  const status = statusPresentation(view);
  const statusWord = resolveMessage(status.word);
  const statusLabel = resolveMessage({ key: "common:agentService.statusLabel" });
  const description = resolveMessage({ key: "common:agentService.description" });
  const statusHeading = resolveMessage({ key: "common:agentService.sections.status" });
  const orchestrationHeading = resolveMessage({
    key: "common:agentService.sections.orchestration",
  });
  const actionsHeading = resolveMessage({
    key: "common:agentService.sections.actions",
  });
  const diagnosticsHeading = resolveMessage({
    key: "common:agentService.sections.diagnostics",
  });
  const orchestrationWord = resolveMessage({
    key: view.orchestration.available
      ? "common:agentService.orchestration.available"
      : "common:agentService.orchestration.unavailable",
  });
  const ownership = resolveMessage({
    key: view.owned
      ? "common:agentService.ownership.owned"
      : "common:agentService.ownership.unowned",
  });
  const activeGeneration =
    view.activeGeneration === null
      ? null
      : resolveMessage({
          key: "common:agentService.activeGeneration",
          values: { generation: view.activeGeneration },
        });
  const progress = resolveMessage({ key: "common:agentService.progress" });
  const runFailed = resolveMessage({ key: "common:agentService.runFailed" });
  // The served orchestration reason may carry product-internal wording, so it is
  // surfaced as an authored-display title tooltip (the sanctioned escape used by the
  // Team selector), never as raw visible copy.
  const orchestrationTitle =
    view.orchestration.available || view.orchestration.reason === undefined
      ? undefined
      : (authoredDisplayText(view.orchestration.reason) as string);

  // Diagnostics (doctor) is a read-only probe surfaced in its own section; every
  // other eligible op is a lifecycle action.
  const actionOps = OP_ORDER.filter(
    (op) => op !== "doctor" && view.eligibleOps.has(op),
  );
  const doctorEligible = view.eligibleOps.has("doctor");
  const doctorLabel = resolveMessage(OP_LABEL.doctor);
  const confirmation = confirmOp === null ? undefined : OP_CONFIRM[confirmOp];

  const handleOpClick = (op: A2aLifecycleOp) => {
    if (view.destructiveOps.has(op) && OP_CONFIRM[op] !== undefined) {
      setConfirmOp(op);
      return;
    }
    onRun(op);
  };

  return (
    <div className="flex flex-col gap-fg-3 px-fg-4 py-fg-3" data-a2a-lifecycle-panel>
      <p className="text-meta text-ink-muted">{description.message}</p>

      <div className="flex flex-col gap-fg-1">
        <SectionLabel>{statusHeading.message}</SectionLabel>
        <div className="flex items-center gap-fg-2" data-a2a-status>
          <span
            role="img"
            aria-label={statusLabel.message}
            className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[status.tone]}`}
          />
          <span
            className={`min-w-0 flex-1 truncate text-body ${TONE_TEXT_CLASS[status.tone]}`}
          >
            {statusWord.message}
          </span>
          {activeGeneration !== null && !activeGeneration.usedFallback && (
            <span className="shrink-0 text-meta text-ink-muted" data-a2a-generation>
              {activeGeneration.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-fg-1" data-a2a-orchestration>
        <SectionLabel>{orchestrationHeading.message}</SectionLabel>
        <div
          className="flex items-center gap-fg-1-5"
          title={orchestrationTitle}
          data-a2a-orchestration-state={view.orchestration.available ? "up" : "down"}
        >
          <span
            aria-hidden
            className={`size-fg-1-5 shrink-0 rounded-full ${
              view.orchestration.available ? "bg-state-active" : "bg-state-stale"
            }`}
          />
          <span className="text-meta text-ink">{orchestrationWord.message}</span>
        </div>
        <p className="text-meta text-ink-muted" data-a2a-ownership>
          {ownership.message}
        </p>
      </div>

      {actionOps.length > 0 && (
        <div className="flex flex-col gap-fg-2" data-a2a-actions>
          <SectionLabel>{actionsHeading.message}</SectionLabel>
          <div className="flex flex-wrap gap-fg-1-5">
            {actionOps.map((op) => {
              const label = resolveMessage(OP_LABEL[op]);
              return (
                <Button
                  key={op}
                  variant={opVariant(op, view)}
                  disabled={label.usedFallback || busy}
                  onClick={label.usedFallback ? undefined : () => handleOpClick(op)}
                  data-a2a-op={op}
                >
                  {label.message}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {doctorEligible && (
        <div className="flex flex-col gap-fg-2" data-a2a-diagnostics>
          <SectionLabel>{diagnosticsHeading.message}</SectionLabel>
          <div className="flex flex-wrap gap-fg-1-5">
            <Button
              variant="secondary"
              disabled={doctorLabel.usedFallback || busy}
              onClick={
                doctorLabel.usedFallback ? undefined : () => handleOpClick("doctor")
              }
              data-a2a-op="doctor"
            >
              {doctorLabel.message}
            </Button>
          </div>
        </div>
      )}

      {runError && (
        <p className="text-caption text-state-broken" data-a2a-run-error>
          {runFailed.message}
        </p>
      )}
      {busy && (
        <Skeleton label={progress.message} className="items-start">
          <SkeletonBar width="w-[12.5rem]" height="h-[0.625rem]" />
        </Skeleton>
      )}
      {job && <JobOutcome job={job} />}

      {confirmOp !== null && confirmation !== undefined && (
        <ConfirmDialog
          open
          title={resolveMessage(confirmation.title).message}
          message={resolveMessage(confirmation.body).message}
          confirmLabel={resolveMessage(confirmation.confirmLabel).message}
          cancelLabel={resolveMessage(confirmation.cancelLabel).message}
          onConfirm={() => {
            const op = confirmOp;
            setConfirmOp(null);
            onRun(op);
          }}
          onCancel={() => setConfirmOp(null)}
        />
      )}
    </div>
  );
}

/** The wired panel: reads the lifecycle status + run + job-poll hooks, memoizes the
 *  projection, and delegates to the props-driven body. Mounted only while the
 *  agent-service dialog is open (`ControlPanels`), so a closed panel reads nothing. */
export function A2aLifecyclePanel() {
  const status = useA2aLifecycleStatus();
  const run = useA2aLifecycleRun();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useA2aLifecycleJob(jobId);

  const view = useMemo(() => deriveA2aLifecycleView(status.data), [status.data]);
  const running = job.data?.state === "running";
  const busy = run.isPending || running;

  const onRun = (op: A2aLifecycleOp) => {
    run.mutate({ op }, { onSuccess: (result) => setJobId(result.job.id) });
  };

  return (
    <A2aLifecyclePanelBody
      view={view}
      job={job.data}
      busy={busy}
      runError={run.isError}
      onRun={onRun}
    />
  );
}
