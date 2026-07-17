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
// converts the HAST to React elements. Tokenization is MULTI-THEME
// (`defaultColor: false`): every token is resolved against all three GitHub themes
// at once and carries its colours as CSS variables (`htmlStyle`), so a theme switch
// repaints with no re-tokenization — `styles.css` maps the active [data-theme] to
// the matching variable. See highlighterTheme.ts for the binding.

import { useEffect, useSyncExternalStore } from "react";
import type { Root } from "hast";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import { resolveGrammar } from "./languages";
import { SYNTAX_THEMES, SYNTAX_THEME_INPUTS } from "./highlighterTheme";

// The single highlighter instance, created lazily on first use and reused across
// every viewer mount for the session. A module-level promise dedupes concurrent
// first-creation (two viewers mounting at once share the one creation).
let highlighterPromise: Promise<HighlighterCore> | null = null;

// In-flight per-language load promises, so concurrent requests for the same
// grammar share ONE dynamic import + registration rather than racing.
const langLoads = new Map<string, Promise<void>>();
const TOKENIZATION_CACHE_CAP = 48;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    // The three GitHub themes (light / dark / high-contrast), registered up front
    // because every tokenization resolves against all three at once; languages
    // still load lazily below.
    themes: SYNTAX_THEME_INPUTS,
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

const INITIAL_HIGHLIGHT_RESULT: HighlightResult = {
  hast: null,
  loading: true,
  languageId: null,
};

interface HighlightCacheEntry {
  result: HighlightResult;
  promise: Promise<void> | null;
}

const hastCache = new Map<string, HighlightCacheEntry>();
const highlighterListeners = new Set<() => void>();

function emitHighlighterChange(): void {
  for (const listener of highlighterListeners) listener();
}

function subscribeHighlighter(listener: () => void): () => void {
  highlighterListeners.add(listener);
  return () => {
    highlighterListeners.delete(listener);
  };
}

function tokenizationCacheKey(
  kind: "hast" | "lines",
  code: string,
  languageHint: string | null | undefined,
): string {
  return `${kind}\u0000${languageHint ?? ""}\u0000${code}`;
}

function capCache<T>(cache: Map<string, T>): void {
  while (cache.size > TOKENIZATION_CACHE_CAP) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}

function getHighlightSnapshot(key: string): HighlightResult {
  const entry = hastCache.get(key);
  if (!entry) return INITIAL_HIGHLIGHT_RESULT;
  return entry.result;
}

function ensureHighlightedHast(
  key: string,
  code: string,
  languageHint: string | null | undefined,
): void {
  const existing = hastCache.get(key);
  if (existing) {
    hastCache.delete(key);
    hastCache.set(key, existing);
    return;
  }

  const entry: HighlightCacheEntry = {
    result: INITIAL_HIGHLIGHT_RESULT,
    promise: null,
  };
  hastCache.set(key, entry);
  capCache(hastCache);
  entry.promise = (async () => {
    try {
      const highlighter = await getHighlighter();
      const languageId = await ensureLanguage(highlighter, languageHint);
      const hast = await highlighter.codeToHast(code, {
        // A resolved grammar, or the plain "text" language for an unknown hint
        // (Shiki's built-in no-op grammar: a plain, un-tokenized render).
        lang: languageId ?? "text",
        themes: SYNTAX_THEMES,
        // No baked foreground: emit every theme's colour as a CSS variable so the
        // active [data-theme] selects one without re-tokenizing.
        defaultColor: false,
      });
      entry.result = { hast, loading: false, languageId };
      entry.promise = null;
    } catch {
      // Tokenization failed (a grammar that would not load): degrade to plain
      // text, never throw into the viewer. The consumer renders `code` raw.
      entry.result = {
        hast: null,
        loading: false,
        languageId: null,
      };
      entry.promise = null;
    }
    emitHighlighterChange();
  })();
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
  const key = tokenizationCacheKey("hast", code, languageHint);

  useEffect(() => {
    ensureHighlightedHast(key, code, languageHint);
  }, [code, key, languageHint]);

  return useSyncExternalStore(
    subscribeHighlighter,
    () => getHighlightSnapshot(key),
    () => INITIAL_HIGHLIGHT_RESULT,
  );
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

const INITIAL_TOKEN_LINES_RESULT: TokenLinesResult = {
  lines: null,
  loading: true,
  languageId: null,
};

interface TokenLinesCacheEntry {
  result: TokenLinesResult;
  promise: Promise<void> | null;
}

const tokenLinesCache = new Map<string, TokenLinesCacheEntry>();

function getTokenLinesSnapshot(key: string): TokenLinesResult {
  const entry = tokenLinesCache.get(key);
  if (!entry) return INITIAL_TOKEN_LINES_RESULT;
  return entry.result;
}

function ensureTokenLines(
  key: string,
  code: string,
  languageHint: string | null | undefined,
): void {
  const existing = tokenLinesCache.get(key);
  if (existing) {
    tokenLinesCache.delete(key);
    tokenLinesCache.set(key, existing);
    return;
  }

  const entry: TokenLinesCacheEntry = {
    result: INITIAL_TOKEN_LINES_RESULT,
    promise: null,
  };
  tokenLinesCache.set(key, entry);
  capCache(tokenLinesCache);
  entry.promise = (async () => {
    try {
      const highlighter = await getHighlighter();
      const languageId = await ensureLanguage(highlighter, languageHint);
      // `codeToTokens` (not `codeToTokensBase`, which is single-theme only) is the
      // multi-theme seam: each token carries `htmlStyle` with one CSS variable per
      // registered theme, and no `color`.
      const { tokens: lines } = highlighter.codeToTokens(code, {
        lang: languageId ?? "text",
        themes: SYNTAX_THEMES,
        defaultColor: false,
      });
      entry.result = { lines, loading: false, languageId };
      entry.promise = null;
    } catch {
      entry.result = {
        lines: null,
        loading: false,
        languageId: null,
      };
      entry.promise = null;
    }
    emitHighlighterChange();
  })();
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
  const key = tokenizationCacheKey("lines", code, languageHint);

  useEffect(() => {
    ensureTokenLines(key, code, languageHint);
  }, [code, key, languageHint]);

  return useSyncExternalStore(
    subscribeHighlighter,
    () => getTokenLinesSnapshot(key),
    () => INITIAL_TOKEN_LINES_RESULT,
  );
}

/** Test seam: reset the singleton + lazy-load caches between tests so each test
 *  starts from a cold highlighter. Not used in app code. */
export function __resetHighlighterForTests(): void {
  highlighterPromise = null;
  langLoads.clear();
  hastCache.clear();
  tokenLinesCache.clear();
  emitHighlighterChange();
}
