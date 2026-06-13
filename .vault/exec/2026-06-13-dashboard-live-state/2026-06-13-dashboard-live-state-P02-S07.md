---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S07'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
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
     The Mount the graph-sync hook and push the held slice broken-link count from the Stage and ## Scope

- `frontend/src/app/stage/Stage.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mount the graph-sync hook and push the held slice broken-link count from the Stage

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Mounted `useGraphLiveSync(scope, timelineMode.kind === "live")` in the Stage alongside
  `useTimeTravel`, so LIVE mode is reactive and time-travel hands the scene to the
  driver.
- Added a Stage effect that pushes the broken-link count from the held merged slice (a
  pure reduction over edges with `state === "broken"`) into the live-connection slice,
  feeding the degradation matrix; it emits 0 when no slice is held, so a scope swap never
  leaves a stale count.

## Outcome

The assembled live + degradation plane is wired at the one orchestration point. The full
suite is green (336 tests), typecheck and lint clean.

## Notes

The graph stream is workspace-global (one delta clock, contract REDLINE-3), so
`streamConnected`/`lastSeq` are not scope-keyed; only `brokenLinkCount` is scope-derived
and it self-resets via the held-slice effect, honoring the wholesale-reset discipline
(findings 022/023) without an explicit slice reset in `setScope`.
