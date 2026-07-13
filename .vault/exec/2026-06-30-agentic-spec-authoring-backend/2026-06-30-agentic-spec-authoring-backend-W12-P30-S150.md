---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S150'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify LangGraph checkpoints are references and never the only product history

## Scope

- `engine/crates/vaultspec-api/src/authoring/langgraph.rs`

## Description

- Ground S150 against the W12.P30 checklist, the LangGraph runtime mapping
  implementation, session recovery, ledger reconstruction, lifecycle event
  replay, and durable store schema.
- Strengthen the LangGraph recovery regression so it opens the durable SQLite
  schema after checkpoint mapping and proves the store has only
  `langgraph_checkpoint_id` reference columns and no `checkpoint_payload`
  storage surface.
- Verify the recovered session/run snapshot still carries Vaultspec-owned
  session and run state while exposing checkpoint ids only through
  `LangGraphRef`.
- Verify public create/start command DTOs reject caller-supplied LangGraph
  checkpoint payloads at the command boundary.
- Verify product history remains independently durable through existing ledger,
  apply receipt, and outbox replay tests.
- Dispatch an independent S150 verification sidecar and reconcile its findings.
- Run formatting, focused LangGraph tests, the broader authoring test slice, and
  clippy.

## Outcome

S150 is verified for the implemented W12.P30 surface. LangGraph checkpoint ids
are stored as correlation references on Vaultspec-owned session/turn/run records
and recovered through backend snapshots, but raw checkpoint payloads are neither
accepted on public command DTOs nor allocated as a durable schema surface.

Product history remains independent of LangGraph checkpoints: proposal ledger
history reconstructs without LangGraph or frontend memory, apply receipts are
recorded as product outcomes, and lifecycle replay reads durable outbox rows
after restart. The verification sidecar found no S150 blocker or missing
evidence.

## Notes

- Verification:
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::langgraph -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
- Focused LangGraph tests passed 3 tests.
- The broader authoring test slice passed 321 tests, including the ledger
  independence and outbox replay coverage relevant to S150.
- Test-owned temporary `vaultspec serve` children logged watcher warnings after
  temporary roots were removed; detached workspace server children were stopped
  after the run.
