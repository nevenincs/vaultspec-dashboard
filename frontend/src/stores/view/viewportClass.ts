import { useSyncExternalStore } from "react";

// Viewport-class signal (mobile-responsive-layout ADR D1): the ONE source of
// truth for "is this a compact (phone/tablet) viewport or a regular (desktop)
// one". It is a single `matchMedia`-backed signal fed into the shell projection
// (`deriveShellFrameView`) so the SAME projection emits either the desktop
// three-column grid (regular) or the compact single-pane + bottom-tab-bar frame
// (compact). No surface forks a parallel mobile component tree; the class is an
// input to the existing projection (responsive-layout-is-one-viewport-aware-
// projection).
//
// Layer law (dashboard-layer-ownership): pure view-local signal — no wire, no
// query cache, no `tiers`. It is NOT scope-rekeyed (the viewport is a property of
// the device/window, not the corpus), so unlike `browserMode` it carries no reset.
//
// stable-selectors: `useSyncExternalStore` returns a PRIMITIVE string
// ("compact" | "regular"), value-compared, so no fresh reference escapes and the
// getSnapshot loop the rule warns about cannot occur.

export type ViewportClass = "compact" | "regular";

/**
 * The compact breakpoint: below this width the desktop three-column shell cannot
 * coexist (the two rails alone exceed a phone viewport), so the layout collapses
 * to the single-pane + bottom-tab-bar frame. Expressed in rem at the 16px basis
 * (`no-hardcoded-px-in-dom-styling`): 40rem = 640px. The query uses `max-width:
 * (40rem - 0.01rem)` so exactly 40rem is already "regular".
 */
export const COMPACT_VIEWPORT_MAX_REM = 40;
const COMPACT_MEDIA_QUERY = `(max-width: ${COMPACT_VIEWPORT_MAX_REM - 0.01}rem)`;

/** True when the environment exposes a usable `matchMedia` (guards SSR / the
 *  node + happy-dom test env, where it may be absent). */
function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function getSnapshot(): ViewportClass {
  if (!hasMatchMedia()) return "regular";
  return window.matchMedia(COMPACT_MEDIA_QUERY).matches ? "compact" : "regular";
}

/** Server snapshot: default to the desktop layout so SSR/tests never assume a
 *  phone. */
function getServerSnapshot(): ViewportClass {
  return "regular";
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
  // Safari < 14 only supports the deprecated addListener; support both.
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

/**
 * Subscribe to the live viewport class. Re-renders the consumer when the viewport
 * crosses the compact breakpoint (e.g. a desktop window dragged narrow, or a
 * device rotation), so the layout switches on demand and seamlessly.
 */
export function useViewportClass(): ViewportClass {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Imperative read (for non-React call sites / one-off derivations). Prefer the
 *  hook in components so the layout reacts to breakpoint changes. */
export function viewportClass(): ViewportClass {
  return getSnapshot();
}

/** Convenience predicate. */
export function isCompactViewport(): boolean {
  return getSnapshot() === "compact";
}
