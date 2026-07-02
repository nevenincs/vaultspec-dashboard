// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { REM_BASIS_PX, invalidateRootFontPx, rootFontPx, uiScale } from "./uiScale";

// The canvas UI-scale bridge (relative-units-migration): rem is undefined in WebGL
// space, so the scene multiplies screen-px constants by uiScale() = rootFontPx/16 to
// track the DOM. These lock the contract: scale 1 at the 16px basis, proportional to
// the root font size, and a safe fallback.

function setRootFontSize(px: string | null): void {
  if (px === null) document.documentElement.style.removeProperty("font-size");
  else document.documentElement.style.fontSize = px;
  // SGR-004: rootFontPx() is now cached; the settings echo (here, the test) must
  // invalidate so the next read re-measures.
  invalidateRootFontPx();
}

afterEach(() => setRootFontSize(null));

describe("scene UI-scale bridge", () => {
  it("uses a 16px rem basis", () => {
    expect(REM_BASIS_PX).toBe(16);
  });

  it("is scale 1.0 at the 16px basis", () => {
    setRootFontSize("16px");
    expect(rootFontPx()).toBe(16);
    expect(uiScale()).toBe(1);
  });

  it("scales proportionally above the basis (UI enlarged)", () => {
    setRootFontSize("20px");
    expect(rootFontPx()).toBe(20);
    expect(uiScale()).toBeCloseTo(1.25, 5);
  });

  it("scales proportionally below the basis (UI shrunk)", () => {
    setRootFontSize("8px");
    expect(rootFontPx()).toBe(8);
    expect(uiScale()).toBeCloseTo(0.5, 5);
  });

  it("falls back to the basis (scale 1) when the root size is unreadable", () => {
    // happy-dom resolves an empty/invalid font-size to a non-finite parse; the bridge
    // must degrade to the 16px basis rather than produce NaN or 0.
    setRootFontSize("");
    const s = uiScale();
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it("caches the root font size until invalidated (SGR-004)", () => {
    // A read caches the measured value; a raw DOM change is NOT observed until the
    // cache is invalidated (the resize / settings-echo contract), then it re-measures.
    document.documentElement.style.fontSize = "16px";
    invalidateRootFontPx();
    expect(rootFontPx()).toBe(16);
    // Change the DOM WITHOUT invalidating: the cached value still serves.
    document.documentElement.style.fontSize = "24px";
    expect(rootFontPx()).toBe(16);
    // Invalidate (the settings echo / resize) → the next read re-measures.
    invalidateRootFontPx();
    expect(rootFontPx()).toBe(24);
  });
});
