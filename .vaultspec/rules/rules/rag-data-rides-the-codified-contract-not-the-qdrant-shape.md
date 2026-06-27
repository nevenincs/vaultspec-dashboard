---
name: rag-data-rides-the-codified-contract-not-the-qdrant-shape
---

# rag size, state, and data ride the codified contract, never rag's internal Qdrant shape

## Rule

Read all rag size/state/data/diagnostics from rag's codified HTTP control plane
(Tier 1: `/service-state`, `/storage/survey`, `/jobs`, `/projects`, `/metrics`,
`/health`, `/readiness`) or — only for what rag does not expose (optimizer / segment /
indexed-vs-total health) — from Qdrant's OWN documented REST API (Tier 2),
capability-gated on the Qdrant version and using collection names sourced from
`/storage/survey`; never derive any value from rag's internal, unversioned collection
naming (the blake2b prefix) or payload shape, and degrade the affected panel honestly
(fail-closed) on a capability / version mismatch.

## Why

The `2026-06-26-rag-service-management-adr` (D5/D6) flagged that rag's Qdrant
collection / payload / storage shape is NOT a codified contract: recomputing rag's
blake2b collection name or reading its payload layout to derive size/state would
re-create exactly the silent-break class the ADR warns about, because rag may change
its internal naming between versions with no notice. The three-tier model gives the
console a stable surface — rag's versioned HTTP first, Qdrant's own pinned documented
REST only for the repair-signalling health rag does not expose — while keeping
genuinely-missing pieces (no HTTP prune/optimize route, no `contract_version` on
`/health`) as honest, filed coordination asks rather than reverse-engineered guesses.

## How

- **Good:** the storage rollup (per-tenant points + disk bytes) is computed in Rust
  from `/storage/survey` + `/service-state`; Tier-2 optimizer / segment reads are gated
  by `qdrant_collection_api_supported(version)` and use collection names from the
  survey, degrading the panel honestly when the pinned Qdrant version does not match.
- **Bad:** recomputing rag's blake2b collection name, or reading rag's payload layout,
  to derive a collection's size/state — an internal-shape dependency that breaks
  silently when rag re-versions its naming.

## Status

Active. Promoted at the close of the `rag-service-management` cycle (research → ADR
accepted → plan → execute → review PASS), in which the bounded, memoized Tier-1 HTTP
aggregation and the capability-gated Tier-2 Qdrant reads were built and reviewed.
Sibling of [[rag-is-a-machine-singleton-the-dashboard-attaches-never-owns]],
[[dashboard-does-not-override-rag-status-dir]], [[engine-read-and-infer]],
[[degradation-is-read-from-tiers-not-guessed-from-errors]],
[[every-wire-response-carries-the-tiers-block]], and
[[bounded-by-default-for-every-accumulator]].

## Source

ADR `2026-06-26-rag-service-management-adr` (decisions D5, D6) and research
`2026-06-26-rag-service-management-research` (the three-tier contract model; Tier 3 =
genuine gaps requiring rag coordination). Guards: the
`qdrant_collection_api_supported(version)` capability gate; the bounded, memoized Rust
storage rollup computed over `/storage/survey`.
