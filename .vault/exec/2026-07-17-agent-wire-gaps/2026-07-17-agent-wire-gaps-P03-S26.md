---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S26'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Write tests covering the projection serving session_id/run_id/turn_id for a tool-dispatched proposal and None for a human one, pre-migration record deserialization, and GET /v1/mode round-tripping POST /v1/mode including the default record on a fresh store

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/tests/group3.rs`
- `engine/crates/vaultspec-api/src/authoring/projections/tests.rs`

## Description

- Added `run_interrupt_listing_recovers_pending_and_serves_typed_decisions`
  (route-level, `http/tests/group3.rs`): seeds two interrupts on a run, reads them
  back through the live `GET /v1/runs/{run_id}/interrupts` route in raise order with
  `resume_state: "pending"` and `truncated: false`, resolves the first through the
  existing `/interrupts/{id}/resume` route, then re-reads and asserts the resolved
  row serves its decision as the typed projection object or the honest
  `decision_unreadable` marker — never a raw string.
- Added `mode_read_serves_default_and_round_trips_the_write` (route-level,
  `http/tests/group3.rs`): asserts `GET /v1/mode` on a FRESH store serves the default
  `mode: "manual"` record with a non-empty `scope_id` and the standard `tiers`
  envelope, then writes through the shipped `POST /v1/mode` and re-reads to confirm
  the GET serves the exact mode just written.
- Added `proposal_projection_serves_origin_run_provenance_and_none_for_human`
  (unit-level, `projections/tests.rs`, part of `S24`'s own commit `145d699f96` but
  scoped to this step's test-writing mandate): asserts a tool-dispatched changeset's
  projection serves the stamped `session_id`/`run_id`/`turn_id` from the origin
  revision, and a human/direct changeset's projection serves `run_id`/`turn_id` as
  `None` with those keys absent (not `null`) from the serialized wire JSON.

## Outcome

Both new read routes (interrupt listing, mode read) and the projection's provenance
fields are proven against live, real behavior — no mocks, no stubs — closing the test
coverage the plan step calls for. (The plan step's third clause, "pre-migration record
deserialization," is covered by S22's existing ledger round-trip tests rather than a
new test added here — see that step's record.)

## Notes

Landed at commit `9f67b2af07` ("live route coverage for interrupt-list recovery + mode
read round-trip"), building on `S24`'s projection test at `145d699f96`. Independently
reran all three named tests plus the full `vaultspec-api` lib suite — 823/823 passed.
This record was authored during a fill pass (bookkeeping only, no code changes by me);
the plan tick already landed at `f7bdf28278`.
