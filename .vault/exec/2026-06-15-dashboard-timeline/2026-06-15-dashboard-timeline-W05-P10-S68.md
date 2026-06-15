---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S68'
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
     The S68 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Wire the rebuilt Timeline into the AppShell layout and ## Scope

- `frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Wire the rebuilt Timeline into the AppShell layout

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Verify the AppShell bottom-region wiring of the rebuilt relational timeline.
- Confirm `Timeline` mounts with `onNodeClick={handleNodeClick}` and the
  `RangeSelect` + `Playhead` overlay, and `TimelineControls` docks at the top edge.
- Confirm the mark-click contract: `Timeline` invokes `onNodeClick(node, arcs)`
  with the visible-slice arcs, and `handleNodeClick(node, arcs, scene)` derives the
  bounded 1-hop ego pulse from them (scene defaults to `getScene().controller`).

## Outcome

Wiring is correct as-is (a concurrent integration agent had already landed it,
referencing the deferred S45 node-click wiring). No change needed: the layer law
holds (region reads stores hooks + emits shared-selection intent only, no fetch,
no raw `tiers`), and the `onNodeClick(node, arcs)` signature matches
`handleNodeClick`'s bounded-join derivation.

## Notes

S68 was pre-wired by the concurrent integration campaign; this step verified
rather than authored it. `tsc -b` is clean across the project with the wiring in
place.
