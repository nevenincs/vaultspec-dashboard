---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S59'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S59 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Render the degraded-from-tiers state read pre-derived from the stores degradation layer and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render the degraded-from-tiers state read pre-derived from the stores degradation layer

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified the degraded-from-tiers badge reads `useSurfaceStates().timeline` for the reconnecting state (pre-derived from the stores degradation layer), never guessed from a transport error, rendering a quiet polite `role="status"` `aria-live="polite"` `data-timeline-degraded` badge that leaves the lane scaffold and any cached marks behind it.
- Confirmed the same pre-derived reconnecting truth drives the Playhead LIVE to RECONNECTING chip.

## Outcome

Degraded state is read pre-derived from the tiers-backed degradation matrix (RECONNECTING on stream loss), rendered as a non-error polite status badge over an intact scaffold. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run. This run confirmed the S59 render test (degradation override streamLost yields timeline reconnecting yields polite status badge, no alert, scaffold intact). Honors degradation-is-read-from-tiers-not-guessed-from-errors.
