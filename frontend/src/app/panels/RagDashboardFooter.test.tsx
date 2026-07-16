// @vitest-environment happy-dom
//
// Render contract for the FOOTER strip body (rag-job-dashboard W02.P04.S12; binding
// Figma RagJobDashboard footer). The body is PURE over the storage rollup + the
// watcher/offline state and the two action callbacks; the zero-prop wrapper wires
// the ops-state read and the watcher seams. Assertions pin the humanized stat cells
// (plain language, no internal vocabulary), the live/orphaned split, the surveyed-
// slice lower-bound note, the watcher toggle + label, Refresh, and the offline state.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RagDashboardFooterBody } from "./RagDashboardFooter";
import type { RagStorageRollup } from "../../stores/server/ragControl";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { formatBytes, formatNumber } from "../../platform/localization/formatters";

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

function FooterHarness({
  storage,
  initialWatching = false,
  offline = false,
  pending = false,
}: {
  storage?: RagStorageRollup;
  initialWatching?: boolean;
  offline?: boolean;
  pending?: boolean;
}) {
  const [watching, setWatching] = useState(initialWatching);
  const [refreshes, setRefreshes] = useState(0);
  return (
    <>
      <RagDashboardFooterBody
        storage={storage}
        watching={watching}
        offline={offline}
        pending={pending}
        watcherPending={false}
        onToggleWatcher={setWatching}
        onRefresh={() => setRefreshes((count) => count + 1)}
      />
      <output data-watching-observation>{watching ? "on" : "off"}</output>
      <output data-refresh-observation>{refreshes}</output>
    </>
  );
}

describe("RagDashboardFooterBody (binding RagJobDashboard footer)", () => {
  it("renders humanized stat cells in plain language", () => {
    render(<FooterHarness storage={rollup()} />);
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
    render(<FooterHarness storage={rollup()} />);
    expect(screen.getByText("2 active, 1 inactive")).toBeTruthy();
  });

  it("states the surveyed-slice lower bound when truncated", () => {
    render(
      <FooterHarness
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
      />,
    );
    expect(screen.getByText(/Covering 1 of 10 projects/)).toBeTruthy();
  });

  it("renders the watcher toggle with its state label and fires the toggle", () => {
    render(<FooterHarness storage={rollup()} initialWatching />);
    expect(screen.getByText("Watching for changes")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(
      screen.getByText("off", { selector: "[data-watching-observation]" }),
    ).toBeTruthy();
  });

  it("disables the watcher toggle when offline and shows the degraded stats", () => {
    const { container } = render(<FooterHarness storage={undefined} offline />);
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Not watching")).toBeTruthy();
  });

  it("holds a reading line while the storage read is pending (not offline)", () => {
    // Distinct from offline: the service is up but the rollup has not arrived yet —
    // a quiet reading line, never the degraded card or a wall of absent dashes.
    render(<FooterHarness storage={undefined} pending />);
    expect(screen.getByText("Loading storage details…")).toBeTruthy();
  });

  it("states storage unavailable honestly when up but the rollup is absent", () => {
    // Up, settled, but no rollup served (a backend that does not survey): one honest
    // sentence, not a fabricated zero.
    const { container } = render(<FooterHarness storage={undefined} />);
    expect(screen.getByText("Storage details are unavailable.")).toBeTruthy();
    // Not the offline degraded card — the watcher stays enabled.
    expect(container.querySelector('[data-state-block="degraded"]')).toBeNull();
    const toggle = screen.getByRole("switch", { name: "Watch for changes" });
    expect(toggle.hasAttribute("disabled")).toBe(false);
  });

  it("fires Refresh", () => {
    render(<FooterHarness storage={rollup()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      screen.getByText("1", { selector: "[data-refresh-observation]" }),
    ).toBeTruthy();
  });

  it("reacts in place with locale-aware number and byte formatting", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <FooterHarness storage={rollup()} />
      </I18nextProvider>,
    );
    const entries = screen.getByText("Entries").nextElementSibling;
    const disk = screen.getByText("On disk").nextElementSibling;
    expect(entries?.textContent).toBe(formatNumber("en", 12_345));
    expect(disk?.textContent).toBe(formatBytes("en", 1024 * 1024 * 512));
    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText("Entries").nextElementSibling).toBe(entries);
    expect(entries?.textContent).toBe(formatNumber(ltrTestLocale, 12_345));
    expect(disk?.textContent).toBe(formatBytes(ltrTestLocale, 1024 * 1024 * 512));
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText("Entries").nextElementSibling).toBe(entries);
    expect(entries?.textContent).toBe(formatNumber(rtlTestLocale, 12_345));
    expect(disk?.textContent).toBe(formatBytes(rtlTestLocale, 1024 * 1024 * 512));
  });
});
