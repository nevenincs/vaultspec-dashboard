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

import { useMemo, useState } from "react";
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

/** Served `vaultspec.sync.v1` aggregate status → plain-language label
 *  (`.vaultspec/reference/cli.md` "Sync output vocabulary"; displayed-state-
 *  is-backend-served — the frontend maps ONLY presentation). Falls back to the
 *  raw token for a future value this map hasn't caught up to (additive-safe). */
const SYNC_STATUS_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  unchanged: "Already up to date",
  removed: "Removed",
  restored: "Restored",
  skipped: "Skipped",
  failed: "Failed",
  mixed: "Mixed results",
};

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

/** The terminal job outcome: the served sync vocabulary when the completed
 *  verb emitted one (install/migrate), or the raw captured output when it did
 *  not (uv acquisition speaks plain text, never sync-shaped) — rendered
 *  honestly as output, never dressed up as invented sync semantics. */
export function JobOutcome({ job }: { job: ProvisionJob }) {
  if (job.state === "running" || job.outcome === null) return null;
  const outcome = job.outcome;
  const envelope = isRecord(outcome.envelope) ? outcome.envelope : undefined;
  const syncStatus = typeof envelope?.status === "string" ? envelope.status : undefined;
  const items = envelopeItemCount(envelope);
  const failed = job.state === "failed";
  return (
    <div className="flex flex-col gap-fg-1" data-provision-outcome={job.state}>
      <div className="flex items-center gap-fg-1-5">
        {failed ? (
          <TriangleAlert aria-hidden size={14} className="shrink-0 text-state-broken" />
        ) : (
          <Check aria-hidden size={14} className="shrink-0 text-state-active" />
        )}
        <span className="text-meta text-ink">{job.label}</span>
        {syncStatus !== undefined && (
          <Badge tone={failed ? "neutral" : "accent"}>
            {SYNC_STATUS_LABEL[syncStatus] ?? syncStatus}
          </Badge>
        )}
      </div>
      {items !== undefined && (
        <p className="text-meta text-ink-muted">
          {items} item{items === 1 ? "" : "s"}
        </p>
      )}
      {envelope === undefined &&
        typeof outcome.output === "string" &&
        outcome.output.length > 0 && (
          <pre className="max-h-[8rem] overflow-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-caption text-ink-muted whitespace-pre-wrap">
            {outcome.output}
          </pre>
        )}
      {outcome.outcome_indeterminate === true && (
        <p className="text-caption text-ink-muted">
          Couldn&apos;t confirm this finished cleanly on Windows — rechecking status…
        </p>
      )}
    </div>
  );
}

/** Plain-language prose per served recommendation — never the raw token on
 *  screen (ui-labels-are-user-facing). Only the two hard dead-ends need extra
 *  context; every other recommendation is fully explained by the button label. */
export function recommendationDetail(recommended: string): string | null {
  switch (recommended) {
    case "not-a-git-project":
      return "This folder isn't a git repository yet.";
    case "acquire-uv":
      return "vaultspec needs uv to install its tools.";
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
  runErrorMessage: string | null;
  forceArmed: boolean;
  onPrimary: () => void;
  onForce: () => void;
  onRetryStatus?: () => void;
}

export function ProvisionPanelBody({
  data,
  job,
  busy,
  runErrorMessage,
  forceArmed,
  onPrimary,
  onForce,
}: ProvisionPanelBodyProps) {
  const primary = provisionRecommendedAction(data);
  const force = provisionForceInstallAction(data);
  const detail = recommendationDetail(data.recommended);

  return (
    <StateCard testid="not-managed" interactive>
      <p className="text-body font-medium text-ink">Not a vaultspec-managed project</p>
      <p className="text-meta text-ink-muted">
        {detail ?? "vaultspec can install and manage this project for you."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-fg-1-5">
        <Button
          variant="primary"
          disabled={!isRunnable(primary) || busy}
          onClick={onPrimary}
        >
          {primary.label}
        </Button>
        {data.framework.vaultspec_present && (
          <Button
            variant={forceArmed ? "danger" : "ghost"}
            disabled={!isRunnable(force) || busy}
            onClick={onForce}
          >
            {forceArmed ? "Confirm reinstall?" : force.label}
          </Button>
        )}
      </div>
      {runErrorMessage !== null && (
        <p className="text-caption text-state-broken">
          Couldn&apos;t start: {runErrorMessage}
        </p>
      )}
      {busy && (
        <Skeleton label="Provisioning…" className="items-center">
          <SkeletonBar width="w-[12.5rem]" height="h-[0.625rem]" />
        </Skeleton>
      )}
      {job && <JobOutcome job={job} />}
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
  const [forceArmed, setForceArmed] = useState(false);
  const job = useProvisionJob(jobId);

  if (panelState.kind === "hidden") return null;
  if (panelState.kind === "unavailable") {
    return (
      <StateCard testid="provision-unavailable" interactive>
        <TriangleAlert aria-hidden size={20} className="shrink-0 text-state-stale" />
        <p className="text-body font-medium text-state-stale">
          Provisioning status is unavailable
        </p>
        <Button variant="secondary" onClick={refetchStatus}>
          Retry
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
  const handleForce = () => {
    const force = provisionForceInstallAction(panelState.data);
    if (force.confirm === true && !forceArmed) {
      setForceArmed(true);
      return;
    }
    setForceArmed(false);
    dispatchAndTrack(dispatchPayload(force));
  };

  return (
    <ProvisionPanelBody
      data={panelState.data}
      job={job.data}
      busy={busy}
      runErrorMessage={
        run.isError
          ? run.error instanceof Error
            ? run.error.message
            : "unknown error"
          : null
      }
      forceArmed={forceArmed}
      onPrimary={handlePrimary}
      onForce={handleForce}
    />
  );
}
