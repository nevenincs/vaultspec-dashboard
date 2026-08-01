// @vitest-environment happy-dom

// The plan card reads TWO served projections: the plan interior (its counts and
// completion) and the per-scope pipeline projection (its identity — tier, feature,
// date). Both are seeded here at their real query keys, so the card is exercised as
// the container it is: nothing is stubbed but the cache the stores layer would have
// filled, and every string resolves through the real localization runtime.

import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { engineKeys } from "../../stores/server/queries";
import type {
  PipelineResponse,
  PlanInteriorResponse,
  TiersBlock,
} from "../../stores/server/engine";
import { PlanSummaryCard } from "./PlanSummaryCard";

const SCOPE = "scope-a";
const PLAN_NODE_ID = "doc:2026-08-01-alpha-plan";

const HEALTHY: TiersBlock = { structural: { available: true } };
const DOWN: TiersBlock = {
  structural: { available: false, reason: "private_backend_state" },
};

function planInterior(tiers: TiersBlock): PlanInteriorResponse {
  return {
    interior: {
      plan_node_id: PLAN_NODE_ID,
      waves: [],
      phases: [
        {
          node_id: "phase:p01",
          id: "P01",
          heading: "Foundation",
          steps: [
            { node_id: "step:s01", id: "S01", action: "Wire it", done: true },
            { node_id: "step:s02", id: "S02", action: "Bound it", done: true },
            { node_id: "step:s03", id: "S03", action: "Render it", done: false },
          ],
          rollup: { done: 2, total: 3 },
        },
      ],
      steps: [],
      summary: {
        wave_count: 0,
        phase_count: 1,
        step_count: 3,
        done_count: 2,
        plan_state: "in-progress",
      },
      truncated: null,
    },
    tiers,
  };
}

function pipeline(tiers: TiersBlock): PipelineResponse {
  return {
    artifacts: [
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
    ],
    tiers,
  };
}

function renderCard({
  interiorTiers = HEALTHY,
  pipelineTiers = HEALTHY,
  seedPipeline = true,
}: {
  interiorTiers?: TiersBlock;
  pipelineTiers?: TiersBlock;
  seedPipeline?: boolean;
} = {}) {
  // The seeded entries are the whole point of the fixture, so they must not be
  // refetched out from under the assertions. Bounded by `gcTime` (never an
  // unbounded `staleTime: Infinity` cache) and by the test's own lifetime.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 1000 },
    },
  });
  client.setQueryData(
    engineKeys.planInterior(SCOPE, PLAN_NODE_ID),
    planInterior(interiorTiers),
  );
  if (seedPipeline) {
    client.setQueryData(engineKeys.pipeline(SCOPE, undefined), pipeline(pipelineTiers));
  }
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <PlanSummaryCard nodeId={PLAN_NODE_ID} scope={SCOPE} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe("PlanSummaryCard", () => {
  it("shows the served tier, feature, and plan date beside the progress", () => {
    const { container } = renderCard();
    const identity = container.querySelector("[data-plan-summary-identity]")!;
    expect(identity).toBeTruthy();

    // The complexity tier is SERVED (`tier`), never parsed out of the stem.
    expect(identity.querySelector("[data-plan-summary-tier]")!.textContent).toContain(
      "L3",
    );
    // The feature tag renders de-kebabed, as it does everywhere else in the app.
    expect(
      identity.querySelector("[data-plan-summary-feature]")!.textContent,
    ).toContain("Alpha Rollout");
    // The date is the served `modified` stamp, read in the active locale and in UTC
    // so a plan stamped 2026-08-01 never reads as the day before.
    expect(identity.querySelector("[data-plan-summary-date]")!.textContent).toContain(
      "2026",
    );
    // Each facet names itself for a screen reader without displacing its value.
    expect(identity.textContent).toContain("Plan size");
    expect(identity.textContent).toContain("Plan date");
  });

  it("omits a facet the wire does not carry rather than inventing one", () => {
    // No pipeline artifact row at all (a plan the in-flight projection dropped).
    const { container } = renderCard({ seedPipeline: false });
    // The counts still render — the interior is independent of the projection.
    expect(screen.getByText(/step/)).toBeTruthy();
    expect(container.querySelector("[data-plan-summary-identity]")).toBeNull();
  });

  it("renders a real degraded treatment instead of a stale-looking card", () => {
    const { container } = renderCard({ interiorTiers: DOWN, pipelineTiers: DOWN });
    // The shared caution block, not a normal card built on numbers it cannot vouch
    // for — and never the raw backend reason.
    expect(container.querySelector("[data-plan-summary-degraded]")).toBeTruthy();
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    expect(container.querySelector("[data-plan-summary-identity]")).toBeNull();
    expect(document.body.textContent).not.toContain("private_backend_state");
    expect(document.body.textContent).not.toContain("%");
  });
});
