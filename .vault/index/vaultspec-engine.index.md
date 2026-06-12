---
generated: true
tags:
  - '#index'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-W01-P01-S01]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S02]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S03]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S04]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S05]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-summary]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-S06]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-S07]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-S08]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-S09]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-S10]]'
  - '[[2026-06-12-vaultspec-engine-W01-P02-summary]]'
  - '[[2026-06-12-vaultspec-engine-W01-P03-S11]]'
  - '[[2026-06-12-vaultspec-engine-W01-P03-S12]]'
  - '[[2026-06-12-vaultspec-engine-W01-P03-S13]]'
  - '[[2026-06-12-vaultspec-engine-W01-P03-S14]]'
  - '[[2026-06-12-vaultspec-engine-W01-P03-summary]]'
  - '[[2026-06-12-vaultspec-engine-W01-P04-S15]]'
  - '[[2026-06-12-vaultspec-engine-W01-P04-S16]]'
  - '[[2026-06-12-vaultspec-engine-W01-P04-S17]]'
  - '[[2026-06-12-vaultspec-engine-W01-P04-S18]]'
  - '[[2026-06-12-vaultspec-engine-W01-P04-summary]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S19]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S20]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S21]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S22]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S23]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-S24]]'
  - '[[2026-06-12-vaultspec-engine-W02-P05-summary]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-S25]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-S26]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-S27]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-S28]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-S29]]'
  - '[[2026-06-12-vaultspec-engine-W02-P06-summary]]'
  - '[[2026-06-12-vaultspec-engine-W02-P07-S30]]'
  - '[[2026-06-12-vaultspec-engine-W02-P07-S31]]'
  - '[[2026-06-12-vaultspec-engine-W02-P07-S32]]'
  - '[[2026-06-12-vaultspec-engine-W02-P07-S33]]'
  - '[[2026-06-12-vaultspec-engine-W02-P07-summary]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-06-12-vaultspec-engine-audit]]'
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` feature index

Auto-generated index of all documents tagged with `#vaultspec-engine`.

## Documents

### adr

- `2026-06-12-vaultspec-engine-adr` - `vaultspec-engine` adr: `vaultspec engine architecture` | (**status:** `accepted`)

### audit

- `2026-06-12-vaultspec-engine-audit` - `vaultspec-engine` audit: `W01.P01 model and store review`

### exec

