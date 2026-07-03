---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S06'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Cover the freshness annotation in engine tests: epoch present on success, honest absent marker on epoch-read failure, index_state forwarded untouched

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs test mod`

## Description

- Add one focused unit test over the pure annotator covering the three S06 facts against the recorded flat rag fixture: a warm epoch (`Some`) rides the annotated envelope verbatim; a cold/failed read (`None`) annotates an explicit `null`; and rag's native `index_state` block is forwarded byte-for-byte in both cases.
- Pin the honesty boundary that makes the freshness signal usable downstream: a legitimate epoch of `0` ("nothing reindexed yet") annotates as `0` and is asserted distinct from the `null` absent marker, so a consumer never reads absence as an empty index.
- Derive every expected value from the specification (the epoch handed in by the caller, the fixture's `index_state`), never from a captured run.

## Outcome

- New test `annotation_carries_the_freshness_epoch_and_forwards_index_state` passes; the full `vaultspec-api` unit mod and the live-wire integration suites stay green, and the P01 rag-down tier-parity / bound-rejection / shape-miss / flat-fixture annotation tests are unaffected.
- `cargo fmt --all` clean; `cargo clippy --workspace --all-targets -- -D warnings` clean; `cargo test -p rag-client -p vaultspec-api` green.

## Notes

- The freshness facts are exercised at the pure-function annotation seam rather than through a full route, since the epoch value on the response is exactly the annotator's `Option<u64>` input; that keeps the test deterministic and free of a live rag while still asserting the served envelope shape. The end-to-end live success chain is the separate P04 rag-gated test.
