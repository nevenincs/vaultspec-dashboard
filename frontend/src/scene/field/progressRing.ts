// The progress ring — a parametric arc-fill primitive, NOT an icon
// (iconography ADR: "the progress ring is not an icon but a parametric
// primitive (exact arc fills) and is implemented as a small programmatic
// component rather than static SVGs"). Drawn for plan and feature nodes from
// `done/total`. W02.P17.S36.
//
// The geometry is exact and grayscale-safe by construction: a full track ring
// plus a filled progress arc anchored at 12 o'clock, sweeping clockwise, its
// angular extent the exact `done/total` fraction. Legibility at small size
// comes from the two-element design (track + arc) reading as "how full" by
// arc length alone — no hue, no gradient. The pure arc math is unit-tested
// GPU-free; the draw step maps it onto a Pixi `Graphics`.

import type { Graphics } from "pixi.js";

/** 12 o'clock, in canvas radians (y-down), where the arc begins. */
export const RING_START_ANGLE = -Math.PI / 2;

/** A 0..1 progress fraction from done/total, clamped; null when ringless. */
export function progressFraction(done: number, total: number): number | null {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(1, done / total));
}

/**
 * The exact arc geometry for a progress fraction: start fixed at 12 o'clock,
 * end swept clockwise by `fraction` of a full turn. A fraction of 0 yields a
 * zero-length arc (track only); 1 yields a full revolution.
 */
export interface RingArc {
  readonly startAngle: number;
  readonly endAngle: number;
  /** The swept angle in radians (endAngle - startAngle), 0..2π. */
  readonly sweep: number;
}

export function ringArc(fraction: number): RingArc {
  const clamped = Math.max(0, Math.min(1, fraction));
  const sweep = clamped * 2 * Math.PI;
  return {
    startAngle: RING_START_ANGLE,
    endAngle: RING_START_ANGLE + sweep,
    sweep,
  };
}

/** Draw parameters for the ring primitive. */
export interface RingStyle {
  readonly radius: number;
  readonly width: number;
  /** Tintable ink for the progress arc (state colour, resolved by caller). */
  readonly color: number;
  /** Faint track ink behind the arc; omit to draw the arc alone. */
  readonly trackColor?: number;
  readonly trackAlpha?: number;
}

/**
 * Render the progress ring into a Pixi `Graphics` centered at the origin: an
 * optional faint full-circle track, then the exact progress arc on top. The
 * arc is omitted at fraction 0 (Pixi treats a zero-sweep arc as a point, which
 * would draw a stray cap). Returns the same `Graphics` for chaining.
 *
 * Pure where it can be: `ringArc` computes the geometry offline (unit-tested);
 * this function only maps it onto the GPU primitive, mirroring how the sprite
 * layer maps `nodeRadius`/`stateColor` onto Pixi objects.
 */
export function drawProgressRing(
  g: Graphics,
  fraction: number,
  style: RingStyle,
): Graphics {
  const { radius, width, color, trackColor, trackAlpha = 0.35 } = style;
  if (trackColor !== undefined) {
    g.circle(0, 0, radius).stroke({ width, color: trackColor, alpha: trackAlpha });
  }
  const arc = ringArc(fraction);
  if (arc.sweep > 0) {
    g.arc(0, 0, radius, arc.startAngle, arc.endAngle).stroke({ width, color });
  }
  return g;
}
