// @vitest-environment happy-dom
//
// TTR-008b: the on-strip date-criterion selector. The timeline strip surfaces the active
// date field (created / modified / stamped) as a kit SegmentedToggle radiogroup that
// writes the ONE engine-served `timeline_date_criterion` setting (the same seam the
// "Filter by" menu uses). Rendered against the REAL engine over the fixture vault.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { ENGINE_WAIT } from "../../testing/timing";
import { liveScope } from "../../testing/liveClient";
import { TimelineRange } from "./TimelineRangeSelector";

describe("TimelineRange on-strip date-criterion selector (TTR-008b, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    queryClient.clear();
    useViewStore.getState().setScope(scope);
  });
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("surfaces created/modified/stamped as one labelled radiogroup with the active criterion checked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TimelineRange scope={scope} />
      </QueryClientProvider>,
    );

    // The selector only mounts on the TYPICAL strip (the fixture has dated documents),
    // so waiting for the radiogroup also waits for the corpus bounds to load.
    const group = await screen.findByRole(
      "radiogroup",
      { name: "timeline date field" },
      ENGINE_WAIT,
    );

    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Created",
      "Modified",
      "Stamped",
    ]);

    // Created is the default active criterion and is always selectable.
    const created = within(group).getByRole("radio", { name: "Created" });
    expect(created.getAttribute("aria-checked")).toBe("true");
    expect((created as HTMLButtonElement).disabled).toBe(false);
  });
});
