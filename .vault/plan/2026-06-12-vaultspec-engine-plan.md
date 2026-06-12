---
tags:
  - '#plan'
  - '#vaultspec-engine'
date: '2026-06-12'
tier: L3
related:
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `vaultspec-engine` plan

Build the `vaultspec` Rust engine from the committed cargo workspace scaffold to a contract-complete backend: ingestion, tiered linkage graph, query core, CLI verbs and serve mode.

## Wave `W01` - ingestion foundations

Deliver the shared type vocabulary, the derived-artifact store, and the three deterministic ingestion sources (git landscape, core declared graph, structural extraction). Wave W02 depends on every phase here; authorized by the engine ADR sections 2, 3, 5, 8 and 9.

### Phase `W01.P01` - model and store foundations

Deliver the shared engine-model type vocabulary (Node, Edge, Tier, Provenance, ScopeRef) with stable id derivation, and the rusqlite derived-artifact cache store.

- [x] `W01.P01.S01` - Define Node, NodeKind, Edge, RelationKind, Tier, Provenance and ScopeRef types per ADR section 3 as pure no-IO types; `engine/crates/engine-model/src/lib.rs`.
- [x] `W01.P01.S02` - Implement stable NodeId derivation from kind plus canonical key (feature tag, vault stem, plan stem plus step id, commit sha, repo path plus symbol) with unit tests; `engine/crates/engine-model/src/id.rs`.
- [x] `W01.P01.S03` - Implement stable EdgeId content-hash derivation over src, dst, relation, tier and provenance key with determinism unit tests; `engine/crates/engine-model/src/id.rs`.
- [x] `W01.P01.S04` - Implement the SQLite schema for derived artifacts keyed by input content hash, the temporal event log, and the semantic TTL cache; `engine/crates/engine-store/src/lib.rs`.
- [x] `W01.P01.S05` - Implement the store read and write API with single-writer discipline and concurrent-reader tests; `engine/crates/engine-store/src/lib.rs`.

### Phase `W01.P02` - git landscape mapping

Deliver workspace discovery, worktree and branch enumeration with advisory classification, remote-ref degraded mapping, and the commit-log walk, all on gix.

- [x] `W01.P02.S06` - Implement workspace discovery resolving any launch directory to the repository common git dir via gix, with fixture-repo tests; `engine/crates/ingest-git/src/workspace.rs`.
- [x] `W01.P02.S07` - Implement worktree enumeration capturing checkout path, HEAD ref and dirty state; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `W01.P02.S08` - Implement local-branch enumeration with advisory default, feature and other classification and a lazy cached corpus-diff confirmation hook; `engine/crates/ingest-git/src/branches.rs`.
- [x] `W01.P02.S09` - Implement remote-ref mapping flagged with degraded tiers (declared and temporal only, no working tree); `engine/crates/ingest-git/src/branches.rs`.
- [x] `W01.P02.S10` - Implement the commit-log walk producing temporal event records with timestamp, kind, ref and touched paths; `engine/crates/ingest-git/src/log.rs`.

### Phase `W01.P03` - core declared-graph adapter

Deliver the vaultspec-core subprocess adapter: schema-pinned vault graph JSON ingestion into declared edges plus the inventory verb adapters, fixture-tested.

- [x] `W01.P03.S11` - Implement the core subprocess runner for vault graph JSON with pinned schema versions and loud failure on unknown schema; `engine/crates/ingest-core/src/runner.rs`.
- [x] `W01.P03.S12` - Implement the graph v2 payload parser producing declared edges preserving kind, multiplicity and weight, with core-derived edges as a distinct relation at 0.8 confidence; `engine/crates/ingest-core/src/graph_v2.rs`.
- [x] `W01.P03.S13` - Implement inventory adapters for vault list, vault stats and vault feature list JSON envelopes; `engine/crates/ingest-core/src/inventory.rs`.
- [x] `W01.P03.S14` - Record live core JSON payloads as fixtures and add parser and runner tests against them; `engine/crates/ingest-core/tests/`.

### Phase `W01.P04` - structural extraction

Deliver document-body reading from working tree and git blobs, the four structural extractors with byte-span provenance, and the working-tree resolver with resolved, stale and broken states.

