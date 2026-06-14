// @vitest-environment happy-dom
//
// Pixi's SVG parser (`GraphicsContext.svg`) uses `DOMParser`, so this spike
// runs in a DOM env rather than the default node env. The texture step is
// proven GPU-free: `RenderTexture.create` yields a real `Texture` with
// deterministic dimensions, while the live `generateTexture` upload (which
// needs a GPU) stays the only untested half — matching how the existing
// `glyphs.test.ts` exercises geometry but not the renderer call.

import { describe, expect, it } from "vitest";
import { Graphics, Texture } from "pixi.js";

import { GraphicsContext } from "pixi.js";

import {
  PHOSPHOR_GIT_COMMIT_SVG,
  PHOSPHOR_GRID,
  phosphorGraphics,
  renderTextureFor,
  resolveCurrentColor,
} from "./phosphorTexture";

describe("phosphor svg → graphics", () => {
  it("parses a Phosphor SVG into a Pixi Graphics with real geometry", () => {
    const g = phosphorGraphics(PHOSPHOR_GIT_COMMIT_SVG);
    expect(g).toBeInstanceOf(Graphics);
    const bounds = g.getLocalBounds();
    // The git-commit mark spans the full Phosphor grid horizontally (the
    // x=8..248 stroke) and the central node vertically — non-empty, finite,
    // and contained within the 256-unit authoring grid.
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.width).toBeLessThanOrEqual(PHOSPHOR_GRID);
    expect(bounds.height).toBeLessThanOrEqual(PHOSPHOR_GRID);
    g.destroy();
  });

  it("parses the rounded-join currentColor source without throwing", () => {
    // The ADR's premise: Phosphor ships clean per-icon SVG. The one piece of
    // preprocessing the seam needs is resolving `currentColor` (see below);
    // with that done, parsing must not throw.
    expect(() => {
      const g = phosphorGraphics(PHOSPHOR_GIT_COMMIT_SVG);
      g.destroy();
    }).not.toThrow();
  });
});

describe("currentColor resolution (spike finding)", () => {
  it("Pixi's SVG parser rejects raw currentColor", () => {
    // Documents the real seam constraint: Pixi's Color parser cannot resolve
    // the CSS `currentColor` keyword, so the raw Phosphor source throws.
    expect(PHOSPHOR_GIT_COMMIT_SVG).toContain("currentColor");
    expect(() => new GraphicsContext().svg(PHOSPHOR_GIT_COMMIT_SVG)).toThrow();
  });

  it("substituting a concrete ink makes the source parseable", () => {
    const resolved = resolveCurrentColor(PHOSPHOR_GIT_COMMIT_SVG);
    expect(resolved).not.toContain("currentColor");
    expect(resolved).toContain("#ffffff");
    expect(() => new GraphicsContext().svg(resolved)).not.toThrow();
  });
});

describe("graphics → texture seam", () => {
  it("produces a Texture with the expected sprite dimensions", () => {
    // The GlyphTextureProvider seam draws supersampled square textures
    // (GLYPH_SPRITE_SIZE = 48). Prove the texture allocation yields a real
    // Texture of exactly those dimensions without a live GPU.
    const size = 48;
    const texture = renderTextureFor(size, size);
    expect(texture).toBeInstanceOf(Texture);
    expect(texture.width).toBe(size);
    expect(texture.height).toBe(size);
    texture.destroy(true);
  });

  it("allocates non-square textures at requested dimensions", () => {
    const texture = renderTextureFor(64, 32);
    expect(texture.width).toBe(64);
    expect(texture.height).toBe(32);
    texture.destroy(true);
  });
});
