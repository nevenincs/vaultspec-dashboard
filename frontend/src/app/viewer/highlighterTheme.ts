// The syntax themes: GitHub light / dark / high-contrast, bound to the app's three
// `[data-theme]` peers (editor-change-fidelity ADR; supersedes the token-bound
// single theme of the review-rail-viewers + syntax-highlighting ADRs).
//
// WHY REAL THEMES. The previous theme mapped ten TextMate scopes onto the warm
// neutral ramp, on the reading that a syntax palette was decoration and so bound by
// warmth-lives-in-tokens-not-decoration. That produced near-monochrome code: ten
// bindings cannot separate the ~hundreds of scopes a grammar emits, so keywords,
// calls, params, and types collapsed into one ink. Syntax colour is not decoration
// — it is the legibility instrument of a code surface, and the design-system rule
// resolves this conflict explicitly in its own precedence clause: "Contrast, diff
// legibility, density, and reactivity override warmth on any conflict." These are
// the same themes the operator reads code in on GitHub, so the palette is familiar
// rather than novel — the opposite of a bespoke accent.
//
// WHAT IS PRESERVED. The prior ADR's real architectural property was that ONE
// tokenization serves every theme, so a theme flip repaints with no re-tokenize.
// That property is KEPT, by a better mechanism: Shiki's multi-theme mode
// (`defaultColor: false`) resolves every token against all three themes at once and
// emits the colours as CSS variables (`--shiki-light` / `--shiki-dark` /
// `--shiki-hc`) on the token, instead of a baked foreground. `styles.css` maps the
// active `[data-theme]` to the matching variable, so a theme flip is a pure CSS
// repaint of already-tokenized text. Hence the token hexes below are DATA supplied
// by the upstream themes, never hand-authored colour (the no-raw-hex rule governs
// authored values; these are vendored theme data, like an icon path).
//
// The high-contrast peer is dark-based (`styles.css` [data-theme="high-contrast"]
// grounds at oklch(0.12 …)), so it binds github-dark-high-contrast — GitHub's own
// WCAG-hardened palette — rather than a light variant.

import type { ThemeRegistrationRaw } from "shiki/core";

/**
 * The app `[data-theme]` peer → Shiki theme key map. The KEY is what Shiki uses to
 * name the emitted CSS variable (`--shiki-<key>`), so these keys are a contract
 * shared with the `[data-theme]` rules in `styles.css`; changing one without the
 * other silently drops colour. Kept short because the key is repeated inline on
 * every token span.
 */
export const SYNTAX_THEME_KEYS = {
  light: "light",
  dark: "dark",
  "high-contrast": "hc",
} as const;

/** The Shiki theme key for each app theme (`light` | `dark` | `hc`). */
export type SyntaxThemeKey = (typeof SYNTAX_THEME_KEYS)[keyof typeof SYNTAX_THEME_KEYS];

/** The CSS custom property Shiki emits for a theme key. */
export function syntaxThemeVar(key: SyntaxThemeKey): string {
  return `--shiki-${key}`;
}

/**
 * The `themes` map passed to every tokenization call: Shiki resolves each token
 * against all three and emits one variable per key. This object is the single
 * source of the light/dark/high-contrast binding.
 */
export const SYNTAX_THEMES: Record<SyntaxThemeKey, string> = {
  light: "github-light",
  dark: "github-dark",
  hc: "github-dark-high-contrast",
};

/**
 * The theme registrations for `createHighlighterCore`, as dynamic imports so the
 * theme JSON is fetched with the highlighter chunk rather than the entry bundle
 * (matching the per-grammar lazy registration in `useHighlighter`).
 */
export const SYNTAX_THEME_INPUTS: Array<Promise<{ default: ThemeRegistrationRaw }>> = [
  import("@shikijs/themes/github-light") as Promise<{ default: ThemeRegistrationRaw }>,
  import("@shikijs/themes/github-dark") as Promise<{ default: ThemeRegistrationRaw }>,
  import("@shikijs/themes/github-dark-high-contrast") as Promise<{
    default: ThemeRegistrationRaw;
  }>,
];
