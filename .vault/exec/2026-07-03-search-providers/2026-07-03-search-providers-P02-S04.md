---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S04'
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
     The S04 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Add the codeFiles cursor-walking client (bounded page loop mirroring vaultTree), the tolerant adaptCodeFiles adapter, and the typed CodeFileEntry wire shape and ## Scope

- `frontend/src/stores/server/engine.ts + liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the codeFiles cursor-walking client (bounded page loop mirroring vaultTree), the tolerant adaptCodeFiles adapter, and the typed CodeFileEntry wire shape

## Scope

- `frontend/src/stores/server/engine.ts + liveAdapters.ts`

## Description

- Discovered `CodeFileEntry`, `CodeFilesTruncation`, `CodeFilesResponse` types and
  `CODE_FILES_PAGE_SIZE`/`CODE_FILES_MAX_PAGES` constants in `engine.ts` were
  pre-committed by the code-graph feature (commit `aeed6a7ab3`). Verified the
  bounded cursor walk in `codeFiles()` mirrors `vaultTree` exactly.
- Discovered `adaptCodeFiles` and its helpers (`adaptCodeFileEntry`,
  `adaptCodeFilesTruncation`) pre-committed in `liveAdapters.ts`, using the shared
  `normalizeVaultTreeString` helper. Verified tolerant behavior: blank path drops
  the row; missing `node_id` reconstructs from `code:{path}`; negative
  `returned_files` clamps to 0 via `Math.max`; missing `reason` or non-finite
  count collapses `truncated` to null.
- Added unit vectors for `adaptCodeFiles` in `liveAdapters.test.ts`: four cases
  covering entry normalization and node-id fallback, absent optional field
  omission, truncation forwarding (including the floor/clamp behavior), and safe
  empty defaults on a missing or shapeless body.

## Outcome

Unit vectors green (93 tests, `npx vitest run src/stores/server/liveAdapters.test.ts`).
tsc, eslint, and prettier all clean on touched files.

## Notes

The pre-existing `adaptCodeFiles` uses `normalizeVaultTreeString` (vault-tree's
helper) rather than a dedicated normalizer — this is correct and keeps the
codebase DRY. The adapter fails closed to an honest empty listing rather than
casting a malformed body through, matching the pattern established for newer
routes.
