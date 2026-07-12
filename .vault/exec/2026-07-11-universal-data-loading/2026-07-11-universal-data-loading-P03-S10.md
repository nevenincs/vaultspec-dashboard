---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S10'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Make the vault-tree listing progressive: serve the first page immediately, continue the drain in the background with drain-progress reporting, expose complete:false on the surface view, and re-run client narrowing when the drain completes

## Scope

- `frontend/src/stores/server/engine.ts + frontend/src/stores/server/queries.ts (useVaultTreeSurface)`

## Description

Make the vault-tree listing progressive: `EngineClient.vaultTree` gains an `onPartial` seam handing out each accumulated prefix with `complete: false`; `useVaultTree` writes partials into the query cache via `setQueryData` so the rail paints the first page immediately; `VaultTreeResponse.complete` added; `useVaultTreeSurface` exposes `complete` (absent flag reads complete for cached pre-flag shapes).

## Outcome

First-page-interactive cold load; the resolved whole listing (`complete: true`) replaces the partial on settle; failed walks keep normal query-error semantics.

## Notes
