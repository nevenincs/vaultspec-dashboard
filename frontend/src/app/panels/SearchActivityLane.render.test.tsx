// @vitest-environment happy-dom
//
// The served-searches lane's render guard: the query half of the one activity
// panel. It pins the honesty rules the lane carries — the count is the
// service's ledger-side total (never the returned slice re-counted), an
// unrecognized search kind renders NO word rather than wire vocabulary, the
// query text renders verbatim, and the degraded mode comes from the tiers-read
// flag, never a transport guess.

import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import type {
  RagSearchActivityRecord,
  RagSearchActivityView,
} from "../../stores/server/ragControl";
import { SearchActivityLaneBody, searchGroup } from "./SearchActivityLane";

const SM = en.operations.searchMaintenance;

afterEach(cleanup);

const BASE: RagSearchActivityView & { pending: boolean } = {
  active: [],
  recent: [],
  activeCount: 0,
  totalCount: 0,
  semanticOffline: false,
  pending: false,
};

function renderLane(view: Partial<RagSearchActivityView & { pending: boolean }>) {
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <SearchActivityLaneBody view={{ ...BASE, ...view }} />
    </I18nextProvider>,
  );
}

describe("searchGroup", () => {
  it("classifies active, completed, and failed served searches", () => {
    expect(searchGroup({ request_id: "a", state: "active" })).toBe("running");
    expect(
      searchGroup({ request_id: "b", state: "terminal", outcome: "success" }),
    ).toBe("done");
    expect(
      searchGroup({ request_id: "c", state: "terminal", outcome: "unavailable" }),
    ).toBe("failed");
  });
});

describe("SearchActivityLaneBody", () => {
  it("renders active searches ahead of recent ones with verbatim queries", () => {
    const active: RagSearchActivityRecord = {
      request_id: "a-1",
      state: "active",
      type: "code",
      query: "retry backoff around webhook delivery",
    };
    const recent: RagSearchActivityRecord = {
      request_id: "r-1",
      state: "terminal",
      outcome: "success",
      type: "vault",
      query: "gpu lock decision",
      result_count: 10,
      total_seconds: 0.99,
      finished_at: Date.now() / 1000 - 60,
    };
    renderLane({ active: [active], recent: [recent], totalCount: 503 });

    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("retry backoff around webhook delivery");
    expect(rows[0]?.textContent).toContain(SM.states.running);
    expect(rows[1]?.textContent).toContain("gpu lock decision");
    expect(rows[1]?.textContent).toContain(SM.states.completed);
    // The count is the ledger's own total over the full retained set — 503 with
    // two rows shown, never a client re-count of the slice.
    expect(document.body.textContent).toContain("503");
  });

  it("renders no kind word for an unrecognized search type", () => {
    renderLane({
      recent: [
        {
          request_id: "r-2",
          state: "terminal",
          outcome: "success",
          type: "telemetry_probe",
          query: "q",
        },
      ],
      totalCount: 1,
    });
    // The wire word never reaches the screen; the cell stays empty instead.
    expect(document.body.textContent).not.toContain("telemetry_probe");
  });

  it("keeps degraded, loading, and empty as distinct authored modes", () => {
    renderLane({ semanticOffline: true });
    expect(document.body.textContent).toContain(SM.searches.unavailable);
    cleanup();

    renderLane({ pending: true });
    expect(document.body.textContent).toContain(SM.searches.loading);
    cleanup();

    renderLane({});
    expect(document.body.textContent).toContain(SM.searches.empty);
  });

  it("marks a failed served search with the failed state word", () => {
    renderLane({
      recent: [
        {
          request_id: "r-3",
          state: "terminal",
          outcome: "unavailable",
          type: "vault",
          query: "broken",
        },
      ],
      totalCount: 1,
    });
    expect(document.body.textContent).toContain(SM.states.failed);
  });
});
