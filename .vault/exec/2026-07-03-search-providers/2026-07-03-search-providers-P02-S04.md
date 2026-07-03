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

- Add the `CodeFileEntry`, `CodeFilesTruncation`, and `CodeFilesResponse` wire
  types in `engine.ts` beside the vault-tree types, plus the
  `CODE_FILES_PAGE_SIZE` (2000) / `CODE_FILES_MAX_PAGES` (25) walk bounds.
- Add the `codeFiles` client method mirroring `vaultTree`: a bounded page loop
  that walks the cursor to completion, accumulating entries and carrying the
  generation-stable `truncated` block through to the adapter.
- Add the tolerant `adaptCodeFiles` adapter in `liveAdapters.ts`: normalize each
  row (drop a pathless row, reconstruct a missing `node_id` from the path,
  optional `title`/`lang`), fail-closed to an empty listing on an unrecognized
  shape while preserving any tiers block, and pass the `truncated` block through
  only when it is a well-formed honesty record (null otherwise).

## Outcome

The files(code) provider's data source is in place: a complete client-held
code-file listing walked to completion over the real wire, tolerant to shape
variation. Full frontend gate green (`just dev lint frontend`: eslint, prettier,
tsc, lint:px, tokens, figma:names all clean).

## Notes

No mock path: unlike the older vault-tree adapter's pass-through, `adaptCodeFiles`
fails closed to an honest empty listing on an unrecognized shape rather than
casting a malformed body through — the route is new and has no internal-shape
mock to preserve, and an empty-listing degradation is safer than a typed lie.
