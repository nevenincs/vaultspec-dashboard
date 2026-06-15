---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S39'
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
     The S39 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Un-bundle the hovered node's arcs as the bundling-legibility affordance and ## Scope

- `frontend/src/app/timeline/arcs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Un-bundle the hovered node's arcs as the bundling-legibility affordance

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add `incidentArcIds`, the pure set of arcs touching a node (src or dst) — the
  hovered node's incident arcs.
- Add `bundledWithHoverUnbundle`: when bundling is active and a node is hovered,
  resolve the hovered node's incident arcs RAW (full, un-bundled) and bundle the
  rest, drawing the raw incident arcs over the bundle so the hovered ego is always
  traceable through it; at rest (no hover) the result is exactly the bundled set.
- Wire the affordance into the timeline by reading the store `hoveredNodeId` and
  passing it to the bundling path, so hovering un-bundles the ego while the rest
  stay bundled.

## Outcome

A user can always trace one node's true lineage through a bundle by hovering it;
the affordance adds nothing at rest, preserving the clean bundled read.

## Notes

The combined raw-plus-bundled union is capped so the un-bundling can never exceed
the arc ceiling.
