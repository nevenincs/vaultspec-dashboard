// @vitest-environment happy-dom
//
// Theme-binding tests for the shared highlighter (review-rail-viewers P07.S34):
// code highlighting across light, dark, and high-contrast themes. The ADR's
// theming law is that light/dark/HC are THREE TOKEN MAPS of ONE theme object, with
// no per-surface or per-theme syntax stylesheet. We prove that property two ways:
//
// 1. The token-bound Shiki theme tokenizes to spans whose foregrounds are
//    `var(--color-*)` references — the SAME markup under every theme (one theme
//    object, no per-theme re-tokenization), so a theme switch only changes what
//    those `var()` values resolve to.
// 2. The three `[data-theme]` blocks in styles.css define DIFFERENT values for the
//    syntax-bound tokens, so the identical highlighted markup renders distinct
//    colors per theme — correct contrast by construction, the third theme being
//    just another token remap.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { VAULTSPEC_SHIKI_THEME, VAULTSPEC_SHIKI_THEME_NAME } from "./highlighterTheme";

// Vitest runs with the frontend dir as cwd; styles.css is the token source the
// three [data-theme] blocks remap.
const STYLES = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** The value assigned to a `--color-*` token inside one `[data-theme="X"]` block
 *  (or `:root` for the base), for a coarse cross-theme differs assertion. */
function tokenValueInTheme(
  css: string,
  theme: string | null,
  token: string,
): string | null {
  const block = theme
    ? new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n {2}\\}`, "m").exec(
        css,
      )
    : /:root\s*\{([\s\S]*?)\n {2}\}/m.exec(css);
  if (!block) return null;
  const m = new RegExp(`--color-${token}:\\s*([^;]+);`).exec(block[1]);
  return m ? m[1].trim() : null;
}

describe("token-bound Shiki theme (review-rail-viewers)", () => {
  it("binds every token foreground to a var(--color-*) reference, not a hardcoded hex", () => {
    const settings = VAULTSPEC_SHIKI_THEME.settings ?? [];
    expect(settings.length).toBeGreaterThan(1);
    for (const s of settings) {
      const fg = s.settings?.foreground;
      if (fg) expect(fg.startsWith("var(--color-")).toBe(true);
    }
    // The top-level fg/bg also reference tokens (no hardcoded surface color).
    expect(VAULTSPEC_SHIKI_THEME.fg?.startsWith("var(--color-")).toBe(true);
    expect(VAULTSPEC_SHIKI_THEME.bg?.startsWith("var(--color-")).toBe(true);
  });

  it("tokenizes to spans carrying the token-bound foregrounds (one markup, all themes)", async () => {
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
    const ts = (await import("@shikijs/langs/typescript")).default;
    const hl = await createHighlighterCore({
      themes: [VAULTSPEC_SHIKI_THEME],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    });
    const html = hl.codeToHtml("const x: number = 1;", {
      lang: "typescript",
      theme: VAULTSPEC_SHIKI_THEME_NAME,
    });
    // The emitted spans reference the token tier — the same markup regardless of
    // the active [data-theme], so a theme switch repaints with no re-tokenization.
    expect(html).toContain("var(--color-");
    hl.dispose?.();
  });

  it("defines distinct syntax-token values across light, dark, and high-contrast", () => {
    // The tokens the highlighter binds (ink, accent-text) are remapped per theme,
    // so the identical highlighted markup renders distinct colors under each — the
    // three token maps the ADR requires, with high-contrast just another remap.
    for (const token of ["ink", "accent-text"]) {
      const light = tokenValueInTheme(STYLES, "light", token);
      const dark = tokenValueInTheme(STYLES, "dark", token);
      const hc = tokenValueInTheme(STYLES, "high-contrast", token);
      expect(light, `light --color-${token}`).toBeTruthy();
      expect(dark, `dark --color-${token}`).toBeTruthy();
      expect(hc, `high-contrast --color-${token}`).toBeTruthy();
      // Dark differs from light, and high-contrast differs from dark — three maps.
      expect(dark).not.toBe(light);
      expect(hc).not.toBe(dark);
    }
  });
});
