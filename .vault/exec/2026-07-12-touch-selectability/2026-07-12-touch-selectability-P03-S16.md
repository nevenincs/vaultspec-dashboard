---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Re-enable selection on plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows and ## Scope

- `frontend/src/app/right/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-enable selection on plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows

## Scope

- `frontend/src/app/right/`

## Description

- Add `select-text` to the changed-file label span in `ChangesOverview.tsx`.
- Add `select-text` to the step-id and heading spans in `PlanStepTree.tsx`'s `StepRow`.
- Add `select-text` to the open-plan title button in `StatusTab.tsx`'s `PlanPill`.

## Outcome

Plan pill titles, changed-file names, and plan-step headings in the latent right-rail rows now carry `select-text`; no menus exist on these rows so no guard routing was needed. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
