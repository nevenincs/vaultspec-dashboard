---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
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
     The Compose the live-connection slice into the surface-states hook and ## Scope

- `frontend/src/app/degradation/useDegradation.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Compose the live-connection slice into the surface-states hook

## Scope

- `frontend/src/app/degradation/useDegradation.ts`

## Description

- Composed the live-connection slice into `useSurfaceStates`: it reads `streamConnected`
  and `brokenLinkCount` from the stores-owned slice and passes them as the live signals
  to `deriveInputs`, so the stream-lost and broken-link rows derive from real state.
- Left the dev-override `resolve` in place, so the degradation debug switch still forces
  any condition over the real signals.

## Outcome

The mechanism/vocabulary loop is closed: the stores hold the live signals, the
`app/degradation` hook reads them through a stores hook and maps to surfaces. Existing
degradation tests stay green; the live surfaces now move with real connection state.

## Notes

`app/degradation` reading `useLiveStatusStore` is app -> stores through a stores hook,
which `dashboard-layer-ownership` permits (chrome reads state only via stores hooks). No
upward import.
