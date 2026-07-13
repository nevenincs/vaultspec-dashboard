---
tags:
  - '#reference'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
related: []
---

# `on-demand-cold-start` reference: `cold-start payload census`

Live measurements (2026-07-12, dev serve, this repository's corpus of 1,667
vault documents) grounding the on-demand cold-start decision, plus the
implementation sites. Extends the universal-data-loading reference.

## Summary

- Cold desktop start fetched: `/graph/query` at DOCUMENT granularity =
  1,882,948 B; `/vault-tree` = 737,781 B (now first-page 200 rows after the
  page-size fix); `/pipeline` = 35 KB; everything else < 10 KB. Compact start:
  zero `/graph/query` (mount-gating confirmed live), vault-tree dominates.
- The SAME scope's constellation (feature-LOD) slice is 118,934 B - 16x
  smaller than the document slice. Cold start requests document granularity
  only because `dashboard_state.graph_granularity` persists a previous
  descent (`deriveDashboardStageSceneView`, `queries.ts` ~3234).
- The activity indicator works live (seen 2.3s-4.0s during desktop cold
  start). The progressive vault-tree path engages now that the first page is
  200 rows (`VAULT_TREE_FIRST_PAGE_SIZE`, `engine.ts`); the engine serves a
  small first page and resumes the cursor at full page size (verified:
  200 -> cursor -> 1,467).
- Stage consumes the slice via `useGraphSlice` (`Stage.tsx:168`) ->
  `useDisplaySlice` -> `stageSetDataCommand`; granularity swaps are an
  EXISTING proven path (the nav toolbar descent re-keys the same query), and
  the scene handles disjoint id namespaces via its warm-start/reset
  contract. Time-travel (`asOf`) and the corpus swap have special-cased
  set-data handling that a progressive fill must not disturb.
- Shared-state substrate already in place: one TanStack cache (query-key
  shared across consumers), backend dashboard-state for cross-surface
  intent, zustand slices for view-local chrome, interpreted stores views as
  the only read surface. A cold-start constellation query and the nav
  descent's constellation share ONE cache entry - instant paint on re-ascend.
