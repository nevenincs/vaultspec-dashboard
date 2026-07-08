---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S92'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement actor records, service identities, delegated scopes, stable provenance keys, and actor display metadata

## Scope

- `engine/crates/vaultspec-api/src/authoring/actors.rs`

## Description

- Add `authoring::actors` with durable human/agent actor records, display metadata, lifecycle state, and stable provenance key derivation.
- Add authoring store schema version 8 for actor records and ledger attribution columns.
- Guard v8 migration against silently upgrading already-populated unattributed v7 ledgers.
- Bump changeset ledger records to `authoring.ledger.v2` and bind actor identity/provenance into revision digests.
- Validate registered active actors before proposal idempotency reservations and mutation side effects.
- Thread each proposal command actor into new ledger revisions instead of inheriting attribution from previous revisions.
- Update existing store, ledger, proposal, and transition tests/builders to construct real actor-attributed records.

## Outcome

S92 implements the minimal P19 actor/provenance backend subset. The new
`authoring::actors` module stores durable human and agent actor records with
display metadata, active/stale state, timestamps, and provenance keys derived
only from actor kind, actor id, and optional `delegated_by` actor id. System,
tool-executor, service identity, granted scope, and authorization policy remain
outside this step.

The authoring store now migrates to schema version 8, creates
`authoring_actor_records`, and adds actor attribution columns to
`authoring_changeset_revisions`. The migration fails loudly if an existing v7
store already contains ledger revisions, because those historical rows cannot
be safely attributed after the fact.

The changeset ledger is now `authoring.ledger.v2`. Ledger records include the
issuing `ActorRef` and derived `actor_provenance_key`; the aggregate digest and
revision token are recomputed from those fields. Row reconstruction compares
the SQL actor columns, record JSON, and recomputed provenance key so actor
tampering is rejected through the existing ledger integrity path.

Proposal commands now require an active actor record before idempotency
reservation. Missing or stale actors therefore fail before idempotency,
preimage, validation, or ledger side effects. Each create, draft mutation,
validation, review submission, cancellation, and supersession revision is
attributed to the command actor that issued it.

Verification passed:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::tests::clean_open_creates_metadata_and_survives_restart -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::ledger -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::proposal -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::transitions -- --nocapture`
- `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets --no-deps -- -D warnings`

## Notes

The row title includes service identities and delegated scopes, but S91 narrowed
P19 to human/agent identity and provenance. This step records delegated
identity only as the `ActorRef.delegated_by` provenance input; scope grants and
enforcement are intentionally deferred.

No routes or frontend actor management were added. Actor records are available
through the internal authoring repository for the later route and agent wiring
phases.
