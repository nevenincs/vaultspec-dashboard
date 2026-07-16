// The 14px grayscale-by-shape gate (iconography ADR a11y contract). Every
// domain mark — adopted or authored — must be distinguishable in pure
// grayscale at the 14px legibility floor by SHAPE alone, with hue never
// load-bearing. This module renders a mark to a deterministic ink bitmap at the
// gate resolution and compares bitmaps within a family, so the squint test is
// made numeric and asserted offline.
//
// The rasterizer (`svgRaster.ts`) paints true ink coverage — fills with their
// winding rule (so a ring's hole stays empty) and strokes within their width
// (so a stroke-only mark inks real cells) — over the full 256 grid. This is
// what the eye sees at 14px: it tells a solid disc from a hollow ring and a
// plus from a pair of lines, which a geometric fill-containment test cannot.
// The gate is pure (no Pixi, no DOM), so it runs in the default test env.

import type { MarkDef } from "./markInk";
import { rasterizeBody } from "./svgRaster";

/** The legibility floor the a11y gate is specified at (14px). */
export const GATE_SIZE = 14;

/** A binary ink bitmap: GATE_SIZE × GATE_SIZE coverage over the 256 grid. */
export interface Silhouette {
  readonly size: number;
  /** Row-major coverage: true where the mark's ink covers the cell center. */
  readonly cells: ReadonlyArray<boolean>;
  /** Fraction of cells covered (0..1) — the silhouette mass. */
  readonly coverage: number;
}

/** Rasterize a mark to a GATE_SIZE ink bitmap over the full 256 grid. */
export function silhouetteOf(def: MarkDef, size = GATE_SIZE): Silhouette {
  const cells = rasterizeBody(def.svgBody, size);
  const hits = cells.reduce((n, c) => n + (c ? 1 : 0), 0);
  return { size, cells, coverage: hits / (size * size) };
}

/**
 * Hamming distance between two silhouettes of equal size: the count of cells
 * whose coverage differs. Zero means pixel-identical silhouettes at the gate
 * resolution (a collision); higher means more shape separation.
 */
export function silhouetteDistance(a: Silhouette, b: Silhouette): number {
  if (a.size !== b.size) {
    throw new Error(`silhouette size mismatch: ${a.size} vs ${b.size}`);
  }
  let d = 0;
  for (let i = 0; i < a.cells.length; i++) {
    if (a.cells[i] !== b.cells[i]) d++;
  }
  return d;
}

/**
 * The minimum pairwise silhouette distance across a family of marks — the
 * weakest link in the family's grayscale separation. A family passes the gate
 * when this stays above a floor (the marks never collapse to the same shape at
 * 14px). Returns Infinity for a family of fewer than two marks.
 */
export function minFamilyDistance(defs: ReadonlyArray<MarkDef>): number {
  const silhouettes = defs.map((d) => silhouetteOf(d));
  let min = Infinity;
  for (let i = 0; i < silhouettes.length; i++) {
    for (let j = i + 1; j < silhouettes.length; j++) {
      min = Math.min(min, silhouetteDistance(silhouettes[i], silhouettes[j]));
    }
  }
  return min;
}

/**
 * The gate verdict for one family: the closest pair, the distance between them,
 * and whether the family clears the distinctness floor. `floor` is the minimum
 * admissible Hamming distance between any two marks at GATE_SIZE — the squint
 * test made numeric.
 */
export interface GateResult {
  readonly pass: boolean;
  readonly minDistance: number;
  readonly closestPair: readonly [string, string];
  readonly floor: number;
}

export function gateFamily(defs: ReadonlyArray<MarkDef>, floor: number): GateResult {
  const entries = defs.map((d) => ({ def: d, sil: silhouetteOf(d) }));
  let min = Infinity;
  let pair: [string, string] = ["", ""];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const dist = silhouetteDistance(entries[i].sil, entries[j].sil);
      if (dist < min) {
        min = dist;
        pair = [entries[i].def.id, entries[j].def.id];
      }
    }
  }
  return { pass: min >= floor, minDistance: min, closestPair: pair, floor };
}
