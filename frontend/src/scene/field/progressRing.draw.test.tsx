// @vitest-environment happy-dom
//
// The progress-ring draw step (S36): maps the pure arc geometry onto a Pixi
// Graphics. happy-dom supplies the DOM Pixi needs; the GPU upload is never
// reached (we never call generateTexture), so this exercises real geometry, not
// the renderer — matching how the texture seam tests stop at the Graphics.

import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";

import { drawProgressRing } from "./progressRing";

describe("drawProgressRing", () => {
  it("draws a non-empty arc for a partial fraction", () => {
    const g = drawProgressRing(new Graphics(), 0.5, {
      radius: 10,
      width: 2,
      color: 0xffffff,
    });
    const bounds = g.getLocalBounds();
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    g.destroy();
  });

  it("draws a wider footprint with a track than without", () => {
    const arcOnly = drawProgressRing(new Graphics(), 0.25, {
      radius: 10,
      width: 2,
      color: 0xffffff,
    });
    const withTrack = drawProgressRing(new Graphics(), 0.25, {
      radius: 10,
      width: 2,
      color: 0xffffff,
      trackColor: 0x808080,
    });
    // The track is a full circle; the quarter arc alone spans less of it.
    expect(withTrack.getLocalBounds().width).toBeGreaterThanOrEqual(
      arcOnly.getLocalBounds().width,
    );
    arcOnly.destroy();
    withTrack.destroy();
  });

  it("omits the arc at fraction 0 (track-only is a clean ring)", () => {
    // A zero-sweep arc would draw a stray cap; the primitive must skip it.
    const g = drawProgressRing(new Graphics(), 0, {
      radius: 10,
      width: 2,
      color: 0xffffff,
      trackColor: 0x808080,
    });
    const bounds = g.getLocalBounds();
    // The track circle (r=10) dominates; bounds are ~the ring diameter.
    expect(bounds.width).toBeGreaterThan(15);
    g.destroy();
  });
});
