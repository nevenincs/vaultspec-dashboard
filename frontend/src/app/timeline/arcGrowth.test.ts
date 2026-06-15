import { describe, expect, it } from "vitest";

import type { TimelineMode } from "../../stores/view/viewStore";
import {
  DEFAULT_FADE_WINDOW_MS,
  type RevealArc,
  type RevealNode,
  easeReveal,
  isUngated,
  revealArcs,
  revealAt,
  revealNodes,
  revealTimeFor,
} from "./arcGrowth";

const DAY = 24 * 3600_000;
const T0 = Date.parse("2026-06-01T00:00:00Z");

describe("revealTimeFor (reads the one playhead truth, no second clock)", () => {
  it("uses now in LIVE mode so everything in range is revealed", () => {
    const live: TimelineMode = { kind: "live" };
    expect(revealTimeFor(live, T0)).toBe(T0);
  });

  it("uses the playhead instant in time-travel mode (the reveal frontier)", () => {
    const tt: TimelineMode = { kind: "time-travel", at: T0 - 3 * DAY };
    expect(revealTimeFor(tt, T0)).toBe(T0 - 3 * DAY);
  });
});

describe("isUngated", () => {
  it("is true in LIVE (default view unchanged) and false in time-travel", () => {
    expect(isUngated({ kind: "live" })).toBe(true);
    expect(isUngated({ kind: "time-travel", at: T0 })).toBe(false);
  });
});

describe("easeReveal (ease-out cubic, clamped)", () => {
  it("maps 0 to 0 and 1 to 1, clamps out-of-range, and eases out", () => {
    expect(easeReveal(0)).toBe(0);
    expect(easeReveal(1)).toBe(1);
    expect(easeReveal(-5)).toBe(0);
    expect(easeReveal(5)).toBe(1);
    // Ease-OUT: at the midpoint the factor is already past halfway (fast start).
    expect(easeReveal(0.5)).toBeGreaterThan(0.5);
  });
});

describe("revealAt (a single birth instant against the frontier T)", () => {
  it("is pre-birth (hidden, fade 0) before the birth instant", () => {
    expect(revealAt(T0, T0 - 1, DAY, false)).toEqual({ revealed: false, fade: 0 });
  });

  it("ramps an eased fade across the window just after birth", () => {
    const atBirth = revealAt(T0, T0, DAY, false);
    expect(atBirth.revealed).toBe(true);
    expect(atBirth.fade).toBe(0); // exactly at birth, no elapsed time yet

    const quarter = revealAt(T0, T0 + DAY / 4, DAY, false);
    expect(quarter.revealed).toBe(true);
    expect(quarter.fade).toBeGreaterThan(0);
    expect(quarter.fade).toBeLessThan(1);

    const past = revealAt(T0, T0 + 2 * DAY, DAY, false);
    expect(past).toEqual({ revealed: true, fade: 1 }); // held at full past the window
  });

  it("collapses to a hard cut under an instant reveal (reduced motion / keyboard)", () => {
    expect(revealAt(T0, T0 - 1, DAY, true)).toEqual({ revealed: false, fade: 0 });
    expect(revealAt(T0, T0 + DAY / 4, DAY, true)).toEqual({
      revealed: true,
      fade: 1,
    });
  });

  it("treats a dateless item as always revealed (degrade, never hide)", () => {
    expect(revealAt(null, T0, DAY, false)).toEqual({ revealed: true, fade: 1 });
    expect(revealAt(Number.NaN, T0, DAY, false)).toEqual({
      revealed: true,
      fade: 1,
    });
  });
});

describe("revealNodes (keyed by stable id)", () => {
  const nodes: RevealNode[] = [
    { id: "doc:a", bornMs: T0 - 5 * DAY },
    { id: "doc:b", bornMs: T0 + 5 * DAY },
    { id: "doc:dateless", bornMs: null },
  ];

  it("gates each node on its birth against T in time-travel mode", () => {
    const map = revealNodes(nodes, { T: T0, instant: true });
    expect(map.get("doc:a")).toEqual({ revealed: true, fade: 1 });
    expect(map.get("doc:b")).toEqual({ revealed: false, fade: 0 });
    expect(map.get("doc:dateless")).toEqual({ revealed: true, fade: 1 });
  });

  it("reveals every node when ungated (LIVE) regardless of T", () => {
    const map = revealNodes(nodes, { T: T0 - 100 * DAY, ungated: true });
    for (const node of nodes) {
      expect(map.get(node.id)).toEqual({ revealed: true, fade: 1 });
    }
  });

  it("defaults the fade window when none is supplied", () => {
    const mid = T0 + DEFAULT_FADE_WINDOW_MS / 2;
    const map = revealNodes([{ id: "doc:a", bornMs: T0 }], { T: mid });
    const r = map.get("doc:a")!;
    expect(r.revealed).toBe(true);
    expect(r.fade).toBeGreaterThan(0);
    expect(r.fade).toBeLessThan(1);
  });
});

describe("revealArcs (gated on the LATER endpoint; fade = min of endpoints)", () => {
  const early: RevealNode = { id: "doc:early", bornMs: T0 - 5 * DAY };
  const late: RevealNode = { id: "doc:late", bornMs: T0 + 5 * DAY };
  const arc: RevealArc = { id: "edge:1", src: "doc:early", dst: "doc:late" };

  it("reveals an arc only once BOTH endpoints are revealed", () => {
    // T past the early node but before the late one: the arc cannot exist yet.
    const before = revealNodes([early, late], { T: T0, instant: true });
    expect(revealArcs([arc], before, { T: T0, instant: true }).get("edge:1")).toEqual({
      revealed: false,
      fade: 0,
    });

    // T past BOTH endpoints: the arc is revealed.
    const after = revealNodes([early, late], { T: T0 + 10 * DAY, instant: true });
    expect(
      revealArcs([arc], after, { T: T0 + 10 * DAY, instant: true }).get("edge:1"),
    ).toEqual({ revealed: true, fade: 1 });
  });

  it("fades the arc in with the MINIMUM of its endpoints' fades", () => {
    // Both born; the late one is mid-fade, the early one fully faded in.
    const T = late.bornMs! + DAY / 4;
    const nm = revealNodes([early, late], { T, fadeWindowMs: DAY });
    const a = nm.get("doc:early")!;
    const b = nm.get("doc:late")!;
    expect(a.fade).toBe(1);
    expect(b.fade).toBeGreaterThan(0);
    expect(b.fade).toBeLessThan(1);
    const arcState = revealArcs([arc], nm, { T, fadeWindowMs: DAY }).get("edge:1")!;
    expect(arcState).toEqual({ revealed: true, fade: Math.min(a.fade, b.fade) });
    expect(arcState.fade).toBe(b.fade); // the later endpoint paces the arc
  });

  it("does not reveal an arc with a missing endpoint in the slice", () => {
    const nm = revealNodes([early], { T: T0 + 10 * DAY, instant: true });
    const dangling: RevealArc = { id: "edge:x", src: "doc:early", dst: "doc:gone" };
    expect(
      revealArcs([dangling], nm, { T: T0 + 10 * DAY, instant: true }).get("edge:x"),
    ).toEqual({ revealed: false, fade: 0 });
  });

  it("reveals every arc when ungated (LIVE)", () => {
    const nm = revealNodes([early, late], { T: T0 - 100 * DAY, ungated: true });
    expect(
      revealArcs([arc], nm, { T: T0 - 100 * DAY, ungated: true }).get("edge:1"),
    ).toEqual({ revealed: true, fade: 1 });
  });
});
