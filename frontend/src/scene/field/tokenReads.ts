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
//   --color-canvas-bg            the field ground (pixiField background)
//   --color-scene-rule           the flat-grey connection-field stroke (edgeMeshes)
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

/**
 * Read a scene-read CSS custom property as a 24-bit RGB number. Returns the
 * fallback when `document` is undefined (the node test env) or when the resolved
 * value is not a `#rrggbb` literal — the literal-hex contract the scene depends
 * on (a var() chain or an oklch() value, which getComputedStyle will not flatten
 * for a custom property, falls through to the fallback rather than mis-painting).
 */
export function cssColorNumber(varName: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw.startsWith("#") ? parseInt(raw.slice(1), 16) : fallback;
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
