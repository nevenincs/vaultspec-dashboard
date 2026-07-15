// The not-a-vaultspec-managed-project empty state (project-provisioning ADR
// D7, plan P04.S20). Detected-but-not-actionable is the exact gap this ADR
// closes (F1): a registered root with no `.vault/`/`.vaultspec/` (or missing
// tools) never resolves an active scope, so the stage would otherwise sit in
// `CanvasStateOverlay`'s "awaiting-scope" loading skeleton forever. This
// panel takes over that centered card once the served projection confirms
// there is really nothing to load — never a client guess — and carries the
// one operator affordance the ADR authorizes.
//
// Split like `ReviewStation`/`ProposalCard`: `resolveProvisionPanelState` is a
// pure function (unit-tested wire-free, mirroring `resolveCanvasState`),
// `ProvisionPanelBody` is a dumb props-driven presentation (unit-tested
// wire-free with injected callbacks), and `ProvisionPanel` is the thin wired
// wrapper that reads stores hooks and delegates — the one piece the live-wire
// suite proves end to end, alongside the dispatch seam's own live test
// (`stores/server/provisionActions.test.ts`). Every displayed truth
// (`managed`, `recommended`, the job outcome vocabulary) is backend-served
// (wire-contract) — nothing here re-derives a status.
//
// `useProvisionPanelState` is the ONE resolved-state read `Stage.tsx` shares
// with this module: it decides both what THIS panel renders and whether
// `CanvasStateOverlay`'s awaiting-scope/empty-invitation card must be
// suppressed (`shouldSuppressCanvasStateOverlay`) so the two designed states
// never paint the same centered card at once for a genuinely unmanaged root.

