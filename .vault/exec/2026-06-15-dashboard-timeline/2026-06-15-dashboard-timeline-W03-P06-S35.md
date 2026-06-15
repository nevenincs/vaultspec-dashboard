---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S35'
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
     The S35 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the 14px grayscale-by-shape gate assertion for the phase-lane document marks and ## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the 14px grayscale-by-shape gate assertion for the phase-lane document marks

## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx`

## Description

- Rewrite the timeline render test to assert the 14px grayscale-by-shape gate for
  the phase-lane document marks, reusing the shared `gateFamily` gate over the
  exact `MarkDef` silhouettes the surface draws (research, reference, adr, plan,
  exec, audit), with the same 8-cell squint floor the scene gate uses.
- Add render-level tests driving the real stores transport (mockEngine) over the
  live lineage wire shape: each dated document renders as an activatable button
  naming its kind, date, and lineage degree, under a non-overriding group role.
- Dock a fine scale on the corpus week so the research and adr pipeline marks fall
  in range and resolve by name, proving the marks are dated, not events.

## Outcome

The gate proves the lane marks stay distinct in grayscale at the legibility floor;
the render tests prove the marks are dated, button-roled, and degree-announced.

## Notes

The mock corpus feature names are seeded by the fixture; the assertions match by
doc-type and date rather than hardcoding a feature slug to stay fixture-agnostic.
