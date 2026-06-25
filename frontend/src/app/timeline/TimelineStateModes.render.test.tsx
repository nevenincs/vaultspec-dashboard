// @vitest-environment happy-dom
//
// The timeline's DESIGNED transient/empty/degraded modes now compose the shared
// state-mode kit (state-mode-uniformity ADR): loading is a UI-ONLY `Skeleton` with
// NO visible text (the label is the screen-reader name only), and empty/degraded are
// the shared `StateBlock` (one sanctioned glyph + one plain sentence). These tests
// drive the real `deriveTimelineSurfaceChromeView` output through the surface's
// `TimelineStateModes` so the timeline renders each mode through the ONE canonical
// kit — uniform pulse, tone, and glyph with every other surface.

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { deriveTimelineSurfaceChromeView } from "../../stores/server/queries";
import { TimelineStateModes } from "./Timeline";

afterEach(cleanup);

describe("Timeline state modes (composed from the shared kit)", () => {
  it("LOADING renders an accessible skeleton with NO visible text", () => {
    const chrome = deriveTimelineSurfaceChromeView({
      scopePresent: true,
      loading: true,
      errored: false,
      autoFitPending: false,
      hasMarks: false,
      surface: "normal",
    });
    const { container } = render(createElement(TimelineStateModes, { chrome }));

    const wrapper = container.querySelector("[data-timeline-loading]");
    expect(wrapper).toBeTruthy();

    const skeleton = wrapper!.querySelector("[data-skeleton]");
    expect(skeleton).toBeTruthy();
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    // The uniform kit pulse, not a per-bar spinner.
    expect(skeleton!.className).toContain("animate-pulse-live");
    // Several shimmer fills mimic the axis + dot rhythm.
    expect(container.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(2);

    // The label is the screen-reader name ONLY — never visible body copy.
    const label = screen.getByText("reading the timeline…");
    expect(label.className).toContain("sr-only");
    // No visible loading text leaks outside the sr-only span.
    expect(wrapper!.textContent).toBe("reading the timeline…");
    expect(wrapper!.querySelector(".sr-only")!.textContent).toBe(
      "reading the timeline…",
    );

    // Empty/degraded are not rendered in the loading mode.
    expect(container.querySelector('[data-state-block="empty"]')).toBeNull();
    expect(container.querySelector('[data-state-block="degraded"]')).toBeNull();
  });

  it("EMPTY renders the shared glyph + one plain sentence (no skeleton)", () => {
    const chrome = deriveTimelineSurfaceChromeView({
      scopePresent: true,
      loading: false,
      errored: false,
      autoFitPending: false,
      hasMarks: false,
      surface: "lifecycle-sparse",
    });
    const { container } = render(createElement(TimelineStateModes, { chrome }));

    const wrapper = container.querySelector("[data-timeline-empty]");
    expect(wrapper).toBeTruthy();
    const block = wrapper!.querySelector('[data-state-block="empty"]');
    expect(block).toBeTruthy();
    expect(block!.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("lineage appears as documents gain dates")).toBeTruthy();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });

  it("DEGRADED renders the shared inline caution notice (no raw reason)", () => {
    const chrome = deriveTimelineSurfaceChromeView({
      scopePresent: true,
      loading: false,
      errored: false,
      autoFitPending: false,
      hasMarks: true,
      surface: "reconnecting",
    });
    const { container } = render(createElement(TimelineStateModes, { chrome }));

    const wrapper = container.querySelector("[data-timeline-degraded]");
    expect(wrapper).toBeTruthy();
    const block = wrapper!.querySelector('[data-state-block="degraded"]');
    expect(block).toBeTruthy();
    expect(block!.getAttribute("role")).toBe("status");
    expect(block!.querySelector("svg")).toBeTruthy();
    // The compact inline notice rides the sunken pill.
    expect(block!.className).toContain("bg-paper-sunken");
    expect(screen.getByText("reconnecting — showing the last lineage")).toBeTruthy();
    // No engineering vocabulary leaks into the degraded copy.
    expect(block!.textContent).not.toMatch(/tier|stream|service\.json/i);
  });
});
