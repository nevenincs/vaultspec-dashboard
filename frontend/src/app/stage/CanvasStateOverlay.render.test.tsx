// @vitest-environment happy-dom
//
// The canvas overlay (canvas-overlay-redesign): the resolver returns ONE primary state
// plus the ORDERED set of co-occurring annotations, and the chrome renders the primary
// centered (a boot-idiom spinner for loading) with the annotations stacked at the bottom
// edge. These tests pin the priority order (loading vs links-building/refreshing vs
// truncated vs degraded can co-occur), the two designed document-links states, and the
// truncation chip's filter-open affordance.

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import { normalizeRenderCapability } from "../../stores/view/renderCapability";
import {
  useFilterSidebarStore,
  setFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import {
  CanvasStateOverlay,
  degradedBannerCopy,
  resolveCanvasState,
  type CanvasOverlayView,
} from "./CanvasStateOverlay";

afterEach(() => {
  cleanup();
  setFilterSidebarOpen(false);
});

const liveSlice = { nodes: [{ id: "n1" }], edges: [] } as unknown as GraphSlice;

function availabilityWith(
  degradedTiers: string[],
  reasons: Record<string, string> = {},
): GraphSliceAvailability {
  return {
    loading: false,
    refreshing: false,
    degraded: degradedTiers.length > 0,
    degradedTiers,
    reasons,
  };
}

const base = {
  scope: "wt-1",
  granularity: "document" as const,
  stageSurface: "normal" as const,
  slice: liveSlice,
  queriedScope: "wt-1",
  renderCapability: { status: "ok" as const, recoverable: false },
  availability: availabilityWith([]),
};

/** The kinds of the resolved annotations, in order. */
const annotationKinds = (view: CanvasOverlayView) =>
  view.annotations.map((a) => a.kind);

describe("resolveCanvasState — primary (blocking/centered) states", () => {
  it("awaits scope before any data state when no worktree is resolved", () => {
    expect(resolveCanvasState({ ...base, scope: null }).primary.kind).toBe(
      "awaiting-scope",
    );
  });

  it("is a scope-appropriate loading state while the first keyframe is in flight", () => {
    expect(
      resolveCanvasState({
        ...base,
        slice: null,
        availability: { ...availabilityWith([]), loading: true },
      }).primary.kind,
    ).toBe("loading-document");
    expect(
      resolveCanvasState({
        ...base,
        granularity: "feature",
        slice: null,
        availability: { ...availabilityWith([]), loading: true },
      }).primary.kind,
    ).toBe("loading-constellation");
  });

  it("is unavailable once a query settled with no slice", () => {
    expect(resolveCanvasState({ ...base, slice: null }).primary.kind).toBe(
      "unavailable",
    );
  });

  it("takes render-capability precedence over data states", () => {
    expect(
      resolveCanvasState({
        ...base,
        slice: null,
        availability: { ...availabilityWith([]), loading: true },
        renderCapability: { status: "unavailable", recoverable: false },
      }).primary.kind,
    ).toBe("gpu-unavailable");
    expect(
      resolveCanvasState({
        ...base,
        renderCapability: { status: "context-lost", recoverable: true },
      }).primary.kind,
    ).toBe("context-lost");
  });

  it("carries no annotations while a blocking primary occludes the field", () => {
    const view = resolveCanvasState({ ...base, scope: null });
    expect(view.annotations).toEqual([]);
  });
});

describe("resolveCanvasState — annotations over a live field", () => {
  it("drops a semantic-only degradation (search's concern, not the graph stage)", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["semantic"], { semantic: "rag not started" }),
    });
    expect(view.primary.kind).toBe("ok");
    expect(view.annotations).toEqual([]);
  });

  it("surfaces a degraded EDGE tier as a degraded annotation, dropping semantic", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["semantic", "temporal"], {
        temporal: "index not built",
      }),
    });
    expect(annotationKinds(view)).toEqual(["degraded"]);
    const degraded = view.annotations[0];
    if (degraded.kind !== "degraded") throw new Error("expected degraded");
    expect(degraded.tiers).toEqual(["temporal"]);
  });

  it("splits declared 'building' into the first-time links-building state (not degraded)", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["declared"], {
        declared: "declared tier building",
      }),
    });
    expect(annotationKinds(view)).toEqual(["links-building"]);
  });

  it("splits declared 'refreshing' into the quiet links-refreshing state", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["declared"], {
        declared: "declared tier refreshing",
      }),
    });
    expect(annotationKinds(view)).toEqual(["links-refreshing"]);
  });

  it("keeps a genuinely-down declared tier in the generic degraded annotation", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["declared"], { declared: "core unreachable" }),
    });
    expect(annotationKinds(view)).toEqual(["degraded"]);
  });

  it("surfaces an unknown edge tier as a data-error annotation", () => {
    const view = resolveCanvasState({
      ...base,
      availability: availabilityWith(["quantum"], { quantum: "??" }),
    });
    expect(annotationKinds(view)).toEqual(["unknown-tier"]);
  });
});

