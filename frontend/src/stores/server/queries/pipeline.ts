// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { normalizeNodeId } from "../../nodeIds";
import {
  createCountMessageDescriptor,
  type AnyMessageDescriptor,
  type MessageDescriptor,
} from "../../../platform/localization/message";
import { authoredDisplayText } from "../../../platform/localization/displayText";
import {
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type InteriorStep,
  type PipelineArtifact,
  type PlanInterior,
  type PlanSummary,
  type TierAvailability,
  type TiersBlock,
} from "../engine";
import { useQuery } from "@tanstack/react-query";
import {
  isAddressableNode,
  normalizeGraphSliceAsOf,
  normalizeGraphSliceScope,
  normalizeNodeScopedScope,
} from "./graph";
import { engineKeys } from "./internal";
import { WORK_PILLAR_TIER } from "./status";

// --- in-flight pipeline status (dashboard-pipeline-status ADR) -------------------------
//
// The Work surface's content data: the in-flight pipeline projection (active plans +
// in-flight ADRs) and a plan's bounded wave/phase/step interior. The surface is app
// chrome under dashboard-layer-ownership: it consumes these stores hooks + the
// tiers-reading view selectors ONLY, never fetching the engine and never inspecting the
// raw `tiers` block. Degradation is read from the served tiers block (success data OR a
// FRESH error envelope's tiers winning over a stale held-success block), per
// degradation-is-read-from-tiers-not-guessed-from-errors — never guessed from a bare
// transport error. The surface is a projection over the one model
// (views-are-projections-of-one-model); the bounded interior + honest truncation honor
// graph-queries-are-bounded-by-default.
//
// STAGED CAPABILITY (dashboard-pipeline-status ADR "Constraints"): the honest full
// surface is gated on the sibling `dashboard-pipeline-wire`. These constants signal
// which wire capabilities are served so the surface renders a designed per-capability
// placeholder rather than a broken control when a capability is not yet live (mirroring
// the `CHANGED_FILES_LIST_SERVED` constant). The wire is shipped, so all three are true
// today; flipping one false degrades exactly that part of the surface to its placeholder.

/** The in-flight pipeline projection (`GET /pipeline`) is served by the engine. */
export const PIPELINE_STATUS_SERVED = true;
/** The bounded plan-container interior (`/nodes/{id}/plan-interior`) is served. */
export const PLAN_INTERIOR_SERVED = true;
/** Real ADR frontmatter status is served as a doc-node facet. */
export const ADR_STATUS_SERVED = true;

export interface PipelineStatusRequestIdentity {
  scope: string | null;
  asOf: string | number | undefined;
}

export interface PlanInteriorRequestIdentity {
  scope: string | null;
  planId: string | null;
}

export function normalizePipelineStatusRequestIdentity(
  scope: unknown,
  asOf?: unknown,
): PipelineStatusRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    asOf: normalizeGraphSliceAsOf(asOf),
  };
}

export function normalizePlanInteriorRequestIdentity(
  planId: unknown,
  scope: unknown,
): PlanInteriorRequestIdentity {
  const nodeId = normalizeNodeId(planId);
  return {
    scope: normalizeNodeScopedScope(scope),
    planId: isAddressableNode(nodeId) ? nodeId : null,
  };
}

/**
 * The in-flight pipeline projection for the active scope (W01.P02.S06). Disabled when
 * scope is null (no worktree resolved yet), following the `useGraphSlice` pattern. The
 * `asOf` playhead folds into the cache key so a historical view reads a distinct entry
 * (W03.P08.S36 / dashboard-timeline ADR). The live wire's `pipeline(scope)` takes no
 * as-of yet, so a past playhead reuses the live projection until the wire grows the
 * parameter — the surface still degrades honestly via the served tiers block.
 */
