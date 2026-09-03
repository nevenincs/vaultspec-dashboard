---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-09-03'
body_schema: 'body-v2'
body_hash: 'sha256:2f8dbe19c0ae110e5f85e469c7306090cb5df5fa64dd9ce3e41c425dccc2650a'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# `search-providers` ledger

## Changes

- `S01` `T` `engine/crates/engine-query/src/graph.rs + vaultspec-api/src/app.rs`
- `S02` `T` `engine/crates/vaultspec-api/src/routes/ + lib.rs`
- `S03` `T` `engine/crates/vaultspec-api/tests/`
- `S04` `T` `frontend/src/stores/server/engine.ts + liveAdapters.ts`
- `S05` `T` `frontend/src/stores/server/queries.ts`
- `S06` `T` `frontend/src/stores/server/literalMatch.ts`
- `S07` `T` `frontend/src/stores/server/searchProviders.ts`
- `S08` `T` `frontend/src/stores/server/searchProviders.ts`
- `S09` `T` `frontend/src/stores/server/searchProviders.ts + searchController.ts`
- `S10` `T` `frontend/src/stores/server/searchProviders.test.ts`
- `S11` `T` `frontend/src/app/palette/SearchPaletteSurface.tsx + SearchResultPill.tsx + stores/server/searchPill.ts`
- `S12` `T` `frontend/src/stores/view/commandPalette.ts`
- `S13` `T` `frontend/src/stores/server/documentSearchController.ts + app/palette/DocumentSearchSurface.tsx`
- `S14` `T` `frontend/src/stores/server/engine.ts + searchController.ts + stores/view/rightRailKeybindings.ts + rightRailCommandProvider.ts`
- `S15` `T` `frontend/src/stores/server/searchPill.test.ts`
- `S16` `T` `frontend/src/stores/server/*.test.ts + app/palette tests`
- `S17` `T` `live verification + just dev lint all`
