// Feature-filter query helpers (left-rail feature-filter campaign). The rail's
// canonical feature filter is `dashboardState.filters.feature_query`
// ({ value, mode }) — a real BACKEND filter the engine applies as a glob or regex
// over each node's `feature_tags` (engine-query `filter.rs`). These pure helpers
// translate between the bar's raw typed text and that wire shape, and provide the
// CLIENT-side matcher the rail tree narrows with so the rail agrees with the graph
// the same filter authors (dashboard-layer-ownership, filtering-has-one-canonical-
// surface).
//
// Syntax, in increasing power (search → glob → advanced):
//   • plain term          → substring glob  (`dash`  ⇒ value `*dash*`, mode glob)
//   • explicit glob        → as typed         (`dashboard-*` ⇒ mode glob, anchored)
//   • `/pattern/`          → regex            (`/sync$/` ⇒ value `sync$`, mode regex)
// The engine glob is anchored full-match with `*`/`?` wildcards; a plain term is
// wrapped `*term*` so it reads as the substring search a user expects. The literal
// the user typed is echoed by the field; the parsed `{value, mode}` is what we write.

import { normalizeSearchQuery } from "./searchQuery";
import {
  authoredDisplayText,
  compareAuthoredDisplayText,
} from "../platform/localization/displayText";

export type FeatureQueryMode = "glob" | "regex";

export interface FeatureQuery {
  value: string;
  mode: FeatureQueryMode;
}

/** Glob wildcard characters that promote a plain term to an explicit (anchored)
 *  glob rather than the implicit `*term*` substring wrap. */
const GLOB_WILDCARDS = /[*?]/;
/** A `/pattern/` wrapper marks an advanced regex query. */
const REGEX_WRAPPER = /^\/(.+)\/$/;

/** Translate one engine-grammar glob into a JS regex SOURCE (anchored full-match),
 *  mirroring the engine's `glob_to_regex`: `*` → `.*`, `?` → `.`, every other char
 *  escaped. Case-insensitivity is applied by the caller via the `i` flag. */
