---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S14'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Extend the render and store tests for the prerequisite affordance and link re-add, and re-run the full frontend gate and vault check green and ## Scope

- `frontend/src/app/left/CreateDocDialog.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend the render and store tests for the prerequisite affordance and link re-add, and re-run the full frontend gate and vault check green

## Scope

- `frontend/src/app/left/CreateDocDialog.render.test.tsx`

## Description

- The prerequisite-affordance and link re-add regression tests landed with S11/S12 (live-engine: routing observable from a moved selection; remove-then-re-add over the fixture corpus).
- Re-run the panel's full suite set after the S13 sweep plus spot-check suites across swept surfaces; re-run tsc and the px scan.

## Outcome

45 panel tests (26 render + 4 compact + 15 store-derived) green; 86 spot-check tests across 13 swept-surface suites green; tsc exit 0; px scan clean. Gate state as recorded in S10 (lane-clean; aggregate blocked only by the foreign in-flight file).

## Notes

The S13 commit necessarily carried the concurrent lane's on-disk deletion of the retired rag console component (git records worktree truth); their replacement panel is still their in-flight work.
