---
tags:
  - '#plan'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
tier: L3
related:
  - '[[2026-07-02-codebase-graphing-adr]]'
  - '[[2026-07-02-codebase-graphing-research]]'
---
# `codebase-graphing` plan

## Wave `W01` - Model and extraction

Additive identity contract plus the in-process tree-sitter extraction crate.

### Phase `W01.P01` - Model and identity additions

The new node kind, canonical key, relation, and provenance variants (ADR D4).

- [x] `W01.P01.S01` - Add NodeKind::CodeModule, CanonicalKey::CodeModule (wire prefix code-mod), RelationKind::Imports, and Provenance::TreeLayout with serde and as_str coverage plus id-form tests; `engine/crates/engine-model/src`.

### Phase `W01.P02` - Extraction crate ingest-code

Walk, parse, resolve, and mint the code corpus (ADR D2/D3/D8).

- [x] `W01.P02.S02` - Scaffold the workspace crate with tree-sitter plus Rust/TypeScript/JavaScript/Python grammar dependencies and the CodeGraphData output type; `engine/crates/ingest-code`.
- [x] `W01.P02.S03` - Implement the bounded ignore-aware source walk with file-count and file-size caps and Cargo manifest collection; `engine/crates/ingest-code/src/walk.rs`.
- [x] `W01.P02.S04` - Author per-language import queries and the query-driven extractor with compiled-query caching and Python from-name walking; `engine/crates/ingest-code/src/extract.rs`.
- [x] `W01.P02.S05` - Implement per-language import-path resolution over the walked set: Rust use/mod with workspace crate map, TS/JS relative probing with ESM js-to-ts swap, Python absolute/relative/submodule probing; `engine/crates/ingest-code/src/resolve.rs`.
- [x] `W01.P02.S06` - Mint file nodes, module nodes for source-bearing directories, contains edges, and deduplicated multiplicity-counted imports edges; `engine/crates/ingest-code/src/modules.rs`.
- [x] `W01.P02.S07` - Add the source-tree fingerprint cache key and the extraction orchestration with rayon parallel parse and honest counters, plus the scan example; `engine/crates/ingest-code/src/lib.rs`.

## Wave `W02` - Store and refresh

The disconnected code graph store beside the vault graph (ADR D1/D6).

### Phase `W02.P03` - Code graph store

Own generation, fingerprint-keyed lazy refresh, honest stats.

- [x] `W02.P03.S08` - Add CodeGraphCell beside the vault graph on ScopeCell: own LinkageGraph instance, own generation with swap-happens-before-bump, debounced fingerprint probe, lazy re-extract, honest stats snapshot; `engine/crates/vaultspec-api/src/app.rs`.

## Wave `W03` - Query projections

Module rollup and file granularity over the code graph (ADR D3).

### Phase `W03.P04` - Corpus dispatch and projections

The corpus parameter, rollup meta-edges, scoped descent, per-corpus vocabulary (ADR D5).

- [x] `W03.P04.S09` - Implement the code-corpus query projections: module-rollup meta-edge aggregation, file-granularity slice with endpoint pruning, dir-prefix and language narrowing, and the per-corpus filter vocabulary; `engine/crates/engine-query/src/code.rs`.

## Wave `W04` - Wire

Routes, envelope, and conformance tests (ADR D5/D8).

### Phase `W04.P05` - Routes and conformance

Corpus param on /graph/query and /filters; shape-identity regression tests.

- [x] `W04.P05.S10` - Dispatch the corpus parameter on /graph/query with typed validation for corpus-mismatched facets, as_of rejection, and the code branch riding the shared envelope, ceiling, and tiers block; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W04.P05.S11` - Serve the code facet vocabulary on /filters behind the corpus parameter; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W04.P05.S12` - Add wire conformance tests: rollup and file granularity through the shared envelope, vault-default unchanged, corpora never mix, typed error envelopes carry tiers, per-corpus vocabulary; `engine/crates/vaultspec-api/tests/code_corpus.rs`.

## Wave `W05` - Gate and verification

Full gate plus live verification against this repository.

### Phase `W05.P06` - Gate

fmt, clippy, workspace tests, real-repo scan, live serve smoke.

- [x] `W05.P06.S13` - Run cargo fmt, clippy, and the workspace test suite to green across the touched crates; `engine`.
- [x] `W05.P06.S14` - Scan this repository with the release example and record extraction scale and accuracy counters; `engine/crates/ingest-code/examples/scan.rs`.
- [x] `W05.P06.S15` - Live-verify the served code corpus over a real socket serve: module rollup, scoped file descent, and per-corpus filters; `engine/crates/vaultspec-api`.

## Description

Backend-only build of the disconnected, switchable code graph corpus per the
accepted codebase-graphing ADR (decisions D1-D8): in-process tree-sitter
extraction (Rust/TypeScript/JavaScript/Python pilot) in a new `ingest-code`
crate; a separate `LinkageGraph` instance with its own generation and a
source-tree-fingerprint-keyed lazy refresh beside the untouched vault graph;
constellation-conformant module-rollup LOD with projected meta-edges plus
file-granularity scoped descent; and a corpus parameter on the existing
bounded-slice route family with per-corpus facet validation. The vault corpus
and its wire contract stay byte-identical; the two corpora never share a node
or an edge. The frontend corpus switch is a later feature.

## Steps

## Parallelization

Waves are sequenced: W01 (model + extraction) blocks everything; W02 (store)
consumes W01's crate; W03 (projections) reads W02's store; W04 (wire) dispatches
to W03; W05 gates the lot. Within W01, `P01` must land before `P02`'s minting
step; the walk, extractor, and resolver steps are sequential on shared types
while their test fixtures can trail in parallel. Within W04 the two route steps
are independent after the corpus dispatch lands.

## Verification

The full Rust gate (fmt zero diffs, clippy zero warnings in the touched crates,
workspace test suite green) per declaring-green-runs-the-full-gate; the wire
conformance suite proving GraphSlice shape identity, vault-default
byte-compatibility, corpus disconnection in both directions, and tiers-bearing
typed error envelopes; a real-repository extraction scan recording scale and
resolver accuracy; and a live socket serve smoke of both LODs and the
per-corpus filter vocabulary.
