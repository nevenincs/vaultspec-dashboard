---
tags:
  - '#plan'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
tier: L2
related:
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-07-03-rag-integration-hardening-research]]'
---

# `rag-integration-hardening` plan

### Phase `P01` - Engine search transport rides the resident service

Replace the per-query CLI spawn with the bounded rag-client HTTP search verb, point the proven annotator at the verified flat response shape, and keep every degradation path tiers-honest (ADR D1).

- [x] `P01.S01` - Rewrite the rag-client search module as a pure bounded HTTP transport: add an http_search verb that POSTs the engine-built body verbatim to rag /search and returns the flat envelope untouched, delete the stale target_node_id and the forward_search annotation, keep degradation_reason, and cover verbatim transit plus bounds plus error mapping with FakeTransport unit tests; `engine/crates/rag-client/src/search.rs`.
- [x] `P01.S02` - Swap the /search route onto the rag-client HTTP transport under rag_offload: map SearchBody query/target/max_results to rag's query/type/project_root/top_k vocabulary, introduce a warm-service SEARCH_HTTP_BUDGET, keep the pre-rag validation and typed-discovery availability gate, and delete the CLI spawn path (SEARCH_SIBLING_TIMEOUT and the rag_invocation search arm); `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S03` - Point flatten_and_annotate and hit_node_id at the flat HTTP response shape (top-level results, snippet field, source as the vault/codebase discriminator), re-record the live-response fixture from the HTTP path, and keep the SearchShapeMiss stated-reason degradation for every shape drift; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P01.S04` - Update the engine wire tests for the HTTP search path: rag-down tier parity, request-bound rejections, shape-miss degradation, and annotation over the flat fixture; `engine/crates/vaultspec-api/tests/ + ops.rs test mod`.

### Phase `P02` - Engine search-plane freshness

Forward rag's native index_state verbatim and annotate the shared semantic_epoch on every search success so downstream builds get one invalidation key (ADR D3).

- [x] `P02.S05` - Forward rag's index_state block verbatim on every /search success and annotate the response with the shared semantic_epoch from the short-TTL cached read the embeddings path uses, degrading to an honest absent marker without a second blocking round-trip; `engine/crates/vaultspec-api/src/routes/ops.rs + rag-client/src/control.rs`.
- [ ] `P02.S06` - Cover the freshness annotation in engine tests: epoch present on success, honest absent marker on epoch-read failure, index_state forwarded untouched; `engine/crates/vaultspec-api/src/routes/ops.rs test mod`.

### Phase `P03` - Frontend timeout coherence and shape adoption

Make the client search budget strictly outlive the engine budget, adopt the flat HTTP vocabulary in the tolerant adapter, bound the wire payload from the app, and surface freshness through the one search selector (ADR D2, D3, D5).

- [ ] `P03.S07` - Raise the client search budget strictly above the engine search budget plus transport margin and send the app-chosen max_results in the search body so the wire payload is app-bounded; `frontend/src/stores/server/queries.ts + engine.ts`.
- [ ] `P03.S08` - Teach the tolerant search adapter the flat HTTP vocabulary (top-level results, snippet alongside excerpt and text, forwarded index_state and semantic_epoch) while keeping the node-id derivation grammar unchanged; `frontend/src/stores/server/liveAdapters.ts`.
- [ ] `P03.S09` - Surface semantic_epoch and index_state through the interpreted search selector so consumers key caches and render staleness from served truth, keeping a client-side abort mapped to the transport-error state; `frontend/src/stores/server/searchController.ts`.
- [ ] `P03.S10` - Update the frontend search tests for the new budget ordering, the flat-shape adapter vectors, and the freshness fields on the interpreted selector; `frontend/src/stores/server/searchController.test.ts + liveAdapters.test.ts + queries.test.ts`.

### Phase `P04` - Live success coverage gated on a resident rag

Exercise the real engine-to-rag-to-annotation-to-controller success chain in tests that skip honestly on rag-less machines (ADR D4).

