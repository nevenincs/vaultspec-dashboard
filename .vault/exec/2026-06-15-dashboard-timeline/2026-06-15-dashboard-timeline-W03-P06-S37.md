---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S37'
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
     The S37 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Render raw arcs under the client cap for v1 and ## Scope

- `frontend/src/app/timeline/arcs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render raw arcs under the client cap for v1

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add `resolveArcs`, which resolves each arc whose BOTH endpoints have a known
  position into a renderable arc (bowed path plus treatment plus label), dropping
  any arc with a missing endpoint so a dangling arc never draws.
- Add `rawArcs`, the v1 working path: resolve the in-range arcs then apply the
  belt-and-suspenders `MAX_TIMELINE_ARCS` cap reporting the dropped count.
- Wire the raw-arcs path into the timeline: build the endpoint lookup from only
  the virtualized, visible-lane marks so an arc resolves ONLY when both endpoints
  are on screen and their lanes are visible, then render each arc as an SVG path
  with its S36 treatment (stroke token via `var()`, dash, width, opacity, title).

## Outcome

Real lineage arcs draw between in-range marks under the client cap, styled by the
tier vocabulary; this is the v1 surface that bundling layers on top of.

## Notes

Endpoint visibility is enforced structurally by the position lookup (built from the
kept marks), so no separate in-range/visible-lane arc filter is needed.
