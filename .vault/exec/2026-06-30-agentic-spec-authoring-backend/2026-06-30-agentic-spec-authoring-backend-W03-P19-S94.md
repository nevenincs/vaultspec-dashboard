---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S94'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Actor model and delegated scopes code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run formal actor/provenance review over `actors.rs`, `store/mod.rs`, `ledger.rs`, `proposal.rs`, `transitions.rs`, and `mod.rs`.
- Resolve the high provenance-key collision finding by replacing delimiter concatenation with structured hash-derived provenance keys.
- Resolve the ledger-local actor guard finding by validating actors in `LedgerRepository::append_revision`.
- Add regressions for delimiter-collision provenance keys and unregistered ledger actors.
- Append S94 findings to the rolling feature audit and assign the remaining side-effect coverage matrix to S95.

## Outcome

S94 review found one high blocker and two medium follow-ups. The high blocker is
resolved: actor provenance keys now derive from serialized structured fields
plus `blob_oid`, with a regression proving delimiter-shaped actor ids do not
collide. The ledger-local guard medium finding is also resolved:
`append_revision` validates the actor record before record validation, chain
validation, or insert. The remaining medium item is coverage-focused and is
assigned to S95.

The follow-up reviewer confirmed no remaining blocker in the rechecked high and
ledger-local guard areas.

Verification passed after the review fixes:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::actors -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::ledger -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::proposal -- --nocapture`
- `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets --no-deps -- -D warnings`

## Notes

S95 must still add explicit proposal missing/stale actor side-effect tests,
actor/provenance tamper tests, and v8 populated-ledger migration guard coverage.
