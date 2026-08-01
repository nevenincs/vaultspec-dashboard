// @vitest-environment happy-dom
//
// The timeline's non-populated modes render the DEFAULT layout's own geometry as a
// ghost (owner review, 2026-08-01) instead of a bare sentence or three loose bars:
// a summary bar, the range track with BOTH handles pinned to the locked full span,
// and the date-basis control's footprint — all in the neutral skeleton gray, never
// the accent and never on a raised card. `TimelineGhost` is the dumb, wire-free
// shape both the loading and empty branches mount, so it is driven directly here
// (the same split `FirstRunOnboardingBody` uses).

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TimelineGhost } from "./TimelineRangeSelector";

afterEach(cleanup);

function ghost(variant: "desktop" | "compact") {
  const { container } = render(<TimelineGhost variant={variant} />);
  const root = container.querySelector("[data-timeline-ghost]");
  if (root === null) throw new Error("The ghost must render its root.");
  return root;
}

describe("TimelineGhost", () => {
  it("mirrors the default layout: a summary bar, the track row, and both handles", () => {
    const root = ghost("desktop");
    expect(root.querySelector("[data-timeline-track-row]")).toBeTruthy();
    const track = root.querySelector("[data-timeline-range-track]");
    expect(track).toBeTruthy();
    // Two handles — the same two the live selector drags.
    expect(track!.querySelectorAll("span").length).toBe(2);
  });

  it("locks the range to the full bounded span", () => {
    const track = ghost("desktop").querySelector("[data-timeline-range-track]");
    // The selection covers the whole track (inset-0), and the handles sit on the ends.
    expect(track!.querySelector(".inset-0")).toBeTruthy();
    const handles = [...track!.querySelectorAll("span")].map(
      (handle) => (handle as HTMLElement).style.left,
    );
    expect(handles).toEqual(["0%", "100%"]);
  });

  it("paints in the neutral ghost gray, never the accent and never a raised card", () => {
    const root = ghost("desktop");
    expect(root.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(0);
    expect(root.querySelector(".bg-accent")).toBeNull();
    expect(root.querySelector(".bg-paper-raised")).toBeNull();
  });

  it("is inert and decorative — no control roles, hidden from assistive tech", () => {
    const root = ghost("desktop");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector('[role="slider"]')).toBeNull();
    expect(root.querySelector("button")).toBeNull();
  });

  it("grows the handle footprint on compact, matching the live selector", () => {
    const desktopHandle = ghost("desktop").querySelector(
      "[data-timeline-range-track] span",
    );
    cleanup();
    const compactHandle = ghost("compact").querySelector(
      "[data-timeline-range-track] span",
    );
    expect(desktopHandle?.className).toContain("size-[0.875rem]");
    expect(compactHandle?.className).toContain("size-[1.25rem]");
  });
});
