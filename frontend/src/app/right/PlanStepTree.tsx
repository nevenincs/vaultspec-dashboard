// Shared plan-interior renderer for right-rail surfaces.
//
// Work and Status both show the same lazily-loaded plan step tree. This module
// owns that presentation so one feature surface does not become another surface's
// component library.

import { type ChangeEvent, useEffect, useState } from "react";

import { CircleSlash } from "lucide-react";

import {
  useActiveScope,
  useNodeContent,
  usePlanStepTick,
  type InteriorPhaseView,
  type InteriorRollup,
  type InteriorStepView,
  type InteriorWaveView,
  type PlanInteriorView,
} from "../../stores/server/queries";
import { useDashboardNodeSelection } from "../../stores/view/selection";
import { Skeleton, SkeletonRow, StepCheckMark } from "../kit";
import {
  useFocusZone,
  type FocusZoneItemOptions,
  type FocusZoneItemProps,
} from "../chrome/useFocusZone";

/** Roving navigation threaded to each step so the whole step tree is ONE tab stop
 *  with arrow/Home/End roving (keyboard-navigation W04.P07.S23). */
interface StepNav {
  rove: (key: string, options?: FocusZoneItemOptions) => FocusZoneItemProps;
  setActive: (key: string) => void;
}

/** Tick-mutation props threaded from PlanStepTree down through every container. */
interface TickProps {
  planNodeId: string | null;
  scope: string | null;
  blobHash: string | undefined;
  isTimeTravel: boolean;
}

const SMALL_PX = 13;

function RollupFraction({ rollup }: { rollup: InteriorRollup }) {
  return (
    <span className="shrink-0 text-caption text-ink-faint" data-tabular data-rollup>
      {rollup.done}/{rollup.total}
    </span>
  );
}

interface StepRowProps extends TickProps {
  step: InteriorStepView;
  nav: StepNav;
}

