// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { en, sourceLocale } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { formatDate } from "../../platform/localization/formatters";
import { ENGINE_WAIT } from "../../testing/timing";
import { liveScope } from "../../testing/liveClient";
import { TimelineRange } from "./TimelineRangeSelector";

const FIXTURE_RANGE_START = Date.parse("2026-01-01T00:00:00Z");
const FIXTURE_RANGE_END = Date.parse("2026-01-06T00:00:00Z");
const RANGE_DATE_OPTIONS = Object.freeze({
  day: "numeric",
  month: "short",
  timeZone: "UTC",
} as const satisfies Intl.DateTimeFormatOptions);

function formattedFixtureRange(locale: string): { start: string; end: string } {
  const start = formatDate(locale, FIXTURE_RANGE_START, RANGE_DATE_OPTIONS);
  const end = formatDate(locale, FIXTURE_RANGE_END, RANGE_DATE_OPTIONS);
  if (start === null || end === null) {
    throw new Error("Fixture range dates must format.");
  }
  return { end, start };
}

describe("TimelineRange localized controls", () => {
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

    const group = await screen.findByRole(
      "radiogroup",
      { name: en.timeline.accessibility.dateField },
      ENGINE_WAIT,
    );

    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      en.timeline.criteria.created,
      en.timeline.criteria.modified,
      en.timeline.criteria.stamped,
    ]);

    const created = within(group).getByRole("radio", {
      name: en.timeline.criteria.created,
    });
    const modified = within(group).getByRole("radio", {
      name: en.timeline.criteria.modified,
    });
    const stamped = within(group).getByRole("radio", {
      name: en.timeline.criteria.stamped,
    });
    expect(created.getAttribute("aria-checked")).toBe("true");
    expect((created as HTMLButtonElement).disabled).toBe(false);
    expect(created.getAttribute("title")).toBe(
      en.timeline.descriptions.useCreationDateForRange,
    );
    const rangeSummary = screen.getByLabelText(en.timeline.accessibility.selectedRange);
    const rangeStart = screen.getByRole("slider", {
      name: en.timeline.accessibility.rangeStart,
    });
    const rangeEnd = screen.getByRole("slider", {
      name: en.timeline.accessibility.rangeEnd,
    });
    const englishRange = formattedFixtureRange(sourceLocale);
    expect(rangeSummary.textContent).toBe(
      runtime.t("timeline:summaries.selectedRange", englishRange),
    );
    expect(rangeSummary.textContent).not.toMatch(/[\u2013\u2014]/u);

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
    expect(
      screen.getByLabelText(ltrTestResources.timeline.accessibility.selectedRange),
    ).toBe(rangeSummary);
    expect(
      screen.getByRole("slider", {
        name: ltrTestResources.timeline.accessibility.rangeStart,
      }),
    ).toBe(rangeStart);
    expect(
      screen.getByRole("slider", {
        name: ltrTestResources.timeline.accessibility.rangeEnd,
      }),
    ).toBe(rangeEnd);
    const ltrRange = formattedFixtureRange(ltrTestLocale);
    expect(rangeSummary.textContent).toBe(
      runtime.t("timeline:summaries.selectedRange", ltrRange),
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
    expect(
      screen.getByLabelText(rtlTestResources.timeline.accessibility.selectedRange),
    ).toBe(rangeSummary);
    expect(
      screen.getByRole("slider", {
        name: rtlTestResources.timeline.accessibility.rangeStart,
      }),
    ).toBe(rangeStart);
    expect(
      screen.getByRole("slider", {
        name: rtlTestResources.timeline.accessibility.rangeEnd,
      }),
    ).toBe(rangeEnd);
    const rtlRange = formattedFixtureRange(rtlTestLocale);
    expect(rangeSummary.textContent).toBe(
      runtime.t("timeline:summaries.selectedRange", rtlRange),
    );
  });
});