describe("resolveCanvasState — co-occurrence + priority (canvas-overlay-redesign #4)", () => {
  it("stacks degraded + truncated + links-refreshing + refreshing in priority order", () => {
    const truncatedSlice = {
      ...liveSlice,
      truncated: { total_nodes: 9000, returned_nodes: 5000, reason: "node ceiling" },
    } as unknown as GraphSlice;
    const view = resolveCanvasState({
      ...base,
      slice: truncatedSlice,
      availability: {
        ...availabilityWith(["structural", "declared"], {
          structural: "index not built",
          declared: "declared tier refreshing",
        }),
        refreshing: true,
      },
    });
    // declared→links-refreshing (split out); structural→degraded; + truncated + refresh.
    expect(annotationKinds(view)).toEqual([
      "degraded",
      "truncated",
      "links-refreshing",
      "refreshing",
    ]);
  });

  it("shows links-building and truncated together (first-fold on a capped corpus)", () => {
    const truncatedSlice = {
      ...liveSlice,
      truncated: { total_nodes: 8700, returned_nodes: 5000, reason: "node ceiling" },
    } as unknown as GraphSlice;
    const view = resolveCanvasState({
      ...base,
      slice: truncatedSlice,
      availability: availabilityWith(["declared"], {
        declared: "declared tier building",
      }),
    });
    expect(annotationKinds(view)).toEqual(["links-building", "truncated"]);
  });
});

describe("normalizeRenderCapability (trust-boundary signal decode)", () => {
  it("maps the software-fallback signal to render-OK", () => {
    expect(normalizeRenderCapability({ state: "ok", recoverable: false })).toEqual({
      status: "ok",
      recoverable: false,
    });
  });

  it("decodes context-lost + unavailable, defaults garbage to OK", () => {
    expect(
      normalizeRenderCapability({ state: "context-lost", recoverable: true }),
    ).toEqual({ status: "context-lost", recoverable: true });
    expect(
      normalizeRenderCapability({ state: "unavailable", recoverable: false }),
    ).toEqual({ status: "unavailable", recoverable: false });
    expect(normalizeRenderCapability(null)).toEqual({
      status: "ok",
      recoverable: false,
    });
  });
});

const view = (over: Partial<CanvasOverlayView>): CanvasOverlayView => ({
  primary: { kind: "ok" },
  annotations: [],
  ...over,
});

