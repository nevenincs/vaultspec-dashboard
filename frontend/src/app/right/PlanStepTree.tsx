// Shared plan-interior renderer for right-rail surfaces.
//
// Work and Status both show the same lazily-loaded plan step tree. This module
// owns that presentation so one feature surface does not become another surface's
// component library.

import { useState } from "react";

import { CircleSlash } from "lucide-react";

import {
  useActiveScope,
  type InteriorPhaseView,
  type InteriorRollup,
  type InteriorStepView,
  type InteriorWaveView,
  type PlanInteriorView,
} from "../../stores/server/queries";
import { useDashboardNodeSelection } from "../../stores/view/selection";
import { Skeleton, SkeletonRow, StepCheckMark } from "../kit";
import { useFocusZone, type FocusZoneItemProps } from "../chrome/useFocusZone";

/** Roving navigation threaded to each selectable step so the whole step tree is
 *  ONE tab stop with arrow/Home/End roving (keyboard-navigation W04.P07.S23). */
interface StepNav {
  rove: (key: string) => FocusZoneItemProps;
  setActive: (key: string) => void;
}

const SMALL_PX = 13;

function RollupFraction({ rollup }: { rollup: InteriorRollup }) {
  return (
    <span className="shrink-0 text-caption text-ink-faint" data-tabular data-rollup>
      {rollup.done}/{rollup.total}
    </span>
  );
}

interface StepRowProps {
  step: InteriorStepView;
  nav: StepNav;
}

function StepRow({ step, nav }: StepRowProps) {
  const selectDashboardNode = useDashboardNodeSelection(useActiveScope());
  // A selectable step joins the roving order (one tab stop for the tree, arrows
  // move between steps, Enter/Space selects via the native button). A
  // non-selectable step stays out of the tab order (tabIndex -1, disabled).
  const item = step.selectable ? nav.rove(step.node_id) : null;
  return (
    <li>
      <button
        type="button"
        data-work-row="step"
        disabled={!step.selectable}
        ref={item?.ref}
        tabIndex={item ? item.tabIndex : -1}
        onKeyDown={item?.onKeyDown}
        onFocus={item ? () => nav.setActive(step.node_id) : undefined}
        onClick={() => {
          if (step.targetNodeId) {
            void selectDashboardNode(step.targetNodeId).catch(() => undefined);
          }
        }}
        aria-label={step.rowAriaLabel}
        className={step.rowClassName}
      >
        <StepCheckMark done={step.done} />
        <span
          className="shrink-0 select-text font-mono text-caption text-ink-faint"
          data-tabular
        >
          {step.id}
        </span>
        <span className="min-w-0 select-text truncate text-ink-muted">
          {step.headingLabel}
        </span>
      </button>
    </li>
  );
}

function PhaseGroup({ phase, nav }: { phase: InteriorPhaseView; nav: StepNav }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption text-ink-faint">
        <span className="font-mono">{phase.id}</span>
        {phase.heading && <span className="min-w-0 truncate">{phase.heading}</span>}
        <RollupFraction rollup={phase.rollup} />
      </p>
      <ul className="space-y-px pl-fg-2" role="list">
        {phase.steps.map((s) => (
          <StepRow key={s.node_id} step={s} nav={nav} />
        ))}
      </ul>
    </li>
  );
}

function WaveGroup({ wave, nav }: { wave: InteriorWaveView; nav: StepNav }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption font-medium text-ink-muted">
        <span className="font-mono">{wave.id}</span>
        {wave.heading && <span className="min-w-0 truncate">{wave.heading}</span>}
        <RollupFraction rollup={wave.rollup} />
      </p>
      <ul className="space-y-fg-1 pl-fg-2" role="list">
        {wave.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} nav={nav} />
        ))}
      </ul>
    </li>
  );
}

export function PlanStepTree({ view }: { view: PlanInteriorView }) {
  // One FocusZone over all selectable steps: the step tree is a single tab stop
  // and arrows / Home / End rove the steps (keyboard-navigation W04.P07.S23).
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "vertical",
    wrap: false,
    activeKey: activeStep,
    onActiveKeyChange: setActiveStep,
  });
  const nav: StepNav = { rove: zone.rove, setActive: setActiveStep };

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
          <WaveGroup key={w.node_id} wave={w} nav={nav} />
        ))}
        {view.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} nav={nav} />
        ))}
        {view.hasUngroupedSteps && (
          <li>
            <ul className="space-y-px" role="list">
              {view.steps.map((s) => (
                <StepRow key={s.node_id} step={s} nav={nav} />
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
