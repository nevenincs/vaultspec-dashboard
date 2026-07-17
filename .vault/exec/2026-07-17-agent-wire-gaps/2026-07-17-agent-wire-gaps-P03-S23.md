---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S23'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Flow the stamped run_id/turn_id provenance through create_proposal into the ledger record, with human/direct changesets carrying None

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs`
- `engine/crates/vaultspec-api/src/authoring/proposal/mod.rs`

## Description

- Added `RunProvenance { run_id, turn_id }` and a `create_agent_proposal` entry point
  alongside the existing `create_proposal`, both delegating to a `create_proposal_of_kind`
  now taking an `Option<RunProvenance>` parameter.
- Inside `create_proposal_of_kind`, when provenance is `Some`, the freshly-constructed
  ledger record is stamped via `record.with_run_provenance(...)` (S22's builder) AFTER
  `ChangesetAggregateRecord::new`, so the append never perturbs `changeset_revision`
  identity; a `None` provenance (every human/direct save) leaves the record unstamped.
- Wired the dispatch site in `handlers3.rs::dispatch_agent_tool_command`: for a
  `ProposeChangesetDispatch::Create`, the granted tool call's already-recorded
  `run_id` is read off `outcome.tool_call_record`, the run's joined `turn_id` is read
  through `uow.sessions().run(&run_id)`, and `create_agent_proposal` is called with
  that `RunProvenance` when a run_id is present, falling back to the unstamped
  `create_proposal` otherwise (covers dispatch paths outside a granted tool call).

## Outcome

A tool-dispatched changeset now carries an auditable trail to the exact run and prompt
turn that created it; a human/direct changeset carries none, matching the plan's
intent exactly.

## Notes

This closes the "pending executor.rs dispatch wiring" gap the held-open `P03.S22`
record flagged: `with_run_provenance` is now called from production code
(`proposal/mod.rs` via `create_agent_proposal`, itself called from `handlers3.rs`),
confirmed via `grep -rn with_run_provenance engine/crates/vaultspec-api/src/authoring/`
showing the call site outside the builder's own tests. See `P03.S22`'s amended record
for the closure note. Landed at commit `4063e2b150`. Independently reran the full
`vaultspec-api` lib suite — 823/823 passed. This record was authored during a fill
pass (bookkeeping only, no code changes by me); the plan tick already landed at
`f7bdf28278`.
