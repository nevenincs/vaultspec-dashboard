---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S35'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace graph-representation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S35 and 2026-06-14-graph-representation-plan placeholders are machine-filled by
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
     The Unit-test the new commands, object constancy across a mode switch, and the echoed event and ## Scope

- `frontend/src/scene/sceneController.representation.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Unit-test the new commands, object constancy across a mode switch, and the echoed event

## Scope

- `frontend/src/scene/sceneController.representation.test.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

Added `sceneController.representation.test.ts`: commands distinct from layout-mode, overlay tracking, field forwarding, honest applied-mode event, node-identity constancy across a switch. 6 tests green.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
