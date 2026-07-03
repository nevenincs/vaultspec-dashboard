---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# `rag-integration-hardening` `P03` summary

Raised the client search budget strictly above the engine budget, adopted the flat HTTP vocabulary in the tolerant adapter, and surfaced freshness through the one search selector.

- Modified: `frontend/src/stores/server/engine.ts`
- Modified: `frontend/src/stores/server/queries.ts`
- Modified: `frontend/src/stores/server/liveAdapters.ts`
- Modified: `frontend/src/stores/server/searchController.ts`
- Modified: `frontend/src/stores/server/searchController.test.ts`
- Modified: `frontend/src/stores/server/liveAdapters.test.ts`

## Description

Phase P03 hardens the frontend search integration by establishing the D2 client-budget-strictly-outlives-engine-budget invariant (12s client vs 10s engine), adopting rag's flat HTTP envelope shape in the tolerant adapter, and surfacing freshness fields (`semantic_epoch`, `index_state`) through the search selector. Four steps: S07 raises the client timeout to 12s and sends the app-chosen `max_results` (40) in the search body; S08 rewrites the adapter to read flat top-level results and forward index_state/epoch tolerantly; S09 surfaces the freshness fields on `SearchControllerView` and the merged palette epoch; S10 updates the test vectors to cover flat-shape adaptation, freshness forwarding, and budget ordering with guard tests pinning the invariants. Frontend suite passes 392 tests against the live fixture engine, full `just dev lint frontend` exit 0.
