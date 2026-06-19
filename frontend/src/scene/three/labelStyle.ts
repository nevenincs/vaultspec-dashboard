// Canvas label typography, resolved from the CENTRALIZED design tokens so the
// graph canvas is enrolled in the same Figma-driven design system as the DOM.
// Mirrors the binding Figma spec "graph/Label — Feature | Document"
// (SlhonORmySdoSMTQgDWw3w → section "Canvas / Graph — Labels"):
//   • Feature  → Label/12  (--text-fg-label, weight 500) · scene/ink
//   • Document → Meta/11    (--text-fg-meta,  weight 400) · scene/ink-muted
//
// RELATIVE VALUES (the uniform-scaling contract): label sizes are read from the
// rem-based type tokens and resolved against the ROOT font size, so one UI-scale
// change resizes canvas labels and DOM text together — never a hardcoded px. A
// floor keeps a label legible at small scales / far zoom (the deck.gl-style
// min-px discipline the node/edge sizing also uses). Framework-free scene module;
// when `document` is undefined (node test env) it falls back to the light-theme
// ramp values, kept in lockstep with styles.css.

import { rootFontPx, uiScale } from "./uiScale";

const FONT_FALLBACK = "Inter, system-ui, -apple-system, sans-serif";
/** Floor so a label never renders illegibly small, in rem-relative px (scales with
 *  UI scale so the legibility floor tracks the rest of the canvas). */
const MIN_LABEL_PX = 9;

/** Guarded read of a CSS custom property off `:root` (empty when no document). */
function readVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Resolve a `--text-*` size token (rem or px) to floored pixels, scaling rem by
 *  the root font size (the relative-scaling bridge, shared via `uiScale`). The min
 *  floor is itself UI-scaled so it stays proportional under a UI-scale change. */
function resolveSizePx(token: string, fallbackPx: number): number {
  const raw = readVar(token);
  let px = fallbackPx * uiScale();
  if (raw.endsWith("rem")) {
    const rem = parseFloat(raw);
    if (Number.isFinite(rem)) px = rem * rootFontPx();
  } else if (raw.endsWith("px")) {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) px = v;
  }
  return Math.max(MIN_LABEL_PX * uiScale(), px);
}

export type LabelRole = "feature" | "document";

export interface LabelTextStyle {
  /** Canvas2D font shorthand: `${weight} ${px}px ${family}`. */
  font: string;
  /** Resolved pixel size (rem→px + floor) — for layout maths if needed. */
  sizePx: number;
}

/** Per-role canvas label type, resolved from the design tokens. Feature inherits
 *  the Label/12 ramp step, document the Meta/11 step; both track the root font
 *  size for uniform UI scaling across the graph and the DOM frontend. */
export function labelTextStyle(role: LabelRole): LabelTextStyle {
  const family = readVar("--font-fg-sans") || FONT_FALLBACK;
  if (role === "feature") {
    const sizePx = resolveSizePx("--text-fg-label", 12);
    const weight = readVar("--text-fg-label--weight") || "500";
    return { font: `${weight} ${sizePx}px ${family}`, sizePx };
  }
  const sizePx = resolveSizePx("--text-fg-meta", 11);
  const weight = readVar("--text-fg-meta--weight") || "400";
  return { font: `${weight} ${sizePx}px ${family}`, sizePx };
}
