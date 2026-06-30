---
tags:
  - '#plan'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
tier: L2
related:
  - '[[2026-06-27-rag-schema-gate-adr]]'
---

# `rag-schema-gate` plan

Gate the engine's direct-Qdrant embedding read on rag's advertised storage-schema contract (version, dense vector name, dimension) and degrade honestly on a mismatch.

### Phase `P01` - the storage-schema gate in rag-client

Add the HealthInfo schema_version field, the pinned engine constants, the descriptor extractor, and the pure storage_schema_supported gate (ADR D1, D2, D4).

- [x] `P01.S01` - Add the schema_version Option u64 field to HealthInfo and parse it from the /health body; `engine/crates/rag-client/src/client.rs`.
- [x] `P01.S02` - Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S03` - Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S04` - Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason; `engine/crates/rag-client/src/vectors.rs`.
- [x] `P01.S05` - Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases; `engine/crates/rag-client/src/vectors.rs`.

### Phase `P02` - wire the two-stage gate into the embedding read

Apply the cheap /health version gate then the /readiness dim+name gate in query.rs before the scroll, degrading through the existing closure (ADR D3).

- [x] `P02.S06` - Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S07` - Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S08` - Add a route-level test asserting a newer schema_version and a dimension mismatch each degrade the embedding tier with the reason stated; `engine/crates/vaultspec-api/src/routes/query.rs`.

## Description

Adopt rag's shipped storage-schema contract in the engine's direct-Qdrant embedding
read, per the accepted ADR. Phase P01 builds the gate inside `rag-client` (the seam
that owns the Qdrant coupling): `HealthInfo` gains a `schema_version` field parsed from
`/health`, the engine pins `KNOWN_STORAGE_SCHEMA_VERSION` and `EXPECTED_DENSE_DIM` as
its declared compatibility, a tolerant extractor pulls the version/dense-name/dim from
the `/readiness` descriptor, and a pure `storage_schema_supported` gate applies rag's
recipe (newer-version → degrade, dense-name-must-exist, dim-mismatch → hard refuse), all
unit-tested. Phase P02 wires the two-stage gate into `query.rs`'s embedding handler,
after the existing Qdrant capability gate and before the scroll: the cheap `/health`
version check first, then the `/readiness` dim+name check, each degrading through the
existing `degraded_embeddings` closure with the mismatch stated. Grounded in the
`rag-schema-gate` research and ADR; closes the last unversioned coupling the
cross-project service-management audit found, completing the D6 capability gate.

## Steps

## Parallelization

P01 must land before P02: the wiring consumes the gate, the constants, and the
`HealthInfo.schema_version` field P01 creates. Within P01, S01 (the `HealthInfo` field)
and S02 (the constants) are independent; S03 (extractor) and S04 (gate) build on the
constants; S05 (tests) follows S03/S04. Within P02, S06 (version gate) and S07 (dim+name
gate) are one cohesive edit to the handler and should land together, with S08 (route
test) closing the phase. The test steps (S05, S08) gate their phase's completion.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `storage_schema_supported` returns compatible for an equal/older rag version with the
  expected dense name and dim, and an incompatible verdict with a stated reason for a
  newer version, a missing/wrong dense name, and a dimension mismatch (unit tests).
- The descriptor extractor reads `version` / dense `name` / dense `dim` from a real
  `/readiness` descriptor JSON and treats every absent field as a stated incompatibility,
  never a panic (unit tests).
- `HealthInfo` parses `schema_version` from a `/health` body and tolerates its absence
  (an older rag) as `None` (unit test).
- The embedding handler degrades the semantic tier (empty embeddings + degraded tiers
  block, never a 5xx) with the mismatch stated when rag advertises a newer
  `schema_version` or a divergent dense dimension, and serves vectors unchanged when the
  contract is compatible (route test).
- The cheap `/health` version gate short-circuits before the `/readiness` round-trip on a
  newer version (no descriptor read on the fail-fast path).
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, and
  `cargo test` are green on the engine workspace; `vaultspec-core vault check all` stays
  clean.
