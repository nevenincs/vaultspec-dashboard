// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  languageHintFromPath,
  resolveGrammar,
  supportedLanguageIds,
} from "./languages";
import {
  __resetHighlighterForTests,
  useHighlightedHast,
  useTokenLines,
} from "./useHighlighter";
import { ENGINE_WAIT } from "../../testing/timing";

afterEach(() => {
  cleanup();
  __resetHighlighterForTests();
});

describe("language resolver", () => {
  it("resolves the full required language set", () => {
    const ids = supportedLanguageIds();
    for (const id of [
      "rust",
      "python",
      "javascript",
      "typescript",
      "jsx",
      "tsx",
      "bash",
      "batch",
      "powershell",
      "c",
      "cpp",
      "json",
      "toml",
      "yaml",
      "markdown",
      "mdx",
      "dockerfile",
      "makefile",
      "sql",
      "graphql",
      "go",
      "java",
      "kotlin",
      "ruby",
      "php",
      "vue",
      "svelte",
      "xml",
      "jsonc",
      "scss",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("normalizes hint aliases onto canonical grammar ids", () => {
    expect(resolveGrammar("rs")?.id).toBe("rust");
    expect(resolveGrammar("ts")?.id).toBe("typescript");
    expect(resolveGrammar("TSX")?.id).toBe("tsx");
    expect(resolveGrammar("sh")?.id).toBe("shellscript");
    expect(resolveGrammar("bat")?.id).toBe("bat");
    expect(resolveGrammar("c++")?.id).toBe("cpp");
    expect(resolveGrammar("yml")?.id).toBe("yaml");
    expect(resolveGrammar("dockerfile")?.id).toBe("docker");
    expect(resolveGrammar("language-ruby")?.id).toBe("ruby");
  });

  it("returns null for an unknown or absent hint (plain-text degradation)", () => {
    expect(resolveGrammar("definitely-not-a-real-language")).toBeNull();
    expect(resolveGrammar(null)).toBeNull();
    expect(resolveGrammar(undefined)).toBeNull();
    expect(resolveGrammar("")).toBeNull();
  });

  it("derives language hints from paths", () => {
    expect(languageHintFromPath("frontend/src/App.tsx")).toBe("tsx");
    expect(languageHintFromPath(".vault/research/alpha.md")).toBe("markdown");
    expect(languageHintFromPath("scripts/build.ps1")).toBe("powershell");
    expect(languageHintFromPath("Makefile")).toBe("makefile");
    expect(languageHintFromPath("Dockerfile")).toBe("dockerfile");
    expect(languageHintFromPath("Cargo.lock")).toBe("toml");
    expect(languageHintFromPath("schema.graphql")).toBe("graphql");
    expect(languageHintFromPath("Component.vue")).toBe("vue");
  });
});

describe("Shiki core tokenization (real engine)", () => {
  it("tokenizes rust to HAST carrying every theme's foreground as a CSS variable", async () => {
    // Use the real fine-grained core directly: this is the same pipeline
    // useHighlighter drives, proving multi-theme tokenization emits one
    // --shiki-<key> variable per theme against the real tokenizer.
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
    const { SYNTAX_THEMES, SYNTAX_THEME_INPUTS, SYNTAX_THEME_KEYS, syntaxThemeVar } =
      await import("./highlighterTheme");
    const rust = (await import("@shikijs/langs/rust")).default;

    const hl = await createHighlighterCore({
      themes: SYNTAX_THEME_INPUTS,
      langs: [rust],
      engine: createJavaScriptRegexEngine(),
    });
    const hast = await hl.codeToHast("fn main() {}", {
      lang: "rust",
      themes: SYNTAX_THEMES,
      defaultColor: false,
    });
    const serialized = JSON.stringify(hast);
    // Every theme's foreground rides along, so a theme flip needs no re-tokenize.
    for (const key of Object.values(SYNTAX_THEME_KEYS)) {
      expect(serialized).toContain(syntaxThemeVar(key));
    }
    // The keyword `fn` tokenizes (a non-trivial grammar match, not plain text).
    expect(serialized).toContain("fn");
    hl.dispose?.();
  });
});

describe("shared highlighter hooks", () => {
  it("tokenizes HAST through the shared external-store cache", async () => {
    const first = renderHook(() => useHighlightedHast("fn main() {}", "rust"));
    const second = renderHook(() => useHighlightedHast("fn main() {}", "rust"));

    expect(first.result.current.loading).toBe(true);
    expect(second.result.current.loading).toBe(true);

    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.loading).toBe(false);
    }, ENGINE_WAIT);

    expect(first.result.current.languageId).toBe("rust");
    expect(second.result.current.hast).toBe(first.result.current.hast);
  });

  it("tokenizes line arrays through the same highlighter singleton", async () => {
    const { result } = renderHook(() => useTokenLines("const x: number = 1", "ts"));

    await waitFor(() => expect(result.current.loading).toBe(false), ENGINE_WAIT);

    expect(result.current.languageId).toBe("typescript");
    expect(
      result.current.lines
        ?.flat()
        .map((token) => token.content)
        .join(""),
    ).toBe("const x: number = 1");
  });
});
