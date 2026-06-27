---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S09'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Add a bounded memoized rag-ops aggregation projection over the Tier-1 rag HTTP surface

## Scope

- `engine/crates/rag-client/src/control.rs`

## Description

- Add the `storage_survey(transport, limit)` GET fetcher (the bounded disk-size + orphan source; server-mode only).
- Add the `RagOpsState` / `StorageRollup` / `StorageNamespaceSummary` serializable structs and the pure `derive_storage_rollup` + `derive_rag_ops_state` functions: storage size totals (points, footprint bytes) and live/orphaned counts are COMPUTED in Rust from the survey; index/qdrant/watcher/tenant blocks are forwarded verbatim.
- Add `fetch_rag_ops_state(transport, project_root)`: one orchestrated fetch of `/service-state` + bounded `/storage/survey` (tolerated to None on a 409 local-only failure) + `/projects`, then derive.
- Add 5 tests (survey path/limit, rollup sums+status counts, unavailable degradation, verbatim+computed aggregation).

## Outcome

Done. The engine can compute the rag size/state snapshot in Rust from rag's codified Tier-1 HTTP, with zero dependency on rag's internal Qdrant collection/payload shape (Tier 1 of the three-tier contract). `cargo test -p rag-client --lib control::` is green (9 passed). Bounded: the survey limit caps the namespace list; the transport carries the cap+timeout.

## Notes

"Memoized" is satisfied by the stores-layer TanStack cache (gcTime), consistent with every sibling brokered read - a redundant server-side cache would diverge from the established `/ops/rag/*` read pattern and add an accumulator to manage. The storage block degrades honestly (`available:false`) in local-only mode rather than failing the whole snapshot.
