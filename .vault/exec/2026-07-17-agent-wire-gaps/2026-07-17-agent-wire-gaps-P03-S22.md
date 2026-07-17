---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S22'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Add optional run_id/turn_id fields to the changeset revision input and ledger record, stamped at tool-executor dispatch where ExecuteToolCallRequest already carries run_id and the turn joins through the run record

## Scope

- `engine/crates/vaultspec-api/src/authoring/executor.rs`

## Description

- Add `run_id: Option<RunId>` and `turn_id: Option<String>` to `ChangesetAggregateRecord`, defaulted to `None` in the `new` constructor so every direct/human path starts unstamped.
- Add `with_run_provenance(run_id, turn_id)` as a builder applied AFTER `new` — deliberately outside `aggregate_digest` computation, so attaching provenance never perturbs `changeset_revision` identity (wire-contract stable-key rule).
- Extend the `append_revision` INSERT to the v21 `authoring_changeset_revisions.run_id`/`turn_id` columns (already migrated on this tree by the parallel P01 lane), binding the record's provenance fields.
- Add unit tests: provenance round-trips through `history()` and the raw SQL columns while `changeset_revision` stays byte-identical before/after `with_run_provenance`; a human/direct changeset persists with both columns `NULL`.

## Outcome

The ledger-record half of S22 is landed at commit `169ecd4aa0`: the schema fields, the digest-exclusion guarantee, and the persistence round-trip. `cargo test -p vaultspec-api ledger` — 22/22 passed, including `run_provenance_round_trips_and_preserves_revision_identity` and `a_human_changeset_carries_no_run_provenance`.

## Notes

The plan step's full scope also names the tool-executor dispatch site (`engine/crates/vaultspec-api/src/authoring/executor.rs`) stamping `with_run_provenance` from `ExecuteToolCallRequest`'s `run_id` and the joined turn. That call site is NOT yet wired — `with_run_provenance` is defined and unit-tested but not called anywhere outside its own tests (verified via `grep -rn with_run_provenance engine/crates/vaultspec-api/src/`). Do not tick `P03.S22` fully closed on the plan until the dispatch-site wiring lands; report this gap to the lead rather than mark it done.

AMENDMENT (2026-07-17): the pending condition above is satisfied. `P03.S23` (commit
`4063e2b150`) wired the dispatch site: `handlers3.rs::dispatch_agent_tool_command`
reads the granted tool call's recorded `run_id` off `outcome.tool_call_record`, joins
the run's `turn_id` via `uow.sessions().run(&run_id)`, and calls the new
`create_agent_proposal` (which applies `with_run_provenance` inside
`create_proposal_of_kind`, `proposal/mod.rs`) rather than the unstamped
`create_proposal`. Re-verified via `grep -rn with_run_provenance
engine/crates/vaultspec-api/src/authoring/` — the call now appears in
`proposal/mod.rs` outside any test module, confirming production wiring. `S22` is
fully closed as of this amendment; see `P03.S23`'s own record for the dispatch-site
detail.
