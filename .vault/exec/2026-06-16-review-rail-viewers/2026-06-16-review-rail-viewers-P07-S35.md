---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S35'
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
     The S35 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Verify the four-tab law holds and every Overview row cross-links to file, node, and viewer with no inlined content and ## Scope

- `frontend/src/app/right/ChangesOverview.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Verify the four-tab law holds and every Overview row cross-links to file, node, and viewer with no inlined content

## Scope

- `frontend/src/app/right/ChangesOverview.test.tsx`

## Description

- DEFERRED with Phase P06. This step verifies the right-rail Overview re-scope and its cross-link rows (four-tab law, Overview row cross-links, no inlined content) — the surface P06 builds.

## Outcome

Not executed. Phase P06 (right-rail overview re-scope + cross-link wiring) was superseded mid-execution: the right rail is being redefined as a simplified "Status overview" by a new ADR, to be implemented as a separate follow-up. This verification belongs to that superseded surface and is deferred to the follow-up that builds the revised rail.

## Notes

P06.S26-S32 and this P07.S35 verification are left unchecked pending the revised right-rail ADR. The delivered viewer surfaces (markdown reader, code viewer, content endpoint, shared highlighter, open-in-viewer intent) are complete and independently verified by P07.S33/S34 and the engine/stores tests; the open-in-viewer intent the rail's cross-links would have driven is built and tested.
