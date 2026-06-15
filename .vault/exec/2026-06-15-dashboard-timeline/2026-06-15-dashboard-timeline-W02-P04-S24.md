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
