---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
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
     The Extend deriveInputs to read injected live signals for streamLost and brokenLinkCount, keeping it pure and ## Scope

- `frontend/src/app/degradation/matrix.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend deriveInputs to read injected live signals for streamLost and brokenLinkCount, keeping it pure

## Scope

- `frontend/src/app/degradation/matrix.ts`

## Description

- Extended `deriveInputs` to take an optional `LiveSignals` argument
  (`streamConnected`, `brokenLinkCount`) and replaced the two hardwired literals:
  `streamLost` now derives from `streamConnected === false` (an explicit disconnect, not
  the initial null), and `brokenLinkCount` passes the injected count through.
- Kept the function pure - the signals are parameters, so the matrix stays fully
  testable and the `app/degradation` layer owns the surface mapping (ADR D4).

## Outcome

The two dead degradation rows (GUI finding 036) now derive from real state. 3 new tests
cover the streamLost null/true/false rule, the brokenLinkCount passthrough, and the
end-to-end `broken-highlighted` stage state; the existing 9 matrix tests stay green
(backward-compatible default-empty signals).

## Notes

The default `live = {}` preserves every existing caller's behavior (streamLost false,
brokenLinkCount 0) until the surface-states hook injects the real signals. No scaffolds
left.
