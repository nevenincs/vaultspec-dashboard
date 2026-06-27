---
tags:
  - '#research'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace rag-schema-gate with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `rag-schema-gate` research: `adopt rag storage-schema contract in the direct-Qdrant read gate`

The engine reads embeddings DIRECTLY from rag's Qdrant store (`rag-client`'s
`vectors.rs` scrolls the `dense` named vector out of the `r{hash}_vault_docs`
collection over loopback HTTP). That read is coupled to rag's internal Qdrant
shape - the collection name, the dense vector name, and its dimension - which until
now was unversioned: a rag model swap, a vector rename, or a dimension change would
break the engine's scroll silently. The `rag-service-management` ADR already gated
this read on the QDRANT API version (`qdrant_collection_api_supported`, D6) and
explicitly named "a `contract_version`/`schema_version` on `/health`" as the
coordination ask that would let the gate also cover rag's own storage shape. rag has
now shipped that contract: `STORAGE_SCHEMA_VERSION` is advertised as a bare
`schema_version` integer on `/health` and as a full `schema` descriptor on
`/readiness` (effective dense dimension, vector names, payload fields, models). This
research grounds how the engine should adopt that contract: gate the direct-Qdrant
read on rag's storage-schema version, dense vector name, and dense dimension BEFORE
scrolling, and degrade the semantic tier honestly with a stated reason on any
mismatch - closing the last unversioned coupling the cross-project service-management
audit found.

## Findings

### F1 — The read path and the existing gate

The embeddings handler in `vaultspec-api`'s `routes/query.rs` runs a fixed sequence
before serving vectors: probe the machine-global running predicate
(`probe_machine_state` → discovery + heartbeat + `/health`), apply the D6 Qdrant
capability gate (`rag_client::vectors::qdrant_collection_api_supported` against the
Qdrant version from `/health`'s `qdrant` block), read the semantic-freshness epoch
from rag's `/jobs`, then scroll the dense vectors directly from Qdrant via
`rag_client::vectors::read_embeddings`. Every failure path degrades through one
`degraded_embeddings(reason)` closure that emits an empty embedding set plus a
`degraded_tiers` block - the engine's honest-absence contract (the stores layer reads
availability from the tiers block, never a 5xx). The storage-schema gate slots into
this same sequence, immediately after the Qdrant capability gate and before the
scroll, reusing the identical degrade closure.

### F2 — What the engine assumes about the shape today, implicitly

`vectors.rs` hard-codes three couplings to rag's storage shape: the collection name
is recomputed as `r{blake2b-6}_vault_docs` (must byte-match rag's
`root_collection_prefix`); the scroll requests `with_vector=["dense"]` and extracts
the `dense` named vector (a different name yields all-absence); and it deserializes
whatever float array length Qdrant returns into a `Vec<f32>` with NO dimension check.
None of these are validated against a rag-advertised contract - they are assumed.
rag's new descriptor makes all three checkable: `schema.vault.collection` (suffix),
`schema.vault.vectors.dense.name`, and `schema.vault.vectors.dense.dim`.

### F3 — rag's contract surface, as shipped

- `GET /health` (ungated, already probed by the engine for the Qdrant version) now
  carries a bare `schema_version` integer - the cheapest pre-read gate.
- `GET /readiness` carries the full descriptor under `schema`:
  `{version, vault:{collection, vectors:{dense:{name,dim,distance}, sparse:{name}}, payload_fields, indexes, id_scheme}, code:{...}, models:{dense, sparse}}`. The
  `dim` is the EFFECTIVE value (config-derived), which rag guarantees equals the live
  collection's dimension by construction. The engine already has a `control::readiness`
  verb that fetches `/readiness` over rag's service port.
- rag ships a reference (the consumer recipe) and a Python `assert_compatible`; the
  engine implements the same rules against the JSON.

### F4 — The compatibility rules to apply (rag's recipe, engine-side)

- **Version: newer → degrade.** If rag's `schema_version` exceeds the newest version
  the engine was built against (a pinned `KNOWN_STORAGE_SCHEMA_VERSION` constant,
  exactly like the pinned Qdrant major), the shape may have changed beyond what the
  engine can read - degrade, do not scroll blind. Older or equal is compatible
  (rag bumps only on a breaking change; additive payload fields do not bump).
