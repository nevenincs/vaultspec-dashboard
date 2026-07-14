// @vitest-environment happy-dom
//
// FrameworkStatusCluster render contract (activity-rail-realignment S07). These
// are WIRE-FREE UI unit tests: the pure `StatusChip` takes the served chip
// projection + the open flag + the shared toggle as PROPS, so the test drives the
// cluster's presentation and dispatch seam without touching the engine wire (the
// tone DERIVATION is proven by the frameworkStatus stores unit tests; the
// live-wire proof lives in the online suite). Core vitest matchers only (no
// jest-dom in this repo).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FrameworkStatusChip } from "../../stores/server/queries";
import { StatusChip } from "./FrameworkStatusCluster";

afterEach(cleanup);

function noopFocusZone() {
  return {
    chipRef: () => {},
    tabIndex: 0 as const,
    onKeyDown: () => {},
    onFocus: () => {},
  };
}

function renderChip(
  chip: FrameworkStatusChip,
  over: { open?: boolean; onToggle?: () => void } = {},
) {
  const onToggle = over.onToggle ?? (() => {});
  return render(
    <StatusChip
      chip={chip}
      open={over.open ?? false}
      onToggle={onToggle}
      {...noopFocusZone()}
    />,
  );
}

describe("StatusChip", () => {
  it("renders the plain-language label and states the health in its accessible name", () => {
    renderChip({ tone: "attention", label: "Approvals", count: 3 });
    const chip = screen.getByRole("button", { name: "Approvals — attention" });
    expect(chip).toBeTruthy();
    // The served count rides the chip when present.
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("maps each tone to its bound status-dot fill (never raw hex)", () => {
    const toneToClass: Record<FrameworkStatusChip["tone"], string> = {
      ok: "bg-state-active",
      attention: "bg-state-stale",
      down: "bg-state-broken",
      unknown: "bg-ink-faint",
    };
    for (const [tone, cls] of Object.entries(toneToClass)) {
      const { container } = renderChip({
        tone: tone as FrameworkStatusChip["tone"],
        label: "Backend health",
      });
      const dot = container.querySelector("[data-framework-chip] span[aria-hidden]");
      expect(dot?.className).toContain(cls);
      cleanup();
    }
  });

  it("omits the count when the projection served none", () => {
    const { container } = renderChip({ tone: "ok", label: "Vault health" });
    // Only the dot span (aria-hidden) + the label span — no count node.
    expect(container.querySelector("[data-framework-chip]")?.textContent).toBe(
      "Vault health",
    );
  });

  it("reflects the open panel via aria-pressed", () => {
    renderChip({ tone: "ok", label: "Search service" }, { open: true });
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("dispatches the shared panel toggle on click", () => {
    const onToggle = vi.fn();
    renderChip({ tone: "unknown", label: "Search service" }, { onToggle });
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
