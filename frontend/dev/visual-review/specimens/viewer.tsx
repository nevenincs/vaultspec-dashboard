// Specimens: `viewer` area.
//
// `MarkdownReader` and `CodeViewer` are wire-free views taking a resolved
// `ContentView` — authored directly. `PlanSummaryCard` is a container over the
// plan-interior query, so its cell seeds that query at the real key.

import { engineKeys } from "@app/stores/server/queries";
import type { PipelineResponse, PlanInteriorResponse } from "@app/stores/server/engine";
import { CodeViewer } from "@app/app/viewer/CodeViewer";
import { MarkdownReader } from "@app/app/viewer/MarkdownReader";
import { PlanSummaryCard } from "@app/app/viewer/PlanSummaryCard";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import { REVIEW_SCOPE, contentView, tiersDown, tiersHealthy } from "./support";

const PLAN_NODE_ID = "plan:alpha";

function planInterior(state: ReviewState): PlanInteriorResponse {
  const structured = state === "normal" || state === "degraded";
  const steps = structured
    ? [
        { node_id: "step:s01", id: "S01", action: "Wire the projection", done: true },
        { node_id: "step:s02", id: "S02", action: "Bound the listing", done: true },
        { node_id: "step:s03", id: "S03", action: "Render the rollup", done: false },
      ]
    : [];
  return {
    interior: {
      plan_node_id: PLAN_NODE_ID,
      waves: [],
      phases: structured
        ? [
            {
              node_id: "phase:p01",
              id: "P01",
              heading: "Foundation",
              steps,
              rollup: { done: 2, total: 3 },
            },
          ]
        : [],
      steps: [],
      summary: {
        wave_count: 0,
        phase_count: structured ? 1 : 0,
        step_count: structured ? 3 : 0,
        done_count: structured ? 2 : 0,
        plan_state: structured ? "in-progress" : null,
      },
      truncated: null,
    },
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

/** The card's identity chips (tier · feature · date) are joined off the per-scope
 *  pipeline projection, so the cell seeds that query too — the card adds no fetch of
 *  its own, it reads the artifact row the Work surface already holds. */
function pipeline(state: ReviewState): PipelineResponse {
  return {
    artifacts:
      state === "normal" || state === "degraded"
        ? [
            {
              node_id: PLAN_NODE_ID,
              stem: "2026-08-01-alpha-plan",
              title: "Alpha",
              doc_type: "plan",
              tier: "L3",
              progress: { done: 2, total: 3 },
              feature_tags: ["alpha-rollout"],
              dates: { created: "2026-07-24", modified: "2026-08-01" },
              phase: "plan",
            },
          ]
        : [],
    tiers:
      state === "degraded" ? tiersDown(["structural"]) : tiersHealthy("structural"),
  };
}

export const viewerSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "viewer-markdownreader": {
    render: (state) => <MarkdownReader content={contentView(state, "markdown")} />,
  },
  "viewer-codeviewer": {
    render: (state) => <CodeViewer content={contentView(state, "code")} />,
  },
  "viewer-plansummarycard": {
    note: "Container over the plan-interior read plus the per-scope pipeline projection (the identity chips — tier, feature, plan date — are served on the artifact row); the cell seeds both at their real keys. One honest quirk remains: the card's empty state renders nothing at all, because a plan with no served structure gets no card rather than a fake 0% bar. Degraded is now its own treatment — the interior's tiers block reports `structural` down, so the card shows the shared caution and one sentence instead of numbers it cannot vouch for.",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.planInterior(REVIEW_SCOPE, PLAN_NODE_ID),
        planInterior(state),
      );
      client.setQueryData(
        engineKeys.pipeline(REVIEW_SCOPE, undefined),
        pipeline(state),
      );
    },
    render: () => <PlanSummaryCard nodeId={PLAN_NODE_ID} scope={REVIEW_SCOPE} />,
  },
};