- **Dense vector name must exist and match.** The engine scrolls by the literal
  `dense` name; if the descriptor's `vault.vectors.dense.name` is absent or not
  `dense`, the scroll would return all-absence - degrade with the mismatch stated.
- **Dimension mismatch → hard refuse.** The engine pins an `EXPECTED_DENSE_DIM` it
  was built and tested against (1024, the Qwen3-Embedding-0.6B default); if rag's
  effective `dim` differs, the served vectors are a different geometry than the scene
  was built for - refuse (degrade) rather than serve a mixed-dimension set. This is
  the engine's analog of rag's "wrong-size vectors are garbage" hard refuse.

### F5 — Where the version is read: /health vs /readiness

The bare `schema_version` on `/health` is the cheap precheck the engine already pays
for (it reads `/health` for the Qdrant version in the same probe). The full
descriptor (`dim`, dense `name`) lives on `/readiness`, a second round-trip on rag's
service port. Two viable shapes: (a) gate the version off `/health` first (cheap,
short-circuits a newer shape before the `/readiness` round-trip) and read the
descriptor from `/readiness` only when the version passes, for the dim+name checks;
or (b) read only `/readiness` and take version+dim+name from the one descriptor. Lean
(a): it reuses the `/health` the probe already fetched (so the version gate adds zero
round-trips), and only pays `/readiness` when the cheap gate passes - matching the
engine's existing "cheapest pre-read gate" discipline. The descriptor read failing
(rag flaking) degrades, exactly like the epoch read.

### F6 — Degradation is already first-class

The engine has the full degradation machinery: `degraded_embeddings(reason)` +
`degraded_tiers(&cell, reason)` emit the honest-absence envelope the stores layer
consumes. The schema gate needs no new error surface - it calls the same closure with
a truthful reason (`"rag storage schema vN is newer than the engine's known vM; …"` /
`"rag dense dimension D != engine expected E; …"` / `"rag descriptor has no dense vector named 'dense'; …"`). This mirrors the existing Qdrant-capability-gate reason
exactly.

### F7 — Engine conventions and placement

- The gate logic belongs in `rag-client` (the seam that owns the Qdrant coupling),
  as a pure, unit-tested function next to `qdrant_collection_api_supported` - e.g.
  `storage_schema_supported(descriptor, known_version, expected_dim) -> Result<(), reason>` plus a small extractor that pulls `version`/`dense name`/`dim` from the
  `/readiness` descriptor Value. The `HealthInfo` struct (`client.rs`) gains a
  `schema_version: Option<u64>` parsed from `/health`. The application wiring (the
  gate call + degrade) lives in `query.rs`, parallel to the Qdrant gate.
- `engine-read-and-infer`: the engine adds no rag semantics; it reads rag's advertised
  descriptor and applies rag's published rules. `bounded HTTP`: the `/readiness` read
  carries the existing per-verb wall-clock budget. Pure gate functions are unit-tested
  with the `FakeTransport` / JSON-fixture pattern already used across `rag-client`
  (no mocks of the engine's own logic). `cargo fmt` + `clippy -D warnings` gate.

### F8 — Scope boundaries

- **In scope:** the version/name/dim gate on the embeddings direct-scroll, the
  `HealthInfo.schema_version` field, the pinned `KNOWN_STORAGE_SCHEMA_VERSION` +
  `EXPECTED_DENSE_DIM` constants, the wiring in `query.rs`, and unit tests for the
  gate + extractor.
- **Out of scope:** the Tier-2 Qdrant-native health reads (already Qdrant-version
  gated, a separate contract); the storage-MANAGEMENT brokering (survey/prune - the
  sibling mandate); any change to rag (the contract is shipped); the frontend (it
  already renders the degraded tier).
- **Open question for the ADR:** whether to also surface rag's advertised `dim` to the
  frontend (so the scene can assert it independently) or keep the dim gate purely
  engine-side; and whether the descriptor read should be cached per (generation,
  semantic_epoch) like the vector scroll, or read fresh each request (it is cheap and
  the version rarely changes).
