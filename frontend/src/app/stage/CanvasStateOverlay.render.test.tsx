// @vitest-environment happy-dom
//
// The chrome-layer realization of the node-canvas ADR "States": each designed
// state renders the right copy and a non-color cue, and the non-blocking
// annotations (degraded / truncated / unknown-tier) never blank the field —
// they are corner banners over a live canvas, while the loading/empty states
// center. The overlay is a dumb projection: it renders the resolved state only.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CanvasStateOverlay } from "./CanvasStateOverlay";

afterEach(cleanup);

describe("CanvasStateOverlay (designed canvas states)", () => {
  it("renders nothing when the canvas is ok (no overlay over a healthy field)", () => {
    const { container } = render(<CanvasStateOverlay state={{ kind: "ok" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("offers the empty/no-graph state as an approachable invitation", () => {
    render(<CanvasStateOverlay state={{ kind: "empty" }} />);
    const node = document.querySelector('[data-canvas-state="empty"]');
    expect(node).toBeTruthy();
    expect(node?.textContent).toContain("no second brain yet");
    // The next step is offered in mono (a real command), not a dead end.
    expect(screen.getByText("vaultspec-core install").tagName).toBe("CODE");
  });

  it("spells the scope-appropriate loading copy", () => {
    const { rerender } = render(
      <CanvasStateOverlay state={{ kind: "loading-constellation" }} />,
    );
    expect(
      document.querySelector('[data-canvas-state="loading-constellation"]')
        ?.textContent,
    ).toContain("constellation");
    rerender(<CanvasStateOverlay state={{ kind: "loading-document" }} />);
    expect(
      document.querySelector('[data-canvas-state="loading-document"]')?.textContent,
    ).toContain("document graph");
  });

  it("renders a degraded tier as a non-blocking banner naming the tier (non-color cue)", () => {
    render(
      <CanvasStateOverlay
        state={{ kind: "degraded", tiers: ["semantic"], reasons: {} }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    expect(banner?.textContent).toContain("semantic");
    expect(banner?.textContent).toContain("unavailable");
    // The banner inner is pointer-interactive but the outer never blanks the canvas.
    expect(banner?.className).toContain("pointer-events-none");
  });

  it("renders the truncated affordance with tabular counts and a refine prompt", () => {
    render(
      <CanvasStateOverlay
        state={{ kind: "truncated", total: 4200, returned: 2000, reason: "ceiling" }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="truncated"]');
    expect(banner?.textContent).toContain("narrowed");
    expect(banner?.textContent).toContain("refine your view");
    // Counts are data-bearing → tabular numerals.
    const counts = banner?.querySelectorAll("[data-tabular]");
    expect(counts?.length).toBe(2);
    expect(banner?.textContent).toContain("4200");
    expect(banner?.textContent).toContain("2000");
  });

  it("surfaces an unknown tier as a data error, not a degraded view", () => {
    render(<CanvasStateOverlay state={{ kind: "unknown-tier", tiers: ["quantum"] }} />);
    const banner = document.querySelector('[data-canvas-state="unknown-tier"]');
    expect(banner?.textContent).toContain("quantum");
    expect(banner?.textContent).toContain("data error");
  });
});
