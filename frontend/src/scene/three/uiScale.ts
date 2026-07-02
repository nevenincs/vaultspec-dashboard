// Canonical UI-scale bridge for the WebGL scene (relative-units-migration).
//
// rem/em are undefined in WebGL render space (a canvas has no root font size), so
// the scene cannot author screen-space sizes in rem directly. This module is the
// bridge: it reads the live ROOT font size and exposes the ratio against the 16px
// rem basis, so every screen-space px constant in the canvas — the node/edge on-
// screen size clamp bands, the pick tolerance, the emphasis-ring gaps, and the
// label offsets — is multiplied by it and therefore scales in lockstep with the DOM
// under one UI-scale change. This is the canvas's enrolment into the relative-units
// contract (the deferred scene half of the campaign): one root font-size change
// resizes the graph and the DOM frontend together.
//
// Framework-free scene module; in a node test env (no document) it falls back to the
// 16px basis, i.e. scale 1. `labelStyle.ts` reads `rootFontPx` from here too, so the
// label type ramp and the screen-px constants share ONE source of the root size.

/** The rem basis the DTCG token pipeline emits against (1rem = 16px). */
export const REM_BASIS_PX = 16;

/** Measure the live root font size (a forced `getComputedStyle` reflow read). */
function measureRootFontPx(): number {
  if (typeof document === "undefined") return REM_BASIS_PX;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px : REM_BASIS_PX;
}

// SGR-004: the root font size is a CONSTANT between UI-scale changes, but
// `rootFontPx()` is called at interaction/frame frequency (worst: once per node
// inside the pick loop). A raw `getComputedStyle` there is a forced style
// recalculation each call — ~5k/pointermove on a large graph. Cache the measured
// value and re-measure only when it can actually change: a window `resize` (the
// browser-zoom / viewport path) or an explicit `invalidateRootFontPx()` from a
// UI-scale settings echo. `labelStyle.ts` reads through here, so it shares the
// cache for free.
let cachedRootFontPx: number | null = null;

/** Root font size in px — the divisor that makes rem tokens UI-scale-relative.
 *  Cached; invalidated on window resize and via [`invalidateRootFontPx`]. */
export function rootFontPx(): number {
  if (cachedRootFontPx === null) cachedRootFontPx = measureRootFontPx();
  return cachedRootFontPx;
}

/** Drop the cached root font size so the next read re-measures. Call this from
 *  the UI-scale settings echo (the only non-resize event that changes the root
 *  font); the window `resize` listener below covers the zoom/viewport path. */
export function invalidateRootFontPx(): void {
  cachedRootFontPx = null;
}

// Auto-invalidate on viewport/zoom changes. Guarded for the node test env (no
// window). Passive: it only clears a cache, the next read re-measures lazily.
if (typeof window !== "undefined") {
  window.addEventListener("resize", invalidateRootFontPx);
}

/**
 * Screen-px multiplier: 1.0 at the 16px basis, >1 when the user enlarges the UI
 * scale (root font size), <1 when they shrink it. Multiply any screen-space px
 * constant by this so the canvas tracks the DOM's relative sizing.
 */
export function uiScale(): number {
  return rootFontPx() / REM_BASIS_PX;
}
