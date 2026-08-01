// The plan summary card — a decoration under the reader's DocHeader for `plan`
// documents. It surfaces the plan's DERIVED metadata: the completion state, the
// completion percentage with a progress bar, the wave/phase/step counts, and the
// plan's IDENTITY row — the complexity tier (L1–L4), the feature group, and the plan
// date. Every value is ENGINE-SERVED — the counts from `PlanInterior.summary`
// (computed pre-truncation), the identity facets from the per-scope pipeline
// projection's artifact row (`tier` / `feature_tags` / `dates`) — and read through
// stores hooks; this card counts nothing and parses no stem
// (display-state-is-backend-served / dashboard-layer-ownership). It composes the
// centralized kit (Card / Badge / Chip / ProgressBar / StateBlock) on the binding
// token tier; no raw px, no hex.
//
// DEGRADED is a real state here (owner review): when the plan-interior read resolves
// degraded off its served `tiers` block, the card renders the shared caution + one
// sentence instead of a normal-looking card built on numbers it cannot vouch for.

import { useMemo, type ReactElement } from "react";

import {
  derivePlanSummaryView,
  usePlanIdentityView,
  usePlanInteriorView,
  type PlanStateTone,
} from "../../stores/server/queries";
import { featureTagDisplayName } from "../../stores/featureQuery";
import {
  Badge,
  Card,
  Chip,
  ProgressBar,
  Skeleton,
  SkeletonBar,
  StateBlock,
} from "../kit";
import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatDate } from "../../platform/localization/formatters";
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
  const locale = useActiveLocale();
  const interior = usePlanInteriorView(nodeId, scope);
  const identity = usePlanIdentityView(nodeId, scope);
  const summary = useMemo(
    () => derivePlanSummaryView(interior.summary),
    [interior.summary],
  );
  // The wire serves an ISO date; the reader sees it in the active locale's short
  // form. UTC so a plan stamped "2026-08-01" never reads as the day before.
  const dateLabel = useMemo(() => {
    if (identity.date === null) return null;
    const parsed = Date.parse(identity.date);
    if (!Number.isFinite(parsed)) return null;
    return formatDate(locale, parsed, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }, [identity.date, locale]);

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

  // DEGRADED — the interior read resolved with its `structural` tier unavailable, so
  // the counts and completion cannot be vouched for. Render the shared caution + ONE
  // sentence in the card's frame rather than a normal card whose numbers silently
  // describe nothing (degradation-is-read-from-tiers).
  if (interior.degraded) {
    return (
      <Card elevation="flat" className="mb-fg-2" data-plan-summary-degraded>
        <StateBlock
          mode="degraded"
          layout="inline"
          message={
            resolveMessage({
              key: "documents:localizationWave.plan.summaryUnavailable",
            }).message
          }
        />
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
      {/* The plan's IDENTITY row — served tier badge, feature chip(s), plan date.
          Each facet renders only when the wire carries it; an artifact row absent
          from the in-flight projection simply yields no row (honest omission, never
          a placeholder chip).

          Each facet names itself for a screen reader with `sr-only` lead-in text
          rather than an `aria-label` on the wrapper: the visible value IS the
          content, and an aria-label on a role-less span REPLACES it, so a reader
          would hear "Plan size" and never learn the plan is an L3. */}
      {(identity.tier !== null ||
        identity.featureTags.length > 0 ||
        dateLabel !== null) && (
        <div
          className="flex flex-wrap items-center gap-fg-1-5"
          data-plan-summary-identity
        >
          {identity.tier !== null && (
            <span data-plan-summary-tier>
              <span className="sr-only">
                {
                  resolveMessage({
                    key: "documents:localizationWave.plan.tierLabel",
                  }).message
                }{" "}
              </span>
              <Badge>{identity.tier}</Badge>
            </span>
          )}
          {identity.featureTags.map((tag) => (
            <span key={tag} data-plan-summary-feature>
              <span className="sr-only">
                {
                  resolveMessage({
                    key: "documents:localizationWave.plan.featureLabel",
                  }).message
                }{" "}
              </span>
              <Chip category="feature">{featureTagDisplayName(tag)}</Chip>
            </span>
          ))}
          {dateLabel !== null && (
            <span
              className="text-meta tabular-nums text-ink-faint"
              data-plan-summary-date
            >
              <span className="sr-only">
                {
                  resolveMessage({
                    key: "documents:localizationWave.plan.dateLabel",
                  }).message
                }{" "}
              </span>
              {dateLabel}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
