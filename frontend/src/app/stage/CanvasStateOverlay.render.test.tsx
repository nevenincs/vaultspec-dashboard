// @vitest-environment happy-dom
//
// The chrome-layer realization of the node-canvas ADR "States": each designed
// state renders the right copy and a non-color cue, and the non-blocking
// annotations (degraded / truncated / unknown-tier) never blank the field —
// they are corner banners over a live canvas, while the loading/empty states
// center. The overlay is a dumb projection: it renders the resolved state only.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import { normalizeRenderCapability } from "../../stores/view/renderCapability";
import {
  CanvasStateOverlay,
  degradedBannerCopy,
  resolveCanvasState,
} from "./CanvasStateOverlay";

afterEach(cleanup);

const liveSlice = { nodes: [{ id: "n1" }], edges: [] } as unknown as GraphSlice;

function availabilityWith(
  degradedTiers: string[],
  reasons: Record<string, string> = {},
): GraphSliceAvailability {
  return {
    loading: false,
    degraded: degradedTiers.length > 0,
    degradedTiers,
    reasons,
  };
}

describe("resolveCanvasState (graph stage surfaces only edge tiers)", () => {
  const base = {
    scope: "wt-1",
    granularity: "document" as const,
    stageSurface: "normal" as const,
    slice: liveSlice,
    queriedScope: "wt-1",
    renderCapability: { status: "ok" as const, recoverable: false },
  };

  it("drops a semantic-only degradation — semantic is search's concern, not the graph stage", () => {
    const state = resolveCanvasState({
      ...base,
      availability: availabilityWith(["semantic"], {
        semantic: "rag service not started",
      }),
    });
    // The engine never mints semantic graph edges (ADR D3.5), so a degraded
    // semantic SEARCH tier must not banner the graph stage at all.
    expect(state.kind).toBe("ok");
  });

  it("still surfaces a degraded EDGE tier as a non-blocking banner", () => {
    const state = resolveCanvasState({
      ...base,
      availability: availabilityWith(["temporal"], { temporal: "index not built" }),
    });
    expect(state.kind).toBe("degraded");
    if (state.kind !== "degraded") throw new Error("expected degraded");
    expect(state.tiers).toEqual(["temporal"]);
  });

  it("drops semantic from a mixed degradation, keeping the edge tier", () => {
    const state = resolveCanvasState({
      ...base,
      availability: availabilityWith(["semantic", "temporal"]),
    });
    expect(state.kind).toBe("degraded");
    if (state.kind !== "degraded") throw new Error("expected degraded");
    expect(state.tiers).toEqual(["temporal"]);
  });
});

describe("resolveCanvasState — render-capability (G1: WebGL/GPU degradation)", () => {
  const base = {
    scope: "wt-1",
    granularity: "document" as const,
    stageSurface: "normal" as const,
    slice: liveSlice,
    queriedScope: "wt-1",
    availability: availabilityWith([]),
  };

  it("surfaces gpu-unavailable (no hardware graphics)", () => {
    expect(
      resolveCanvasState({
        ...base,
        renderCapability: { status: "unavailable", recoverable: false },
      }).kind,
    ).toBe("gpu-unavailable");
  });

  it("surfaces context-lost (transient, restoring)", () => {
    expect(
      resolveCanvasState({
        ...base,
        renderCapability: { status: "context-lost", recoverable: true },
      }).kind,
    ).toBe("context-lost");
  });

  it("treats ok (incl software-fallback) as render-OK — falls through to data states", () => {
    expect(
      resolveCanvasState({
        ...base,
        renderCapability: { status: "ok", recoverable: false },
      }).kind,
    ).toBe("ok");
  });

  it("takes precedence over a no-slice loading data state (render is moot)", () => {
    expect(
      resolveCanvasState({
        ...base,
        slice: null,
        availability: { ...availabilityWith([]), loading: true },
        renderCapability: { status: "unavailable", recoverable: false },
      }).kind,
    ).toBe("gpu-unavailable");
  });
});

describe("normalizeRenderCapability (trust-boundary signal decode)", () => {
  it("maps the software-fallback signal to render-OK (state:ok)", () => {
    expect(
      normalizeRenderCapability({
        state: "ok",
        recoverable: false,
        reason: "software-fallback",
      }),
    ).toEqual({ status: "ok", recoverable: false });
  });

  it("decodes context-lost (recoverable) + unavailable (hard)", () => {
    expect(
      normalizeRenderCapability({ state: "context-lost", recoverable: true }),
    ).toEqual({ status: "context-lost", recoverable: true });
    expect(
      normalizeRenderCapability({ state: "unavailable", recoverable: false }),
    ).toEqual({ status: "unavailable", recoverable: false });
  });

  it("defaults garbage / unknown state to render-OK", () => {
    expect(normalizeRenderCapability(null)).toEqual({
      status: "ok",
      recoverable: false,
    });
    expect(normalizeRenderCapability({ state: "bogus" })).toEqual({
      status: "ok",
      recoverable: false,
    });
  });
});

describe("CanvasStateOverlay — render-capability states", () => {
  it("renders gpu-unavailable as a centered 'Graphics unavailable' card (no jargon)", () => {
    render(<CanvasStateOverlay state={{ kind: "gpu-unavailable" }} />);
    const node = document.querySelector('[data-canvas-state="gpu-unavailable"]');
    expect(node?.textContent).toContain("Graphics unavailable");
    expect(node?.textContent).not.toContain("WebGL");
    expect(node?.className).toContain("pointer-events-none");
  });

  it("renders context-lost as a transient 'Restoring graphics…' card", () => {
    render(<CanvasStateOverlay state={{ kind: "context-lost" }} />);
    const node = document.querySelector('[data-canvas-state="context-lost"]');
    expect(node?.textContent).toContain("Restoring graphics");
    expect(node?.textContent).not.toContain("WebGL");
  });
});

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
        state={{ kind: "degraded", tiers: ["temporal"], reasons: {} }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    // Names the affected FEATURE in plain language (never the internal tier name)
    // and affirms the graph is still live — never the blocking "Graph is not
    // available" card (which would occlude a working graph).
    expect(banner?.textContent).toContain("Timeline unavailable");
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
          tiers: ["declared", "temporal"],
          reasons: {
            declared: "declared tier building",
            temporal: "temporal index not built",
          },
        }}
      />,
    );
    const banner = document.querySelector('[data-canvas-state="degraded"]');
    expect(banner?.textContent).toBe(
      "Still loading links; timeline unavailable — the rest of the graph is live",
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
  it("maps each edge tier to its plain feature name (no tier jargon)", () => {
    expect(degradedBannerCopy(["temporal"], {})).toBe(
      "Timeline unavailable — the rest of the graph is live",
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
      degradedBannerCopy(["declared", "temporal"], {
        declared: "declared tier building",
        temporal: "temporal index not built",
      }),
    ).toBe("Still loading links; timeline unavailable — the rest of the graph is live");
  });

  it("joins multiple down features with 'and'", () => {
    expect(degradedBannerCopy(["declared", "temporal"], {})).toBe(
      "Links and timeline unavailable — the rest of the graph is live",
    );
  });
});
