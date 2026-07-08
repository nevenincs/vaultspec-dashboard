// The shared language registry for all highlighted viewer/editor surfaces.
//
// Maps the engine's `language_hint` (and a markdown code-fence `language-*` info
// string) onto Shiki's bundled grammar registry, so the code viewer, markdown
// fenced blocks, document editor overlay, and review snippets share ONE tokenizer
// and ONE language vocabulary. Grammars still load lazily through Shiki's dynamic
// import registry: this file imports metadata and import thunks, not every grammar.
//
// An unknown/absent hint resolves to `null`: the viewer renders the text as plain
// (no grammar) rather than guessing -- an honest degradation, not a broken render.

import type { LanguageRegistration } from "shiki/core";
import { bundledLanguages, bundledLanguagesInfo } from "shiki/langs";

/** A lazily-imported grammar module: the Shiki import thunk's default export is
 *  the grammar registration array Shiki's `loadLanguage` accepts. */
type GrammarModule = { default: LanguageRegistration[] };
type BundledLanguageId = keyof typeof bundledLanguages;

/** A resolved grammar: the Shiki language id and its lazy loader. */
export interface GrammarSpec {
  /** The Shiki grammar id (the registered language name). */
  id: string;
  /** The lazy Shiki import producing the grammar registration. */
  load: () => Promise<GrammarModule>;
}

const BUNDLED_LANGUAGE_KEYS = new Set(Object.keys(bundledLanguages));

const HINT_ALIASES: Record<string, string> = Object.fromEntries(
  bundledLanguagesInfo.flatMap((info) => [
    [info.id, info.id],
    ...(info.aliases ?? []).map((alias) => [alias, info.id]),
  ]),
);

const EXTENSION_HINTS: Record<string, string> = {
  rs: "rust",
  py: "python",
  pyi: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  bat: "batch",
  cmd: "batch",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  go: "go",
  rb: "ruby",
  php: "php",
  lua: "lua",
  pl: "perl",
  pm: "perl",
  r: "r",
  swift: "swift",
  zig: "zig",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  scala: "scala",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  jsonl: "jsonl",
  toml: "toml",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  dockerfile: "dockerfile",
  env: "dotenv",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "properties",
  csv: "csv",
  tsv: "tsv",
  diff: "diff",
  patch: "diff",
  hcl: "hcl",
  tf: "terraform",
  tfvars: "terraform",
  proto: "proto",
  protobuf: "proto",
  rsx: "rust",
};

const BASENAME_HINTS: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  justfile: "just",
  "cargo.lock": "toml",
  "uv.lock": "toml",
  "poetry.lock": "toml",
  gemfile: "ruby",
  rakefile: "ruby",
  jenkinsfile: "groovy",
  "cmakelists.txt": "cmake",
};

function normalizeHint(hint: string): string | null {
  const normalized = hint
    .trim()
    .toLowerCase()
    .replace(/^language-/, "")
    .split(/\s+/, 1)[0];
  if (!normalized) return null;
  return HINT_ALIASES[normalized] ?? normalized;
}

function bundledLoader(id: string): (() => Promise<GrammarModule>) | null {
  if (!BUNDLED_LANGUAGE_KEYS.has(id)) return null;
  return bundledLanguages[id as BundledLanguageId] as () => Promise<GrammarModule>;
}

/**
 * Resolve a `language_hint` (engine wire) or a code-fence info string to a
 * grammar spec, applying Shiki's alias normalization. Returns null for an
 * unknown/absent hint so the viewer renders plain text.
 */
export function resolveGrammar(hint: string | null | undefined): GrammarSpec | null {
  if (!hint) return null;
  const id = normalizeHint(hint);
  if (!id) return null;
  const load = bundledLoader(id);
  return load ? { id, load } : null;
}

/** Derive a highlighter hint from a served path or review-snippet label. */
export function languageHintFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.split(/[?#]/, 1)[0]?.trim().toLowerCase();
  if (!clean) return null;
  const leaf = clean.split(/[\\/]/).pop() ?? clean;
  const basenameHint = BASENAME_HINTS[leaf];
  if (basenameHint) return basenameHint;
  const dot = leaf.lastIndexOf(".");
  if (dot < 0 || dot === leaf.length - 1) return null;
  return EXTENSION_HINTS[leaf.slice(dot + 1)] ?? null;
}

/** A user-facing language display name for badges and fenced-code labels. */
export function languageDisplayName(hint: string | null | undefined): string {
  if (!hint) return "Text";
  const id = normalizeHint(hint) ?? hint.trim().toLowerCase();
  return bundledLanguagesInfo.find((info) => info.id === id)?.name ?? hint;
}

/** The set of grammar hint ids the viewers can highlight (for tests / docs). */
export function supportedLanguageIds(): string[] {
  return Object.keys(bundledLanguages);
}
