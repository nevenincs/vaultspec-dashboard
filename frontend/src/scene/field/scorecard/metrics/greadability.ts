// Vendored edge-crossing and crossing-angle quality (graph-viz-scorecard ADR,
// W01.P02.S13).
//
// VENDORING NOTE. The scorecard ADR names `greadability.js` (Gove) as the
// in-runtime oracle for crossings / crossing-angle in [0,1]. We deliberately
// VENDOR a thin, deterministic computation of exactly the two terms we gate on
// (crossings quality and mean crossing-angle quality) rather than add the npm
// `greadability` package as a frontend dependency, for three reasons that matter
// to this gate:
//   1. Self-contained CI. The gate must be byte-reproducible from the seeded PRNG
//      alone; pulling an unmaintained dependency (greadability.js has not shipped
//      in years) introduces a transitive surface the gate cannot pin.
//   2. Determinism. Our computation uses no randomness and no floating-point
//      shortcuts beyond the segment-intersection test, so two runs over identical
//      positions return identical scores — the determinism the gate depends on.
//   3. Shared-tree hygiene. Adding a dependency churns `package.json` and the lock
//      file across a contended worktree; vendoring keeps this Phase's surface to
//      the `metrics/` directory only.
//
// The two quality terms follow the literature the ADR/research cite:
//   - crossings quality  = 1 - c / c_max,
//     with c_max = m(m-1)/2 - sum_i deg(i)(deg(i)-1)/2  (Purchase 2002): the
//     number of pairs of edges that COULD cross, excluding pairs sharing an
//     endpoint (which cannot cross in a straight-line drawing). 1 = no crossings.
//   - crossing-angle quality = 1 - sum |theta - 70deg| / (count * 70deg),
//     where theta is each crossing pair's acute crossing angle and 70deg is the
//     Huang eye-tracking ideal (research F2). 1 = every crossing is at the ideal
//     angle; the normalizer `count * 70deg` is the worst-case total deviation
//     (every crossing at 0deg), so the term stays in [0,1].
//
// Bounding (bounded-by-default-for-every-accumulator). Crossing detection is
// naively O(m^2) in the edge count. We bound it at the call site with an explicit
// edge ceiling: above the ceiling we sample a fixed-seed-independent deterministic
// prefix of the edge list (the first `EDGE_CEILING` edges in their stable order)
// so the O(m^2) loop is capped. The slice the gate scores is already node-bounded
// upstream, so in practice the ceiling is never hit; it is the call-site guard the
// rule requires, not a behavioural knob.

import type { Position } from "./shared";
import { clamp01 } from "./shared";

/** A drawn edge as an endpoint-id pair (the scene `SceneEdgeData` subset we need). */
export interface DrawnEdge {
  src: string;
  dst: string;
}

/** The ideal crossing angle in radians (70deg, Huang eye-tracking — research F2). */
export const IDEAL_CROSSING_ANGLE_RAD = (70 * Math.PI) / 180;

/**
 * The edge ceiling for the O(m^2) crossing scan. Above this the scan is capped to
 * the first `EDGE_CEILING` edges in stable order so the accumulator is bounded at
 * the call site. The node-bounded LOD slice keeps the real edge count well under
 * this, so it is a guard, not a behavioural knob.
 */
export const EDGE_CEILING = 4000;

export interface GreadabilityResult {
  /** Raw crossing count over the (possibly capped) edge set. */
  crossings: number;
  /** Maximum possible crossings c_max = m(m-1)/2 - sum deg(i)(deg(i)-1)/2. */
  maxCrossings: number;
  /** Crossings quality 1 - c/c_max in [0,1]; 1 = no crossings. */
  crossingsQuality: number;
  /** Mean crossing-angle quality 1 - sum|theta-70deg|/(count*70deg) in [0,1]. */
  crossingAngleQuality: number;
  /** Number of crossing pairs that contributed an angle (for diagnostics). */
  crossingPairs: number;
}

/** Orientation sign of the triple (a, b, c): >0 ccw, <0 cw, 0 collinear. */
function cross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Do open segments p1p2 and p3p4 properly cross? Returns true only for a genuine
 * interior intersection (the four orientations strictly alternate). Shared
 * endpoints and collinear overlaps return false — they are not a readable crossing
 * and are excluded from c_max anyway.
 */