export function usePipelineStatus(scope: unknown, asOf?: unknown) {
  const request = normalizePipelineStatusRequestIdentity(scope, asOf);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.pipeline(request.scope ?? "", request.asOf),
    queryFn: () => engineClient.pipeline(request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * A plan node's bounded wave/phase/step interior (W01.P02.S07). Disabled until a plan
 * row is expanded (`planId === null` means collapsed), following the `useNodeNeighbors`
 * enabled-on-id pattern so the interior is fetched lazily, never for every row.
 */
export function usePlanInterior(planId: unknown, scope: unknown) {
  const request = normalizePlanInteriorRequestIdentity(planId, scope);
  const enabled = request.scope !== null && request.planId !== null;
  const query = useQuery({
    queryKey: engineKeys.planInterior(request.scope ?? "", request.planId ?? ""),
    queryFn: () => engineClient.planInterior(request.planId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * The interpreted pipeline-status view the Work surface renders (W01.P02.S08). Modeled on
 * `deriveGraphSliceAvailability`: `loading` is the query's in-flight state, `degraded` is
 * read from the served `tiers` block (the `structural` tier the pipeline projection
 * resolves through), and `artifacts` is the in-flight list. The surface consumes this,
 * never `pipeline.data.tiers`.
 */
export interface PipelineStatusView extends TierAvailability {
  /** The pipeline query is in flight with no held data. */
  loading: boolean;
  /** Work tab's rendered state token for the root data attribute. */
  workSurfaceState: "degraded" | "loading" | "empty" | "list";
  /** Whether Work tab should render the designed degraded status state. */
  showWorkDegraded: boolean;
  /** Whether Work tab should render the loading status state. */
  showWorkLoading: boolean;
  /** Whether Work tab should render the designed empty status state. */
  showWorkEmpty: boolean;
  /** Whether Work tab should render the in-flight list. */
  showWorkList: boolean;
  /** The in-flight artifacts (active plans + in-flight ADRs); empty while degraded. */
  artifacts: PipelineArtifact[];
  /** Plan artifacts, split once in the stores layer for right-rail work surfaces. */
  plans: PipelineArtifact[];
  /** Plan rows with Status-tab presentation labels pre-derived from the artifact. */
  planRows: PipelinePlanRowView[];
  /** ADR artifacts, split once in the stores layer for right-rail work surfaces. */
  adrs: PipelineArtifact[];
  /** ADR rows with Work-tab presentation labels pre-derived from the artifact. */
  adrRows: PipelineAdrRowView[];
  /** Plan node ids for expansion-store enrollment. */
  planIds: string[];
  /** Occupied pipeline phases for the compact pipeline arc. */
  occupiedPhases: ReadonlySet<string>;
  /** Count of renderable in-flight artifacts. */
  count: number;
  /** Polite live-region text for the pipeline surface state. */
  liveMessage: string;
  /** Full Work tab status heading for degraded/loading/empty states. */
  workStatusTitle: string;
  /** Full Work tab status detail for degraded/empty states. */
  workStatusDetail: string;
  /** Compact Status tab open-plans status label for degraded/loading/empty states. */
  openPlansStatusLabel: AnyMessageDescriptor;
  /** Work tab section accessible label. */
  workSurfaceAriaLabel: string;
  /** Work tab status-state section class. */
  workStatusSectionClassName: string;
  /** Work tab list-state section class. */
  workListSectionClassName: string;
  /** Work tab live-region class. */
  workLiveRegionClassName: string;
  /** Work tab status-state icon wrapper class. */
  workStatusIconClassName: string;
  /** Work tab status title class. */
  workStatusTitleClassName: string;
  /** Work tab status detail class. */
  workStatusDetailClassName: string;
  /** Work tab in-flight list accessible label. */
  workListAriaLabel: string;
  /** Work tab in-flight list class. */
  workListClassName: string;
  /** Work tab's single roving Tab stop when a plan row is first. */
  workTabbablePlanId: string | null;
  /** Work tab's single roving Tab stop when no plan row is present. */
  workTabbableAdrId: string | null;
}

export interface PipelinePlanRowView {
  artifact: PipelineArtifact;
  nodeId: string;
  titleLabel: string;
  modifiedAt: string | undefined;
  phaseLabel: string;
  tierLabel: string | null;
  tierAriaLabel: MessageDescriptor | null;
  openAriaLabel: MessageDescriptor;
  selectAriaLabel: string;
  showProgress: boolean;
  progressDone: number;
  progressTotal: number;
  progressTextLabel: string;
  progressLabel: MessageDescriptor;
  progressPercentLabel: string | null;
  toggleLabel: (expanded: boolean) => MessageDescriptor;
}

export interface PipelineAdrRowView {
  artifact: PipelineArtifact;
  nodeId: string;
  titleLabel: string;
  modifiedAt: string | undefined;
  selectAriaLabel: string;
  statusLabel: string | null;
  featureLabel: string | null;
  showStatusPlaceholder: boolean;
  statusPlaceholderLabel: string;
  rowClassName: string;
  iconClassName: string;
  bodyClassName: string;
  headingClassName: string;
  titleClassName: string;
  statusPlaceholderClassName: string;
  metaClassName: string;
}

// The pipeline projection is resolved by the engine's STRUCTURAL read of the vault
// corpus, so the `structural` tier gates availability (contract §2).
const PIPELINE_STATUS_TIERS = ["structural"] as const;
const WORK_STATUS_SECTION_CLASS =
  "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted";
const WORK_LOADING_SECTION_CLASS =
  "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint";
const WORK_LIST_SECTION_CLASS = "space-y-fg-2 text-body";
const WORK_LIVE_REGION_CLASS = "sr-only";
const WORK_STATUS_ICON_CLASS = "text-ink-faint";
const WORK_STATUS_TITLE_CLASS = "font-medium text-ink";
const WORK_LOADING_TITLE_CLASS = "animate-pulse-live";
const WORK_STATUS_DETAIL_CLASS = "text-ink-faint";
const WORK_LIST_CLASS = "space-y-fg-1";
const WORK_ADR_ROW_CLASS =
  "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORK_ADR_ICON_CLASS = "shrink-0 text-ink-faint";
const WORK_ADR_BODY_CLASS = "min-w-0 flex-1";
const WORK_ADR_HEADING_CLASS = "flex items-center gap-fg-1-5";
const WORK_ADR_TITLE_CLASS = "min-w-0 truncate text-body text-ink";
const WORK_ADR_STATUS_PLACEHOLDER_CLASS =
  "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint";
const WORK_ADR_META_CLASS =
  "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint";

function pipelineArtifactTitleLabel(artifact: PipelineArtifact): string {
  return (artifact.title ?? artifact.stem).replace(/`/g, "");
}

function pipelinePlanRowView(artifact: PipelineArtifact): PipelinePlanRowView {
  const titleLabel = pipelineArtifactTitleLabel(artifact);
  const title = authoredDisplayText(titleLabel);
  const done = artifact.progress?.done ?? 0;
  const total = artifact.progress?.total ?? 0;
  const tierLabel = artifact.tier ?? null;
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : null;
  return {
    artifact,
    nodeId: artifact.node_id,
    titleLabel,
    modifiedAt: artifact.dates?.modified,
    phaseLabel: artifact.phase,
    tierLabel,
    tierAriaLabel:
      tierLabel === null
        ? null
        : { key: "common:finalWave.pipeline.tier", values: { level: tierLabel } },
    openAriaLabel: { key: "common:finalWave.pipeline.openPlan", values: { title } },
    selectAriaLabel: `select plan ${titleLabel} on the stage`,
    showProgress: total > 0,
    progressDone: done,
    progressTotal: total,
    progressTextLabel: `${done}/${total}`,
    progressLabel: {
      key: "common:finalWave.pipeline.planCompletion",
      values: { title },
    },
    progressPercentLabel: progressPercent === null ? null : `${progressPercent}%`,
    toggleLabel: (expanded) => ({
      key: expanded
        ? "common:finalWave.pipeline.collapseSteps"
        : "common:finalWave.pipeline.expandSteps",
      values: { title },
    }),
  };
}

function pipelineAdrRowView(artifact: PipelineArtifact): PipelineAdrRowView {
  const titleLabel = pipelineArtifactTitleLabel(artifact);
  const statusLabel = artifact.status ?? null;
  return {
    artifact,
    nodeId: artifact.node_id,
    titleLabel,
    modifiedAt: artifact.dates?.modified,
    selectAriaLabel: `ADR ${titleLabel}${statusLabel ? `, status ${statusLabel}` : ""}`,
    statusLabel,
    featureLabel: artifact.feature_tags?.[0] ?? null,
    showStatusPlaceholder: statusLabel === null && !ADR_STATUS_SERVED,
    statusPlaceholderLabel: "status pending",
    rowClassName: WORK_ADR_ROW_CLASS,
    iconClassName: WORK_ADR_ICON_CLASS,
    bodyClassName: WORK_ADR_BODY_CLASS,
    headingClassName: WORK_ADR_HEADING_CLASS,
    titleClassName: WORK_ADR_TITLE_CLASS,
    statusPlaceholderClassName: WORK_ADR_STATUS_PLACEHOLDER_CLASS,
    metaClassName: WORK_ADR_META_CLASS,
  };
}

/**
 * Derive the pipeline-status view from a pipeline query's data + error + pending flags,
 * reading the served tiers block ONLY here in the stores layer. A served block (success
 * data OR a tiers-bearing error envelope) that marks `structural` unavailable — or omits
 * it — is designed degradation (contract §2: absence ≠ available). A wholly absent block
 * (a tiers-less transport fault) is NOT degradation — that is the query's error state,
 * and the surface must not guess "down" from a bare transport error
 * (degradation-is-read-from-tiers-not-guessed-from-errors). The FRESH error envelope's
 * tiers win over a stale held-success block (the `errTiers ?? dataTiers` order at the
 * call site), so a backend that just went down surfaces as degradation immediately.
 */
export function derivePipelineStatusView(
  tiers: TiersBlock | undefined,
  artifacts: PipelineArtifact[],
  loading: boolean,
): PipelineStatusView {
  const availability = readTierAvailability(tiers, PIPELINE_STATUS_TIERS);
  const trustedArtifacts = availability.degraded ? [] : artifacts;
  const plans = trustedArtifacts.filter((artifact) => artifact.doc_type === "plan");
  const planRows = plans.map(pipelinePlanRowView);
  const adrs = trustedArtifacts.filter((artifact) => artifact.doc_type === "adr");
  const adrRows = adrs.map(pipelineAdrRowView);
  const workTabbablePlanId = planRows[0]?.nodeId ?? null;
  const workTabbableAdrId =
    workTabbablePlanId === null ? (adrRows[0]?.nodeId ?? null) : null;
  const count = trustedArtifacts.length;
  const showWorkDegraded = availability.degraded;
  const showWorkLoading = !showWorkDegraded && loading;
  const showWorkEmpty = !showWorkDegraded && !showWorkLoading && count === 0;
  const showWorkList = !showWorkDegraded && !showWorkLoading && count > 0;
  const workSurfaceState = showWorkDegraded
    ? "degraded"
    : showWorkLoading
      ? "loading"
      : showWorkEmpty
        ? "empty"
        : "list";
  const degradedReason = availability.reasons[WORK_PILLAR_TIER];
  const liveMessage = availability.degraded
    ? "pipeline status unavailable"
    : loading
      ? "loading in-flight work"
      : count === 0
        ? "no in-flight work"
        : `${count} in-flight item${count === 1 ? "" : "s"}`;
  const workStatusTitle = availability.degraded
    ? "pipeline status unavailable"
    : loading
      ? "reading in-flight work…"
      : count === 0
        ? "no work in flight on this branch"
        : liveMessage;
  const workStatusDetail = availability.degraded
    ? degradedReason
      ? `the pipeline read is degraded — ${degradedReason}`
      : "the pipeline read is degraded; in-flight work will appear here once it recovers"
    : loading
      ? ""
      : count === 0
        ? "no in-flight pipeline work in the current scope; active ADRs and plans will appear here as they advance."
        : "";
  const openPlansStatusLabel: AnyMessageDescriptor = availability.degraded
    ? { key: "common:finalWave.pipeline.statusUnavailable" }
    : loading
      ? { key: "common:finalWave.pipeline.statusLoading" }
      : plans.length === 0
        ? { key: "common:finalWave.pipeline.statusEmpty" }
        : createCountMessageDescriptor(
            "common:finalWave.pipeline.statusCount",
            plans.length,
          )!;
  return {
    loading,
    workSurfaceState,
    showWorkDegraded,
    showWorkLoading,
    showWorkEmpty,
    showWorkList,
    ...availability,
    // While degraded the projection cannot be trusted, so do not render a stale list as
    // current in-flight work; the surface shows the degraded notice instead.
    artifacts: trustedArtifacts,
    plans,
    planRows,
    adrs,
    adrRows,
    planIds: plans.map((plan) => plan.node_id),
    occupiedPhases: new Set(
      trustedArtifacts.map((artifact) => artifact.phase as string),
    ),
    count,
    liveMessage,
    workStatusTitle,
    workStatusDetail,
    openPlansStatusLabel,
    workSurfaceAriaLabel: "work pipeline status",
    workStatusSectionClassName: showWorkLoading
      ? WORK_LOADING_SECTION_CLASS
      : WORK_STATUS_SECTION_CLASS,
    workListSectionClassName: WORK_LIST_SECTION_CLASS,
    workLiveRegionClassName: WORK_LIVE_REGION_CLASS,
    workStatusIconClassName: WORK_STATUS_ICON_CLASS,
    workStatusTitleClassName: showWorkLoading
      ? WORK_LOADING_TITLE_CLASS
      : WORK_STATUS_TITLE_CLASS,
    workStatusDetailClassName: WORK_STATUS_DETAIL_CLASS,
    workListAriaLabel: "in-flight pipeline work",
    workListClassName: WORK_LIST_CLASS,
    workTabbablePlanId,
    workTabbableAdrId,
  };
}

/**
 * Stores hook: the interpreted pipeline-status view for a scope + playhead (W01.P02.S09).
 * Reads tiers from the success envelope, then the `EngineError` envelope (the FRESH error
 * winning over a stale held block), so the Work surface consumes interpreted truth and
 * never the raw tiers block. The active as-of playhead threads through so the surface
 * reflects the historical pipeline under a past playhead (W03.P08.S36).
 */
export function usePipelineStatusView(
  scope: unknown,
  asOf?: unknown,
): PipelineStatusView {
  const request = normalizePipelineStatusRequestIdentity(scope, asOf);
  const query = usePipelineStatus(request.scope, request.asOf);
  return derivePipelineStatusView(
    tiersFromQuery(query),
    query.data?.artifacts ?? [],
    request.scope !== null && query.isPending,
  );
}

/**
 * The interpreted plan-interior view the expandable step tree renders (W01.P02.S11):
 * the ordered wave→phase→step tree with per-container rolled-up completion, the honest
 * bounded-interior truncation block, and the loading flag. The surface consumes this,
 * never the raw interior response.
 */
export interface InteriorRollup {
  done: number;
  total: number;
}

export interface InteriorStepView extends InteriorStep {
  targetNodeId: string | null;
  selectable: boolean;
  headingLabel: MessageDescriptor;
  rowAriaLabel: MessageDescriptor;
  rowClassName: string;
}

export interface InteriorPhaseView {
  node_id: string;
  id: string;
  heading?: string;
  steps: InteriorStepView[];
  rollup: InteriorRollup;
}

export interface InteriorWaveView {
  node_id: string;
  id: string;
  heading?: string;
  phases: InteriorPhaseView[];
  rollup: InteriorRollup;
}

export interface PlanInteriorView {
  /** The interior query is in flight with no held data (the expanded row is loading). */
  loading: boolean;
  /** Whether the plan-interior capability is served by the backend. */
  served: boolean;
  /** Whether the served interior carries no visible containers or steps. */
  empty: boolean;
  /** The ordered waves (L3/L4 shape); empty for L1/L2 plans. */
  waves: InteriorWaveView[];
  /** The ordered phases (L2 shape); empty for L1 and L3/L4 plans. */
  phases: InteriorPhaseView[];
  /** The flat steps (L1 shape); empty for L2/L3/L4 plans. */
  steps: InteriorStepView[];
  /** Whether the flat L1 step bucket should be rendered. */
  hasUngroupedSteps: boolean;
  /** The plan-level rolled-up completion (from the engine summary, truncation-honest). */
  rollup: InteriorRollup;
  /** The engine-served structural summary (counts + completion state), pre-truncation. */
  summary: PlanSummary;
  /** Honest bounded-interior truncation when the engine capped the tree; null otherwise. */
  truncated: PlanInterior["truncated"];
  loadingMessage: MessageDescriptor;
  placeholderMessage: MessageDescriptor;
  emptyMessage: MessageDescriptor;
  listAriaLabel: MessageDescriptor;
  truncatedMessage: MessageDescriptor | null;
}

// Stable descriptor references for the plan-interior tree's static state copy — one
// instance each so a consumer memoizing on these fields does not see a fresh identity
// every render.
const PLAN_INTERIOR_LOADING_MESSAGE: MessageDescriptor = {
  key: "common:finalWave.planInterior.loading",
};
const PLAN_INTERIOR_PLACEHOLDER_MESSAGE: MessageDescriptor = {
  key: "common:finalWave.planInterior.notServed",
};
const PLAN_INTERIOR_EMPTY_MESSAGE: MessageDescriptor = {
  key: "common:finalWave.planInterior.empty",
};
const PLAN_INTERIOR_LIST_ARIA_LABEL: MessageDescriptor = {
  key: "common:finalWave.planInterior.list",
};

/** The inert zero summary for a collapsed/unserved interior — a stable reference
 *  so a consumer memoizing on `view.summary` does not recompute every render. */
const EMPTY_PLAN_SUMMARY: PlanSummary = {
  wave_count: 0,
  phase_count: 0,
  step_count: 0,
  done_count: 0,
  plan_state: null,
};

function interiorStepView(step: InteriorStep): InteriorStepView {
  const targetNodeId = step.exec_node_id ?? null;
  const headingLabel: MessageDescriptor = step.action
    ? {
        key: "common:finalWave.planSteps.named",
        values: { step: authoredDisplayText(step.action) },
      }
    : { key: "common:finalWave.planSteps.generic" };
  return {
    ...step,
    targetNodeId,
    selectable: targetNodeId !== null,
    headingLabel,
    rowAriaLabel: step.action
      ? {
          key: targetNodeId
            ? "common:finalWave.planSteps.openRecord"
            : "common:finalWave.planSteps.recordUnavailable",
          values: { step: authoredDisplayText(step.action) },
        }
      : {
          key: targetNodeId
            ? "common:finalWave.planSteps.openGenericRecord"
            : "common:finalWave.planSteps.genericRecordUnavailable",
        },
    rowClassName: `flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
      targetNodeId ? "hover:bg-paper-sunken" : "cursor-default opacity-80"
    }`,
  };
}

/**
 * Derive the plan-interior view (W01.P02.S11): the per-container rollups and the
 * plan-level completion are READ FROM THE ENGINE (computed pre-truncation), never
 * re-counted client-side over a possibly-truncated tree
 * (`display-state-is-backend-served-not-frontend-derived`). The truncated honesty
 * block surfaces as a designed state (graph-queries-are-bounded-by-default). The
 * tier-honest shape passes through: an L1 plan carries flat `steps`, an L2 plan
 * `phases`, an L3/L4 plan `waves` — exactly as the wire serves it.
 */
export function derivePlanInteriorView(
  interior: PlanInterior | undefined,
  loading: boolean,
): PlanInteriorView {
  if (!interior) {
    return {
      loading,
      served: PLAN_INTERIOR_SERVED,
      empty: true,
      waves: [],
      phases: [],
      steps: [],
      hasUngroupedSteps: false,
      rollup: { done: 0, total: 0 },
      summary: EMPTY_PLAN_SUMMARY,
      truncated: null,
      loadingMessage: PLAN_INTERIOR_LOADING_MESSAGE,
      placeholderMessage: PLAN_INTERIOR_PLACEHOLDER_MESSAGE,
      emptyMessage: PLAN_INTERIOR_EMPTY_MESSAGE,
      listAriaLabel: PLAN_INTERIOR_LIST_ARIA_LABEL,
      truncatedMessage: null,
    };
  }
  // Per-container rollups are served by the engine (computed over the full step
  // subtree pre-truncation) — pass them through, never re-count the served slice.
  const phases: InteriorPhaseView[] = interior.phases.map((p) => ({
    ...p,
    steps: p.steps.map(interiorStepView),
    rollup: p.rollup,
  }));
  const waves: InteriorWaveView[] = interior.waves.map((w) => ({
    ...w,
    phases: w.phases.map((p) => ({
      ...p,
      steps: p.steps.map(interiorStepView),
      rollup: p.rollup,
    })),
    rollup: w.rollup,
  }));
  const steps: InteriorStepView[] = interior.steps.map(interiorStepView);
  // Plan-level rollup comes from the engine summary (truncation-honest totals).
  const planRollup: InteriorRollup = {
    done: interior.summary.done_count,
    total: interior.summary.step_count,
  };
  const truncated = interior.truncated ?? null;
  return {
    loading,
    served: PLAN_INTERIOR_SERVED,
    empty: waves.length === 0 && phases.length === 0 && steps.length === 0,
    waves,
    phases,
    steps,
    hasUngroupedSteps: steps.length > 0,
    rollup: planRollup,
    summary: interior.summary,
    truncated,
    loadingMessage: PLAN_INTERIOR_LOADING_MESSAGE,
    placeholderMessage: PLAN_INTERIOR_PLACEHOLDER_MESSAGE,
    emptyMessage: PLAN_INTERIOR_EMPTY_MESSAGE,
    listAriaLabel: PLAN_INTERIOR_LIST_ARIA_LABEL,
    truncatedMessage: truncated
      ? {
          key: "common:finalWave.planInterior.truncated",
          values: {
            returned: truncated.returned_nodes,
            total: truncated.total_nodes,
          },
        }
      : null,
  };
}

/**
 * Stores hook: the interpreted plan-interior view for an expanded plan node
 * (W01.P02.S11). `planId === null` means the row is collapsed: the query is disabled and
 * the view is the inert empty state. The Work step tree renders rolled-up completion and
 * honest truncation directly from this, never the raw interior response.
 */
export function usePlanInteriorView(planId: unknown, scope: unknown): PlanInteriorView {
  const request = normalizePlanInteriorRequestIdentity(planId, scope);
  const query = usePlanInterior(request.planId, request.scope);
  return derivePlanInteriorView(
    query.data?.interior,
    request.planId !== null && query.isPending,
  );
}

/** The completion tone of a plan, for the summary card's state badge + bar. The
 *  classification stays engine-served (`plan_state`); this is presentation only. */
export type PlanStateTone = "pending" | "active" | "complete";

/** The interpreted plan-summary view the reader's plan card renders: the
 *  user-facing state label + tone, the completion percentage, and the wave/phase/
 *  step counts — all from the engine `PlanSummary` (no client re-counting). */
export interface PlanSummaryView {
  /** Whether the plan carries any steps (the card hides its bar/% when false). */
  hasStructure: boolean;
  /** User-facing state label (`ui-labels-are-user-facing`). */
  stateLabel: MessageDescriptor;
  /** Presentation tone for the badge/bar, mapped from the served `plan_state`. */
  tone: PlanStateTone;
  /** Completion percentage over served counts; null when the plan has no steps. */
  percent: number | null;
  /** `"48%"` readout, or null when there is no step progress to show. */
  percentLabel: string | null;
  waveCount: number;
  phaseCount: number;
  stepCount: number;
  doneCount: number;
}

const PLAN_STATE_PRESENTATION: Record<
  string,
  { label: MessageDescriptor; tone: PlanStateTone }
> = {
  "not-started": {
    label: { key: "common:finalWave.planStates.notStarted" },
    tone: "pending",
  },
  "in-progress": {
    label: { key: "common:finalWave.planStates.inProgress" },
    tone: "active",
  },
  finished: {
    label: { key: "common:finalWave.planStates.finished" },
    tone: "complete",
  },
};

/**
 * Map the engine `PlanSummary` to the reader card's presentation. The completion
 * CLASS is engine-served (`plan_state`); this only chooses a user-facing label, a
 * tone, and the display percentage (presentation math over served counts, mirroring
 * `pipelineRowView`'s `progressPercent`). A plan with no steps falls back to the
 * "Not started" presentation with no percentage.
 */
export function derivePlanSummaryView(summary: PlanSummary): PlanSummaryView {
  const stepCount = summary.step_count;
  const doneCount = summary.done_count;
  const hasStructure = stepCount > 0;
  const percent = hasStructure ? Math.round((doneCount / stepCount) * 100) : null;
  const presentation =
    (summary.plan_state ? PLAN_STATE_PRESENTATION[summary.plan_state] : undefined) ??
    PLAN_STATE_PRESENTATION["not-started"];
  return {
    hasStructure,
    stateLabel: presentation.label,
    tone: presentation.tone,
    percent,
    percentLabel: percent === null ? null : `${percent}%`,
    waveCount: summary.wave_count,
    phaseCount: summary.phase_count,
    stepCount,
    doneCount,
  };
}
