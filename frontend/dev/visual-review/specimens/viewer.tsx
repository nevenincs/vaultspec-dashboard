// Specimens: `viewer` area.
//
// `MarkdownReader` and `CodeViewer` are wire-free views taking a resolved
// `ContentView` — authored directly. `PlanSummaryCard` is a container over the
// plan-interior query, so its cell seeds that query at the real key.

import { engineKeys } from "@app/stores/server/queries";
import type { PlanInteriorResponse } from "@app/stores/server/engine";
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

export const viewerSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "viewer-markdownreader": {
    render: (state) => <MarkdownReader content={contentView(state, "markdown")} />,
  },
  "viewer-codeviewer": {
    render: (state) => <CodeViewer content={contentView(state, "code")} />,
  },
  "viewer-plansummarycard": {
    note: "Container over the plan-interior read; the cell seeds that query. Two honest quirks: the card's empty state renders nothing (a plan with no structure), and degraded renders identically to default — the card has no degraded treatment of its own; the reader shell around it surfaces degradation.",
    seed: (client, state) => {
      if (state === "loading") return;
      client.setQueryData(
        engineKeys.planInterior(REVIEW_SCOPE, PLAN_NODE_ID),
        planInterior(state),
      );
    },
    render: () => <PlanSummaryCard nodeId={PLAN_NODE_ID} scope={REVIEW_SCOPE} />,
  },
};