- [x] `W01.P04.S15` - Implement document body reading from the working tree and from git blobs for ref-only scopes; `engine/crates/ingest-struct/src/reader.rs`.
- [x] `W01.P04.S16` - Implement extractors for file paths, canonical step identifiers, wiki-link stems and code symbols, each recording byte-span provenance; `engine/crates/ingest-struct/src/extract.rs`.
- [x] `W01.P04.S17` - Implement the working-tree resolver assigning resolved, stale or broken state to every structural edge, retaining broken edges; `engine/crates/ingest-struct/src/resolve.rs`.
- [x] `W01.P04.S18` - Add fixture-document tests covering all four extractors and the three resolution states; `engine/crates/ingest-struct/tests/`.

## Wave `W02` - graph, index pipeline, and query core

Assemble ingested edges into the in-memory graph with key-plus-facet identity, build the incremental index pipeline and watcher, implement temporal correlation and blob-true time-travel, and expose one shared query core plus the rag semantic client. Wave W03 depends on this wave; authorized by the engine ADR sections 3, 4, 7 and 8.

### Phase `W02.P05` - graph and facets

Deliver the in-memory adjacency graph with key-plus-facet node identity, tier-enforcing edge ingestion, facet reconciliation across corpus views, query-time projections, meta-edge aggregation, and context assembly.

- [x] `W02.P05.S19` - Implement the in-memory adjacency graph storing nodes by stable key with per-corpus-view facets; `engine/crates/engine-graph/src/graph.rs`.
- [x] `W02.P05.S20` - Implement edge ingestion enforcing mandatory tier and provenance fields and the fixed per-tier confidence bands; `engine/crates/engine-graph/src/edges.rs`.
- [x] `W02.P05.S21` - Implement facet reconciliation across corpus views covering presence, document set, lifecycle state and content hashes, surfacing divergence; `engine/crates/engine-graph/src/facets.rs`.
- [x] `W02.P05.S22` - Implement query-time projections for per-tier degree counts and lifecycle progress summaries; `engine/crates/engine-graph/src/project.rs`.
- [x] `W02.P05.S23` - Implement feature-level meta-edge aggregation with count and per-tier breakdown per contract section 4; `engine/crates/engine-graph/src/project.rs`.
- [x] `W02.P05.S24` - Implement context assembly as a pure serializable read returning the tier-labelled bundle for any node; `engine/crates/engine-graph/src/context.rs`.

### Phase `W02.P06` - index pipeline and watcher

Deliver the cold parallel full-index pass, content-hash incremental re-index, the debounced filesystem watcher, the persisted temporal event log, and the re-derivability guarantee test.

- [ ] `W02.P06.S25` - Implement the cold full-index orchestration with parallel per-view and per-source fan-out; `engine/crates/engine-graph/src/index.rs`.
- [ ] `W02.P06.S26` - Implement incremental re-index with content-hash skip against the store cache; `engine/crates/engine-graph/src/index.rs`.
- [ ] `W02.P06.S27` - Implement the debounced filesystem watcher over vault and git dirs driving partial re-ingestion of dirtied views; `engine/crates/engine-graph/src/watch.rs`.
- [ ] `W02.P06.S28` - Implement temporal event log persistence correlating events to node ids; `engine/crates/engine-store/src/events.rs`.
- [ ] `W02.P06.S29` - Add the re-derivability test proving a full index from a deleted cache converges to the identical graph; `engine/crates/engine-graph/tests/`.

### Phase `W02.P07` - temporal correlation and time-travel

Deliver the four named temporal correlation rules, blob-true as-of reconstruction, the ordered diff log on one monotonic delta clock, and event bucketing.

- [ ] `W02.P07.S30` - Implement the four named temporal correlation rules with per-rule confidence and independent provenance attribution; `engine/crates/ingest-git/src/correlate.rs`.
- [ ] `W02.P07.S31` - Implement blob-true as-of graph reconstruction reading document blobs as committed at T from the git object DB; `engine/crates/engine-graph/src/asof.rs`.
- [ ] `W02.P07.S32` - Implement ordered diff-log generation between two times with monotonic sequence numbers and last-seq reporting; `engine/crates/engine-graph/src/diff.rs`.
- [ ] `W02.P07.S33` - Implement event bucketing with auto, raw and fixed-interval modes returning per-bucket counts by kind; `engine/crates/engine-query/src/events.rs`.

### Phase `W02.P08` - query core

Deliver the single shared query implementation: filter validation and vocabulary enumeration, scoped graph queries, node detail, neighbors and evidence queries, pagination cursors, and the per-tier degradation envelope.

