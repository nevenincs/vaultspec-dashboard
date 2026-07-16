// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import type { RagJobsTableView } from "../../stores/server/ragDashboardView";
import { RagJobsTableBody } from "./RagJobsTable";
import {
  formatDuration,
  formatRelativeTime,
} from "../../platform/localization/formatters";

afterEach(cleanup);

const hostile = "job-secret-raw-token connection refused /private/log";
const table: RagJobsTableView = {
  rows: [
    {
      id: hostile,
      group: "unavailable",
      startedAt: Date.now() / 1000 - 120,
      durationSeconds: 61,
    },
  ],
  sort: "recency",
  facets: [],
  filterText: "",
  groupCounts: { running: 0, queued: 0, done: 0, failed: 0, unavailable: 1 },
  servedCount: 1,
  truncated: false,
};

function setup() {
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <RagJobsTableBody
        table={table}
        selectedJobId={null}
        offline={false}
        pending={false}
      />
    </I18nextProvider>,
  );
  return runtime;
}

describe("RagJobsTableBody", () => {
  it("renders only closed localized job presentation", () => {
    setup();
    expect(screen.getByText("Search update")).toBeTruthy();
    expect(screen.getAllByText("Status unavailable").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(hostile);
    expect(document.body.innerHTML).not.toContain(hostile);
  });

  it("reacts to French and Arabic without refetching data", async () => {
    const runtime = setup();
    const duration = screen.getByText(formatDuration("en", 61_000) ?? "");
    const relative = screen.getByText(
      formatRelativeTime("en", -2, "minute", { numeric: "auto" }) ?? "",
    );
    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByText(ltrTestResources.operations.searchMaintenance.jobs.update),
    ).toBeTruthy();
    expect(duration.textContent).toBe(formatDuration(ltrTestLocale, 61_000));
    expect(relative.textContent).toBe(
      formatRelativeTime(ltrTestLocale, -2, "minute", { numeric: "auto" }),
    );
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByText(rtlTestResources.operations.searchMaintenance.jobs.update),
    ).toBeTruthy();
    expect(duration.textContent).toBe(formatDuration(rtlTestLocale, 61_000));
    expect(relative.textContent).toBe(
      formatRelativeTime(rtlTestLocale, -2, "minute", { numeric: "auto" }),
    );
    expect(document.body.textContent).not.toContain(hostile);
  });
});
