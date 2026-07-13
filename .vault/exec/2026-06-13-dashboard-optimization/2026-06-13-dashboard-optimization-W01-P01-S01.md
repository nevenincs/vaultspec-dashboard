---
tags:
  - '#exec'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-optimization-plan]]"
---

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
