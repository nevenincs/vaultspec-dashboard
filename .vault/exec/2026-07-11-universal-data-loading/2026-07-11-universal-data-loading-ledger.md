---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-09-03'
body_schema: 'body-v2'
body_hash: 'sha256:defb48df9cb1f88a275488aa6167a922b3b3d2e47fe7233a3bc091734c790de9'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# `universal-data-loading` ledger

## Changes

- `S01` `T` `frontend/src/stores/server/drainProgress.ts`
- `S02` `T` `frontend/src/stores/server/engine.ts`
- `S03` `T` `frontend/src/stores/server/dataActivity.ts`
- `S04` `T` `frontend/src/stores/server/dataActivity.test.ts`
- `S05` `T` `frontend/src/app/kit/ActivityIndicator.tsx`
- `S06` `T` `frontend/src/app/AppShell.tsx + frontend/src/app/shell/MobileTopBar.tsx`
- `S07` `T` `frontend/src/app/stage/CanvasStateOverlay.tsx + frontend/src/stores/server/queries.ts`
- `S08` `T` `frontend/src/app/stage/canvasStateOverlay.test.tsx + sibling chrome tests`
- `S09` `T` `frontend/src/stores/server/queries.ts (useBackendSignalStream) + frontend/src/stores/view/backendSignals.ts`
- `S10` `T` `frontend/src/stores/server/engine.ts + frontend/src/stores/server/queries.ts (useVaultTreeSurface)`
- `S11` `T` `frontend/src/app/left/TreeBrowser.tsx + guard test`
- `S12` `T` `.vaultspec/rules/ + vaultspec-core sync`
- `S13` `T` `frontend (full gate)`