function segmentsCross(
  p1: Position,
  p2: Position,
  p3: Position,
  p4: Position,
): boolean {
  const d1 = cross(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
  const d2 = cross(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
  const d3 = cross(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  const d4 = cross(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** The acute angle (radians, in [0, pi/2]) between segments p1p2 and p3p4. */
function acuteCrossingAngle(
  p1: Position,
  p2: Position,
  p3: Position,
  p4: Position,
): number {
  const ax = p2.x - p1.x;
  const ay = p2.y - p1.y;
  const bx = p4.x - p3.x;
  const by = p4.y - p3.y;
  const dot = ax * bx + ay * by;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  if (magA < 1e-12 || magB < 1e-12) return IDEAL_CROSSING_ANGLE_RAD;
  let cosT = dot / (magA * magB);
  if (cosT > 1) cosT = 1;
  if (cosT < -1) cosT = -1;
  const angle = Math.acos(cosT);
  // Fold to the acute angle in [0, pi/2].
  return angle > Math.PI / 2 ? Math.PI - angle : angle;
}

/**
 * Compute crossings quality and mean crossing-angle quality over a straight-line
 * drawing. `positions` maps node id -> coordinate; edges missing either endpoint
 * position are skipped (an honest omission, not an error). Pure and deterministic.
 *
 * c_max excludes edge pairs that share an endpoint (they cannot cross), per
 * Purchase 2002 / Gove: c_max = m(m-1)/2 - sum_i deg(i)(deg(i)-1)/2.
 */
export function greadability(
  positions: ReadonlyMap<string, Position>,
  edges: readonly DrawnEdge[],
): GreadabilityResult {
  // Keep only edges whose endpoints are placed; cap to the ceiling at the call
  // site so the O(m^2) scan is bounded.
  const drawn: { a: Position; b: Position; src: string; dst: string }[] = [];
  for (const e of edges) {
    if (e.src === e.dst) continue; // self-loop draws no crossing
    const a = positions.get(e.src);
    const b = positions.get(e.dst);
    if (!a || !b) continue;
    drawn.push({ a, b, src: e.src, dst: e.dst });
    if (drawn.length >= EDGE_CEILING) break;
  }

  const m = drawn.length;
  // Per-node degree over the drawn edge set (for the c_max correction term).
  const degree = new Map<string, number>();
  for (const e of drawn) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }
  let sharedPairs = 0;
  for (const d of degree.values()) sharedPairs += (d * (d - 1)) / 2;
  const maxCrossings = (m * (m - 1)) / 2 - sharedPairs;

  let crossings = 0;
  let angleDeviationSum = 0;
  for (let i = 0; i < m; i++) {
    const ei = drawn[i];
    for (let j = i + 1; j < m; j++) {
      const ej = drawn[j];
      // Skip pairs sharing an endpoint — excluded from c_max and not a crossing.
      if (
        ei.src === ej.src ||
        ei.src === ej.dst ||
        ei.dst === ej.src ||
        ei.dst === ej.dst
      ) {
        continue;
      }
      if (segmentsCross(ei.a, ei.b, ej.a, ej.b)) {
        crossings++;
        const theta = acuteCrossingAngle(ei.a, ei.b, ej.a, ej.b);
        angleDeviationSum += Math.abs(theta - IDEAL_CROSSING_ANGLE_RAD);
      }
    }
  }

  // Crossings quality: 1 when no crossings are possible (c_max <= 0) — a drawing
  // with no crossable pairs is perfectly crossing-free by construction.
  const crossingsQuality =
    maxCrossings <= 0 ? 1 : clamp01(1 - crossings / maxCrossings);

  // Crossing-angle quality: 1 when there are no crossings (vacuously ideal). The
  // normalizer is the worst-case total deviation (every crossing at angle 0).
  const crossingAngleQuality =
    crossings === 0
      ? 1
      : clamp01(1 - angleDeviationSum / (crossings * IDEAL_CROSSING_ANGLE_RAD));

  return {
    crossings,
    maxCrossings,
    crossingsQuality,
    crossingAngleQuality,
    crossingPairs: crossings,
  };
}
