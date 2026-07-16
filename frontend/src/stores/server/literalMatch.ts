// The ONE shared literal matcher (search-providers ADR, D2 rank bands) — every
// SearchProvider that narrows by name passes through this module. Today that is
// files(vault) and files(code); the document-finder plane (P04) adopts it next.
//
// WHY BANDS: a literal name match must never masquerade as semantic certainty
// (scores near 1.0 signal "meaning match" to the provider host's merge), nor be
// buried under a mid-range rag score when the user types an exact filename. Bands
// make both invariants explicit and auditable in one place:
//
//   STRONG_LITERAL_BAND 0.70–0.95  — exact equality or prefix match on a primary
//                                     identity field (stem / title / path); the gap
//                                     above 0.70 lets a prefix beat a mid-range
//                                     semantic hit while exact tops the band at 0.95.
//   WEAK_LITERAL_BAND   0.20–0.50  — substring-only match; earlier position in the
//                                     field scores higher. A gap of 0.20 cleanly
//                                     separates the two literal tiers and keeps every
//                                     weak match below any strong-literal hit.
//
// A hit found by both meaning and name renders once at its best rank — dedupe by
// node identity is the provider host's responsibility; this module is pure scoring.
//
// Layer law: pure over its inputs, no fetch, no React, no raw `tiers` read.

import {
  compareRepositoryPaths,
  compareStableIdentifiers,
  repositoryPath,
  stableIdentifier,
} from "../../platform/localization/displayText";

// ── Band constants ─────────────────────────────────────────────────────────────

/**
 * Strong-literal band: exact stem/title equality or prefix match on a primary
 * identity field.
 *
 * `max` (0.95) is reserved for exact equality on `stem` or `title`.
 * Prefix matches interpolate in [min, max − 0.01] proportional to how much of
 * the matched field the query covers; a query that is 100 % of the field would
 * reach 0.94 — still strictly below the exact ceiling.
 */
export const STRONG_LITERAL_BAND = { min: 0.7, max: 0.95 } as const;

/**
 * Weak-literal band: substring-only matches (full normalised query appears
 * somewhere in a field, but neither as an exact value nor as a prefix).
 *
 * A match at position 0 scores `max` (0.50); a match late in a long field
 * approaches `min` (0.20). The band is always strictly below
 * `STRONG_LITERAL_BAND.min`; the 0.20-point gap keeps the two tiers cleanly
 * separated.
 */
export const WEAK_LITERAL_BAND = { min: 0.2, max: 0.5 } as const;

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Tolerant field bag passed to `matchLiteral`. Absent fields simply do not
 * contribute to matching — callers set only the fields the entry actually has.
 */
