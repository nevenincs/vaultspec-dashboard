---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S40'
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
     The S40 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add ego-highlight plus dim-the-rest on node hover and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add ego-highlight plus dim-the-rest on node hover

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Set the hovered node on mark hover and focus (and clear on leave/blur) through
  the store, so the ego-highlight is driven by the shared hovered-node view state.
- Compute the 1-hop ego set (`egoNodeIds`: the hovered node plus every node one arc
  away) and use it to keep the hovered node, its neighbors, and incident arcs at
  full treatment while the rest RECEDE to a dim alpha — never hidden.
- Apply the recede consistently to marks (button opacity) and arcs (path opacity
  scaled by the recede factor) so the whole surface dims around the lifted ego.

## Outcome

Hovering a mark lifts its 1-hop lineage and dims the rest to a legible-but-receded
alpha; nothing is hidden, so the corpus context stays visible around the ego.

## Notes

Focus drives the same hover state as the pointer, so the ego-highlight is reachable
by keyboard; the recede alpha is a single shared constant used by marks and arcs.
