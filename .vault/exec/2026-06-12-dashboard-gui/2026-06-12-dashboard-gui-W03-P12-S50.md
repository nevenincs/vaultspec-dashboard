---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S50'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# add the end-to-end smoke launching against live engine serve verifying constellation render, scrub, and search round-trip, requires the engine plan serve wave landed

## Scope

- `frontend/e2e/smoke.spec.ts`

## Description

- Add `frontend/e2e/smoke.spec.ts` plus `frontend/playwright.config.ts`
  (`@playwright/test` over system Chrome, origin overridable via
  `VAULTSPEC_SERVE_ORIGIN`; `npm run e2e`): the end-to-end smoke against a
  live `vaultspec serve` origin - single origin serving shell, API, and
  SSE; the engine reads `frontend/dist` from disk, so a rebuild serves
  immediately.
- Leg 1 (PASS live): the served shell carries the DF-6 `vaultspec-token`
  meta tag and the app boots its four-region anatomy.
- Leg 2 (PASS live): the constellation renders - the field mounts its
  canvas from the real graph and the live index reports a non-empty
  corpus.
- Leg 3 (PASS live): search round-trips through the engine's rag
  pass-through (200, ok envelope, no dead control, no offline banner with
  rag up); the result-bearing click-through runs conditionally and is
  covered against the mock. Added `adaptSearch` for the live nested rag
  envelope with tolerant item mapping and stem-derived node ids when the
  engine annotation is absent.
- Leg 4 (BLOCKED, flagged as an external dependency - `test.fixme` with
  the reason in-line, never a silent skip): live scrubbing requires
  asof/diff to accept the contract's timestamp form (S49 divergence item
  1, routed to the engine owners). The scrub mechanism itself is covered
  against the contract-faithful mock (S34). Un-fixme when the
  reconciliation lands.

## Outcome

The smoke runs against the live origin: 3 passed, 1 flagged-blocked, in
under 4 seconds. Unit gates stay green (226 tests, typecheck, eslint,
prettier).

## Notes

New divergence item 6, appended to the S49 flag set: the live search
pass-through nests the verbatim rag envelope
(`data.envelope.data.results`), carries no engine node-id annotation
observable yet, and the workspace's rag VAULT index currently serves zero
results for every query (verified against rag directly - the emptiness is
upstream of the engine). Result-bearing round-trip assertions activate
when the index carries this corpus.

