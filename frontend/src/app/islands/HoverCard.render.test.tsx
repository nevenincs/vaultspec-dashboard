// @vitest-environment happy-dom
//
// The hover-bloom card (node-visual-richness prototype), rendered as a real DOM
// component with no internal doubles. The card is self-contained — it takes a
// typed StatusCardModel and renders — so these assertions exercise the card's
// own contract: the status chip surfaces the value, the rollout bar reflects the
// progress channel, the open affordance fires onOpen, and the reduced-motion
// path renders an instant crossfade WITHOUT the transform-travel the bloom path
// uses (the base motion-law floor honored at this surface).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HoverCard, type StatusCardModel } from "./HoverCard";

const acceptedAdr: StatusCardModel = {
  id: "doc:2026-06-14-some-decision-adr",
  kind: "adr",
  title: "Some decision",
  status: { value: "accepted", class: "affirmed" },
  authorityClass: "accepted decision",
};

const planAt7of12: StatusCardModel = {
  id: "doc:2026-06-14-some-plan",
  kind: "plan",
  title: "A plan in flight",
  status: { value: "L2", class: "tiered", ordinal: 2 },
  authorityClass: "L2 plan",
  progress: { done: 7, total: 12 },
};

const criticalAudit: StatusCardModel = {
  id: "doc:2026-06-14-some-audit",
  kind: "audit",
  title: "A critical audit",
  status: { value: "critical", class: "graded", ordinal: 4 },
  authorityClass: "critical finding",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HoverCard — status chip, rollout, open affordance, reduced motion", () => {
  it("shows the status chip with the raw status value", () => {
    render(<HoverCard model={acceptedAdr} />);
    const chip = document.querySelector("[data-status-chip]");
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain("accepted");
  });

  it("renders the rollout bar reflecting the progress fraction (7/12 ≈ 58%)", () => {
    render(<HoverCard model={planAt7of12} />);
    const rollout = document.querySelector("[data-rollout]");
    expect(rollout).toBeTruthy();
    // The tabular receipt shows the raw counts.
    expect(rollout?.textContent).toContain("7/12");
    // The fill width is the computed fraction (round(7/12 * 100) = 58%).
    const fill = document.querySelector("[data-rollout-fill]") as HTMLElement | null;
    expect(fill).toBeTruthy();
    expect(fill?.style.width).toBe("58%");
    // The progressbar role carries the accessible value.
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("7");
    expect(bar?.getAttribute("aria-valuemax")).toBe("12");
  });

  it("does NOT render a rollout bar when there is no progress channel", () => {
    render(<HoverCard model={acceptedAdr} />);
    expect(document.querySelector("[data-rollout]")).toBeNull();
  });

  it("fires onOpen with the node id when the open affordance is clicked", () => {
    const onOpen = vi.fn();
    render(<HoverCard model={acceptedAdr} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /open Some decision/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(acceptedAdr.id);
  });

  it("carries a severity glyph in the chip for a graded status", () => {
    render(<HoverCard model={criticalAudit} />);
    const chip = document.querySelector("[data-status-chip]");
    // The severity gauge glyph (status-severity-4) renders as an inline svg.
    expect(chip?.querySelector("svg")).toBeTruthy();
    expect(chip?.textContent).toContain("critical");
    // The microline names the magnitude derived from the descriptor.
    expect(document.querySelector("[data-microline]")?.textContent).toContain(
      "severity 4/4",
    );
  });

  it("uses the bloom (transform-travel) path by default", () => {
    render(<HoverCard model={acceptedAdr} />);
    const card = document.querySelector("[data-hover-card]") as HTMLElement | null;
    expect(card?.getAttribute("data-motion")).toBe("bloom");
    // The bloom path animates transform; the inline style declares a transform.
    expect(card?.style.transform).not.toBe("");
  });

  it("under reducedMotion renders an instant crossfade WITHOUT transform travel", async () => {
    render(<HoverCard model={acceptedAdr} reducedMotion />);
    const card = document.querySelector("[data-hover-card]") as HTMLElement | null;
    expect(card?.getAttribute("data-motion")).toBe("crossfade");
    expect(card?.hasAttribute("data-reduced-motion")).toBe(true);
    // The crossfade path declares NO transform (no scale travel), only opacity.
    expect(card?.style.transform).toBe("");
    expect(card?.style.transition).toMatch(/opacity/);
    // It still blooms to full opacity after the mount tick (a real crossfade).
    await waitFor(() => {
      expect(card?.style.opacity).toBe("1");
    });
  });
});
