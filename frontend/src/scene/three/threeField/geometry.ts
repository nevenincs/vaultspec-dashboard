// Decomposed from threeField.ts (module-decomposition mandate, 2026-07-12).

import { specById } from "../graphControlSchema";
import type { D3ForceParams } from "../d3ForceSolver";
import { LABEL_MAX_CHARS } from "./config";

export function hexCss(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

/** Reduced-motion gate for the emphasis cross-fade, fence ramp, and display lerp:
 *  snap instead of ease. The MediaQueryList is created ONCE at module load (GPR-002 —
 *  `applyDisplayLerp` reads this per frame, and `matchMedia()` allocates a fresh MQL
 *  per call); `.matches` is a live view, so no change listener is needed. */
const reducedMotionQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

export type ScreenPt = { x: number; y: number };

/** Andrew monotone-chain convex hull over screen points. Returns the hull with a
 *  POSITIVE shoelace winding in raw coordinate arithmetic (the invariant
 *  `traceRoundedOffset`'s outward normals + arc sweeps rely on); collinear inputs
 *  degrade to their 2-point extent, a single point to itself. Exported for tests. */
export function convexHull(points: ScreenPt[]): ScreenPt[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const uniq: ScreenPt[] = [];
  for (const p of sorted) {
    const last = uniq[uniq.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) {
      uniq.push(p);
    }
  }
  if (uniq.length <= 2) return uniq;
  const cross = (o: ScreenPt, a: ScreenPt, b: ScreenPt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: ScreenPt[] = [];
  for (const p of uniq) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: ScreenPt[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Trace the Minkowski offset of a convex hull by `pad` into the current path — the
 *  rounded n-gon perimeter fence: each edge pushed outward along its normal, each
 *  vertex joined by an arc of radius `pad` (a disc offset natively rounds the
 *  corners; never concave by construction). Degenerates cleanly: one point → a
 *  circle, two points → a capsule. Requires the positive-shoelace winding
 *  `convexHull` returns, whose outward normal is (dy, -dx). Exported for tests. */
export function traceRoundedOffset(
  ctx: CanvasRenderingContext2D,
  hull: ScreenPt[],
  pad: number,
): void {
  if (hull.length === 0) return;
  if (hull.length === 1) {
    ctx.arc(hull[0].x, hull[0].y, pad, 0, Math.PI * 2);
    return;
  }
  const k = hull.length;
  const normals: ScreenPt[] = [];
  for (let i = 0; i < k; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % k];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    normals.push({ x: (b.y - a.y) / len, y: -(b.x - a.x) / len });
  }
  for (let i = 0; i < k; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % k];
    const n = normals[i];
    const n2 = normals[(i + 1) % k];
    const sx = a.x + n.x * pad;
    const sy = a.y + n.y * pad;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.lineTo(b.x + n.x * pad, b.y + n.y * pad);
    // Convex + positive winding ⇒ every vertex turn is a ≤π increasing-angle sweep,
    // which is exactly canvas arc's default (anticlockwise=false) direction.
    ctx.arc(b.x, b.y, pad, Math.atan2(n.y, n.x), Math.atan2(n2.y, n2.x), false);
  }
}

/** Sanitize + fixed-length-elide a canvas label: collapse all whitespace runs (incl.
 *  newlines/tabs) to single spaces, trim, and cap to a FIXED character length with a
 *  trailing ellipsis. A pathological title (newlines, thousands of chars) can therefore
 *  never paint an unbounded or broken line; the width fit (`fitLabel`) bounds the
 *  remainder. The full title lives in the DOM HoverCard. */
export function sanitizeLabel(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > LABEL_MAX_CHARS
    ? clean.slice(0, LABEL_MAX_CHARS - 1).trimEnd() + "…"
    : clean;
}

/** Normalised magnitude of a live force-param change: the MAX over the changed numeric
 *  knobs of |Δ| / (schema max − min), clamped to [0,1]. 0 ⇒ nothing actually changed
 *  (skip the reheat). Drives the change-proportional gentle reheat so a tiny slider
 *  nudge barely warms the layout while a large retune warms more. */
export function forceChangeFraction(
  prev: D3ForceParams,
  next: Partial<D3ForceParams>,
): number {
  let frac = 0;
  for (const key of Object.keys(next) as (keyof D3ForceParams)[]) {
    const nv = next[key];
    const pv = prev[key];
    if (typeof nv !== "number" || typeof pv !== "number" || nv === pv) continue;
    const spec = specById(key);
    const span =
      spec && typeof spec.min === "number" && typeof spec.max === "number"
        ? spec.max - spec.min
        : 0;
    const f = span > 0 ? Math.abs(nv - pv) / span : 1;
    if (f > frac) frac = f;
  }
  return Math.min(1, frac);
}