- [ ] `W02.P08.S34` - Implement filter-object validation and normalization plus scoped filter-vocabulary enumeration; `engine/crates/engine-query/src/filter.rs`.
- [ ] `W02.P08.S35` - Implement the scoped graph query over scope, filter and as-of against the in-memory graph; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W02.P08.S36` - Implement node detail with interior structure, neighbors with depth and tier filters, and evidence queries; `engine/crates/engine-query/src/node.rs`.
- [ ] `W02.P08.S37` - Implement cursor pagination and the per-tier degradation block carried on every response envelope; `engine/crates/engine-query/src/envelope.rs`.

### Phase `W02.P09` - rag semantic client

Deliver the optional loopback rag client: service discovery, node-scoped discovery queries with TTL cache and capped confidence, and search forwarding with node-id annotation, degrading truthfully when rag is absent.

- [ ] `W02.P09.S38` - Implement rag service discovery via service json and the bearer loopback HTTP client with truthful absent and down states; `engine/crates/rag-client/src/client.rs`.
- [ ] `W02.P09.S39` - Implement node-scoped semantic discovery queries with TTL cache, 0.7 confidence cap and ephemeral never-persisted edges; `engine/crates/rag-client/src/discover.rs`.
- [ ] `W02.P09.S40` - Implement rag search forwarding with engine node-id annotation on each result; `engine/crates/rag-client/src/search.rs`.

## Wave `W03` - surfaces: CLI verbs and serve mode

Expose the query core through the two front doors: the one-shot CLI verbs and the single-origin serve mode fulfilling the agreed engine-GUI contract (query endpoints, temporal endpoints, SSE stream, SPA serving, ops proxy and search pass-through), then harden with end-to-end fixtures and CI wiring. Terminal wave; authorized by the engine ADR sections 6 and 7 and the dashboard-foundation reference (contract draft 2).

### Phase `W03.P10` - CLI verbs

Deliver the one-shot CLI front door: map, index, graph, node, events and status verbs as thin shells over the query core with core-compatible JSON envelopes and stateless scope.

- [ ] `W03.P10.S41` - Implement the map verb listing repo, branches, worktrees, corpus views and classification with json and scope flags; `engine/crates/vaultspec-cli/src/cmd/map.rs`.
- [ ] `W03.P10.S42` - Implement the index verb, incremental by default with a full flag; `engine/crates/vaultspec-cli/src/cmd/index.rs`.
- [ ] `W03.P10.S43` - Implement the graph verb exporting tier-labelled node-link JSON with filter and as-of flags; `engine/crates/vaultspec-cli/src/cmd/graph.rs`.
- [ ] `W03.P10.S44` - Implement the node verb with context and tiers flags returning detail or full context assembly; `engine/crates/vaultspec-cli/src/cmd/node.rs`.
- [ ] `W03.P10.S45` - Implement the events verb with from, to, kinds and bucket flags matching the contract event shape; `engine/crates/vaultspec-cli/src/cmd/events.rs`.
- [ ] `W03.P10.S46` - Implement the status verb reporting index state, backend health rollup and watcher state; `engine/crates/vaultspec-cli/src/cmd/status.rs`.
- [ ] `W03.P10.S47` - Implement the shared json envelope following the core result vocabulary across all verbs; `engine/crates/vaultspec-cli/src/envelope.rs`.

### Phase `W03.P11` - serve mode

Deliver the single-origin axum serve mode per the contract: discovery and auth, query and temporal endpoints, the multiplexed SSE stream with delta-clock resume, SPA static serving, and the transparent ops and search pass-throughs.

- [ ] `W03.P11.S48` - Implement the axum app skeleton with loopback-only bind, port flag failing loud on conflict, service json discovery with bearer token and heartbeat, ungated health route and bearer gating elsewhere; `engine/crates/vaultspec-api/src/app.rs`.
- [ ] `W03.P11.S49` - Implement the landscape and graph query endpoints: map, vault-tree, graph query, filters, node detail, neighbors, evidence and discover; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `W03.P11.S50` - Implement the temporal endpoints: events, graph as-of and graph diff sharing the monotonic delta clock; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [ ] `W03.P11.S51` - Implement the status snapshot and the multiplexed SSE stream with channels, sequence numbers and since resume or gap signal; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [ ] `W03.P11.S52` - Implement SPA static serving with embedded assets, fallback routing to index html, correct MIME types and dev-mode filesystem passthrough; `engine/crates/vaultspec-api/src/routes/spa.rs`.
- [ ] `W03.P11.S53` - Implement the whitelisted transparent ops proxies for core and rag verbs and the search pass-through with node-id annotation; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `W03.P12` - integration hardening

Deliver end-to-end fixture-workspace coverage across both front doors, a cold-index performance baseline, and CI wiring for the engine workspace.

- [ ] `W03.P12.S54` - Build the end-to-end fixture workspace with multiple worktrees and a vault corpus and exercise CLI and serve parity against it; `engine/tests/e2e/`.
- [ ] `W03.P12.S55` - Add a cold-index performance smoke benchmark and record the baseline; `engine/tests/bench/`.
- [ ] `W03.P12.S56` - Wire engine build, test and lint into the just pipeline and CI; `justfile`.

## Description

Implements the accepted engine architecture ADR (the primary authorizing document in `related:`): a headless Rust relationship and context aggregation engine, built out from the committed `engine/` cargo workspace scaffold whose ten crates already mirror the ADR section 9 shape. The work follows the ADR's dependency spine. Wave W01 delivers the foundations every later phase consumes: the pure `engine-model` type vocabulary with stable node and edge identity (ADR D3.1, D4.2, contract section 2), the rusqlite derived-artifact cache (D8.1, D8.2), and the three deterministic ingestion sources - git landscape mapping on gix (D2.1-D2.5), the schema-pinned core declared-graph adapter (D5.1), and structural extraction with resolution states (D3.3). Wave W02 assembles those sources into the in-memory graph with key-plus-facet identity and context assembly (D4.1-D4.4), the incremental watcher-driven index pipeline (D2.4), temporal correlation and blob-true time-travel on one delta clock (D3.4, D7.3, D7.4), the single shared query core (D6.1), and the optional rag semantic client (D3.5, D5.2). Wave W03 exposes the two front doors: CLI verbs with core-compatible JSON envelopes (D6.1, D6.2) and the single-origin serve mode fulfilling the agreed contract recorded in the dashboard-foundation reference (D7.1-D7.5), closing with end-to-end fixtures, a performance baseline, and CI wiring.

Scoping is deliberately loose by direction: where implementation teaches that an ADR decision is wrong, the executor must not silently deviate - flag the specific decision id for an ADR modification or a superseding ADR, then proceed per the resolution. The decisions register ADR and the contract reference in `related:` carry the cross-feature constraints; the contract is binding at capability level, endpoint shapes are illustrative.

## Steps

## Parallelization

Waves are sequenced: W01 before W02 before W03. Within W01, Phase W01.P01 must land first (every other phase consumes `engine-model` types and the store); Phases W01.P02, W01.P03 and W01.P04 then run fully in parallel - they share no dependency beyond the model crate and are independently fixture-testable by design. Within W02, Phase W02.P05 must land first; W02.P06 and W02.P07 then run in parallel (the watcher and the temporal rules touch disjoint surfaces); W02.P08 depends on W02.P05 and W02.P07 (queries need projections and the as-of path); W02.P09 is independent of all other W02 phases after W02.P05 and may run alongside any of them. Within W03, Phases W03.P10 and W03.P11 run in parallel (both are thin shells over the query core and share no files); W03.P12 is strictly last. Step order inside a phase is sequential unless steps name disjoint files.

## Verification

The plan is complete when every Step is closed and the following checks hold:

- `cargo build --workspace`, `cargo test --workspace` and `cargo clippy --workspace -- -D warnings` pass in `engine/` at every phase boundary; a phase is not done with red checks.
- Re-derivability (ADR D8.2): the W02.P06.S29 test proves a full index from a deleted cache converges to the identical graph, byte-equal under canonical serialization.
- Contract conformance: every capability in the dashboard-foundation reference (map and vault-tree, graph query with validated filter echo, filters vocabulary, node detail with interior structure, neighbors, evidence, discover, events with bucketing, as-of and diff on one delta clock with since resume, status, SSE channels, SPA fallback serving, ops whitelist, search annotation) is exercised by at least one end-to-end test in W03.P12.S54, including the degradation paths (rag absent, ref-only scope, unknown core schema).
- Identity stability: node and edge ids are byte-identical across repeated queries, scope changes and as-of views in the e2e fixture.
- Tier integrity: no edge exists without tier and provenance; semantic edges never appear in any as-of response; structural broken edges are present and flagged, never dropped.
- CLI and serve parity (ADR D6.1): for each shared capability the CLI verb and the serve endpoint return the same payload modulo envelope, asserted in the e2e suite.
- Per-phase formal review (the team's task discipline): each phase boundary gets a vaultspec-code-review audit before the phase is considered done; findings block closure.
- Cold-index performance baseline recorded by W03.P12.S55; regressions against it are flagged, not silently accepted.
