---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S56'
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
     The S56 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add tests for the control bar toggles, chips, tier dial, and fit/zoom/jump controls and ## Scope

- `frontend/src/app/timeline/TimelineControls.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add tests for the control bar toggles, chips, tier dial, and fit/zoom/jump controls

## Scope

- `frontend/src/app/timeline/TimelineControls.test.tsx`

## Description

- Add the control-bar test suite covering the lane toggles, the vocabulary-driven relation and feature chips, the reused tier dial's time-travel inapplicability, and the fit/zoom/jump controls.
- Test the pure fit/zoom/jump and minimap-projection helpers directly with no DOM, passing the clock in.
- Test the component contracts through the real mock-engine client transport over the live filters and lineage wire shapes, with no component-internal doubles, so the engine-enumerated vocabulary is proven against the real wire.

## Outcome

The suite passes (timeline test files all green): lane toggles write the store, the relation and feature chips render the engine enumeration and write the filter store, the semantic tier reads inapplicable in time-travel, zoom rescales within the band, fit-all fits the corpus bounds, fit-feature gates on a feature filter, jump centres the date, and the range chip plays and clears.

## Notes

Assertions use plain DOM property access (no jest-dom matchers are configured in the project). The component tests run on the real mock-engine transport rather than mocking the vocabulary hook, satisfying the integration-test no-doubles discipline and proving the vocabulary is sourced from the wire.
