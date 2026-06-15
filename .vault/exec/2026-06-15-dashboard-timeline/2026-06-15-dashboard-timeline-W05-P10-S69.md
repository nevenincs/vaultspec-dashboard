---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S69'
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
     The S69 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add render and integration tests for the Timeline mounted in the AppShell and ## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add render and integration tests for the Timeline mounted in the AppShell

## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx`

## Description

- Add render/integration tests mounting the AppShell timeline composition
  (`TimelineControls` + `Timeline` with `onNodeClick={handleNodeClick}` +
  `RangeSelect`/`Playhead` overlay) through the real stores client transport
  (mockEngine over the live `/graph/lineage` wire shape).
- Assert the control bar renders, the six-lane scaffold draws, and the dated marks
  resolve.
- Assert a mark click flows into the ONE shared `Selection` (`kind: node`,
  `doc:` id) plus a BOUNDED stage ego pulse (captured via a double scene).

## Outcome

Two integration tests under the "Timeline mounted in the AppShell composition
(S69)" describe in `Timeline.render.test.tsx` cover render-together and the
mark-click selection + bounded pulse. Suite green: 12 files / 129 tests pass.

## Notes

The composition tests route the pulse to a capturing `SceneController` double so
the bounded `node_ids` cross-highlight is observed deterministically without a
mounted Pixi renderer.
