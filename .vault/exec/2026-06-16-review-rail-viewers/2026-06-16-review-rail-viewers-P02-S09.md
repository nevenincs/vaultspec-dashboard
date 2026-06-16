---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S09'
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
     The S09 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Mirror the live /nodes/{id}/content shape exactly in the mock engine and feed a captured live sample through the adapter in a fidelity test and ## Scope

- `frontend/src/stores/server/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mirror the live /nodes/{id}/content shape exactly in the mock engine and feed a captured live sample through the adapter in a fidelity test

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Add the content route to the mock engine, serving the exact live field set flat-with-tiers, with the same extension-to-language-hint mapping the engine uses and the same id-resolution and error splits (malformed/non-content 400, unknown stem 404, structural degradation on an unreadable worktree).
- Add a mock-fidelity test feeding a captured mock sample through the real `adaptContent` adapter and asserting the field set, the doc/code resolution, the structural degradation, and the 404/400 splits.

## Outcome

The mock mirrors the live shape and the adapter is exercised against it; 22 mock-engine tests pass, including the three new content tests.

## Notes

None.
