---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S08'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add a tolerant content adapter normalizing the wire shape, blob_hash content-addressing the cache entry and ## Scope

- `frontend/src/stores/server/liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a tolerant content adapter normalizing the wire shape, blob_hash content-addressing the cache entry

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add the `ContentResponse` and `ContentTruncated` wire types and the `content(id, scope?)` client method, encoding the node id with `encodeURIComponent` so a code-path id's slashes stay one segment.
- Add the tolerant `adaptContent` adapter normalizing the wire shape, defaulting every field to a safe empty so a sparse or older shape never throws, with the `blob_hash` content-addressing the cache entry.

## Outcome

The adapter normalizes the live and mock shapes into one internal `ContentResponse` the viewers consume. Adapter tests stay green.

## Notes

None.