export function featureGlobToRegexSource(glob: string): string {
  let source = "^";
  for (const ch of glob) {
    if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return source + "$";
}

/** Compile a feature query to a case-insensitive `RegExp`, or `null` when the
 *  pattern is malformed (an in-progress regex). Glob patterns never fail. */
export function compileFeatureQuery(query: FeatureQuery): RegExp | null {
  const source =
    query.mode === "glob" ? featureGlobToRegexSource(query.value) : query.value;
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/** Parse the field's raw input into the canonical wire `feature_query`, or `null`
 *  to clear it. A `regex` pattern that will not compile returns `null` (we never
 *  write a malformed pattern — it would 400 the graph query); the field keeps the
 *  in-progress text locally until it parses. */
export function parseFeatureQueryInput(raw: unknown): FeatureQuery | null {
  const trimmed = normalizeSearchQuery(raw);
  if (!trimmed) return null;

  const regexMatch = REGEX_WRAPPER.exec(trimmed);
  if (regexMatch) {
    const value = regexMatch[1]!.trim();
    if (!value) return null;
    const query: FeatureQuery = { value, mode: "regex" };
    return compileFeatureQuery(query) ? query : null;
  }

  if (GLOB_WILDCARDS.test(trimmed)) return { value: trimmed, mode: "glob" };
  return { value: `*${trimmed}*`, mode: "glob" };
}

/** The literal the field should ECHO for a canonical feature query — the inverse of
 *  `parseFeatureQueryInput` for the common cases, so a re-seed from dashboard-state
 *  (scope swap, external write) shows what the user would have typed: the implicit
 *  `*term*` substring wrap is unwrapped to `term`, an explicit glob is shown as-is,
 *  and a regex is shown in its `/pattern/` form. */
export function featureQueryEchoText(query: FeatureQuery | null | undefined): string {
  if (!query || !query.value) return "";
  if (query.mode === "regex") return `/${query.value}/`;
  const substring = /^\*(.*)\*$/.exec(query.value);
  if (substring && !GLOB_WILDCARDS.test(substring[1]!)) return substring[1]!;
  return query.value;
}

/** A plain, lowercased substring for a non-feature consumer that can only narrow by
 *  text (the Files tree narrows paths). Strips the `/regex/` wrapper and glob
 *  wildcards down to the literal a path match can use. */
export function featureQueryPlainText(query: FeatureQuery | null | undefined): string {
  return featureQueryEchoText(query).replace(/[*?]/g, "").trim();
}

/** Does a feature query match a candidate set? The candidates are a node's RAW
 *  feature tags PLUS their sanitized display names, so the rail narrows by either
 *  the hyphenated tag (`dashboard-left-rail`) or the readable name
 *  (`Dashboard Left Rail`) — the dual-match the bar's autofill also uses. A query
 *  that will not compile matches everything (an in-progress pattern never blanks
 *  the tree). An empty/absent query is no constraint. */
export function featureQueryMatches(
  query: FeatureQuery | null | undefined,
  candidates: readonly string[],
): boolean {
  if (!query || !query.value) return true;
  const re = compileFeatureQuery(query);
  if (!re) return true;
  return candidates.some((candidate) => re.test(candidate));
}

/** The canonical readable name for a feature tag (the ONE sanitizer the rail rows,
 *  the autofill, and the feature-query narrow all share): drop a leading `#`,
 *  de-kebab/underscore, Title-Case each word. Presentation only — the identity
 *  stays the raw tag. `app/left/vaultRowPresentation.featureDisplayName` delegates
 *  here so "match the sanitized display strings" means one definition everywhere. */
export function featureTagDisplayName(tag: string): string {
  const cleaned = tag.replace(/^#/, "").replace(/[-_]+/g, " ").trim();
  if (cleaned.length === 0) return tag;
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export interface FeatureTagSuggestion {
  /** The raw, hyphenated feature tag — the value applied to the filter. */
  tag: string;
  /** The sanitized display name shown in the suggestion row. */
  display: string;
}

/** Default cap on the autofill list so a large corpus vocabulary cannot overflow
 *  the dropdown (bounded-by-default). */
export const FEATURE_TAG_SUGGESTION_LIMIT = 8;

/** The autofill suggestions for the field's raw input, matched against BOTH the
 *  sanitized display string and the original hyphenated tag (the user-requested
 *  dual-match), ordered tag-prefix → display-prefix → other, then alphabetically.
 *  An empty input lists the whole preloaded vocabulary (capped). Glob/regex input
 *  still narrows via the shared matcher. */
export function featureTagSuggestions(
  rawInput: unknown,
  featureTags: readonly string[],
  locale: string,
  limit: number = FEATURE_TAG_SUGGESTION_LIMIT,
): FeatureTagSuggestion[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const tag of featureTags) {
    const normalized = typeof tag === "string" ? tag.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  const input = normalizeSearchQuery(rawInput);
  const lower = input.toLowerCase();
  const query = input ? parseFeatureQueryInput(input) : null;

  const ranked = unique
    .map((tag) => {
      const display = featureTagDisplayName(tag);
      const tagLower = tag.toLowerCase();
      const displayLower = display.toLowerCase();
      let rank: number;
      if (!input) rank = 3;
      else if (tagLower.startsWith(lower) || displayLower.startsWith(lower)) rank = 0;
      else if (tagLower.includes(lower) || displayLower.includes(lower)) rank = 1;
      else if (query && featureQueryMatches(query, [tag, display])) rank = 2;
      else rank = -1;
      return { tag, display, rank };
    })
    .filter((row) => row.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        compareAuthoredDisplayText(
          locale,
          authoredDisplayText(a.display),
          authoredDisplayText(b.display),
        ),
    );

  return ranked
    .slice(0, Math.max(0, limit))
    .map(({ tag, display }) => ({ tag, display }));
}
