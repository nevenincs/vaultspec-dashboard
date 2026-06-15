---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S38'
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
     The S38 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add HEB bundling along feature/lineage containment with a disparity filter as a hardening step and ## Scope

- `frontend/src/app/timeline/arcs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add HEB bundling along feature/lineage containment with a disparity filter as a hardening step

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add the disparity filter: keep declared and structural arcs always (framework-
  named lineage) and thin temporal/semantic arcs to those clearing a confidence
  floor, so the weak tiers reduce to their significant subset at coarse scale.
- Add HEB containment grouping (`groupByContainment`) and a bundled cubic path
  (`bundledPath`) routing each arc through a shared group meeting point by a
  bundle strength, plus `bundledArcs`, which computes each group's endpoint
  centroid as the meeting point and caps the union exactly like the raw path.
- Wire bundling into the timeline gated behind a coarse-scale `pxPerMs` threshold
  with a feature-derived containment key; above the threshold the surface uses the
  raw path, so raw arcs are the structural fallback and bundling never raises the
  ceiling or breaks the v1 surface.

## Outcome

At coarse scale cross-feature arcs bundle into clean threads with weak tiers
thinned; at fine scale the surface falls back to raw arcs unchanged.

## Notes

Bundling is only CALLED below the coarse-scale threshold, so a defect in the
bundling path cannot reach the fine-scale raw v1 surface; the cap is applied to the
bundled union identically to the raw path.