- `2026-06-12-vaultspec-engine-W01-P01-S01` - Define Node, NodeKind, Edge, RelationKind, Tier, Provenance and ScopeRef types per ADR section 3 as pure no-IO types
- `2026-06-12-vaultspec-engine-W01-P01-S02` - Implement stable NodeId derivation from kind plus canonical key (feature tag, vault stem, plan stem plus step id, commit sha, repo path plus symbol) with unit tests
- `2026-06-12-vaultspec-engine-W01-P01-S03` - Implement stable EdgeId content-hash derivation over src, dst, relation, tier and provenance key with determinism unit tests
- `2026-06-12-vaultspec-engine-W01-P01-S04` - Implement the SQLite schema for derived artifacts keyed by input content hash, the temporal event log, and the semantic TTL cache
- `2026-06-12-vaultspec-engine-W01-P01-S05` - Implement the store read and write API with single-writer discipline and concurrent-reader tests
- `2026-06-12-vaultspec-engine-W01-P01-summary` - `vaultspec-engine` `W01.P01` summary
- `2026-06-12-vaultspec-engine-W01-P02-S06` - Implement workspace discovery resolving any launch directory to the repository common git dir via gix, with fixture-repo tests
- `2026-06-12-vaultspec-engine-W01-P02-S07` - Implement worktree enumeration capturing checkout path, HEAD ref and dirty state
- `2026-06-12-vaultspec-engine-W01-P02-S08` - Implement local-branch enumeration with advisory default, feature and other classification and a lazy cached corpus-diff confirmation hook
- `2026-06-12-vaultspec-engine-W01-P02-S09` - Implement remote-ref mapping flagged with degraded tiers (declared and temporal only, no working tree)
- `2026-06-12-vaultspec-engine-W01-P02-S10` - Implement the commit-log walk producing temporal event records with timestamp, kind, ref and touched paths
- `2026-06-12-vaultspec-engine-W01-P02-summary` - `vaultspec-engine` `W01.P02` summary
- `2026-06-12-vaultspec-engine-W01-P03-S11` - Implement the core subprocess runner for vault graph JSON with pinned schema versions and loud failure on unknown schema
- `2026-06-12-vaultspec-engine-W01-P03-S12` - Implement the graph v2 payload parser producing declared edges preserving kind, multiplicity and weight, with core-derived edges as a distinct relation at 0.8 confidence
- `2026-06-12-vaultspec-engine-W01-P03-S13` - Implement inventory adapters for vault list, vault stats and vault feature list JSON envelopes
- `2026-06-12-vaultspec-engine-W01-P03-S14` - Record live core JSON payloads as fixtures and add parser and runner tests against them
- `2026-06-12-vaultspec-engine-W01-P03-summary` - `vaultspec-engine` `W01.P03` summary
- `2026-06-12-vaultspec-engine-W01-P04-S15` - Implement document body reading from the working tree and from git blobs for ref-only scopes
- `2026-06-12-vaultspec-engine-W01-P04-S16` - Implement extractors for file paths, canonical step identifiers, wiki-link stems and code symbols, each recording byte-span provenance
- `2026-06-12-vaultspec-engine-W01-P04-S17` - Implement the working-tree resolver assigning resolved, stale or broken state to every structural edge, retaining broken edges
- `2026-06-12-vaultspec-engine-W01-P04-S18` - Add fixture-document tests covering all four extractors and the three resolution states
- `2026-06-12-vaultspec-engine-W01-P04-summary` - `vaultspec-engine` `W01.P04` summary
- `2026-06-12-vaultspec-engine-W02-P05-S19` - Implement the in-memory adjacency graph storing nodes by stable key with per-corpus-view facets
- `2026-06-12-vaultspec-engine-W02-P05-S20` - Implement edge ingestion enforcing mandatory tier and provenance fields and the fixed per-tier confidence bands
- `2026-06-12-vaultspec-engine-W02-P05-S21` - Implement facet reconciliation across corpus views covering presence, document set, lifecycle state and content hashes, surfacing divergence
- `2026-06-12-vaultspec-engine-W02-P05-S22` - Implement query-time projections for per-tier degree counts and lifecycle progress summaries
- `2026-06-12-vaultspec-engine-W02-P05-S23` - Implement feature-level meta-edge aggregation with count and per-tier breakdown per contract section 4
- `2026-06-12-vaultspec-engine-W02-P05-S24` - Implement context assembly as a pure serializable read returning the tier-labelled bundle for any node
- `2026-06-12-vaultspec-engine-W02-P05-summary` - `vaultspec-engine` `W02.P05` summary
- `2026-06-12-vaultspec-engine-W02-P06-S25` - Implement the cold full-index orchestration with parallel per-view and per-source fan-out
- `2026-06-12-vaultspec-engine-W02-P06-S26` - Implement incremental re-index with content-hash skip against the store cache
- `2026-06-12-vaultspec-engine-W02-P06-S27` - Implement the debounced filesystem watcher over vault and git dirs driving partial re-ingestion of dirtied views
- `2026-06-12-vaultspec-engine-W02-P06-S28` - Implement temporal event log persistence correlating events to node ids
- `2026-06-12-vaultspec-engine-W02-P06-S29` - Add the re-derivability test proving a full index from a deleted cache converges to the identical graph
- `2026-06-12-vaultspec-engine-W02-P06-summary` - `vaultspec-engine` `W02.P06` summary
- `2026-06-12-vaultspec-engine-W02-P07-S30` - Implement the four named temporal correlation rules with per-rule confidence and independent provenance attribution
- `2026-06-12-vaultspec-engine-W02-P07-S31` - Implement blob-true as-of graph reconstruction reading document blobs as committed at T from the git object DB
- `2026-06-12-vaultspec-engine-W02-P07-S32` - Implement ordered diff-log generation between two times with monotonic sequence numbers and last-seq reporting
- `2026-06-12-vaultspec-engine-W02-P07-S33` - Implement event bucketing with auto, raw and fixed-interval modes returning per-bucket counts by kind
- `2026-06-12-vaultspec-engine-W02-P07-summary` - `vaultspec-engine` `W02.P07` summary

### plan

- `2026-06-12-vaultspec-engine-plan` - `vaultspec-engine` plan
