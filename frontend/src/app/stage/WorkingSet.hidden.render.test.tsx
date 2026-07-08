// @vitest-environment happy-dom
//
// GS-006 chip-trail honesty: a working-set chip whose node is FILTERED OUT of the
// visible set (the same visibleNodeIds truth GS-004 uses on the canvas) renders DIMMED
// with a "hidden by filter" affordance, so the trail never implies a filter-hidden node
// is on stage at full strength. Presentation-only — the working-set membership itself is
// unchanged. Rendered directly (the trail is pure view-store + component; no wire).

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearWorkingSet, expandWorkingSet } from "../../stores/view/workingSet";
import { WorkingSet } from "./WorkingSet";

describe("WorkingSet chip-trail filter-hidden dimming (GS-006)", () => {
  beforeEach(() => {
    clearWorkingSet();
  });
  afterEach(() => {
    cleanup();
    clearWorkingSet();
  });

  it("dims the chip of a filtered-out node and leaves a visible node's chip untouched", () => {
    expandWorkingSet("doc:alpha");
    expandWorkingSet("doc:beta");

    // Only doc:alpha is in the visible set → doc:beta's chip is filter-hidden.
    const { container } = render(
      <WorkingSet visibleNodeIds={new Set(["doc:alpha"])} />,
    );

    // Exactly one chip is marked hidden, dimmed, and carries the affordance.
    const hidden = container.querySelectorAll("[data-working-set-hidden]");
    expect(hidden).toHaveLength(1);
    const hiddenChip = hidden[0] as HTMLElement;
    expect(hiddenChip.className).toContain("opacity-50");
    expect(hiddenChip.getAttribute("title")).toBe("Hidden by the active filter");
    expect(hiddenChip.getAttribute("aria-label")).toContain(
      "Hidden by the active filter",
    );

    // The visible node's chip (its collapse button labels it) is NOT dimmed.
    const visibleCollapse = container.querySelector('[aria-label="Collapse alpha"]')!;
    const visibleChip = visibleCollapse.parentElement as HTMLElement;
    expect(visibleChip.hasAttribute("data-working-set-hidden")).toBe(false);
    expect(visibleChip.className).not.toContain("opacity-50");
  });

  it("dims no chip when no visibility membership is supplied", () => {
    expandWorkingSet("doc:alpha");
    expandWorkingSet("doc:beta");

    const { container } = render(<WorkingSet />);
    expect(container.querySelectorAll("[data-working-set-hidden]")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("opacity-50");
  });
});
