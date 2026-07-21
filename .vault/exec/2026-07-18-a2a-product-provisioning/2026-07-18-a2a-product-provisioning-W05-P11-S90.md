---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S90'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S90 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Add stable lifecycle status and job query identities to the shared engine key registry and ## Scope

- `frontend/src/stores/server/queries/internal.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add stable lifecycle status and job query identities to the shared engine key registry

## Scope

- `frontend/src/stores/server/queries/internal.ts`

## Description

- Added `a2aLifecycleStatus` and `a2aLifecycleJob` query identities to the shared engine key registry in `internal.ts`.
- The status key is stable/singular (the plane is machine-global — one A2A resident per machine); the job key folds its id.

## Outcome

A settled job invalidates exactly the status key so the panel re-reads the reconciled projection. Keys derive off `engineKeys.all` like every sibling, and are re-exported through the `queries` barrel. Gate green.

## Notes

None.
