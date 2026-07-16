// Mark SVG plumbing shared by every consumer of the domain-mark family: the
// `MarkDef` shape, the 256-grid SVG wrapper, and the one piece of preprocessing
// the Pixi texture seam needs — resolving `currentColor` to a concrete tintable
// ink. Kept separate from the mark INVENTORY (`marks.ts`) so the gate and the
// texture provider can depend on the plumbing without pulling the path data,
// and so the inventory file is purely geometry.
//
// The `currentColor` substitution is the spike finding (W01.P04.S20): Pixi's
// SVG color parser throws on the literal `currentColor` keyword because it
// resolves against a live CSS cascade Pixi cannot see. The texture seam fills a
// concrete white ink and the sprite layer tints it with state colour
// downstream — the white-ink-then-tint contract. The React chrome, which lives
// in a real cascade, consumes the raw `currentColor` source unchanged.

/** Phosphor's authoring grid edge, in SVG user units (shared by all marks). */
export const MARK_GRID = 256;

/** The placeholder ink the texture seam substitutes for `currentColor`. */
export const MARK_INK = "#ffffff";

/**
 * A domain mark: the inner SVG body (one or more path/shape elements) on the
 * 256 grid. `body` carries `fill="currentColor"` (or stroke) so the texture
 * seam resolves it to a tintable ink and the chrome resolves it against the
 * live cascade.
 */
export interface MarkDef {
  /** Stable mark id (a GLYPH_KINDS species, a tier key, or a state key). */
  readonly id: string;
  /** Whether the geometry is adopted from Phosphor or authored in-family. */
  readonly provenance: "adopted" | "authored";
  /** The inner SVG markup on the 256 grid; no outer <svg> wrapper. */
  readonly svgBody: string;
}

/** Wrap a mark body in a complete 256-grid SVG document string. */
export function markSvg(def: MarkDef): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}">` +
    def.svgBody +
    "</svg>"
  );
}

/**
 * Resolve `currentColor` to a concrete ink before the Pixi SVG parser sees it.
 * The default ink is white (the tintable placeholder the sprite layer recolors
 * with state); pass a concrete ink for offline rendering/inspection.
 */
export function resolveMarkInk(svg: string, ink = MARK_INK): string {
  return svg.replace(/currentColor/g, ink);
}
