// @vitest-environment happy-dom
//
// The domain-mark texture provider (S37). Pixi's SVG parser uses DOMParser, so
// this runs in happy-dom like the texture spike. The parse-to-Graphics half is
// exercised here (real, inspectable geometry); the live `generateTexture` GPU
// upload stays untested (no GPU in the test env), matching the spike — the
// provider's geometry is what we assert, not the renderer call.

import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";

import { markForId, markForKind, markGraphics } from "./domainGlyphs";
import { DOC_TYPE_MARK_DEFS, STATE_MARK_DEFS, TIER_MARK_DEFS } from "./marks";

describe("markForKind", () => {
  it("resolves every doc-type/feature species to its own mark", () => {
    for (const kind of Object.keys(DOC_TYPE_MARK_DEFS)) {
      expect(markForKind(kind).id).toBe(DOC_TYPE_MARK_DEFS[kind].id);
    }
  });

  it("falls back to a real mark for an unknown kind (never blank)", () => {
    const fallback = markForKind("mystery-kind");
    expect(fallback).toBeDefined();
    expect(fallback.body.length).toBeGreaterThan(0);
  });

  it("carries the authored node-feature mark for the feature species", () => {
    expect(markForKind("feature").provenance).toBe("authored");
  });
});

describe("markForId (the textureForMark resolution path)", () => {
  it("resolves a tier id to the tier def, not a doc-type species", () => {
    // The latent path the review flagged: textureForMark can turn a tier mark
    // into a texture. Prove its resolver picks the tier def by id (geometry
    // only; the GPU upload that consumes it is untested).
    expect(markForId("tier:declared").body).toBe(TIER_MARK_DEFS.declared.body);
  });

  it("resolves a state id to the state def", () => {
    expect(markForId("state:broken").body).toBe(STATE_MARK_DEFS.broken.body);
  });

  it("falls back to a real species mark for an unknown id (never blank)", () => {
    const fallback = markForId("not:a:mark");
    expect(fallback.body.length).toBeGreaterThan(0);
  });
});

describe("markGraphics", () => {
  it("parses every species mark into a Pixi Graphics with real geometry", () => {
    for (const kind of Object.keys(DOC_TYPE_MARK_DEFS)) {
      const g = markGraphics(DOC_TYPE_MARK_DEFS[kind]);
      expect(g).toBeInstanceOf(Graphics);
      const bounds = g.getLocalBounds();
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      // Marks live on the 256 grid; geometry stays within it.
      expect(bounds.width).toBeLessThanOrEqual(256);
      expect(bounds.height).toBeLessThanOrEqual(256);
      g.destroy();
    }
  });

  it("resolves currentColor before parsing (the seam preprocessing)", () => {
    // The spike finding: the raw currentColor source throws in Pixi's parser;
    // markGraphics must substitute the ink first, so this never throws.
    expect(() => {
      const g = markGraphics(DOC_TYPE_MARK_DEFS.adr);
      g.destroy();
    }).not.toThrow();
  });
});
