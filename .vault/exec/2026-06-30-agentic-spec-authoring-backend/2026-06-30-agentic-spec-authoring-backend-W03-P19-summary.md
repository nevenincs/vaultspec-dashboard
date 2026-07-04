---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W03.P19` summary

W03.P19 delivered the minimal actor/provenance subset for the authoring walking
skeleton. Human and agent actor records are durable backend product state,
proposal and ledger mutations require active actors, and every changeset
revision now carries digest-bound actor attribution.

- Created: `engine/crates/vaultspec-api/src/authoring/actors.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/ledger.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/proposal.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/transitions.rs`
- Modified: `.vault/audit/2026-06-30-agentic-spec-authoring-backend-audit.md`

## Description

The phase began by grounding the rewritten P19 scope against the accepted ADRs
and the live code. The stale row wording around service identities and delegated
scope enforcement was explicitly narrowed: P19 implements human and agent actor
identity, stable provenance keys, and ledger attribution only.

The implementation adds `authoring::actors`, schema version 8, durable actor
records, actor display metadata, active/stale state, stable structured
hash-derived provenance keys, and ledger attribution columns. The changeset
ledger is now `authoring.ledger.v2`; actor identity and provenance are part of
the aggregate digest and revision token, and reconstruction rejects
actor/provenance tampering.

Proposal commands validate active actors before idempotency reservation or
proposal side effects. Ledger appends also validate the attributed actor before
insert, preventing internal bypass. Delegated actor refs are supported as
provenance on `ActorRef.delegated_by`; granted scopes, service identity records,
authorization policy, operation modes, approval/apply behavior, routes,
frontend work, LangGraph runtime state, and core adapter calls remain deferred.

The S94 review found a high collision risk in delimiter-concatenated provenance
keys and a medium ledger-local validation gap. Both were fixed and re-reviewed
cleanly. S95 added the remaining verification: mutation histories prove issuing
actor attribution for create, append, replace, validate, submit, cancel, and
supersede; missing and stale actors leave no idempotency, preimage, validation,
ledger, or outbox side effects; actor/provenance tampering is rejected; and a
populated unattributed v7 ledger cannot silently migrate to v8.

Verification passed:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets --no-deps -- -D warnings`

The authoring-wide test slice passed while emitting the existing temporary
workspace watcher and core graph diagnostics after the green result.
