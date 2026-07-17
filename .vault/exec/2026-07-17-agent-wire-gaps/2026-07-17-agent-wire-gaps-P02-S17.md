---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S17'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Wire the GET /v1/runs/{run_id}/interrupts route over the existing store query, serving interrupt_id, run_id, kind, tool_call_id, resume_state, timestamps, and the typed decision projection

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/mod.rs`
- `engine/crates/vaultspec-api/src/authoring/http/wire_gaps.rs`

## Description

- Added a new `wire_gaps.rs` module under `authoring/http/` holding the two
  agent-wire-gaps additive READ routes (this step's `GET .../interrupts` and S25's
  `GET /v1/mode`), declared and re-exported from `mod.rs`.
- `get_run_interrupts` reads the bounded, raise-order interrupt listing for a run off
  the existing `uow.interrupts().interrupts_list_page(&run_id, INTERRUPT_LIST_CAP)`
  store query (the same projection S15/S16 already built), serving it through the
  shared `response::snapshot` tiers envelope.
- Mounted `.route("/v1/runs/{run_id}/interrupts", get(get_run_interrupts))` on the
  authoring router, alongside the run's existing cancel/complete/resume routes.
- Principal-permissive (no token required) like the other authoring reads; an unknown
  run serves an empty page rather than a fault.

## Outcome

The interrupt-listing recovery read is wired end to end: a client that dropped the
`/execute` `awaiting_permission` response can read its pending interrupts back,
serialized with the typed per-kind decision projection built in S15/S16.

## Notes

Landed together with S23 and S25 in one reviewed commit (`4063e2b150`,
"mount interrupt-list + mode read routes, flow run/turn provenance through execute
dispatch"). Route-level live test coverage (recovery + raise-order + resolved-decision
serving) landed separately in `S26` (commit `9f67b2af07`). Independently reran
`cargo test -p vaultspec-api --lib -- authoring::http::tests::group3::run_interrupt_listing_recovers_pending_and_serves_typed_decisions`
— 1/1 passed — and the full `vaultspec-api` lib suite — 823/823 passed. This record
was authored during a fill pass (bookkeeping only, no code changes by me); the plan
tick already landed at `f7bdf28278`.