function StepRow({
  step,
  nav,
  planNodeId,
  scope,
  blobHash,
  isTimeTravel,
}: StepRowProps) {
  const selectDashboardNode = useDashboardNodeSelection(useActiveScope());
  const tick = usePlanStepTick();
  const [pendingDone, setPendingDone] = useState<boolean | null>(null);
  const [tickMessage, setTickMessage] = useState<string | null>(null);

  // All steps join the roving zone; the checkbox input holds the one tab stop.
  // ArrowRight (cross-axis) opens the step's exec record via the same action as
  // clicking the preview button — keyboard parity with the PlanPill cross-axis pattern.
  const item = nav.rove(step.node_id, {
    onCrossNext: () => {
      if (step.selectable && step.targetNodeId) {
        void selectDashboardNode(step.targetNodeId).catch(() => undefined);
      }
    },
  });

  const effectiveDone =
    tick.isPending || pendingDone !== null ? (pendingDone ?? step.done) : step.done;
  const canTick = !isTimeTravel && !!blobHash && !!planNodeId && !!scope;

  // Clear the optimistic state AND any stale conflict/refused message once the served
  // step.done reconciles to the desired value (plan-interior query refetched after tick).
  useEffect(() => {
    if (pendingDone !== null && step.done === pendingDone && !tick.isPending) {
      setPendingDone(null);
      setTickMessage(null);
    }
  }, [step.done, pendingDone, tick.isPending]);

  function handleTick(e: ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (!canTick || tick.isPending) return;
    const desired = e.currentTarget.checked;
    setPendingDone(desired);
    setTickMessage(null);
    tick.mutate(
      {
        planNodeId,
        scope,
        stepId: step.id,
        done: desired,
        expectedBlobHash: blobHash,
      },
      {
        onSuccess: ({ result }) => {
          if (result.kind === "conflict") {
            setPendingDone(null);
            setTickMessage(
              "step state conflict — the plan changed; try again after the view refreshes",
            );
          } else if (result.kind === "refused") {
            setPendingDone(null);
            setTickMessage(
              result.reason.length > 0
                ? result.reason
                : "could not update the step — try again",
            );
          }
          // "ticked" — pendingDone stays; the reconcile useEffect clears it once
          // the served step.done catches up after the plan-interior query refetches.
        },
        onError: () => {
          setPendingDone(null);
          setTickMessage("could not update the step — try again");
        },
      },
    );
  }

  // The checkbox stays disabled only while the mutation HTTP round-trip is in
  // flight. Once tick.isPending flips to false the step is committed on the
  // server and the user can interact again. pendingDone keeps the visual
  // "checked" state until the plan-interior query reconciles asynchronously
  // (the watcher re-ingest follows the file write with a small lag).
  const checkboxDisabled = !canTick || tick.isPending;

  return (
    <li>
      <div
        data-work-row="step"
        className="flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label"
      >
        {/* The <label> wraps the sr-only native checkbox + its StepCheckMark visual
            proxy. Click on the visual proxy activates the checkbox; the native input
            is the focus-zone tab stop (one stop per composite — Class-B widget-intrinsic
            key; stopPropagation keeps it from reaching the global dispatcher). */}
        <label
          title={isTimeTravel ? "not available while viewing history" : undefined}
          onClick={(e) => e.stopPropagation()}
          className={`relative flex shrink-0 items-center ${canTick ? "cursor-pointer" : "cursor-default"}`}
        >
          <input
            type="checkbox"
            checked={effectiveDone}
            onChange={handleTick}
            disabled={checkboxDisabled}
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={(e) => {
              // Enter is inert on a checkbox (Space toggles; Enter submits a form
              // but this app has no wrapping form). Re-purpose it as a secondary
              // "open exec record" key — same action as clicking the preview button
              // and as ArrowRight via the focus-zone cross-axis (onCrossNext above).
              if (e.key === "Enter" && step.selectable && step.targetNodeId) {
                e.preventDefault();
                e.stopPropagation();
                void selectDashboardNode(step.targetNodeId).catch(() => undefined);
                return;
              }
              item.onKeyDown(e);
            }}
            onFocus={() => nav.setActive(step.node_id)}
            aria-label={`toggle step ${step.id}: ${step.headingLabel}`}
            className="sr-only"
          />
          <StepCheckMark done={effectiveDone} />
        </label>
        <span
          className="shrink-0 select-text font-mono text-caption text-ink-faint"
          data-tabular
        >
          {step.id}
        </span>
        {/* The preview button drops out of the tab ring; the checkbox holds the one
            tab stop (every-composite-navigates-through-the-one-focuszone). */}
        <button
          type="button"
          tabIndex={-1}
          disabled={!step.selectable}
          onClick={(e) => {
            e.stopPropagation();
            if (step.targetNodeId) {
              void selectDashboardNode(step.targetNodeId).catch(() => undefined);
            }
          }}
          aria-label={step.rowAriaLabel}
          className={`min-w-0 flex-1 select-text truncate text-left text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
            step.selectable
              ? "transition-colors duration-ui-fast ease-settle hover:text-ink"
              : "cursor-default opacity-80"
          }`}
        >
          {step.headingLabel}
        </button>
      </div>
      {tickMessage !== null && (
        <p
          className="ml-fg-2-5 pb-fg-0-5 text-caption text-state-stale"
          role="alert"
          data-tick-message
        >
          {tickMessage}
        </p>
      )}
    </li>
  );
}

function PhaseGroup({
  phase,
  nav,
  tick,
}: {
  phase: InteriorPhaseView;
  nav: StepNav;
  tick: TickProps;
}) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption text-ink-faint">
        <span className="font-mono">{phase.id}</span>
        {phase.heading && <span className="min-w-0 truncate">{phase.heading}</span>}
        <RollupFraction rollup={phase.rollup} />
      </p>
      <ul className="space-y-px pl-fg-2" role="list">
        {phase.steps.map((s) => (
          <StepRow key={s.node_id} step={s} nav={nav} {...tick} />
        ))}
      </ul>
    </li>
  );
}

