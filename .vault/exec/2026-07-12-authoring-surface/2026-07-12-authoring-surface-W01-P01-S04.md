---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Integration tests: tick round-trip over a fixture plan, stale-base conflict refusal, and indeterminate-outcome resolution through the post-verify

## Scope

- `engine/crates/vaultspec-api/tests`

## Description

- Add a `plan_tick` integration-test module alongside the existing real-core direct-write tests, driving the full `execute_direct_write` lifecycle against a REAL `vaultspec-core` over a canonical plan built THROUGH core (scaffold plan + `plan step add`).
- Round-trip test: check `S01`, assert the served plan parses `S01` closed and the sibling untouched, then uncheck against the post-check blob and assert it re-opens — both clean-success via the envelope, not the recovery path.
- Stale-base test: a well-formed but non-matching `expected_blob_hash` refuses as `Conflict` and never mutates the plan.
- Indeterminate-outcome test: a shell adapter runs the REAL `plan step check` (landing the write) then sleeps past a 10s deadline; the apply reports `Timeout` (outcome-indeterminate) and the post-verify re-reads the step state, recognizing `Applied` with `resolved_via_post_verify` set.

## Outcome

- All three tests pass against the real core (`3 passed`, ~22s serialized under the shared real-core lock); the full authoring lib suite is `537 passed`, clippy and fmt clean.
- The tests exercise real services throughout: real git worktree, real `vaultspec-core install`/`vault add plan`/`plan step add`/`plan step check`, real SQLite authoring store, real subprocess adapter. No test doubles.
- Assertions read step state through the SAME `ingest_struct` parser the served projection uses, so a green test reflects what a reader would actually see.

## Notes

- Fixture discovery: a hand-written plan's step rows are STRIPPED by core's serializer as unknown prose on the first `plan step` write, so the fixture MUST be scaffolded through core (`vault add plan` defaults to L1; steps are added without `--phase`). This is why `setup_plan` shells out to core rather than writing a literal plan body.
- The plan attributed these tests to a `tests/` integration binary; they are co-located in the `direct_write.rs` test module instead, matching the established real-core apply/direct-write test harness (which is itself full integration against real core + store + fs) and reusing its `git`/`scaffold_vaultspec_workspace`/`register_actor` helpers.
