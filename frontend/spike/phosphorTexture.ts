// Phosphor SVG → Pixi Texture spike (W01.P04.S20, iconography ADR).
//
// The iconography ADR adopts Phosphor for the expressive/domain plane and
// requires that its clean per-icon SVG (fill=currentColor, rounded joins)
// can feed the GPU texture seam — `GlyphTextureProvider.textureFor` in
// `src/scene/field/nodeSprites.ts`, implemented today by
// `ProgrammaticGlyphs` which builds a Pixi `Graphics` and uploads it via
// `renderer.generateTexture(graphics)`.
//
// This spike proves the SVG-string → Texture path WITHOUT authoring the
// domain-mark set (that is deferred to W02.P17). It is deliberately minimal:
// one representative Phosphor icon, the parse-and-rasterize plumbing, and the
// same `generateTexture` seam the placeholder provider already uses.
//
// Two surfaces are exposed so the path is testable without a live GPU:
//   * `phosphorGraphics(svg)` — pure parse: SVG string → Pixi `Graphics`,
//     no renderer required, bounds inspectable in the DOM test env.
//   * `phosphorTextureFor(svg, renderer)` — the real seam: feeds that
//     `Graphics` through `renderer.generateTexture`, identical in shape to
//     `ProgrammaticGlyphs.textureFor`.
//   * `renderTextureFor(width, height)` — GPU-free `Texture` allocation with
//     deterministic dimensions, so the texture step is assertable offline.

import { GraphicsContext, Graphics, RenderTexture, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

/**
 * A representative Phosphor mark: the `git-commit` icon, which the ADR adopts
 * directly for the commit event mark. Phosphor ships on a 256-unit grid with
 * `fill=currentColor` and rounded joins; this is a verbatim path from the
 * regular weight. Inlined (rather than imported) to keep the spike free of a
 * build-time SVG-asset pipeline that is W02.P17's concern.
 */
export const PHOSPHOR_GIT_COMMIT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
  '<path fill="currentColor" d="M248 120h-58.34a64 64 0 0 0-123.32 0H8a8 8 0 0 0 0 16h58.34a64 64 0 0 0 123.32 0H248a8 8 0 0 0 0-16ZM128 168a40 40 0 1 1 40-40 40 40 0 0 1-40 40Z"/>' +
  "</svg>";

/** Phosphor's authoring grid edge, in SVG user units. */
export const PHOSPHOR_GRID = 256;

/**
 * Resolve Phosphor's `fill="currentColor"` to a concrete ink before parsing.
 *
 * Spike finding: Pixi's SVG parser (`GraphicsContext.svg`) cannot interpret
 * the CSS `currentColor` keyword — it resolves against the inherited `color`
 * property, which exists only in a live CSS cascade, and Pixi's `Color`
 * parser throws on it. The placeholder provider sidesteps this by filling
 * white (0xffffff) and tinting the sprite with state colour downstream; we
 * keep that contract by substituting `currentColor` with the same white ink,
 * so the texture stays a tintable silhouette. The substitution is the one
 * piece of preprocessing the domain-mark pipeline (W02.P17) must own.
 */
export function resolveCurrentColor(svg: string, ink = "#ffffff"): string {
  return svg.replace(/currentColor/g, ink);
}

/**
 * Parse a Phosphor SVG string into a Pixi `Graphics`. Pure geometry: uses
 * Pixi v8's `GraphicsContext.svg()` (the same parser the renderer consumes),
 * so the returned object carries real, inspectable local bounds without any
 * GPU upload. `currentColor` is resolved to white ink first (see
 * `resolveCurrentColor`). Requires a DOM (Pixi's SVG parser uses `DOMParser`).
 */
export function phosphorGraphics(svg: string): Graphics {
  const context = new GraphicsContext().svg(resolveCurrentColor(svg));
  return new Graphics(context);
}

/**
 * Allocate a `Texture` of exact pixel dimensions without a live GPU.
 * `RenderTexture.create` builds the texture descriptor and backing resource
 * lazily, so the returned object is a real `Texture` with deterministic
 * `width`/`height` that can be asserted offline — the deferred GPU draw is
 * the only part that needs a renderer.
 */
export function renderTextureFor(width: number, height: number): RenderTexture {
  return RenderTexture.create({ width, height });
}

/**
 * The real seam: SVG string → `Texture`, identical in shape to
 * `ProgrammaticGlyphs.textureFor`. Parses the Phosphor SVG to a `Graphics`
 * and uploads it through `renderer.generateTexture`, the exact call the
 * placeholder provider makes today. Requires a live renderer (a GPU
 * operation); the parse and the texture-allocation steps above are the
 * GPU-free halves that the spike test exercises.
 */
export function phosphorTextureFor(svg: string, renderer: Renderer): Texture {
  const graphics = phosphorGraphics(svg);
  const texture = renderer.generateTexture(graphics);
  graphics.destroy();
  return texture;
}