- [ ] `P04.S11` - Add the engine rag-gated live success test: discover the resident machine-global rag, drive a real query through /search, assert annotation and index_state on the live envelope, and skip with a stated reason when no service is discovered; `engine/crates/vaultspec-api/tests/`.
- [ ] `P04.S12` - Add the frontend rag-gated live success test: gate on the served tiers reporting the semantic tier available, drive a real settled query through useSearchController, and skip with a stated reason otherwise; `frontend/src/stores/server/searchController.test.ts`.

### Phase `P05` - Lifecycle ride-alongs and coordination closeout

Close the audited residuals: version-tolerant --json on the shared-runner lifecycle verbs, offload the reprobe loop, file the Tier-3 rag coordination ask, and record the stop_failed tiers decision (ADR D5).

- [ ] `P05.S13` - Extend the version-tolerant --json retry (exit-2 usage-error detection, plain retry) from server-start to the shared-runner lifecycle verbs server-status, server-doctor, and server-install; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [ ] `P05.S14` - Run reprobe_rag_until_running under rag_offload so the bounded reprobe loop never pins a Tokio async worker; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P05.S15` - File the Tier-3 rag coordination note asking for machine-wide aggregate storage totals on /storage/survey and the vault-collection-name descriptor on /readiness (the blake2b sunset trigger), and close the open rag-console-review step that mandates it; `coordination note (rag sibling) + .vault/plan/2026-07-02-rag-console-review-plan.md`.
- [ ] `P05.S16` - Record the stop_failed tiers decision at the stop handler: the tiers block reports true current service state and the failure lives in the envelope status; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Description

Harden the engine-to-vaultspec-rag semantic-search integration so `/search` becomes a
stable contract the advanced-semantic-compilation follow-on can build against. The
authorizing ADR decided five things: the search transport moves off the per-query CLI
spawn onto the resident rag HTTP service through the bounded `rag-client` transport
(verified live against rag 0.2.28: bearer-token `/search`, flat response carrying
`results`, `timing`, and `index_state`); the client search budget strictly outlives the
engine budget so the tiers envelope always arrives; the search plane carries the
freshness contract (rag's `index_state` forwarded verbatim plus the shared
`semantic_epoch` annotation); the success chain gains rag-gated live tests that skip
honestly; and five audited lifecycle residuals close as ride-alongs. The linked
research and the 2026-07-02 console audit ground every step in verified file-level
reality.

## Parallelization

Phases `P01` and `P05` are independent and may run in parallel. `P02` depends on `P01`
(the freshness annotation rides the HTTP response the new transport returns). `P03`
depends on `P01` and `P02` for the wire shape it adopts, though `P03.S07` (budgets and
`max_results`) can start alongside `P02`. `P04` runs last: it exercises the completed
chain end to end. Within phases, steps are sequential except `P05`, where `S13`, `S14`,
`S15`, and `S16` are mutually independent.

## Verification

- Engine: `cargo test -p rag-client -p vaultspec-api` green, including the rag-down
  tier-parity, bound-rejection, shape-miss, and flat-fixture annotation tests; the
  rag-gated live test passes on this machine (resident rag present) and skips with a
  stated reason where absent.
- Frontend: the search controller, adapter, and query suites pass against the live
  fixture serve; the rag-gated live success test passes here and skips honestly
  elsewhere.
- Full lint gate exit 0 before any green claim: `just dev lint all` (eslint + prettier
  + tsc + cargo fmt --check + clippy).
- Grep-verifiable deletions: no `SEARCH_SIBLING_TIMEOUT`, no rag `search` arm reachable
  through `rag_invocation`, no `target_node_id`, no annotating `forward_search` in
  `rag-client`.
- Live behavior: a query typed in the Mod+P search palette against the running dev
  serve returns semantic hits with freshness served, and a cold first search renders
  loading or an honest degraded state, never the hard transport-error state.
- The plan is complete when every Step row is closed and the mandatory
  vaultspec-code-review audit records its verdict.
