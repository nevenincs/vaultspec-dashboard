// @vitest-environment happy-dom
//
// The chrome-layer realization of the node-canvas ADR "States": each designed
// state renders the right copy and a non-color cue, and the non-blocking
// annotations (degraded / truncated / unknown-tier) never blank the field —
// they are corner banners over a live canvas, while the loading/empty states
// center. The overlay is a dumb projection: it renders the resolved state only.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CanvasStateOverlay, degradedBannerCopy } from "./CanvasStateOverlay";

afterEach(cleanup);

describe("CanvasStateOverlay (designed canvas states)", () => {
  it("renders nothing when the canvas is ok (no overlay over a healthy field)", () => {
    const { container } = render(<CanvasStateOverlay state={{ kind: "ok" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the empty state as the binding no-results card", () => {
    render(<CanvasStateOverlay state={{ kind: "empty" }} />);
    const node = document.querySelector('[data-canvas-state="empty"]');
    expect(node).toBeTruthy();
    expect(node?.textContent).toContain("No nodes match the current filter");
    // The card is pointer-transparent so it never steals the canvas pointer.
    expect(node?.className).toContain("pointer-events-none");
  });

  it("renders the binding 'Loading...' card for every loading state", () => {
    const { rerender } = render(
      <CanvasStateOverlay state={{ kind: "loading-constellation" }} />,
    );
    expect(
      document.querySelector('[data-canvas-state="loading-constellation"]')
        ?.textContent,
    ).toContain("Loading...");
    rerender(<CanvasStateOverlay state={{ kind: "loading-document" }} />);
    expect(
      document.querySelector('[data-canvas-state="loading-document"]')?.textContent,
    ).toContain("Loading...");
  });

  it("renders the unavailable state as the binding 'Graph is not available' card", () => {
    render(<CanvasStateOverlay state={{ kind: "unavailable" }} />);
    const node = document.querySelector('[data-canvas-state="unavailable"]');
    expect(node?.textContent).toContain("Graph is not available");
    // Centered card, pointer-transparent — it never grabs the canvas.
    expect(node?.className).toContain("pointer-events-none");
  });

  it("renders a degraded tier as a NON-blocking corner banner over the live field", () => {
    render(
      <CanvasStateOverlay
        state={{ kind: "degraded", tiers: ["semantic"], reasons: {} }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    // Names the affected FEATURE in plain language (never the internal tier name)
    // and affirms the graph is still live — never the blocking "Graph is not
    // available" card (which would occlude a working graph).
    expect(banner?.textContent).toContain("Semantic search unavailable");
    expect(banner?.textContent).toContain("the rest of the graph is live");
    expect(banner?.textContent).not.toContain("tier");
    expect(banner?.textContent).not.toContain("Graph is not available");
    // The outer never blanks the canvas; the field stays interactive behind it.
    expect(banner?.className).toContain("pointer-events-none");
  });

  it("frames a transient build (reason 'building') as loading, not unavailable", () => {
    render(
      <CanvasStateOverlay
        state={{
          kind: "degraded",
          tiers: ["declared"],
          reasons: { declared: "declared tier building" },
        }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    expect(banner?.textContent).toContain("Still loading links");
    expect(banner?.textContent).not.toContain("unavailable");
  });

  it("composes a mixed building + down state in plain language", () => {
    render(
      <CanvasStateOverlay
        state={{
          kind: "degraded",
          tiers: ["declared", "semantic"],
          reasons: {
            declared: "declared tier building",
            semantic: "rag service not installed or not started",
          },
        }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    expect(banner?.textContent).toBe(
      "Still loading links; semantic search unavailable — the rest of the graph is live",
    );
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

describe("degradedBannerCopy (plain-language tier copy)", () => {
  it("maps each tier to its plain feature name (no tier jargon)", () => {
    expect(degradedBannerCopy(["semantic"], {})).toBe(
      "Semantic search unavailable — the rest of the graph is live",
    );
    expect(degradedBannerCopy(["declared"], {})).toBe(
      "Links unavailable — the rest of the graph is live",
    );
  });

  it("frames a 'building' reason as loading (transient), not unavailable", () => {
    expect(
      degradedBannerCopy(["declared"], { declared: "declared tier building" }),
    ).toBe("Still loading links…");
  });

  it("composes mixed building + down with plain prose joins", () => {
    expect(
      degradedBannerCopy(["declared", "semantic"], {
        declared: "declared tier building",
        semantic: "rag not started",
      }),
    ).toBe(
      "Still loading links; semantic search unavailable — the rest of the graph is live",
    );
  });

  it("joins multiple down features with 'and'", () => {
    expect(degradedBannerCopy(["declared", "semantic"], {})).toBe(
      "Links and semantic search unavailable — the rest of the graph is live",
    );
  });
});
