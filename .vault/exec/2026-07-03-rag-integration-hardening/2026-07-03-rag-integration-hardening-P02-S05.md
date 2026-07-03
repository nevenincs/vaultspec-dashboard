---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S05'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Forward rag's index_state block verbatim on every /search success and annotate the response with the shared semantic_epoch from the short-TTL cached read the embeddings path uses, degrading to an honest absent marker without a second blocking round-trip

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs + rag-client/src/control.rs`

## Description

- Verify the `index_state` half is already satisfied by P01: the `/search` handler in `ops.rs` reads rag's FLAT HTTP envelope and `flatten_and_annotate` builds its output as `rag.clone()`, overwriting only `results` — so rag's native `index_state` block (and `request_id`, `summary`, `timing`) passes through verbatim on every success. The recorded-fixture annotation test already asserts `index_state.status` survives.
- Add a shared bounded short-TTL cache for rag's machine-global semantic freshness epoch (`SemanticEpochCache` on `AppState`): a single `(epoch, read_at)` slot, a 5-second TTL, `fresh()` returning the value only inside the window and `store()` opening a new one. Single value plus TTL — bounded at creation per the resource-bounds rule.
- Repoint the `/graph/embeddings` epoch read through the shared cache: a warm slot serves without a `/jobs` round-trip; a cold/expired slot pays the one bounded, offloaded `/jobs` read and stores a successful result. A failed read leaves the slot cold and keeps the pre-existing `0` ("unknown") fallback for the vector-cache key — so a rag flake never poisons the cache with a fabricated `0`.
- Annotate every `/search` success with the shared epoch: `flatten_and_annotate` gains a `semantic_epoch: Option<u64>` parameter and writes a top-level `semantic_epoch` field (`Some` -> value, `None` -> explicit `null`). The handler reads the epoch from the cache ONLY (`fresh()`), so search never adds a second blocking round-trip; a cold/expired slot annotates the honest absent marker.
- Update the four in-module annotation call sites for the new signature.

## Outcome

- The epoch derivation lives in exactly one place (`rag_client::control::semantic_epoch`, read through the one cache seam); both the embeddings vector-cache key and the search freshness annotation consume it. Search stays non-blocking on the epoch; the embeddings poll keeps the shared slot warm.
- `cargo fmt --all` clean; `cargo clippy --workspace --all-targets -- -D warnings` clean; `cargo test -p rag-client -p vaultspec-api` green (existing suites, including the rag-down tier-parity, bound-rejection, shape-miss, and flat-fixture annotation tests, all pass).

## Notes

- The `index_state` forwarding was already correct after P01; this step VERIFIED it rather than re-implementing, per the plan's P02 scope, and added only the `semantic_epoch` annotation and its shared cache.
- Dedicated freshness assertions (epoch present, honest absent marker, `index_state` untouched) are the S06 test step; the existing call sites were updated here only to compile against the new signature.
