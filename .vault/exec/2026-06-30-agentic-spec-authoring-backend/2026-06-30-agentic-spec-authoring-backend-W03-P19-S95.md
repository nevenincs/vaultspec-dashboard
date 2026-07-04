---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S95'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify every mutation can be attributed to a stable actor and delegated scope

## Scope

- `engine/crates/vaultspec-api/src/authoring/actors.rs`

## Description

- Add proposal verification for actor attribution across create, append, replace, validate, submit, cancel, and supersede.
- Add missing and stale actor proposal tests that assert no idempotency, preimage, validation, ledger, or outbox side effects.
- Add ledger verification that unregistered actors cannot append revisions and actor/provenance tampering fails reconstruction.
- Add a store migration regression proving populated v7 ledgers cannot silently migrate to v8 without attribution.
- Rerun the full authoring test slice and package-local clippy.

## Outcome

S95 verifies the P19 actor/provenance contract across the current mutation
surface. Proposal command histories now prove each revision records the actor
that issued that command, including delegated agent provenance. Create, append,
replace, validate, submit, cancel, and supersede are covered.

Missing and stale actors are rejected before proposal side effects: no
idempotency reservation, document preimage, validation record, ledger revision,
or outbox event is written. Direct ledger appends also reject unregistered
actors before insert.

Ledger integrity tests now cover actor/provenance tampering specifically, and
store migration tests prove an already-populated v7 ledger cannot be silently
upgraded into the v8 actor-attributed schema.

Verification passed:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::tests::v8_migration_refuses_populated_unattributed_ledger -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::ledger -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::proposal -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets --no-deps -- -D warnings`

## Notes

The full authoring test slice passed while emitting the existing temporary
workspace watcher and core graph diagnostics after the green result. No new
service identity, scope grant, route, frontend, LangGraph, approval, apply, or
operation-mode behavior was added.
