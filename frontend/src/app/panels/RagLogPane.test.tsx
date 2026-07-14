// @vitest-environment happy-dom
//
// Render contract for the LOG region body (rag-job-dashboard W02.P04.S11; binding
// Figma RagJobDashboard log pane). The body is PURE over the (already client-
// filtered) rows plus the window/offline/join state; the zero-prop wrapper wires
// `useRagLogs` (live-tested in W01.P02.S05). Assertions pin the eyebrow, the lines
// selector, the dismissible job join chip, the fetched-window honesty caption, the
// per-level tone classes, and the designed empty/offline states.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RagLogPaneBody } from "./RagLogPane";
import type { RagLogLine } from "../../stores/server/ragControl";

afterEach(cleanup);

const lines: RagLogLine[] = [
  { text: "2026-07-14 10:00:00,000 INFO starting up", level: "info" },
  { text: "2026-07-14 10:00:01,000 WARNING slow disk", level: "warning" },
  { text: "2026-07-14 10:00:02,000 ERROR connection refused", level: "error" },
  { text: "a raw unstructured line" },
];

describe("RagLogPaneBody (binding RagJobDashboard log pane)", () => {
  it("renders the LOG eyebrow with the window count", () => {
    render(
      <RagLogPaneBody
        lines={lines}
        windowCount={200}
        semanticOffline={false}
        logFilter=""
        selectedJobId={null}
        linesChoice={200}
      />,
    );
    expect(screen.getByText("Log")).toBeTruthy();
    expect(screen.getAllByText("200").length).toBeGreaterThan(0);
  });

  it("renders the 50/200/500 lines selector", () => {
    render(
      <RagLogPaneBody
        lines={lines}
        windowCount={137}
        semanticOffline={false}
        logFilter=""
        selectedJobId={null}
        linesChoice={200}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Log window size" })).toBeTruthy();
    for (const choice of ["50", "200", "500"]) {
      expect(screen.getByRole("radio", { name: choice })).toBeTruthy();
    }
  });

  it("tags rows by level tone (info muted, warning stale, error broken)", () => {
    render(
      <RagLogPaneBody
        lines={lines}
        windowCount={200}
        semanticOffline={false}
        logFilter=""
        selectedJobId={null}
        linesChoice={200}
      />,
    );
    expect(screen.getByText(/starting up/).className).toContain("text-ink-muted");
    expect(screen.getByText(/slow disk/).className).toContain("text-state-stale");
    expect(screen.getByText(/connection refused/).className).toContain(
      "text-state-broken",
    );
    // an unparsed line stays untoned (default muted, monospace)
    const raw = screen.getByText("a raw unstructured line");
    expect(raw.className).toContain("font-mono");
  });

  it("renders the dismissible job join chip when a job is selected", () => {
    render(
      <RagLogPaneBody
        lines={lines}
        windowCount={200}
        semanticOffline={false}
        logFilter=""
        selectedJobId="job-42"
        linesChoice={200}
      />,
    );
    expect(screen.getByText(/Job: job-42/)).toBeTruthy();
    expect(screen.getByLabelText("Clear job filter")).toBeTruthy();
  });

  it("shows the fetched-window honesty caption only while filtering", () => {
    const { rerender } = render(
      <RagLogPaneBody
        lines={lines}
        windowCount={200}
        semanticOffline={false}
        logFilter=""
        selectedJobId={null}
        linesChoice={500}
      />,
    );
    expect(screen.queryByText(/Filter applies to the fetched window/)).toBeNull();

    rerender(
      <RagLogPaneBody
        lines={lines}
        windowCount={200}
        semanticOffline={false}
        logFilter="disk"
        selectedJobId={null}
        linesChoice={500}
      />,
    );
    expect(
      screen.getByText(/Filter applies to the fetched window \(last 500 lines\)/),
    ).toBeTruthy();
  });

  it("renders the empty-window state", () => {
    render(
      <RagLogPaneBody
        lines={[]}
        windowCount={0}
        semanticOffline={false}
        logFilter=""
        selectedJobId={null}
        linesChoice={200}
      />,
    );
    expect(screen.getByText("No log lines in this window.")).toBeTruthy();
  });

  it("renders the designed offline state", () => {
    const { container } = render(
      <RagLogPaneBody
        lines={[]}
        windowCount={0}
        semanticOffline
        logFilter=""
        selectedJobId={null}
        linesChoice={200}
      />,
    );
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
  });
});
