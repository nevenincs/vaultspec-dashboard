// The plan summary card — a decoration under the reader's DocHeader for `plan`
// documents. It surfaces the plan's DERIVED metadata: the completion state, the
// completion percentage with a progress bar, and the wave/phase/step counts. Every
// value is ENGINE-SERVED (the `PlanInterior.summary`, computed pre-truncation) and
// read through the stores plan-interior hook — this card counts nothing itself
// (display-state-is-backend-served / dashboard-layer-ownership). It composes the
// centralized kit (Card / ProgressBar) on the binding token tier; no raw px, no hex.

import { useMemo, type ReactElement } from "react";

import {
  derivePlanSummaryView,
  usePlanInteriorView,
  type PlanStateTone,
} from "../../stores/server/queries";
import { Card, ProgressBar, Skeleton, SkeletonBar } from "../kit";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { createCountMessageDescriptor } from "../../platform/localization/message";

/** The state-tone → ink-token class for the state dot + label. The completion
 *  CLASS stays engine-served; this only chooses presentation. */
const TONE_TEXT_CLASS: Record<PlanStateTone, string> = {
  pending: "text-ink-muted",
  active: "text-state-active",
  complete: "text-state-complete",
};

/** Build the "3 waves · 8 phases · 21 steps" count line, omitting any zero level
 *  (an L1 plan shows just steps; an L2 plan phases + steps). */
export function PlanSummaryCard({
  nodeId,
  scope,
}: {
  nodeId: string;
  scope: string | null;
}): ReactElement | null {
  const resolveMessage = useLocalizedMessageResolver();
  const interior = usePlanInteriorView(nodeId, scope);
  const summary = useMemo(
    () => derivePlanSummaryView(interior.summary),
    [interior.summary],
  );

  // Loading is UI-only (state-mode-uniformity ADR D2): a shimmer standing in for
  // the card's rhythm, the human label only in the kit Skeleton's sr-only.
  if (interior.loading) {
    return (
      <Card elevation="flat" className="mb-fg-2 flex flex-col gap-fg-2">
        <Skeleton
          label={
            resolveMessage({
              key: "documents:localizationWave.plan.loadingSummary",
            }).message
          }
          className="gap-fg-2"
        >
          <SkeletonBar width="w-1/3" height="h-3" />
          <SkeletonBar width="w-full" height="h-2" />
          <SkeletonBar width="w-2/5" height="h-2" />
        </Skeleton>
      </Card>
    );
  }

  // Honest absence: a plan with no served structure shows no card (never a fake
  // 0% bar). The interior may legitimately be unserved or empty.
  const hasAnyStructure =
    summary.stepCount > 0 || summary.waveCount > 0 || summary.phaseCount > 0;
  if (!interior.served || !hasAnyStructure) return null;

  const counts = [
    summary.waveCount > 0
      ? resolveMessage(
          createCountMessageDescriptor(
            "documents:localizationWave.plan.waveCount",
            summary.waveCount,
          )!,
        ).message
      : null,
    summary.phaseCount > 0
      ? resolveMessage(
          createCountMessageDescriptor(
            "documents:localizationWave.plan.phaseCount",
            summary.phaseCount,
          )!,
        ).message
      : null,
    summary.stepCount > 0
      ? resolveMessage(
          createCountMessageDescriptor(
            "documents:localizationWave.plan.stepCount",
            summary.stepCount,
          )!,
        ).message
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <Card
      elevation="flat"
      className="mb-fg-2 flex flex-col gap-fg-2"
      aria-label={
        resolveMessage({
          key: "documents:localizationWave.accessibility.planSummary",
        }).message
      }
    >
      <div className="flex items-center justify-between gap-fg-3">
        <span
          className={`inline-flex items-center gap-fg-1-5 text-body-strong ${
            TONE_TEXT_CLASS[summary.tone]
          }`}
        >
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full bg-current"
          />
          {resolveMessage(summary.stateLabel).message}
        </span>
        {summary.percentLabel !== null && (
          <span className="shrink-0 tabular-nums text-body-strong text-ink">
            {summary.percentLabel}
          </span>
        )}
      </div>
      {summary.hasStructure && (
        <ProgressBar
          value={summary.doneCount}
          max={summary.stepCount}
          label={
            resolveMessage(
              createCountMessageDescriptor(
                "documents:localizationWave.plan.completion",
                summary.stepCount,
                { done: summary.doneCount },
              )!,
            ).message
          }
        />
      )}
      {counts.length > 0 && (
        <p className="text-meta tabular-nums text-ink-muted">{counts.join(" · ")}</p>
      )}
    </Card>
  );
}
