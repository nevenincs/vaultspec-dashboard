---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S18'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Narrow InterruptResumeRequest's opaque payload to the same typed decision schema in the same cutover, leaving the resume-by-id route otherwise unchanged

## Scope

- `engine/crates/vaultspec-api/src/authoring/api/mod.rs`
- `engine/crates/vaultspec-api/src/authoring/api/fixtures.rs`
- `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs`
- `engine/crates/vaultspec-api/src/authoring/interrupts.rs`
- `engine/crates/vaultspec-api/tests/langgraph_authoring_fixture.rs`

## Description

- Narrowed `InterruptResumeRequest`'s payload from an opaque blob to the same typed
  per-kind decision schema the S15/S16 listing projection already serves, adding a
  steer decision arm alongside the existing approve/reject/tool-permission kinds.
- Kept the resume-by-id route's shape and dispatch otherwise unchanged.
- Added a `decision_unreadable` legacy escape hatch so a pre-cutover opaque payload
  degrades honestly rather than faulting.
- Updated the interrupt fixture builder (`fixtures.rs`) and the `langgraph_authoring_fixture`
  integration test to construct and assert against the typed decision shape.

## Outcome

Write and read now speak one typed decision language for interrupt resume: the
listing projection (S15/S16) and the resume-by-id route both serve/consume the same
per-kind schema, closing the write-side half of the gap the read-side work opened.

## Notes

Landed at commit `4a666df724` ("narrow InterruptResumeRequest to typed decisions with
a steer arm — write/read one language, decision_unreadable legacy escape"). This
record was authored during a fill pass (bookkeeping only, no code changes by me).

Independently reverified against HEAD (not against the `90f8a3d5d5` commit the fill
request cited for "consumer-fixture fallout" — that hash is the unrelated
`frontend-localization` fix commit, a citation mismatch flagged back to the team
lead rather than recorded as this step's evidence): `cargo test -p vaultspec-api
--lib -- authoring::interrupts` (14/14), `authoring::http::tests::group3` (12/12,
including `run_interrupt_listing_recovers_pending_and_serves_typed_decisions`), and
`cargo test -p vaultspec-api --test langgraph_authoring_fixture` (5/5, including the
resume/steer/redrive scenario) all pass at HEAD. On the frontend consumer side,
`frontend/src/stores/server/agent/wireTypes.test.ts` (which exercises
`InterruptResumeDecision`) is 8/8 green at HEAD. No red test attributable to this
step's scope was found under either verification path.