export interface LiteralMatchFields {
  /** Document or file stem (filename without directory or extension). */
  stem?: string;
  /** Full vault-relative or repo-relative path. */
  path?: string;
  /** Human-readable title (e.g., from vault frontmatter or file basename). */
  title?: string;
  /** Categorisation or feature tags. */
  tags?: readonly string[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Score a prefix match inside the strong band.
 * A longer query relative to the matched field (query covers more of it) scores
 * higher, approaching but never reaching `STRONG_LITERAL_BAND.max` (0.95).
 */
function prefixScore(queryLen: number, fieldLen: number): number {
  // 0.94 is the ceiling for prefix (exact equality owns 0.95).
  const PREFIX_CEIL = STRONG_LITERAL_BAND.max - 0.01;
  const ratio = queryLen / Math.max(1, fieldLen);
  return clamp(
    STRONG_LITERAL_BAND.min + ratio * (PREFIX_CEIL - STRONG_LITERAL_BAND.min),
    STRONG_LITERAL_BAND.min,
    PREFIX_CEIL,
  );
}

/**
 * Score a substring match inside the weak band.
 * A match at `index` 0 returns `WEAK_LITERAL_BAND.max` (0.50); a match near the
 * end of a field approaches `WEAK_LITERAL_BAND.min` (0.20).
 */
function weakScore(index: number, fieldLen: number): number {
  const ratio = index / Math.max(1, fieldLen);
  return clamp(
    WEAK_LITERAL_BAND.max - ratio * (WEAK_LITERAL_BAND.max - WEAK_LITERAL_BAND.min),
    WEAK_LITERAL_BAND.min,
    WEAK_LITERAL_BAND.max,
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Match `query` against `fields` and return a score in the ADR D2 bands,
 * or `null` if the query is empty or no match is found.
 *
 * Matching semantics:
 * - The query is whitespace-tokenised. EVERY token must appear (case-insensitive)
 *   in at least one field — AND across fields, OR across the tokens of each
 *   individual token test.
 * - Once the AND filter passes, the score is derived from the best single-field
 *   match of the FULL normalised query string:
 *     1. Exact equality on `stem` or `title` → `STRONG_LITERAL_BAND.max` (0.95).
 *     2. Full query is a strict prefix of `stem`, `title`, or `path` →
 *        interpolated in [`STRONG_LITERAL_BAND.min`, 0.94] proportional to
 *        how much of the matched field the query covers (shorter field = tighter
 *        coverage = higher score within the prefix tier).
 *     3. Full query appears as a substring in any field (earliest position wins)
 *        → `weakScore` in [`WEAK_LITERAL_BAND.min`, `WEAK_LITERAL_BAND.max`].
 *     4. Tokens matched across multiple fields but the full query does not appear
 *        as a substring in any one field → `WEAK_LITERAL_BAND.min` (0.20; the
 *        minimum positive signal, cross-field match confirmed but loose).
 * - Returns `null` for an empty or whitespace-only query.
 * - Deterministic: identical inputs always produce the same score.
 */
export function matchLiteral(query: string, fields: LiteralMatchFields): number | null {
  const qNorm = query.trim().toLowerCase();
  if (qNorm.length === 0) return null;

  const tokens = qNorm.split(/\s+/).filter(Boolean);

  const stemL = (fields.stem ?? "").toLowerCase();
  const pathL = (fields.path ?? "").toLowerCase();
  const titleL = (fields.title ?? "").toLowerCase();
  const tagsL = (fields.tags ?? []).map((t) => t.toLowerCase());

  // AND filter: every token must appear in at least one field.
  for (const token of tokens) {
    const hit =
      stemL.includes(token) ||
      pathL.includes(token) ||
      titleL.includes(token) ||
      tagsL.some((tag) => tag.includes(token));
    if (!hit) return null;
  }

  // ── Exact match ──────────────────────────────────────────────────────────
  // Full normalised query equals stem or title (primary identity fields).
  if (
    (stemL.length > 0 && stemL === qNorm) ||
    (titleL.length > 0 && titleL === qNorm)
  ) {
    return STRONG_LITERAL_BAND.max;
  }

  // ── Prefix match ─────────────────────────────────────────────────────────
  // Full query is a strict prefix (not equal) of stem, title, or path.
  const prefixCandidates: number[] = [];
  for (const f of [stemL, titleL, pathL]) {
    if (f.length > 0 && f !== qNorm && f.startsWith(qNorm)) {
      prefixCandidates.push(f.length);
    }
  }
  if (prefixCandidates.length > 0) {
    // Shortest matching field → query covers the most of it → highest score.
    const shortestLen = Math.min(...prefixCandidates);
    return prefixScore(qNorm.length, shortestLen);
  }

  // ── Substring match ───────────────────────────────────────────────────────
  // Full query appears as a substring in any field; earliest position wins.
  let bestIndex = Infinity;
  let bestFieldLen = 1;
  for (const f of [stemL, titleL, pathL, ...tagsL]) {
    if (f.length === 0) continue;
    const idx = f.indexOf(qNorm);
    if (idx >= 0 && idx < bestIndex) {
      bestIndex = idx;
      bestFieldLen = f.length;
    }
  }
  if (bestIndex !== Infinity) {
    return weakScore(bestIndex, bestFieldLen);
  }

  // ── Cross-field multi-token match ─────────────────────────────────────────
  // Tokens matched (AND filter passed) but the full query does not appear
  // verbatim in any single field. Real match; minimum weak signal.
  return WEAK_LITERAL_BAND.min;
}

/**
 * Score `items` with `matchLiteral`, filter non-matches, sort by score
 * descending with a stable tie-break (ascending stem then path), and return
 * the top `cap` entries paired with their scores.
 *
 * Pure: no fetch, no side effects, suitable for `useMemo` derivation.
 */
export function rankLiteralMatches<T>(
  query: string,
  items: readonly T[],
  getFields: (item: T) => LiteralMatchFields,
  cap: number,
): Array<{ item: T; score: number }> {
  type Scored = { item: T; score: number; fields: LiteralMatchFields };
  const scored: Scored[] = [];
  for (const item of items) {
    const fields = getFields(item);
    const score = matchLiteral(query, fields);
    if (score !== null) scored.push({ item, score, fields });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aStem = a.fields.stem ?? "";
    const bStem = b.fields.stem ?? "";
    const stemCmp = compareStableIdentifiers(
      stableIdentifier(aStem),
      stableIdentifier(bStem),
    );
    if (stemCmp !== 0) return stemCmp;
    const aPath = a.fields.path ?? "";
    const bPath = b.fields.path ?? "";
    return compareRepositoryPaths(repositoryPath(aPath), repositoryPath(bPath));
  });
  return scored.slice(0, Math.max(0, cap)).map(({ item, score }) => ({ item, score }));
}
