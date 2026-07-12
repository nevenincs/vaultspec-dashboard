---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace on-demand-cold-start with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Consume the progressive hook in Stage in place of the raw slice hook, unchanged scene contract and ## Scope

- `frontend/src/app/stage/Stage.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Consume the progressive hook in Stage in place of the raw slice hook, unchanged scene contract

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

Consume useProgressiveGraphSlice in `frontend/src/app/stage/Stage.tsx` in place of useGraphSlice; scene contract unchanged - the document swap rides the existing warm-start set-data path.

## Outcome

Availability derives refreshing during the fill, so the canvas shows the constellation + the non-blocking refresh banner instead of a blank skeleton.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
