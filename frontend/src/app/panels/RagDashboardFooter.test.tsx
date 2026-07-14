// @vitest-environment happy-dom
//
// Render contract for the FOOTER strip body (rag-job-dashboard W02.P04.S12; binding
// Figma RagJobDashboard footer). The body is PURE over the storage rollup + the
// watcher/offline state and the two action callbacks; the zero-prop wrapper wires
// the ops-state read and the watcher seams. Assertions pin the humanized stat cells
// (plain language, no internal vocabulary), the live/orphaned split, the surveyed-
// slice lower-bound note, the watcher toggle + label, Refresh, and the offline state.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RagDashboardFooterBody } from "./RagDashboardFooter";
import type { RagStorageRollup } from "../../stores/server/ragControl";

afterEach(cleanup);

function rollup(over: Partial<RagStorageRollup> = {}): RagStorageRollup {
  return {
    available: true,
    total_points: 12_345,
    total_footprint_bytes: 1024 * 1024 * 512,
    total_namespaces: 3,
    truncated: false,
    live_count: 2,
    orphaned_count: 1,
    namespaces: [],
    ...over,
  };
}

const noop = () => {};

describe("RagDashboardFooterBody (binding RagJobDashboard footer)", () => {
  it("renders humanized stat cells in plain language", () => {
    render(
      <RagDashboardFooterBody
        storage={rollup()}
        watching={false}
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    const entries = screen.getByText("Entries");
    // Locale grouping varies by test-runner ICU; assert the digits, not the commas.
    expect(entries.nextElementSibling?.textContent?.replace(/[^0-9]/g, "")).toBe(
      "12345",
    );
    expect(screen.getByText("On disk")).toBeTruthy();
    expect(screen.getByText("512 MB")).toBeTruthy();
    // no internal vocabulary reaches a label
    expect(screen.queryByText(/namespace/i)).toBeNull();
    expect(screen.queryByText(/points/i)).toBeNull();
  });

  it("renders the live-vs-orphaned project split", () => {
    render(
      <RagDashboardFooterBody
        storage={rollup()}
        watching={false}
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    expect(screen.getByText("2 live · 1 orphaned")).toBeTruthy();
  });

  it("states the surveyed-slice lower bound when truncated", () => {
    render(
      <RagDashboardFooterBody
        storage={rollup({
          truncated: true,
          total_namespaces: 10,
          namespaces: [
            {
              prefix: "a",
              root: "/x",
              status: "live",
              points: 1,
              footprint_bytes: 1,
              collections: [],
            },
          ],
        })}
        watching={false}
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    expect(screen.getByText(/Covering the first 1 of 10 projects/)).toBeTruthy();
    // the lower-bound "≥" prefixes the split
    expect(screen.getByText(/≥ 2 live/)).toBeTruthy();
  });

  it("renders the watcher toggle with its state label and fires the toggle", () => {
    const onToggle = vi.fn();
    render(
      <RagDashboardFooterBody
        storage={rollup()}
        watching
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={onToggle}
        onRefresh={noop}
      />,
    );
    expect(screen.getByText("Watching for changes")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("disables the watcher toggle when offline and shows the degraded stats", () => {
    const { container } = render(
      <RagDashboardFooterBody
        storage={undefined}
        watching={false}
        offline
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Not watching")).toBeTruthy();
  });

  it("holds a reading line while the storage read is pending (not offline)", () => {
    // Distinct from offline: the service is up but the rollup has not arrived yet —
    // a quiet reading line, never the degraded card or a wall of absent dashes.
    render(
      <RagDashboardFooterBody
        storage={undefined}
        watching={false}
        offline={false}
        pending
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    expect(screen.getByText("Reading storage…")).toBeTruthy();
  });

  it("states storage unavailable honestly when up but the rollup is absent", () => {
    // Up, settled, but no rollup served (a backend that does not survey): one honest
    // sentence, not a fabricated zero.
    const { container } = render(
      <RagDashboardFooterBody
        storage={undefined}
        watching={false}
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={noop}
      />,
    );
    expect(screen.getByText("Storage details unavailable.")).toBeTruthy();
    // Not the offline degraded card — the watcher stays enabled.
    expect(container.querySelector('[data-state-block="degraded"]')).toBeNull();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.hasAttribute("disabled")).toBe(false);
  });

  it("fires Refresh", () => {
    const onRefresh = vi.fn();
    render(
      <RagDashboardFooterBody
        storage={rollup()}
        watching={false}
        offline={false}
        pending={false}
        watcherPending={false}
        onToggleWatcher={noop}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
