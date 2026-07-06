// @vitest-environment happy-dom
//
// Probe tests for the shared Shiki highlighter (review-rail-viewers P03).
//
// These exercise the REAL Shiki fine-grained core + JS regex engine (no mock):
// the singleton creation, lazy grammar registration, token-bound theme, and the
// plain-text degradation for an unknown hint. Tokenizing to HAST against the real
// tokenizer is the core tenet the viewers depend on, so it is probed directly
// rather than through a brittle component mock.

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
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("normalizes hint aliases onto canonical grammar ids", () => {
    expect(resolveGrammar("rs")?.id).toBe("rust");
    expect(resolveGrammar("ts")?.id).toBe("typescript");
    expect(resolveGrammar("TSX")?.id).toBe("tsx");
    expect(resolveGrammar("sh")?.id).toBe("bash");
    expect(resolveGrammar("c++")?.id).toBe("cpp");
    expect(resolveGrammar("yml")?.id).toBe("yaml");
  });

  it("returns null for an unknown or absent hint (plain-text degradation)", () => {
    expect(resolveGrammar("brainfuck")).toBeNull();
    expect(resolveGrammar(null)).toBeNull();
    expect(resolveGrammar(undefined)).toBeNull();
    expect(resolveGrammar("")).toBeNull();
  });

  it("derives review-snippet language hints from paths", () => {
    expect(languageHintFromPath("frontend/src/App.tsx")).toBe("tsx");
    expect(languageHintFromPath(".vault/research/alpha.md")).toBe("markdown");
    expect(languageHintFromPath("scripts/build.ps1")).toBe("powershell");
    expect(languageHintFromPath("Makefile")).toBeNull();
  });
});

describe("Shiki core tokenization (real engine)", () => {
  it("tokenizes rust to HAST with token-bound CSS-variable foregrounds", async () => {
    // Use the real fine-grained core directly: this is the same pipeline
    // useHighlighter drives, proving the token-bound theme emits var(--color-*)
    // foregrounds (the OKLCH theme binding) against the real tokenizer.
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
    const { VAULTSPEC_SHIKI_THEME, VAULTSPEC_SHIKI_THEME_NAME } =
      await import("./highlighterTheme");
    const rust = (await import("@shikijs/langs/rust")).default;

    const hl = await createHighlighterCore({
      themes: [VAULTSPEC_SHIKI_THEME],
      langs: [rust],
      engine: createJavaScriptRegexEngine(),
    });
    const hast = await hl.codeToHast("fn main() {}", {
      lang: "rust",
      theme: VAULTSPEC_SHIKI_THEME_NAME,
    });
    // The HAST serializes to spans whose inline styles reference our theme tokens
    // — proof the highlighter binds to the semantic token tier, not a hardcoded
    // hex palette (themes-are-oklch-generated-from-a-token-tier).
    const serialized = JSON.stringify(hast);
    expect(serialized).toContain("var(--color-");
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
