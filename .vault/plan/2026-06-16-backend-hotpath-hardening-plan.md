---
tags:
  - '#plan'
  - '#backend-hotpath-hardening'
date: '2026-06-16'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-06-16-backend-hotpath-hardening-research]]'
  - '[[2026-07-13-backend-hotpath-hardening-adr]]'
---

<!-- RETIRED: S05 -->

# `backend-hotpath-hardening` plan

### Phase `P01` - engine: memoize the vault-doc basename lookup per generation

Replace the per-request .vault tree walk in the content route with a basename index cached on the ScopeCell, built once per graph generation like the sibling caches.

- [x] `P01.S01` - Add a generation-keyed doc-basename index cache field + accessor on ScopeCell mirroring doc_views_cache; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `P01.S02` - Build the basename index once (the existing tree walk) and look up doc paths from it in resolve_node_path; `engine/crates/vaultspec-api/src/routes/content.rs`.
- [x] `P01.S03` - Add a unit test that the basename index resolves the same path the tree walk did, including the sorted-first tie-break; `engine/crates/vaultspec-api/src/routes/content.rs`.

### Phase `P02` - stores: bound the unbounded caches and the dedup scan

Add explicit gcTime to the two staleTime:Infinity queries and replace the O(N) per-chunk stream dedup with an O(1) Set.

- [x] `P02.S04` - Add explicit gcTime to useSettingsSchema and the engine stream options; `frontend/src/stores/server/queries.ts`.

### Phase `P03` - verify and review

Run the engine and frontend gates and pass code review.

- [x] `P03.S06` - Run the full engine gate (fmt + clippy + tests) to exit 0; `engine/`.
- [x] `P03.S07` - Run the full frontend gate (just dev lint frontend) to exit 0; `frontend/`.
- [x] `P03.S08` - Code-review the engine memoization and the stores bounding for correctness and rule adherence; `engine/crates/vaultspec-api/src/app.rs`.

## Description

## Steps

## Parallelization

## Verification