import { useCallback, useMemo, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

import { isRunnable, type ActionDescriptor } from "../../platform/actions/action";
import { Badge, Button, Skeleton, SkeletonBar } from "../kit";
import type {
  ProvisionJob,
  ProvisionRunBody,
  ProvisionStatus,
} from "../../stores/server/engine";
import {
  useProvisionJob,
  useProvisionRun,
  useProvisionStatus,
} from "../../stores/server/provisionControl";
import {
  provisionForceInstallAction,
  provisionRecommendedAction,
} from "../../stores/view/provisionActions";
import { resolveActionPresentation } from "../../platform/actions/action";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { ActionConfirmationDialog } from "../chrome/ActionConfirmationDialog";
import { StateCard } from "./CanvasStateOverlay";

/** The panel's one resolved state, from stores-derived truth — the chrome half
 *  of "every wire condition is a designed state" for this surface, mirroring
 *  `resolveCanvasState`. `hidden` covers both "nothing to show yet" (loading,
 *  or a live scope already resolved elsewhere) and "already managed" (nothing
 *  to fix); `unavailable` is a genuine read failure, never guessed from a bare
 *  transport error (the caller passes the query's OWN `isError`). */
export type ProvisionPanelState =
  | { kind: "hidden" }
  | { kind: "unavailable" }
  | { kind: "not-managed"; data: ProvisionStatus };

export function resolveProvisionPanelState(inputs: {
  /** The stage's active scope — this panel only ever renders when nothing
   *  else is (never occludes a live, working graph). */
  scope: string | null;
  isPending: boolean;
  isError: boolean;
  data: ProvisionStatus | undefined;
}): ProvisionPanelState {
  if (inputs.scope !== null) return { kind: "hidden" };
  // Let the existing awaiting-scope skeleton show through rather than flash a
  // second loading state.
  if (inputs.isPending) return { kind: "hidden" };
  if (inputs.isError || inputs.data === undefined) return { kind: "unavailable" };
  if (inputs.data.managed) return { kind: "hidden" };
  return { kind: "not-managed", data: inputs.data };
}

/** Known completion statuses map to bounded user-facing messages. Unknown
 * statuses are intentionally omitted instead of exposing service vocabulary. */
type KnownSyncStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "removed"
  | "restored"
  | "skipped"
  | "failed"
  | "mixed";

const SYNC_STATUS_LABEL: Record<KnownSyncStatus, MessageDescriptor> = {
  created: { key: "projects:provisioning.result.status.created" },
  updated: { key: "projects:provisioning.result.status.updated" },
  unchanged: { key: "projects:provisioning.result.status.upToDate" },
  removed: { key: "projects:provisioning.result.status.removed" },
  restored: { key: "projects:provisioning.result.status.restored" },
  skipped: { key: "projects:provisioning.result.status.skipped" },
  failed: { key: "projects:provisioning.result.status.failed" },
  mixed: { key: "projects:provisioning.result.status.mixed" },
};

function isKnownSyncStatus(status: string): status is KnownSyncStatus {
  return Object.hasOwn(SYNC_STATUS_LABEL, status);
}

/** The ONE resolved-state read: wraps `useProvisionStatus` + `resolveProvisionPanelState`
 *  behind a single hook so `Stage.tsx` (which needs to know whether to SUPPRESS
 *  `CanvasStateOverlay`) and `ProvisionPanel` (which needs to know what to RENDER)
 *  derive from the identical resolution — never two independent re-derivations that
 *  could drift (the HIGH review finding: Stage previously mounted both overlays as
 *  plain siblings with nothing suppressing the awaiting-scope card, painting a
 *  double-card artifact for a genuinely unmanaged root). Memoized on the raw query
 *  fields (frontend-store-selectors: derive in useMemo, never a fresh object per
 *  render). */
export function useProvisionPanelState(scope: string | null): {
  state: ProvisionPanelState;
  refetchStatus: () => void;
} {
  const status = useProvisionStatus();
  const { isPending, isError, data, refetch } = status;
  const state = useMemo(
    () => resolveProvisionPanelState({ scope, isPending, isError, data }),
    [scope, isPending, isError, data],
  );
  return { state, refetchStatus: () => void refetch() };
}

/** True once the panel is about to paint a visible card of its own — Stage
 *  reads this to suppress `CanvasStateOverlay`'s awaiting-scope/empty-invitation
 *  card so the two never occupy the same centered coordinates at once. */
export function shouldSuppressCanvasStateOverlay(
  panelState: ProvisionPanelState,
): boolean {
  return panelState.kind !== "hidden";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The sync-shaped envelope's item count, tolerant of the per-verb `data.items`
 *  shape varying (install carries `[path, provider]` tuples; migrations run
 *  carries migration entries) — only the COUNT is asserted, never a per-item
 *  shape this component cannot verify wire-wide. */
function envelopeItemCount(
  envelope: Record<string, unknown> | undefined,
): number | undefined {
  const data = envelope?.data;
  return isRecord(data) && Array.isArray(data.items) ? data.items.length : undefined;
}

/** Render only bounded outcome facts. Raw job labels, paths, service output,
 * schema details, and unknown status values are never user-facing. */
export function JobOutcome({
  job,
  onCheckStatus,
}: {
  job: ProvisionJob;
  onCheckStatus?: () => void;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  if (job.state === "running" || job.outcome === null) return null;
  const outcome = job.outcome;
  const envelope = isRecord(outcome.envelope) ? outcome.envelope : undefined;
  const syncStatus = typeof envelope?.status === "string" ? envelope.status : undefined;
  const items = envelopeItemCount(envelope);
  const failed = job.state === "failed";
  const heading = resolveMessage({
    key: failed
      ? "projects:provisioning.result.failed"
      : "projects:provisioning.result.completed",
  });
  const statusDescriptor =
    syncStatus === undefined || !isKnownSyncStatus(syncStatus)
      ? undefined
      : SYNC_STATUS_LABEL[syncStatus];
  const status =
    statusDescriptor === undefined ? undefined : resolveMessage(statusDescriptor);
  const itemCount =
    items === undefined
      ? undefined
      : resolveMessage({
          key: "projects:provisioning.result.itemCount",
          values: { count: items },
        });
  const indeterminate = resolveMessage({
    key: "projects:provisioning.result.indeterminate",
  });
  const checkStatus = resolveMessage({ key: "projects:actions.checkProjectStatus" });
  return (
    <div className="flex flex-col gap-fg-1" data-provision-outcome={job.state}>
      <div className="flex items-center gap-fg-1-5">
        {failed ? (
          <TriangleAlert aria-hidden size={14} className="shrink-0 text-state-broken" />
        ) : (
          <Check aria-hidden size={14} className="shrink-0 text-state-active" />
        )}
        <span className="text-meta text-ink">{heading.message}</span>
        {status !== undefined && !status.usedFallback && (
          <Badge tone={failed ? "neutral" : "accent"}>{status.message}</Badge>
        )}
      </div>
      {itemCount !== undefined && (
        <p className="text-meta text-ink-muted">{itemCount.message}</p>
      )}
      {outcome.outcome_indeterminate === true && (
        <div className="flex flex-col items-center gap-fg-1">
          <p className="text-caption text-ink-muted">{indeterminate.message}</p>
          <Button
            variant="secondary"
            disabled={checkStatus.usedFallback || onCheckStatus === undefined}
            onClick={checkStatus.usedFallback ? undefined : onCheckStatus}
          >
            {checkStatus.message}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Plain-language prose per served recommendation — never the raw token on
 *  screen (ui-labels-are-user-facing). Only the two hard dead-ends need extra
 *  context; every other recommendation is fully explained by the button label. */
export function recommendationDetail(recommended: string): MessageDescriptor | null {
  switch (recommended) {
    case "not-a-git-project":
      return { key: "projects:provisioning.details.prepareFolderAsGitProject" };
    case "acquire-uv":
      return { key: "projects:provisioning.details.installRequiredProjectTools" };
    default:
      return null;
  }
}

/** The payload a runnable dispatch-lane descriptor carries, or null when the
 *  descriptor is disabled/malformed — read once here so every caller shares
 *  the identical extraction, never a per-button re-derivation. */
export function dispatchPayload(action: ActionDescriptor): ProvisionRunBody | null {
  return isRunnable(action) && action.dispatch !== undefined
    ? (action.dispatch.payload as ProvisionRunBody)
    : null;
}

/** Dumb, props-driven presentation (unit-tested wire-free): the not-managed
 *  card body. Every affordance is an injected callback — like `ProposalCard`'s
 *  `actions` bundle — so the wired `ProvisionPanel` below is the only piece
 *  that touches a hook. */
export interface ProvisionPanelBodyProps {
  data: ProvisionStatus;
  job: ProvisionJob | undefined;
  busy: boolean;
  runError: boolean;
  onPrimary: () => void;
  onForce: () => void;
  onRetryStatus?: () => void;
}

export function ProvisionPanelBody({
  data,
  job,
  busy,
  runError,
  onPrimary,
  onForce,
  onRetryStatus,
}: ProvisionPanelBodyProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const [forceConfirmationOpen, setForceConfirmationOpen] = useState(false);
  const primary = provisionRecommendedAction(data);
  const force = provisionForceInstallAction(data);
  const primaryLabel = resolveActionPresentation(primary.label, resolveMessage);
  const primaryReason =
    primary.disabledReason === undefined
      ? null
      : resolveActionPresentation(primary.disabledReason, resolveMessage);
  const forceLabel = resolveActionPresentation(force.label, resolveMessage);
  const forceReason =
    force.disabledReason === undefined
      ? null
      : resolveActionPresentation(force.disabledReason, resolveMessage);
  const forceConfirmation = force.confirmation;
  const forceConfirmationFallback =
    forceConfirmation === undefined ||
    [
      forceConfirmation?.title,
      forceConfirmation?.body,
      forceConfirmation?.confirmLabel,
      forceConfirmation?.cancelLabel,
    ].some(
      (descriptor) =>
        descriptor === undefined || resolveMessage(descriptor).usedFallback,
    );
  const primaryPresentationFallback =
    primaryLabel.usedFallback || primaryReason?.usedFallback === true;
  const forcePresentationFallback =
    forceLabel.usedFallback ||
    forceReason?.usedFallback === true ||
    forceConfirmationFallback;
  const detailDescriptor = recommendationDetail(data.recommended);
  const detail =
    detailDescriptor === null
      ? resolveMessage({ key: "projects:provisioning.description" })
      : resolveMessage(detailDescriptor);
  const title = resolveMessage({ key: "projects:provisioning.title" });
  const startFailed = resolveMessage({ key: "projects:provisioning.startFailed" });
  const progress = resolveMessage({ key: "projects:provisioning.progress" });
  const cancelForce = useCallback(() => setForceConfirmationOpen(false), []);
  const confirmForce = useCallback(() => {
    setForceConfirmationOpen(false);
    onForce();
  }, [onForce]);

  return (
    <StateCard testid="not-managed" interactive>
      <p className="text-body font-medium text-ink">{title.message}</p>
      <p className="text-meta text-ink-muted">{detail.message}</p>
      <div className="flex flex-wrap items-center justify-center gap-fg-1-5">
        <Button
          variant="primary"
          disabled={primaryPresentationFallback || !isRunnable(primary) || busy}
          onClick={primaryPresentationFallback ? undefined : onPrimary}
        >
          {primaryLabel.message}
        </Button>
        {data.framework.vaultspec_present && (
          <Button
            variant="ghost"
            disabled={forcePresentationFallback || !isRunnable(force) || busy}
            onClick={
              forcePresentationFallback
                ? undefined
                : () => setForceConfirmationOpen(true)
            }
          >
            {forceLabel.message}
          </Button>
        )}
      </div>
      {runError && (
        <p className="text-caption text-state-broken">{startFailed.message}</p>
      )}
      {busy && (
        <Skeleton label={progress.message} className="items-center">
          <SkeletonBar width="w-[12.5rem]" height="h-[0.625rem]" />
        </Skeleton>
      )}
      {job && <JobOutcome job={job} onCheckStatus={onRetryStatus} />}
      {forceConfirmation !== undefined && (
        <ActionConfirmationDialog
          open={forceConfirmationOpen}
          confirmation={forceConfirmation}
          onConfirm={confirmForce}
          onCancel={cancelForce}
        />
      )}
    </StateCard>
  );
}

/** The wired panel: reads the provisioning status + run + job-poll hooks,
 *  resolves the one panel state, and delegates rendering to the props-driven
 *  body. Mounted as a `Stage.tsx` sibling, gated on the SAME `scope === null`
 *  the stage already computes. */
export function ProvisionPanel({ scope }: { scope: string | null }) {
  const { state: panelState, refetchStatus } = useProvisionPanelState(scope);
  const run = useProvisionRun();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useProvisionJob(jobId);
  const resolveMessage = useLocalizedMessageResolver();

  if (panelState.kind === "hidden") return null;
  if (panelState.kind === "unavailable") {
    const unavailable = resolveMessage({
      key: "projects:provisioning.statusUnavailable",
    });
    const retry = resolveMessage({ key: "common:actions.retry" });
    return (
      <StateCard testid="provision-unavailable" interactive>
        <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
        <p className="text-body font-medium text-state-stale">{unavailable.message}</p>
        <Button
          variant="secondary"
          disabled={retry.usedFallback}
          onClick={retry.usedFallback ? undefined : refetchStatus}
        >
          {retry.message}
        </Button>
      </StateCard>
    );
  }

  const running = job.data?.state === "running";
  const busy = run.isPending || running;

  const dispatchAndTrack = (payload: ProvisionRunBody | null) => {
    if (payload === null) return;
    run.mutate(payload, { onSuccess: (result) => setJobId(result.job.id) });
  };
  const handlePrimary = () =>
    dispatchAndTrack(dispatchPayload(provisionRecommendedAction(panelState.data)));
  const handleForce = () =>
    dispatchAndTrack(dispatchPayload(provisionForceInstallAction(panelState.data)));

  return (
    <ProvisionPanelBody
      data={panelState.data}
      job={job.data}
      busy={busy}
      runError={run.isError}
      onPrimary={handlePrimary}
      onForce={handleForce}
      onRetryStatus={refetchStatus}
    />
  );
}
