// The shared language registry for both viewers (review-rail-viewers ADR P03.S15).
//
// Maps the engine's `language_hint` (and a markdown code-fence `language-*` info
// string) onto a Shiki grammar id plus its lazy `@shikijs/langs/*` dynamic import,
// so the code viewer and the markdown reader's fenced code share ONE tokenizer and
// ONE language vocabulary. Per the ADR the required set is py, rs, js, ts,
// jsx/tsx, bash, batch, powershell, c, c++, json, toml, yaml, md — plus a small
// long tail (css/html). Grammars load lazily (only what the operator opens), via
// per-language dynamic `import()` so the bundle stays proportional.
//
// An unknown/absent hint resolves to `null`: the viewer renders the text as plain
// (no grammar) rather than guessing — an honest degradation, not a broken render.

import type { LanguageRegistration } from "shiki/core";

/** A lazily-imported grammar module: the `@shikijs/langs/*` default export is the
 *  grammar registration array Shiki's `loadLanguage` accepts. */
type GrammarModule = { default: LanguageRegistration[] };

/** A resolved grammar: the Shiki language id and its lazy loader. */
export interface GrammarSpec {
  /** The Shiki grammar id (the registered language name). */
  id: string;
  /** The lazy `@shikijs/langs/*` import producing the grammar registration. */
  load: () => Promise<GrammarModule>;
}

// The grammar table. Each entry's `load` is a per-language dynamic import so a
// grammar ships only when first opened (the ADR's lazy-grammar requirement).
const GRAMMARS: Record<string, GrammarSpec> = {
  rust: { id: "rust", load: () => import("@shikijs/langs/rust") },
  python: { id: "python", load: () => import("@shikijs/langs/python") },
  javascript: { id: "javascript", load: () => import("@shikijs/langs/javascript") },
  typescript: { id: "typescript", load: () => import("@shikijs/langs/typescript") },
  jsx: { id: "jsx", load: () => import("@shikijs/langs/jsx") },
  tsx: { id: "tsx", load: () => import("@shikijs/langs/tsx") },
  bash: { id: "bash", load: () => import("@shikijs/langs/bash") },
  batch: { id: "batch", load: () => import("@shikijs/langs/bat") },
  powershell: { id: "powershell", load: () => import("@shikijs/langs/powershell") },
  c: { id: "c", load: () => import("@shikijs/langs/c") },
  cpp: { id: "cpp", load: () => import("@shikijs/langs/cpp") },
  json: { id: "json", load: () => import("@shikijs/langs/json") },
  toml: { id: "toml", load: () => import("@shikijs/langs/toml") },
  yaml: { id: "yaml", load: () => import("@shikijs/langs/yaml") },
  markdown: { id: "markdown", load: () => import("@shikijs/langs/markdown") },
  css: { id: "css", load: () => import("@shikijs/langs/css") },
  html: { id: "html", load: () => import("@shikijs/langs/html") },
};

/**
 * Aliases the markdown code-fence info string (or a stray client hint) may use,
 * normalized onto the canonical hint the engine's `language_hint` emits. The
 * engine already normalizes by extension, so these cover the fence `info` strings
 * authors type (```ts, ```sh, ```yml, …) and a few common spellings.
 */
const HINT_ALIASES: Record<string, string> = {
  rs: "rust",
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  bat: "batch",
  cmd: "batch",
  ps1: "powershell",
  pwsh: "powershell",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  yml: "yaml",
  md: "markdown",
  htm: "html",
};

/**
 * Resolve a `language_hint` (engine wire) or a code-fence info string to a
 * grammar spec, applying the alias normalization. Returns null for an
 * unknown/absent hint so the viewer renders plain text — the shared resolver both
 * viewers consume, so the code viewer and the markdown fences agree on the
 * grammar for any given hint.
 */
export function resolveGrammar(hint: string | null | undefined): GrammarSpec | null {
  if (!hint) return null;
  const normalized = hint.trim().toLowerCase();
  const canonical = HINT_ALIASES[normalized] ?? normalized;
  return GRAMMARS[canonical] ?? null;
}

/** The set of canonical grammar ids the viewers can highlight (for tests / docs). */
export function supportedLanguageIds(): string[] {
  return Object.keys(GRAMMARS);
}
