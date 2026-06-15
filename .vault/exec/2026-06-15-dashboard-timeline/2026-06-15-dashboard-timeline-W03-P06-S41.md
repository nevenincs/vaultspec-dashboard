---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S41'
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
     The S41 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add tests for arc treatment, bundling, un-bundle-on-hover, and ego-highlight and ## Scope

- `frontend/src/app/timeline/arcs.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add tests for arc treatment, bundling, un-bundle-on-hover, and ego-highlight

## Scope

- `frontend/src/app/timeline/arcs.test.ts`

## Description

- Add `arcs` unit tests covering arc treatment per tier (declared solid, structural
  status-hued by state, temporal dotted, semantic haze) and confidence-as-lightness.
- Cover the geometry (cubic path connecting endpoints, bow direction by lane) and
  the cap (raw arcs truncate to the ceiling and report dropped count).
- Cover the disparity filter (declared/structural never thinned, weak temporal/
  semantic dropped below the floor), the HEB grouping and bundled geometry, and
  the gating property: raw and bundled produce the same arc identities but different
  geometry, and bundling respects the cap exactly like raw.
- Cover un-bundle-on-hover (incident set, raw incident path under a bundle, no raw
  arcs added at rest) and the arc label precedence (derivation > relation > tier).

## Outcome

All 23 arc-module tests pass, locking the treatment, cap, bundling-vs-raw gating,
un-bundle-on-hover, and ego-selection logic as pure, regression-guarded contracts.

## Notes

Ego-highlight selection is tested through `egoNodeIds`/`incidentArcIds` (the pure
parts); the rendered recede is exercised by the render test suite.
