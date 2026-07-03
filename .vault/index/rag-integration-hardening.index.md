---
generated: true
tags:
  - '#index'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-rag-integration-hardening-P01-S01]]'
  - '[[2026-07-03-rag-integration-hardening-P01-S02]]'
  - '[[2026-07-03-rag-integration-hardening-P01-S03]]'
  - '[[2026-07-03-rag-integration-hardening-P01-S04]]'
  - '[[2026-07-03-rag-integration-hardening-P01-summary]]'
  - '[[2026-07-03-rag-integration-hardening-P02-S05]]'
  - '[[2026-07-03-rag-integration-hardening-P02-S06]]'
  - '[[2026-07-03-rag-integration-hardening-P02-summary]]'
  - '[[2026-07-03-rag-integration-hardening-P03-S07]]'
  - '[[2026-07-03-rag-integration-hardening-P03-S08]]'
  - '[[2026-07-03-rag-integration-hardening-P03-S09]]'
  - '[[2026-07-03-rag-integration-hardening-P03-S10]]'
  - '[[2026-07-03-rag-integration-hardening-P03-summary]]'
  - '[[2026-07-03-rag-integration-hardening-P04-S11]]'
  - '[[2026-07-03-rag-integration-hardening-P04-S12]]'
  - '[[2026-07-03-rag-integration-hardening-P04-summary]]'
  - '[[2026-07-03-rag-integration-hardening-P05-S13]]'
  - '[[2026-07-03-rag-integration-hardening-P05-S14]]'
  - '[[2026-07-03-rag-integration-hardening-P05-S15]]'
  - '[[2026-07-03-rag-integration-hardening-P05-S16]]'
  - '[[2026-07-03-rag-integration-hardening-P05-summary]]'
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-07-03-rag-integration-hardening-audit]]'
  - '[[2026-07-03-rag-integration-hardening-plan]]'
  - '[[2026-07-03-rag-integration-hardening-reference]]'
  - '[[2026-07-03-rag-integration-hardening-research]]'
---

# `rag-integration-hardening` feature index

Auto-generated index of all documents tagged with `#rag-integration-hardening`.

## Documents

### adr

- `2026-07-03-rag-integration-hardening-adr` - `rag-integration-hardening` adr: `semantic search rides the resident service` | (**status:** `accepted`)

### audit

- `2026-07-03-rag-integration-hardening-audit` - `rag-integration-hardening` audit: `semantic search hardening review`

### exec

- `2026-07-03-rag-integration-hardening-P01-S01` - Rewrite the rag-client search module as a pure bounded HTTP transport: add an http_search verb that POSTs the engine-built body verbatim to rag /search and returns the flat envelope untouched, delete the stale target_node_id and the forward_search annotation, keep degradation_reason, and cover verbatim transit plus bounds plus error mapping with FakeTransport unit tests
- `2026-07-03-rag-integration-hardening-P01-S02` - Swap the /search route onto the rag-client HTTP transport under rag_offload: map SearchBody query/target/max_results to rag's query/type/project_root/top_k vocabulary, introduce a warm-service SEARCH_HTTP_BUDGET, keep the pre-rag validation and typed-discovery availability gate, and delete the CLI spawn path (SEARCH_SIBLING_TIMEOUT and the rag_invocation search arm)
- `2026-07-03-rag-integration-hardening-P01-S03` - Point flatten_and_annotate and hit_node_id at the flat HTTP response shape (top-level results, snippet field, source as the vault/codebase discriminator), re-record the live-response fixture from the HTTP path, and keep the SearchShapeMiss stated-reason degradation for every shape drift
- `2026-07-03-rag-integration-hardening-P01-S04` - Update the engine wire tests for the HTTP search path: rag-down tier parity, request-bound rejections, shape-miss degradation, and annotation over the flat fixture
- `2026-07-03-rag-integration-hardening-P01-summary` - `rag-integration-hardening` `P01` summary
- `2026-07-03-rag-integration-hardening-P02-S05` - Forward rag's index_state block verbatim on every /search success and annotate the response with the shared semantic_epoch from the short-TTL cached read the embeddings path uses, degrading to an honest absent marker without a second blocking round-trip
- `2026-07-03-rag-integration-hardening-P02-S06` - Cover the freshness annotation in engine tests: epoch present on success, honest absent marker on epoch-read failure, index_state forwarded untouched
- `2026-07-03-rag-integration-hardening-P02-summary` - `rag-integration-hardening` `P02` summary
- `2026-07-03-rag-integration-hardening-P03-S07` - Raise the client search budget strictly above the engine search budget plus transport margin and send the app-chosen max_results in the search body so the wire payload is app-bounded
- `2026-07-03-rag-integration-hardening-P03-S08` - Teach the tolerant search adapter the flat HTTP vocabulary (top-level results, snippet alongside excerpt and text, forwarded index_state and semantic_epoch) while keeping the node-id derivation grammar unchanged
- `2026-07-03-rag-integration-hardening-P03-S09` - Surface semantic_epoch and index_state through the interpreted search selector so consumers key caches and render staleness from served truth, keeping a client-side abort mapped to the transport-error state
- `2026-07-03-rag-integration-hardening-P03-S10` - Update the frontend search tests for the new budget ordering, the flat-shape adapter vectors, and the freshness fields on the interpreted selector
- `2026-07-03-rag-integration-hardening-P03-summary` - `rag-integration-hardening` `P03` summary
- `2026-07-03-rag-integration-hardening-P04-S11` - Add the engine rag-gated live success test: discover the resident machine-global rag, drive a real query through /search, assert annotation and index_state on the live envelope, and skip with a stated reason when no service is discovered
- `2026-07-03-rag-integration-hardening-P04-S12` - Add the frontend rag-gated live success test: gate on the served tiers reporting the semantic tier available, drive a real settled query through useSearchController, and skip with a stated reason otherwise
- `2026-07-03-rag-integration-hardening-P04-summary` - `rag-integration-hardening` `P04` summary
- `2026-07-03-rag-integration-hardening-P05-S13` - Extend the version-tolerant --json retry (exit-2 usage-error detection, plain retry) from server-start to the shared-runner lifecycle verbs server-status, server-doctor, and server-install
- `2026-07-03-rag-integration-hardening-P05-S14` - Run reprobe_rag_until_running under rag_offload so the bounded reprobe loop never pins a Tokio async worker
- `2026-07-03-rag-integration-hardening-P05-S15` - File the Tier-3 rag coordination note asking for machine-wide aggregate storage totals on /storage/survey and the vault-collection-name descriptor on /readiness (the blake2b sunset trigger), and close the open rag-console-review step that mandates it
- `2026-07-03-rag-integration-hardening-P05-S16` - Record the stop_failed tiers decision at the stop handler: the tiers block reports true current service state and the failure lives in the envelope status
- `2026-07-03-rag-integration-hardening-P05-summary` - `rag-integration-hardening` `P05` summary

### plan

- `2026-07-03-rag-integration-hardening-plan` - `rag-integration-hardening` plan

### reference

- `2026-07-03-rag-integration-hardening-reference` - `rag-integration-hardening` reference: `tier-3 rag coordination asks`

### research

- `2026-07-03-rag-integration-hardening-research` - `rag-integration-hardening` research: `semantic search as a stable contract`
