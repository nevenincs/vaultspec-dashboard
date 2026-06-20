// Shared plan-interior renderer for right-rail surfaces.
//
// Work and Status both show the same lazily-loaded plan step tree. This module
// owns that presentation so one feature surface does not become another surface's
// component library.

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

const GATE_PX = 14;
const SMALL_PX = 13;

interface StepCheckMarkProps {
  done: boolean;
}

function StepCheckMark({ done }: StepCheckMarkProps) {
  return (
    <span
      role="img"
      aria-label={done ? "complete" : "open"}
      data-step-check
      data-done={done}
      className={`inline-flex shrink-0 items-center justify-center ${
        done ? "text-state-complete" : "text-ink-faint"
      }`}
    >
      <svg width={GATE_PX} height={GATE_PX} viewBox="0 0 14 14" aria-hidden>
        <circle
          cx={7}
          cy={7}
          r={5.5}
          // Filled disc vs hollow ring is the grayscale-by-shape identity.
          fill={done ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={done ? 0 : 1.4}
        />
        {done && (
          <path
            d="M4.3 7.2 6.1 9 9.7 5"
            fill="none"
            stroke="var(--color-paper-raised)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

function RollupFraction({ rollup }: { rollup: InteriorRollup }) {
  return (
    <span className="shrink-0 text-caption text-ink-faint" data-tabular data-rollup>
      {rollup.done}/{rollup.total}
    </span>
  );
}

interface StepRowProps {
  step: InteriorStepView;
}

function StepRow({ step }: StepRowProps) {
  const selectDashboardNode = useDashboardNodeSelection(useActiveScope());
  return (
    <li>
      <button
        type="button"
        data-work-row="step"
        disabled={!step.selectable}
        tabIndex={-1}
        onClick={() => {
          if (step.targetNodeId) {
            void selectDashboardNode(step.targetNodeId).catch(() => undefined);
          }
        }}
        aria-label={step.rowAriaLabel}
        className={step.rowClassName}
      >
        <StepCheckMark done={step.done} />
        <span className="shrink-0 font-mono text-caption text-ink-faint" data-tabular>
          {step.id}
        </span>
        <span className="min-w-0 truncate text-ink-muted">{step.headingLabel}</span>
      </button>
    </li>
  );
}

function PhaseGroup({ phase }: { phase: InteriorPhaseView }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption text-ink-faint">
        <span className="font-mono">{phase.id}</span>
        {phase.heading && <span className="min-w-0 truncate">{phase.heading}</span>}
        <RollupFraction rollup={phase.rollup} />
      </p>
      <ul className="space-y-px pl-fg-2" role="list">
        {phase.steps.map((s) => (
          <StepRow key={s.node_id} step={s} />
        ))}
      </ul>
    </li>
  );
}

function WaveGroup({ wave }: { wave: InteriorWaveView }) {
  return (
    <li className="space-y-fg-0-5">
      <p className="flex items-center gap-fg-1-5 px-fg-1 text-caption font-medium text-ink-muted">
        <span className="font-mono">{wave.id}</span>
        {wave.heading && <span className="min-w-0 truncate">{wave.heading}</span>}
        <RollupFraction rollup={wave.rollup} />
      </p>
      <ul className="space-y-fg-1 pl-fg-2" role="list">
        {wave.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} />
        ))}
      </ul>
    </li>
  );
}

export function PlanStepTree({ view }: { view: PlanInteriorView }) {
  if (view.loading) {
    return (
      <p
        className="animate-pulse-live px-fg-2 py-fg-1 text-label text-ink-faint"
        data-step-tree-loading
        role="status"
      >
        {view.loadingMessage}
      </p>
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
          <WaveGroup key={w.node_id} wave={w} />
        ))}
        {view.phases.map((p) => (
          <PhaseGroup key={p.node_id} phase={p} />
        ))}
        {view.hasUngroupedSteps && (
          <li>
            <ul className="space-y-px" role="list">
              {view.steps.map((s) => (
                <StepRow key={s.node_id} step={s} />
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
