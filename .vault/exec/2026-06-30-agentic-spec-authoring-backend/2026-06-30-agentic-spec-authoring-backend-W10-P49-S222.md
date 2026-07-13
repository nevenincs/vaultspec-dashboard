---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S222'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement the kind=direct self-approved changeset path behind a feature flag, dual-running the editor save against the legacy /ops/core broker

## Scope

- `engine/crates/vaultspec-api/src/authoring/direct_write.rs`

## Description

- Add the direct editor-save command vocabulary and route contract: `CommandKind::DirectWrite`, `EndpointFamily::DirectWrite`, `DirectWriteRequest`, route fixtures, and request parse coverage for the `ref` rename.
- Mount `POST /authoring/v1/direct-writes` under the semantic `/authoring` router with `ResolvedCommand<DirectWriteRequest>`, explicit command-kind validation, and blocking execution for the core-backed materialization path.
- Add `authoring/direct_write.rs` as a composer over the existing create-proposal, validate, submit-for-review, approval, and apply machinery.
- Persist direct-write evidence in `authoring_direct_write_records` through schema version 12 rather than broadening `changeset_kind`, preserving the existing ledger enum while still making direct saves durable and replayable.
- Run the legacy `/ops/core` set-body comparison against an isolated temporary worktree copied from the target document preimage; the live checkout is written only by the canonical apply path.
- Surface backend-owned `direct_write` and `direct_write_dual_run` capabilities in the authoring status snapshot.

## Outcome

`S222` is implemented. A human editor save can now enter the authoring backend as a direct changeset command, resolve its actor through the existing principal seam, validate the optimistic `expected_blob_hash`, compose a single-child `ReplaceBody` proposal, self-approve through the normal approval repository, and materialize through the existing apply path. Agent principals are denied as values, preserving the automated self-approval boundary.

The direct path is authoritative for the live worktree. The legacy comparison records latency/status/conflict evidence but runs only against a temporary copy, so the transition state does not run two materializers against the same checkout. Successful direct saves store a durable direct-write record keyed by changeset and by actor/idempotency key for replay.

Verification passed:

- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
- `git diff --check -- engine/crates/vaultspec-api/src/authoring/api.rs engine/crates/vaultspec-api/src/authoring/direct_write.rs engine/crates/vaultspec-api/src/authoring/http.rs engine/crates/vaultspec-api/src/authoring/mod.rs engine/crates/vaultspec-api/src/authoring/model.rs engine/crates/vaultspec-api/src/authoring/response.rs engine/crates/vaultspec-api/src/authoring/store/mod.rs engine/crates/vaultspec-api/src/authoring/transitions.rs`

## Notes

Focused tests still emit the existing temporary watcher/core-tier warnings in fixture states; the test runs above passed. Full `vault check all` was not rerun for this step because the worktree already contains broad unrelated vault corpus drift and plan annotation warnings outside the S222 files.
