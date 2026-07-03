---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S06'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Extract the one shared literal matcher utility with the explicit bands (strong-literal 0.70 to 0.95 for exact or prefix, weak-literal 0.20 to 0.50 for substring), token matching over stem, path, title, and tags, with unit vectors, replacing the two near-duplicate scanners

## Scope

- `frontend/src/stores/server/literalMatch.ts`

## Description

- Authored `literalMatch.ts` — the ONE shared literal scorer with explicit ADR D2 bands.
- Exported `STRONG_LITERAL_BAND` (`{ min: 0.70, max: 0.95 }`) and `WEAK_LITERAL_BAND` (`{ min: 0.20, max: 0.50 }`) as named constants shared by the provider host and tests.
- Implemented `matchLiteral(query, fields)`: whitespace-tokenised AND semantics (every token must hit at least one field), returning exact = `STRONG_LITERAL_BAND.max` (0.95) on stem/title equality, prefix-interpolated score in `[STRONG_LITERAL_BAND.min, 0.94]` for stem/title/path prefix, position-scored weak score in `[WEAK_LITERAL_BAND.min, WEAK_LITERAL_BAND.max]` for substring, `WEAK_LITERAL_BAND.min` for cross-field multi-token matches, and `null` for no match or empty query.
- Implemented `rankLiteralMatches(query, items, getFields, cap)`: maps items through `matchLiteral`, filters nulls, sorts score-desc with stable tie-break (ascending stem then path), slices to cap.
- Authored `literalMatch.test.ts` with 41 unit vectors covering: exact > prefix > substring ordering; multi-token AND semantics; title and tags field coverage; case insensitivity; band boundary invariants (no match ≥ 0.95 for non-exact, no weak match reaching the strong band, no match < 0.20); determinism; `rankLiteralMatches` ordering, tie-break, cap, and filtering.
- Ran `npx prettier --write` on both files; `npx eslint` and `npx prettier --check` both clean; `npx tsc --noEmit` clean; 41/41 tests green.

## Outcome

`literalMatch.ts` and `literalMatch.test.ts` created. All gates pass: 41 unit tests green, `tsc --noEmit` clean, ESLint clean, Prettier clean. The two existing scanner functions (`matchDocumentEntries` in `documentSearchController.ts`, `buildFallbackResults` in `searchController.ts`) are left untouched pending P03/P04 consumer adoption as specified.

## Notes

The existing consumers (`documentSearchController.ts`, `searchController.ts`) are intentionally not modified in this step — the plan schedules their adoption in P03/P04. The scope here is the utility and its tests only.
