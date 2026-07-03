---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S01'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---




# Rewrite the rag-client search module as a pure bounded HTTP transport: add an http_search verb that POSTs the engine-built body verbatim to rag /search and returns the flat envelope untouched, delete the stale target_node_id and the forward_search annotation, keep degradation_reason, and cover verbatim transit plus bounds plus error mapping with FakeTransport unit tests

## Scope

- `engine/crates/rag-client/src/search.rs`

## Description

- Rewrote the `rag-client` search module as a pure bounded HTTP transport carrying zero search semantics, mirroring the `control` and `vectors` modules.
- Added `http_search(transport, body)`: it POSTs the engine-built request body verbatim to rag's `/search` route and parses the flat response envelope back to a `serde_json::Value` untouched.
- Deleted the dead `forward_search` verb and the stale `target_node_id` helper, which had zero production consumers and implemented the historically-wrong `source`-as-path node-id semantics the live route annotator documents as a past bug.
- Kept `degradation_reason` unchanged; it stays live on the brokered-envelope and graph-embeddings paths.
- Rewrote the module doc to state the new role: the engine-built body transits verbatim, rag's flat envelope returns verbatim, and validation plus annotation plus the tiers block are the broker's job.
- Replaced the unit tests with FakeTransport coverage: verbatim body transit to `/search`, verbatim flat-envelope return, typed transport-error propagation, non-JSON body as a typed error, and the retained degradation-reason mapping.

## Outcome

The crate now exposes one search verb — a bounded, semantics-free HTTP POST to the resident service — replacing the never-wired annotating forwarder. The historically-wrong second annotator is gone, so only the route's proven `flatten_and_annotate` / `hit_node_id` remains, removing the mis-wiring hazard the research flagged. `cargo fmt` clean, `cargo clippy -p rag-client --all-targets -- -D warnings` clean, and `cargo test -p rag-client` green at 52 passed.

Verified no other code references the deleted symbols: the only `target_node_id` mentions outside the module are documentation comments in `vectors.rs`, and `forward_search` had no references at all.

## Notes

The `http_search` body is typed as `&serde_json::Value` (serialized at the call site) so the crate never names a rag field — the broker owns the `{query, type, project_root, top_k}` vocabulary. Response annotation is deliberately NOT ported into the crate; it stays in the engine route where the correct discriminator semantics already live.
