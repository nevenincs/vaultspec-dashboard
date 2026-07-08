---
tags:
  - '#reference'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
  - '[[2026-07-02-rag-console-review-audit]]'
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-06-26-rag-service-management-reference]]'
---

# `rag-integration-hardening` reference: `tier-3 rag coordination asks`

Formal coordination requests filed to the vaultspec-rag sibling project as part
of the rag-integration-hardening cycle (ADR D5). These asks are non-blocking:
the dashboard ships self-contained in the interim with honest-degrade behaviour
on every affected path. They are issue-ready bodies for the vaultspec-rag repo;
filing to GitHub is pending owner go-ahead (an outward action). Grounded in
audit findings RCR-002 and RCR-003 from the 2026-07-02 rag-console-review audit.

## Ask 1 — Machine-wide aggregate storage totals on `/storage/survey` (RCR-002)

**Problem.** The dashboard engine aggregates storage rollup metrics (total
points, footprint bytes, live count, orphaned count) over the bounded slice of
namespaces returned by `/storage/survey`. The broker caps that slice at 64
namespaces (`RAG_OPS_SURVEY_LIMIT`), while the survey's own `total` field may
report a larger machine-wide count. On a machine with more than 64 namespaces
the `StorageRollup` (`rag-client/src/control.rs`, `derive_storage_rollup`) sums
only the returned entries, so the console's storage rows (points, disk footprint,
"N live · M orphaned") silently undercount. The P01.S02 fix (rag-console-review)
adds a `truncated` flag and renders the rollup as partial ("≥ X over first 64
namespaces") when `total_namespaces > namespaces.len()`, but the numbers remain
approximate.

**Ask.** Extend the `/storage/survey` response to include machine-wide aggregate
totals computed server-side before any pagination or truncation:
`total_points`, `total_footprint_bytes`, `total_live_count`, `total_orphaned_count`
(or an `aggregates` sub-block). The dashboard would read these pre-truncation
totals directly and retire the client-side summation over the bounded slice.

**Consuming engine site.** `rag-client/src/control.rs` `derive_storage_rollup`,
consumed by `engine/crates/vaultspec-api/src/routes/ops.rs` `ops_rag_get`.

**Interim honest-degrade.** The truncated flag marks the rollup as partial;
console rows are annotated "≥ X (first 64 namespaces shown)". The survey call
itself remains bounded; nothing degrades from the ask being absent.

## Ask 2 — Vault collection name (or namespace prefix) on `/readiness` (RCR-003 sunset trigger)

**Problem.** The direct Qdrant embedding scroll (`rag-client/src/vectors.rs`
`vault_collection_name`, consumed by `routes/query.rs` `graph_embeddings`)
recomputes rag's internal blake2b-6 collection name from the vault root path
(`r{blake2b-6-hex(normcase(root))}_vault_docs`). This is tolerated as a
sanctioned exception in the `rag-data-rides-the-codified-contract-not-the-qdrant-shape`
rule (exception clause: RCR-003 in 2026-07-02 rag-console-review-audit, decided
by graph-semantic-embeddings ADR D1), but it is an unversioned byte-match recompute
that violates the letter of the codified contract rule. The `rag-schema-gate` ADR
versions the dense vector name and dimension (via the `/readiness` descriptor), but
not the collection-naming scheme itself.

**Ask.** Advertise the vault collection name (or the per-root namespace prefix)
on the `/readiness` schema descriptor or on `/storage/survey` — for example as a
`vault_collection` field on the per-root entry in the survey, or as a
`vault_collection_name` field alongside `dense_vector_name` in the `/readiness`
schema descriptor. This gives the embedding scroll a codified, versioned source
for the collection name and retires the blake2b recompute.

**Consuming engine site.** `rag-client/src/vectors.rs` `vault_collection_name`,
consumed by `engine/crates/vaultspec-api/src/routes/query.rs` `graph_embeddings`.

**Interim honest-degrade.** The current recompute degrades honestly on a naming
drift (404 from Qdrant → no vectors → semantic tier degrades, never wrong data).
The schema-gate version-gates the dense vector name and dimension. When the
codified source lands in rag, the recompute site is deleted and this exception
clause is retired.

**Sunset clause.** The sanctioned blake2b exception in
`rag-data-rides-the-codified-contract-not-the-qdrant-shape` retires the moment
either the `/readiness` descriptor or the survey exposes the vault collection
name. Remove the exception clause and re-source the scroll at that point.
