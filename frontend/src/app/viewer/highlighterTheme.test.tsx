// @vitest-environment happy-dom
//
// Theme-binding tests for the shared highlighter (editor-change-fidelity).
//
// The law: ONE tokenization serves all three themes. Shiki multi-theme mode
// resolves each token against github-light / github-dark / github-dark-high-contrast
// at once and emits each as a CSS variable on the span, so a [data-theme] flip is a
// CSS repaint and never a re-tokenization. We prove four properties:
//
// 1. Tokens carry a variable per theme and NO baked foreground (one markup, all
//    themes) — the property the old token-bound theme existed to protect, kept.
// 2. The variable keys emitted by Shiki have matching [data-theme] rules in
//    styles.css. This is a cross-file contract with no compiler behind it: rename
//    one side and every token silently loses its colour, so it is pinned here.
// 3. The three themes give the SAME token distinct colours — three real palettes.
// 4. The palette SEPARATES SCOPES. This is the regression guard: the retired theme
//    bound only ten scopes onto the warm neutral ramp, so keyword / function /
//    string / comment collapsed toward one ink and code read as near-monochrome.
//    A theme that cannot tell those four apart is the defect, restated.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SYNTAX_THEMES,
  SYNTAX_THEME_INPUTS,
  SYNTAX_THEME_KEYS,
  syntaxThemeVar,
} from "./highlighterTheme";

// Vitest runs with the frontend dir as cwd.
const STYLES = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const SAMPLE = 'const greet = (n: string) => join("hi", n); // note';

async function tokenizeSample() {
  const { createHighlighterCore } = await import("shiki/core");
  const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
  const hl = await createHighlighterCore({
    themes: SYNTAX_THEME_INPUTS,
    langs: [import("@shikijs/langs/typescript")],
    engine: createJavaScriptRegexEngine(),
  });
  const { tokens } = hl.codeToTokens(SAMPLE, {
    lang: "typescript",
    themes: SYNTAX_THEMES,
    defaultColor: false,
  });
  hl.dispose?.();
  return tokens[0];
}

/** The colour a token of `content` resolves to under one theme key. */
function colourOf(
  tokens: Awaited<ReturnType<typeof tokenizeSample>>,
  content: string,
  key: string,
): string | undefined {
  const token = tokens.find((t) => t.content.trim() === content);
  return token?.htmlStyle?.[`--shiki-${key}`];
}

describe("GitHub syntax themes (editor-change-fidelity)", () => {
  it("emits one CSS variable per theme and no baked foreground", async () => {
    const tokens = await tokenizeSample();
    expect(tokens.length).toBeGreaterThan(1);
    for (const token of tokens) {
      // No baked colour: the active theme is chosen in CSS, not at tokenize time.
      expect(token.color).toBeUndefined();
      for (const key of Object.values(SYNTAX_THEME_KEYS)) {
        expect(token.htmlStyle?.[syntaxThemeVar(key)], token.content).toMatch(
          /^#[0-9a-f]{3,8}$/i,
        );
      }
    }
  });

  it("has a [data-theme] rule in styles.css for every emitted variable", () => {
    // The cross-file contract: Shiki names the variable from the theme KEY, and
    // styles.css must select it under the matching [data-theme].
    for (const [theme, key] of Object.entries(SYNTAX_THEME_KEYS)) {
      const variable = syntaxThemeVar(key);
      expect(STYLES, `${variable} is emitted but unused`).toContain(variable);
      // Light is the unprefixed base rule; the other two are theme-scoped.
      const selector =
        theme === "light"
          ? "[data-highlight-token]"
          : `[data-theme="${theme}"] [data-highlight-token]`;
      const rule = new RegExp(
        `${selector.replace(/[[\]"]/g, "\\$&")}\\s*\\{\\s*color:\\s*var\\(${variable}\\)`,
      );
      expect(rule.test(STYLES), `no rule binding ${theme} to ${variable}`).toBe(true);
    }
  });

  it("renders the same token differently under each theme", async () => {
    const tokens = await tokenizeSample();
    const keys = Object.values(SYNTAX_THEME_KEYS);
    const perTheme = keys.map((key) => colourOf(tokens, "const", key));
    // Three real palettes, not one palette aliased three ways.
    expect(new Set(perTheme).size).toBe(keys.length);
  });

  it("carries Markdown emphasis as per-theme font variables, mapped in styles.css", async () => {
    // Multi-theme mode moves emphasis OFF `token.fontStyle` (which is undefined
    // here) and into per-theme variables. Nothing types that, so without this test
    // a renderer reading `token.fontStyle` silently drops every bold heading and
    // italic in the Markdown editor — which is how it broke during this migration.
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
    const hl = await createHighlighterCore({
      themes: SYNTAX_THEME_INPUTS,
      langs: [import("@shikijs/langs/markdown")],
      engine: createJavaScriptRegexEngine(),
    });
    const { tokens } = hl.codeToTokens("# Heading\n\n*em* and **bold**", {
      lang: "markdown",
      themes: SYNTAX_THEMES,
      defaultColor: false,
    });
    hl.dispose?.();
    const flat = tokens.flat();

    const heading = flat.find((t) => t.content.includes("Heading"));
    const em = flat.find((t) => t.content === "*em*");
    expect(
      heading?.fontStyle,
      "emphasis must not ride token.fontStyle",
    ).toBeUndefined();

    for (const key of Object.values(SYNTAX_THEME_KEYS)) {
      expect(heading?.htmlStyle?.[`--shiki-${key}-font-weight`]).toBe("bold");
      expect(em?.htmlStyle?.[`--shiki-${key}-font-style`]).toBe("italic");
      // …and styles.css must actually apply them, or the variable is inert.
      expect(STYLES).toContain(`var(--shiki-${key}-font-weight, inherit)`);
      expect(STYLES).toContain(`var(--shiki-${key}-font-style, inherit)`);
    }
  });

  it("separates keyword, function, string, and comment scopes", async () => {
    const tokens = await tokenizeSample();
    // The regression guard. Under the retired ten-binding theme these four
    // collapsed toward the same ink; a real grammar theme must distinguish them
    // in EVERY theme, including high-contrast.
    for (const key of Object.values(SYNTAX_THEME_KEYS)) {
      const scopes = {
        keyword: colourOf(tokens, "const", key),
        function: colourOf(tokens, "join", key),
        string: colourOf(tokens, '"hi"', key),
        comment: colourOf(tokens, "// note", key),
      };
      for (const [name, colour] of Object.entries(scopes)) {
        expect(colour, `${name} untokenized under ${key}`).toBeTruthy();
      }
      expect(
        new Set(Object.values(scopes)).size,
        `${key} collapses scopes: ${JSON.stringify(scopes)}`,
      ).toBe(4);
    }
  });
});
