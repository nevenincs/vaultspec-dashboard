---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S223'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add dual-run tests for human self-approval legality, preimage capture, latency parity measurement, and conflict-UX parity against the legacy broker

## Scope

- `engine/crates/vaultspec-api/src/authoring/direct_write.rs`

## Description

- Add real-core direct-write tests in `authoring/direct_write.rs` using a temporary git worktree and `vaultspec-core install`; no shell adapter, fake core, mocks, or skipped fallback.
- Cover the successful human direct-save path: actor registration, direct changeset composition, human self-approval, normal apply receipt, durable direct-write marker, preimage capture, rollback availability, idempotent replay, and dual-run latency/result evidence.
- Cover the stale `expected_blob_hash` path: conflict value response, legacy comparator conflict evidence, no live checkout mutation, and no direct-write marker.
- Cover the automated-writer boundary by asserting an agent actor receives a direct-save value denial and no direct-write marker.
- Fix the isolated legacy comparator so it copies `.vaultspec` into the temporary comparison root; without that, the comparator measured only missing-workspace failure rather than legacy broker behavior.
- Align direct-write tests with existing `/ops/core set-body` semantics: the payload `body` is markdown body content streamed to core, while the real vault document remains frontmatter-bearing.

## Outcome

`S223` is complete. The direct-write path now has real-behavior coverage for the transition-state requirements: human self-approval is legal, agents cannot use the direct-save route as a write/approve bypass, preimages and rollback availability are preserved, dual-run evidence carries latency/status/result shape, conflicts preserve editor-style optimistic blob behavior, and the legacy comparison cannot mutate the live checkout.

The tests also exposed and fixed an implementation gap from `S222`: the isolated comparator initially copied only the target file, so `vaultspec-core` could not run a meaningful legacy write. The comparator now copies `.vaultspec` into the temp root before invoking core.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::direct_write -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `git diff --check -- ...` over the S222/S223 touched files

## Notes

The direct-write tests require a working local `vaultspec-core install` and therefore are real integration-heavy unit tests. This environment satisfied that requirement. Existing fixture-state watcher/core-tier warnings still appear in unrelated focused slices; the runs above passed.
