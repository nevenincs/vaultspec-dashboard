// @vitest-environment happy-dom
//
// Populated `plan_states` facet — the frontend integration guard the audit found
// missing. The engine side is well-covered (engine-query `filter.rs`:
// `vocabulary_lists_the_present_plan_states` + `matches_plan_state`), and the
// frontend only asserted the EMPTY case (queries.test.ts). This exercises the
// POPULATED path end-to-end against the REAL engine (no mock — the suite runs
// online against `vaultspec serve` over the committed fixture vault, whose alpha
// plan has one done + one open step → the `active` lifecycle state): the served
// vocabulary enumerates `active`, the FilterSidebar renders the Plan-status row,
// and the engine HONORS a `plan_states` selection (mock-mirrors-live is moot —
// there is nothing to mirror; this guards the frontend adapter/filterSidebar
// chain against a silent regression).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { dashboardStateSessionIdentity, engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { FilterSidebar } from "./FilterSidebar";

afterEach(() => {
  cleanup();
  queryClient.clear();
  document.body.innerHTML = "";
});

describe("FilterSidebar plan_states facet (live engine, populated path)", () => {
  it("the live engine serves a populated plan_states vocabulary (active)", async () => {
    const client = createLiveClient();
    const scope = await liveScope();
    const vocabulary = await client.filters(scope);
    // The fixture's alpha plan has `[x] S01` + `[ ] S02` → done≠total → `active`
    // (engine filter.rs: `done == total ? "complete" : "active"`).
    expect(vocabulary.plan_states ?? []).toContain("active");
  });

  it("renders the Plan-status facet row from the live vocabulary", async () => {
    // The flyout portals to <body> and anchors to the rail's Filters button; a
    // stand-in trigger lets `useFlyoutAnchor` measure a rect and render.
    const trigger = document.createElement("button");
    trigger.setAttribute("data-rail-filter-trigger", "");
    document.body.appendChild(trigger);

    const client = createLiveClient();
    const scope = await liveScope();
    const session = await client.session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    const dashboardState = await client.dashboardState(scope);
    const vocabulary = await client.filters(scope);

    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      dashboardState,
    );
    queryClient.setQueryData(engineKeys.filters(scope), vocabulary);

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(FilterSidebar, {
          open: true,
          onClose: () => undefined,
          scope,
          hidden: { nodes: 0, edges: 0 },
        }),
      ),
    );

    // The Plan-status section + the `active` option's plain label ("In progress",
    // ui-labels-are-user-facing) both render from the populated live vocabulary.
    expect(await screen.findByText("Plan status")).toBeTruthy();
    expect(await screen.findByText("In progress")).toBeTruthy();
  });

  it("honors a plan_states selection — the active plan is kept, an absent state drops it", async () => {
    const client = createLiveClient();
    const scope = await liveScope();

    const unfiltered = await client.graphQuery({ scope, granularity: "document" });
    const active = await client.graphQuery({
      scope,
      granularity: "document",
      filter: { plan_states: ["active"] },
    });
    const complete = await client.graphQuery({
      scope,
      granularity: "document",
      filter: { plan_states: ["complete"] },
    });

    // Selecting the present `active` state NARROWS the graph (non-active nodes drop).
    expect(active.nodes.length).toBeLessThan(unfiltered.nodes.length);
    // The active plan survives the `active` filter…
    expect(active.nodes.length).toBeGreaterThan(0);
    // …and is excluded by an absent-but-valid `complete` filter — proving the
    // engine honors the facet value, not just its presence. (Robust to the
    // non-lifecycle-node filter semantics: every non-plan node is treated
    // identically by both queries, so the difference isolates the plan-state.)
    expect(active.nodes.length).toBeGreaterThan(complete.nodes.length);
  });
});
