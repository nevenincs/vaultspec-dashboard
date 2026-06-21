// Scene token-read seam — the ONE home for reading the scene-read --color-*
// surface through getComputedStyle (audit H2; themes-are-oklch-generated-from-a-
// token-tier; figma-parity-reconciliation W03.P07.S46). Scene-layer module:
// framework-free by design.
//
// THE LITERAL-HEX CONTRACT: the scene reads its colours through getComputedStyle
// / getPropertyValue, which does NOT resolve a var() chain for a custom property
// in real browsers — so the scene-read tokens are emitted as LITERAL HEX
// (#rrggbb), never var() aliases. Those literal-hex values are GENERATED from the
// DTCG colour source into the `vaultspec:generated:colors` region of `styles.css`
// by the Style Dictionary build (the regenerated foundation pipeline), and are
// the sRGB renderings of the OKLCH semantic steps per theme. The scene-read
// subset the readers below resolve is exactly that flat-hex surface:
//   --color-canvas-bg            the field ground (canvas background)
//   --color-scene-rule           the flat-grey connection-field stroke (edges)
//   --color-scene-category-*      the eight node-category body hues (categoryColor)
//   --color-ink / --color-ink-muted / --color-rule   label + chrome ink
//   --color-tier-* / --color-state-* / --color-status-*   off-canvas marks
//
// These helpers encode the single "must be hex, else fall back" discipline that
// was previously re-encoded in five places (nodeSprites, edgeMeshes, overlayLayer,
// pixiField, minimapLayer). A non-hex value (an oklch() or an unresolved var())
// falls through to the caller's fallback rather than rendering a wrong colour. In
// the node test environment `document` is undefined, so the numeric reader returns
// its fallback — which the scene modules keep in lockstep with the light-theme
// generated hex.
//
// UPDATE (theme-aware accent fix): scene-read tokens are still emitted as literal
// #rrggbb and that stays the fast path, but the reader no longer FALLS BACK on a
// non-hex value. getComputedStyle DOES flatten a normal var() chain to its final
// colour (the HIGH-1 case was specifically an @theme-INLINE self-cycle, which
// cannot resolve), so a chrome token the scene reads — e.g. --color-accent, which
// aliases an oklch() accent semantic — resolves to "oklch(L C H)". That is now
// PARSED (via culori) into an sRGB int instead of mis-falling-back to the light
// value, which is what made the selection/hover rings the wrong hue in dark/HC.
// Only a genuinely unresolvable value (a "var(...)" left by a self-cycle, or an
// empty/garbage value) still falls back.

import { converter, parse } from "culori";

/** Shared sRGB converter (culori) for the non-hex parse path. */
const toRgb = converter("rgb");

/**
 * Read a scene-read CSS custom property as a 24-bit sRGB number. Returns the
 * fallback when `document` is undefined (the node test env) or when the resolved
 * value cannot be parsed as a colour. A `#rrggbb` literal is parsed directly (the
 * fast path the scene-read tokens use); any other RESOLVED CSS colour the value
 * flattens to — `oklch()` (the common case for an aliased chrome token such as
 * `--color-accent`), `rgb()`, `hsl()`, a named or short/alpha hex — is parsed and
 * gamut-clamped to sRGB. An unresolvable value (a `var(...)` left by an
 * @theme-inline self-cycle, or empty) falls back rather than mis-painting.
 */
export function cssColorNumber(varName: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return fallback;
  // Fast path: the scene-read tokens are emitted as literal #rrggbb.
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return parseInt(raw.slice(1), 16);
  // General path: parse whatever colour the var() chain resolved to (oklch/rgb/…).
  const rgb = toRgb(parse(raw));
  if (!rgb) return fallback;
  const ch = (x: number | undefined): number =>
    Math.max(0, Math.min(255, Math.round((x ?? 0) * 255)));
  return (ch(rgb.r) << 16) | (ch(rgb.g) << 8) | ch(rgb.b);
}

/**
 * Read a scene-read CSS custom property as its raw trimmed string, for canvas-2D
 * consumers (such as the minimap) that paint with CSS colour strings. Returns the
 * fallback when the value is absent. An optional pre-resolved declaration lets a
 * caller resolve `getComputedStyle` once per render pass and read many tokens from
 * it, avoiding a per-token style recompute on a hot path.
 */
export function cssColorString(
  varName: string,
  fallback: string,
  root?: CSSStyleDeclaration,
): string {
  const cssRoot = root ?? getComputedStyle(document.documentElement);
  return cssRoot.getPropertyValue(varName).trim() || fallback;
}