describe("CanvasStateOverlay — primary rendering", () => {
  it("renders nothing when ok with no annotations", () => {
    const { container } = render(<CanvasStateOverlay state={view({})} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the global loader as a centered spinner ring on a scrim — no 'Loading...' text", () => {
    const { container } = render(
      <CanvasStateOverlay state={view({ primary: { kind: "loading-document" } })} />,
    );
    const loader = container.querySelector('[data-canvas-state="loading-document"]');
    expect(loader).toBeTruthy();
    expect(loader?.textContent).not.toContain("Loading...");
    // The boot-idiom ring (kit Spinner) is present; the label is sr-only.
    expect(loader?.querySelector(".animate-spin")).toBeTruthy();
    expect(loader?.querySelector(".sr-only")?.textContent).toBe("Loading graph");
    // Attenuated scrim, pointer-transparent so the canvas is never grabbed.
    expect(loader?.className).toContain("pointer-events-none");
  });

  it("renders empty / unavailable / gpu cards with plain language (no jargon)", () => {
    const { rerender } = render(
      <CanvasStateOverlay state={view({ primary: { kind: "empty" } })} />,
    );
    expect(
      document.querySelector('[data-canvas-state="empty"]')?.textContent,
    ).toContain("No nodes match the current filter");
    rerender(<CanvasStateOverlay state={view({ primary: { kind: "unavailable" } })} />);
    expect(
      document.querySelector('[data-canvas-state="unavailable"]')?.textContent,
    ).toContain("Graph is not available");
    rerender(
      <CanvasStateOverlay state={view({ primary: { kind: "gpu-unavailable" } })} />,
    );
    const gpu = document.querySelector('[data-canvas-state="gpu-unavailable"]');
    expect(gpu?.textContent).toContain("Graphics unavailable");
    expect(gpu?.textContent).not.toContain("WebGL");
  });

  it("renders context-lost with the spinner idiom + a brief label", () => {
    render(<CanvasStateOverlay state={view({ primary: { kind: "context-lost" } })} />);
    const node = document.querySelector('[data-canvas-state="context-lost"]');
    expect(node?.textContent).toContain("Restoring graphics");
    expect(node?.querySelector(".animate-spin")).toBeTruthy();
  });
});

describe("CanvasStateOverlay — annotation rendering", () => {
  it("renders the two designed document-links states with their plain copy", () => {
    const { rerender } = render(
      <CanvasStateOverlay
        state={view({ annotations: [{ kind: "links-building" }] })}
      />,
    );
    expect(
      document.querySelector('[data-canvas-state="links-building"]')?.textContent,
    ).toContain("Document links are loading for the first time");
    rerender(
      <CanvasStateOverlay
        state={view({ annotations: [{ kind: "links-refreshing" }] })}
      />,
    );
    const refreshing = document.querySelector('[data-canvas-state="links-refreshing"]');
    expect(refreshing?.textContent).toBe("Document links are being refreshed.");
    // The refreshing state is the quiet, unobtrusive caption — attenuated ink, no border.
    expect(refreshing?.className).toContain("text-ink-faint");
    expect(refreshing?.className).not.toContain("border");
  });

  it("renders the truncation chip with tabular counts and a filter affordance that opens the filter plane", () => {
    render(
      <CanvasStateOverlay
        state={view({
          annotations: [
            { kind: "truncated", total: 8700, returned: 5000, reason: "ceiling" },
          ],
        })}
      />,
    );
    const chip = document.querySelector('[data-canvas-state="truncated"]');
    expect(chip?.textContent).toContain("Showing");
    // Counts are data-bearing → tabular numerals, thousands-grouped.
    const counts = chip?.querySelectorAll("[data-tabular]");
    expect(counts?.length).toBe(2);
    expect(chip?.textContent).toContain("5,000");
    expect(chip?.textContent).toContain("8,700");
    // The affordance INVOKES the existing open-filter seam (it authors no facet).
    expect(useFilterSidebarStore.getState().open).toBe(false);
    const refine = chip?.querySelector("button");
    expect(refine?.textContent).toContain("Refine");
    fireEvent.click(refine!);
    expect(useFilterSidebarStore.getState().open).toBe(true);
  });

  it("stacks co-occurring annotation chips (each legible)", () => {
    const { container } = render(
      <CanvasStateOverlay
        state={view({
          annotations: [
            { kind: "degraded", tiers: ["temporal"], reasons: {} },
            { kind: "truncated", total: 9000, returned: 5000, reason: "ceiling" },
            { kind: "links-refreshing" },
          ],
        })}
      />,
    );
    expect(container.querySelector('[data-canvas-state="degraded"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-state="truncated"]')).toBeTruthy();
    expect(
      container.querySelector('[data-canvas-state="links-refreshing"]'),
    ).toBeTruthy();
  });

  it("surfaces an unknown tier as a data error, not a degraded view", () => {
    render(
      <CanvasStateOverlay
        state={view({ annotations: [{ kind: "unknown-tier", tiers: ["quantum"] }] })}
      />,
    );
    const chip = document.querySelector('[data-canvas-state="unknown-tier"]');
    expect(chip?.textContent).toContain("quantum");
    expect(chip?.textContent).toContain("data error");
  });
});

describe("degradedBannerCopy (plain-language tier copy)", () => {
  it("maps each edge tier to its plain feature name (no tier jargon)", () => {
    expect(degradedBannerCopy(["temporal"], {})).toBe(
      "Timeline unavailable — the rest of the graph is live",
    );
    expect(degradedBannerCopy(["structural"], {})).toBe(
      "Mentions unavailable — the rest of the graph is live",
    );
  });

  it("frames a 'building' reason as loading (transient), not unavailable", () => {
    expect(
      degradedBannerCopy(["structural"], { structural: "structural tier building" }),
    ).toBe("Still loading mentions…");
  });

  it("joins multiple down features with 'and'", () => {
    expect(degradedBannerCopy(["structural", "temporal"], {})).toBe(
      "Mentions and timeline unavailable — the rest of the graph is live",
    );
  });
});
