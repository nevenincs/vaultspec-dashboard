---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S04'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---




# Update the engine wire tests for the HTTP search path: rag-down tier parity, request-bound rejections, shape-miss degradation, and annotation over the flat fixture

## Scope

- `engine/crates/vaultspec-api/tests/ + ops.rs test mod`

## Description

- Added a dedicated wire-test file for the HTTP search path that exercises the full router boundary without a live rag: an empty query, an over-length query, an unknown target, and an over-ceiling max_results each reject as a tiers-carrying 400 BEFORE any rag contact.
- Added a degradable-surface wire test: a valid query always returns a tiers-carrying 200 whose semantic tier is reported and whose results is an array, whether rag is absent (empty + degraded) or present (hits + available) — search is never a hard 5xx.
- Confirmed the request-bound rejection, flat-fixture annotation, empty-results-is-healthy, and shape-miss coverage already live as unit tests in the ops.rs test module from the earlier steps; kept them as the pure-function guards.
- Reworked the rag-down tier-parity test so it is deterministic under the new HTTP transport: since the transport reaches a resident rag when one is running on the host, the test now asserts the load-bearing LENSA-02 guard (the declared tier stays truthful — false when core was unreachable — independent of the semantic outcome) plus the degradable-surface invariant, rather than assuming the test host has no rag.

## Outcome

`cargo test -p rag-client -p vaultspec-api` is green: rag-client 52, vaultspec-api lib 321, code_corpus 8, declared_tier_parity 2, file_tree 5, salience_routes 5, and the new search_routes 5. `cargo fmt --all --check` exits 0 and `cargo clippy --workspace --all-targets -- -D warnings` is clean. The grep-verifiable deletions from the ADR hold: no `SEARCH_SIBLING_TIMEOUT`, no rag search arm through `rag_invocation`, no `target_node_id`, no annotating `forward_search`.

## Notes

Deviation from the plan's literal wording: the plan expected the existing rag-down parity test to pass unchanged. The engine's crate lints forbid unsafe code workspace-wide, so a test cannot mutate the process environment to hermetically hide a resident rag from discovery, and the rules forbid mocking the wire. Because this host runs a resident rag, the HTTP transport genuinely reaches it and an unindexed scope returns a healthy 200 with an honest index_missing marker (semantic available), so the old unconditional semantic-degraded assertion was environment-dependent. The test was rewritten to assert the invariant that holds under both rag states while preserving its real regression guard (declared never hardcoded true). The rag-down-specific degrade shape is still observable on a rag-less CI machine and is additionally covered as a pure-function unit test; the live success chain is the rag-gated P04 test.
