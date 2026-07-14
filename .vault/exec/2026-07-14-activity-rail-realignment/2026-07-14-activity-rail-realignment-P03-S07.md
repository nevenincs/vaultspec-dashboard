---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S07'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Build the rail-footer FrameworkStatusCluster strip mirroring the bound frame - pinned outside the rail scroll, one FocusZone tab stop, chips dispatch the panel toggle descriptors and ## Scope

- `frontend/src/app/right/FrameworkStatusCluster.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the rail-footer FrameworkStatusCluster strip mirroring the bound frame - pinned outside the rail scroll, one FocusZone tab stop, chips dispatch the panel toggle descriptors

## Scope

- `frontend/src/app/right/FrameworkStatusCluster.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Build `FrameworkStatusCluster` mirroring the bound frame: pinned footer strip, four chips over `useFrameworkStatusView` tones/counts, one horizontal FocusZone tab stop, per-chip aria naming plane + health.
- Chips dispatch through the shared `controlPanelToggleAction` descriptors (`.run`), the same builders the palette composes - no bespoke handlers.
- Mount as a sibling below the scroll panel in the desktop ActivityRail; render test added.

## Outcome

Green (6 render tests). Executed by rail-chrome-coder; verified independently.

## Notes

Pinning required moving the rail scroll from the outer rail column onto the panel div (`shellLayout.ts` SHELL_ACTIVITY_* classes) - desktop-only constants, compact unaffected; one deliberate out-of-scope edit, flagged and accepted.
