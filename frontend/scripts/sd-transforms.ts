/**
 * Token-to-CSS serialization helpers for the vaultspec-dashboard color framework
 * (plan W01.P02.S08). These reproduce the exact CSS the design-language ADR settled in
 * `src/styles.css`: primitives and the few diverging tokens as literal `oklch(...)`,
 * chrome surface tokens as `var()` aliases, and the scene-read subset as literal
 * `#rrggbb` (the HIGH-1 constraint — the canvas getComputedStyle readers parse only hex).
 *
 * No lossy OKLCH->sRGB conversion is performed: every value is serialized from what the
 * DTCG source already holds. The emitted form is driven by the VALUE shape (so it is
 * correct per theme mode, where override files carry no $extensions), while the CSS
 * custom-property NAME is stable metadata pinned on the base token definition.
 */

/** A DTCG color value: either an alias ref string `{a.b.c}` or a typed object. */
export type DtcgColorValue =
  | string
  | { colorSpace: string; components?: number[]; hex?: string; alpha?: number };

/** Serialize DTCG oklch components [L, C, H] to a CSS `oklch(L C H)` string. */
export function oklchToCss(components: number[]): string {
  const [l, c, h] = components;
  return `oklch(${l} ${c} ${h})`;
}

/** True when a raw $value is an alias reference like `{primitive.neutral.50}`. */
export function isAliasRef(value: DtcgColorValue): value is string {
  return typeof value === "string" && value.startsWith("{") && value.endsWith("}");
}

/** Extract the dotted token path from an alias ref string `{a.b.c}` -> `a.b.c`. */
export function aliasPath(ref: string): string {
  return ref.slice(1, -1);
}

/** Derive the CSS custom-property name for a token path when not pinned in metadata. */
export function defaultCssVar(path: string): string {
  return `--${path.replace(/\./g, "-")}`;
}

/**
 * Serialize a token's CSS value from its RAW (unresolved) $value.
 * - alias ref  -> `var(--target)` (target var resolved via `varForPath`).
 * - srgb + hex -> literal `#rrggbb`.
 * - oklch      -> literal `oklch(L C H)`.
 */
export function cssValue(
  raw: DtcgColorValue,
  varForPath: (path: string) => string,
): string {
  if (isAliasRef(raw)) {
    return `var(${varForPath(aliasPath(raw))})`;
  }
  if (typeof raw === "string") return raw;
  if (raw.colorSpace === "srgb" && raw.hex) return raw.hex;
  if (raw.colorSpace === "oklch" && raw.components) return oklchToCss(raw.components);
  if (raw.hex) return raw.hex;
  throw new Error(`unserializable color value: ${JSON.stringify(raw)}`);
}
