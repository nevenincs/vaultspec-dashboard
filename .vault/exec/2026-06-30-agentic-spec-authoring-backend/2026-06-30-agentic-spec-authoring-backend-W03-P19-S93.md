---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S93'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add actor tests for human identity, agent identity, delegated scope, missing actor, stale actor, and provenance key stability

## Scope

- `engine/crates/vaultspec-api/src/authoring/actors.rs`

## Description

- Add real-store actor registry tests in `actors.rs`.
- Cover human actor persistence and reopen behavior.
- Cover agent actor persistence with backend-served display metadata.
- Cover delegated actor provenance key distinction without scope enforcement.
- Cover missing actor and stale actor rejection.
- Cover provenance key stability across display updates and process restart.
- Cover explicit deferral of system/service actor registry records in this subset.

## Outcome

S93 adds seven actor tests using real temporary authoring stores and the real
actor repository. The tests prove that human and agent actor records persist,
reload, and expose display metadata; delegated `ActorRef` values produce stable
distinct provenance keys; missing and stale actors fail through `StoreError::Actor`;
and display metadata updates do not re-key provenance.

The tests also pin the S91/S92 scope boundary: system/service actor kinds remain
vocabulary values for future phases, but they are not durable actor registry
records in the minimal P19 subset.

Verification passed:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::actors -- --nocapture`
- `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets --no-deps -- -D warnings`

## Notes

S93 intentionally does not add proposal-wide mutation attribution assertions.
Those checks are reserved for S95, after the S94 review pass.
