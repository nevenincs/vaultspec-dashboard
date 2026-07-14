// @vitest-environment happy-dom
//
// Render contract for the JOBS region body (rag-job-dashboard W02.P04.S10; binding
// Figma RagJobDashboard jobs region). The body is a PURE projection of the derived
// `RagJobsTableView` + the selected-job id: the zero-prop wrapper wires the stores
// hooks (live-tested in W01.P02.S06), so these assertions pin the presentation —
// the eyebrow, the column header with the sort mark, the row states (running
// progress, failed note), the phase words, the served-vs-total truncation bound,
// the selection treatment, and the designed offline/loading/empty states.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RagJobsTableBody } from "./RagJobsTable";
import type { RagJobRow, RagJobsTableView } from "../../stores/server/ragDashboardView";

afterEach(cleanup);

const runningRow: RagJobRow = {
  id: "job-run-1",
  phase: "running",
  group: "running",
  step: "embedding documents",
  fraction: 0.5,
  startedAt: 1_000,
  durationSeconds: 42,
  kind: "watch",
};

const failedRow: RagJobRow = {
  id: "job-fail-2",
  phase: "error",
  group: "failed",
  step: "connection refused",
  startedAt: 500,
  durationSeconds: 5,
};

const doneRow: RagJobRow = {
  id: "job-done-3",
  phase: "done",
  group: "done",
  startedAt: 200,
  durationSeconds: 120,
};

function view(over: Partial<RagJobsTableView> = {}): RagJobsTableView {
  return {
    rows: [runningRow, failedRow, doneRow],
    sort: "recency",
    facets: [],
    filterText: "",
    groupCounts: { running: 1, queued: 0, done: 1, failed: 1 },
    servedCount: 3,
    truncated: false,
    ...over,
  };
}

describe("RagJobsTableBody (binding RagJobDashboard jobs region)", () => {
  it("renders the JOBS eyebrow with the served count", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    expect(screen.getByText("Jobs")).toBeTruthy();
    // servedCount rendered by the SectionLabel count
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("renders the five column headers", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    for (const label of ["Job", "Phase", "Progress", "Started", "Duration"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks the active sort column via aria-pressed on its header", () => {
    render(
      <RagJobsTableBody
        table={view({ sort: "duration" })}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    const durationHeader = screen.getByText("Duration").closest("button");
    expect(durationHeader?.getAttribute("aria-pressed")).toBe("true");
    const startedHeader = screen.getByText("Started").closest("button");
    expect(startedHeader?.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders a running row with a progress bar and its step note", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    expect(screen.getByLabelText("job-run-1 progress")).toBeTruthy();
    expect(screen.getByText("embedding documents")).toBeTruthy();
  });

  it("renders a failed row's note in the broken tone", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    const note = screen.getByText("connection refused");
    expect(note.className).toContain("text-state-broken");
  });

  it("renders plain-language phase words with the raw token in the tooltip", () => {
    const { container } = render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    // The row phase cell carries the reworded word with the raw served token in
    // its tooltip (the facet toggles reuse the same words, so scope to the tooltip).
    expect(container.querySelector('[title="running"]')?.textContent).toContain(
      "Running",
    );
    expect(container.querySelector('[title="error"]')?.textContent).toContain("Failed");
    expect(container.querySelector('[title="done"]')?.textContent).toContain("Done");
  });

  it("renders the phase facet toggles with their counts", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    const running = screen.getByRole("checkbox", { name: /Running/ });
    expect(running.textContent).toContain("1");
    const queued = screen.getByRole("checkbox", { name: /Queued/ });
    expect(queued.textContent).toContain("0");
  });

  it("gives the selected row aria-pressed", () => {
    render(
      <RagJobsTableBody
        table={view()}
        selectedJobId="job-run-1"
        offline={false}
        pending={false}
      />,
    );
    const selected = screen.getByText("job-run-1").closest("button[aria-pressed]");
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
  });

  it("states the served-vs-total truncation bound", () => {
    render(
      <RagJobsTableBody
        table={view({ truncated: true, servedCount: 3, total: 50 })}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    expect(screen.getByText(/Showing the 3 most recent jobs of 50/)).toBeTruthy();
  });

  it("renders the designed offline state (no header)", () => {
    const { container } = render(
      <RagJobsTableBody table={view()} selectedJobId={null} offline pending={false} />,
    );
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    expect(screen.queryByText("Progress")).toBeNull();
  });

  it("renders the loading skeleton while pending", () => {
    const { container } = render(
      <RagJobsTableBody
        table={view({ rows: [] })}
        selectedJobId={null}
        offline={false}
        pending
      />,
    );
    const status = container.querySelector('[role="status"][aria-busy="true"]');
    expect(status).toBeTruthy();
  });

  it("renders the filter-aware empty state when no rows match", () => {
    render(
      <RagJobsTableBody
        table={view({ rows: [], filterText: "zzz" })}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    expect(screen.getByText("No jobs match this filter.")).toBeTruthy();
  });

  it("renders the empty history prompt when unfiltered and empty", () => {
    render(
      <RagJobsTableBody
        table={view({
          rows: [],
          servedCount: 0,
          groupCounts: { running: 0, queued: 0, done: 0, failed: 0 },
        })}
        selectedJobId={null}
        offline={false}
        pending={false}
      />,
    );
    expect(screen.getByText(/No indexing jobs yet/)).toBeTruthy();
  });
});
