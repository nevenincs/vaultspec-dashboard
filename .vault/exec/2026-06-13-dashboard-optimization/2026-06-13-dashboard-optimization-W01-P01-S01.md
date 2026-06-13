---
tags:
  - '#exec'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-optimization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-optimization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-13-dashboard-optimization-plan placeholders are machine-filled by
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
     The Add the fake-timer delta-storm harness and the bounded-growth assertion helper and ## Scope

- `frontend/src/testing/adverse.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the fake-timer delta-storm harness and the bounded-growth assertion helper

## Scope

- `frontend/src/testing/adverse.ts`

## Description

- Added `src/testing/adverse.ts`: the vitest-free adverse harness - `syntheticGraphDeltas`
  (monotonic-seq deltas), `pushStorm` (burst a mock SSE channel), `storm` (generic N-run
  driver), and `assertBounded` (throws a plain Error on a growth-cap violation so any
  runner reports it).
- Self-tested in `adverse.test.ts` (generator monotonicity, storm count, assertBounded
  pass/throw).

## Outcome

The campaign's reproduce/regression substrate (ADR D3). Vitest-free so it imports
anywhere and tests own the assertions + fake timers. Immediately consumed by W02.S03
(bounded-growth) and the debounce coalescing test. 3 self-tests green.

## Notes

The browser-level perf gate (W01.S02, reads `window.__SPIKE_RESULTS__`) is a separate
piece deferred to the next drive; this step delivers the unit-level storm + bounded-growth
half of the harness, which pins the two stores-side fixes landed alongside it.
