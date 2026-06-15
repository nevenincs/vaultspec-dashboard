---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-activity-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-14-dashboard-activity-rail-plan placeholders are machine-filled by
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
     The Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors and ## Scope

- `frontend/src/app/right/WorkTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render a designed degraded state in WorkTab gated on the stores tiers truth, never inferred from a bare transport error, per degradation-is-read-from-tiers-not-guessed-from-errors

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered a designed degraded state gated on the stores tiers truth (the structural tier the pillar's documents resolve through), never inferred from a bare transport error.

## Outcome

The degraded state derives from the served tiers block; a tiers-less transport fault does not render degraded.

## Notes

Conforms to degradation-is-read-from-tiers-not-guessed-from-errors; fresh error-envelope tiers win over a stale held-success block in the selector.
