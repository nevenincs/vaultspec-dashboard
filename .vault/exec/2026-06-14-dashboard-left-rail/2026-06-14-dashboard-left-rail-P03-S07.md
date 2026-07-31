---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:b05975227904ed625575b8776fc930afee1709afae41daca7ca0221f33a02f60'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Add an in-rail filter scoped to the active browser mode that narrows the already-fetched listing client-side

## Scope

- `frontend/src/app/left/`

## Description

- Add `RailFilter`: an inline filter input scoped to the active mode, writing to the browser-mode store's `filter`.
- Narrow client-side: code mode threads `filter` into `CodeTree`'s `filter` prop; vault mode threads it into `VaultBrowser`'s new `filter` prop via `filterVaultEntries` (stem / path / feature-tag).

## Outcome

An in-rail filter scoped to the active mode narrows the already-fetched listing client-side; committed.

## Notes

`filterVaultEntries` is a pure, unit-tested narrowing over the entries the `/vault-tree` query already returned.
