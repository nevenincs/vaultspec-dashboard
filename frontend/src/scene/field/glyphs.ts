// Placeholder programmatic glyph set (W01.P04.S16, ADR G7.c).
//
// The commissioned hand-drawn glyph family is approved, budgeted design
// work delivered as SVG + GPU-renderable (SDF/sprite) forms. Until it
// lands, this module ships a programmatic placeholder: one distinct
// polygon silhouette per doc type (shape carries type; colour stays
// reserved for state per §3.1), the four tier marks, and the state mark
// vocabulary — generated as supersampled sprite textures plus computed
// signed-distance fields, so the swap to the designed family is a texture
// swap behind the same `GlyphTextureProvider` seam, not a rendering change.

import { Graphics, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import type { GlyphTextureProvider } from "./nodeSprites";

// --- pure glyph geometry (unit-tested) ----------------------------------------

/** Known doc-type/node kinds with designed placeholder silhouettes. */
export const GLYPH_KINDS = [
  "feature",
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "index",
  "code",
] as const;

function regularPolygon(sides: number, radius = 1, rotation = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * 2 * Math.PI;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return pts;
}

function star(points: number, outer = 1, inner = 0.55): number[] {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i / (points * 2)) * 2 * Math.PI;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/**
 * One distinct silhouette polygon per kind (unit scale, centered). Unknown
 * kinds fall back to the circle-ish default — a node never renders blank.
 */
export function glyphPolygon(kind: string): number[] {
  switch (kind) {
    case "feature":
      return star(6); // compound convergence mark
    case "research":
      return regularPolygon(16); // organic circle
    case "adr":
      return regularPolygon(4); // decision diamond
    case "plan":
      return [-1, -0.8, 1, -0.8, 1, 0.8, 0.2, 0.8, 0, 1, -0.2, 0.8, -1, 0.8]; // tabbed sheet
    case "exec":
      return regularPolygon(3, 1, Math.PI / 2); // grounded triangle
    case "audit":
      return [-0.9, -0.9, 0.9, -0.9, 0.9, 0.2, 0, 1, -0.9, 0.2]; // shield
    case "reference":
      return [-0.7, -1, 0.7, -1, 0.7, 1, -0.7, 1]; // tall book spine
    case "index":
      return [-1, -1, 0.2, -1, 1, 0, 0.2, 1, -1, 1, -0.2, 0]; // chevron tab
    case "code":
      return regularPolygon(6, 1, 0); // brackets hex
    default:
      return regularPolygon(12);
  }
}

export const TIER_GLYPH_MARKS = {
  declared: "◆",
  structural: "▣",
  temporal: "◷",
  semantic: "≈",
} as const;

export const STATE_GLYPH_MARKS = {
  active: "●",
  complete: "✓",
  archived: "▫",
  broken: "!",
  stale: "~",
} as const;

// --- computed SDF (pure, unit-tested) -------------------------------------------

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

export function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Rasterize a signed distance field for a unit polygon: one byte per
 * texel, 128 on the contour, >128 inside, <128 outside, distance scaled by
 * `spread` in polygon units. Small (default 64²) — placeholder fidelity.
 */
export function polygonSdf(poly: number[], size = 64, spread = 0.5): Uint8Array {
  const out = new Uint8Array(size * size);
  const n = poly.length / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Texel → polygon space [-1.2, 1.2] (margin for the spread band).
      const px = ((x + 0.5) / size) * 2.4 - 1.2;
      const py = ((y + 0.5) / size) * 2.4 - 1.2;
      let d = Infinity;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        d = Math.min(
          d,
          segmentDistance(
            px,
            py,
            poly[j * 2],
            poly[j * 2 + 1],
            poly[i * 2],
            poly[i * 2 + 1],
          ),
        );
      }
      const signed = pointInPolygon(px, py, poly) ? d : -d;
      out[y * size + x] = Math.max(
        0,
        Math.min(255, Math.round(128 + (signed / spread) * 127)),
      );
    }
  }
  return out;
}

// --- the texture provider --------------------------------------------------------

/** Sprite raster size (supersampled; sprites draw at ~12px on stage). */
export const GLYPH_SPRITE_SIZE = 48;

/**
 * Generates and caches white silhouette textures per kind from the
 * placeholder polygons; the sprite layer tints them with state colour.
 * Requires a live renderer (texture generation is a GPU operation), which
 * the field assembly supplies after mount.
 */
export class ProgrammaticGlyphs implements GlyphTextureProvider {
  private renderer: Renderer;
  private cache = new Map<string, Texture>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  textureFor(kind: string): Texture {
    const key = GLYPH_KINDS.includes(kind as (typeof GLYPH_KINDS)[number])
      ? kind
      : "default";
    let texture = this.cache.get(key);
    if (!texture) {
      const poly = glyphPolygon(key);
      const r = GLYPH_SPRITE_SIZE / 2.4;
      const g = new Graphics();
      g.poly(poly.map((v) => v * r)).fill(0xffffff);
      texture = this.renderer.generateTexture(g);
      g.destroy();
      this.cache.set(key, texture);
    }
    return texture;
  }

  destroy(): void {
    for (const texture of this.cache.values()) {
      texture.destroy(true);
    }
    this.cache.clear();
  }
}
