// @vitest-environment happy-dom
//
// TTR-008b: the on-strip date-criterion selector. The timeline strip surfaces the active
// date field (created / modified / stamped) as a kit SegmentedToggle radiogroup that
// writes the ONE engine-served `timeline_date_criterion` setting (the same seam the
// "Filter by" menu uses). Rendered against the REAL engine over the fixture vault.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
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
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={queryClient}>
          <TimelineRange scope={scope} />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    // The selector only mounts on the TYPICAL strip (the fixture has dated documents),
    // so waiting for the radiogroup also waits for the corpus bounds to load.
    const group = await screen.findByRole(
      "radiogroup",
      { name: "Timeline date" },
      ENGINE_WAIT,
    );

    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Created", "Edited", "Updated"]);

    // Created is the default active criterion and is always selectable.
    const created = within(group).getByRole("radio", { name: "Created" });
    const modified = within(group).getByRole("radio", { name: "Edited" });
    const stamped = within(group).getByRole("radio", { name: "Updated" });
    expect(created.getAttribute("aria-checked")).toBe("true");
    expect((created as HTMLButtonElement).disabled).toBe(false);
    expect(created.getAttribute("title")).toBe("Use the creation date for the range");

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: ltrTestResources.timeline.accessibility.dateField,
      }),
    ).toBe(group);
    expect(
      within(group).getByRole("radio", {
        name: ltrTestResources.timeline.criteria.created,
      }),
    ).toBe(created);
    expect(
      within(group).getByRole("radio", {
        name: ltrTestResources.timeline.criteria.modified,
      }),
    ).toBe(modified);
    expect(
      within(group).getByRole("radio", {
        name: ltrTestResources.timeline.criteria.stamped,
      }),
    ).toBe(stamped);
    expect(created.getAttribute("title")).toBe(
      ltrTestResources.timeline.descriptions.useCreationDateForRange,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("radiogroup", {
        name: rtlTestResources.timeline.accessibility.dateField,
      }),
    ).toBe(group);
    expect(
      within(group).getByRole("radio", {
        name: rtlTestResources.timeline.criteria.created,
      }),
    ).toBe(created);
    expect(
      within(group).getByRole("radio", {
        name: rtlTestResources.timeline.criteria.modified,
      }),
    ).toBe(modified);
    expect(
      within(group).getByRole("radio", {
        name: rtlTestResources.timeline.criteria.stamped,
      }),
    ).toBe(stamped);
    expect(created.getAttribute("title")).toBe(
      rtlTestResources.timeline.descriptions.useCreationDateForRange,
    );
  });
});