function WaveGroup({
  wave,
  nav,
  tick,
}: {
  wave: InteriorWaveView;
  nav: StepNav;
  tick: TickProps;
}) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption font-medium text-ink-muted">
        <span className="font-mono">{wave.id}</span>
        {wave.heading && <span className="min-w-0 truncate">{wave.heading}</span>}
        <RollupFraction rollup={wave.rollup} />
      </p>
      <ul className="space-y-fg-1 pl-fg-2" role="list">
        {wave.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} nav={nav} tick={tick} />
        ))}
      </ul>
    </li>
  );
}

export function PlanStepTree({
  view,
  planNodeId = null,
  scope = null,
  isTimeTravel = false,
}: {
  view: PlanInteriorView;
  /** The plan document's node id (`doc:<stem>`); drives the `useNodeContent` fetch
   *  for the blob hash used as the stale-base fence on tick mutations. */
  planNodeId?: string | null;
  /** The active worktree scope — pins the mutation to the correct worktree. */
  scope?: string | null;
  /** When `true` the tree is in a historical (as-of) view; checkboxes are disabled
   *  with an explaining `title` attribute. */
  isTimeTravel?: boolean;
}) {
  // One FocusZone over all steps: the step tree is a single tab stop and arrows /
  // Home / End rove the steps (keyboard-navigation W04.P07.S23). All steps join
  // the zone now (not just selectable ones) because the checkbox is the tab stop.
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: activeStep,
    onActiveKeyChange: setActiveStep,
  });
  const nav: StepNav = { rove: zone.rove, setActive: setActiveStep };

  // Fetch the plan content for its blob_hash (the stale-base fence on tick).
  // The query is mount-gated: when planNodeId is null (no plan expanded) nothing
  // fetches. TanStack caches the result keyed on planNodeId+scope.
  const contentQuery = useNodeContent(planNodeId, scope);
  const blobHash = contentQuery.data?.blob_hash;

  const tick: TickProps = { planNodeId, scope, blobHash, isTimeTravel };

  if (view.loading) {
    // Loading is UI-only (state-mode-uniformity ADR D2): a skeleton of pending step
    // rows; the message is the screen-reader label only, never on-screen copy.
    return (
      <Skeleton label={view.loadingMessage} className="px-fg-2 py-fg-1">
        <SkeletonRow width="w-2/3" />
        <SkeletonRow width="w-1/2" />
        <SkeletonRow width="w-3/5" />
      </Skeleton>
    );
  }

  if (!view.served) {
    return (
      <p
        className="px-fg-2 py-fg-1 text-label text-ink-faint"
        data-step-tree-placeholder
      >
        {view.placeholderMessage}
      </p>
    );
  }

  if (view.empty) {
    return (
      <p className="px-fg-2 py-fg-1 text-label text-ink-faint" data-step-tree-empty>
        {view.emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-fg-1 border-l border-rule pl-fg-2" data-step-tree>
      <ul className="space-y-fg-1" role="list" aria-label={view.listAriaLabel}>
        {view.waves.map((w) => (
          <WaveGroup key={w.node_id} wave={w} nav={nav} tick={tick} />
        ))}
        {view.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} nav={nav} tick={tick} />
        ))}
        {view.hasUngroupedSteps && (
          <li>
            <ul className="space-y-px" role="list">
              {view.steps.map((s) => (
                <StepRow key={s.node_id} step={s} nav={nav} {...tick} />
              ))}
            </ul>
          </li>
        )}
      </ul>
      {view.truncatedMessage && (
        <p
          className="flex items-start gap-fg-1-5 rounded-fg-xs border border-state-stale/40 bg-paper-sunken px-fg-2 py-fg-1 text-caption text-ink-muted"
          data-step-tree-truncated
          role="status"
        >
          <span className="mt-px shrink-0 text-state-stale" aria-hidden>
            <CircleSlash size={SMALL_PX} />
          </span>
          <span>{view.truncatedMessage}</span>
        </p>
      )}
    </div>
  );
}
