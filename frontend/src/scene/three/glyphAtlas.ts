// Glyph atlas for the optional "Show icons" node treatment (graph-node-icons).
//
// The icon mode swaps the plain category-coloured CIRCLE for the node's doc-type
// element mark (Decision / Research / Plan / …). The marks are the SAME centralized
// `DOC_TYPE_MARK_DEFS` the legend, tree, and hover card already render
// (design-system-is-centralized / icons-come-from-the-two-sanctioned-families) — no
// new icon production. They are baked ONCE into a single small R8 coverage texture
// (one cell per category) the glyph instanced mesh samples by cell, tinted in-shader
// by the same category hue (the white-ink-then-tint contract the retired Pixi seam
// used). Bounded by construction: a fixed, small category set → a fixed 256×128 atlas
// (bounded-by-default-for-every-accumulator).
//
// The coverage is rasterized by the deterministic pure-JS `svgRaster` the 14px
// legibility gate already uses, so the atlas needs no 2D-canvas API and builds in any
// environment that can construct a three texture. Supersampled then box-downsampled
// for edge anti-aliasing; GPU mipmaps are off (icons fade out before heavy
// minification, so cross-cell mip bleed never shows).

import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  type Texture,
  UnsignedByteType,
} from "three";

import { rasterizeBody } from "../field/svgRaster";
import { DOC_TYPE_MARK_DEFS } from "../field/marks";
import { nodeCategory } from "../field/categoryColor";

/**
 * The doc-type glyph vocabulary the icon mode draws, keyed identically to
 * `DOC_TYPE_MARK_DEFS` / `categoryColor`. Declaration order fixes each mark's atlas
 * CELL index, so the renderer resolves a node to a cell with `cellOf`.
 */
export const GLYPH_KEYS = [
  "feature",
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
  "code",
] as const;
export type GlyphKey = (typeof GLYPH_KEYS)[number];

// Atlas geometry: COLS*ROWS must cover GLYPH_KEYS (8). 4×2 cells of 64px → a 256×128
// pow2 atlas. SS supersamples each cell for box-downsampled edge AA.
const COLS = 4;
const ROWS = 2;
const CELL = 64;
const SS = 2;

export interface GlyphAtlas {
  /** The R8 coverage texture (sample `.r` as the glyph alpha). */
  readonly texture: Texture;
  readonly cols: number;
  readonly rows: number;
  /** Atlas cell index for a glyph key, or -1 when the key has no mark. */
  cellOf(key: string): number;
}

/**
 * Resolve a scene node to its glyph key — the SAME fallback ladder
 * `categoryColor` uses to colour the node body, so a node's icon always matches its
 * hue. `docType` wins; then the wire species (`feature`, `code`); else the category
 * fallback (`nodeCategory` always lands on a key in GLYPH_KEYS).
 */
export function glyphKeyForNode(node: { kind: string; docType?: string }): GlyphKey {
  const dt = node.docType;
  if (dt && (GLYPH_KEYS as readonly string[]).includes(dt)) return dt as GlyphKey;
  const k = node.kind;
  if (k === "code" || k === "code-artifact") return "code";
  if ((GLYPH_KEYS as readonly string[]).includes(k)) return k as GlyphKey;
  // nodeCategory maps any species onto one of feature/research/adr/plan/exec/audit/
  // reference — all present in GLYPH_KEYS — so this never misses.
  return nodeCategory(dt ?? k) as GlyphKey;
}

/**
 * Bake the doc-type marks into one R8 coverage atlas. Returns null only when a
 * three DataTexture cannot be constructed in the host environment (so the renderer
 * silently keeps the circle treatment). Cheap and one-shot; the renderer caches it.
 */
export function buildGlyphAtlas(): GlyphAtlas | null {
  const W = COLS * CELL;
  const H = ROWS * CELL;
  const data = new Uint8Array(W * H);
  const index = new Map<string, number>();
  const raster = CELL * SS;

  GLYPH_KEYS.forEach((key, cell) => {
    index.set(key, cell);
    const def = DOC_TYPE_MARK_DEFS[key];
    if (!def) return;
    let cov: boolean[];
    try {
      cov = rasterizeBody(def.body, raster);
    } catch {
      return; // leave the cell empty; the node falls back to its circle
    }
    const ox = (cell % COLS) * CELL;
    const oy = Math.floor(cell / COLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        let hit = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (cov[(y * SS + sy) * raster + (x * SS + sx)]) hit++;
          }
        }
        // Row-major top-down: data row 0 = raster top. The glyph quad's UVs map its
        // top vertex to v=0, so the icon renders upright.
        data[(oy + y) * W + (ox + x)] = Math.round((hit / (SS * SS)) * 255);
      }
    }
  });

  let texture: DataTexture;
  try {
    texture = new DataTexture(data, W, H, RedFormat, UnsignedByteType);
  } catch {
    return null;
  }
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    cols: COLS,
    rows: ROWS,
    cellOf: (key: string) => index.get(key) ?? -1,
  };
}
