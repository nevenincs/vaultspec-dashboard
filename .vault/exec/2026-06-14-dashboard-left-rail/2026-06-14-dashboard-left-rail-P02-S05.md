---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Render the vault browser and the code-tree code mode behind the toggle

## Scope

- `frontend/src/app/left/`

## Description

- Add `BrowserRegion`: reads the per-scope mode from the browser-mode store and mounts `VaultBrowser` (vault) or `CodeTree` (code) behind it; vault is default.
- Pin the toggle and filter above a scrolling listing so they stay reachable as the tree grows.

## Outcome

The vault browser and the code-tree code mode render behind the toggle, vault default.

## Notes

`CodeTree` is the committed handoff from the code-tree feature, mounted in place of `VaultBrowser` when the mode is code.
