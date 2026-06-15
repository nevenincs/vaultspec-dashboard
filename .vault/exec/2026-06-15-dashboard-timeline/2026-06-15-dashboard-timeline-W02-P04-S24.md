---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S24'
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
     The S24 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a consumer test feeding a captured live-shaped lineage sample through the adapter and asserting the reconciled result and ## Scope

- `frontend/src/stores/server/queries.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a consumer test feeding a captured live-shaped lineage sample through the adapter and asserting the reconciled result

## Scope

- `frontend/src/stores/server/queries.test.ts`

## Description

- Add the mock-mirrors-live consumer fidelity block to `queries.test.ts`: feed a captured live-shaped `/graph/lineage` envelope through the app's path (`unwrapEnvelope` + `adaptLineageSlice`) and assert the reconciled slice.
- Drive the MockEngine through the same `EngineClient` and assert it serves the same shape: every node carries a lane phase, a string `created`, and a NUMBER `modified`; every arc is self-consistent and carries no `derivation`.
- Assert the `[from, to]` range honesty (out-of-range documents excluded), and that a missing/unknown scope is a tiered 400 like the live route.

## Outcome

This is the load-bearing mock-mirrors-live-wire-shape proof: one client path serves both the captured live sample and the mock, and the assertions catch any future divergence in field shape, type, self-consistency, or the present-only tiers. All assertions pass.

## Notes

The numeric-vs-string `modified` assertion is the explicit guard against the exact mock-vs-live trap the rule was promoted to prevent.
