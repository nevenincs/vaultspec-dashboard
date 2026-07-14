// @vitest-environment happy-dom
//
// The rag job dashboard shell + header bar (rag-job-dashboard P03.S09). Two layers:
//   - the pure `DashboardHeaderBar` is unit-tested over synthesized status so its
//     verb eligibility and designed offline/degraded states are deterministic
//     without the live wire (it is glass fed by props);
//   - the `RagJobDashboard` container is mounted online (the suite runs against the
//     real `vaultspec serve` fixture) to prove the header + both body regions
//     compose and mount — structure only, never asserting the fixture's live rag
//     lifecycle state.
// Core vitest matchers only (no jest-dom in this project).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import {
  DashboardHeaderBar,
  RagJobDashboard,
  type DashboardHeaderBarProps,
} from "./RagJobDashboard";

afterEach(cleanup);

function headerProps(
  overrides: Partial<DashboardHeaderBarProps> = {},
): DashboardHeaderBarProps {
  return {
    running: true,
    healthWord: "Running",
    healthTone: "active",
    actionsPending: false,
    doctorPending: false,
    reindexActive: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onDoctor: vi.fn(),
    onReindex: vi.fn(),
    ...overrides,
  };
}

describe("DashboardHeaderBar", () => {
  it("shows the running lifecycle verbs and the reindex trigger", () => {
    render(<DashboardHeaderBar {...headerProps()} />);
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check health" })).toBeTruthy();
    const reindex = screen.getByRole("button", { name: "Reindex documents" });
    expect((reindex as HTMLButtonElement).disabled).toBe(false);
    // Health word renders the plain label, not a wire token.
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("dispatches the lifecycle and reindex verbs through the handlers", () => {
    const onStop = vi.fn();
    const onRestart = vi.fn();
    const onDoctor = vi.fn();
    const onReindex = vi.fn();
    render(
      <DashboardHeaderBar
        {...headerProps({ onStop, onRestart, onDoctor, onReindex })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    fireEvent.click(screen.getByRole("button", { name: "Check health" }));
    fireEvent.click(screen.getByRole("button", { name: "Reindex documents" }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onDoctor).toHaveBeenCalledTimes(1);
    expect(onReindex).toHaveBeenCalledTimes(1);
  });

  it("renders the designed down state: Start plus disabled-with-reason reindex", () => {
    render(
      <DashboardHeaderBar
        {...headerProps({
          running: false,
          healthWord: "Not running",
          healthTone: "broken",
        })}
      />,
    );
    // Stop/Restart give way to Start when the service is down...
    expect(screen.getByRole("button", { name: "Start service" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    // ...and reindex stays visible but disabled-with-reason (never dead-looking).
    const reindex = screen.getByRole("button", {
      name: "Reindex documents",
    }) as HTMLButtonElement;
    expect(reindex.disabled).toBe(true);
    expect(reindex.parentElement?.getAttribute("title")).toContain(
      "Start the search service",
    );
    expect(screen.getByText("Not running")).toBeTruthy();
  });

  it("surfaces the needs-install retry path", () => {
    const onStart = vi.fn();
    render(
      <DashboardHeaderBar
        {...headerProps({
          running: false,
          healthWord: "Not running",
          healthTone: "broken",
          startOutcome: { status: "needs_install", attached: false },
          onStart,
        })}
      />,
    );
    const retry = screen.getByRole("button", { name: "Retry with auto-provision" });
    fireEvent.click(retry);
    expect(onStart).toHaveBeenCalledWith(true);
  });

  it("renders the degraded reason line when the semantic tier is down", () => {
    render(
      <DashboardHeaderBar
        {...headerProps({
          running: false,
          healthWord: "Not responding",
          healthTone: "stale",
          degradedReason: "Semantic search is offline.",
        })}
      />,
    );
    expect(screen.getByText("Semantic search is offline.")).toBeTruthy();
  });

  it("renders the designed engine-unreachable state as a degraded block", () => {
    // A genuine transport failure (the engine itself is unreachable, not merely the
    // semantic tier down) surfaces the designed degraded block, not a bare error.
    const { container } = render(
      <DashboardHeaderBar
        {...headerProps({
          running: false,
          healthWord: "Not running",
          healthTone: "broken",
          errored: true,
        })}
      />,
    );
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    expect(
      screen.getByText(
        "The dashboard cannot reach the engine — status is unavailable.",
      ),
    ).toBeTruthy();
  });

  it("shows the inline reindex progress while a job is live", () => {
    const { container } = render(
      <DashboardHeaderBar
        {...headerProps({
          reindexActive: true,
          reindexFraction: 0.42,
          reindexLabel: "embedding",
        })}
      />,
    );
    expect(container.querySelector("[data-rag-reindex-progress]")).toBeTruthy();
    expect(screen.getByText("embedding")).toBeTruthy();
  });
});

describe("RagJobDashboard (shell)", () => {
  it("composes the header bar over both body regions", () => {
    const { container } = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RagJobDashboard),
      ),
    );
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeTruthy();
    expect(container.querySelector("[data-rag-dashboard-header]")).toBeTruthy();
    // The jobs + log regions (built by the parallel P04 lane) compose below the
    // header; assert the body wrapper mounted them without coupling to their
    // internal DOM.
    const body = container.querySelector("[data-rag-dashboard-body]");
    expect(body).toBeTruthy();
    expect((body as HTMLElement).children.length).toBe(2);
    // A lifecycle verb is always present (running or down variant).
    expect(container.querySelector("[data-rag-dashboard-header] button")).toBeTruthy();
  });
});
