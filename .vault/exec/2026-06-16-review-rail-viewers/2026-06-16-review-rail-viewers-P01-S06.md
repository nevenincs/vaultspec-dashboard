---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S06'
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
     The S06 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add engine tests for success, byte-cap truncation, traversal 400, and structural degradation and ## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add engine tests for success, byte-cap truncation, traversal 400, and structural degradation

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Add engine integration tests: a doc and a code file served with the full payload and tiers; byte-cap truncation with the honest truncated block; a path-traversal tiered 400; structural degradation on an unreadable path; an unknown-stem 404 and a non-content-node 400.
- Add unit tests for id-to-path resolution, the traversal guard, the language-hint mapping, and codepoint-safe truncation.

## Outcome

All twelve content tests pass. The route's success, bounding, traversal, and degradation contracts are proven; the engine fmt and clippy gate is clean.

## Notes

None.
