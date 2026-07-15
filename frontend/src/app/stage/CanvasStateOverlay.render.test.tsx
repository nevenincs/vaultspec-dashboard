// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import type { GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import { normalizeRenderCapability } from "../../stores/view/renderCapability";
import {
  useFilterSidebarStore,
  setFilterSidebarOpen,
} from "../../stores/view/filterSidebar";
import {
  CanvasStateOverlay,
  degradedCanvasMessage,
  resolveCanvasState,
  type CanvasOverlayView,
} from "./CanvasStateOverlay";
import { resolveMessage } from "../../platform/localization/fallback";

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

describe("resolveCanvasState primary states", () => {
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

describe("resolveCanvasState annotations", () => {
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

describe("resolveCanvasState annotation priority", () => {
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

describe("normalizeRenderCapability", () => {
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

const runtime = createTestLocalizationRuntime();

function overlayNode(state: CanvasOverlayView) {
  return (
    <I18nextProvider i18n={runtime}>
      <CanvasStateOverlay state={state} />
    </I18nextProvider>
  );
}

function renderOverlay(state: CanvasOverlayView) {
  return render(overlayNode(state));
}

describe("CanvasStateOverlay primary rendering", () => {
  it("renders nothing when ok with no annotations", () => {
    const { container } = renderOverlay(view({}));
    expect(container.firstChild).toBeNull();
  });

  it("renders the global loader as a centered spinner ring on a scrim", () => {
    const { container } = renderOverlay(
      view({ primary: { kind: "loading-document" } }),
    );
    const loader = container.querySelector('[data-canvas-state="loading-document"]');
    expect(loader).toBeTruthy();
    expect(loader?.querySelector(".animate-spin")).toBeTruthy();
    expect(loader?.querySelector(".sr-only")?.textContent).toBe(
      en.graph.canvas.states.loading,
    );
    expect(loader?.className).toContain("pointer-events-none");
  });

  it("renders empty / unavailable / gpu cards with plain language (no jargon)", () => {
    const { rerender } = renderOverlay(view({ primary: { kind: "empty" } }));
    expect(
      document.querySelector('[data-canvas-state="empty"]')?.textContent,
    ).toContain(en.graph.canvas.emptyStates.noFilterMatches);
    rerender(overlayNode(view({ primary: { kind: "unavailable" } })));
    expect(
      document.querySelector('[data-canvas-state="unavailable"]')?.textContent,
    ).toContain(en.graph.canvas.errors.unavailable);
    rerender(overlayNode(view({ primary: { kind: "gpu-unavailable" } })));
    const gpu = document.querySelector('[data-canvas-state="gpu-unavailable"]');
    expect(gpu?.textContent).toContain(en.graph.canvas.errors.graphicsTitle);
    expect(gpu?.textContent).toContain(en.graph.canvas.errors.graphicsMessage);
  });

  it("renders context-lost with the spinner idiom + a brief label", () => {
    renderOverlay(view({ primary: { kind: "context-lost" } }));
    const node = document.querySelector('[data-canvas-state="context-lost"]');
    expect(node?.textContent).toContain(en.graph.canvas.states.restoring);
    expect(node?.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("CanvasStateOverlay annotation rendering", () => {
  it("renders the two designed document-links states with their plain copy", () => {
    const { rerender } = renderOverlay(
      view({ annotations: [{ kind: "links-building" }] }),
    );
    expect(
      document.querySelector('[data-canvas-state="links-building"]')?.textContent,
    ).toContain(en.graph.canvas.states.loadingDocumentLinks);
    rerender(overlayNode(view({ annotations: [{ kind: "links-refreshing" }] })));
    const refreshing = document.querySelector('[data-canvas-state="links-refreshing"]');
    expect(refreshing?.textContent).toBe(
      en.graph.canvas.states.refreshingDocumentLinks,
    );
    expect(refreshing?.className).toContain("text-ink-muted");
    expect(refreshing?.className).not.toContain("border");
  });

  it("renders the truncation chip with tabular counts and a filter affordance that opens the filter plane", () => {
    renderOverlay(
      view({
        annotations: [
          { kind: "truncated", total: 8700, returned: 5000, reason: "ceiling" },
        ],
      }),
    );
    const chip = document.querySelector('[data-canvas-state="truncated"]');
    expect(chip?.textContent).toContain("5,000");
    expect(chip?.textContent).toContain("8,700");
    const counts = chip?.querySelectorAll("[data-tabular]");
    expect(counts?.length).toBe(1);
    expect(useFilterSidebarStore.getState().open).toBe(false);
    const openFilters = chip?.querySelector("button");
    expect(openFilters?.textContent).toBe(en.common.actions.openFilters);
    openFilters?.focus();
    fireEvent.click(openFilters!);
    expect(useFilterSidebarStore.getState().open).toBe(true);
    expect(document.activeElement).toBe(openFilters);
  });

  it("stacks co-occurring annotation chips (each legible)", () => {
    const { container } = renderOverlay(
      view({
        annotations: [
          { kind: "degraded", tiers: ["temporal"], reasons: {} },
          { kind: "truncated", total: 9000, returned: 5000, reason: "ceiling" },
          { kind: "links-refreshing" },
        ],
      }),
    );
    expect(container.querySelector('[data-canvas-state="degraded"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-state="truncated"]')).toBeTruthy();
    expect(
      container.querySelector('[data-canvas-state="links-refreshing"]'),
    ).toBeTruthy();
  });

  it("maps an unknown condition to safe recovery copy", () => {
    renderOverlay(
      view({ annotations: [{ kind: "unknown-tier", tiers: ["quantum"] }] }),
    );
    const chip = document.querySelector('[data-canvas-state="unknown-tier"]');
    expect(chip?.textContent).toBe(en.graph.canvas.errors.partialUnavailable);
    expect(chip?.textContent).not.toContain("quantum");
  });
});

describe("degradedCanvasMessage", () => {
  it("selects safe loading or recovery descriptors without carrying input values", () => {
    const loading = degradedCanvasMessage(["structural"], {
      structural: "structural tier building",
    });
    const unavailable = degradedCanvasMessage(["structural", "temporal"], {
      structural: "structural tier building",
      temporal: "engine:offline",
    });

    expect(resolveMessage(runtime, loading)).toBe(
      en.graph.canvas.states.loadingDetails,
    );
    expect(resolveMessage(runtime, unavailable)).toBe(
      en.graph.canvas.errors.partialUnavailable,
    );
    expect(loading.values).toBeUndefined();
    expect(unavailable.values).toBeUndefined();
  });
});
