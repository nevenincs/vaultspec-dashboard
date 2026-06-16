// The one shared Shiki highlighter (review-rail-viewers ADR P03.S13).
//
// A singleton `createHighlighterCore` (fine-grained `shiki/core` + the JavaScript
// regex engine — no Oniguruma WASM, clean Vite build, SSR-safe) owned by this
// module, with PER-LANGUAGE and PER-THEME lazy registration: a grammar is loaded
// (via its dynamic `@shikijs/langs/*` import) only the first time the operator
// opens that language, so the bundle stays proportional to what is opened. The
// SAME hook serves the code viewer AND the markdown reader's fenced code, so both
// surfaces share one tokenizer (the ADR's one-highlighter requirement).
//
// Tokenization runs to HAST (`codeToHast`) for React rendering; the consumer
// converts the HAST to React elements. The theme is the single token-bound theme
// (highlighterTheme.ts), so a theme switch repaints with no re-tokenization —
// the `var(--color-*)` foregrounds resolve against the active [data-theme].

import { useEffect, useState } from "react";
import type { Root } from "hast";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import { resolveGrammar } from "./languages";
import { VAULTSPEC_SHIKI_THEME, VAULTSPEC_SHIKI_THEME_NAME } from "./highlighterTheme";

// The single highlighter instance, created lazily on first use and reused across
// every viewer mount for the session. A module-level promise dedupes concurrent
// first-creation (two viewers mounting at once share the one creation).
let highlighterPromise: Promise<HighlighterCore> | null = null;

// In-flight per-language load promises, so concurrent requests for the same
// grammar share ONE dynamic import + registration rather than racing.
const langLoads = new Map<string, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    // The single token-bound theme; languages load lazily below.
    themes: [VAULTSPEC_SHIKI_THEME],
    langs: [],
    // The JavaScript regex engine: no Oniguruma WASM asset (clean Vite build,
    // SSR-safe), per the ADR's engine choice.
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

/**
 * Ensure a grammar is registered on the singleton, loading it lazily on first
 * use. Returns the resolved Shiki language id, or null when the hint maps to no
 * supported grammar (the caller then renders plain text). Concurrent loads of the
 * same grammar share one import + registration.
 */
async function ensureLanguage(
  highlighter: HighlighterCore,
  hint: string | null | undefined,
): Promise<string | null> {
  const spec = resolveGrammar(hint);
  if (!spec) return null;
  if (!highlighter.getLoadedLanguages().includes(spec.id)) {
    let load = langLoads.get(spec.id);
    if (!load) {
      load = spec.load().then((mod) => highlighter.loadLanguage(mod.default));
      langLoads.set(spec.id, load);
    }
    await load;
  }
  return spec.id;
}

/** The state a `useHighlightedHast` consumer renders. */
export interface HighlightResult {
  /** The tokenized HAST tree, or null while loading / when no grammar applies. */
  hast: Root | null;
  /** Highlighting is in flight (the highlighter or a grammar is loading). */
  loading: boolean;
  /** The resolved grammar id, or null when the text renders as plain. */
  languageId: string | null;
}

/**
 * Tokenize `code` to HAST through the shared singleton highlighter, loading the
 * grammar for `languageHint` lazily. Returns the HAST tree the consumer renders
 * to React; while the highlighter or grammar loads, `loading` is true and `hast`
 * is null (the consumer shows the plain text until tokenization lands). An
 * unknown/absent hint yields `languageId: null` and a plain-text HAST (no grammar,
 * never a throw) — the honest plain-render degradation.
 *
 * This is the ONE tokenizer seam: the code viewer calls it for a whole file, the
 * markdown reader calls it per fenced block, so both share grammar state and the
 * one theme.
 */
export function useHighlightedHast(
  code: string,
  languageHint: string | null | undefined,
): HighlightResult {
  const [result, setResult] = useState<HighlightResult>({
    hast: null,
    loading: true,
    languageId: null,
  });

  useEffect(() => {
    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));
    void (async () => {
      try {
        const highlighter = await getHighlighter();
        const languageId = await ensureLanguage(highlighter, languageHint);
        if (cancelled) return;
        const hast = await highlighter.codeToHast(code, {
          // A resolved grammar, or the plain "text" language for an unknown hint
          // (Shiki's built-in no-op grammar — a plain, un-tokenized render).
          lang: languageId ?? "text",
          theme: VAULTSPEC_SHIKI_THEME_NAME,
        });
        if (cancelled) return;
        setResult({ hast, loading: false, languageId });
      } catch {
        // Tokenization failed (a grammar that would not load): degrade to plain
        // text, never throw into the viewer. The consumer renders `code` raw.
        if (!cancelled) setResult({ hast: null, loading: false, languageId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, languageHint]);

  return result;
}

/** The per-line tokenization the code viewer renders: each line is an array of
 *  styled tokens, so the viewer can window the line list (render only the visible
 *  range) with a line-number gutter — the same tokenizer the reader fences use. */
export type TokenLine = ThemedToken[];

/** The state a `useTokenLines` consumer renders. */
export interface TokenLinesResult {
  /** Tokens per line, or null while loading / on failure (render plain lines). */
  lines: TokenLine[] | null;
  /** Tokenization is in flight. */
  loading: boolean;
  /** The resolved grammar id, or null when the text renders as plain. */
  languageId: string | null;
}

/**
 * Tokenize `code` into per-line token arrays through the shared singleton
 * highlighter (the same instance + grammar registration the reader fences use),
 * for the code viewer's windowed, line-numbered render. While the highlighter or
 * grammar loads, `loading` is true and `lines` is null (the viewer shows plain
 * lines). An unknown hint or a tokenization failure yields `lines: null` so the
 * viewer renders plain text — never a throw.
 */
export function useTokenLines(
  code: string,
  languageHint: string | null | undefined,
): TokenLinesResult {
  const [result, setResult] = useState<TokenLinesResult>({
    lines: null,
    loading: true,
    languageId: null,
  });

  useEffect(() => {
    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));
    void (async () => {
      try {
        const highlighter = await getHighlighter();
        const languageId = await ensureLanguage(highlighter, languageHint);
        if (cancelled) return;
        const lines = await highlighter.codeToTokensBase(code, {
          lang: languageId ?? "text",
          theme: VAULTSPEC_SHIKI_THEME_NAME,
        });
        if (cancelled) return;
        setResult({ lines, loading: false, languageId });
      } catch {
        if (!cancelled) setResult({ lines: null, loading: false, languageId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, languageHint]);

  return result;
}

/** Test seam: reset the singleton + lazy-load caches between tests so each test
 *  starts from a cold highlighter. Not used in app code. */
export function __resetHighlighterForTests(): void {
  highlighterPromise = null;
  langLoads.clear();
}
