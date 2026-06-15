---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S28'
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
     The S28 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the scroll-strip scale and offset model (pixels-per-time, LIVE-docked-right, scroll-left-walks-back) as a pure helper and ## Scope

- `frontend/src/app/timeline/scrollStrip.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the scroll-strip scale and offset model (pixels-per-time, LIVE-docked-right, scroll-left-walks-back) as a pure helper

## Scope

- `frontend/src/app/timeline/scrollStrip.ts`

## Description

- Add the scroll-strip model as a pure, deterministic helper module: a `pxPerMs` pixels-per-time scale and a `scrollOffset` (CSS px from a fixed strip origin) define the time-to-x mapping.
- Provide `timeToStripX`/`stripXToTime` (scroll-independent strip coordinates) and `timeToX`/`xToTime` (viewport coordinates, subtracting the scroll offset), each an exact inverse.
- Add `liveEdgeOffset(nowMs, viewportWidth, pxPerMs, originMs)` so LIVE docks at the RIGHT viewport edge and a smaller offset scrolls left/back in time.
- Add `zoomAt` rescaling `pxPerMs` by a factor while pinning the instant under the cursor x (the scroll-model analogue of `zoomWindow`), and `clampPxPerMs` with `MIN_PX_PER_MS`/`MAX_PX_PER_MS` zoom-band clamps.
- Keep every helper free of `Date.now`/DOM: `now` is always passed in.

## Outcome

The scroll-strip scale and offset model is in place as pure functions W03.P06 positions marks and arcs against. LIVE-docked-right and scroll-left-walks-back are exact properties of `liveEdgeOffset` and the viewport mapping; zoom-anchor invariance holds at the clamped scale.

## Notes

A non-finite or non-positive scale collapses the strip, so `clampPxPerMs` falls back to the safe `MIN_PX_PER_MS` floor (including `Infinity`) rather than the max ceiling.
