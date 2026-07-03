// Cluster-selection fence geometry (emphasis-state-grammar ADR 2026-07-03): the convex
// hull + Minkowski-offset pair that traces the rounded n-gon perimeter around the
// spotlit cohort. Pure-math coverage: hull winding/degenerates and the offset path's
// outward, arc-joined trace (via a recording 2D-path surface — no canvas rendering).
import { describe, expect, it } from "vitest";
import { convexHull, traceRoundedOffset, type ScreenPt } from "./threeField";

/** Shoelace sum in raw coordinate arithmetic — positive is the winding invariant
 *  traceRoundedOffset's outward normals + increasing-angle arc sweeps rely on. */
function shoelace(pts: ScreenPt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** Minimal recording path surface: captures the path verbs drawFence feeds a real
 *  CanvasRenderingContext2D, so the trace is asserted on geometry, not pixels. */
function recordingPath() {
  const ops: { op: string; args: number[] }[] = [];
  const ctx = {
    moveTo: (...args: number[]) => ops.push({ op: "moveTo", args }),
    lineTo: (...args: number[]) => ops.push({ op: "lineTo", args }),
    arc: (...args: number[]) => ops.push({ op: "arc", args }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

describe("convexHull", () => {
  it("hulls a point cloud to its extreme points with positive shoelace winding", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 }, // interior — must be dropped
      { x: 1, y: 3 }, // interior — must be dropped
    ]);
    expect(hull).toHaveLength(4);
    expect(shoelace(hull)).toBeGreaterThan(0);
    const keys = new Set(hull.map((p) => `${p.x},${p.y}`));
    expect(keys).toEqual(new Set(["0,0", "4,0", "4,4", "0,4"]));
  });

  it("dedupes coincident points and degrades collinear input to its 2-point extent", () => {
    expect(
      convexHull([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toHaveLength(1);
    const collinear = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 5, y: 5 },
      { x: 3, y: 3 },
    ]);
    expect(collinear).toHaveLength(2);
    const keys = new Set(collinear.map((p) => `${p.x},${p.y}`));
    expect(keys).toEqual(new Set(["0,0", "5,5"]));
  });
});

describe("traceRoundedOffset", () => {
  it("traces a single point as a full circle of the pad radius", () => {
    const { ctx, ops } = recordingPath();
    traceRoundedOffset(ctx, [{ x: 10, y: 20 }], 5);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("arc");
    expect(ops[0].args.slice(0, 3)).toEqual([10, 20, 5]);
    expect(ops[0].args[4] - ops[0].args[3]).toBeCloseTo(Math.PI * 2);
  });

  it("traces two points as a capsule: two offset segments joined by two π arcs", () => {
    const { ctx, ops } = recordingPath();
    traceRoundedOffset(
      ctx,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      4,
    );
    const arcs = ops.filter((o) => o.op === "arc");
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      expect(arc.args[2]).toBe(4);
      // Each end cap sweeps a half turn (increasing canvas angle, mod 2π).
      const sweep = (arc.args[4] - arc.args[3] + Math.PI * 4) % (Math.PI * 2);
      expect(sweep).toBeCloseTo(Math.PI);
    }
    // The two cap centres are the hull's endpoints.
    const centers = new Set(arcs.map((a) => `${a.args[0]},${a.args[1]}`));
    expect(centers).toEqual(new Set(["10,0", "0,0"]));
  });

  it("offsets every polygon path point outward by exactly the pad radius", () => {
    const square: ScreenPt[] = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const pad = 3;
    const { ctx, ops } = recordingPath();
    traceRoundedOffset(ctx, square, pad);
    // Every straight-segment endpoint sits exactly `pad` outside the square: distance
    // to the nearest hull edge equals the pad (outward, never inward or diagonal-cut).
    const linePts = ops
      .filter((o) => o.op === "moveTo" || o.op === "lineTo")
      .map((o) => ({ x: o.args[0], y: o.args[1] }));
    expect(linePts.length).toBeGreaterThanOrEqual(8);
    for (const p of linePts) {
      const dx = Math.max(0 - p.x, 0, p.x - 10);
      const dy = Math.max(0 - p.y, 0, p.y - 10);
      expect(Math.max(dx, dy)).toBeCloseTo(pad);
      expect(Math.min(dx, dy)).toBeCloseTo(0);
    }
    // One corner arc per vertex, all at the pad radius, each a quarter turn.
    const arcs = ops.filter((o) => o.op === "arc");
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect(arc.args[2]).toBe(pad);
      const sweep = (arc.args[4] - arc.args[3] + Math.PI * 4) % (Math.PI * 2);
      expect(sweep).toBeCloseTo(Math.PI / 2);
    }
  });
});
