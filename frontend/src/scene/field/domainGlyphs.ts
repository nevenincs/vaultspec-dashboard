// The domain-mark texture provider — the GlyphTextureProvider the scene uses
// for the Phosphor domain-mark family (W02.P17.S37). It is the single
// implementation behind the `GlyphTextureProvider` seam (iconography +
// node-canvas ADRs).
//
// Each texture is produced by the proven path (the W01.P04.S20 spike):
// the mark's `currentColor` SVG → resolve `currentColor` to white ink (Pixi's
// SVG parser throws on the literal keyword) → `GraphicsContext.svg()` → a Pixi
// `Graphics` → `renderer.generateTexture()`. The texture stays a tintable
// white silhouette; the sprite layer recolors it with the state tint. One
// distinct silhouette per node species; colour is reserved for state.

import { GraphicsContext, Graphics, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { resolveMarkInk, markSvg, type MarkDef } from "./markInk";
import { DOC_TYPE_MARK_DEFS, markDef } from "./marks";
import type { GlyphTextureProvider } from "./nodeSprites";

/** Supersampled raster size for a mark texture (sprites draw at node size). */
export const DOMAIN_GLYPH_SIZE = 64;

/** The default mark for an unknown node kind — a node never renders blank. */
const DEFAULT_KIND = "reference";

/**
 * Resolve a node kind to its mark def. Known doc-type/feature species resolve
 * directly; anything else falls back to the default species silhouette, so the
 * provider never throws on an unexpected kind. Tier/state/event marks are addressed by their full id
 * through `markDef` for the chrome plane and the gate, not by node kind.
 */
export function markForKind(kind: string): MarkDef {
  return DOC_TYPE_MARK_DEFS[kind] ?? DOC_TYPE_MARK_DEFS[DEFAULT_KIND];
}

/**
 * Resolve any mark by its stable id (a tier/state/event id or a doc-type kind)
 * for `textureForMark` — the legend/badge path that turns a non-species mark
 * into a silhouette texture. Falls back to the default species for an unknown
 * id so the provider never throws. Pure and unit-tested; the GPU upload that
 * consumes it stays untested (no GPU in the test env).
 */
export function markForId(id: string): MarkDef {
  return markDef(id) ?? markForKind(id);
}

/**
 * Rasterize a mark SVG into a Pixi `Graphics` via the spike-proven parse:
 * substitute the tintable ink, then parse with `GraphicsContext.svg()`. Pure
 * geometry — no GPU upload — so it is inspectable offline (the gate and tests
 * use the same parse). Requires a DOM (Pixi's SVG parser uses DOMParser).
 */
export function markGraphics(def: MarkDef): Graphics {
  const context = new GraphicsContext().svg(resolveMarkInk(markSvg(def)));
  return new Graphics(context);
}

/**
 * Generates and caches white silhouette textures from the domain-mark family
 * through the same `generateTexture` seam the placeholder provider uses. The
 * sprite layer tints them with state colour. Requires a live renderer (texture
 * generation is a GPU operation), which the field assembly supplies after
 * mount.
 */
export class DomainGlyphs implements GlyphTextureProvider {
  private renderer: Renderer;
  private cache = new Map<string, Texture>();

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  /** Texture for a node KIND (the silhouette plane the sprite layer consumes). */
  textureFor(kind: string): Texture {
    const def = markForKind(kind);
    return this.textureForDef(def, kind);
  }

  /** Texture for any mark by its stable id (tier/state/event/doc-type). */
  textureForMark(id: string): Texture {
    return this.textureForDef(markForId(id), id);
  }

  private textureForDef(def: MarkDef, cacheKey: string): Texture {
    let texture = this.cache.get(cacheKey);
    if (!texture) {
      const g = markGraphics(def);
      texture = this.renderer.generateTexture(g);
      g.destroy();
      this.cache.set(cacheKey, texture);
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
