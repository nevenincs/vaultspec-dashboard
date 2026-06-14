---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-left-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-14-dashboard-left-rail-plan placeholders are machine-filled by
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
     The Refactor the left aside into the ordered hosted-slot stack separated by soft 1px rules and ## Scope

- `frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Refactor the left aside into the ordered hosted-slot stack separated by soft 1px rules

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Extract the rail content stack into a dedicated `LeftRail` composition component so the heavy composition lives in a left-rail-exclusive new file rather than in the peer-entangled `AppShell`.
- Compose the ordered hosted slots top to bottom: workspace switcher, then worktree switcher, then the browser region, each separated by a soft 1px `border-rule` rule.
- Reduce the `AppShell` left-rail body to a single `LeftRail` mount.

## Outcome

The rail renders as an ordered coarse-to-fine hosted-slot stack with soft 1px rules. The substantive composition is committed in `LeftRail`; the one-line `AppShell` host swap is implemented in-tree but its commit is DEFERRED.

## Notes

`AppShell` carries uncommitted activity-rail peer edits (`WorkTab`, the four-tab `RAIL_TABS`) plus the workspace-registry handoff host. To avoid absorbing peer work in a pathspec commit, the rail composition was moved into a new `LeftRail` file (committed) and `AppShell` only mounts it; the `AppShell` edit is deferred until the activity-rail and workspace-registry campaigns disentangle.
