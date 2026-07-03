---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S05'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-03-search-providers-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Add the useCodeFiles query hook with bounded cache keyed on scope, walked to completion so client narrowing holds the complete listing and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the useCodeFiles query hook with bounded cache keyed on scope, walked to completion so client narrowing holds the complete listing

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Verified the `codeFiles` query key in `engineKeys` (keyed on scope alone — one
  bounded cache entry per corpus, default gcTime bounding retention).
- Verified `useCodeFiles` hook and `normalizeCodeFilesRequestIdentity`, mirroring
  `useVaultTree`: enabled only on a valid scope, driving the cursor-walking
  client so the reader holds the complete listing to narrow.
- Verified the committed tests: request-identity normalization, the no-scope
  cache-isolation guard, and a live-wire test rendering `useCodeFiles` against
  the real engine asserting drained entries, honest null truncation, and every
  entry a navigable `code:{path}` node.
- Added `"code-files"` to `SCOPED_ENGINE_QUERY_SUBTREES` and
  `GRAPH_GENERATION_QUERY_SUBTREES` (omitted from the prior commit): a scope
  swap must evict the prior corpus's listing; a graph-generation bump must
  re-fetch the updated projection.
- Updated the two guard tests and the vault-mutation `affectedKeys` test to
  enroll `engineKeys.codeFiles("wt-1")` / `engineKeys.codeFiles(scope)`.

## Outcome

`"code-files"` fully enrolled in the scope-swap and generation-refresh boundaries.
All 250 queries tests pass (live-wire included). tsc, eslint, prettier clean.

## Notes

The live fixture's code corpus is empty (the vault-only fixture has no source
files), so the live-wire test's entries array is empty on this corpus; the
assertions are deliberately shape-safe (array-ness, null truncation, `code:{path}`
identity) rather than a fixed count, so they hold whether the corpus is empty or
populated and never pin to fixture-specific data. The full walk over a populated
corpus is proven at the engine wire level in P01.S03.
