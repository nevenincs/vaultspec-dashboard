// Scene token-read seam — the ONE home for reading the public --color-* surface
// through getComputedStyle (audit H2; themes-are-oklch-generated-from-a-token-tier).
//
// The scene reads its colours through getComputedStyle / getPropertyValue, which
// does NOT resolve a var() chain for a custom property in real browsers — so the
// scene-read tokens are emitted as LITERAL HEX (#rrggbb) by the OKLCH token file.
// These helpers encode the single "must be hex, else fall back" discipline that
// was previously re-encoded in five places (nodeSprites, edgeMeshes, overlayLayer,
// pixiField, minimapLayer). In the node test environment `document` is undefined,
// so the numeric reader returns its fallback.

/**
 * Read a CSS custom property as a 24-bit RGB number. Returns the fallback when
 * `document` is undefined (node test env) or the resolved value is not a
 * `#rrggbb` literal — the literal-hex contract the scene depends on.
 */
export function cssColorNumber(varName: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw.startsWith("#") ? parseInt(raw.slice(1), 16) : fallback;
}

/**
 * Read a CSS custom property as its raw trimmed string (for canvas-2D consumers
 * such as the minimap, which paint with CSS colour strings). Returns the fallback
 * when the value is absent. An optional pre-resolved declaration lets a caller
 * resolve `getComputedStyle` once per render pass and read many tokens from it.
 */
export function cssColorString(
  varName: string,
  fallback: string,
  root?: CSSStyleDeclaration,
): string {
  const cssRoot = root ?? getComputedStyle(document.documentElement);
  return cssRoot.getPropertyValue(varName).trim() || fallback;
}
