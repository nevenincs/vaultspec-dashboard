// Shiki token theme bound to the OKLCH semantic token tier (review-rail-viewers
// ADR; themes-are-oklch-generated-from-a-token-tier,
// warmth-lives-in-tokens-not-decoration).
//
// The ADR's mandate: the highlighter binds Shiki tokens to our theme variables so
// light, dark, and high-contrast are THREE token maps with NO per-surface color.
// We realize that with a SINGLE Shiki theme whose token foregrounds are `var(...)`
// references to the existing `--color-*` semantic tier. Because the viewers render
// in the DOM (not the canvas), a `var()` chain resolves natively against the
// active `[data-theme]`, so one theme object renders correctly under every theme —
// switching theme repaints the highlighted code with no re-tokenization
// (the `var()` values just resolve differently). This is the "theme is data"
// property the ADR names, with zero per-language or per-surface stylesheet.
//
// The warmth guardrail (warmth-lives-in-tokens-not-decoration) forbids a new
// syntax-color accent: there is no bespoke rainbow palette. Syntax distinctions
// map onto the EXISTING warm low-chroma neutral ramp (ink / ink-muted / ink-faint)
// plus the single muted accent and the established state/tier hues — so code reads
// as the same warm instrument register as the rest of the chrome, legible by
// weight and restraint rather than by a saturated token rainbow.

import type { ThemeRegistrationRaw } from "shiki/core";

/** One token scope → semantic-tier foreground binding. */
interface TokenBinding {
  scope: string | string[];
  /** A `--color-*` token name (without the `var()` wrapper). */
  token: string;
}

/**
 * The scope→token map. Each TextMate scope binds to a semantic `--color-*`
 * token, so the rendered foreground is `var(--color-<token>)` and resolves under
 * the active theme. Restrained on purpose (warmth-lives-in-tokens): comments and
 * punctuation recede to the faint/muted ink, identifiers sit at the base ink,
 * keywords/types/strings/numbers lean on the single accent and the established
 * state hues — never a new saturated palette.
 */
const TOKEN_BINDINGS: TokenBinding[] = [
  // Comments and punctuation recede into the faint ink.
  { scope: ["comment", "punctuation.definition.comment"], token: "ink-faint" },
  {
    scope: [
      "punctuation",
      "meta.brace",
      "punctuation.separator",
      "punctuation.terminator",
    ],
    token: "ink-muted",
  },
  // Keywords, storage, and control flow carry the single muted accent.
  {
    scope: [
      "keyword",
      "storage",
      "storage.type",
      "storage.modifier",
      "keyword.control",
    ],
    token: "accent-text",
  },
  // Strings lean on the "complete" state hue (warm, established).
  {
    scope: ["string", "string.quoted", "constant.other.symbol"],
    token: "state-complete",
  },
  // Numbers / constants on the tier-temporal hue (established, low-chroma).
  {
    scope: ["constant.numeric", "constant.language", "constant.character"],
    token: "tier-temporal",
  },
  // Types / classes on the tier-structural hue.
  {
    scope: ["entity.name.type", "support.type", "support.class", "entity.name.class"],
    token: "tier-structural",
  },
  // Functions / methods on the accent (the call-site emphasis).
  {
    scope: ["entity.name.function", "support.function", "meta.function-call"],
    token: "accent",
  },
  // Variables / parameters / properties at the base ink.
  {
    scope: [
      "variable",
      "variable.parameter",
      "variable.other",
      "meta.definition.variable",
    ],
    token: "ink",
  },
  // Tags / attributes (markup, JSX) on the tier-declared hue.
  { scope: ["entity.name.tag", "entity.other.attribute-name"], token: "tier-declared" },
  // Markdown headings / emphasis lean on the accent text.
  { scope: ["markup.heading", "markup.bold", "markup.italic"], token: "accent-text" },
];

/**
 * The single Shiki theme, bound to the semantic token tier. The top-level `fg`/
 * `bg` reference the viewer's own surface tokens so untyped tokens fall back to
 * the readable base ink on the paper ground. Every scope foreground is a
 * `var(--color-*)` reference, so the one theme renders correctly under light,
 * dark, and high-contrast — the three token maps the ADR requires, with no
 * per-surface color.
 */
export const VAULTSPEC_SHIKI_THEME: ThemeRegistrationRaw = {
  name: "vaultspec-tokens",
  // `type` is advisory metadata only; the actual colors are theme-variable
  // references resolved at render against the active [data-theme].
  type: "dark",
  fg: "var(--color-ink)",
  bg: "var(--color-paper-sunken)",
  settings: [
    {
      settings: {
        foreground: "var(--color-ink)",
        background: "var(--color-paper-sunken)",
      },
    },
    ...TOKEN_BINDINGS.map((b) => ({
      scope: b.scope,
      settings: { foreground: `var(--color-${b.token})` },
    })),
  ],
};

/** The theme name Shiki registers it under (used by the highlighter hook). */
export const VAULTSPEC_SHIKI_THEME_NAME = "vaultspec-tokens";
